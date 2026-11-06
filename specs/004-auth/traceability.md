# F4 Traceability - static source review

Base: `origin/main` `7e2d0149b0370e4389b462130508352bbd69daa2`. Task mapping is taken from `tasks.md` task text; no tests or CI jobs were run for this documentation change. Status MAPPED means the task is ticked in `tasks.md` and merged; it is not a re-verification on this head. PARTIAL and UNVERIFIED mark rows whose cited test does not assert the requirement (read from source). VERIFIED is not claimed for any row.

| Requirement | Task(s) | Test(s) (file level, from tasks.md) | Evidence | Status | Gap |
|---|---|---|---|---|---|
| FR-001 | T014, T016 | `tests/e2e/auth.spec.ts` cited by tasks.md but it only checks login/recovery accessibility and redirects, not sign-in; password sign-in is exercised at Auth level only by `tests/integration/auth-recovery.test.ts` ("consumes once, sets a password and signs in with that password") | tasks.md `[x]`; merged on main | PARTIAL | No test drives the login server action (`app/login/actions.ts:19`) end to end. UNVERIFIED for the app sign-in flow. |
| FR-002 | T014, T016 | none found (`tests/e2e/auth.spec.ts` does not assert the generic invalid-credentials message `auth.invalid_credentials`) | tasks.md `[x]`; merged on main | UNVERIFIED | Coverage gap: no test asserts one generic message for wrong password and unknown email (`app/login/actions.ts:18-25`). |
| FR-003 | T014, T015 | none found (`tests/e2e/auth.spec.ts` has no sign-out step; `signOut` action at `app/(app)/actions.ts:6` is untested) | tasks.md `[x]`; merged on main | UNVERIFIED | Coverage gap: no test signs out through the app. |
| FR-004 | T009, T010, T011 | `tests/unit/actor.test.ts`; `tests/integration/auth-recovery.test.ts` (actor) | tasks.md `[x]`; merged on main | MAPPED | Test names not re-checked here. |
| FR-005 | T012, T013, T016, T023 | `tests/e2e/auth.spec.ts` | tasks.md `[x]`; merged on main | MAPPED | Test names not re-checked here. |
| FR-006 | T003, T004, T022 | `tests/integration/matrix-parity.test.ts`; `tests/integration/rls-catalog.test.ts` | tasks.md `[x]`; merged on main | MAPPED | Trainer scope: denied until T032 (SK-004-02, all workspace Trainers). |
| FR-007 | T017, T020, T021 | `tests/integration/auth-recovery.test.ts`; `tests/unit/recovery-link.test.ts` | tasks.md `[x]`; merged on main | MAPPED | Staff targets denied; matches ND-F4-6 decision SK-004-06. |
| FR-008 | T006, T017, T024 | `scripts/check-client-secrets.mjs` (CI step) | tasks.md `[x]`; merged on main | MAPPED | - |
| FR-009 | T003, T020 | `tests/integration/auth-recovery.test.ts` | tasks.md `[x]`; merged on main | MAPPED | - |
| FR-010 | T003, T020, T031 | `tests/integration/auth-recovery.test.ts` (placeholder 20 / 3 / 1 hour) | tasks.md `[x]` for T003/T020; T031 unchecked | PARTIAL | Decided limits (SK-004-04: 10 per staff per hour, 3 per client per 24 hours) are not implemented; T031. |
| FR-011 | T017, T019, T021 | `tests/unit/recovery-link.test.ts` | tasks.md `[x]`; merged on main | MAPPED | - |
| FR-012 | T003, T018, T020 | `tests/integration/auth-recovery.test.ts` | tasks.md `[x]`; merged on main | MAPPED | Session-lifetime enforcement deferred per `docs/13-production-readiness.md:34` (no task). |
| FR-013 | T018, T020 | `tests/integration/auth-recovery.test.ts` | tasks.md `[x]`; merged on main | MAPPED | - |
| FR-014 | T008, T014, T018, T019 | `tests/e2e/auth.spec.ts` | tasks.md `[x]`; merged on main | MAPPED | - |
| FR-015 | T016, T020, T021, T023, T024 | `tests/integration/auth-recovery.test.ts`; `tests/unit/recovery-link.test.ts`; `tests/e2e/auth.spec.ts` | tasks.md `[x]`; merged on main | MAPPED | - |
| AT-AUTH-01 (docs/01-traceability.md:45), manual reset: single-use, expiring, audited | FR-007, FR-011, FR-012, FR-013 via T017-T021; documentation T030 | `tests/integration/auth-recovery.test.ts` ("consumes once, sets a password and signs in with that password", "supersedes an earlier unused hash", "rejects an expired hash", "accepts a link verified 59 minutes after it was issued", "rejects a link verified 61 minutes after it was issued", "preflight, record and exact audit attribution"); `tests/unit/recovery-link.test.ts` | D-19 approved: S31-PO-2 SK-004-01; recorded in `docs/04-changes-and-questions.md:25` and spec Clarifications. Test names read from source; not executed on this head. | MANUAL RESET MAPPED; T030 UNCHECKED | Self-service email reset is PENDING under ND-F4-7 (unanswered; not built). Trainer manual reset pending T032 (SK-004-02). T030 also requires PR merged with CI and CodeRabbit gates; not met by the documentation change alone. |

## Decision rows

| Decision | Source | Spec location | Implementation |
|---|---|---|---|
| D-19 approved | S31-PO-2 SK-004-01 | spec.md Clarifications | n/a |
| ND-F4-4 limits | S31-PO-3 SK-004-04 | spec.md Clarifications, ND-F4-4 | Pending, T031 (FR-010) |
| ND-F4-6 clients only | S31-PO-2 SK-004-06 | spec.md Clarifications, ND-F4-6 | Matches current design |
| ND-F4-1 Trainers | S31-PO-2 SK-004-02 "All workspace Trainers" | spec.md Clarifications, ND-F4-1 | Pending, T032 (FR-006); Trainers denied until then |
| ND-F4-2 delivery | S31-PO-2 SK-004-03 "Copy only" | spec.md Clarifications, ND-F4-2 | Satisfied: `components/auth/RecoveryLinkDialog.tsx:40` copies only; no share action |
| ND-F4-3 session-lifetime enforcement deferral | `docs/13-production-readiness.md:34` (not in ledger) | spec.md Clarifications, ND-F4-3 | None; no task |
