-- Migration: 20261225190000_p7_channels_audit_exclusion.sql
-- T032: Narrow audit_events_select_scoped to exclude P7 audit events from workspace owners and other non-PO roles.
-- PO retains unrestricted visibility across all workspace audit events.
-- WO retains full visibility for non-P7 workspace audit events.
-- P7 events are excluded by action prefix 'workforce.' and target tables 'p7_%' and 'workforce_checkin_transitions'.

alter policy audit_events_select_scoped on public.audit_events
  using (
    app_private.is_platform_owner()
    or (
      workspace_id is not null
      and app_private.current_staff_role() = 'workspace_owner'::public.staff_role
      and app_private.has_workspace_access(workspace_id, null)
      and (action not like 'workforce.%')
      and (target_table is null or (target_table not like 'p7_%' and target_table <> 'workforce_checkin_transitions'))
    )
  );
