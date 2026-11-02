-- S26 round 3 forward fixes: optimistic CAS, reserved defaults, version reads and video resolution.
create or replace function public.catalog_version_exercise(
  p_exercise_id uuid, p_expected_version integer, p_operation_key uuid, p_request jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); current_version integer; lifecycle text; replay jsonb; payload jsonb; request_hash text; result jsonb; next_version integer;
begin
  if actor is null or not app_private.is_platform_owner() then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  select e.current_version, e.lifecycle_state into current_version, lifecycle
  from public.exercises e where e.id = p_exercise_id for update;
  if not found then raise exception 'catalog_exercise_not_found' using errcode = 'P0002'; end if;
  request_hash := 'sha256:' || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_array(p_exercise_id, p_expected_version, coalesce(p_request, 'null'::jsonb))::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text || ':catalog.exercise.version:' || p_operation_key::text, 0));
  replay := app_private.claim_catalog_operation(actor, 'catalog.exercise_versioned', p_operation_key, request_hash);
  if not app_private.is_platform_owner() then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  if replay is not null then return replay; end if;
  if p_expected_version is null then raise exception 'catalog_exercise_version_conflict' using errcode = '40001'; end if;
  if lifecycle <> 'active' then raise exception 'catalog_exercise_not_active' using errcode = '23514'; end if;
  if current_version <> p_expected_version then raise exception 'catalog_exercise_version_conflict' using errcode = '40001'; end if;
  payload := app_private.validate_exercise_payload(p_request);
  next_version := current_version + 1;
  insert into public.exercise_versions(exercise_id, version, payload, created_by)
    values (p_exercise_id, next_version, payload, actor);
  update public.exercises set current_version = next_version where id = p_exercise_id;
  result := jsonb_build_object('exercise_id', p_exercise_id, 'version', next_version);
  perform app_private.catalog_write_audit(actor, 'catalog.exercise_versioned', 'exercises', p_exercise_id, null,
    jsonb_build_object('identity_id', p_exercise_id, 'version', next_version,
      'changed_fields', jsonb_build_array('name_ar','name_en','muscle_group','secondary_muscles','equipment','defaults')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;
create or replace function public.catalog_resolve_exercise_video(p_exercise_id uuid, p_workspace_id uuid)
returns table (exercise_id uuid, workspace_id uuid, video_url text)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or p_workspace_id is null
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  return query
    select e.id, v.workspace_id, vv.payload ->> 'video_url'
    from public.exercise_variations v
    join public.exercises e on e.id = v.exercise_id
    join public.exercise_variation_versions vv
      on vv.workspace_id = v.workspace_id
      and vv.exercise_id = v.exercise_id
      and vv.version = v.current_version
    where v.exercise_id = p_exercise_id
      and v.workspace_id = p_workspace_id
      and v.lifecycle_state = 'active'
      and app_private.catalog_video_url_allowed(vv.payload ->> 'video_url');
end;
$$;
create or replace function public.catalog_food_detail(p_food_id uuid, p_version integer default null)
returns table (
  food_id uuid,
  version integer,
  payload jsonb,
  created_at timestamptz,
  created_by uuid,
  origin_workspace_id uuid,
  name_ar text,
  name_en text,
  basis text,
  kcal numeric,
  protein_g numeric,
  carbohydrate_g numeric,
  fat_g numeric,
  fiber_g numeric
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_food_id is null or not app_private.catalog_can_read_global() then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  return query
    select v.food_id, v.version, v.payload, v.created_at, v.created_by, v.origin_workspace_id,
      v.name_ar, v.name_en, v.basis, v.kcal, v.protein_g, v.carbohydrate_g, v.fat_g, v.fiber_g
    from public.catalog_food_versions_safe v
    where v.food_id = p_food_id and v.version = coalesce(p_version, (select f.current_version from public.catalog_foods_safe f where f.id = p_food_id));
end;
$$;
create or replace function public.catalog_create_food(
  p_operation_key uuid, p_origin_workspace_id uuid, p_request jsonb, p_alternatives jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); canonical_request jsonb; result jsonb; alternatives jsonb := coalesce(p_alternatives, '[]'::jsonb);
begin
  if actor is null or not app_private.catalog_food_writer_authorized(actor, p_origin_workspace_id) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if jsonb_typeof(p_request) = 'object' and p_request ? 'default_alternatives' then raise exception 'catalog_food_invalid' using errcode = '22023'; end if;
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
create or replace function public.catalog_version_food(
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
  if jsonb_typeof(p_request) = 'object' and p_request ? 'default_alternatives' then raise exception 'catalog_food_invalid' using errcode = '22023'; end if;
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
create or replace function app_private.apply_food_default_alternatives(
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
  if requested_count > 3 then
    raise exception 'catalog_food_alternatives_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_alternatives) as alternatives(value)
    where case
      when jsonb_typeof(value -> 'alternative_version') = 'number' then
        case
          when (value ->> 'alternative_version')::numeric = trunc((value ->> 'alternative_version')::numeric)
            then (value ->> 'alternative_version')::numeric <= 0
              or (value ->> 'alternative_version')::numeric > 2147483647
          else true
        end
      else true
    end
  ) then
    raise exception 'catalog_food_alternatives_invalid' using errcode = '22023';
  end if;
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
        or current_rows.alternative_version <> ((item.value ->> 'alternative_version')::numeric)::integer
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
      or coalesce((item ->> 'alternative_version')::numeric > 2147483647, true)
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
    alternative_version := ((item ->> 'alternative_version')::numeric)::integer;
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
