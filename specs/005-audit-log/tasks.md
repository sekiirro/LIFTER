# Tasks: Append-only Audit Log (P0-F5)

**Input**: [spec.md](spec.md), [plan.md](plan.md) (the Design section is binding). F3 migrations and the harness (`tests/integration/harness.ts`) already exist. Never edit committed migrations.
**Coder rules**: No new dependencies. No PII. Don't touch `LIFTER_Claude_Files/`, `DESIGN.md`, `docs/`, `.specify/` or `specs/` (except checking tasks off).

## Phase 1: Foundational

- [x] T001 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-007] Migration `supabase/migrations/20261027150000_audit_log.sql` per plan § Design: table + CHECKs + index; `alter table … enable/force row level security`; grants (revoke all from public, anon, authenticated, service_role; grant select to authenticated); select policy `audit_events_select_scoped`; `app_private.audit_events_immutable()` + row triggers BEFORE UPDATE OR DELETE + statement trigger BEFORE TRUNCATE; `app_private.audit_row_change()` (SECURITY DEFINER, `set search_path = ''`, owner postgres, execute revoked from public/anon/authenticated since it is trigger-only) with the hard-coded action mapping and allow-listed details; AFTER INSERT OR UPDATE row triggers `audit_workspaces`, `audit_staff_profiles`, `audit_workspace_memberships`. Add SQL comments citing the FR numbers.

## Phase 2: US1–US3 tests

- [x] T002 [FR-003, FR-004, FR-007] [US1] `tests/integration/audit.test.ts`, section "emission". Use a fresh `twoWorkspaceFixture()`. As the PO via the API: create workspace C → one `workspace.created` event (actor = PO, workspace_id = C, target_id = C); rename C → one `workspace.updated` with `details.changed.name.from/to`; grant trainerB into C → `membership.granted` (workspace C, `details.user_id`); revoke it → `membership.revoked`; insert a new staff profile → `staff_role.assigned`; change its role → `staff_role.changed` `{from, to}`. A no-op update produces no event. A rejected write (trainer creates a workspace) produces no event (count by `target_id`/slug via `sql()`). Fixture writes by the service role produce events with a null actor. Scan every produced `details` JSON for the substring `@` and the fixture emails: none found.
- [x] T003 [FR-002, FR-007] [US2] Section "immutability": via `sql()` as `postgres` (superuser) wrapped with `set local role service_role`, then `authenticated` with PO claims, then `anon`: UPDATE, DELETE and TRUNCATE on audit_events each raise, and the row count and contents are unchanged. As PO, woA and trainerA via the API: `.insert()`, `.update()` and `.delete()` on `audit_events` affect nothing (error or 0 rows), verified via `sql()`.
- [x] T004 [FR-005, FR-007] [US3] Section "visibility": after events exist in A, in B and at platform level (a staff role change), the PO API read includes all three kinds; woA sees only `workspace_id = A` rows (no B, no null); trainerA, salesA and anon see 0 rows; woA cannot read A's events after the PO revokes woA's membership.
- [x] T005 [FR-001, FR-002, FR-006, FR-007] Extend `tests/integration/rls-catalog.test.ts`: audit_events has RLS enabled and forced; `authenticated` lacks INSERT, UPDATE and DELETE; `anon` and `service_role` lack all; the 4 audit triggers exist; `audit_row_change` has `prosecdef` and `search_path=""`.

## Phase 3: Docs

- [x] T006 [FR-006] README "Auditing new tables" section: how to attach `app_private.audit_row_change()` to a new table (extend the mapping and allow-list in a new migration with `create or replace`), the no-PII rule, and the required tests.

## Phase 4: Review (Claude)

- [ ] T007 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007] Local Docker run of the full integration suite. Negative check: a temporary migration that drops the UPDATE guard trigger must make the T003 tests fail; then remove it.
- [x] T009 [FR-005, FR-007] Harden audit visibility integration probes: scope authorized staff reads to fixture event IDs, use a narrow bounded denial probe, assert SQLSTATE 42501 only for anon/no-grant, and fail explicitly on 57014. Keep all existing visibility and denial assertions.


## Phase 5: P37 close-out (S34-PO-1) — workspace-scoped pagination rule

- [x] T010 [FR-008] Bound and workspace-scope the unfiltered `audit_events` read in `tests/integration/client-accounts-fixture.ts::pendingHttpAccess` (and any other test helper with an unfiltered `audit_events` read): filter by the fixture workspace and add a small `.limit()`, without removing or weakening any denial assertion.
- [ ] T011 [FR-008] (DEFERRED) Future measurement: capture EXPLAIN evidence on representative synthetic volumes before adding any new index on `public.audit_events`; record the query, data volume and plan with that decision. No index to be added in this task.
