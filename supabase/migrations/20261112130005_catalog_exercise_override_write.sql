-- F16 T047: CAS-protected workspace writes for the eight approved override fields.
create function public.catalog_write_exercise_override(
  p_workspace_id uuid,
  p_exercise_id uuid,
  p_expected_version integer,
  p_operation_key uuid,
  p_request jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  current_version integer;
  next_version integer;
  current_payload jsonb := '{}'::jsonb;
  payload jsonb;
  alternatives_present boolean := false;
  replay jsonb;
  request_hash text;
  result jsonb;
  changed_fields jsonb := '[]'::jsonb;
  exercise_state text;
  item jsonb;
  target_global uuid;
  target_private uuid;
  target_key text;
  seen text[] := array[]::text[];
begin
  if actor is null or p_workspace_id is null or p_exercise_id is null
    or p_operation_key is null or p_expected_version is null or p_expected_version < 0
    or p_request is null or jsonb_typeof(p_request) <> 'object'
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'catalog.exercise_override:' || p_workspace_id::text || ':' || p_exercise_id::text, 0));
  select e.lifecycle_state into exercise_state
    from public.exercises e where e.id = p_exercise_id for share;
  if not found or exercise_state <> 'active' then
    raise exception 'catalog_exercise_not_active' using errcode = 'P0002';
  end if;
  select o.current_version into current_version
    from public.exercise_overrides o
    where o.workspace_id = p_workspace_id and o.exercise_id = p_exercise_id
    for update;
  request_hash := 'sha256:' || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_array(p_workspace_id, p_exercise_id, p_expected_version, p_request)::text, 'UTF8'), 'sha256'), 'hex');
  replay := app_private.claim_catalog_operation(actor, 'catalog.exercise_override_versioned', p_operation_key, request_hash);

  -- Membership and capability can be revoked while this call waits for either lock.
  if not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if replay is not null then return replay; end if;

  if (current_version is null and p_expected_version <> 0)
    or (current_version is not null and current_version <> p_expected_version) then
    raise exception 'catalog_exercise_override_version_conflict' using errcode = '40001';
  end if;
  if exists (select 1 from jsonb_object_keys(p_request) k(key)
    where k.key not in ('name_en','name_ar','description','notes','video_url','default_rest_time','default_rir','default_reps','alternatives')) then
    raise exception 'catalog_exercise_override_invalid' using errcode = '22023';
  end if;
  if (p_request ? 'name_ar' and not (p_request ? 'name_en'))
    or (p_request ? 'name_en' and jsonb_typeof(p_request->'name_en') not in ('string','null'))
    or (p_request ? 'name_ar' and jsonb_typeof(p_request->'name_ar') not in ('string','null'))
    or (p_request ? 'name_en' and p_request->'name_en' = 'null'::jsonb and p_request->'name_ar' <> 'null'::jsonb)
    or (p_request ? 'name_en' and jsonb_typeof(p_request->'name_en') = 'string' and (nullif(btrim(p_request->>'name_en'),'') is null or char_length(p_request->>'name_en') > 120))
    or (p_request ? 'name_ar' and jsonb_typeof(p_request->'name_ar') = 'string' and (nullif(btrim(p_request->>'name_ar'),'') is null or char_length(p_request->>'name_ar') > 120)) then
    raise exception 'catalog_exercise_override_invalid' using errcode = '22023';
  end if;
  if (p_request ? 'description' and (jsonb_typeof(p_request->'description') not in ('string','null') or char_length(p_request->>'description') > 2000))
    or (p_request ? 'notes' and (jsonb_typeof(p_request->'notes') not in ('string','null') or char_length(p_request->>'notes') > 2000))
    or (p_request ? 'video_url' and (jsonb_typeof(p_request->'video_url') not in ('string','null')
      or (jsonb_typeof(p_request->'video_url') = 'string' and not app_private.catalog_video_url_allowed(p_request->>'video_url')))) then
    raise exception 'catalog_exercise_override_invalid' using errcode = '22023';
  end if;
  if p_request ? 'default_rest_time' and p_request->'default_rest_time' <> 'null'::jsonb and
      (jsonb_typeof(p_request->'default_rest_time') <> 'number' or (p_request->>'default_rest_time') !~ '^(0|[1-9][0-9]{0,2})$'
       or (p_request->>'default_rest_time')::integer > 600 or (p_request->>'default_rest_time')::integer % 15 <> 0) then
    raise exception 'catalog_exercise_override_invalid' using errcode = '22023';
  end if;
  if p_request ? 'default_rir' and p_request->'default_rir' <> 'null'::jsonb and
      (jsonb_typeof(p_request->'default_rir') <> 'number' or (p_request->>'default_rir') !~ '^(0|[1-5])$') then
    raise exception 'catalog_exercise_override_invalid' using errcode = '22023';
  end if;
  if p_request ? 'default_reps' and p_request->'default_reps' <> 'null'::jsonb and not coalesce((
    (jsonb_typeof(p_request->'default_reps') = 'number' and (p_request->>'default_reps') ~ '^([1-9]|[1-9][0-9]|100)$')
    or (jsonb_typeof(p_request->'default_reps') = 'object'
      and not exists (select 1 from jsonb_object_keys(p_request->'default_reps') k(key) where k.key not in ('min','max'))
      and jsonb_typeof(p_request->'default_reps'->'min') = 'number'
      and jsonb_typeof(p_request->'default_reps'->'max') = 'number'
      and (p_request->'default_reps'->>'min') ~ '^([1-9]|[1-9][0-9]|100)$'
      and (p_request->'default_reps'->>'max') ~ '^([1-9]|[1-9][0-9]|100)$'
      and (p_request->'default_reps'->>'min')::integer <= (p_request->'default_reps'->>'max')::integer)), false) then
    raise exception 'catalog_exercise_override_invalid' using errcode = '22023';
  end if;
  if p_request ? 'alternatives' and p_request->'alternatives' <> 'null'::jsonb
    and (jsonb_typeof(p_request->'alternatives') <> 'array' or jsonb_array_length(p_request->'alternatives') > 3) then
    raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
  end if;

  if current_version is not null then
    select v.payload, v.alternatives_present into current_payload, alternatives_present
      from public.exercise_override_versions v
      where v.workspace_id=p_workspace_id and v.exercise_id=p_exercise_id and v.version=current_version;
  end if;
  payload := current_payload || (p_request - 'alternatives'::text);
  if p_request ? 'name_en' and p_request->'name_en' = 'null'::jsonb then
    payload := payload || jsonb_build_object('name_en', null, 'name_ar', null);
  end if;
  alternatives_present := case
    when p_request ? 'alternatives' then p_request->'alternatives' <> 'null'::jsonb
    else alternatives_present end;
  next_version := coalesce(current_version, 0) + 1;

  if p_request ? 'alternatives' and p_request->'alternatives' <> 'null'::jsonb then
    for item in select value from jsonb_array_elements(p_request->'alternatives') loop
      if exists (select 1 from jsonb_object_keys(item) k(key) where k.key not in ('global_exercise_id','workspace_exercise_id'))
        or num_nonnulls(item->>'global_exercise_id', item->>'workspace_exercise_id') <> 1 then
        raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
      end if;
      target_global := nullif(item->>'global_exercise_id','')::uuid;
      target_private := nullif(item->>'workspace_exercise_id','')::uuid;
      if target_global is not null then target_key := 'g:' || target_global::text;
      else target_key := 'w:' || target_private::text; end if;
      if target_key = any(seen) then raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023'; end if;
      seen := array_append(seen, target_key);
    end loop;
  end if;

  if current_version is null then
    insert into public.exercise_overrides(workspace_id, exercise_id, current_version)
      values (p_workspace_id, p_exercise_id, next_version);
  end if;
  insert into public.exercise_override_versions(workspace_id, exercise_id, version, payload, alternatives_present, created_by)
    values (p_workspace_id, p_exercise_id, next_version, payload, alternatives_present, actor);

  if p_request ? 'alternatives' and p_request->'alternatives' <> 'null'::jsonb then
    for item in select value from jsonb_array_elements(p_request->'alternatives') with ordinality as a(value, ord) order by ord loop
      target_global := nullif(item->>'global_exercise_id','')::uuid;
      target_private := nullif(item->>'workspace_exercise_id','')::uuid;
      insert into public.exercise_override_alternatives(workspace_id, exercise_id, override_version, position, global_exercise_id, workspace_exercise_id)
        values (p_workspace_id, p_exercise_id, next_version, (select ord::smallint from jsonb_array_elements(p_request->'alternatives') with ordinality x(value,ord) where x.value=item limit 1), target_global, target_private);
    end loop;
  elsif not (p_request ? 'alternatives') and current_version is not null and alternatives_present then
    insert into public.exercise_override_alternatives(workspace_id, exercise_id, override_version, position, global_exercise_id, workspace_exercise_id)
      select a.workspace_id, a.exercise_id, next_version, a.position, a.global_exercise_id, a.workspace_exercise_id
      from public.exercise_override_alternatives a
      left join public.exercises g on g.id=a.global_exercise_id
      left join public.workspace_exercises w on w.workspace_id=a.workspace_id and w.id=a.workspace_exercise_id
      where a.workspace_id=p_workspace_id and a.exercise_id=p_exercise_id and a.override_version=current_version
        and ((a.global_exercise_id is not null and g.lifecycle_state='active')
          or (a.workspace_exercise_id is not null and w.lifecycle_state='active'));
  end if;

  update public.exercise_overrides set current_version=next_version
    where workspace_id=p_workspace_id and exercise_id=p_exercise_id;
  if p_request ? 'name_en' then changed_fields := changed_fields || jsonb_build_array('name'); end if;
  if p_request ? 'description' then changed_fields := changed_fields || jsonb_build_array('description'); end if;
  if p_request ? 'notes' then changed_fields := changed_fields || jsonb_build_array('notes'); end if;
  if p_request ? 'video_url' then changed_fields := changed_fields || jsonb_build_array('video'); end if;
  if p_request ? 'alternatives' then changed_fields := changed_fields || jsonb_build_array('alternatives'); end if;
  if p_request ? 'default_rest_time' then changed_fields := changed_fields || jsonb_build_array('default_rest_time'); end if;
  if p_request ? 'default_rir' then changed_fields := changed_fields || jsonb_build_array('default_rir'); end if;
  if p_request ? 'default_reps' then changed_fields := changed_fields || jsonb_build_array('default_reps'); end if;
  result := jsonb_build_object('workspace_id',p_workspace_id,'exercise_id',p_exercise_id,'version',next_version);
  perform app_private.catalog_write_audit(actor,'catalog.exercise_override_versioned','exercise_overrides',p_exercise_id,p_workspace_id,
    jsonb_build_object('identity_id',p_exercise_id,'version',next_version,'changed_fields',changed_fields));
  perform app_private.set_catalog_operation_result(actor,p_operation_key,result);
  return result;
end;
$$;
alter function public.catalog_write_exercise_override(uuid,uuid,integer,uuid,jsonb) owner to postgres;
revoke all on function public.catalog_write_exercise_override(uuid,uuid,integer,uuid,jsonb) from public, anon, service_role;
grant execute on function public.catalog_write_exercise_override(uuid,uuid,integer,uuid,jsonb) to authenticated;
