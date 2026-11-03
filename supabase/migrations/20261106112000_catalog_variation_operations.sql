-- F16 T020: version workspace mappings without changing the canonical exercise.
create function public.catalog_write_variation(
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
  identity_state text;
  payload jsonb;
  next_version integer;
  result jsonb;
begin
  if actor is null or p_workspace_id is null
    or not (app_private.is_platform_owner() or app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  select e.lifecycle_state into identity_state from public.exercises e where e.id = p_exercise_id for share;
  if not found then raise exception 'catalog_exercise_not_found' using errcode = 'P0002'; end if;
  if p_exercise_id is null or identity_state <> 'active' then
    raise exception 'catalog_exercise_not_active' using errcode = '23514';
  end if;
  action_name := case when p_expected_version is null
    then 'catalog.variation_created'
    else 'catalog.variation_versioned' end;
  if p_expected_version is null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_exercise_id::text, 0));
  else
    select v.current_version, v.lifecycle_state into current_version, lifecycle
    from public.exercise_variations v
    where v.workspace_id = p_workspace_id and v.exercise_id = p_exercise_id
    for update;
    if not found then raise exception 'catalog_variation_not_found' using errcode = 'P0002'; end if;
  end if;
  request_hash := 'sha256:' || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_array(p_workspace_id, p_exercise_id, p_expected_version, coalesce(p_request, 'null'::jsonb))::text, 'UTF8'), 'sha256'), 'hex');
  replay := app_private.claim_catalog_operation(actor, action_name, p_operation_key, request_hash);
  if not (app_private.is_platform_owner() or app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if replay is not null then return replay; end if;
  if identity_state <> 'active' then raise exception 'catalog_exercise_not_active' using errcode = '23514'; end if;
  if p_request is null or jsonb_typeof(p_request) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_request) as keys(key) where key not in ('video_url','note'))
    or (p_request ->> 'video_url' is null and nullif(btrim(p_request ->> 'note'), '') is null)
    or (p_request ? 'video_url' and not app_private.catalog_video_url_allowed(p_request ->> 'video_url'))
    or (p_request ? 'note' and (jsonb_typeof(p_request -> 'note') <> 'string' or length(p_request ->> 'note') > 2000)) then
    raise exception 'catalog_variation_invalid' using errcode = '22023';
  end if;
  if p_expected_version is null then
    if exists (select 1 from public.exercise_variations v where v.workspace_id = p_workspace_id and v.exercise_id = p_exercise_id) then
      raise exception 'catalog_variation_exists' using errcode = '23505';
    end if;
    insert into public.exercise_variations(workspace_id, exercise_id, created_by, current_version)
      values (p_workspace_id, p_exercise_id, actor, 1);
    insert into public.exercise_variation_versions(workspace_id, exercise_id, version, payload, created_by)
      values (p_workspace_id, p_exercise_id, 1, p_request, actor);
    next_version := 1;
  else
    if lifecycle <> 'active' then raise exception 'catalog_variation_not_active' using errcode = '23514'; end if;
    if current_version <> p_expected_version then raise exception 'catalog_variation_version_conflict' using errcode = '40001'; end if;
    next_version := current_version + 1;
    insert into public.exercise_variation_versions(workspace_id, exercise_id, version, payload, created_by)
      values (p_workspace_id, p_exercise_id, next_version, p_request, actor);
    update public.exercise_variations set current_version = next_version
      where workspace_id = p_workspace_id and exercise_id = p_exercise_id;
  end if;
  result := jsonb_build_object('workspace_id', p_workspace_id, 'exercise_id', p_exercise_id, 'version', next_version);
  perform app_private.catalog_write_audit(actor, action_name, 'exercise_variations', p_exercise_id, p_workspace_id,
    jsonb_build_object('identity_id', p_exercise_id, 'version', next_version, 'changed_fields', jsonb_build_array('video','note')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;
alter function public.catalog_write_variation(uuid, uuid, integer, uuid, jsonb) owner to postgres;
revoke all on function public.catalog_write_variation(uuid, uuid, integer, uuid, jsonb) from public, anon, service_role;
grant execute on function public.catalog_write_variation(uuid, uuid, integer, uuid, jsonb) to authenticated;

create function public.catalog_transition_variation(
  p_workspace_id uuid, p_exercise_id uuid, p_expected_version integer,
  p_transition text, p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  current_version integer;
  lifecycle text;
  identity_state text;
  action_name text;
  request_hash text;
  replay jsonb;
  payload jsonb;
  next_version integer;
  result jsonb;
begin
  if actor is null or p_workspace_id is null
    or not (app_private.is_platform_owner() or app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  select e.lifecycle_state into identity_state from public.exercises e where e.id = p_exercise_id for share;
  if not found or identity_state <> 'active' then raise exception 'catalog_exercise_not_active' using errcode = '23514'; end if;
  select v.current_version, v.lifecycle_state
    into current_version, lifecycle
  from public.exercise_variations v
  where v.workspace_id = p_workspace_id and v.exercise_id = p_exercise_id
  for update;
  if not found then raise exception 'catalog_variation_not_found' using errcode = 'P0002'; end if;
  action_name := case p_transition when 'remove' then 'catalog.variation_removed'
    when 'restore' then 'catalog.variation_restored' else null end;
  request_hash := 'sha256:' || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_array(p_workspace_id, p_exercise_id, p_expected_version, p_transition)::text, 'UTF8'), 'sha256'), 'hex');
  replay := app_private.claim_catalog_operation(actor, action_name, p_operation_key, request_hash);
  if not (app_private.is_platform_owner() or app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if replay is not null then return replay; end if;
  if p_expected_version is null or current_version <> p_expected_version then
    raise exception 'catalog_variation_version_conflict' using errcode = '40001';
  end if;
  if (p_transition = 'remove' and lifecycle <> 'active') or (p_transition = 'restore' and lifecycle <> 'removed') then
    raise exception 'catalog_variation_lifecycle_conflict' using errcode = '23514';
  end if;
  select vv.payload into payload from public.exercise_variation_versions vv
  where vv.workspace_id = p_workspace_id and vv.exercise_id = p_exercise_id and vv.version = current_version;
  next_version := current_version + 1;
  payload := payload || jsonb_build_object('lifecycle', case p_transition when 'remove' then 'removed' else 'active' end);
  insert into public.exercise_variation_versions(workspace_id, exercise_id, version, payload, created_by)
    values (p_workspace_id, p_exercise_id, next_version, payload, actor);
  update public.exercise_variations set lifecycle_state = case p_transition when 'remove' then 'removed' else 'active' end,
    current_version = next_version where workspace_id = p_workspace_id and exercise_id = p_exercise_id;
  result := jsonb_build_object('workspace_id', p_workspace_id, 'exercise_id', p_exercise_id,
    'version', next_version, 'lifecycle_state', case p_transition when 'remove' then 'removed' else 'active' end);
  perform app_private.catalog_write_audit(actor, action_name, 'exercise_variations', p_exercise_id, p_workspace_id,
    jsonb_build_object('identity_id', p_exercise_id, 'version', next_version, 'changed_fields', jsonb_build_array('lifecycle')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;
alter function public.catalog_transition_variation(uuid, uuid, integer, text, uuid) owner to postgres;
revoke all on function public.catalog_transition_variation(uuid, uuid, integer, text, uuid) from public, anon, service_role;
grant execute on function public.catalog_transition_variation(uuid, uuid, integer, text, uuid) to authenticated;
