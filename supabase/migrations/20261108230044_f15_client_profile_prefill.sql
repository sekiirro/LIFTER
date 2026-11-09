-- Return signup-derived profile fields only through the authenticated client's
-- own assignment-context RPC. Clients have no direct table grants on clients.
create or replace function public.read_form_assignment_context(p_assignment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  context jsonb;
begin
  if auth.uid() is null or p_assignment_id is null then return null; end if;
  select jsonb_build_object(
    'workspace_id',a.workspace_id,
    'version_snapshot',a.version_snapshot,
    'signup_profile',jsonb_build_object(
      'full_name',c.name,
      'date_of_birth',c.date_of_birth
    )
  ) into context
  from public.form_assignments a
  join public.clients c on c.workspace_id=a.workspace_id and c.id=a.client_id
  where a.id=p_assignment_id and c.auth_user_id=auth.uid() and c.approval_state='approved';
  return context;
end
$$;
alter function public.read_form_assignment_context(uuid) owner to postgres;
revoke all on function public.read_form_assignment_context(uuid) from public, anon, service_role;
grant execute on function public.read_form_assignment_context(uuid) to authenticated;
