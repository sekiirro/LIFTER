# Tasks: Workspace Tenancy, Permission Matrix & RLS (P0-F3)

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/db-contract.md](contracts/db-contract.md), [quickstart.md](quickstart.md)
**Tests**: Required (Constitution I, spec SC-001..SC-004).
**Coder rules**: Forward-only SQL. No PII. No new dependencies beyond the 2 listed. Don't touch `LIFTER_Claude_Files/`, `DESIGN.md`, `docs/`, `.specify/` or `specs/` (except checking tasks off). The reviewer has no Docker: integration tests are proven in CI, so write them carefully and deterministically.

## Phase 1: Setup

- [x] T001 (Claude) Install devDeps `@supabase/supabase-js@2.118.0` and `postgres@3.4.9` (exact).
- [x] T002 Add `vitest.integration.config.ts` (node env, `include: ['tests/integration/**/*.test.ts']`, `testTimeout: 30000`, `hookTimeout: 60000`, `fileParallelism: false`) and script `"test:integration": "vitest run --config vitest.integration.config.ts"` in `package.json`.

## Phase 2: Foundational

- [x] T003 Write migration `supabase/migrations/20261027120000_tenancy.sql` exactly per [data-model.md](data-model.md) and [research.md](research.md): `create extension if not exists pgcrypto` only if needed; enum `public.staff_role`; tables with CHECKs, FKs, the `UNIQUE (workspace_id, id)` composite key and the partial unique index; schema `app_private` (`revoke all on schema app_private from public, anon`; `grant usage` to `authenticated`); functions `is_platform_owner`, `current_staff_role`, `role_has_capability` (immutable CASE over the 12 capabilities: `set_package_pricing` PO; `generate_registration_link` PO/WO/Sales/Trainer; `configure_installment_schedule`, `approve_registration`, `record_payment`, `manage_freeze` PO/WO/Sales; `record_refund`, `delete_client`, `export_client_dataset`, `manage_workspaces`, `manage_staff_access` PO; `coaching_work` PO/WO/Trainer; anything else false), and `has_workspace_access`. All SECURITY DEFINER with `set search_path = ''`, owned by postgres, `revoke execute ... from public, anon`, `grant execute ... to authenticated`. Membership guard trigger. `alter table ... enable row level security` and `force row level security` on all 3 tables. Policies per data-model, using `(select auth.uid())`. Revoke all on the tables from `anon` and `public`; grant SELECT, INSERT, UPDATE to `authenticated`; no DELETE. `granted_by`, `created_by` and `revoked_by` must equal `auth.uid()`, enforced in WITH CHECK or the trigger. Comment each block with its spec FR.
- [x] T004 [P] Implement `lib/auth/capabilities.ts` and `lib/auth/authorize.ts` per the contract.
- [x] T005 [P] Write `tests/unit/authorize.test.ts`: the exact expected matrix as a literal table (role × capability → boolean) compared to `roleHasCapability`. Unknown capability → false. Null role → false. Non-PO without membership → false. Non-PO with membership but no capability → false. PO with no memberships → true for every capability. Revoked memberships are simply absent from `activeWorkspaceIds`.
- [x] T006 Implement `tests/integration/harness.ts` per the contract. Env names: accept `API_URL|SUPABASE_URL`, `ANON_KEY|SUPABASE_ANON_KEY`, `SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY`, `DB_URL|SUPABASE_DB_URL`. Missing → throw `Error('Integration env missing: run `supabase start` and export `supabase status -o env`')`. `createStaff` uses `admin.auth.admin.createUser({ email, password, email_confirm: true })`, inserts `staff_profiles` with the service role when the role is not null, then signs in with a fresh anon client (`persistSession: false`, `autoRefreshToken: false`). `twoWorkspaceFixture` creates the PO, WO-A, trainer-A, sales-A and trainer-B; workspaces A and B (unique slugs, `created_by` = PO); memberships A: woA, trainerA, salesA and B: trainerB (`granted_by` = PO). These inserts go through the service role.

## Phase 3: US1 Isolation (P1)

- [x] T007 [US1] `tests/integration/rls-catalog.test.ts`: via `sql()`, assert that `relrowsecurity` and `relforcerowsecurity` are true for the 3 tables; that `anon` has no table privileges on them (`has_table_privilege('anon', ..., 'SELECT')` is false, and the same for INSERT and UPDATE); that `authenticated` lacks DELETE; that the `app_private` functions are not executable by `anon`; and that every `app_private` function has `prosecdef` and `proconfig` containing `search_path=""`.
- [x] T008 [US1] `tests/integration/isolation.test.ts`: (a) trainerA's workspaces = [A] only, and B is invisible even with `.eq('id', wsB)`; (b) trainerA's memberships = their own A row only (not woA's: ND-F3-2); (c) PO sees A and B and all memberships; (d) anon gets 0 rows from all 3 tables or a permission error (assert either: no data); (e) after the PO revokes salesA, salesA sees no workspaces and the membership row still exists (checked via `sql()`); (f) a user with an auth account but no staff profile sees nothing; (g) a staff profile without memberships (trainer) sees no workspaces; (h) `has_workspace_access` checked through `sql()` with `set local role authenticated; set local request.jwt.claims = '{"sub":"<id>","role":"authenticated"}'` inside a transaction returns false for trainerA→B and true for trainerA→A.

## Phase 4: US2 Governance (P1)

- [x] T009 [US2] `tests/integration/governance.test.ts`: for woA, trainerA and salesA (and anon), each of these is rejected (error or 0 affected rows, confirmed by re-reading via `sql()`): insert workspace; update A's name; insert a membership into A; revoke a membership; insert or update a staff profile (including their own role → `platform_owner`). The PO succeeds at: create workspace C; grant trainerB into C; revoke it. A membership update that changes `workspace_id` or `user_id`, un-revokes, or sets `revoked_by` to someone else is rejected even for the PO. Deleting through the API is rejected for everyone. A duplicate active membership is rejected; re-granting after a revocation creates a new row.

## Phase 5: US3 Matrix parity (P1)

- [x] T010 [US3] `tests/integration/matrix-parity.test.ts`: for every Role × Capability (plus 2 unknown names), `select app_private.role_has_capability($1::public.staff_role, $2)` via `sql()` equals `roleHasCapability`.

## Phase 6: US4 CI harness (P1)

- [x] T011 [US4] `.github/workflows/ci.yml`: add a job `integration` (ubuntu-latest, `permissions: contents: read`, same checkout/node/npm ci steps as `validate`). Steps: `supabase/setup-cli@v1` with `version: 2.122.0`; `supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta`; `supabase status -o env >> "$GITHUB_ENV"` (strip quotes if the CLI emits `KEY="value"`); `npm run test:integration`; `supabase stop --no-backup` with `if: always()`. No secrets, no deploy.
- [x] T012 README section "Local database & isolation tests": Docker requirement, start/status/env/test commands, the rule that every new tenant table needs a foreign-workspace test through the harness, and the PO bootstrap SQL snippet (placeholder `<auth-user-uuid>`, run by an operator, never committed with real ids).

## Phase 7: Polish

- [x] T013 (Claude) Review: SQL read line by line against data-model; run unit gates locally; push; CI integration green; negative check (weaken a policy on a scratch branch commit → CI red → drop the commit) if CI time allows, otherwise record it in the PR as pending.

## Dependencies

T001 → T002 → T003/T004/T005 → T006 → T007–T010 → T011 → T012 → T013.
