-- F16 T049: resolve the exact eight exercise library fields for staff reads.
-- Keep canonical payloads intact; attach effective values and per-field sources.
create function app_private.catalog_effective_exercise_fields(
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
  return result;
end;
$$;
alter function app_private.catalog_effective_exercise_fields(uuid, uuid) owner to postgres;
revoke all on function app_private.catalog_effective_exercise_fields(uuid, uuid) from public, anon, service_role;
grant execute on function app_private.catalog_effective_exercise_fields(uuid, uuid) to authenticated;

create function app_private.catalog_effective_workspace_exercise_fields(
  p_workspace_id uuid, p_workspace_exercise_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v integer;
  p jsonb;
  n text;
  r integer;
  ri smallint;
  rp jsonb;
  a jsonb := '[]'::jsonb;
begin
  if p_workspace_id is null or p_workspace_exercise_id is null
    or (not app_private.is_platform_owner()
      and not app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  select e.current_version into v from public.workspace_exercises e
    where e.workspace_id = p_workspace_id and e.id = p_workspace_exercise_id;
  if not found then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  select x.payload, x.notes, x.default_rest_time, x.default_rir, x.default_reps
    into p, n, r, ri, rp from public.workspace_exercise_versions x
    where x.workspace_id = p_workspace_id and x.workspace_exercise_id = p_workspace_exercise_id and x.version = v;
  select coalesce(jsonb_agg(jsonb_build_object('global_exercise_id', x.global_exercise_id,
    'workspace_exercise_id', x.alternative_workspace_exercise_id) order by x.position)
    filter (where (x.global_exercise_id is not null and g.lifecycle_state = 'active')
      or (x.alternative_workspace_exercise_id is not null and w.lifecycle_state = 'active')), '[]'::jsonb)
    into a from public.workspace_exercise_version_alternatives x
    left join public.exercises g on g.id = x.global_exercise_id
    left join public.workspace_exercises w on w.workspace_id = x.workspace_id and w.id = x.alternative_workspace_exercise_id
    where x.workspace_id = p_workspace_id and x.workspace_exercise_id = p_workspace_exercise_id and x.version = v;
  return jsonb_build_object(
    'name', jsonb_build_object('value', jsonb_build_object('name_en', p->'name_en', 'name_ar', p->'name_ar'),
      'source', case when p ? 'name_en' then 'workspace_private' else 'none' end),
    'description', jsonb_build_object('value', p->'description',
      'source', case when p ? 'description' then 'workspace_private' else 'none' end),
    'notes', jsonb_build_object('value', to_jsonb(n), 'source', case when n is not null then 'workspace_private' else 'none' end),
    'video', jsonb_build_object('value', p->'video_url', 'source', case when p ? 'video_url' then 'workspace_private' else 'none' end),
    'alternatives', jsonb_build_object('value', a, 'source', case when jsonb_array_length(a) > 0 then 'workspace_private' else 'none' end),
    'default_rest_time', jsonb_build_object('value', to_jsonb(r), 'source', case when r is not null then 'workspace_private' else 'none' end),
    'default_rir', jsonb_build_object('value', to_jsonb(ri), 'source', case when ri is not null then 'workspace_private' else 'none' end),
    'default_reps', jsonb_build_object('value', rp, 'source', case when rp is not null then 'workspace_private' else 'none' end)
  );
end;
$$;
alter function app_private.catalog_effective_workspace_exercise_fields(uuid, uuid) owner to postgres;
revoke all on function app_private.catalog_effective_workspace_exercise_fields(uuid, uuid) from public, anon, service_role;
grant execute on function app_private.catalog_effective_workspace_exercise_fields(uuid, uuid) to authenticated;

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
  page_limit integer := 50; cursor_id uuid; normalized_query text;
  muscle_filter text; equipment_filter jsonb; basis_filter text;
begin
  if kind in ('exercise', 'food') then
    if not app_private.catalog_can_read_global() then raise exception using errcode = '42501', message = 'not_permitted'; end if;
    if kind = 'exercise' and workspace_id is not null and not app_private.is_platform_owner()
      and not app_private.has_workspace_access(workspace_id, 'coaching_work') then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
  elsif kind in ('workspace_exercise', 'variation') then
    if workspace_id is null or not app_private.has_workspace_access(workspace_id, 'coaching_work') then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
  else raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if filters is null or jsonb_typeof(filters) <> 'object' then raise exception using errcode = '22023', message = 'invalid_filters'; end if;
  if filters ? 'page_size' then
    if filters->>'page_size' !~ '^[0-9]+$' then raise exception using errcode = '22023', message = 'invalid_page_size'; end if;
    page_limit := least(greatest((filters->>'page_size')::integer, 1), 50);
  end if;
  if "cursor" is not null then
    if "cursor" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'invalid_cursor'; end if;
    cursor_id := "cursor"::uuid;
  end if;
  normalized_query := nullif(app_private.normalize_ar_en_v1(coalesce(query, '')), '');
  muscle_filter := filters->>'primary_muscle_code';
  equipment_filter := filters->'equipment_codes';
  if equipment_filter is not null and jsonb_typeof(equipment_filter) <> 'array' then raise exception using errcode = '22023', message = 'invalid_equipment_codes'; end if;
  basis_filter := filters->>'basis';
  if kind = 'exercise' then
    return query
      select e.id, null::uuid, v.version,
        case when workspace_id is null then v.payload else
          v.payload || jsonb_build_object('effective_fields', app_private.catalog_effective_exercise_fields(workspace_id, e.id)) end,
        null::uuid, null::uuid
      from public.exercises e join public.exercise_versions v on v.exercise_id = e.id and v.version = e.current_version
      where e.lifecycle_state = 'active'
        and (normalized_query is null or v.name_norm_ar_v1 like '%' || normalized_query || '%'
          or v.name_norm_en_v1 like '%' || normalized_query || '%'
          or (v.name_norm_ar_v1 = '' and v.name_norm_en_v1 = '' and v.payload::text ilike '%' || query || '%'))
        and (muscle_filter is null or v.payload->>'primary_muscle_code' = muscle_filter)
        and (equipment_filter is null or coalesce(v.payload->'equipment_codes' ?| array(select jsonb_array_elements_text(equipment_filter)), false))
        and (cursor_id is null or e.id > cursor_id)
      order by e.id limit page_limit;
    return;
  elsif kind = 'food' then
    if normalized_query is null and basis_filter is null then
      return query with page as materialized (
        select f.id, f.current_version, f.created_by, f.origin_workspace_id from public.catalog_foods_safe f
        where f.lifecycle_state = 'active' and (cursor_id is null or f.id > cursor_id) order by f.id limit page_limit
      ) select page.id, null::uuid, v.version, v.payload, page.created_by, page.origin_workspace_id
        from page join public.food_versions v on v.food_id = page.id and v.version = page.current_version order by page.id;
      return;
    end if;
    return query select f.id, null::uuid, v.version, v.payload, f.created_by, f.origin_workspace_id
      from public.catalog_foods_safe f join public.food_versions v on v.food_id = f.id and v.version = f.current_version
      where f.lifecycle_state = 'active'
        and (normalized_query is null or v.name_norm_ar_v1 like '%' || normalized_query || '%' or v.name_norm_en_v1 like '%' || normalized_query || '%')
        and (basis_filter is null or v.basis = basis_filter) and (cursor_id is null or f.id > cursor_id)
      order by f.id limit page_limit;
    return;
  elsif kind = 'workspace_exercise' then
    return query select e.id, e.workspace_id, v.version,
      v.payload || jsonb_build_object('effective_fields', app_private.catalog_effective_workspace_exercise_fields(e.workspace_id, e.id)), null::uuid, null::uuid
      from public.workspace_exercises e join public.workspace_exercise_versions v
        on v.workspace_id = e.workspace_id and v.workspace_exercise_id = e.id and v.version = e.current_version
      where e.workspace_id = $5 and e.lifecycle_state = 'active'
        and (normalized_query is null or v.name_norm_ar_v1 like '%' || normalized_query || '%'
          or v.name_norm_en_v1 like '%' || normalized_query || '%'
          or (v.name_norm_ar_v1 = '' and v.name_norm_en_v1 = '' and v.payload::text ilike '%' || query || '%'))
        and (muscle_filter is null or v.payload->>'primary_muscle_code' = muscle_filter)
        and (equipment_filter is null or coalesce(v.payload->'equipment_codes' ?| array(select jsonb_array_elements_text(equipment_filter)), false))
        and (cursor_id is null or e.id > cursor_id)
      order by e.id limit page_limit;
    return;
  elsif kind = 'variation' then
    return query select e.exercise_id, e.workspace_id, v.version, v.payload, null::uuid, null::uuid
      from public.exercise_variations e join public.exercise_variation_versions v
        on v.workspace_id = e.workspace_id and v.exercise_id = e.exercise_id and v.version = e.current_version
      where e.workspace_id = $5 and e.lifecycle_state = 'active'
        and (normalized_query is null or v.payload::text ilike '%' || query || '%')
        and (cursor_id is null or e.exercise_id > cursor_id) order by e.exercise_id limit page_limit;
    return;
  end if;
  raise exception using errcode = '42501', message = 'not_permitted';
end;
$$;
alter function public.catalog_search(text, text, jsonb, text, uuid) owner to postgres;
revoke all on function public.catalog_search(text, text, jsonb, text, uuid) from public, anon, service_role;
grant execute on function public.catalog_search(text, text, jsonb, text, uuid) to authenticated;

create or replace function public.catalog_exercise_detail(p_exercise_id uuid, p_workspace_id uuid default null)
returns table (
  exercise_id uuid, version integer, payload jsonb, created_at timestamptz,
  created_by uuid, origin_workspace_id uuid, name_ar text, name_en text,
  requested_id uuid, survivor_id uuid, lifecycle_state text, variation jsonb,
  lifecycle_revision integer
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  requested public.catalog_exercises_safe%rowtype;
  survivor_id_value uuid;
  survivor public.catalog_exercises_safe%rowtype;
  variation_value jsonb;
begin
  if p_exercise_id is null or not app_private.catalog_can_read_global()
    or (p_workspace_id is not null and not app_private.is_platform_owner()
      and not app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  select e.* into requested from public.catalog_exercises_safe e where e.id = p_exercise_id;
  if not found then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  survivor_id_value := public.catalog_resolve_exercise_selection(p_exercise_id);
  if survivor_id_value is null and requested.lifecycle_state = 'removed' then survivor_id_value := requested.id; end if;
  if survivor_id_value is null then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  select e.* into survivor from public.catalog_exercises_safe e where e.id = survivor_id_value;
  if not found then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  if p_workspace_id is not null then
    begin
      select jsonb_build_object('workspace_id', v.workspace_id, 'video_url', v.video_url)
        into variation_value from public.catalog_resolve_exercise_video(survivor_id_value, p_workspace_id) v
        where v.exercise_id = survivor_id_value and v.workspace_id = p_workspace_id;
    exception when sqlstate '42501' then variation_value := null;
    end;
  end if;
  return query
    select v.exercise_id, v.version,
      v.payload || jsonb_build_object('effective_fields', app_private.catalog_effective_exercise_fields(p_workspace_id, survivor_id_value)),
      v.created_at, v.created_by, v.origin_workspace_id, v.name_ar, v.name_en, p_exercise_id,
      survivor_id_value, survivor.lifecycle_state, variation_value, survivor.lifecycle_revision
    from public.catalog_exercise_versions_safe v
    where v.exercise_id = survivor_id_value and v.version = survivor.current_version;
end;
$$;
alter function public.catalog_exercise_detail(uuid, uuid) owner to postgres;
revoke all on function public.catalog_exercise_detail(uuid, uuid) from public, anon, service_role;
grant execute on function public.catalog_exercise_detail(uuid, uuid) to authenticated;
