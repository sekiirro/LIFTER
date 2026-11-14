-- Return the variation editor's effective fields with the CAS revision from a
-- single authorized database snapshot when the compatibility search hides an
-- override that only customizes other exercise fields.
create function public.catalog_workspace_variation_editor_state(
  p_workspace_id uuid,
  p_exercise_id uuid
) returns table (
  version integer,
  video_url text,
  notes text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Keep the explicit workspace authorization before argument validation or
  -- any exercise lookup; do not reveal cross-workspace catalog state.
  if auth.uid() is null
    or p_workspace_id is null
    or (not app_private.is_platform_owner()
      and not app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  if p_exercise_id is null then
    raise exception using errcode = '22023', message = 'invalid_exercise_id';
  end if;

  if not exists (
    select 1 from public.exercises e
    where e.id = p_exercise_id and e.lifecycle_state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  -- STABLE RPC reads share the calling statement's snapshot. The current
  -- override version and the effective Video/Notes values therefore cannot be
  -- paired across two concurrent revisions.
  return query
    select coalesce(o.current_version, 0),
      fields.value->'video'->>'value',
      fields.value->'notes'->>'value'
    from public.exercises e
    left join public.exercise_overrides o
      on o.workspace_id = p_workspace_id and o.exercise_id = e.id
    cross join lateral (
      select app_private.catalog_effective_exercise_fields(
        p_workspace_id, p_exercise_id
      ) as value
    ) fields
    where e.id = p_exercise_id
      and e.lifecycle_state = 'active';
end;
$$;

alter function public.catalog_workspace_variation_editor_state(uuid, uuid)
  owner to postgres;
revoke all on function public.catalog_workspace_variation_editor_state(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.catalog_workspace_variation_editor_state(uuid, uuid)
  to authenticated;
