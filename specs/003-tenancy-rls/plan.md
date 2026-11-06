# Implementation Plan: Workspace Tenancy, Permission Matrix & RLS (P0-F3)

**Branch**: `003-tenancy-rls` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

## Summary

This feature adds one forward-only Supabase migration. It creates:

- the tables `staff_profiles`, `workspaces` and `workspace_memberships`
- a private `app_private` schema with `SECURITY DEFINER` helpers: `is_platform_owner()`, `role_has_capability(role, capability)` and `has_workspace_access(ws, capability)`
- forced RLS on all three tables
- PO-only governance writes

A pure TypeScript `authorize()` mirrors the same matrix. A reusable integration harness (supabase-js plus a direct Postgres connection) runs the isolation, governance and matrix-parity suites against a local Supabase stack in a new CI job. Decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 6.0.3 strict; SQL (Postgres 17 via Supabase CLI local stack)
**Primary Dependencies (new, dev)**: `@supabase/supabase-js@2.118.0` (MIT), `postgres@3.4.9` (Unlicense). CI: `supabase/setup-cli@v1` with CLI `2.122.0`.
**Storage**: Supabase Postgres (local only); migrations in `supabase/migrations/`
**Testing**: Vitest unit (`authorize`); Vitest integration (`tests/integration/**`, separate config, `npm run test:integration`)
**Target Platform**: Supabase Free (staging/prod later); CI ubuntu with Docker
**Constraints**: $0; no secrets (local stack demo keys only); no deploy; forward-only migration; reviewer has no Docker, so integration is verified in CI
**Scale/Scope**: 3 tables, 4 helpers, 12 capabilities

## Constitution Check

| Principle | Status |
|---|---|
| I Isolation | `workspace_id` plus composite `(workspace_id, id)` on memberships. Two walls: `authorize()` and forced RLS keyed to `auth.uid()`. Every table and governance write has a foreign-workspace negative test. ✅ |
| II Money | N/A ✅ |
| III Governance | Only the PO writes workspaces, memberships and roles. The role is stored once per staff identity (consistent across workspaces). Unlisted Sales rights are denied. ✅ |
| IV Scope | Matrix copied from approved D-09/D-10 (Architecture v3), plus the PO-only governance and export rights from Constitution III / BRD. Open items are denied and listed. ✅ |
| VI People | Memberships are revoked, never deleted, so history is preserved. ✅ |
| VII Privacy | Synthetic test emails only. Audit emission is deferred to F5; `granted_by`/`revoked_by` are recorded now. ✅ (tracked) |
| IX Reliability | N/A ✅ |
| Platform | Supabase per Architecture v3. Local stack in CI at $0. ✅ |
| Workflow | Integration tests join the CI gate (Roadmap QG-2). ✅ |

## NEEDS DECISION (closed)

| # | Item | F3 handling |
|---|---|---|
| — | None | ND-F3-2 and ND-F3-3 are resolved in the Resolved Decisions section. |

## OPEN IMPLEMENTATION BLOCKERS

| ID | Feature | Status |
|---|---|---|
| PO-ESCALATION G1 | 003 trainer departure | **RESOLVED by S35-PO-1 G1=A.** Departure = deactivate + revoke memberships/access; no deletion of the auth user or staff_profiles row; audit attribution preserved. The RESTRICT FK and no-delete guards remain. FR-015/SC-007 and T017-T019 rewritten to this model. No deactivation capability exists yet; T020 tracks adding it. |

## Resolved Decisions

| Decision | Source | Outcome |
|---|---|---|
| Sales coaching rights | S30-PO-3 Q6 | `coaching_work` is allowed for PO/WO/Trainer and denied for Sales. |
| Active roster visibility | S30-PO-3 Q7 | A WO sees active members. |
| Final Platform Owner guard | S30-PO-3 Q8 | The database refuses to remove or demote the final Platform Owner; transfer works by adding a new PO first. |
| Departed trainer departure | S35-PO-1 G1=A | Deactivate + revoke memberships/access; no deletion of the auth user or staff_profiles row; audit attribution preserved. The RESTRICT FK and no-delete guards remain. No deactivation capability exists yet; T020 tracks adding it. |
| Last-PO guard scope | S34-PO-1 G2=A, amended by S36-PO-2 | The guard applies to operations affecting valid Platform Owner count, including membership revocation (S36-PO-2). The revocation removal mechanism is open (S36-Q1). |

Resolved within this reconciliation (both sides):

- **ND-F3-1 resolved by S30-PO-3 Q6:** “PO/WO/Trainer, deny Sales (Recommended)”. Sales remains denied `coaching_work`.
- **ND-F3-2 resolved for this approved scope by S30-PO-3 Q7 and S30-R8:** a current Workspace Owner sees only active membership fields for their own workspace (`user_id`, `workspace_id`, `granted_at`, `revoked_at`, plus the associated `staff_profiles.role`). `revoked_at IS NULL` defines active. Profile/contact fields are out of scope.
- **ND-F3-3 resolved for this approved scope by S30-PO-3 Q8, S30-R8, and S34-PO-1 G2=A:** preserve at least one valid Platform Owner under concurrent changes that affect valid Platform Owner count; protect role changes/demotions, membership revocations, and staff-profile deletion (S36-PO-2); serialize every such mutation through the shared transaction lock described below; reuse the existing generic privileged-operation error convention. Membership hard deletion is prohibited, and auth-user deletion currently uses `ON DELETE RESTRICT`; neither is a cascade path. The membership-revocation removal mechanism is an open PO question (S36-Q1). No new user-facing copy. Bootstrap remains operator-managed.

## Project Structure

```text
specs/003-tenancy-rls/  spec.md plan.md research.md data-model.md quickstart.md contracts/db-contract.md tasks.md
supabase/migrations/20261027120000_tenancy.sql
supabase/seed.sql                        # stays empty of real data (no PII)
lib/auth/capabilities.ts                 # Role, Capability, MATRIX, roleHasCapability()
lib/auth/authorize.ts                    # authorize(actor, capability, workspaceId)
tests/unit/authorize.test.ts
tests/integration/harness.ts             # env loading, admin client, user/session factory, sql client, fixtures(two workspaces)
tests/integration/rls-catalog.test.ts    # RLS enabled+forced, no anon grants
tests/integration/isolation.test.ts      # cross-workspace reads, anon, revoked
tests/integration/governance.test.ts     # PO-only writes, self-role change, membership mutation rules
tests/integration/matrix-parity.test.ts  # TS vs SQL for every role × capability
vitest.integration.config.ts
.github/workflows/ci.yml                 # + integration job
docs/BOOTSTRAP.md? → no: README section "Local database & isolation tests" + PO bootstrap SQL snippet
```

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected |
|---|---|---|
| The matrix exists in both TS and SQL | Two walls (Architecture v3). The database can't import TS. | A single source generating both needs a codegen step. The parity test gives the same guarantee. |


## S30-PO-3 governance amendment plan (documentation proposal)

- **FR-013 / SC-006 — active-member roster**: expose the roster through a dedicated `SECURITY DEFINER` RPC with a fixed `RETURNS TABLE` projection of `user_id`, associated `staff_profiles.role`, `workspace_id`, `granted_at`, and `revoked_at`; use `SET search_path = ''`, fully qualified references, and an explicit current-Workspace-Owner/own-workspace/active-row check. Grant `authenticated` only RPC execution for the new roster path; do not add a base-table RLS policy or table/column grant that exposes other members' rows or profile/contact fields. Preserve existing F3 access semantics outside this new path. Do not rely on row-level RLS alone to limit columns. Never project profile/contact fields. This is a technical implementation shape for the already-approved scope, not a scope expansion. Require executed positive/negative mutation tests for active, revoked, same-workspace, foreign-workspace, attempted base-table reads of other members, and profile/contact-column denial, plus architect security review before implementation acceptance. The existing tables and active predicate are documented in `data-model.md` and `supabase/migrations/20261027120000_tenancy.sql`.
- **FR-014 / SC-005 — final-PO guard**: use a database-enforced guard in a forward-only migration so role changes/demotions, membership revocations, and staff-profile deletion cannot leave zero valid Platform Owners (S36-PO-2). Every operation that affects valid Platform Owner count acquires the same transaction-scoped serialization lock before changing owner role/profile state, then evaluates the owner count under that lock; no path may use a separate lock or bypass the shared invariant. Membership hard deletion is prohibited and the currently restricted auth-user deletion is outside this guard (no cascade path); membership revocation is inside it per S36-PO-2, with its removal mechanism open (S36-Q1). Any future PO-approved mutation that can affect that count must be re-analyzed under FR-014 before implementation. Reuse the existing generic `not_permitted` / SQLSTATE `42501` convention evidenced at `supabase/migrations/20261028120000_auth_recovery_links.sql:144-151`, with no new user-facing copy. Require executed tests for each protected operation, add-first transfer, two concurrent removals (demotion or membership revocation), and the concurrent demotion/staff-profile-deletion race, plus architect security review before implementation acceptance.
- **FR-015 / SC-007 — departed-trainer departure (resolved by S35-PO-1 G1=A)**: departure is performed by deactivating the trainer's access — revoking all of their workspace memberships and removing staff access — without deleting the auth user or the `staff_profiles` row; audit attribution is preserved. The existing `ON DELETE RESTRICT` foreign key and `staff_profiles_no_delete` trigger remain; no deletion, cascade, FK/trigger change, detach, anonymization, or reassignment is authorized. The current schema has no dedicated deactivation capability; T020 tracks adding it (tagged FR-015). T017 establishes tests for the deactivate+revoke model (auth user and `staff_profiles` row remain; memberships revoked; audit preserved; protected rows intact); T018 implements only the selected deactivation capability in a new forward-only migration (S32-R1 all-origin-refs uniqueness); T019 records independent security/audit review and executed evidence.
- No migration, code, test, or deletion mechanism is authored in this cycle. High-risk RLS/auth changes require architect review and executed mutation tests.

### Clarification status

S30-PO-3 Q7 and Q8 provide the approved roster and final-PO behavior; S30-R8 records architect clarifications of that behavior. S35-PO-1 G1=A (deactivate/revoke; preserve audit) and G2=A are recorded verbatim in `spec.md`. G1 is resolved: departure = deactivate + revoke memberships/access; no deletion of the auth user or staff_profiles row; audit attribution preserved. The RESTRICT FK and no-delete guards remain. No deactivation capability exists yet; T020 tracks adding it. T014 remains independently implementable after Analyze. T015's demotion and staff-profile-deletion branches remain implementable after RED tests T021; its membership-revocation branch is BLOCKED by S36-Q1 (T022). T017-T019 are rewritten to the deactivate+revoke model and are no longer blocked.
