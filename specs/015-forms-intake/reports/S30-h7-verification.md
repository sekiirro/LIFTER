# S30 h7b verification — stopped at committed boundary

## Boundary and gates

- C: free at start: 27.27 GiB; current free: 27.26 GiB (required minimum 15 GB).
- Branch `015-forms-intake`; starting HEAD `ba0f2adfe2cbef7bd737a5751e8fdca678d63150`; clean before this round.
- PR #44 base `main`, changedFiles 290. Stack D was not started, stopped, reset, or migrated except through the safe wrapper; wrapper launcher probe succeeded. Earlier documented D fingerprint: expected StartedAt `2026-11-02T18:43:05.538142345Z`, cron.job 0. This round's before/after fingerprint was not collected.
- Spec Kit scope is the existing-PR Q6 exception only. Analyze remains FAIL per the architect handoff (T049); no new feature task or requirements were added.
- Full Design Gate is incomplete: rendered UI files changed, but the mandated complete skill catalog review and applicable skill load/self-review were not completed. This is an outstanding gate, not a pass.
- No new user-facing strings. Signup blob change listed below.

## Findings addressed in this boundary

Changes were checked against the current code. Current edits include:

| Thread | Finding | Change | Evidence |
|---|---|---|---|
| `PRRT_kwDOVYgYQ86zMtVd` | Number input in builder preview lost its displayed value after input | `FormPreview` stringifies numeric answer values for controlled input | `components/forms/FormPreview.tsx` |
| `PRRT_kwDOVYgYQ86zMtVs` | Successful answer correction left dirty/save state set | Clear dirty refs/state only when latest answers still equal the submitted correction snapshot | `components/forms/QuestionFlow.tsx` |
| `PRRT_kwDOVYgYQ86zMtV5` | Authorized-route age assertion was fixed at 36 | Derive expected value using `calculateAgeInCairo('1990-04-12', new Date())` | `tests/e2e/forms-authorized-route.spec.ts` |
| `PRRT_kwDOVYgYQ86zNY1t` | Authenticated terminal Telegram payload/replay response used retry-triggering non-2xx | Authenticated invalid JSON and invalid/replayed start now return 200 | `app/api/telegram/webhook/route.ts` |
| `PRRT_kwDOVYgYQ86zNY2b` | Signup validation effect could refocus during identity edits | Do not steal focus when another form control already has focus | `app/register/[token]/SignupForm.tsx` |
| `PRRT_kwDOVYgYQ86zNY2s` | Telegram sendMessage fetch had no bound | Add a 10-second abort timeout | `lib/forms/telegram-delivery.ts` |
| `PRRT_kwDOVYgYQ86zNY35` | E2E locale/theme cookies used hard-coded fallback origin | Use configured Playwright project baseURL and require it | `tests/e2e/forms-production-route.spec.ts` |
| `PRRT_kwDOVYgYQ86zNY4P` | Assignment mutation test used an unconditional failing assertion | Query matching initial-occurrence rows and assert one row after dropping uniqueness | `tests/integration/forms-r3-assignment-invariants.test.ts` |

## Remaining blocker

`PRRT_kwDOVYgYQ86zNY4I` asks that committed SQL function mutants cannot survive abrupt process termination. The current helper installs a globally visible committed `CREATE OR REPLACE FUNCTION` mutation so other concurrent sessions can observe it; normal cleanup restores it in `finally`. The integration harness connects all sessions to one shared Stack D database. A transaction-local mutation would be invisible to the multiple independent connections used by these tests, including the concurrency assertions. The harness has no isolated per-test database lifecycle, and no safe rollback mechanism for a process death was found. I did not invent a watchdog or alter Stack D lifecycle. This finding remains actionable and unresolved; the full h7 closeout is blocked here.

## Verification completed

- Focused unit suites: 5 files, 27 tests passed (forms builder, correction, profile prefill, Telegram, signup form).
- Stack D focused integration: `forms-r3-assignment-invariants.test.ts`, 2/2 passed through S30-R7 Node launcher and safe wrapper.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed before report generation.
- Prettier check on all changed source, test, and report files: passed. `git diff --check`: passed.
- Full unit/lint/typecheck/build/build:edge/secrets/size/migration/full Stack D/full Playwright gates were not run. No CodeRabbit review was requested in this boundary.

## Review state and blob changes

- CodeRabbit latest review head remains `c976d661593cb3b40287c35282cc538af45dbace`; no new review was requested. Eight addressed threads were replied to and resolved with commit `93d7be92485a14c4dd84af53d43d09629eab5ccd`; unresolved count is 1 (`PRRT_kwDOVYgYQ86zNY4I`).
- SIGNUP BLOB CHANGES: `app/register/[token]/SignupForm.tsx`, prior blob `77f8a6c`; new blob `a3a5fac373af2d551ba171eede396a8081aae0d2`.
- PO-DECISION-NEEDED: none found in these fixes.
- This report records a partial boundary; T009/T024 task status was not changed.

