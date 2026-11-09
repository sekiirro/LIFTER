create function public.read_form_correction_context(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  assigned_user uuid;
  assignment_workspace_id uuid;
  correction_context jsonb;
  role public.staff_role;
begin
  if actor is null or p_assignment_id is null then return null; end if;
  select a.workspace_id,c.auth_user_id,
    jsonb_build_object('workspace_id',a.workspace_id,'version_snapshot',a.version_snapshot)
  into assignment_workspace_id,assigned_user,correction_context
  from public.form_assignments a
  join public.clients c on c.workspace_id=a.workspace_id and c.id=a.client_id
  where a.id=p_assignment_id and c.approval_state='approved';
  if not found then return null; end if;
  if assigned_user is distinct from actor then
    role:=app_private.current_staff_role();
    if role is null
      or not app_private.role_has_capability(role,'read_form_answers')
      or not app_private.has_workspace_access(assignment_workspace_id,'read_form_answers') then
      return null;
    end if;
  end if;
  return correction_context;
end $$;
alter function public.read_form_correction_context(uuid) owner to postgres;
revoke all on function public.read_form_correction_context(uuid)
  from public,anon,service_role;
grant execute on function public.read_form_correction_context(uuid)
  to authenticated;
