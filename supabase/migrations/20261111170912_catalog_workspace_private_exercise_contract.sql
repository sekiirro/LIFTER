-- F16 T075 (FR-001/FR-003/FR-004/FR-018/FR-024/FR-025): validate and persist
-- the workspace-private eight-field version contract. Shared Name, Description,
-- Notes, Video, Defaults, and taxonomy rules stay in the approved common
-- validator; private-version Alternatives use the T090 immutable child rows.

create or replace function app_private.validate_workspace_exercise_payload(
  p_workspace_id uuid, p_exercise_id uuid, p_request jsonb
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  payload jsonb;
begin
  if p_workspace_id is null then
    raise exception 'catalog_exercise_invalid' using errcode = '22023';
  end if;

  -- FR-001/FR-003: reuse common Name, Description (<= 2000), Notes, Video,
  -- Defaults, and taxonomy checks. FR-025: validate private Alternatives below.
  payload := app_private.validate_exercise_payload(p_request - 'alternatives');

  if p_request ? 'alternatives' and jsonb_typeof(p_request -> 'alternatives') <> 'null' then
    if jsonb_typeof(p_request -> 'alternatives') is distinct from 'array' then
      raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
    end if;
    if jsonb_array_length(p_request -> 'alternatives') > 3 then
      raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_request -> 'alternatives') a(value)
      where jsonb_typeof(a.value) <> 'object'
        or exists (
          select 1 from jsonb_object_keys(a.value) k(key)
          where k.key not in ('global_exercise_id', 'workspace_exercise_id')
        )
        or num_nonnulls(a.value -> 'global_exercise_id', a.value -> 'workspace_exercise_id') <> 1
        or (a.value ? 'global_exercise_id' and (
          jsonb_typeof(a.value -> 'global_exercise_id') <> 'string'
          or (a.value ->> 'global_exercise_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ))
        or (a.value ? 'workspace_exercise_id' and (
          jsonb_typeof(a.value -> 'workspace_exercise_id') <> 'string'
          or (a.value ->> 'workspace_exercise_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ))
    ) then
      raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
    end if;

    if (select count(*) <> count(distinct target_key)
      from (
        select case
          when a.value ? 'global_exercise_id' then 'g:' || lower(a.value ->> 'global_exercise_id')
          else 'w:' || lower(a.value ->> 'workspace_exercise_id')
        end as target_key
        from jsonb_array_elements(p_request -> 'alternatives') a(value)
      ) targets
    ) then
      raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
    end if;

    if p_exercise_id is not null and exists (
      select 1 from jsonb_array_elements(p_request -> 'alternatives') a(value)
      where (a.value ->> 'workspace_exercise_id')::uuid = p_exercise_id
    ) then
      raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(p_request -> 'alternatives') a(value)
      left join public.exercises g on g.id = (a.value ->> 'global_exercise_id')::uuid
      left join public.workspace_exercises w
        on w.workspace_id = p_workspace_id
        and w.id = (a.value ->> 'workspace_exercise_id')::uuid
      where (a.value ? 'global_exercise_id' and (g.id is null or g.lifecycle_state <> 'active'))
        or (a.value ? 'workspace_exercise_id' and (w.id is null or w.lifecycle_state <> 'active'))
    ) then
      raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
    end if;
  end if;

  return p_request;
end;
$$;
alter function app_private.validate_workspace_exercise_payload(uuid, uuid, jsonb) owner to postgres;
revoke all on function app_private.validate_workspace_exercise_payload(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

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
  item record;
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
  payload := app_private.validate_workspace_exercise_payload(p_workspace_id, p_exercise_id, p_request);

  if p_exercise_id is null then
    identity_id := gen_random_uuid();
    next_version := 1;
    insert into public.workspace_exercises(workspace_id, id, created_by, current_version)
      values (p_workspace_id, identity_id, actor, next_version);
    insert into public.workspace_exercise_versions(
      workspace_id, workspace_exercise_id, version, payload, notes,
      default_rest_time, default_rir, default_reps, created_by
    ) values (
      p_workspace_id, identity_id, next_version, payload, p_request ->> 'notes',
      nullif(p_request ->> 'default_rest_time', '')::integer,
      nullif(p_request ->> 'default_rir', '')::smallint,
      case when p_request ? 'default_reps' then p_request -> 'default_reps' else null end,
      actor
    );
    action_name := 'catalog.workspace_exercise_created';
  else
    if lifecycle <> 'active' then raise exception 'catalog_exercise_not_active' using errcode = '23514'; end if;
    if p_expected_version is null or current_version <> p_expected_version then
      raise exception 'catalog_exercise_version_conflict' using errcode = '40001';
    end if;
    identity_id := p_exercise_id;
    next_version := current_version + 1;
    insert into public.workspace_exercise_versions(
      workspace_id, workspace_exercise_id, version, payload, notes,
      default_rest_time, default_rir, default_reps, created_by
    ) values (
      p_workspace_id, identity_id, next_version, payload, p_request ->> 'notes',
      nullif(p_request ->> 'default_rest_time', '')::integer,
      nullif(p_request ->> 'default_rir', '')::smallint,
      case when p_request ? 'default_reps' then p_request -> 'default_reps' else null end,
      actor
    );
    update public.workspace_exercises set current_version = next_version
      where workspace_id = p_workspace_id and id = identity_id;
    action_name := 'catalog.workspace_exercise_versioned';
  end if;

  if p_request ? 'alternatives' and jsonb_typeof(p_request -> 'alternatives') = 'array' then
    for item in
      select a.value, a.ordinality::smallint as position
      from jsonb_array_elements(p_request -> 'alternatives') with ordinality a(value, ordinality)
      order by a.ordinality
    loop
      insert into public.workspace_exercise_version_alternatives(
        workspace_id, workspace_exercise_id, version, position,
        global_exercise_id, alternative_workspace_exercise_id
      ) values (
        p_workspace_id, identity_id, next_version, item.position,
        nullif(item.value ->> 'global_exercise_id', '')::uuid,
        nullif(item.value ->> 'workspace_exercise_id', '')::uuid
      );
    end loop;
  end if;

  result := jsonb_build_object('workspace_id', p_workspace_id, 'exercise_id', identity_id, 'version', next_version);
  perform app_private.catalog_write_audit(actor, action_name, 'workspace_exercises', identity_id, p_workspace_id,
    jsonb_build_object('identity_id', identity_id, 'version', next_version,
      'changed_fields', jsonb_build_array('name','description','notes','video','alternatives','default_rest_time','default_rir','default_reps')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;
alter function public.catalog_write_workspace_exercise(uuid, uuid, integer, uuid, jsonb) owner to postgres;
revoke all on function public.catalog_write_workspace_exercise(uuid, uuid, integer, uuid, jsonb) from public, anon, service_role;
grant execute on function public.catalog_write_workspace_exercise(uuid, uuid, integer, uuid, jsonb) to authenticated;
