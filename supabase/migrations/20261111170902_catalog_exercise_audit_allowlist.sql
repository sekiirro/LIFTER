-- F16 T057: constrain exercise audit codes to the approved FR-003 field names.
create or replace function app_private.catalog_write_audit(
  p_actor_user_id uuid,
  p_action text,
  p_target_table text,
  p_target_id uuid,
  p_workspace_id uuid,
  p_details jsonb
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare event_id bigint;
begin
  if p_action not in (
    'catalog.exercise_created', 'catalog.exercise_versioned', 'catalog.exercise_removed', 'catalog.exercise_restored', 'catalog.exercise_merged',
    'catalog.exercise_override_versioned',
    'catalog.workspace_exercise_created', 'catalog.workspace_exercise_versioned', 'catalog.workspace_exercise_removed', 'catalog.workspace_exercise_restored',
    'catalog.variation_created', 'catalog.variation_versioned', 'catalog.variation_removed', 'catalog.variation_restored',
    'catalog.food_created', 'catalog.food_versioned', 'catalog.food_removed', 'catalog.food_restored', 'catalog.food_merged',
    'catalog.taxonomy_versioned'
  ) or p_target_table not in (
    'exercises', 'exercise_overrides', 'workspace_exercises', 'exercise_variations', 'foods', 'taxonomy_terms'
  ) or (p_action like 'catalog.exercise_%' and p_action <> 'catalog.exercise_override_versioned' and p_target_table <> 'exercises')
    or (p_action = 'catalog.exercise_override_versioned' and p_target_table <> 'exercise_overrides')
    or (p_action like 'catalog.workspace_exercise_%' and p_target_table <> 'workspace_exercises')
    or (p_action like 'catalog.variation_%' and p_target_table <> 'exercise_variations')
    or (p_action like 'catalog.food_%' and p_target_table <> 'foods')
    or (p_action = 'catalog.taxonomy_versioned' and p_target_table <> 'taxonomy_terms')
    or p_actor_user_id is null or p_target_id is null or p_details is null or jsonb_typeof(p_details) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_details) as key(name)
      where key.name not in ('identity_id', 'version', 'related_id', 'changed_fields'))
    or (p_details ? 'identity_id' and (jsonb_typeof(p_details->'identity_id') <> 'string' or (p_details->>'identity_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
    or (p_details ? 'related_id' and (jsonb_typeof(p_details->'related_id') <> 'string' or (p_details->>'related_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
    or (p_details ? 'version' and (jsonb_typeof(p_details->'version') <> 'number' or (p_details->>'version') !~ '^[1-9][0-9]*$'))
    or (p_details ? 'changed_fields' and (
      jsonb_typeof(p_details->'changed_fields') <> 'array'
      or exists (select 1 from jsonb_array_elements(
        case when jsonb_typeof(p_details->'changed_fields') = 'array' then p_details->'changed_fields' else '[]'::jsonb end
      ) as field(value)
        where jsonb_typeof(field.value) <> 'string'
          or ((p_action in ('catalog.exercise_created', 'catalog.exercise_versioned', 'catalog.exercise_override_versioned', 'catalog.workspace_exercise_created', 'catalog.workspace_exercise_versioned'))
            and field.value #>> '{}' not in ('name', 'description', 'notes', 'video', 'alternatives', 'default_rest_time', 'default_rir', 'default_reps'))
          or ((p_action in ('catalog.exercise_removed', 'catalog.exercise_restored', 'catalog.exercise_merged', 'catalog.workspace_exercise_removed', 'catalog.workspace_exercise_restored', 'catalog.variation_removed', 'catalog.variation_restored', 'catalog.food_removed', 'catalog.food_restored', 'catalog.food_merged'))
            and field.value #>> '{}' <> 'lifecycle')
          or ((p_action in ('catalog.variation_created', 'catalog.variation_versioned'))
            and field.value #>> '{}' not in ('video', 'note'))
          or ((p_action in ('catalog.food_created', 'catalog.food_versioned'))
            and field.value #>> '{}' not in ('name_ar', 'name_en', 'basis', 'kcal', 'protein_g', 'carbohydrate_g', 'fat_g', 'fiber_g', 'servings', 'alternatives'))
          or (p_action = 'catalog.taxonomy_versioned' and field.value #>> '{}' <> 'lifecycle')
      )
    )) then
    raise exception 'catalog_audit_contract_violation' using errcode = '23514';
  end if;
  if (p_target_table in ('workspace_exercises', 'exercise_variations', 'exercise_overrides')) is distinct from (p_workspace_id is not null) then
    raise exception 'catalog_audit_scope_violation' using errcode = '23514';
  end if;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (p_actor_user_id, p_action, p_target_table, p_target_id, p_workspace_id, p_details)
  returning id into event_id;
  return event_id;
end;
$$;
alter function app_private.catalog_write_audit(uuid, text, text, uuid, uuid, jsonb) owner to postgres;
revoke all on function app_private.catalog_write_audit(uuid, text, text, uuid, uuid, jsonb) from public, anon, authenticated, service_role;

-- Keep the current canonical and private write contracts operational while
-- their audit codes move to the eight approved exercise fields.
create or replace function public.catalog_create_exercise(p_operation_key uuid, p_request jsonb)
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
      'changed_fields', jsonb_build_array('name','description','notes','video','alternatives','default_rest_time','default_rir','default_reps')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;

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
      'changed_fields', jsonb_build_array('name','description','notes','video','alternatives','default_rest_time','default_rir','default_reps')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;

create or replace function public.catalog_write_workspace_exercise(
  p_workspace_id uuid, p_exercise_id uuid, p_expected_version integer,
  p_operation_key uuid, p_request jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  current_version integer;
  lifecycle text;
  action_name text;
  request_hash text;
  replay jsonb;
  payload jsonb;
  identity_id uuid;
  next_version integer;
  result jsonb;
begin
  if actor is null or p_workspace_id is null
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  action_name := case when p_exercise_id is null
    then 'catalog.workspace_exercise_created'
    else 'catalog.workspace_exercise_versioned' end;
  if p_exercise_id is null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      actor::text || ':catalog.workspace_exercise.create:' || p_workspace_id::text || ':' || coalesce(p_operation_key::text, ''), 0));
  else
    select e.current_version, e.lifecycle_state into current_version, lifecycle
    from public.workspace_exercises e
    where e.workspace_id = p_workspace_id and e.id = p_exercise_id
    for update;
    if not found then raise exception 'catalog_exercise_not_found' using errcode = 'P0002'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      p_workspace_id::text || ':' || p_exercise_id::text, 0));
  end if;
  request_hash := 'sha256:' || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_array(p_workspace_id, p_exercise_id, p_expected_version, coalesce(p_request, 'null'::jsonb))::text, 'UTF8'), 'sha256'), 'hex');
  replay := app_private.claim_catalog_operation(actor, action_name, p_operation_key, request_hash);
  if not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if replay is not null then return replay; end if;
  payload := app_private.validate_exercise_payload(p_request);
  if p_exercise_id is null then
    identity_id := gen_random_uuid();
    next_version := 1;
    insert into public.workspace_exercises(workspace_id, id, created_by, current_version)
      values (p_workspace_id, identity_id, actor, next_version);
    insert into public.workspace_exercise_versions(workspace_id, workspace_exercise_id, version, payload, created_by)
      values (p_workspace_id, identity_id, next_version, payload, actor);
    action_name := 'catalog.workspace_exercise_created';
  else
    if lifecycle <> 'active' then raise exception 'catalog_exercise_not_active' using errcode = '23514'; end if;
    if p_expected_version is null or current_version <> p_expected_version then
      raise exception 'catalog_exercise_version_conflict' using errcode = '40001';
    end if;
    identity_id := p_exercise_id;
    next_version := current_version + 1;
    insert into public.workspace_exercise_versions(workspace_id, workspace_exercise_id, version, payload, created_by)
      values (p_workspace_id, identity_id, next_version, payload, actor);
    update public.workspace_exercises set current_version = next_version
      where workspace_id = p_workspace_id and id = identity_id;
    action_name := 'catalog.workspace_exercise_versioned';
  end if;
  result := jsonb_build_object('workspace_id', p_workspace_id, 'exercise_id', identity_id, 'version', next_version);
  perform app_private.catalog_write_audit(actor, action_name, 'workspace_exercises', identity_id, p_workspace_id,
    jsonb_build_object('identity_id', identity_id, 'version', next_version,
      'changed_fields', jsonb_build_array('name','description','notes','video','alternatives','default_rest_time','default_rir','default_reps')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;
