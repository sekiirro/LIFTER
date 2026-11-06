# Implementation Plan: Append-only Audit Log (P0-F5)

**Branch**: `005-audit-log` (stacked on `003-tenancy-rls`) | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

## Summary

This feature is one forward migration. It adds:

- **`public.audit_events`**, append-only. A guard trigger rejects UPDATE and DELETE, and a statement-level trigger rejects TRUNCATE. API roles have no INSERT, UPDATE or DELETE grant. Forced RLS lets the PO read everything and a WO read their own workspaces' events.
- **A generic `SECURITY DEFINER` trigger function**, `app_private.audit_row_change()`. It is attached AFTER INSERT/UPDATE to `workspaces`, `staff_profiles` and `workspace_memberships`. It derives the action, target and workspace from the table, and writes an allow-listed details object.
- **A documented attach helper pattern** for later tables.

Integration tests extend the F3 harness.

## Technical Context

Same as F3: Supabase Postgres 17, the F3 harness, Vitest integration. No new dependencies. Local verification is run by the reviewer (Docker), and the Linux CI `integration` job is mandatory.

## Design

- `audit_events(id bigint generated always as identity PK, occurred_at timestamptz default now(), actor_user_id uuid null, action text CHECK '^[a-z_]+\.[a-z_]+$', target_table text, target_id uuid, workspace_id uuid null REFERENCES workspaces(id), details jsonb not null default '{}' CHECK jsonb_typeof = 'object')`. Index on `(workspace_id, occurred_at desc)`.
- Actor = `auth.uid()` (null when there is no JWT, i.e. service or maintenance).
- Action mapping:
  - workspaces INSERT → `workspace.created`; UPDATE → `workspace.updated`, with details `{changed: {col: {from, to}}}` for name and slug.
  - staff_profiles INSERT → `staff_role.assigned` `{role}`; UPDATE of role → `staff_role.changed` `{from, to}`.
  - workspace_memberships INSERT → `membership.granted` `{user_id}`; UPDATE that sets revoked_at → `membership.revoked` `{user_id}`.
  - An UPDATE with no audited column change writes no event.
- The details allow-list is hard-coded per table in the function. No `to_jsonb(NEW)` dump, so future PII columns can't leak.
- Tamper guard: `app_private.audit_events_immutable()` raises on UPDATE and DELETE (row level) and on TRUNCATE (statement level). Triggers fire for the service role too. Grants: revoke all from anon, authenticated and service_role except SELECT for authenticated. Inserts come only from the SECURITY DEFINER function owned by postgres.
- RLS SELECT: `app_private.is_platform_owner() OR (workspace_id IS NOT NULL AND app_private.current_staff_role() = 'workspace_owner' AND app_private.has_workspace_access(workspace_id, null))`.

## Constitution Check

| Principle | Status |
|---|---|
| I Isolation | Forced RLS. The WO sees only workspaces with an active membership. Foreign-workspace negative tests. ✅ |
| III Governance | Every governance write is audited in the same transaction. ✅ |
| VII Privacy | Allow-listed details, no PII, append-only enforced against all application roles. ✅ |
| IV Scope | Audit scopes are from PRD-11. Trainer and Sales read nothing until a contextual-history feature defines it. ✅ |
| Workflow | Integration in CI; reviewer local verification plus a negative check. ✅ |

## NEEDS DECISION

- ND-F5-1: Audit retention period, which depends on B4. Kept indefinitely for now.
- ND-F5-2: Should trainers see any audit slice? Deferred to the features that define "contextual history".

## Project Structure

```text
supabase/migrations/20261027150000_audit_log.sql
tests/integration/audit.test.ts
README.md (section: "Auditing new tables")
```

## Complexity Tracking

None.
## S33-PO-4 test hygiene

Keep visibility probes bounded and role-specific while retaining every PO/WO visibility and anon denial assertion. Do not change audit policy or schema in this scope.
