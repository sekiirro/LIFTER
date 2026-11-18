# T012 — Offline pilot-unit → relation volume projection (S31-PO-4)

**Status**: ARTIFACT COMPLETE; T012 **NOT** ticked — unverifiable inputs remain (see §6 MCQ).
**Date**: 2026-11-18
**Base**: `origin/main` `ed90bde55c3f819d1898f17372bd77ba96ba661c` (worktree `LFTR-s65-t012`, branch `s65-008-t012`).
**Method**: offline only. No DB stack, no Supabase CLI, no deploy, no cloud read/write. Schema facts were read from `supabase/migrations` on the base commit; the projection is a pure function in `scripts/free-tier/lib/pilot-volumes.mjs`.

## 1. Governing decisions (verbatim sources)

- PO **S65-PO-7** (`C:/Users/NEW LAP/.lifter/runs/s65-po/s65-po-7.verbatim.txt`): "Close T012 for v1 on the offline projection with a recorded schema-verified volume artifact; deploy/auth measurements stay as the existing pre-production items."
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

## 6. PO-DECISION-NEEDED — MCQ (T012 not ticked)

The brief requires: "Mark any input you cannot verify UNVERIFIED; if any is unverifiable, do NOT tick T012 (write MCQ in report.md)." Unverifiable inputs remain (§5), so T012 stays `[ ]`.

1. **MCQ-S65-T012-1 — distinct staff total.** How many distinct `public.staff_profiles` / `auth.users` rows does the illustrative pilot assume?
   - (A) 4 — each workspace has its own 2 staff (2 workspaces × 2). Implication: `staff_profiles` volume 4.
   - (B) 2 — the same 2 staff serve both workspaces. Implication: `staff_profiles` volume 2, memberships still 4.
   - (C) Leave distinct-staff total UNVERIFIED and exclude `staff_profiles`/`auth.users` from the volume artifact. Implication: row-volume projection stays partial.
   - Recommendation: (C) for this artifact; it is the only option that invents nothing. Blocked: complete row-volume projection and the T012 tick.

2. **MCQ-S65-T012-2 — byte-level projection basis.** Does S65-PO-7's "offline projection" require a byte-level `projectUsage` result, or is the schema-verified row-volume projection in §4 sufficient?
   - (A) Row-volume projection is sufficient; byte/DB-size projection stays a deployment item (ND-F8-2). Implication: T012 can be ticked once MCQ-S65-T012-1 is resolved.
   - (B) A byte-level result is required. Implication: impossible offline with no DB; T012 stays blocked until a measured local db-usage JSON exists (conflicts with "No DB stack (offline)").
   - Recommendation: (A), consistent with the PO's "deploy/auth measurements stay as the existing pre-production items". Blocked: T012 tick.

3. **MCQ-S65-T012-3 — plan-kind split.** If a byte projection is later required, how should the 600 plans be split between `workout` and `nutrition` (which determines `nutrition_plan_version_contents` rows)?
   - (A) Leave UNVERIFIED; record as a MISSING volume. (B) PO supplies a split. (C) Treat all 600 as one kind (would be an invented assumption).
   - Recommendation: (A). Blocked: any byte projection involving `nutrition_plan_version_contents`.

## 7. T012 clause status

- "Verify each S31-PO-4 pilot unit against the current schema" — **done** (§3).
- "check the supplied relation's row estimate" — **not possible offline**: the only supplied estimate is a synthetic `reltuples = -1` fixture, which T012 itself says to defer/invalidate (§5).
- "record the mapping and source in the projection volume artifact" — **done** (§3, §4).
- "complete offline projection after verification" — **row projection done; byte projection deferred/invalid** (§4, §5).
- "defer deployment-dependent and authenticated-route measurements" — **done** (ND-F8-2/ND-F8-3 remain pre-production).

**Conclusion:** artifact delivered, T012 remains unchecked pending the MCQs above.

## 8. Evidence / reproduction

```
node scripts/free-tier/pilot-volume.mjs
npx vitest run --configLoader native --pool threads tests/unit/free-tier-pilot-volumes.test.ts
```

4/4 tests passed on the worktree head before this report was written. No secrets, no DB, no network, no cloud actions.
