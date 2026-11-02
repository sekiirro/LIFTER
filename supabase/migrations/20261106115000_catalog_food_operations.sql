-- F16 T026: shared operation-key lock, food validation and immediate create/version RPCs.
create function app_private.lock_catalog_food_request(p_actor uuid, p_operation_key uuid, p_request jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare lock_id bigint;
begin
  for lock_id in
    select distinct pg_catalog.hashtextextended(lock_text, 0)
    from (
      select 'catalog-food-op:' || p_actor::text || ':' || coalesce(p_operation_key::text, '') as lock_text
      union all
      select 'catalog-food-key:' || key_data.lang || ':' || app_private.normalize_ar_en_v1(key_data.food_name)
        || ':' || coalesce(p_request ->> 'basis','') || ':' || coalesce(p_request ->> 'product_identity_norm','')
        || ':' || coalesce(p_request ->> 'preparation_identity_norm','') || ':' || coalesce(p_request ->> 'weighing_state','')
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

create function app_private.validate_food_request(p_request jsonb)
returns jsonb
language plpgsql immutable set search_path = '' as $$
declare serving jsonb;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_request) as keys(key)
      where key not in ('name_ar','name_en','basis','product_identity_norm','preparation_identity_norm','weighing_state',
        'kcal','protein_g','carbohydrate_g','fat_g','fiber_g','servings','confirm_near_match'))
    or nullif(btrim(p_request ->> 'name_ar'), '') is null and nullif(btrim(p_request ->> 'name_en'), '') is null
    or coalesce(p_request ->> 'basis' not in ('g','ml'), true)
    or nullif(btrim(p_request ->> 'product_identity_norm'), '') is null
    or nullif(btrim(p_request ->> 'preparation_identity_norm'), '') is null
    or coalesce(p_request ->> 'weighing_state' not in ('raw','cooked','not_applicable'), true) then
    raise exception 'catalog_food_invalid' using errcode = '22023';
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
  return p_request - 'servings' - 'confirm_near_match';
end;
$$;
alter function app_private.validate_food_request(jsonb) owner to postgres;
revoke all on function app_private.validate_food_request(jsonb) from public, anon, authenticated, service_role;

create function app_private.catalog_food_writer_authorized(p_actor uuid, p_workspace_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_actor is not null and (
    app_private.is_platform_owner()
    or (p_workspace_id is not null and app_private.has_workspace_access(p_workspace_id, 'coaching_work'))
  )
$$;
alter function app_private.catalog_food_writer_authorized(uuid, uuid) owner to postgres;
revoke all on function app_private.catalog_food_writer_authorized(uuid, uuid) from public, anon, authenticated, service_role;

create function app_private.catalog_food_duplicate_exists(
  p_request jsonb, p_ignore_food_id uuid default null, p_match_type text default 'exact'
) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare food_name text; language_code text; found_duplicate boolean;
begin
  for language_code, food_name in
    select lang, value from (values ('ar', p_request ->> 'name_ar'), ('en', p_request ->> 'name_en')) as names(lang, value)
    where nullif(btrim(value), '') is not null
  loop
    select exists (
      select 1 from public.catalog_food_duplicate_candidates(
        food_name, language_code, p_request ->> 'basis', p_request ->> 'product_identity_norm',
        p_request ->> 'preparation_identity_norm', p_request ->> 'weighing_state', (p_request ->> 'kcal')::numeric
      ) c where c.match_type = p_match_type and (p_ignore_food_id is null or c.food_id <> p_ignore_food_id)
    ) into found_duplicate;
    if found_duplicate then return true; end if;
  end loop;
  return false;
end;
$$;
alter function app_private.catalog_food_duplicate_exists(jsonb, uuid, text) owner to postgres;
revoke all on function app_private.catalog_food_duplicate_exists(jsonb, uuid, text) from public, anon, authenticated, service_role;

create function public.catalog_create_food(p_operation_key uuid, p_origin_workspace_id uuid, p_request jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); request_hash text; replay jsonb; payload jsonb; food_id uuid; result jsonb; warning_list jsonb := '[]'::jsonb;
begin
  if actor is null or not app_private.catalog_food_writer_authorized(actor, p_origin_workspace_id) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  perform app_private.lock_catalog_food_request(actor, p_operation_key, p_request);
  request_hash := 'sha256:' || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_array(p_origin_workspace_id, coalesce(p_request, 'null'::jsonb))::text, 'UTF8'), 'sha256'), 'hex');
  replay := app_private.claim_catalog_operation(actor, 'catalog.food_created', p_operation_key, request_hash);
  if not app_private.catalog_food_writer_authorized(actor, p_origin_workspace_id) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if replay is not null then return replay; end if;
  payload := app_private.validate_food_request(p_request);
  if app_private.catalog_food_duplicate_exists(p_request, null, 'exact') then
    raise exception 'catalog_food_duplicate' using errcode = '23505';
  end if;
  if app_private.catalog_food_duplicate_exists(p_request, null, 'near') and not coalesce((p_request ->> 'confirm_near_match')::boolean, false) then
    raise exception 'catalog_food_near_match_confirmation_required' using errcode = '23514';
  end if;
  food_id := gen_random_uuid();
  insert into public.foods(id, created_by, origin_workspace_id, current_version) values (food_id, actor, p_origin_workspace_id, 1);
  insert into public.food_versions(
    food_id, version, payload, created_by, name_ar, name_en, basis, product_identity_norm,
    preparation_identity_norm, weighing_state, kcal, protein_g, carbohydrate_g, fat_g, fiber_g
  ) values (
    food_id, 1, payload, actor, p_request ->> 'name_ar', p_request ->> 'name_en', p_request ->> 'basis',
    p_request ->> 'product_identity_norm', p_request ->> 'preparation_identity_norm', p_request ->> 'weighing_state',
    (p_request ->> 'kcal')::numeric, (p_request ->> 'protein_g')::numeric, (p_request ->> 'carbohydrate_g')::numeric,
    (p_request ->> 'fat_g')::numeric, nullif(p_request ->> 'fiber_g', 'null')::numeric
  );
  insert into public.food_serving_units(food_id, food_version, basis, unit_key, label_ar, label_en, basis_qty)
    select food_id, 1, p_request ->> 'basis', item.value ->> 'unit_key', item.value ->> 'label_ar', item.value ->> 'label_en', (item.value ->> 'basis_qty')::numeric
    from jsonb_array_elements(p_request -> 'servings') as item(value);
  perform app_private.reserve_catalog_food_keys(food_id, 1);
  if abs((p_request ->> 'kcal')::numeric - 4 * (p_request ->> 'protein_g')::numeric
      - 4 * (p_request ->> 'carbohydrate_g')::numeric - 9 * (p_request ->> 'fat_g')::numeric)
      > greatest(20::numeric, (p_request ->> 'kcal')::numeric * 0.10) then
    warning_list := jsonb_build_array('kcal_macro_discrepancy');
  end if;
  result := jsonb_build_object('food_id', food_id, 'version', 1, 'warnings', warning_list);
  perform app_private.catalog_write_audit(actor, 'catalog.food_created', 'foods', food_id, null,
    jsonb_build_object('identity_id', food_id, 'version', 1,
      'changed_fields', jsonb_build_array('name_ar','name_en','basis','kcal','protein_g','carbohydrate_g','fat_g','fiber_g','servings')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;
alter function public.catalog_create_food(uuid, uuid, jsonb) owner to postgres;
revoke all on function public.catalog_create_food(uuid, uuid, jsonb) from public, anon, service_role;
grant execute on function public.catalog_create_food(uuid, uuid, jsonb) to authenticated;

create function public.catalog_version_food(
  p_food_id uuid, p_expected_version integer, p_operation_key uuid, p_request jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); owner_id uuid; current_version integer; lifecycle text;
  request_hash text; replay jsonb; payload jsonb; next_version integer; result jsonb; warning_list jsonb := '[]'::jsonb;
begin
  if actor is null or (not app_private.is_platform_owner() and (
      not app_private.role_has_capability(app_private.current_staff_role(), 'coaching_work')
      or not exists (select 1 from public.workspace_memberships m where m.user_id = actor and m.revoked_at is null))) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  select f.created_by, f.current_version, f.lifecycle_state into owner_id, current_version, lifecycle
    from public.foods f where f.id = p_food_id for update;
  if not found then raise exception 'catalog_food_not_found' using errcode = 'P0002'; end if;
  if not app_private.is_platform_owner() and owner_id <> actor then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  perform app_private.lock_catalog_food_request(actor, p_operation_key, p_request);
  request_hash := 'sha256:' || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_array(p_food_id, p_expected_version, coalesce(p_request, 'null'::jsonb))::text, 'UTF8'), 'sha256'), 'hex');
  replay := app_private.claim_catalog_operation(actor, 'catalog.food_versioned', p_operation_key, request_hash);
  if not app_private.is_platform_owner() and (owner_id <> actor
    or not app_private.role_has_capability(app_private.current_staff_role(), 'coaching_work')
    or not exists (select 1 from public.workspace_memberships m where m.user_id = actor and m.revoked_at is null)) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if replay is not null then return replay; end if;
  if lifecycle <> 'active' then raise exception 'catalog_food_not_active' using errcode = '23514'; end if;
  if p_expected_version is null or current_version <> p_expected_version then raise exception 'catalog_food_version_conflict' using errcode = '40001'; end if;
  payload := app_private.validate_food_request(p_request);
  if app_private.catalog_food_duplicate_exists(p_request, p_food_id, 'exact') then raise exception 'catalog_food_duplicate' using errcode = '23505'; end if;
  if app_private.catalog_food_duplicate_exists(p_request, p_food_id, 'near') and not coalesce((p_request ->> 'confirm_near_match')::boolean, false) then
    raise exception 'catalog_food_near_match_confirmation_required' using errcode = '23514';
  end if;
  next_version := current_version + 1;
  insert into public.food_versions(
    food_id, version, payload, created_by, name_ar, name_en, basis, product_identity_norm,
    preparation_identity_norm, weighing_state, kcal, protein_g, carbohydrate_g, fat_g, fiber_g
  ) values (
    p_food_id, next_version, payload, actor, p_request ->> 'name_ar', p_request ->> 'name_en', p_request ->> 'basis',
    p_request ->> 'product_identity_norm', p_request ->> 'preparation_identity_norm', p_request ->> 'weighing_state',
    (p_request ->> 'kcal')::numeric, (p_request ->> 'protein_g')::numeric, (p_request ->> 'carbohydrate_g')::numeric,
    (p_request ->> 'fat_g')::numeric, nullif(p_request ->> 'fiber_g', 'null')::numeric
  );
  insert into public.food_serving_units(food_id, food_version, basis, unit_key, label_ar, label_en, basis_qty)
    select p_food_id, next_version, p_request ->> 'basis', item.value ->> 'unit_key', item.value ->> 'label_ar', item.value ->> 'label_en', (item.value ->> 'basis_qty')::numeric
    from jsonb_array_elements(p_request -> 'servings') as item(value);
  update public.foods set current_version = next_version where id = p_food_id;
  perform app_private.reserve_catalog_food_keys(p_food_id, next_version);
  if abs((p_request ->> 'kcal')::numeric - 4 * (p_request ->> 'protein_g')::numeric
      - 4 * (p_request ->> 'carbohydrate_g')::numeric - 9 * (p_request ->> 'fat_g')::numeric)
      > greatest(20::numeric, (p_request ->> 'kcal')::numeric * 0.10) then
    warning_list := jsonb_build_array('kcal_macro_discrepancy');
  end if;
  result := jsonb_build_object('food_id', p_food_id, 'version', next_version, 'warnings', warning_list);
  perform app_private.catalog_write_audit(actor, 'catalog.food_versioned', 'foods', p_food_id, null,
    jsonb_build_object('identity_id', p_food_id, 'version', next_version,
      'changed_fields', jsonb_build_array('name_ar','name_en','basis','kcal','protein_g','carbohydrate_g','fat_g','fiber_g','servings')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;
alter function public.catalog_version_food(uuid, integer, uuid, jsonb) owner to postgres;
revoke all on function public.catalog_version_food(uuid, integer, uuid, jsonb) from public, anon, service_role;
grant execute on function public.catalog_version_food(uuid, integer, uuid, jsonb) to authenticated;
