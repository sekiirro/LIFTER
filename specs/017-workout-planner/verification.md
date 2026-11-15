# F17 Plan-content Slice Verification

**Lane**: `s58-luna-f17plan`

**Branch**: `017-plan-slice-1`

**Base**: `origin/main` at lane entry, `e14e1b41`; latest origin/main merged through PR #125 (`17f5f31f`)

**Migration**: `20261119040000_f17_workout_plan_content.sql`

**Stack**: Stack B, project `lifter-stack-b`, API 25421, DB 25422

## Scope and result

T012 stores F17 workout documents directly in F19 `plan_drafts.content` and `plan_revisions.content`. It creates no duplicate plan lifecycle/delivery tables and asserts the two existing composite workspace foreign keys remain. T015 accepts only schema v1 with a `days` array and applies the historical 512 KiB guard as provisional, unbenchmarked behavior per the task wording; SC-014 remains open. This slice creates no tables, and does not change F19 table RLS or grants; T016/T017 remain unticked.

## RED / GREEN

- Initial TDD run: 1 passed, 2 failed because F19 accepted unknown workout schema versions.
- Final post-merge Stack B integration run: F17 plus dependent F19 plan suites, 5 files / 40 tests passed. Stack B had been safely reset and provisioned after the last schema change.
- Final post-merge full unit suite: 268 files / 3,166 tests passed.
- Final local validate group passed: lint, typecheck, format checks, spec consistency, edge build, secrets check, cron build, size check, Unicode policy check, and migration checks. The remote migration collision scan passed across 273 refs before the final required fetch.

## Mutation evidence

All mutations ran against assigned Stack B via `supabase-safe.mjs` and were restored before the final clean reset and provisioning.

- Disabled the draft/revision schema-version triggers: F17 integration suite failed in the unknown/missing-version and revision validation assertions (exit 1).
- Disabled the draft/revision size triggers: oversized-document assertion failed (exit 1).
- Dropped F19 `plan_drafts_workspace_id_plan_id_fkey`: composite-key assertion failed (exit 1).
- Re-enabled triggers, restored the FK, then safely reset and reprovisioned Stack B. Final dependent integration suites passed.

## Remaining gates

Exact-head PR CI and architect exact-SHA full-diff review are pending. No template tables were created. Local CI summary: `C:/Users/NEW LAP/.lifter/runs/s58-luna-f17plan/ci-local-summary-final.json`.

\n
