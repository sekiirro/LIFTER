# Traceability: F4 Authentication and manual recovery

Static source inspection only. No tests were run in this compliance lane. VERIFIED indicates a concrete asserting test is present; it does not represent fresh execution.

| Requirement | Task(s) | Asserting test(s) | Evidence | Status |
|---|---|---|---|---|
| FR-001 | T001-T005, T016 | `tests/e2e/auth.spec.ts::login and recovery are accessible`; `tests/unit/auth-actions.test.ts` | Source/test on `d04ef52` | VERIFIED |
| FR-002 | T004-T008, T016 | Generic sign-in denial cases in `tests/e2e/auth.spec.ts`; auth action tests | Source/test on `d04ef52` | VERIFIED |
| FR-003 | T009-T012 | `tests/unit/auth-actions.test.ts::signs out of the current browser only` | Source/test on `d04ef52` | VERIFIED |
| FR-004 | T001-T015, T017-T025 | `tests/unit/auth-middleware.test.ts::ignores forged identity headers and an unverified user`; `tests/integration/auth-recovery.test.ts::reads verified staff rows...` | Source/test on `d04ef52` | VERIFIED |
| FR-005 | T013-T016, T023 | `tests/e2e/auth.spec.ts::anonymous pages redirect with a same-site return path`; `recovery without a token is invalid and health stays public` | Source/test on `d04ef52` | VERIFIED |
| FR-006 | T017-T022,T032 | `tests/integration/auth-recovery.test.ts` covers current PO/WO role/workspace matrix; approved all-Trainer behavior is not implemented or asserted | Source/test on `d04ef52`; S31-PO-2; no current test for approved Trainer scope | PARTIAL |
| FR-007 | T017-T020 | `tests/unit/recovery-link.test.ts::denies a foreign workspace despite a successful preflight`; integration generic denial cases | Source/test on `d04ef52` | VERIFIED |
| FR-008 | T017-T021, T024 | `scripts/check-client-secrets.mjs`; CI configuration and static asset scan control | Source on `d04ef52`; scan not executed in this lane | PARTIAL |
| FR-009 | T020-T022 | `tests/integration/auth-recovery.test.ts` exact audit attribution and audit/write rollback cases | Source/test on `d04ef52` | VERIFIED |
| FR-010 | T020-T022,T033 | Existing tests assert prior placeholder thresholds, not S31-PO-3's 10 per issuer per rolling hour and 3 per client per rolling 24 hours | Source/test on `d04ef52`; approved values not implemented/configuration not verified | PARTIAL |
| FR-011 | T019-T020, T024 | `tests/e2e/auth.spec.ts::closing the recovery dialog clears the displayed link`; log/scrub controls | Source/test on `d04ef52` | VERIFIED |
| FR-012 | T017-T022,T031 | `tests/integration/auth-recovery.test.ts::supersedes an earlier unused hash`; `rejects an expired hash`; single-use test | Source/test on `d04ef52`; runtime behavior is covered but approved provider configuration is not verified in every environment | PARTIAL |
| FR-013 | T017-T023 | `tests/integration/auth-recovery.test.ts::consumes once, sets a password and signs in with that password`; recovery action tests | Source/test on `d04ef52` | VERIFIED |
| FR-014 | T016, T018-T023 | `tests/e2e/auth.spec.ts::login and recovery are accessible` for Arabic and English | Source/test on `d04ef52`; no assertions found for keyboard access, loading states, complete input/error coverage, or Design System use | PARTIAL |
| FR-015 | T016, T020-T025 | Middleware, recovery integration, and secret-scan checks mapped by tasks | Source/tests on `d04ef52`; no suite or secret scan executed | PARTIAL |
| SC-001 | T016, T023 | `tests/e2e/auth.spec.ts::anonymous pages redirect with a same-site return path`; middleware tests | Source/test on `d04ef52` | VERIFIED |
| SC-002 | T016, T020-T022 | forged-input and workspace matrix tests in auth middleware/recovery suites | Source/test on `d04ef52` | VERIFIED |
| SC-003 | T020-T022,T032 | recovery generation role × workspace matrix covers current roles; approved all-Trainer behavior has no asserting test | Source/test on `d04ef52`; S31-PO-2 behavior not implemented | PARTIAL |
| SC-004 | T020-T022 | audit attribution, denial, and rollback integration assertions | Source/test on `d04ef52` | VERIFIED |
| SC-005 | T020-T025 | secret scan and recovery audit/log checks | Source/test/control on `d04ef52`; secret scan not executed | PARTIAL |
| SC-006 | T020-T022 | `tests/integration/auth-recovery.test.ts` single-use, superseded, and 59/61-minute expiry cases | Source/test on `d04ef52` | VERIFIED |
| SC-007 | T016, T020-T023 | `tests/e2e/auth.spec.ts::login and recovery are accessible` | Source/test on `d04ef52`; no assertion found for the specified under-2-minute bound | PARTIAL |

## Summary

- Functional requirements: 9 VERIFIED, 6 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- Success criteria: 4 VERIFIED, 3 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- Static verification only; no tests or scans executed. T030 closure is directed by S31-PO-2, but the task remains unchecked until its current-head review/CI gates pass. ND-F4-7 remains open; approved Trainer and limit behavior is recorded but unimplemented, and provider expiry configuration verification remains pending.
