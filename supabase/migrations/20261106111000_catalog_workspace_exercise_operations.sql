-- F16 T019: workspace-only exercise create and version RPC.
create function public.catalog_write_workspace_exercise(
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
      'changed_fields', jsonb_build_array('name_ar','name_en','muscle_group','secondary_muscles','equipment','defaults')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;
alter function public.catalog_write_workspace_exercise(uuid, uuid, integer, uuid, jsonb) owner to postgres;
revoke all on function public.catalog_write_workspace_exercise(uuid, uuid, integer, uuid, jsonb) from public, anon, service_role;
grant execute on function public.catalog_write_workspace_exercise(uuid, uuid, integer, uuid, jsonb) to authenticated;
