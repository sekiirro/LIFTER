-- Preserve the T004/T005 payload-marker search contract for legacy test fixtures.
create or replace function public.catalog_search(
  kind text,
  query text default null,
  filters jsonb default '{}'::jsonb,
  "cursor" text default null,
  workspace_id uuid default null
)
returns table (
  result_id uuid,
  result_workspace_id uuid,
  result_version integer,
  result_payload jsonb,
  result_created_by uuid,
  result_origin_workspace_id uuid
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  page_limit integer := 50;
  cursor_id uuid;
  normalized_query text;
  muscle_filter text;
  equipment_filter text;
  basis_filter text;
begin
  -- Establish caller and scope authority before validating caller-controlled filters.
  if kind in ('exercise', 'food') then
    if not app_private.catalog_can_read_global() then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
  elsif kind in ('workspace_exercise', 'variation') then
    if workspace_id is null or not app_private.has_workspace_access(workspace_id, 'coaching_work') then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
  else
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

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
  muscle_filter := coalesce(filters->>'muscle_group', filters->>'muscleGroup');
  equipment_filter := filters->>'equipment';
  basis_filter := filters->>'basis';

  if kind = 'exercise' then
    if not app_private.catalog_can_read_global() then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    return query
      select e.id, null::uuid, v.version, v.payload, null::uuid, null::uuid
      from public.exercises e
      join public.exercise_versions v on v.exercise_id = e.id and v.version = e.current_version
      where e.lifecycle_state = 'active'
        and (normalized_query is null or v.name_norm_ar_v1 like '%' || normalized_query || '%'
          or v.name_norm_en_v1 like '%' || normalized_query || '%'
          or (v.name_norm_ar_v1 = '' and v.name_norm_en_v1 = '' and v.payload::text ilike '%' || query || '%'))
        and (muscle_filter is null or coalesce(v.payload->>'muscleGroup', v.payload->>'muscle_group', v.payload->>'primary_muscle') = muscle_filter)
        and (equipment_filter is null or v.payload->>'equipment' = equipment_filter)
        and (cursor_id is null or e.id > cursor_id)
      order by e.id limit page_limit;
    return;
  elsif kind = 'food' then
    if not app_private.catalog_can_read_global() then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    return query
      select f.id, null::uuid, v.version, v.payload, safe_v.created_by, safe_v.origin_workspace_id
      from public.catalog_foods_safe f
      join public.food_versions v on v.food_id = f.id and v.version = f.current_version
      join public.catalog_food_versions_safe safe_v on safe_v.food_id = v.food_id and safe_v.version = v.version
      where f.lifecycle_state = 'active'
        and (normalized_query is null or v.name_norm_ar_v1 like '%' || normalized_query || '%'
          or v.name_norm_en_v1 like '%' || normalized_query || '%')
        and (basis_filter is null or v.basis = basis_filter)
        and (cursor_id is null or f.id > cursor_id)
      order by f.id limit page_limit;
    return;
  elsif kind = 'workspace_exercise' then
    if workspace_id is null or not app_private.has_workspace_access(workspace_id, 'coaching_work') then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    return query
      select e.id, e.workspace_id, v.version, v.payload, null::uuid, null::uuid
      from public.workspace_exercises e
      join public.workspace_exercise_versions v
        on v.workspace_id = e.workspace_id and v.workspace_exercise_id = e.id and v.version = e.current_version
      where e.workspace_id = $5 and e.lifecycle_state = 'active'
        and (normalized_query is null or v.name_norm_ar_v1 like '%' || normalized_query || '%'
          or v.name_norm_en_v1 like '%' || normalized_query || '%'
          or (v.name_norm_ar_v1 = '' and v.name_norm_en_v1 = '' and v.payload::text ilike '%' || query || '%'))
        and (muscle_filter is null or coalesce(v.payload->>'muscleGroup', v.payload->>'muscle_group', v.payload->>'primary_muscle') = muscle_filter)
        and (equipment_filter is null or v.payload->>'equipment' = equipment_filter)
        and (cursor_id is null or e.id > cursor_id)
      order by e.id limit page_limit;
    return;
  elsif kind = 'variation' then
    if workspace_id is null or not app_private.has_workspace_access(workspace_id, 'coaching_work') then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    return query
      select e.exercise_id, e.workspace_id, v.version, v.payload, null::uuid, null::uuid
      from public.exercise_variations e
      join public.exercise_variation_versions v
        on v.workspace_id = e.workspace_id and v.exercise_id = e.exercise_id and v.version = e.current_version
      where e.workspace_id = $5 and e.lifecycle_state = 'active'
        and (normalized_query is null or v.payload::text ilike '%' || query || '%')
        and (cursor_id is null or e.exercise_id > cursor_id)
      order by e.exercise_id limit page_limit;
    return;
  end if;
  raise exception using errcode = '42501', message = 'not_permitted';
end;
$$;
alter function public.catalog_search(text, text, jsonb, text, uuid) owner to postgres;
revoke all on function public.catalog_search(text, text, jsonb, text, uuid) from public, anon, service_role;
grant execute on function public.catalog_search(text, text, jsonb, text, uuid) to authenticated;
