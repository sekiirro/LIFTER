-- T022 forward fix: qualify PL/pgSQL state names so they cannot resolve to
-- table columns with the same names.
create or replace function public.read_client_intake_destination() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target_workspace_id uuid;
  target_client_id uuid;
  target_assignment_id uuid;
  assignment_count integer;
begin
  if auth.uid() is null then return null; end if;

  select c.workspace_id, c.id into target_workspace_id, target_client_id
  from public.clients c
  where c.auth_user_id=auth.uid() and c.approval_state='approved';
  if not found then return null; end if;

  select count(*)::integer, (array_agg(a.id order by a.id))[1]
    into assignment_count, target_assignment_id
  from public.form_assignments a
  where a.workspace_id=target_workspace_id and a.client_id=target_client_id
    and not exists (
      select 1 from app_private.form_submissions s
      where s.workspace_id=a.workspace_id and s.assignment_id=a.id
    );

  if assignment_count=1 then
    return jsonb_build_object('status','ok','assignment_id',target_assignment_id);
  end if;
  return jsonb_build_object('status','ok','assignment_id',null);
end
$$;
alter function public.read_client_intake_destination() owner to postgres;
revoke all on function public.read_client_intake_destination() from public,anon,service_role;
grant execute on function public.read_client_intake_destination() to authenticated;
