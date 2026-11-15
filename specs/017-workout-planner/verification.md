# F17 Plan-content Slice Verification

**Lane**: `s58-luna-f17plan`

**Branch**: `017-plan-slice-1`

**Base**: `origin/main` at lane entry, `e14e1b41`

**Migration**: `20261119040000_f17_workout_plan_content.sql`

**Stack**: Stack B, project `lifter-stack-b`, API 25421, DB 25422

## Scope and result

T012 stores F17 workout documents directly in F19 `plan_drafts.content` and `plan_revisions.content`. It creates no duplicate plan lifecycle/delivery tables and asserts the two existing composite workspace foreign keys remain. T015 accepts only schema v1 with a `days` array and applies the historical 512 KiB guard as provisional, unbenchmarked behavior per the task wording; SC-014 remains open. This slice creates no tables, and does not change F19 table RLS or grants; T016/T017 remain unticked.

## RED / GREEN

- Initial TDD run: 1 passed, 2 failed because F19 accepted unknown workout schema versions.
- Final migration and test run after reset/provisioning: F17 plus dependent F19 plan suites, 5 files / 34 tests passed.
- Full unit suite: 263 files / 3,143 tests passed.
- Lint, typecheck, `npm run format:check`, `FORMAT_BASE_SHA=$(git merge-base HEAD origin/main) node scripts/format-check-changed.mjs`, edge build, `check:secrets`, and both migration timestamp checks passed.

## Mutation evidence

All mutations ran against assigned Stack B via `supabase-safe.mjs` and were restored before the final clean reset and provisioning.

- Disabled the draft/revision schema-version triggers: F17 integration suite failed in the unknown/missing-version and revision validation assertions (exit 1).
- Disabled the draft/revision size triggers: oversized-document assertion failed (exit 1).
- Dropped F19 `plan_drafts_workspace_id_plan_id_fkey`: composite-key assertion failed (exit 1).
- Re-enabled triggers, restored the FK, then safely reset and reprovisioned Stack B. Final dependent integration suites passed.

## Remaining gates

Exact-head PR CI and architect exact-SHA full-diff review are pending. No template tables were created.
