-- P7 T030/T031: P7 earned facts stay outside client deletion; tied P7 rows
-- participate in the existing F26 traversal and row-count assertion.
insert into app_private.retention_purge_allowlist(table_oid, can_delete, can_update, traverse)
values ('app_private.workforce_checkin_transitions'::regclass, true, false, true)
on conflict (table_oid) do update
  set can_delete = excluded.can_delete,
      can_update = excluded.can_update,
      traverse = excluded.traverse;

-- Extension seam for a persisted follow-up dispute relation. Main has no
-- dispute/review table, so this remains false until that approved model exists.
create function app_private.p7_retention_has_open_dispute(
  p_workspace_id uuid, p_client_id uuid
) returns boolean
language sql stable security invoker set search_path = '' as $$
  select false
$$;
alter function app_private.p7_retention_has_open_dispute(uuid,uuid) owner to postgres;
revoke all on function app_private.p7_retention_has_open_dispute(uuid,uuid)
  from public, anon, authenticated, service_role;

comment on function app_private.p7_retention_has_open_dispute(uuid,uuid) is
  'F26 extension point: consult the persisted P7 follow-up dispute model when it exists; no dispute model exists on main.';

-- Preserve F26 eligibility and attach the P7 hold check to every client-tied
-- candidate class. Audit candidates have no client id and remain independent.
alter function app_private.purge_retention_candidates(timestamptz)
  rename to purge_retention_candidates_pre_p7_dispute_hold;

create function app_private.purge_retention_candidates(p_sampled_at timestamptz)
returns table(data_class text, workspace_id uuid, record_id text, client_id uuid)
language sql stable security invoker set search_path = '' as $$
  select candidate.data_class, candidate.workspace_id, candidate.record_id, candidate.client_id
  from app_private.purge_retention_candidates_pre_p7_dispute_hold(p_sampled_at) candidate
  where candidate.client_id is null
    or not app_private.p7_retention_has_open_dispute(candidate.workspace_id, candidate.client_id)
$$;
alter function app_private.purge_retention_candidates(timestamptz) owner to postgres;
revoke all on function app_private.purge_retention_candidates(timestamptz)
  from public, anon, authenticated, service_role;
