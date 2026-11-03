# F11 Client Accounts and Signup — Traceability

**Analysed commit:** `0649423752419979d7f0eb3ef29ad2bf24689075` plus the documentation-only clarification in this commit.
**Method:** Static inspection of implementation, asserting test names and `tests/integration/client-accounts-verification.md`; no suite was run in this lane. Historical test results in the evidence document are cited, but not independently re-executed.

| Requirement | Tasks | Asserting tests / evidence | Status |
|---|---|---|---|
| FR-001 | T001-T005,T023-T030,T035-T038 | `client-accounts-signup.test.ts` signup validation and `password-policy.test.ts` shared password policy; verification.md U1/U6 | VERIFIED |
| FR-002 | T010-T015,T023-T030 | `client-accounts-signup.test.ts` invalid/expired link behavior; verification.md | VERIFIED |
| FR-003 | T010-T015 | `client-accounts-integrity.test.ts` atomic signup and rollback; verification.md U2/U3/U4 | VERIFIED |
| FR-004 | T010-T015,T023-T030 | `client-accounts-signup.test.ts` guarded consumption and expiry; verification.md | VERIFIED |
| FR-005 | T006-T010 | `client-accounts-integrity.test.ts` issued snapshot binding; verification.md U2 | VERIFIED |
| FR-006 | T010-T015,T023-T030 | `client-accounts-signup.test.ts` generic invalid and duplicate response assertions; verification.md | VERIFIED |
| FR-007 | T006-T010,T023-T030 | `client-accounts-integrity.test.ts` active identity uniqueness; archived-state behavior remains deferred by ND-F11-9a/9b | PARTIAL |
| FR-008 | T006-T010,T023-T030,T031-T034 | `client-accounts-integrity.test.ts` RLS/tenant isolation; `client-accounts-recovery.test.ts` scoped recovery; verification.md | VERIFIED |
| FR-009 | T003-T010,T019-T024 | `client-accounts-schema.test.ts`, `client-accounts-admission.test.ts` policy/grant assertions; verification.md | VERIFIED |
| FR-010 | T011,T019-T020,T041-T044 | `client-accounts-audit.test.ts`, `client-accounts-purge-schedule.test.ts`; signup-attempt retention asserted; other audit retention remains open under ND-F5-1/B4 | PARTIAL |
| FR-011 | T003-T005,T010-T015,T019-T030,T035-T038 | `password-policy.test.ts`, `client-accounts-signup.test.ts`, `client-accounts-admission.test.ts`; verification.md | VERIFIED |
| FR-012 | T031-T034 | `client-accounts-recovery.test.ts`; verification.md U7 | VERIFIED |
| FR-013 | T023-T030,T035-T038 | registration form unit/integration assertions and `client-accounts-verification.md` U8 evidence | VERIFIED |
| FR-014 | T023-T030,T035-T038 | `client-accounts-signup.test.ts` response headers/privacy assertions; `client-accounts-verification.md` | VERIFIED |
| FR-015 | T006-T015,T023-T030 | `client-accounts-integrity.test.ts` pending state/no access; signup completion assertions | VERIFIED |
| FR-016 | T021-T030,T035-T038 | `client-accounts-signup.test.ts` signed-in visitor/manual sign-out assertions; verification.md | VERIFIED |
| FR-017 | T003-T005 | `auth-signup-policy.test.ts` anonymous signup disabled and staff/recovery regression assertions; verification.md U1 | VERIFIED |
| SC-001..SC-010, SC-012 | T001-T044 as mapped in `tasks.md` | Requirement-specific tests listed above; `client-accounts-verification.md` captures historical executed results and acceptance evidence | VERIFIED |
| SC-011 | T007-T010,T023-T024,T029-T030,T044 | `client-accounts-integrity.test.ts` and signup duplicate privacy assertions prove generic collision response; archive/reviewer criteria remain deferred | PARTIAL |

## Summary

- FR: 15 VERIFIED, 2 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- SC: 11 VERIFIED, 1 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- The classifications are static evidence mappings; no tests were executed for this reconciliation. Historical task checkboxes were not changed.
