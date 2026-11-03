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

## NEEDS DECISION (deny-by-default until the PO decides)

| # | Item | F3 handling |
|---|---|---|
| ND-F3-2 | Can a WO see other members of their own workspace? | S30-PO-3 Q7 approves "WO sees active members" for roster administration. Workspace boundary, active predicate, and visible fields remain open; see PO items SK-003-04..07. |
| ND-F3-3 | Who may manage the PO role itself (bootstrap, last-PO protection) | Initial PO bootstrap remains operator-managed. S30-PO-3 Q8 approves a database guard against removing or demoting the final PO and transfer by adding a new PO first. Concurrent behavior and failure contract remain open; see PO items SK-003-08..09. |

## Resolved decision

- **ND-F3-1 resolved by S30-PO-3 Q6:** "PO/WO/Trainer, deny Sales (Recommended)". Sales remains denied `coaching_work`.

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

- **FR-013 / SC-006 — active-member roster**: add a narrowly scoped database RLS policy/helper path for the Workspace Owner roster. Do not choose workspace-boundary or member-field visibility until the PO answers the open clarifications. Require executed positive and negative mutation tests for active, revoked, in-scope, and out-of-scope cases, plus security review before implementation acceptance.
- **FR-014 / SC-005 — final-PO guard**: use a database-enforced guard in a forward-only migration so removal or demotion cannot leave zero Platform Owners. Design must account for concurrent demotions/removals; do not settle locking/serialization or client-visible error semantics until the PO decision is recorded. Require executed concurrent and sequential mutation tests and security review before implementation acceptance.
- No migration or code is authored in this cycle. High-risk RLS/auth changes require architect review and executed mutation tests.

### Clarification status

S30-PO-3 Q7 and Q8 approve the behavior, while details listed in the external SK-A register at `C:/Users/NEW LAP/.lifter/runs/s30-luna-sk-a6/po-decisions.md` remain open. Existing ND-F3-2 (member visibility) and ND-F3-3 (last-PO protection) are superseded only to the extent of the approved behavior; do not treat their unresolved subquestions as answered.
