-- Restore the pre-cutover invoker boundary. Only the compatibility variation
-- projection needs a narrowly scoped owner-rights read after T054.
create or replace function app_private.catalog_search_variation(
  p_query text, p_filters jsonb, p_cursor text, p_workspace_id uuid
) returns table (
  result_id uuid, result_workspace_id uuid, result_version integer,
  result_payload jsonb, result_created_by uuid, result_origin_workspace_id uuid
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_workspace_id is null or auth.uid() is null
    or (not app_private.is_platform_owner()
      and not app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  return query
    select found.result_id, p_workspace_id, override.current_version,
      found.result_payload, null::uuid, null::uuid
    from app_private.catalog_search_pre_cutover(
      'exercise', p_query, p_filters, p_cursor, p_workspace_id
    ) found
    join public.exercise_overrides override
      on override.workspace_id = p_workspace_id and override.exercise_id = found.result_id
    where found.result_workspace_id is null
      and (found.result_payload #>> '{effective_fields,video,source}' = 'override'
        or found.result_payload #>> '{effective_fields,notes,source}' = 'override');
end;
$$;
alter function app_private.catalog_search_variation(text, jsonb, text, uuid) owner to postgres;
revoke all on function app_private.catalog_search_variation(text, jsonb, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.catalog_search_variation(text, jsonb, text, uuid) to authenticated;

-- This helper remains SECURITY INVOKER. The authenticated grant is required
-- when this function is called by the public invoker RPC; its own workspace
-- authorization and row-level policies remain in force.
grant execute on function app_private.catalog_search_pre_cutover(text, text, jsonb, text, uuid)
  to authenticated;

create or replace function public.catalog_search(
  kind text, query text default null, filters jsonb default '{}'::jsonb,
  "cursor" text default null, workspace_id uuid default null
) returns table (
  result_id uuid, result_workspace_id uuid, result_version integer,
  result_payload jsonb, result_created_by uuid, result_origin_workspace_id uuid
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if kind = 'variation' then
    return query select * from app_private.catalog_search_variation(query, filters, "cursor", workspace_id);
    return;
  end if;
  if kind in ('exercise', 'food') then
    if not app_private.catalog_can_read_global() then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    if kind = 'exercise' and workspace_id is not null
      and not app_private.is_platform_owner()
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
  return query select * from app_private.catalog_search_pre_cutover(kind, query, filters, "cursor", workspace_id);
end;
$$;
alter function public.catalog_search(text, text, jsonb, text, uuid) owner to postgres;
alter function public.catalog_search(text, text, jsonb, text, uuid) security invoker;
revoke all on function public.catalog_search(text, text, jsonb, text, uuid) from public, anon, service_role;
grant execute on function public.catalog_search(text, text, jsonb, text, uuid) to authenticated;
