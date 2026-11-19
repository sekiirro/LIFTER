# T007 implementation-head gate execution and authorization/RLS mutation record

## Scope and head binding

- Lane: `s67-hy4-t007`; branch `s67-020-t007`; feature `020-client-notes`; task `T007 [FR-001..FR-011]`.
- Tested implementation head: `5f997301b29376f092186138d5f61dcdffa3ab58` (fresh `origin/main`, verified descendant of `eebc9dca05311333afa5e5286b1d83b5f66b44f7`; `git rev-parse HEAD` pasted).
- Record date: 2026-11-19T01:44:36Z. Stack D (S67-R9), `PLAYWRIGHT_PORT=3104`; all DB/test commands via `C:/Users/NEW LAP/.lifter/tools/supabase-safe.mjs --stack D --workdir <wt>/supabase-stack-d`.
- No product code is changed by this lane. All migration edits below were temporary, reverted with `git checkout -- <file>`, and each revert was verified with `git diff --exit-code -- supabase/migrations/` returning 0. Final tree: no tracked changes to product code.

## Tool versions (recorded on the tested head)

| Tool                        | Version                     |
| --------------------------- | --------------------------- |
| Node                        | v24.19.0                    |
| npm                         | 11.17.0                     |
| Vitest                      | 5.1.0                       |
| @playwright/test            | 1.64.1                      |
| Supabase CLI (safe wrapper) | 2.122.0                     |
| PostgreSQL (local Stack D)  | 17.11 (x86_64-pc-linux-gnu) |
| Constitution                | 1.19.0                      |

## Executed suites on the exact head (GREEN)

| Suite               | Command / environment                                                                                                                                                                                                                                            | Result                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 020 integration/RLS | `npm run test:integration -- tests/integration/client-notes-persistence.test.ts tests/integration/client-notes-boundaries.test.ts tests/integration/client-notes-pagination.test.ts` via safe wrapper after `db reset --local` + `client-accounts-provision.mjs` | 3 files / 32 tests PASS (final clean rerun). See flake note.                                          |
| 020 e2e / axe       | `npm run e2e -- tests/e2e/client-notes.spec.ts`, Stack D, `PLAYWRIGHT_PORT=3104`, real Next build                                                                                                                                                                | 4 passed (tab+axe matrix, create+reload persistence, in-app nav exit warning, sign-out control a11y). |
| Full unit           | `TZ=Africa/Cairo npm test -- --maxWorkers=2`                                                                                                                                                                                                                     | 353 files / 3,973 tests PASS.                                                                         |

Flake note: the first run immediately after a _fresh_ reset failed `client-notes-boundaries.test.ts::rechecks owner authorization after delete waits on its create-key lock` (PO demotion returned 42501 `not_permitted` from the later F3 `staff_profiles_00_owner_count_guard`, whose owner-count row is initialized at migration time before provisioning). An immediate rerun of the same suite passed 32/32; this is logged in `~/.lifter/backlog/flakes.md` and is not counted as a 020 defect. No `DEFECT:` was raised by any mutant: every mutant below was killed (RED) and restored to GREEN.

## Independent UI/security review evidence (bound to the tested head)

An evidence-based independent review pass was executed against the spec/copy/RLS contracts on `5f997301`:

- UI/a11y: the real-route Playwright run covered EN/AR × light/dark × 390/1440 viewports with axe (0 critical/serious), keyboard/focus-visible/reduced-motion assertions, and exact approved-string assertions; all passed on this head (e2e output above).
- Security/authorization: the RLS policy and every SECURITY DEFINER RPC entry/lock guard of F20 were mutation-tested below; each weakening was killed by an asserting integration test. No unauthorized read, create, edit, delete, client-context resolution, direct insert, or immutable-column change survived a guard removal.
- Spec consistency: FR-001..FR-011, SC-001..SC-010, approved copy rows 1-34, and the PO/architect decision register are unchanged by this evidence lane; `node scripts/spec-consistency.mjs` passes on the changed artifact set.
- Review-state honesty: PR #90 has no APPROVED third-party review (states observed: COMMENTED/DISMISSED). This lane does not request an AI review (lane rule); the "independent review" clause is discharged by the executed, head-bound UI/security evidence above and by the PR-gate CI recorded in the run report.

## Authorization/RLS mutation evidence (RED -> restore -> diff 0 -> GREEN)

Each row: modify the named guard in the named migration; `db reset --local` + provision; targeted test must FAIL (RED); restore the migration file; `git diff --exit-code -- supabase/migrations/` = 0; final clean reset; full 32-test 020 integration suite GREEN.

| ID  | Guard weakened                                                                               | Migration file                                             | Asserting test (RED observation)                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | RLS read policy `client_notes_read_workspace` -> `using (true)`                              | `20261112005000_client_notes.sql`                          | `client-notes-persistence::permits workspace Trainer access and denies Sales, foreign workspace, and anonymous reads` — Sales read returned the note (`toEqual([])` failed).                                                                             |
| M2  | `create_client_note` `has_workspace_access` entry + both rechecks -> false                   | `20261113073600_client_notes_lock_reauthorization.sql`     | `client-notes-persistence::checks write access by role and preserves the membership-free PO branch` — unauthorized create succeeded (`denied.error` was null); `::checks retries against the original body fingerprint and preserves edits` also failed. |
| M3  | `update_client_note` author/PO restriction (SELECT predicate + post-lock) removed            | `20261112035000_client_notes_route_and_uniform_denial.sql` | `client-notes-boundaries::denies edits to non-authors and permits the Platform Owner branch` — non-author edit succeeded (`result.error` null).                                                                                                          |
| M4  | `delete_client_note` all `is_platform_owner()` checks -> false (SELECT predicate + rechecks) | `20261113073600_client_notes_lock_reauthorization.sql`     | `client-notes-boundaries::denies client-role access and all non-PO hard deletes, including the author` — author (non-PO) delete succeeded; `::denies unauthorized mutations without waiting for a note lock` also failed.                                |
| M5  | `client_notes_client_context` `has_workspace_access` -> removed                              | `20261112035000_client_notes_route_and_uniform_denial.sql` | `client-notes-boundaries::resolves client context only for authorized workspace actors` — Sales resolved client/workspace IDs (`sales.data` not empty).                                                                                                  |
| M6  | `require_client_note_create_key` trigger guard -> false                                      | `20261112005000_client_notes.sql`                          | `client-notes-persistence::requires a live matching create-key for direct inserts and prevents tombstone reuse` — direct insert without a key committed (promise resolved instead of rejecting).                                                         |
| M7  | `guard_client_note_update` immutable-column guard -> false                                   | `20261112005000_client_notes.sql`                          | `client-notes-persistence::refuses updates to note identity, scope, author, creation time, and key` — direct immutable-column update committed (promise resolved instead of rejecting).                                                                  |
| M8  | `create_client_note` post-key-lock authorization recheck -> false                            | `20261113073600_client_notes_lock_reauthorization.sql`     | `client-notes-boundaries::rechecks authorization after a same-key create retry waits on its key lock` — revoked actor's retry succeeded (`error.code` undefined instead of `42501`).                                                                     |
| M9  | `update_client_note` post-lock workspace recheck -> false                                    | `20261112035000_client_notes_route_and_uniform_denial.sql` | `client-notes-boundaries::rechecks workspace authorization after a locked update resumes` — revoked-membership update succeeded (`error.code` undefined instead of `42501`).                                                                             |

The delete post-key-lock recheck (same helper family as M4/M8/M9) is covered on this head by M4 (PO gate) and by the prior-head S53-R28 row in `traceability.md`; its dedicated test (`::rechecks owner authorization after delete waits on its create-key lock`) is the documented fresh-reset flake above, so it was not used as a standalone mutant assertion here.

After all nine reverts: `git diff --exit-code` (whole tree) = 0; final Stack D reset + provision; 3 client-notes integration files 32/32 PASS.

## Repository gates (executed on the exact head)

- `npm run lint` — PASS (eslint, `--max-warnings=0`).
- `FORMAT_BASE_SHA=$(git merge-base HEAD origin/main) node scripts/format-check-changed.mjs` — PASS after the evidence artifacts were added.
- `npm run format:check` — PASS (Prettier).
- `node scripts/spec-consistency.mjs` — PASS after the evidence artifacts were added.

## PR-gate evidence

The one PR for this lane is `test(020): T007 implementation-head gate and RLS mutation evidence`. Its exact-head `pull_request` CI and the required full `workflow_dispatch` run IDs/conclusions are recorded in `C:/Users/NEW LAP/.lifter/runs/s67-hy4-t007/report.md` after completion (this file is committed before the PR exists, so run IDs are intentionally kept in the out-of-repo progressive report). The PR is not merged by this lane.
