# Traceability: F10 Registration Links

Static source/evidence review only; no tests were executed in this compliance lane. VERIFIED means concrete asserting test evidence is recorded in `tasks.md`/linked files, not that it was freshly run.

| Requirement | Task(s) | Asserting test evidence | Source/evidence | Status |
|---|---|---|---|---|
| FR-001 | T001-T002, T004, T010, T012, T021, T023, T025-T026, T029 | `tests/integration/registration-links-issue.test.ts` role/scope matrix; actions/reads/matrix parity | `tasks.md:T034`, `tests/integration/registration-links-verification.md`, commit evidence recorded in task artifact | VERIFIED |
| FR-002 | T002, T004, T010, T012, T023 | `tests/integration/registration-links-issue.test.ts::R10-1 validates the schedule against the exact displayed version`; integrity and reads tests | `tasks.md:T034` | VERIFIED |
| FR-003 | T004, T008, T010, T012, T016, T021, T025, T030 | `tests/unit/registration-links-token.test.ts::requests 32 random bytes...`; dialog show-once tests; audit/open tests | `tasks.md:T034` | VERIFIED |
| FR-004 | T004, T006, T010, T012, T023, T025 | `tests/unit/registration-links-validation.test.ts`; issue/integrity/dialog schedule tests | `tasks.md:T034` | VERIFIED |
| FR-005 | T004, T014, T016 | `tests/integration/registration-links-integrity.test.ts`; open marker guard tests | `tasks.md:T034` | VERIFIED |
| FR-006 | T008, T010, T012, T030 | `tests/integration/registration-links-issue.test.ts::global actor limit serializes concurrent calls...`; actor-limit and generic-failure cases | `tasks.md:T034`; production rate values remain ND-F10-3 | VERIFIED |
| FR-007 | T004, T006, T014, T016, T018 | `tests/integration/registration-links-open.test.ts`; `tests/integration/registration-links-audit.test.ts::first anonymous open emits exactly one empty-detail event...` | `tasks.md:T034` | VERIFIED |
| FR-008 | T006, T016, T023 | `tests/unit/registration-links-grace.test.ts`; SQL parity boundary cases | `tasks.md:T034` | VERIFIED |
| FR-009 | T008, T018, T025-T026, T030 | `tests/e2e/registration-links.spec.ts` public/privacy cases; `tests/unit/registration-links-open.test.ts`; no-referrer assertions | `tasks.md:T034` | VERIFIED |
| FR-010 | T004, T021, T023, T026, T030 | `tests/integration/registration-links-reads.test.ts`; reads and commission authorization matrix | `tasks.md:T034` | VERIFIED |
| FR-011 | T004, T010, T012, T014, T016, T021 | `tests/integration/registration-links-audit.test.ts::first anonymous open emits exactly one empty-detail event...`; audit rollback tests | `tasks.md:T034` | VERIFIED |
| FR-012 | T006, T012, T023, T025-T026 | `tests/e2e/registration-links.spec.ts`; page/dialog tests and AR/EN checks | `tasks.md:T034` | VERIFIED |
| FR-013 | T001, T004, T006, T016, T031, T034 | F11 contract compatibility probes in issue/integrity tests; F10 task artifact explicitly disclaims F11 implementation test | `tasks.md:T034`; contract-only boundary | VERIFIED |
| FR-014 | T001-T002, T031, T034 | Unit/integration/e2e/matrix/mutation evidence enumerated by T034; historical independent audit is recorded | `tasks.md:T034`, `tests/integration/registration-links-verification.md` | VERIFIED |
| SC-001 | T009, T011, T020, T022, T027-T029 | role × scope × schedule integration and e2e fixtures | `tasks.md:T034` | VERIFIED |
| SC-002 | T003, T005, T009, T032 | issue concurrency/replay and rollback tests | `tasks.md:T034`; mutation campaign recorded | VERIFIED |
| SC-003 | T005, T013, T015, T017, T019, T032 | grace-time boundary/parity and invalid-response tests | `tasks.md:T034` | VERIFIED |
| SC-004 | T007, T011, T013, T024, T030, T033 | allow-listed audit and secret-scrub evidence | `tasks.md:T034` | VERIFIED |
| SC-005 | T019, T024, T027, T033 | `tests/e2e/registration-links.spec.ts` AR/EN, axe, keyboard, privacy journeys | `tasks.md:T034` | VERIFIED |
| SC-006 | T032, T034 | T034 mutation table records M1-M9 expected failure and restored green, with independent audit | `tasks.md:T034`, `tests/integration/registration-links-verification.md` | VERIFIED |

## Summary

- Functional requirements: 14 VERIFIED, 0 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- Success criteria: 6 VERIFIED, 0 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- No F11 implementation test is claimed; F10 only asserts the documented signup-transaction contract. No tests were rerun. ND-F10-1..5 remain open; carried ND-F9-1..5 are cross-referenced to SK-009-01..05.
