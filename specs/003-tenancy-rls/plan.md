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
| PO-ESCALATION G1 | 003 trainer departure | **BLOCKED.** G1=A is approved conditionally, but the current `RESTRICT` FKs, `forbid_delete` guards, and protected attribution/history make safe departed-trainer deletion impossible without a PO-selected contract. FR-015/SC-007 and T017-T019 are not implementation-ready. |

## Resolved Decisions

| Decision | Source | Outcome |
|---|---|---|
| Sales coaching rights | S30-PO-3 Q6 | `coaching_work` is allowed for PO/WO/Trainer and denied for Sales. |
| Active roster visibility | S30-PO-3 Q7 | A WO sees active members. |
| Final Platform Owner guard | S30-PO-3 Q8 | The database refuses to remove or demote the final Platform Owner; transfer works by adding a new PO first. |
| Departed trainer deletion | S34-PO-1 G1=A (conditional) | Deletion may proceed only if protected client, plan, log, subscription, financial, and audit history remains intact. The implementation contract is BLOCKED pending PO-ESCALATION G1. |
| Last-PO guard scope | S34-PO-1 G2=A | The guard applies only to operations affecting valid Platform Owner count. |

Resolved within this reconciliation (both sides):

- **ND-F3-1 resolved by S30-PO-3 Q6:** “PO/WO/Trainer, deny Sales (Recommended)”. Sales remains denied `coaching_work`.
- **ND-F3-2 resolved for this approved scope by S30-PO-3 Q7 and S30-R8:** a current Workspace Owner sees only active membership fields for their own workspace (`user_id`, `workspace_id`, `granted_at`, `revoked_at`, plus the associated `staff_profiles.role`). `revoked_at IS NULL` defines active. Profile/contact fields are out of scope.
- **ND-F3-3 resolved for this approved scope by S30-PO-3 Q8, S30-R8, and S34-PO-1 G2=A:** preserve at least one valid Platform Owner under concurrent changes that affect valid Platform Owner count; protect role changes/demotions and staff-profile deletion; serialize every such mutation through the shared transaction lock described below; reuse the existing generic privileged-operation error convention. Membership revocation changes membership state only, membership hard deletion is prohibited, and auth-user deletion currently uses `ON DELETE RESTRICT`; these are not cascade paths and cannot currently affect valid Platform Owner count. No new user-facing copy. Bootstrap remains operator-managed.

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
- **FR-014 / SC-005 — final-PO guard**: use a database-enforced guard in a forward-only migration so role changes/demotions and staff-profile deletion cannot leave zero valid Platform Owners. Every operation that affects valid Platform Owner count acquires the same transaction-scoped serialization lock before changing owner role/profile state, then evaluates the owner count under that lock; no path may use a separate lock or bypass the shared invariant. Membership revocation/hard deletion and the currently restricted auth-user deletion are outside this guard because they cannot currently affect valid Platform Owner count; any future PO-approved mutation that can affect that count must be re-analyzed under FR-014 before implementation. Reuse the existing generic `not_permitted` / SQLSTATE `42501` convention evidenced at `supabase/migrations/20261028120000_auth_recovery_links.sql:144-151`, with no new user-facing copy. Require executed tests for each protected operation, add-first transfer, two concurrent demotions, and the concurrent demotion/staff-profile-deletion race, plus architect security review before implementation acceptance.
- **FR-015 / SC-007 — conditional departed-trainer deletion (BLOCKED pending PO-ESCALATION G1)**: record G1's conditional intent without selecting a mechanism. Static verification on the current feature HEAD and `origin/main` found 40 FKs directly involving `auth.users`, `public.staff_profiles`, or staff membership: 19 reference `auth.users`, 21 reference `public.staff_profiles`, and no FK references `public.workspace_memberships`; 35 use `ON DELETE RESTRICT` and 5 use PostgreSQL's default `NO ACTION`. None of the referencing tables is trainer-only/disposable: they are shared governance, client, plan, log, subscription, financial, audit, catalog-provenance, or idempotency records. `staff_profiles_no_delete`, `workspace_memberships_no_delete`, and `workspaces_no_delete` independently reject privileged deletion. The verified current behavior is therefore that departed-trainer auth-user deletion is blocked, not cascaded. T017 must establish RED-first characterization tests only after the PO selects the safe contract; T018 may then implement only that selected contract in a new forward-only migration whose version is unique across ALL origin refs (S32-R1 scan immediately before commit and push); T019 records independent security/audit review and executed evidence. Until PO-ESCALATION G1 is resolved, no cascade, FK/trigger change, detach, anonymization, reassignment, or other deletion mechanism is authorized.
- No migration, code, test, or deletion mechanism is authored in this cycle. High-risk RLS/auth changes require architect review and executed mutation tests.

### Clarification status

S30-PO-3 Q7 and Q8 provide the approved roster and final-PO behavior; S30-R8 records architect clarifications of that behavior. S34-PO-1 G1=A (conditional) and G2=A are recorded verbatim in `spec.md`. No product ambiguity is assumed: G1's safe trainer-deletion mechanism and disposable-record set remain an explicit PO escalation, and the affected requirement/tasks are BLOCKED. T014 and the role-demotion/serialization portion of G2-narrowed T015 remain independently implementable after Analyze, but T015 cannot complete and T016 cannot close until the staff-profile-deletion path is resolved; T017-T019 remain blocked.
