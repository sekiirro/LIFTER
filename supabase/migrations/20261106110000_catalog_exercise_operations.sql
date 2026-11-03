-- F16 T018: global exercise creation/versioning and reusable atomic ledger claims.
create function app_private.claim_catalog_operation(
  p_actor uuid, p_action text, p_key uuid, p_hash text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  replay := app_private.operation_key_result(p_actor, p_action, p_key, p_hash);
  if replay is not null then return replay; end if;
  begin
    insert into app_private.operation_keys(actor_user_id, action, operation_key, request_hash)
    values (p_actor, p_action, p_key, p_hash);
  exception when unique_violation then
    replay := app_private.operation_key_result(p_actor, p_action, p_key, p_hash);
    if replay is not null then return replay; end if;
    raise exception 'operation_key_request_conflict' using errcode = '23505';
  end;
  return null;
end;
$$;
alter function app_private.claim_catalog_operation(uuid, text, uuid, text) owner to postgres;
revoke all on function app_private.claim_catalog_operation(uuid, text, uuid, text) from public, anon, authenticated, service_role;

create function app_private.set_catalog_operation_result(
  p_actor uuid, p_key uuid, p_result jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update app_private.operation_keys set result = p_result
  where actor_user_id = p_actor and operation_key = p_key and result is null;
  if not found then raise exception 'operation_key_result_missing' using errcode = '23514'; end if;
end;
$$;
alter function app_private.set_catalog_operation_result(uuid, uuid, jsonb) owner to postgres;
revoke all on function app_private.set_catalog_operation_result(uuid, uuid, jsonb) from public, anon, authenticated, service_role;

create function app_private.validate_exercise_payload(p_request jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare bad boolean;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_request) as keys(key)
      where key not in ('name_ar','name_en','primary_muscle_code','secondary_muscle_codes','equipment_codes','instructions_ar','instructions_en','defaults'))
    or nullif(btrim(p_request ->> 'name_ar'), '') is null
    or nullif(btrim(p_request ->> 'name_en'), '') is null
    or coalesce(jsonb_typeof(p_request -> 'equipment_codes') <> 'array', true)
    or jsonb_array_length(p_request -> 'equipment_codes') = 0
    or (p_request ? 'secondary_muscle_codes' and jsonb_typeof(p_request -> 'secondary_muscle_codes') <> 'array') then
    raise exception 'catalog_exercise_invalid' using errcode = '22023';
  end if;
  select not exists (
    select 1 from public.taxonomy_terms t
    join public.taxonomy_term_versions v on v.term_id = t.id
      and v.version = (select max(v2.version) from public.taxonomy_term_versions v2 where v2.term_id = t.id)
    where t.kind = 'muscle_group' and t.code = p_request ->> 'primary_muscle_code' and v.lifecycle = 'active'
  ) into bad;
  if bad then raise exception 'catalog_exercise_taxonomy_invalid' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_request -> 'equipment_codes') c(code)
    where not exists (
      select 1 from public.taxonomy_terms t
      join public.taxonomy_term_versions v on v.term_id = t.id
        and v.version = (select max(v2.version) from public.taxonomy_term_versions v2 where v2.term_id = t.id)
      where t.kind = 'equipment' and t.code = c.code and v.lifecycle = 'active'
    )
  ) or exists (
    select 1 from jsonb_array_elements_text(coalesce(p_request -> 'secondary_muscle_codes', '[]'::jsonb)) c(code)
    where not exists (
      select 1 from public.taxonomy_terms t
      join public.taxonomy_term_versions v on v.term_id = t.id
        and v.version = (select max(v2.version) from public.taxonomy_term_versions v2 where v2.term_id = t.id)
      where t.kind = 'muscle_group' and t.code = c.code and v.lifecycle = 'active'
    )
  ) then raise exception 'catalog_exercise_taxonomy_invalid' using errcode = '22023'; end if;
  return p_request;
end;
$$;
alter function app_private.validate_exercise_payload(jsonb) owner to postgres;
revoke all on function app_private.validate_exercise_payload(jsonb) from public, anon, authenticated, service_role;

create function public.catalog_create_exercise(p_operation_key uuid, p_request jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); replay jsonb; payload jsonb; exercise_id uuid; request_hash text; result jsonb;
begin
  if actor is null or not app_private.is_platform_owner() then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text || ':catalog.exercise.create:' || coalesce(p_operation_key::text, ''), 0));
  request_hash := 'sha256:' || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(p_request, 'null'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');
  replay := app_private.claim_catalog_operation(actor, 'catalog.exercise_created', p_operation_key, request_hash);
  if not app_private.is_platform_owner() then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  if replay is not null then return replay; end if;
  payload := app_private.validate_exercise_payload(p_request);
  exercise_id := gen_random_uuid();
  insert into public.exercises(id, created_by, current_version) values (exercise_id, actor, 1);
  insert into public.exercise_versions(exercise_id, version, payload, created_by) values (exercise_id, 1, payload, actor);
  result := jsonb_build_object('exercise_id', exercise_id, 'version', 1);
  perform app_private.catalog_write_audit(actor, 'catalog.exercise_created', 'exercises', exercise_id, null,
    jsonb_build_object('identity_id', exercise_id, 'version', 1,
      'changed_fields', jsonb_build_array('name_ar','name_en','muscle_group','secondary_muscles','equipment','defaults')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;
alter function public.catalog_create_exercise(uuid, jsonb) owner to postgres;
revoke all on function public.catalog_create_exercise(uuid, jsonb) from public, anon, service_role;
grant execute on function public.catalog_create_exercise(uuid, jsonb) to authenticated;

create function public.catalog_version_exercise(
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
alter function public.catalog_version_exercise(uuid, integer, uuid, jsonb) owner to postgres;
revoke all on function public.catalog_version_exercise(uuid, integer, uuid, jsonb) from public, anon, service_role;
grant execute on function public.catalog_version_exercise(uuid, integer, uuid, jsonb) to authenticated;
