-- Revalidate the selecting staff member after the assignment advisory lock wait.
create or replace function public.select_intake_form(
  p_workspace_id uuid,
  p_client_id uuid,
  p_form_id uuid,
  p_version_number integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  role public.staff_role;
  existing app_private.form_assignment_selections%rowtype;
  outcome text;
begin
  if auth.uid() is null or p_workspace_id is null or p_client_id is null
    or p_form_id is null or p_version_number is null then
    return '{"status":"not_found"}'::jsonb;
  end if;
  role := app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role, 'assign_intake_form')
    or not app_private.has_workspace_access(p_workspace_id, 'assign_intake_form') then
    return '{"status":"not_found"}'::jsonb;
  end if;
  if not exists (
    select 1 from public.clients c where c.workspace_id=p_workspace_id and c.id=p_client_id
  ) or not exists (
    select 1 from public.form_versions v
    where v.workspace_id=p_workspace_id and v.form_id=p_form_id
      and v.version_number=p_version_number and v.status='published'
      and app_private.f15_current_terms_policy(v.terms_policy_version)
  ) then return '{"status":"not_found"}'::jsonb; end if;

  insert into app_private.form_assignment_selections(
    workspace_id, client_id, form_id, version_number, terms_policy_version, selected_by
  ) select p_workspace_id, p_client_id, v.form_id, v.version_number, v.terms_policy_version, auth.uid()
    from public.form_versions v
    where v.workspace_id=p_workspace_id and v.form_id=p_form_id
      and v.version_number=p_version_number and v.status='published'
    on conflict (workspace_id, client_id) do nothing;

  if not found then
    select s.* into existing from app_private.form_assignment_selections s
    where s.workspace_id=p_workspace_id and s.client_id=p_client_id;
    if existing.form_id is distinct from p_form_id
      or existing.version_number is distinct from p_version_number then
      return '{"status":"conflict"}'::jsonb;
    end if;
  end if;
  outcome := app_private.reconcile_f15_form_assignment(p_workspace_id, p_client_id);
  -- PostgreSQL obtains a fresh READ COMMITTED snapshot after the advisory wait.
  -- A changed authorization must abort this statement so none of its facts commit.
  role := app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role, 'assign_intake_form')
    or not app_private.has_workspace_access(p_workspace_id, 'assign_intake_form') then
    raise exception 'selection authorization changed while waiting';
  end if;
  if outcome = 'already_assigned' then outcome := 'assigned'; end if;
  return jsonb_build_object('status', outcome);
exception when others then
  return '{"status":"unavailable"}'::jsonb;
end
$$;
alter function public.select_intake_form(uuid,uuid,uuid,integer) owner to postgres;
revoke all on function public.select_intake_form(uuid,uuid,uuid,integer) from public, anon, service_role;
grant execute on function public.select_intake_form(uuid,uuid,uuid,integer) to authenticated;
