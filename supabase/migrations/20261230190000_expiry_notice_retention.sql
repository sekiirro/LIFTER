-- Spec 028 T017 (FR-011 / SC-006): extend F26's existing purge allowlist and
-- eligibility orchestration for expiry notice rows and their linked client IDs.
-- No new purge, scheduler, cron activation or retention clock is introduced.
-- The F26 refund hold (app_private.refund_auth_lockouts.status pending/retry,
-- succeeded restarts the full 30 days) and the separate audit creation clock
-- stay authoritative. Feature 028 adds no dispute-derived hold.

insert into app_private.retention_purge_allowlist(table_oid, can_delete, can_update, traverse)
values
  ('app_private.client_inbox_notices'::regclass, true, false, true),
  ('app_private.staff_inbox_notices'::regclass, true, false, true)
on conflict (table_oid) do update
  set can_delete = excluded.can_delete,
      can_update = excluded.can_update,
      traverse = excluded.traverse;

-- Preserve the latest F26/P7 eligibility body byte-for-byte under a new name,
-- then add only the notice-row classes. The P7 wrapper remains in force for
-- every class, so no dispute hold is added or removed by feature 028.
alter function app_private.purge_retention_candidates(timestamptz)
  rename to purge_retention_candidates_pre_028_notices;

create function app_private.purge_retention_candidates(p_sampled_at timestamptz)
returns table(data_class text, workspace_id uuid, record_id text, client_id uuid)
language sql stable security invoker set search_path = '' as $$
  select base.data_class, base.workspace_id, base.record_id, base.client_id
  from app_private.purge_retention_candidates_pre_028_notices(p_sampled_at) base
  union all
  select 'client_notice'::text, n.workspace_id, n.id::text, n.client_id
  from app_private.client_inbox_notices n
  where exists (
    select 1 from app_private.purge_retention_candidates_pre_028_notices(p_sampled_at) c
    where c.data_class = 'client'
      and c.workspace_id = n.workspace_id
      and c.client_id = n.client_id
  )
  union all
  select 'staff_notice'::text, n.workspace_id, n.id::text, n.client_id
  from app_private.staff_inbox_notices n
  where exists (
    select 1 from app_private.purge_retention_candidates_pre_028_notices(p_sampled_at) c
    where c.data_class = 'client'
      and c.workspace_id = n.workspace_id
      and c.client_id = n.client_id
  )
$$;
alter function app_private.purge_retention_candidates(timestamptz) owner to postgres;
revoke all on function app_private.purge_retention_candidates(timestamptz)
  from public, anon, authenticated, service_role;
comment on function app_private.purge_retention_candidates(timestamptz) is
  'F26 classes plus 028 notice-row IDs linked to an eligible closed client; no dispute hold is added.';
