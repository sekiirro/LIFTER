-- Return the workspace override revision from the same detail snapshot as the
-- effective payload so the editor cannot pair stale fields with a newer ETag.
drop function public.catalog_exercise_detail(uuid, uuid);

create function public.catalog_exercise_detail(p_exercise_id uuid, p_workspace_id uuid default null)
returns table (
  exercise_id uuid, version integer, payload jsonb, created_at timestamptz,
  created_by uuid, origin_workspace_id uuid, name_ar text, name_en text,
  requested_id uuid, survivor_id uuid, lifecycle_state text, variation jsonb,
  lifecycle_revision integer, override_version integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  requested public.catalog_exercises_safe%rowtype;
  survivor_id_value uuid;
  survivor public.catalog_exercises_safe%rowtype;
  variation_value jsonb;
  override_version_value integer;
begin
  if p_exercise_id is null or not app_private.catalog_can_read_global()
    or (p_workspace_id is not null and not app_private.is_platform_owner()
      and not app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  select e.* into requested from public.catalog_exercises_safe e where e.id = p_exercise_id;
  if not found then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  survivor_id_value := public.catalog_resolve_exercise_selection(p_exercise_id);
  if survivor_id_value is null and requested.lifecycle_state = 'removed' then
    survivor_id_value := requested.id;
  end if;
  if survivor_id_value is null then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  select e.* into survivor from public.catalog_exercises_safe e where e.id = survivor_id_value;
  if not found then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  if p_workspace_id is not null then
    select o.current_version into override_version_value
      from public.exercise_overrides o
      where o.workspace_id = p_workspace_id and o.exercise_id = survivor_id_value;
    select jsonb_build_object(
      'workspace_id', v.workspace_id,
      'video_url', v.video_url,
      'source', v.source
    ) into variation_value
    from app_private.catalog_resolve_exercise_video(survivor_id_value, p_workspace_id, false) v
    where v.exercise_id = survivor_id_value and v.workspace_id = p_workspace_id;
  end if;
  return query
    select v.exercise_id, v.version,
      v.payload || jsonb_build_object('effective_fields', app_private.catalog_effective_exercise_fields(p_workspace_id, survivor_id_value)),
      v.created_at, v.created_by, v.origin_workspace_id, v.name_ar, v.name_en, p_exercise_id,
      survivor_id_value, survivor.lifecycle_state, variation_value, survivor.lifecycle_revision,
      override_version_value
    from public.catalog_exercise_versions_safe v
    where v.exercise_id = survivor_id_value and v.version = survivor.current_version;
end;
$$;
alter function public.catalog_exercise_detail(uuid, uuid) owner to postgres;
revoke all on function public.catalog_exercise_detail(uuid, uuid) from public, anon, service_role;
grant execute on function public.catalog_exercise_detail(uuid, uuid) to authenticated;
