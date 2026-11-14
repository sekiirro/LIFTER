-- Keep workspace-private Exercise Detail Alternatives aligned with the
-- current active-target view used for workspace library and new selection.
create or replace function public.catalog_workspace_exercise_detail(p_workspace_id uuid, p_exercise_id uuid)
returns table (
  exercise_id uuid, version integer, payload jsonb, created_at timestamptz,
  created_by uuid, origin_workspace_id uuid, name_ar text, name_en text,
  requested_id uuid, survivor_id uuid, lifecycle_state text, variation jsonb,
  lifecycle_revision integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  current_version integer;
  state_value text;
  revision_value integer;
  payload_value jsonb;
  created_value timestamptz;
  video_value text;
  alternatives_value jsonb;
begin
  if auth.uid() is null or p_workspace_id is null or p_exercise_id is null
    or (not app_private.is_platform_owner()
      and not app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  select e.current_version, e.lifecycle_state, e.lifecycle_revision
    into current_version, state_value, revision_value
    from public.workspace_exercises e
    where e.workspace_id = p_workspace_id and e.id = p_exercise_id;
  if not found then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  select v.payload, v.created_at into payload_value, created_value
    from public.workspace_exercise_versions v
    where v.workspace_id = p_workspace_id and v.workspace_exercise_id = p_exercise_id
      and v.version = current_version;
  if not found then raise exception using errcode = '42501', message = 'not_permitted'; end if;

  -- Removed and merged targets remain frozen in their source version, but are
  -- unavailable on current library/detail reads. Never substitute a survivor.
  if jsonb_typeof(payload_value -> 'alternatives') = 'array' then
    select coalesce(jsonb_agg(a.value order by a.ordinality), '[]'::jsonb)
      into alternatives_value
      from jsonb_array_elements(payload_value -> 'alternatives') with ordinality a(value, ordinality)
      where (a.value ? 'global_exercise_id' and exists (
          select 1 from public.exercises target
          where target.id = (a.value ->> 'global_exercise_id')::uuid
            and target.lifecycle_state = 'active'
        ))
        or (a.value ? 'workspace_exercise_id' and exists (
          select 1 from public.workspace_exercises target
          where target.workspace_id = p_workspace_id
            and target.id = (a.value ->> 'workspace_exercise_id')::uuid
            and target.lifecycle_state = 'active'
        ));
    payload_value := jsonb_set(
      payload_value, '{alternatives}', alternatives_value, true
    );
  end if;

  select r.video_url into video_value
    from app_private.catalog_resolve_workspace_exercise_video(p_workspace_id, p_exercise_id, false) r;
  if video_value is not null or payload_value ? 'video_url' then
    payload_value := pg_catalog.jsonb_set(
      payload_value, '{video_url}', coalesce(pg_catalog.to_jsonb(video_value), 'null'::jsonb), true
    );
  end if;

  return query select p_exercise_id, current_version, payload_value, created_value,
    null::uuid, null::uuid, payload_value ->> 'name_ar', payload_value ->> 'name_en',
    p_exercise_id, p_exercise_id, state_value, null::jsonb, revision_value;
end;
$$;
alter function public.catalog_workspace_exercise_detail(uuid, uuid) owner to postgres;
revoke all on function public.catalog_workspace_exercise_detail(uuid, uuid) from public, anon, service_role;
grant execute on function public.catalog_workspace_exercise_detail(uuid, uuid) to authenticated;
