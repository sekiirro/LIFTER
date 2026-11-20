# Independent verification dossier — F12 `012-registration-approval` T048

- **Lane / branch:** `s69-hy4-012close` / `s69-012-t048` (docs-only closeout, no DB stack)
- **Base:** `origin/main` `3b869e58f3629583100251986f3b0c2072d0b505`
- **Date:** 2026-11-20 UTC
- **Scope:** verification record only. This PR changes five Markdown artifacts; it changes no source, migration, test, workflow, config or lockfile, and runs no DB/stack operation.

## Verdict status — NOT an approval

This dossier assembles and verifies the evidence required by T048. It is **not** an architect approval and **not** a self-approval. Per T048 and S69-R5, the PO retains **plan, production-release and main-merge approvals**. The final independent architect verdict **awaits the architect's explicit exact-SHA approval of this PR**. No git merge, production action or main merge is authorized by this file or by this lane; the branch operator performs only the recorded documentation and git delivery steps.

## Clause-by-clause T048 verification

| #   | T048 clause (task text)                                                 | Verification recorded here                                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Architect independently reviews actual final diff                       | Diff scope verified: 5 Markdown files only (`git diff --name-only origin/main`); no code/migration/test change. Evidence cited below is from exact-head `origin/main` commits and CI runs, not from this lane's execution.                                                                                                                                    |
| 2   | Traceability                                                            | `traceability.md` reconciled: S67 T055 execution (66 passed on Stack B) moves FR-011, FR-014, FR-017 and SC-012 to VERIFIED; stale "unticked T055/PARTIAL" notes superseded; recomputed totals FR 20 VERIFIED / 9 PARTIAL, SC 7 VERIFIED / 5 PARTIAL. T048 remains explicitly ticked **pending architect exact-SHA approval on this PR** (see §Traceability). |
| 3   | Mutation evidence                                                       | Full Q-M01..Q-M24 campaign, 24/24 killed or retained under the task's explicitly accepted S64 evidence; S67 re-kills and Q-M23 detector repair recorded (§Mutations).                                                                                                                                                                                         |
| 4   | Selected-stack proof                                                    | Stack A U9 full integration and T043; Stack B T055/T056; Stack E Q-M reruns (§Selected stacks).                                                                                                                                                                                                                                                               |
| 5   | Money / isolation / UI gate results                                     | Killed money mutants, forced-RLS Q-M04, role-denial e2e journeys, T043 axe matrix and retained PNGs (§Money/isolation/UI).                                                                                                                                                                                                                                    |
| 6   | Exact-head CI                                                           | Four verified CI tuples, including the two final exact-head PR runs (§Exact-head CI).                                                                                                                                                                                                                                                                         |
| 7   | Record verdict in `review.md` through authorized git operator           | This file is that record; committed and pushed by the authorized git operator only.                                                                                                                                                                                                                                                                           |
| 8   | PO retains plan / production / main-merge approvals                     | Stated above and unchanged; no approval is claimed here.                                                                                                                                                                                                                                                                                                      |
| 9   | Do not mark self-approved or rerun git/tests as Claude                  | This lane records evidence and documentation only; no independent approval, no test rerun, no merge.                                                                                                                                                                                                                                                          |
| 10  | D-26 intermediate integration and full main merge gate remain mandatory | Recorded as outstanding; this closeout does not waive either gate.                                                                                                                                                                                                                                                                                            |

## Exact-head commit and CI evidence (verified via `gh`)

| Evidence                                                                                                      | Head / commit                              | CI run        | Event / conclusion           |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------- | ---------------------------- |
| PR #279 `s67-012-t044` (T044 remainder), merge `1bef2baa6e3ba3ddc551addbe9f100bf268f0be9`                     | `7f9e3325cf84daf81cb46ba698f884853e92da9c` | `44433383880` | `pull_request` / **success** |
| PR #281 `s67-012-t055` (T055 deletion-state replay/refusal), merge `6a233368bacbc5eee5ceb934c57bc828272c72cd` | `2d2e0117eb30d0d9fe80372302037887c126da0b` | `44459777458` | `pull_request` / **success** |
| Main tip `93864cdb02f9976fdada245e4e07c1198307050a`                                                           | `93864cdb02f9976fdada245e4e07c1198307050a` | `44531726491` | `push` / **success**         |
| PR #236 `s64-012-verification` (T047 exact-head tuple; earlier evidence)                                      | `1272d8ef2bf253edfdf7f66fd75b5c68fdffdada` | `44184629061` | `pull_request` / **success** |

Both final PR runs were re-checked with `gh run view <id> --json jobs`: every required job — `validate`, `docs-only`, `integration shard 1/3`, `integration shard 2/3`, `integration shard 3/3`, `storage`, `integration` — has `conclusion: success` and executed steps > 0 (22/5/23/23/23/19/5). The older #236 run is recorded as the T047 artifact tuple, not as final-head evidence.

## Mutation evidence — 24/24 Q-M ids

- **S64** (`de2b1fa7…`, Stack A): 17 mutants killed with reversible defect, meaningful RED, unconditional `finally` restore and identical GREEN (Q-M01, 02, 04, 05, 06, 07, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 24). Full per-mutant logs: `C:/Users/NEW LAP/.lifter/runs/s64-hy4-s123/`.
- **S67 remainder** (fresh `eebc9dca…`, disposable Stack E): Q-M03, 08, 09, 13, 21, 22 re-killed with safe reset/provision and restore proof; Q-M23 detector repaired in commits `c64d6483` and `58a82175` (hidden-at-start timer-count assertion; queued-callback-before-invocation assertion), then both Q-M23 visibility mutants killed; focused detector GREEN 11/11 and `git diff --exit-code` clean. The six non-rerun ids retain their historical S64 RED/GREEN records, which T044 explicitly accepts. No mutant was committed.

## Selected-stack proofs

- **Stack A (U9):** `npm run test:integration` 194 files passed / 5 skipped; 2,344 passed / 1 expected fail / 6 skipped / 5 todo. T043 Playwright 4 passed / 0 failed. Full non-DB gates and `check:secrets` PASS. `SIGNUP_*` values were loaded in-process and redacted; no `.env*` value was read or printed.
- **Stack B:** T055 66 passed (operations 34, replay 23, client-access 9) on `eebc9dca…`; T056 Stack B GREEN (15 integration files / 643 passed) with two killed mutants (T056-M1 drop emit, T056-M2 break dedupe key). Node v24.19.0, Vitest 5.1.0, PostgreSQL `17.11.0.006`, API 25421 / DB 25422.
- **Stack E:** Q-M reruns at API/DB 55421/55422 through `supabase-safe.mjs`; safe reset + Vault provisioning + restore proof for each mutant; no migration changed.

## Money / isolation / UI gate results

- Money mutants killed: Q-M07 (tie addend), Q-M08 (current-rate reversal commission), Q-M15 (commission field leak), Q-M19 (upfront/count correspondence), Q-M21 (prior-paid guard). Correction is a PO-only exact-value append-only reversal with fresh Cairo month booking.
- Isolation: Q-M04 (forced RLS) killed; role-denial e2e journeys (client/Trainer/Sales approval denial; Sales payment retained); deleted-client denials under FR-011/FR-014/FR-017/SC-012 verified; replay re-authorizes and returns the identical receipt with zero duplicate rows.
- UI: T043 **12-cell** pending-status matrix (AR-RTL / EN-LTR × light / dark × 390 / 768 / 1440) with axe `wcag2a,wcag2aa,wcag21aa,wcag22aa`, **0 serious / 0 critical** violations in every scan; staff/client journeys; **18 retained PNGs** in `tests/integration/evidence/f12-u9/` regenerated byte-identical (`git status` clean). Log scrub Q-M18 killed. No new token, dependency or motion introduced.

## Accepted scope boundaries (honestly disclosed)

- **FR-023 / SC-009 remain PARTIAL** solely for the lane-excluded **real rendered Stack A matrix and e2e work under U9**. T050/T051 have the S63 Stack A proof; T053/T054 are ticked with S65 focused 34/34 and the killed UI money mutant M1; no claim of the excluded rendered evidence is made. This is not a new requirement.
- **`check:migration-versions:remote`:** S64 recorded an external blocker — version `20261123000000` maps to two different filenames on other lanes' refs (F22 on `022-impl-client-portal` / `pr/108`; F23 on `023-impl-client-progress` / `024-impl-client-leaderboard` / `pr/109` / `pr/110`). Those PRs are out of this lane's scope and were not touched. Current-head re-verification on this closeout branch after `git fetch origin '+refs/pull/*/head:refs/remotes/origin/pr/*'`: `npm run check:migration-versions:remote` → **PASS** — "Cross-ref migration-version check passed across 597 remote refs; no version maps to different filenames." The historical external blocker no longer reproduces; this branch adds 0 migrations.
- No hosted, production, backup or D-26 intermediate-integration gate was executed by this lane; all remain mandatory under their own approvals.

## Traceability note

T048 is ticked in `tasks.md` **only** as the recorded closeout of this evidence dossier; the tick is explicitly pending the architect's exact-SHA approval of this PR. The PO retains all plan, production and main-merge approvals. No self-approval is claimed.
