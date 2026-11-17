-- F10 T035 / S31-PO-3 (FR-006): approved issuance limit.
-- 50 links per authorized issuing account per rolling 24 hours, across all
-- workspaces, Trainer/WO/PO included, no exceptions and no per-workspace reset.
-- Forward-only: replaces only the body of the private limit function that the
-- existing issue_registration_link RPC reads after taking the per-actor
-- advisory lock (atomic count-then-insert). The previous 20/hour value was a
-- local placeholder. CREATE OR REPLACE keeps owner, grants and dependents.
create or replace function app_private.registration_link_limits() returns table(per_actor integer,win interval)
language sql immutable set search_path='' as $$
  -- S31-PO-3 (ND-F10-3): PO-approved value. Change only via a new approved migration.
  select 50, interval '24 hours'
$$;
revoke execute on function app_private.registration_link_limits() from public,anon,authenticated,service_role;
alter function app_private.registration_link_limits() owner to postgres;
