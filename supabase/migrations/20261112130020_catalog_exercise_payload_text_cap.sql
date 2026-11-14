-- Forward-only RPC cap guard: return catalog_exercise_invalid before table CHECK constraints can leak 23514.
create or replace function app_private.validate_exercise_payload(p_request jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare bad boolean;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception 'catalog_exercise_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_request) as keys(key)
    where key not in (
      'name_ar','name_en','primary_muscle_code','secondary_muscle_codes',
      'equipment_codes','description','notes','video_url','alternatives',
      'default_rest_time','default_rir','default_reps'
    )
  )
    or jsonb_typeof(p_request -> 'name_en') is distinct from 'string'
    or nullif(btrim(p_request ->> 'name_en'), '') is null
    or char_length(p_request ->> 'name_en') > 120
    or (p_request ? 'name_ar' and jsonb_typeof(p_request -> 'name_ar') not in ('string','null'))
    or (p_request ? 'name_ar' and jsonb_typeof(p_request -> 'name_ar') = 'string'
      and (nullif(btrim(p_request ->> 'name_ar'), '') is null or char_length(p_request ->> 'name_ar') > 120))
    or (p_request ? 'description' and jsonb_typeof(p_request -> 'description') not in ('string','null'))
    or (p_request ? 'description' and jsonb_typeof(p_request -> 'description') = 'string'
      and char_length(p_request ->> 'description') > 2000)
    or (p_request ? 'notes' and jsonb_typeof(p_request -> 'notes') not in ('string','null'))
    or (p_request ? 'video_url' and jsonb_typeof(p_request -> 'video_url') not in ('string','null'))
    or (p_request ? 'notes' and jsonb_typeof(p_request -> 'notes') = 'string'
      and char_length(p_request ->> 'notes') > 2000)
    or (p_request ? 'video_url' and jsonb_typeof(p_request -> 'video_url') = 'string'
      and char_length(p_request ->> 'video_url') > 2000)
    then
    raise exception 'catalog_exercise_invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_request -> 'equipment_codes') is distinct from 'array'
    or (p_request ? 'secondary_muscle_codes' and jsonb_typeof(p_request -> 'secondary_muscle_codes') <> 'array')
    or (p_request ? 'alternatives' and jsonb_typeof(p_request -> 'alternatives') not in ('array','null')) then
    raise exception 'catalog_exercise_invalid' using errcode = '22023';
  end if;
  if jsonb_array_length(p_request -> 'equipment_codes') = 0 then
    raise exception 'catalog_exercise_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_request -> 'equipment_codes') e(value)
    where jsonb_typeof(e.value) <> 'string'
  ) or exists (
    select 1 from jsonb_array_elements(coalesce(p_request -> 'secondary_muscle_codes', '[]'::jsonb)) m(value)
    where jsonb_typeof(m.value) <> 'string'
  ) then
    raise exception 'catalog_exercise_invalid' using errcode = '22023';
  end if;

  if p_request ? 'video_url' and jsonb_typeof(p_request -> 'video_url') = 'string'
    and not app_private.catalog_video_url_allowed(p_request ->> 'video_url') then
    raise exception 'catalog_exercise_invalid' using errcode = '22023';
  end if;

  if p_request ? 'default_rest_time' and p_request -> 'default_rest_time' <> 'null'::jsonb then
    if jsonb_typeof(p_request -> 'default_rest_time') <> 'number'
      or (p_request ->> 'default_rest_time') !~ '^(0|[1-9][0-9]{0,2})$' then
      raise exception 'catalog_exercise_invalid' using errcode = '22023';
    end if;
    if (p_request ->> 'default_rest_time')::integer > 600
      or (p_request ->> 'default_rest_time')::integer % 15 <> 0 then
      raise exception 'catalog_exercise_invalid' using errcode = '22023';
    end if;
  end if;
  if p_request ? 'default_rir' and p_request -> 'default_rir' <> 'null'::jsonb
    and (jsonb_typeof(p_request -> 'default_rir') <> 'number'
      or (p_request ->> 'default_rir') !~ '^(0|[1-5])$') then
    raise exception 'catalog_exercise_invalid' using errcode = '22023';
  end if;
  if p_request ? 'default_reps' and p_request -> 'default_reps' <> 'null'::jsonb then
    if jsonb_typeof(p_request -> 'default_reps') = 'number' then
      if (p_request ->> 'default_reps') !~ '^([1-9]|[1-9][0-9]|100)$' then
        raise exception 'catalog_exercise_invalid' using errcode = '22023';
      end if;
    elsif jsonb_typeof(p_request -> 'default_reps') = 'object' then
      if exists (
        select 1 from jsonb_object_keys(p_request -> 'default_reps') k(key)
        where key not in ('min','max')
      ) or jsonb_typeof(p_request -> 'default_reps' -> 'min') is distinct from 'number'
        or jsonb_typeof(p_request -> 'default_reps' -> 'max') is distinct from 'number'
        or (p_request -> 'default_reps' ->> 'min') !~ '^([1-9]|[1-9][0-9]|100)$'
        or (p_request -> 'default_reps' ->> 'max') !~ '^([1-9]|[1-9][0-9]|100)$' then
        raise exception 'catalog_exercise_invalid' using errcode = '22023';
      end if;
      if (p_request -> 'default_reps' ->> 'min')::integer > (p_request -> 'default_reps' ->> 'max')::integer then
        raise exception 'catalog_exercise_invalid' using errcode = '22023';
      end if;
    else
      raise exception 'catalog_exercise_invalid' using errcode = '22023';
    end if;
  end if;

  if p_request ? 'alternatives' and jsonb_typeof(p_request -> 'alternatives') = 'array' then
    if jsonb_array_length(p_request -> 'alternatives') > 3
      or exists (
        select 1 from jsonb_array_elements(p_request -> 'alternatives') a(value)
        where jsonb_typeof(a.value) <> 'string'
          or (a.value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
      or (select count(*) <> count(distinct value #>> '{}')
        from jsonb_array_elements(p_request -> 'alternatives') a(value)) then
      raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(p_request -> 'alternatives') a(target_id)
      left join public.exercises e on e.id = a.target_id::uuid
      where e.id is null or e.lifecycle_state <> 'active'
    ) then
      raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
    end if;
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


-- Reduce FK contention while retaining the serialized workspace identity write.
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
    for no key update;
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


-- Resolve the host-filtered Video projection.
create or replace function app_private.catalog_effective_exercise_fields(
  p_workspace_id uuid, p_exercise_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  canonical_payload jsonb;
  canonical_notes text;
  canonical_rest integer;
  canonical_rir smallint;
  canonical_reps jsonb;
  override_payload jsonb;
  override_alternatives_present boolean := false;
  canonical_alternatives jsonb := '[]'::jsonb;
  override_alternatives jsonb := '[]'::jsonb;
  resolved_alternatives jsonb;
  alternatives_source text;
  result jsonb;
begin
  if p_exercise_id is null or not app_private.catalog_can_read_global()
    or (p_workspace_id is not null and not app_private.is_platform_owner()
      and not app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  select v.payload, v.notes, v.default_rest_time, v.default_rir, v.default_reps
    into canonical_payload, canonical_notes, canonical_rest, canonical_rir, canonical_reps
    from public.exercises e
    join public.exercise_versions v on v.exercise_id = e.id and v.version = e.current_version
    where e.id = p_exercise_id;
  if not found then raise exception using errcode = '42501', message = 'not_permitted'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('global_exercise_id', a.global_exercise_id)
    order by a.position), '[]'::jsonb)
    into canonical_alternatives
    from public.exercise_version_alternatives a
    join public.exercises target on target.id = a.global_exercise_id and target.lifecycle_state = 'active'
    where a.exercise_id = p_exercise_id and a.version = (select current_version from public.exercises where id = p_exercise_id);

  if p_workspace_id is not null then
    select v.payload, v.alternatives_present into override_payload, override_alternatives_present
      from public.exercise_overrides o
      join public.exercise_override_versions v on v.workspace_id = o.workspace_id
        and v.exercise_id = o.exercise_id and v.version = o.current_version
      where o.workspace_id = p_workspace_id and o.exercise_id = p_exercise_id;
    if found and override_alternatives_present then
      select coalesce(jsonb_agg(jsonb_build_object(
        'global_exercise_id', a.global_exercise_id,
        'workspace_exercise_id', a.workspace_exercise_id
      ) order by a.position) filter (where
        (a.global_exercise_id is not null and g.lifecycle_state = 'active')
        or (a.workspace_exercise_id is not null and w.lifecycle_state = 'active')
      ), '[]'::jsonb)
        into override_alternatives
        from public.exercise_override_alternatives a
        left join public.exercises g on g.id = a.global_exercise_id
        left join public.workspace_exercises w on w.workspace_id = a.workspace_id and w.id = a.workspace_exercise_id
        where a.workspace_id = p_workspace_id and a.exercise_id = p_exercise_id
          and a.override_version = (select current_version from public.exercise_overrides
            where workspace_id = p_workspace_id and exercise_id = p_exercise_id);
    end if;
  end if;

  if p_workspace_id is not null and override_payload is not null
    and override_alternatives_present then
    resolved_alternatives := override_alternatives;
    alternatives_source := 'override';
  elsif jsonb_array_length(canonical_alternatives) > 0 then
    resolved_alternatives := canonical_alternatives;
    alternatives_source := 'canonical';
  else
    resolved_alternatives := '[]'::jsonb;
    alternatives_source := 'none';
  end if;

  result := jsonb_build_object(
    'name', jsonb_build_object(
      'value', case when p_workspace_id is not null and override_payload ? 'name_en'
          and override_payload->'name_en' <> 'null'::jsonb
        then jsonb_build_object('name_en', override_payload->'name_en', 'name_ar', override_payload->'name_ar')
        else jsonb_build_object('name_en', canonical_payload->'name_en', 'name_ar', canonical_payload->'name_ar') end,
      'source', case when p_workspace_id is not null and override_payload ? 'name_en'
          and override_payload->'name_en' <> 'null'::jsonb then 'override'
        when canonical_payload ? 'name_en' then 'canonical' else 'none' end),
    'description', jsonb_build_object(
      'value', case when p_workspace_id is not null and override_payload ? 'description'
          and override_payload->'description' <> 'null'::jsonb then override_payload->'description'
        else canonical_payload->'description' end,
      'source', case when p_workspace_id is not null and override_payload ? 'description'
          and override_payload->'description' <> 'null'::jsonb then 'override'
        when canonical_payload ? 'description' then 'canonical' else 'none' end),
    'notes', jsonb_build_object(
      'value', case when p_workspace_id is not null and override_payload ? 'notes'
          and override_payload->'notes' <> 'null'::jsonb then override_payload->'notes'
        else to_jsonb(canonical_notes) end,
      'source', case when p_workspace_id is not null and override_payload ? 'notes'
          and override_payload->'notes' <> 'null'::jsonb then 'override'
        when canonical_notes is not null then 'canonical' else 'none' end),
    'video', jsonb_build_object(
      'value', case when p_workspace_id is not null and override_payload ? 'video_url'
          and override_payload->'video_url' <> 'null'::jsonb then override_payload->'video_url'
        else canonical_payload->'video_url' end,
      'source', case when p_workspace_id is not null and override_payload ? 'video_url'
          and override_payload->'video_url' <> 'null'::jsonb then 'override'
        when canonical_payload ? 'video_url' then 'canonical' else 'none' end),
    'alternatives', jsonb_build_object('value', resolved_alternatives, 'source', alternatives_source),
    'default_rest_time', jsonb_build_object(
      'value', case when p_workspace_id is not null and override_payload ? 'default_rest_time'
          and override_payload->'default_rest_time' <> 'null'::jsonb then override_payload->'default_rest_time'
        else to_jsonb(canonical_rest) end,
      'source', case when p_workspace_id is not null and override_payload ? 'default_rest_time'
          and override_payload->'default_rest_time' <> 'null'::jsonb then 'override'
        when canonical_rest is not null then 'canonical' else 'none' end),
    'default_rir', jsonb_build_object(
      'value', case when p_workspace_id is not null and override_payload ? 'default_rir'
          and override_payload->'default_rir' <> 'null'::jsonb then override_payload->'default_rir'
        else to_jsonb(canonical_rir) end,
      'source', case when p_workspace_id is not null and override_payload ? 'default_rir'
          and override_payload->'default_rir' <> 'null'::jsonb then 'override'
        when canonical_rir is not null then 'canonical' else 'none' end),
    'default_reps', jsonb_build_object(
      'value', case when p_workspace_id is not null and override_payload ? 'default_reps'
          and override_payload->'default_reps' <> 'null'::jsonb then override_payload->'default_reps'
        else canonical_reps end,
      'source', case when p_workspace_id is not null and override_payload ? 'default_reps'
          and override_payload->'default_reps' <> 'null'::jsonb then 'override'
        when canonical_reps is not null then 'canonical' else 'none' end)
  );
  result := jsonb_set(result, '{video}', jsonb_build_object(
    'value', case
      when p_workspace_id is not null and override_payload ? 'video_url'
        and override_payload->'video_url' <> 'null'::jsonb
        and app_private.catalog_video_url_allowed(override_payload->>'video_url')
        then override_payload->'video_url'
      when canonical_payload ? 'video_url'
        and canonical_payload->'video_url' <> 'null'::jsonb
        and app_private.catalog_video_url_allowed(canonical_payload->>'video_url')
        then canonical_payload->'video_url'
      else 'null'::jsonb end,
    'source', case
      when p_workspace_id is not null and override_payload ? 'video_url'
        and override_payload->'video_url' <> 'null'::jsonb
        and app_private.catalog_video_url_allowed(override_payload->>'video_url')
        then 'override'
      when canonical_payload ? 'video_url'
        and canonical_payload->'video_url' <> 'null'::jsonb
        and app_private.catalog_video_url_allowed(canonical_payload->>'video_url')
        then 'canonical'
      else 'none' end
  ), true);
  return result;
end;
$$;
alter function app_private.catalog_effective_exercise_fields(uuid, uuid) owner to postgres;
revoke all on function app_private.catalog_effective_exercise_fields(uuid, uuid) from public, anon, service_role;
grant execute on function app_private.catalog_effective_exercise_fields(uuid, uuid) to authenticated;
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
  page_limit integer := 50;
  cursor_id uuid;
  normalized_query text;
  muscle_filter text;
  equipment_filter jsonb;
begin
  if kind = 'variation' then
    return query select * from app_private.catalog_search_variation(query, filters, "cursor", workspace_id);
    return;
  end if;
  if kind in ('exercise', 'food') then
    if not app_private.catalog_can_read_global() then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    if kind = 'exercise' and workspace_id is not null and not app_private.is_platform_owner()
      and not app_private.has_workspace_access(workspace_id, 'coaching_work') then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
  elsif kind = 'workspace_exercise' then
    if workspace_id is null or not app_private.has_workspace_access(workspace_id, 'coaching_work') then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
  else
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  if kind = 'exercise' and workspace_id is not null then
    if filters is null or jsonb_typeof(filters) <> 'object' then
      raise exception using errcode = '22023', message = 'invalid_filters';
    end if;
    if filters ? 'page_size' then
      if filters->>'page_size' !~ '^[0-9]+$' then
        raise exception using errcode = '22023', message = 'invalid_page_size';
      end if;
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

    return query
      with page as materialized (
        select e.id, e.current_version
        from public.exercises e
        join public.exercise_versions v on v.exercise_id = e.id and v.version = e.current_version
        left join public.exercise_overrides o on o.workspace_id = $5 and o.exercise_id = e.id
        left join public.exercise_override_versions ov on ov.workspace_id = o.workspace_id
          and ov.exercise_id = o.exercise_id and ov.version = o.current_version
        where e.lifecycle_state = 'active'
          and (normalized_query is null
            or v.name_norm_ar_v1 like '%' || normalized_query || '%'
            or v.name_norm_en_v1 like '%' || normalized_query || '%'
            or app_private.normalize_ar_en_v1(coalesce(nullif(ov.payload->>'name_en', ''), v.payload->>'name_en', '')) like '%' || normalized_query || '%'
            or app_private.normalize_ar_en_v1(coalesce(nullif(ov.payload->>'name_ar', ''), v.payload->>'name_ar', '')) like '%' || normalized_query || '%'
            or (v.name_norm_ar_v1 = '' and v.name_norm_en_v1 = '' and v.payload::text ilike '%' || query || '%'))
          and (muscle_filter is null or v.payload->>'primary_muscle_code' = muscle_filter)
          and (equipment_filter is null or coalesce(v.payload->'equipment_codes' ?| array(select jsonb_array_elements_text(equipment_filter)), false))
          and (cursor_id is null or e.id > cursor_id)
        order by e.id
        limit page_limit
      )
      select page.id, null::uuid, page.current_version,
        v.payload || jsonb_build_object('effective_fields', app_private.catalog_effective_exercise_fields($5, page.id)),
        null::uuid, null::uuid
      from page
      join public.exercise_versions v on v.exercise_id = page.id and v.version = page.current_version
      order by page.id;
    return;
  end if;

  return query select * from app_private.catalog_search_pre_cutover(kind, query, filters, "cursor", workspace_id);
end;
$$;
alter function public.catalog_search(text, text, jsonb, text, uuid) owner to postgres;
alter function public.catalog_search(text, text, jsonb, text, uuid) security invoker;
revoke all on function public.catalog_search(text, text, jsonb, text, uuid) from public, anon, service_role;
grant execute on function public.catalog_search(text, text, jsonb, text, uuid) to authenticated;

-- Resolve full fields only for the filtered keyset page. Effective names are read
-- from the current version payloads before ordering so overrides remain searchable.
create or replace function public.catalog_workspace_library(
  p_workspace_id uuid,
  p_query text default null,
  p_filters jsonb default '{}'::jsonb,
  p_cursor text default null,
  p_page_size integer default 20
) returns table (
  result_id uuid, result_workspace_id uuid, result_version integer,
  result_payload jsonb, result_created_by uuid, result_origin_workspace_id uuid,
  result_kind text, result_cursor text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  page_limit integer := 20;
  normalized_query text;
  muscle_filter text;
  equipment_filter jsonb;
  cursor_name text;
  cursor_id uuid;
  decoded text;
  separator integer;
begin
  if auth.uid() is null or p_workspace_id is null
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if p_filters is null or jsonb_typeof(p_filters) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_filters';
  end if;
  if p_page_size is not null then
    if p_page_size < 1 then raise exception using errcode = '22023', message = 'invalid_page_size'; end if;
    page_limit := least(p_page_size, 50);
  end if;
  if p_cursor is not null then
    if p_cursor !~ '^[0-9a-f]+$' then raise exception using errcode = '22023', message = 'invalid_cursor'; end if;
    begin decoded := convert_from(decode(p_cursor, 'hex'), 'UTF8');
    exception when others then raise exception using errcode = '22023', message = 'invalid_cursor'; end;
    separator := position(chr(31) in decoded);
    if separator < 2 then raise exception using errcode = '22023', message = 'invalid_cursor'; end if;
    cursor_name := substr(decoded, 1, separator - 1);
    if substr(decoded, separator + 1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'invalid_cursor';
    end if;
    cursor_id := substr(decoded, separator + 1)::uuid;
  end if;
  normalized_query := nullif(app_private.normalize_ar_en_v1(coalesce(p_query, '')), '');
  muscle_filter := p_filters->>'primary_muscle_code';
  equipment_filter := p_filters->'equipment_codes';
  if equipment_filter is not null and jsonb_typeof(equipment_filter) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_equipment_codes';
  end if;

  return query
  with candidates as materialized (
    select 'global'::text as kind, e.id as id, null::uuid as workspace_id,
      v.version, v.payload,
      pg_catalog.lower(coalesce(nullif(ov.payload->>'name_en', ''), v.payload->>'name_en', '')) as sort_name
    from public.exercises e
    join public.exercise_versions v on v.exercise_id=e.id and v.version=e.current_version
    left join public.exercise_overrides o on o.workspace_id=p_workspace_id and o.exercise_id=e.id
    left join public.exercise_override_versions ov on ov.workspace_id=o.workspace_id
      and ov.exercise_id=o.exercise_id and ov.version=o.current_version
    where e.lifecycle_state='active'
      and (normalized_query is null
        or v.name_norm_ar_v1 like '%'||normalized_query||'%'
        or v.name_norm_en_v1 like '%'||normalized_query||'%'
        or app_private.normalize_ar_en_v1(coalesce(nullif(ov.payload->>'name_en',''),v.payload->>'name_en','')) like '%'||normalized_query||'%'
        or app_private.normalize_ar_en_v1(coalesce(nullif(ov.payload->>'name_ar',''),v.payload->>'name_ar','')) like '%'||normalized_query||'%'
        or (v.name_norm_ar_v1='' and v.name_norm_en_v1='' and v.payload::text ilike '%'||p_query||'%'))
      and (muscle_filter is null or v.payload->>'primary_muscle_code'=muscle_filter)
      and (equipment_filter is null or coalesce(v.payload->'equipment_codes' ?| array(select jsonb_array_elements_text(equipment_filter)),false))

    union all

    select 'private'::text, w.id, w.workspace_id, wv.version, wv.payload,
      pg_catalog.lower(coalesce(wv.payload->>'name_en',''))
    from public.workspace_exercises w
    join public.workspace_exercise_versions wv on wv.workspace_id=w.workspace_id
      and wv.workspace_exercise_id=w.id and wv.version=w.current_version
    where w.workspace_id=p_workspace_id and w.lifecycle_state='active'
      and (normalized_query is null or wv.name_norm_ar_v1 like '%'||normalized_query||'%'
        or wv.name_norm_en_v1 like '%'||normalized_query||'%'
        or (wv.name_norm_ar_v1='' and wv.name_norm_en_v1='' and wv.payload::text ilike '%'||p_query||'%'))
      and (muscle_filter is null or wv.payload->>'primary_muscle_code'=muscle_filter)
      and (equipment_filter is null or coalesce(wv.payload->'equipment_codes' ?| array(select jsonb_array_elements_text(equipment_filter)),false))
  ), page as materialized (
    select c.* from candidates c
    where p_cursor is null or (c.sort_name,c.id)>(cursor_name,cursor_id)
    order by c.sort_name,c.id limit page_limit
  )
  select p.id,p.workspace_id,p.version,
    p.payload || jsonb_build_object('effective_fields',
      case when p.kind='global' then app_private.catalog_effective_exercise_fields(p_workspace_id,p.id)
        else app_private.catalog_effective_workspace_exercise_fields(p_workspace_id,p.id) end),
    null::uuid,null::uuid,p.kind,
    pg_catalog.encode(pg_catalog.convert_to(p.sort_name||chr(31)||p.id::text,'UTF8'),'hex')
  from page p order by p.sort_name,p.id;
end;
$$;
alter function public.catalog_workspace_library(uuid,text,jsonb,text,integer) owner to postgres;
revoke all on function public.catalog_workspace_library(uuid,text,jsonb,text,integer) from public, anon, service_role;
grant execute on function public.catalog_workspace_library(uuid,text,jsonb,text,integer) to authenticated;

-- A NULL expected version is stable operation-key input; the locked current version is used on first write.
create or replace function public.catalog_write_exercise_override(
  p_workspace_id uuid,
  p_exercise_id uuid,
  p_expected_version integer,
  p_operation_key uuid,
  p_request jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  locked_override_version integer;
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
    or p_operation_key is null or (p_expected_version is not null and p_expected_version < 0)
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
  select o.current_version into locked_override_version
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

  if (locked_override_version is null and p_expected_version is not null and p_expected_version <> 0)
    or (locked_override_version is not null and p_expected_version is distinct from locked_override_version) then
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

  if locked_override_version is not null then
    select v.payload, v.alternatives_present into current_payload, alternatives_present
      from public.exercise_override_versions v
      where v.workspace_id=p_workspace_id and v.exercise_id=p_exercise_id and v.version=locked_override_version;
  end if;
  payload := current_payload || (p_request - 'alternatives'::text);
  if p_request ? 'name_en' and p_request->'name_en' = 'null'::jsonb then
    payload := payload || jsonb_build_object('name_en', null, 'name_ar', null);
  end if;
  alternatives_present := case
    when p_request ? 'alternatives' then p_request->'alternatives' <> 'null'::jsonb
    else alternatives_present end;
  next_version := coalesce(locked_override_version, 0) + 1;

  if p_request ? 'alternatives' and p_request->'alternatives' <> 'null'::jsonb then
    for item in select value from jsonb_array_elements(p_request->'alternatives') loop
      if exists (select 1 from jsonb_object_keys(item) k(key) where k.key not in ('global_exercise_id','workspace_exercise_id'))
        or num_nonnulls(item->>'global_exercise_id', item->>'workspace_exercise_id') <> 1 then
        raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
      end if;
      target_global := nullif(item->>'global_exercise_id','')::uuid;
      target_private := nullif(item->>'workspace_exercise_id','')::uuid;
      if target_global = p_exercise_id then
        raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
      end if;
      if target_global is not null and not exists (
        select 1 from public.exercises target
        where target.id = target_global and target.lifecycle_state = 'active'
      ) then
        raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
      elsif target_private is not null and not exists (
        select 1 from public.workspace_exercises target
        where target.workspace_id = p_workspace_id and target.id = target_private and target.lifecycle_state = 'active'
      ) then
        raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
      end if;
      if target_global is not null then target_key := 'g:' || target_global::text;
      else target_key := 'w:' || target_private::text; end if;
      if target_key = any(seen) then raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023'; end if;
      seen := array_append(seen, target_key);
    end loop;
  end if;

  if locked_override_version is null then
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
  elsif not (p_request ? 'alternatives') and locked_override_version is not null and alternatives_present then
    insert into public.exercise_override_alternatives(workspace_id, exercise_id, override_version, position, global_exercise_id, workspace_exercise_id)
      select a.workspace_id, a.exercise_id, next_version, a.position, a.global_exercise_id, a.workspace_exercise_id
      from public.exercise_override_alternatives a
      where a.workspace_id=p_workspace_id and a.exercise_id=p_exercise_id and a.override_version=locked_override_version;
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

-- Immutable override history may carry an already-recorded inactive target
-- forward when the current version is versioned without replacing alternatives.
-- The RPC payload validator still rejects newly selected inactive targets.
create or replace function app_private.validate_exercise_override_alternative()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  global_state text;
  private_state text;
  has_alternatives boolean;
  is_exact_carry_forward boolean;
begin
  select v.alternatives_present into has_alternatives
    from public.exercise_override_versions v
    where v.workspace_id = new.workspace_id
      and v.exercise_id = new.exercise_id
      and v.version = new.override_version;
  if not found or not has_alternatives then
    raise exception 'catalog_exercise_alternatives_invalid' using errcode = '23514';
  end if;

  select exists (
    select 1
    from public.exercise_overrides current_override
    join public.exercise_override_alternatives prior
      on prior.workspace_id = current_override.workspace_id
      and prior.exercise_id = current_override.exercise_id
      and prior.override_version = current_override.current_version
    where current_override.workspace_id = new.workspace_id
      and current_override.exercise_id = new.exercise_id
      and new.override_version = current_override.current_version + 1
      and prior.position = new.position
      and prior.global_exercise_id is not distinct from new.global_exercise_id
      and prior.workspace_exercise_id is not distinct from new.workspace_exercise_id
  ) into is_exact_carry_forward;
  if is_exact_carry_forward then
    return new;
  end if;

  if new.global_exercise_id is not null then
    select e.lifecycle_state into global_state
      from public.exercises e where e.id = new.global_exercise_id;
    if global_state is distinct from 'active' then
      raise exception 'catalog_exercise_alternatives_invalid' using errcode = '23514';
    end if;
  else
    select e.lifecycle_state into private_state
      from public.workspace_exercises e
      where e.workspace_id = new.workspace_id and e.id = new.workspace_exercise_id;
    if private_state is distinct from 'active' then
      raise exception 'catalog_exercise_alternatives_invalid' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
alter function app_private.validate_exercise_override_alternative() owner to postgres;
revoke all on function app_private.validate_exercise_override_alternative() from public, anon, authenticated, service_role;
