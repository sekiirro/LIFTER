-- F14 manage_branding is PO-global and WO-own-workspace through has_workspace_access.
-- Shared capability membership remains role-only; the workspace gate stays independent.
create or replace function app_private.role_has_capability(
  r public.staff_role,
  cap text
) returns boolean
language sql immutable security definer set search_path = '' as $$
  select coalesce(case
    when cap in (
      'set_package_pricing',
      'record_refund',
      'delete_client',
      'export_client_dataset',
      'manage_workspaces',
      'manage_staff_access'
    ) then r = 'platform_owner'::public.staff_role
    when cap = 'generate_registration_link'
      then r in ('platform_owner', 'workspace_owner', 'sales', 'trainer')
    when cap in ('configure_installment_schedule', 'record_payment', 'manage_freeze')
      then r in ('platform_owner', 'workspace_owner', 'sales')
    when cap in ('generate_recovery_link', 'approve_registration', 'manage_branding')
      then r in ('platform_owner', 'workspace_owner')
    when cap = 'coaching_work'
      then r in ('platform_owner', 'workspace_owner', 'trainer')
    else false
  end, false);
$$;

alter function app_private.role_has_capability(public.staff_role, text) owner to postgres;
revoke all on function app_private.role_has_capability(public.staff_role, text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.role_has_capability(public.staff_role, text)
  to authenticated;
