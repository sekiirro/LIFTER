# S40 round 13 verification

Scope: the four open PR #57 findings approved by S40-R17, tracked as T140. No UI, permissions policy, copy, or product behavior outside the approved F15 contract changed.

## Stack D

- Clean reset and replay applied `20261112031100_f15_client_late_owner_notices.sql` and `20261112031200_f15_prewrite_answer_bounds.sql` successfully.
- The four touched integration files passed on Stack D: `forms-alerts.test.ts`, `forms-alert-mutations.test.ts`, `forms-r3-corrections.test.ts`, and `forms-r3-drafts.test.ts` (14/14 tests).
- The alert mutation test killed the delayed-owner-stage mutant. Correction and draft RPC tests changed each function to SECURITY INVOKER in a savepoint; the catalog `prosecdef` invariant killed each mutant, rollback restored the original `pg_get_functiondef`, and both functions remained SECURITY DEFINER.
- Direct RPC tests reject over-charLimit and over-4-KiB answer writes before revision insertion, and reject invalid N08 budget/food combinations before draft writes. Existing D-03 Trainer-late tests passed in the same run.
- Stack D migration-directory restoration matched the captured byte manifest exactly (87/87 files); proof: `C:/Users/NEW LAP/.lifter/runs/s40-luna-f15-r13/stack-d-migrations-restore-proof.json`.

## Local checks

- Typecheck, lint and format check passed on the final implementation.
- Focused changed unit tests passed 17/17. The full suite's previously isolated unrelated Windows PID-capture timeout is documented in the run report.

## Security mutation evidence

- The correction and draft function mutants were killed by the catalog invariant requiring `prosecdef=true` after an attempted SECURITY INVOKER alteration.
- Savepoint rollback restored each exact function definition and catalog flag. Stack D tests completed successfully; `git diff --check` returned 0. There were no RLS policy or RLS table changes in T140.
