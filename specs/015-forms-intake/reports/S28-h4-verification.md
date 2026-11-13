# S28 F15 h4 verification

- Branch `015-forms-intake`; final code head before this evidence commit: `491890acf17294ef4dc76b175611edbac8a8ab4b`.
- PR #44; last observed head `491890acf17294ef4dc76b175611edbac8a8ab4b`; merge state `UNSTABLE`.
- Stack D only; no reset. StartedAt before and after: `2026-11-02T18:43:05.538142345Z`. Full default integration left 155 migration records and 0 cron jobs; scheduler E2E opt-in was unset.

## Failure reconciliation and fixes

The five package/registration failures were run on Stack D in the focused specs on both this branch and a detached `ed88574` tree. The exact outcomes match: PO package management shows the generic unavailable state in EN and AR; PO registration management returns 404 in EN and AR; the late-issuance case cannot find its Issue link after the registration management route is unavailable. No relevant page/service implementation difference exists between these trees. This establishes these as pre-existing main/D failures rather than branch regressions. The exact underlying D fixture/workspace/capability cause was not proven, so no speculative product change was made. All five also fail in the matched full runs.

| Earlier branch-run failure                                                                                    | Root cause                                                                                                                       | Fix / evidence                                                                                                                            | SHA       |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Anonymous auth redirect and client-account denied-route tests targeted port 3000 while branch app ran at 3315 | Test origin was hard-coded instead of following the configured Playwright origin                                                 | Use `PLAYWRIGHT_BASE_URL` in `tests/e2e/auth.spec.ts` and Playwright `baseURL` in `tests/e2e/client-accounts.spec.ts`; focused tests pass | `491890a` |
| Client-signup keyboard focus case was flaky under parallel workers                                            | `page.keyboard.press('Tab')` could target a changed focus context under concurrent browser load                                  | Target Tab through `nameField.press('Tab')`; retain the focus assertion; passes serially and in final full run                            | `491890a` |
| Forms production/Glass transient failures from initial high-worker run                                        | Worker contention; focused and matched one-worker full run pass without changes                                                  | No product/test change; final complete run evidence below                                                                                 | —         |
| PO package EN/AR; registration EN/AR; late issuance                                                           | Same failures on exact main commit and branch against D, with same rendered outcomes; no branch delta. Subcause remains unproven | No branch fix; excluded from branch-only regression count but retained as pre-existing failures                                           | —         |

The final comparison used one worker for each full suite to avoid worker contention and to keep both runs comparable. Branch `491890a`, configured base URL `http://localhost:3315`: **288 passed, 5 failed, 15 skipped** (308 total). Main `ed88574`, base URL `http://localhost:3000`: **183 passed, 20 failed, 15 skipped** (218 total). There are **zero branch-only failures**. Branch and main share these five failures:

1. PO package management, English: empty-state expectation; generic unavailable state rendered.
2. PO package management, Arabic: empty-state expectation; generic unavailable state rendered.
3. PO registration management, English: management screen expected; route returns 404.
4. PO registration management, Arabic: management screen expected; route returns 404.
5. Late issuance: Issue link expected; absent after registration route failure.

Main's other 15 failures are client-account/storage cases absent from the branch full run: completion capture scrubbed (AR, EN); pending submission disables form; invalid fields (AR, EN); unavailable retry (AR, EN); committed signup retry; consumed signup retry (AR, EN); identity collision; duplicate response classes (AR, EN); lost committed response; and real pending-client JWT storage denial.

## Final-head gates

| Gate                          | Result                                                       |
| ----------------------------- | ------------------------------------------------------------ |
| Unit (`npm run test`)         | Pass: 185 files, 2,296 passed                                |
| Lint                          | Pass                                                         |
| Typecheck                     | Pass                                                         |
| Format check                  | Pass                                                         |
| Build                         | Pass                                                         |
| Edge build                    | Pass                                                         |
| Secrets check                 | Pass                                                         |
| Size                          | Pass: web 8,711.13 KiB (13.29%); cron 11.76 KiB (0.02%)      |
| Migration timestamps          | Pass: 155 files; 11 documented merged exceptions             |
| `git diff --check`            | Pass                                                         |
| Full Stack D integration      | Pass: 120 files; 1,595 passed, 2 skipped / 1,597; 1,008.07 s |
| Full Playwright branch        | 288 passed, 5 failed, 15 skipped                             |
| Full Playwright main baseline | 183 passed, 20 failed, 15 skipped                            |

## Task and review status

- T009 complete: approved editable starter workflow/matrix passed on the final branch head; immutable snapshot and validation checks have persisted-form integration evidence above.
- T024 remains open. Although the matched suite has zero branch-only failures, its required complete synthetic acceptance is not achieved while the five shared failures and 15 permitted-by-runner skips remain; required full acceptance matrix evidence is not complete.
- T029 remains blocked on the prerequisites listed in `tasks.md`.
- CodeRabbit review request and full 40-minute GraphQL poll are pending on the final evidence-bearing head. No CI window was opened.
