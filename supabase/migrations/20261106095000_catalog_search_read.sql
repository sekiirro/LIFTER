-- F16 T004/T005: authenticated read boundary for global catalog entries and
-- explicitly selected workspace exercise data.
create function public.catalog_search(
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
begin
  if kind = 'exercise' then
    if not app_private.catalog_can_read_global() then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    return query
      select e.id, null::uuid, v.version, v.payload, null::uuid, null::uuid
      from public.exercises e
      join public.exercise_versions v on v.exercise_id = e.id and v.version = e.current_version
      where e.lifecycle_state = 'active'
        and (query is null or v.payload::text ilike '%' || query || '%')
      order by e.id
      limit 50;
    return;
  elsif kind = 'food' then
    if not app_private.catalog_can_read_global() then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    return query
      select f.id, null::uuid, v.version, v.payload, v.created_by, v.origin_workspace_id
      from public.catalog_foods_safe f
      join public.catalog_food_versions_safe v on v.food_id = f.id and v.version = f.current_version
      where f.lifecycle_state = 'active'
        and (query is null or (coalesce(v.name_ar, '') || ' ' || coalesce(v.name_en, '')) ilike '%' || query || '%')
      order by f.id
      limit 50;
    return;
  elsif kind = 'workspace_exercise' then
    if $5 is null or not app_private.has_workspace_access($5, 'coaching_work') then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    return query
      select e.id, e.workspace_id, v.version, v.payload, null::uuid, null::uuid
      from public.workspace_exercises e
      join public.workspace_exercise_versions v
        on v.workspace_id = e.workspace_id and v.workspace_exercise_id = e.id and v.version = e.current_version
      where e.workspace_id = $5 and e.lifecycle_state = 'active'
        and (query is null or v.payload::text ilike '%' || query || '%')
      order by e.id
      limit 50;
    return;
  elsif kind = 'variation' then
    if $5 is null or not app_private.has_workspace_access($5, 'coaching_work') then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    return query
      select e.exercise_id, e.workspace_id, v.version, v.payload, null::uuid, null::uuid
      from public.exercise_variations e
      join public.exercise_variation_versions v
        on v.workspace_id = e.workspace_id and v.exercise_id = e.exercise_id and v.version = e.current_version
      where e.workspace_id = $5 and e.lifecycle_state = 'active'
        and (query is null or v.payload::text ilike '%' || query || '%')
      order by e.exercise_id
      limit 50;
    return;
  end if;

  raise exception using errcode = '42501', message = 'not_permitted';
end;
$$;
alter function public.catalog_search(text, text, jsonb, text, uuid) owner to postgres;
revoke all on function public.catalog_search(text, text, jsonb, text, uuid) from public, anon, service_role;
grant execute on function public.catalog_search(text, text, jsonb, text, uuid) to authenticated;
