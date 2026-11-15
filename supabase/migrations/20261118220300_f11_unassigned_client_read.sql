create function public.unassigned_clients(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  clients jsonb;
begin
  if actor is null or not (
    app_private.is_platform_owner()
    or exists (
      select 1
      from public.workspace_memberships m
      join public.staff_profiles p on p.user_id = m.user_id
      where m.workspace_id = p_workspace_id
        and m.user_id = actor
        and m.revoked_at is null
        and p.role = 'workspace_owner'
    )
  ) then
    return jsonb_build_object('status', 'not_permitted');
  end if;

  if p_workspace_id is null then
    return jsonb_build_object('status', 'invalid_input');
  end if;

  select coalesce(jsonb_agg(c.id order by c.id), '[]'::jsonb)
    into clients
  from public.clients c
  where c.workspace_id = p_workspace_id
    and c.approval_state = 'approved'
    and app_private.current_assigned_trainer(c.workspace_id, c.id) is null;

  return jsonb_build_object('status', 'ok', 'client_ids', clients);
end
$$;

alter function public.unassigned_clients(uuid) owner to postgres;
revoke all on function public.unassigned_clients(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.unassigned_clients(uuid) to authenticated;

comment on function public.unassigned_clients(uuid) is
  'FR-027: approved clients without a current responsible Trainer; Platform Owners may read across workspaces and Workspace Owners may read only their own workspace. T048 must add the deletion-lifecycle exclusion when those states are introduced.';
