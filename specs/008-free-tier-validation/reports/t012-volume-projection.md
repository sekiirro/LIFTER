# T012 — Offline pilot-unit → relation volume projection (S31-PO-4)

**Status**: ARTIFACT COMPLETE; T012 **ticked** per PO decisions S65-PO-7 / S65-PO-10 / S65-PO-11 (all three MCQs in §6 ANSWERED on 2026-11-18). Distinct-staff total and plan-kind split remain **UNVERIFIED by PO decision**; ND-F8-2 / ND-F8-3 stay pre-production.
**Date**: 2026-11-18
**Base**: `origin/main` `ed90bde55c3f819d1898f17372bd77ba96ba661c` (worktree `LFTR-s65-t012`, branch `s65-008-t012`).
**Method**: offline only. No DB stack, no Supabase CLI, no deploy, no cloud read/write. Schema facts were read from `supabase/migrations` on the base commit; the projection is a pure function in `scripts/free-tier/lib/pilot-volumes.mjs`.

## 1. Governing decisions (verbatim sources)

- PO **S65-PO-7** (`C:/Users/NEW LAP/.lifter/runs/s65-po/s65-po-7.verbatim.txt`): "Close T012 for v1 on the offline projection with a recorded schema-verified volume artifact; deploy/auth measurements stay as the existing pre-production items."
- PO **S65-PO-10** (`C:/Users/NEW LAP/.lifter/runs/s65-po/s65-po-10.verbatim.txt`): "S65-T012-1: C — Leave unverified. LIFTER is pre-production; the pilot was test-only. Verify fixtures if available, never invent figures."
- PO **S65-PO-11** (`C:/Users/NEW LAP/.lifter/runs/s65-po/s65-po-11.verbatim.txt`): "S65-T012-2: A" — option text: Row volume is enough: Close T012 on the row-volume projection; byte/DB-size measurement stays the existing deployment item (ND-F8-2). Plan kind split stays unverified.
- Architect **S65-R12** (`C:/Users/NEW LAP/.lifter/runs/s65-arch/rulings.md:14`): a measurement lane produces the artifact (offline projection, each S31-PO-4 pilot unit verified against schema), then T012 closes docs-only citing it.
- Pilot **S31-PO-4 / SK-008-01** (`C:/Users/NEW LAP/.lifter/briefs/s28-po-decisions-verbatim.md:191`): "Illustrative pilot: 2 workspaces, 150 clients/workspace, 2 staff/workspace, 2 plans/client, 2 new plan versions/client/month. Verify schema and units."
- Derived volumes recorded in `specs/008-free-tier-validation/spec.md:80,94` and `plan.md:35`: 300 clients and 600 new plan versions/month; "staff count and the plans-per-client count are inputs for other tables and are not factors of the plan-version volume."

## 2. Pilot inputs (decided, not invented)

| Pilot unit                             | Value | Derived volume                            | Source                                           |
| -------------------------------------- | ----- | ----------------------------------------- | ------------------------------------------------ |
| workspaces                             | 2     | 2                                         | spec.md:80,94; s28-po-decisions-verbatim.md:191  |
| clients per workspace                  | 150   | 2 × 150 = **300 clients**                 | spec.md:80,94                                    |
| staff per workspace                    | 2     | 2 × 2 = **4 active memberships**          | spec.md:80,94 (see §5 for distinct-staff caveat) |
| plans per client                       | 2     | 300 × 2 = **600 plans**                   | spec.md:80,94                                    |
| new plan versions per client per month | 2     | 300 × 2 = **600 new plan versions/month** | spec.md:80,94                                    |

## 3. Schema verification — every mapped table and column

No table below was assumed: each `create table` and each cardinality-bearing constraint was read from `supabase/migrations` on the base commit.

| Pilot unit → relation                                                | Column / constraint that fixes the row count                                                                                                           | Schema source (file:line)                                                                                      | Status                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| workspace → `public.workspaces`                                      | `id uuid primary key`; `workspace_id` is the FK used by clients/memberships/plans                                                                      | `supabase/migrations/20261027120000_tenancy.sql:10-16` (`:11` PK)                                              | VERIFIED                                         |
| client → `public.clients`                                            | `id uuid primary key`; `workspace_id uuid not null references public.workspaces(id)`; `auth_user_id uuid not null unique`                              | `supabase/migrations/20261031121000_client_accounts_model.sql:62-78` (`:63`, `:64`, `:65`, `:73`)              | VERIFIED                                         |
| staff membership → `public.workspace_memberships`                    | `workspace_id`/`user_id` FKs; partial unique index `(workspace_id, user_id) where revoked_at is null` → one active row per staff per workspace         | `supabase/migrations/20261027120000_tenancy.sql:18-31` (`:20`, `:21`, `:30-31`)                                | VERIFIED                                         |
| staff user → `public.staff_profiles`                                 | `user_id uuid primary key references auth.users(id)` → one row per distinct staff user                                                                 | `supabase/migrations/20261027120000_tenancy.sql:4-8` (`:5`)                                                    | VERIFIED (table); distinct total UNVERIFIED (§5) |
| plan → `public.plan_roots`                                           | `id uuid primary key`; `unique (workspace_id, id)`; FK `(workspace_id, client_id) → clients(workspace_id, id)`; `plan_kind in ('workout','nutrition')` | `supabase/migrations/20261114120000_f19_plan_roots_drafts_revisions.sql:2-12` (`:3`, `:6`, `:9`, `:10-11`)     | VERIFIED                                         |
| plan draft → `public.plan_drafts`                                    | `primary key (workspace_id, plan_id)`; FK to `plan_roots` → one draft per plan                                                                         | `supabase/migrations/20261114120000_f19_plan_roots_drafts_revisions.sql:14-26` (`:23`, `:24-25`)               | VERIFIED                                         |
| plan version → `public.plan_revisions`                               | `id uuid primary key`; `unique (workspace_id, plan_id, revision_number)`; FK to `plan_roots` → one row per published version                           | `supabase/migrations/20261114120000_f19_plan_roots_drafts_revisions.sql:28-43` (`:29`, `:32`, `:39`, `:41-42`) | VERIFIED                                         |
| nutrition version content → `public.nutrition_plan_version_contents` | `primary key (workspace_id, revision_id)`; FK to `plan_revisions` → 1:1 with nutrition revisions                                                       | `supabase/migrations/20261119010000_f18_nutrition_plan_version_contents.sql:3-17` (`:14`, `:15-16`)            | VERIFIED (table); row count UNVERIFIED (§5)      |
| workout plan content                                                 | stored in the F19-owned draft/revision content, not a separate client-plan table                                                                       | `supabase/migrations/20261119040000_f17_workout_plan_content.sql:1-2`                                          | VERIFIED (no extra row source)                   |

The "plan" and "plan version" pilot units are mapped to `plan_roots`/`plan_revisions` because those are the only relations in the current schema that store per-client plans and their immutable published versions; F18 stores workout/nutrition content inside them (evidence above). `volumes.example.json:2` remains an illustrative template; it predates the plan tables and is not used as a source here.

## 4. Computed offline projection (rows per relation)

Produced by `node scripts/free-tier/pilot-volume.mjs` (pure module `scripts/free-tier/lib/pilot-volumes.mjs`); asserted by `tests/unit/free-tier-pilot-volumes.test.ts` (4/4 pass).

| Relation                       | Unit                      | Expected rows | Status   |
| ------------------------------ | ------------------------- | ------------- | -------- |
| `public.workspaces`            | workspaces                | 2             | VERIFIED |
| `public.clients`               | clients                   | 300           | VERIFIED |
| `public.workspace_memberships` | staff memberships         | 4             | VERIFIED |
| `public.plan_roots`            | plans                     | 600           | VERIFIED |
| `public.plan_drafts`           | plans                     | 600           | VERIFIED |
| `public.plan_revisions`        | new plan versions / month | 600           | VERIFIED |

This is a **row-volume** projection only. It is not a byte-size projection and must not be compared with the 500 MB limit.

## 5. Inputs marked UNVERIFIED (not guessed)

| Input                                         | Why unverifiable                                                                                                                                                             | Source                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `public.staff_profiles` distinct user total   | "2 staff/workspace" fixes active memberships (4), but the pilot does not say whether the same staff are shared across the 2 workspaces; distinct users could be 2 or 4.      | `supabase/migrations/20261027120000_tenancy.sql:4-8`; spec.md:80                                               |
| `auth.users` rows                             | Supabase Auth managed table; not created by any repo migration. Total also depends on the unresolved distinct-staff count.                                                   | `supabase/migrations/20261031121000_client_accounts_model.sql:65` (FK reference only)                          |
| `public.nutrition_plan_version_contents` rows | 1:1 with nutrition revisions; the pilot does not split the 600 plans/versions by `plan_kind`.                                                                                | `supabase/migrations/20261119010000_f18_nutrition_plan_version_contents.sql:3-17`                              |
| `public.audit_events` rows                    | No S31-PO-4 unit determines audit volume.                                                                                                                                    | `supabase/migrations/20261027150000_audit_log.sql:2-11`                                                        |
| `public.jobs` rows                            | No S31-PO-4 unit determines job volume.                                                                                                                                      | `supabase/migrations/20261027160000_jobs.sql:2-19`                                                             |
| bytes per row (`total_bytes / reltuples`)     | No offline measurement exists. The only `reltuples` values in the repo are synthetic unit-test fixtures, one of them `-1` (the exact unknown-basis case T012 says to defer). | `tests/unit/free-tier-projection.test.ts:4-9`; `scripts/free-tier/lib/projection.mjs:9-12`; traceability.md:12 |

Per `tasks.md:71`, the byte projection whose per-row basis is unknown is **deferred / invalid**, not completed. ND-F8-2 (deploy) and ND-F8-3 (authenticated routes) remain pre-production items per S65-PO-7.

## 6. PO-DECISION-NEEDED — MCQs ANSWERED (2026-11-18)

All three MCQs were escalated to the PO and answered on 2026-11-18. **T012 is ticked** in `tasks.md`, citing S65-PO-7, S65-PO-10 and S65-PO-11 and the artifact path `specs/008-free-tier-validation/reports/t012-volume-projection.md`.

### MCQ-S65-T012-1 — distinct staff total — ANSWERED: (C)

- PO **S65-PO-10** (verbatim): "S65-T012-1: C — Leave unverified. LIFTER is pre-production; the pilot was test-only. Verify fixtures if available, never invent figures."
- Outcome: the distinct `public.staff_profiles` / `auth.users` total stays **UNVERIFIED** and those two tables are **excluded** from the volume artifact; the row-volume projection remains partial for them (§5). No figure invented.
- Fixture search (per S65-PO-10): searched `tests/**`, `supabase/seed*.sql` and `scripts/**`. No `supabase/seed*.sql` exists in the repo. The only pilot-named files are `scripts/free-tier/lib/pilot-volumes.mjs` and `tests/unit/free-tier-pilot-volumes.test.ts`; they encode only the decided pilot units (2 workspaces × 2 staff → 4 memberships) and themselves record the distinct-staff total as UNVERIFIED (`scripts/free-tier/lib/pilot-volumes.mjs:61-67`; `tests/unit/free-tier-pilot-volumes.test.ts:10-18`). No fixture defines the distinct staff set, so the UNVERIFIED/excluded status stands.

### MCQ-S65-T012-2 — byte-level projection basis — ANSWERED: (A)

- PO **S65-PO-11** (verbatim): "S65-T012-2: A" — option text: Row volume is enough: Close T012 on the row-volume projection; byte/DB-size measurement stays the existing deployment item (ND-F8-2). Plan kind split stays unverified.
- Outcome: the schema-verified **row-volume** projection (§4) is sufficient to close T012. No byte/DB-size projection is attempted; it stays the existing deployment item **ND-F8-2** (pre-production). No byte figure is claimed.

### MCQ-S65-T012-3 — plan-kind split — ANSWERED: (A) (consequence of S65-PO-11)

- Outcome: the `workout`/`nutrition` split of the 600 plans stays **UNVERIFIED**, recorded as a MISSING volume. Because no byte projection is produced (MCQ-S65-T012-2 = A), `nutrition_plan_version_contents` rows are not estimated (§5). No split is invented.

### Standing pre-production items

- **ND-F8-2** (deployment / byte-DB-size measurement) and **ND-F8-3** (authenticated-route measurement) remain explicitly open, pre-production items per S65-PO-7 and S65-PO-11. No deploy, cloud, or authenticated-route action was taken.

## 7. T012 clause status

- "Verify each S31-PO-4 pilot unit against the current schema" — **done** (§3).
- "check the supplied relation's row estimate" — **deferred/invalidated per T012's own rule and PO decision**: the only supplied estimate is a synthetic `reltuples = -1` fixture (unknown basis), which T012 instructs to defer/invalidate; S65-PO-7 / S65-PO-11 accept the schema-verified row-volume projection in its place (§5, §6).
- "record the mapping and source in the projection volume artifact" — **done** (§3, §4).
- "complete offline projection after verification" — **row projection done; byte projection deferred/invalid per S65-PO-11 (stays ND-F8-2)** (§4, §5, §6).
- "defer deployment-dependent and authenticated-route measurements" — **done** (ND-F8-2/ND-F8-3 remain pre-production per S65-PO-7 / S65-PO-11).

**Conclusion:** artifact delivered; all three MCQs ANSWERED by the PO on 2026-11-18 (S65-PO-7 / S65-PO-10 / S65-PO-11); **T012 ticked** in `tasks.md`. Distinct-staff total and plan-kind split remain UNVERIFIED by PO decision; ND-F8-2 / ND-F8-3 stay pre-production.

## 8. Evidence / reproduction

```
node scripts/free-tier/pilot-volume.mjs
npx vitest run --configLoader native --pool threads tests/unit/free-tier-pilot-volumes.test.ts
```

4/4 tests passed on the worktree head before this report was written. No secrets, no DB, no network, no cloud actions.
