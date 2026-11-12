-- F16 T074: replace the canonical exercise payload validator with the approved
-- eight-field contract and persist canonical Notes, Defaults, and Alternatives.
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

create or replace function public.catalog_create_exercise(p_operation_key uuid, p_request jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); replay jsonb; payload jsonb; exercise_id uuid; request_hash text; result jsonb; item record;
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
  insert into public.exercise_versions(
    exercise_id, version, payload, notes, default_rest_time, default_rir, default_reps, created_by
  ) values (
    exercise_id, 1, payload, p_request ->> 'notes',
    nullif(p_request ->> 'default_rest_time', '')::integer,
    nullif(p_request ->> 'default_rir', '')::smallint,
    case when p_request ? 'default_reps' then p_request -> 'default_reps' else null end,
    actor
  );
  if p_request ? 'alternatives' and jsonb_typeof(p_request -> 'alternatives') = 'array' then
    for item in
      select a.value #>> '{}' as target_id, a.ordinality::smallint as position
      from jsonb_array_elements(p_request -> 'alternatives') with ordinality a(value, ordinality)
      order by a.ordinality
    loop
      insert into public.exercise_version_alternatives(exercise_id, version, position, global_exercise_id)
        values (exercise_id, 1, item.position, item.target_id::uuid);
    end loop;
  end if;
  result := jsonb_build_object('exercise_id', exercise_id, 'version', 1);
  perform app_private.catalog_write_audit(actor, 'catalog.exercise_created', 'exercises', exercise_id, null,
    jsonb_build_object('identity_id', exercise_id, 'version', 1,
      'changed_fields', jsonb_build_array('name','description','notes','video','alternatives','default_rest_time','default_rir','default_reps')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;
alter function public.catalog_create_exercise(uuid, jsonb) owner to postgres;
revoke all on function public.catalog_create_exercise(uuid, jsonb) from public, anon, service_role;
grant execute on function public.catalog_create_exercise(uuid, jsonb) to authenticated;

create or replace function public.catalog_version_exercise(
  p_exercise_id uuid, p_expected_version integer, p_operation_key uuid, p_request jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); current_version integer; lifecycle text; replay jsonb; payload jsonb; request_hash text; result jsonb; next_version integer; item record;
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
  if jsonb_typeof(payload -> 'alternatives') = 'array' and exists (
    select 1 from jsonb_array_elements_text(coalesce(payload -> 'alternatives', '[]'::jsonb)) a(target_id)
    where a.target_id = p_exercise_id::text
  ) then
    raise exception 'catalog_exercise_alternatives_invalid' using errcode = '22023';
  end if;
  next_version := current_version + 1;
  insert into public.exercise_versions(
    exercise_id, version, payload, notes, default_rest_time, default_rir, default_reps, created_by
  ) values (
    p_exercise_id, next_version, payload, p_request ->> 'notes',
    nullif(p_request ->> 'default_rest_time', '')::integer,
    nullif(p_request ->> 'default_rir', '')::smallint,
    case when p_request ? 'default_reps' then p_request -> 'default_reps' else null end,
    actor
  );
  if p_request ? 'alternatives' and jsonb_typeof(p_request -> 'alternatives') = 'array' then
    for item in
      select a.value #>> '{}' as target_id, a.ordinality::smallint as position
      from jsonb_array_elements(p_request -> 'alternatives') with ordinality a(value, ordinality)
      order by a.ordinality
    loop
      insert into public.exercise_version_alternatives(exercise_id, version, position, global_exercise_id)
        values (p_exercise_id, next_version, item.position, item.target_id::uuid);
    end loop;
  end if;
  update public.exercises set current_version = next_version where id = p_exercise_id;
  result := jsonb_build_object('exercise_id', p_exercise_id, 'version', next_version);
  perform app_private.catalog_write_audit(actor, 'catalog.exercise_versioned', 'exercises', p_exercise_id, null,
    jsonb_build_object('identity_id', p_exercise_id, 'version', next_version,
      'changed_fields', jsonb_build_array('name','description','notes','video','alternatives','default_rest_time','default_rir','default_reps')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;
alter function public.catalog_version_exercise(uuid, integer, uuid, jsonb) owner to postgres;
revoke all on function public.catalog_version_exercise(uuid, integer, uuid, jsonb) from public, anon, service_role;
grant execute on function public.catalog_version_exercise(uuid, integer, uuid, jsonb) to authenticated;
