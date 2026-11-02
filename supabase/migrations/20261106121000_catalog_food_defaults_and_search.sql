-- F16 follow-up: canonical food identity keys, version-scoped alternatives,
-- and filters that match the exercise write payload contract.

create function app_private.normalize_catalog_food_identity_v1(input_text text)
returns text
language sql immutable strict parallel safe set search_path = '' as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
    app_private.normalize_ar_en_v1(input_text),
    '([[:space:]]|' || pg_catalog.chr(160) || ')+', ' ', 'g'
  ))
$$;
alter function app_private.normalize_catalog_food_identity_v1(text) owner to postgres;
revoke all on function app_private.normalize_catalog_food_identity_v1(text) from public, anon, authenticated, service_role;

-- Fail the migration rather than silently coalescing previously distinct keys.
do $$
begin
  if exists (
    select 1 from public.food_versions
    group by food_id, version,
      app_private.normalize_catalog_food_identity_v1(product_identity_norm),
      app_private.normalize_catalog_food_identity_v1(preparation_identity_norm)
    having count(*) > 1
  ) then
    raise exception 'food identity normalization requires manual duplicate review';
  end if;
  if exists (
    select 1 from public.catalog_food_name_keys
    where active
    group by lang, app_private.normalize_catalog_food_identity_v1(name_norm), basis,
      app_private.normalize_catalog_food_identity_v1(product_identity_norm),
      app_private.normalize_catalog_food_identity_v1(preparation_identity_norm), weighing_state
    having count(*) > 1
  ) then
    raise exception 'food exact-key normalization requires manual duplicate review';
  end if;
end;
$$;

update public.food_versions v set
  product_identity_norm = app_private.normalize_catalog_food_identity_v1(v.product_identity_norm),
  preparation_identity_norm = app_private.normalize_catalog_food_identity_v1(v.preparation_identity_norm),
  payload = pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(v.payload, '{product_identity_norm}',
      pg_catalog.to_jsonb(app_private.normalize_catalog_food_identity_v1(v.product_identity_norm)), true),
    '{preparation_identity_norm}',
      pg_catalog.to_jsonb(app_private.normalize_catalog_food_identity_v1(v.preparation_identity_norm)), true
  );

update public.catalog_food_name_keys k set
  name_norm = app_private.normalize_catalog_food_identity_v1(k.name_norm),
  product_identity_norm = app_private.normalize_catalog_food_identity_v1(k.product_identity_norm),
  preparation_identity_norm = app_private.normalize_catalog_food_identity_v1(k.preparation_identity_norm);

alter table public.food_alternatives rename to food_default_alternatives;
alter index public.food_alternatives_target_idx rename to food_default_alternatives_target_idx;

create or replace function app_private.lock_catalog_food_request(p_actor uuid, p_operation_key uuid, p_request jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare lock_id bigint;
begin
  for lock_id in
    select distinct pg_catalog.hashtextextended(lock_text, 0)
    from (
      select 'catalog-food-op:' || p_actor::text || ':' || coalesce(p_operation_key::text, '') as lock_text
      union all
      select 'catalog-food-key:' || key_data.lang || ':' || app_private.normalize_catalog_food_identity_v1(key_data.food_name)
        || ':' || coalesce(p_request ->> 'basis','') || ':'
        || app_private.normalize_catalog_food_identity_v1(coalesce(p_request ->> 'product_identity_norm',''))
        || ':' || app_private.normalize_catalog_food_identity_v1(coalesce(p_request ->> 'preparation_identity_norm',''))
        || ':' || coalesce(p_request ->> 'weighing_state','')
      from (values ('ar', p_request ->> 'name_ar'), ('en', p_request ->> 'name_en')) as key_data(lang, food_name)
      where nullif(btrim(key_data.food_name), '') is not null
    ) locks
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(lock_id);
  end loop;
end;
$$;
alter function app_private.lock_catalog_food_request(uuid, uuid, jsonb) owner to postgres;
revoke all on function app_private.lock_catalog_food_request(uuid, uuid, jsonb) from public, anon, authenticated, service_role;

create or replace function app_private.reserve_catalog_food_keys(p_food_id uuid, p_version integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare food_version public.food_versions%rowtype; lock_value text;
begin
  select * into food_version from public.food_versions v
    where v.food_id = p_food_id and v.version = p_version;
  if not found then raise exception 'catalog_food_version_not_found' using errcode = 'P0002'; end if;
  for lock_value in
    select lang || ':' || name_norm || ':' || food_version.basis || ':' || food_version.product_identity_norm || ':' || food_version.preparation_identity_norm || ':' || food_version.weighing_state
    from (
      select 'ar'::text as lang, app_private.normalize_catalog_food_identity_v1(food_version.name_ar) as name_norm where nullif(btrim(food_version.name_ar), '') is not null
      union all
      select 'en', app_private.normalize_catalog_food_identity_v1(food_version.name_en) where nullif(btrim(food_version.name_en), '') is not null
    ) names
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lock_value, 0));
  end loop;
  update public.catalog_food_name_keys set active = false where food_id = p_food_id and active;
  begin
    insert into public.catalog_food_name_keys(
      lang, name_norm, basis, product_identity_norm, preparation_identity_norm,
      weighing_state, food_id, version, active
    )
    select lang, name_norm, food_version.basis, food_version.product_identity_norm,
      food_version.preparation_identity_norm, food_version.weighing_state, p_food_id, p_version, true
    from (
      select 'ar'::text as lang, app_private.normalize_catalog_food_identity_v1(food_version.name_ar) as name_norm where nullif(btrim(food_version.name_ar), '') is not null
      union all
      select 'en', app_private.normalize_catalog_food_identity_v1(food_version.name_en) where nullif(btrim(food_version.name_en), '') is not null
    ) names;
  exception when unique_violation then
    raise exception 'catalog_food_duplicate' using errcode = '23505';
  end;
end;
$$;
alter function app_private.reserve_catalog_food_keys(uuid, integer) owner to postgres;
revoke all on function app_private.reserve_catalog_food_keys(uuid, integer) from public, anon, authenticated, service_role;

create or replace function public.catalog_food_duplicate_candidates(
  p_name text, p_language text, p_basis text, p_product_identity text,
  p_preparation_identity text, p_weighing_state text, p_kcal numeric
) returns table (food_id uuid, version integer, match_type text, name_ar text, name_en text, kcal numeric)
language plpgsql stable security definer set search_path = '' as $$
declare normalized text; product_identity text; preparation_identity text;
begin
  if not app_private.catalog_can_read_global() then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  if p_language not in ('ar','en') or p_basis not in ('g','ml') or p_weighing_state not in ('raw','cooked','not_applicable')
    or nullif(btrim(p_name), '') is null or nullif(btrim(p_product_identity), '') is null
    or nullif(btrim(p_preparation_identity), '') is null or p_kcal is null or p_kcal < 0 then
    raise exception 'catalog_food_duplicate_input_invalid' using errcode = '22023';
  end if;
  normalized := app_private.normalize_catalog_food_identity_v1(p_name);
  product_identity := app_private.normalize_catalog_food_identity_v1(p_product_identity);
  preparation_identity := app_private.normalize_catalog_food_identity_v1(p_preparation_identity);
  return query
    select k.food_id, k.version, 'exact'::text, v.name_ar, v.name_en, v.kcal::numeric
    from public.catalog_food_name_keys k
    join public.foods f on f.id = k.food_id and f.lifecycle_state = 'active' and f.current_version = k.version
    join public.food_versions v on v.food_id = k.food_id and v.version = k.version
    where k.active and k.lang = p_language and k.name_norm = normalized and k.basis = p_basis
      and k.product_identity_norm = product_identity and k.preparation_identity_norm = preparation_identity
      and k.weighing_state = p_weighing_state
    order by k.food_id limit 50;
  return query
    select f.id, v.version, 'near'::text, v.name_ar, v.name_en, v.kcal::numeric
    from public.foods f join public.food_versions v on v.food_id = f.id and v.version = f.current_version
    where f.lifecycle_state = 'active' and v.basis = p_basis
      and v.product_identity_norm = product_identity and v.preparation_identity_norm = preparation_identity
      and v.weighing_state = p_weighing_state
      and abs(v.kcal - p_kcal) <= greatest(10::numeric, abs(p_kcal) * 0.10)
      and ((p_language = 'ar' and v.name_norm_ar_v1 <> normalized
          and v.name_norm_ar_v1 OPERATOR(extensions.%) normalized
          and extensions.similarity(v.name_norm_ar_v1, normalized) >= 0.90)
        or (p_language = 'en' and v.name_norm_en_v1 <> normalized
          and v.name_norm_en_v1 OPERATOR(extensions.%) normalized
          and extensions.similarity(v.name_norm_en_v1, normalized) >= 0.90))
      and not exists (select 1 from public.catalog_food_name_keys k where k.active and k.food_id = f.id
        and k.lang = p_language and k.name_norm = normalized and k.basis = p_basis
        and k.product_identity_norm = product_identity and k.preparation_identity_norm = preparation_identity
        and k.weighing_state = p_weighing_state)
    order by f.id limit 50;
end;
$$;
alter function public.catalog_food_duplicate_candidates(text, text, text, text, text, text, numeric) owner to postgres;
revoke all on function public.catalog_food_duplicate_candidates(text, text, text, text, text, text, numeric) from public, anon, service_role;
grant execute on function public.catalog_food_duplicate_candidates(text, text, text, text, text, text, numeric) to authenticated;

-- Keep the original transactional writer implementation private. The public
-- wrappers below canonicalize operation inputs, bind alternatives into the
-- ledger hash, and append version defaults before the RPC transaction returns.
alter function public.catalog_create_food(uuid, uuid, jsonb) set schema app_private;
alter function app_private.catalog_create_food(uuid, uuid, jsonb) rename to catalog_create_food_legacy;
alter function public.catalog_version_food(uuid, integer, uuid, jsonb) set schema app_private;
alter function app_private.catalog_version_food(uuid, integer, uuid, jsonb) rename to catalog_version_food_legacy;
revoke all on function app_private.catalog_create_food_legacy(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function app_private.catalog_version_food_legacy(uuid, integer, uuid, jsonb) from public, anon, authenticated, service_role;

create or replace function app_private.validate_food_request(p_request jsonb)
returns jsonb
language plpgsql immutable set search_path = '' as $$
declare serving jsonb;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_request) as keys(key)
      where key not in ('name_ar','name_en','basis','product_identity_norm','preparation_identity_norm','weighing_state',
        'kcal','protein_g','carbohydrate_g','fat_g','fiber_g','servings','confirm_near_match','default_alternatives'))
    or nullif(btrim(p_request ->> 'name_ar'), '') is null and nullif(btrim(p_request ->> 'name_en'), '') is null
    or coalesce(p_request ->> 'basis' not in ('g','ml'), true)
    or nullif(btrim(p_request ->> 'product_identity_norm'), '') is null
    or nullif(btrim(p_request ->> 'preparation_identity_norm'), '') is null
    or coalesce(p_request ->> 'weighing_state' not in ('raw','cooked','not_applicable'), true) then
    raise exception 'catalog_food_invalid' using errcode = '22023';
  end if;
  if p_request ? 'default_alternatives' and jsonb_typeof(p_request -> 'default_alternatives') <> 'array' then
    raise exception 'catalog_food_alternatives_invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_request -> 'kcal') <> 'number'
    or jsonb_typeof(p_request -> 'protein_g') <> 'number'
    or jsonb_typeof(p_request -> 'carbohydrate_g') <> 'number'
    or jsonb_typeof(p_request -> 'fat_g') <> 'number'
    or ((p_request ? 'fiber_g') and jsonb_typeof(p_request -> 'fiber_g') not in ('number','null'))
    or coalesce((p_request ->> 'kcal')::numeric < 0, true)
    or coalesce((p_request ->> 'protein_g')::numeric < 0, true)
    or coalesce((p_request ->> 'carbohydrate_g')::numeric < 0, true)
    or coalesce((p_request ->> 'fat_g')::numeric < 0, true)
    or (p_request ->> 'fiber_g' is not null and (p_request ->> 'fiber_g')::numeric < 0)
    or ((p_request ->> 'protein_g')::numeric + (p_request ->> 'carbohydrate_g')::numeric + (p_request ->> 'fat_g')::numeric > 100)
    or (p_request ? 'confirm_near_match' and jsonb_typeof(p_request -> 'confirm_near_match') <> 'boolean') then
    raise exception 'catalog_food_invalid' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_request -> 'servings') <> 'array', true) or jsonb_array_length(p_request -> 'servings') = 0 then
    raise exception 'catalog_food_serving_required' using errcode = '22023';
  end if;
  for serving in select value from jsonb_array_elements(p_request -> 'servings') loop
    if jsonb_typeof(serving) <> 'object'
      or exists (select 1 from jsonb_object_keys(serving) as keys(key) where key not in ('unit_key','label_ar','label_en','basis','basis_qty'))
      or nullif(btrim(serving ->> 'unit_key'), '') is null
      or (nullif(btrim(serving ->> 'label_ar'), '') is null and nullif(btrim(serving ->> 'label_en'), '') is null)
      or jsonb_typeof(serving -> 'basis_qty') <> 'number'
      or coalesce((serving ->> 'basis_qty')::numeric <= 0, true)
      or (serving ? 'basis' and serving ->> 'basis' <> p_request ->> 'basis') then
      raise exception 'catalog_food_serving_invalid' using errcode = '22023';
    end if;
  end loop;
  return p_request - 'servings' - 'confirm_near_match' - 'default_alternatives';
end;
$$;
alter function app_private.validate_food_request(jsonb) owner to postgres;
revoke all on function app_private.validate_food_request(jsonb) from public, anon, authenticated, service_role;

create function app_private.apply_food_default_alternatives(
  p_food_id uuid, p_version integer, p_alternatives jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  item jsonb; source_basis text; alternative_basis text; current_version integer;
  alternative_id uuid; alternative_version integer; source_portion numeric; alternative_portion numeric;
  position integer := 0; pair_key text; seen_pairs text[] := '{}'; existing_count integer; requested_count integer;
begin
  if p_alternatives is null or jsonb_typeof(p_alternatives) <> 'array' then
    raise exception 'catalog_food_alternatives_invalid' using errcode = '22023';
  end if;
  requested_count := jsonb_array_length(p_alternatives);
  select count(*)::integer into existing_count from public.food_default_alternatives
    where food_id = p_food_id and food_version = p_version;
  if existing_count > 0 then
    if existing_count <> requested_count or exists (
      select 1 from jsonb_array_elements(p_alternatives) with ordinality item(value, position)
      left join public.food_default_alternatives current_rows
        on current_rows.food_id = p_food_id and current_rows.food_version = p_version
        and current_rows.position = item.position
      where current_rows.food_id is null
        or current_rows.alternative_food_id <> (item.value ->> 'alternative_food_id')::uuid
        or current_rows.alternative_version <> (item.value ->> 'alternative_version')::integer
        or current_rows.source_portion <> (item.value ->> 'source_portion')::numeric
        or current_rows.alternative_portion <> (item.value ->> 'alternative_portion')::numeric
    ) then
      raise exception 'operation_key_request_conflict' using errcode = '23505';
    end if;
    return;
  end if;
  if requested_count = 0 then return; end if;
  select basis into source_basis from public.food_versions where food_id = p_food_id and version = p_version;
  if source_basis is null then raise exception 'catalog_food_alternatives_invalid' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(p_alternatives) loop
    position := position + 1;
    if jsonb_typeof(item) <> 'object'
      or exists (select 1 from jsonb_object_keys(item) k(key)
        where key not in ('alternative_food_id','alternative_version','source_portion','alternative_portion'))
      or coalesce(item ->> 'alternative_food_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', true)
      or jsonb_typeof(item -> 'alternative_version') <> 'number'
      or coalesce((item ->> 'alternative_version')::numeric <= 0, true)
      or coalesce((item ->> 'alternative_version')::numeric <> trunc((item ->> 'alternative_version')::numeric), true)
      or jsonb_typeof(item -> 'source_portion') <> 'number'
      or jsonb_typeof(item -> 'alternative_portion') <> 'number'
      or coalesce((item ->> 'source_portion')::numeric <= 0, true)
      or coalesce((item ->> 'alternative_portion')::numeric <= 0, true)
      or coalesce((item ->> 'source_portion')::numeric <> round((item ->> 'source_portion')::numeric, 3), true)
      or coalesce((item ->> 'alternative_portion')::numeric <> round((item ->> 'alternative_portion')::numeric, 3), true)
      or coalesce((item ->> 'source_portion')::numeric >= 1000000000, true)
      or coalesce((item ->> 'alternative_portion')::numeric >= 1000000000, true) then
      raise exception 'catalog_food_alternatives_invalid' using errcode = '22023';
    end if;
    alternative_id := (item ->> 'alternative_food_id')::uuid;
    alternative_version := (item ->> 'alternative_version')::integer;
    source_portion := (item ->> 'source_portion')::numeric;
    alternative_portion := (item ->> 'alternative_portion')::numeric;
    pair_key := alternative_id::text || ':' || alternative_version::text;
    if alternative_id = p_food_id or pair_key = any(seen_pairs) then
      raise exception 'catalog_food_alternatives_invalid' using errcode = '22023';
    end if;
    seen_pairs := array_append(seen_pairs, pair_key);
    select f.current_version, v.basis into current_version, alternative_basis
      from public.foods f join public.food_versions v
        on v.food_id = f.id and v.version = alternative_version
      where f.id = alternative_id and f.lifecycle_state = 'active'
      for share of f;
    if not found or current_version <> alternative_version or alternative_basis <> source_basis
      or not exists (select 1 from public.food_serving_units s where s.food_id = p_food_id
        and s.food_version = p_version and s.basis = source_basis and s.basis_qty = source_portion)
      or not exists (select 1 from public.food_serving_units s where s.food_id = alternative_id
        and s.food_version = alternative_version and s.basis = alternative_basis
        and s.basis_qty = alternative_portion) then
      raise exception 'catalog_food_alternatives_invalid' using errcode = '22023';
    end if;
    insert into public.food_default_alternatives(
      food_id, food_version, position, source_basis, source_portion,
      alternative_food_id, alternative_version, alternative_basis, alternative_portion
    ) values (
      p_food_id, p_version, position, source_basis, source_portion,
      alternative_id, alternative_version, alternative_basis, alternative_portion
    );
  end loop;
end;
$$;
alter function app_private.apply_food_default_alternatives(uuid, integer, jsonb) owner to postgres;
revoke all on function app_private.apply_food_default_alternatives(uuid, integer, jsonb) from public, anon, authenticated, service_role;

create function public.catalog_create_food(
  p_operation_key uuid, p_origin_workspace_id uuid, p_request jsonb, p_alternatives jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); canonical_request jsonb; result jsonb; alternatives jsonb := coalesce(p_alternatives, '[]'::jsonb);
begin
  if actor is null or not app_private.catalog_food_writer_authorized(actor, p_origin_workspace_id) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  canonical_request := p_request;
  if jsonb_typeof(canonical_request) = 'object' then
    if jsonb_typeof(canonical_request -> 'product_identity_norm') = 'string' then
      canonical_request := jsonb_set(canonical_request, '{product_identity_norm}',
        to_jsonb(app_private.normalize_catalog_food_identity_v1(canonical_request ->> 'product_identity_norm')));
    end if;
    if jsonb_typeof(canonical_request -> 'preparation_identity_norm') = 'string' then
      canonical_request := jsonb_set(canonical_request, '{preparation_identity_norm}',
        to_jsonb(app_private.normalize_catalog_food_identity_v1(canonical_request ->> 'preparation_identity_norm')));
    end if;
    if jsonb_array_length(case when jsonb_typeof(alternatives) = 'array' then alternatives else '[]'::jsonb end) > 0 then
      canonical_request := canonical_request || jsonb_build_object('default_alternatives', alternatives);
    end if;
  end if;
  result := app_private.catalog_create_food_legacy(p_operation_key, p_origin_workspace_id, canonical_request);
  perform app_private.apply_food_default_alternatives(
    (result ->> 'food_id')::uuid, (result ->> 'version')::integer, alternatives
  );
  return result;
end;
$$;
alter function public.catalog_create_food(uuid, uuid, jsonb, jsonb) owner to postgres;
revoke all on function public.catalog_create_food(uuid, uuid, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.catalog_create_food(uuid, uuid, jsonb, jsonb) to authenticated;

create function public.catalog_create_food(p_operation_key uuid, p_origin_workspace_id uuid, p_request jsonb)
returns jsonb language sql security definer set search_path = '' as $$
  select public.catalog_create_food(p_operation_key, p_origin_workspace_id, p_request, '[]'::jsonb)
$$;
alter function public.catalog_create_food(uuid, uuid, jsonb) owner to postgres;
revoke all on function public.catalog_create_food(uuid, uuid, jsonb) from public, anon, service_role;
grant execute on function public.catalog_create_food(uuid, uuid, jsonb) to authenticated;

create function public.catalog_version_food(
  p_food_id uuid, p_expected_version integer, p_operation_key uuid, p_request jsonb, p_alternatives jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); canonical_request jsonb; result jsonb;
  alternatives jsonb := coalesce(p_alternatives, '[]'::jsonb);
begin
  if actor is null or (not app_private.is_platform_owner() and (
      not app_private.role_has_capability(app_private.current_staff_role(), 'coaching_work')
      or not exists (select 1 from public.workspace_memberships m where m.user_id = actor and m.revoked_at is null))) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if not app_private.is_platform_owner() and not public.catalog_can_version_food(p_food_id) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  canonical_request := p_request;
  if jsonb_typeof(canonical_request) = 'object' then
    if jsonb_typeof(canonical_request -> 'product_identity_norm') = 'string' then
      canonical_request := jsonb_set(canonical_request, '{product_identity_norm}',
        to_jsonb(app_private.normalize_catalog_food_identity_v1(canonical_request ->> 'product_identity_norm')));
    end if;
    if jsonb_typeof(canonical_request -> 'preparation_identity_norm') = 'string' then
      canonical_request := jsonb_set(canonical_request, '{preparation_identity_norm}',
        to_jsonb(app_private.normalize_catalog_food_identity_v1(canonical_request ->> 'preparation_identity_norm')));
    end if;
    if jsonb_array_length(case when jsonb_typeof(alternatives) = 'array' then alternatives else '[]'::jsonb end) > 0 then
      canonical_request := canonical_request || jsonb_build_object('default_alternatives', alternatives);
    end if;
  end if;
  result := app_private.catalog_version_food_legacy(
    p_food_id, p_expected_version, p_operation_key, canonical_request
  );
  perform app_private.apply_food_default_alternatives(
    (result ->> 'food_id')::uuid, (result ->> 'version')::integer, alternatives
  );
  return result;
end;
$$;
alter function public.catalog_version_food(uuid, integer, uuid, jsonb, jsonb) owner to postgres;
revoke all on function public.catalog_version_food(uuid, integer, uuid, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.catalog_version_food(uuid, integer, uuid, jsonb, jsonb) to authenticated;

create function public.catalog_version_food(
  p_food_id uuid, p_expected_version integer, p_operation_key uuid, p_request jsonb
) returns jsonb language sql security definer set search_path = '' as $$
  select public.catalog_version_food(p_food_id, p_expected_version, p_operation_key, p_request, '[]'::jsonb)
$$;
alter function public.catalog_version_food(uuid, integer, uuid, jsonb) owner to postgres;
revoke all on function public.catalog_version_food(uuid, integer, uuid, jsonb) from public, anon, service_role;
grant execute on function public.catalog_version_food(uuid, integer, uuid, jsonb) to authenticated;

create or replace function public.catalog_search(
  kind text, query text default null, filters jsonb default '{}'::jsonb,
  "cursor" text default null, workspace_id uuid default null
)
returns table (
  result_id uuid, result_workspace_id uuid, result_version integer,
  result_payload jsonb, result_created_by uuid, result_origin_workspace_id uuid
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  page_limit integer := 50; cursor_id uuid; normalized_query text;
  muscle_filter text; equipment_filter jsonb; basis_filter text;
begin
  if kind in ('exercise', 'food') then
    if not app_private.catalog_can_read_global() then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  elsif kind in ('workspace_exercise', 'variation') then
    if workspace_id is null or not app_private.has_workspace_access(workspace_id, 'coaching_work') then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
  else raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if filters is null or jsonb_typeof(filters) <> 'object' then raise exception using errcode = '22023', message = 'invalid_filters'; end if;
  if filters ? 'page_size' then
    if filters->>'page_size' !~ '^[0-9]+$' then raise exception using errcode = '22023', message = 'invalid_page_size'; end if;
    page_limit := least(greatest((filters->>'page_size')::integer, 1), 50);
  end if;
  if "cursor" is not null then
    if "cursor" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'invalid_cursor';
    end if;
    cursor_id := "cursor"::uuid;
  end if;
  normalized_query := nullif(app_private.normalize_ar_en_v1(coalesce(query, '')), '');
  muscle_filter := filters->>'primary_muscle_code';
  equipment_filter := filters->'equipment_codes';
  if equipment_filter is not null and jsonb_typeof(equipment_filter) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_equipment_codes';
  end if;
  basis_filter := filters->>'basis';
  if kind = 'exercise' then
    return query
      select e.id, null::uuid, v.version, v.payload, null::uuid, null::uuid
      from public.exercises e join public.exercise_versions v on v.exercise_id = e.id and v.version = e.current_version
      where e.lifecycle_state = 'active'
        and (normalized_query is null or v.name_norm_ar_v1 like '%' || normalized_query || '%'
          or v.name_norm_en_v1 like '%' || normalized_query || '%'
          or (v.name_norm_ar_v1 = '' and v.name_norm_en_v1 = '' and v.payload::text ilike '%' || query || '%'))
        and (muscle_filter is null or v.payload->>'primary_muscle_code' = muscle_filter)
        and (equipment_filter is null or coalesce(v.payload->'equipment_codes' ?| array(select jsonb_array_elements_text(equipment_filter)), false))
        and (cursor_id is null or e.id > cursor_id)
      order by e.id limit page_limit;
    return;
  elsif kind = 'food' then
    if normalized_query is null and basis_filter is null then
      return query with page as materialized (
        select f.id, f.current_version, f.created_by, f.origin_workspace_id from public.catalog_foods_safe f
        where f.lifecycle_state = 'active' and (cursor_id is null or f.id > cursor_id) order by f.id limit page_limit
      ) select page.id, null::uuid, v.version, v.payload, page.created_by, page.origin_workspace_id
        from page join public.food_versions v on v.food_id = page.id and v.version = page.current_version order by page.id;
      return;
    end if;
    return query select f.id, null::uuid, v.version, v.payload, f.created_by, f.origin_workspace_id
      from public.catalog_foods_safe f join public.food_versions v on v.food_id = f.id and v.version = f.current_version
      where f.lifecycle_state = 'active'
        and (normalized_query is null or v.name_norm_ar_v1 like '%' || normalized_query || '%' or v.name_norm_en_v1 like '%' || normalized_query || '%')
        and (basis_filter is null or v.basis = basis_filter) and (cursor_id is null or f.id > cursor_id)
      order by f.id limit page_limit;
    return;
  elsif kind = 'workspace_exercise' then
    return query select e.id, e.workspace_id, v.version, v.payload, null::uuid, null::uuid
      from public.workspace_exercises e join public.workspace_exercise_versions v
        on v.workspace_id = e.workspace_id and v.workspace_exercise_id = e.id and v.version = e.current_version
      where e.workspace_id = $5 and e.lifecycle_state = 'active'
        and (normalized_query is null or v.name_norm_ar_v1 like '%' || normalized_query || '%'
          or v.name_norm_en_v1 like '%' || normalized_query || '%'
          or (v.name_norm_ar_v1 = '' and v.name_norm_en_v1 = '' and v.payload::text ilike '%' || query || '%'))
        and (muscle_filter is null or v.payload->>'primary_muscle_code' = muscle_filter)
        and (equipment_filter is null or coalesce(v.payload->'equipment_codes' ?| array(select jsonb_array_elements_text(equipment_filter)), false))
        and (cursor_id is null or e.id > cursor_id)
      order by e.id limit page_limit;
    return;
  elsif kind = 'variation' then
    return query select e.exercise_id, e.workspace_id, v.version, v.payload, null::uuid, null::uuid
      from public.exercise_variations e join public.exercise_variation_versions v
        on v.workspace_id = e.workspace_id and v.exercise_id = e.exercise_id and v.version = e.current_version
      where e.workspace_id = $5 and e.lifecycle_state = 'active'
        and (normalized_query is null or v.payload::text ilike '%' || query || '%')
        and (cursor_id is null or e.exercise_id > cursor_id) order by e.exercise_id limit page_limit;
    return;
  end if;
  raise exception using errcode = '42501', message = 'not_permitted';
end;
$$;
alter function public.catalog_search(text, text, jsonb, text, uuid) owner to postgres;
revoke all on function public.catalog_search(text, text, jsonb, text, uuid) from public, anon, service_role;
grant execute on function public.catalog_search(text, text, jsonb, text, uuid) to authenticated;
