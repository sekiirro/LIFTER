# Traceability: F9 Packages and Package Versions

Static source inspection only. No tests were run in this compliance lane. VERIFIED indicates that a concrete asserting test is present; it does not represent a fresh execution result.

| Requirement | Task(s) | Asserting test(s) | Evidence | Status |
|---|---|---|---|---|
| FR-001 | T003, T006, T011, T013, T025 | `tests/integration/packages-publish.test.ts::creates once and audits exact code with global PO attribution`; `denies create globally for every non-PO...` | Source/test on `d04ef52` | VERIFIED |
| FR-002 | T003, T011, T015 | `tests/integration/packages-publish.test.ts::serializes independent first/later distinct publications...`; `tests/integration/packages-reads.test.ts::covers every identity x workspace...` | Source/test on `d04ef52` | VERIFIED |
| FR-003 | T003, T006, T011, T013, T025 | `tests/integration/packages-publish.test.ts::accepts every preset, custom equivalents...`; `tests/unit/packages-validation.test.ts` duration validation cases | Source/test on `d04ef52` | VERIFIED |
| FR-004 | T003, T006, T008, T011, T013, T019, T021, T024, T025 | `tests/integration/packages-publish.test.ts::accepts every preset...`; `tests/unit/packages-validation.test.ts::preserves authored content and exact ceiling` | Source/test on `d04ef52` | VERIFIED |
| FR-005 | T003, T004, T011, T013 | `tests/integration/packages-publish.test.ts::serializes independent first/later distinct publications...`; exact replay/publication tests | Source/test on `d04ef52` | VERIFIED |
| FR-006 | T003, T011, T013, T015 | `tests/integration/packages-publish.test.ts::all DML roles hit update/delete guards...`; `truncate guards raise...` | Source/test on `d04ef52` | VERIFIED |
| FR-007 | T004, T015, T017, T024, T025 | `tests/integration/packages-availability.test.ts::confirms false -> true -> false with exact events...`; `serializes publication with toggle...` | Source/test on `d04ef52` | VERIFIED |
| FR-008 | T002, T003, T019, T021, T026 | `tests/integration/packages-reads.test.ts::covers every identity x workspace...`; `embedded safe relations never expose foreign offers` | Source/test on `d04ef52` | VERIFIED |
| FR-009 | T004, T019, T021, T026, T029 | `tests/integration/packages-reads.test.ts::explicit, wildcard, embedded commission requests fail...`; `tests/unit/packages-money.test.ts::rejects invalid currency and exact commission` | Source/test on `d04ef52` | VERIFIED |
| FR-010 | T001, T003, T006, T009, T011, T013, T015, T017, T019, T021, T026, T029 | `tests/unit/packages-actions.test.ts::requires actor and rederives each request`; `::obeys an app capability denial even for a verified PO and accepting RPC`; `::denies forged accepting RPC role %s`; `::denies malformed targets %#`; `::maps generic failure %#`; `::catches network and environment exceptions`; `tests/unit/packages-actions.test.ts` beforeEach/afterEach console spies; `tests/unit/packages-read.test.ts::maps unavailable safely without logging or cross-user cache`; `tests/integration/packages-publish.test.ts::denies create globally for every non-PO including no profile and anon`; `::enforces role x own/foreign publication before target lookup`; `tests/integration/packages-availability.test.ts::denies non-PO x workspace; missing and foreign offers are generic`; `tests/integration/packages-reads.test.ts::denies unknown commission workspace generically` | Source/test on `d04ef52`; source inspected statically, not executed in this lane | VERIFIED |
| FR-011 | T004, T011, T013, T015, T017, T019 | `tests/integration/packages-publish.test.ts::rolls back first/later publication when audit insertion fails...`; `tests/integration/packages-availability.test.ts::audit failure rolls back availability` | Source/test on `d04ef52` | VERIFIED |
| FR-012 | T021, T024, T025, T026 | `tests/unit/packages-page.test.ts::landing link is PO-only`; `shows generic safe error...`; `tests/e2e/packages.spec.ts` route/role cases | Source/test on `d04ef52` | VERIFIED |
| FR-013 | T008, T024, T025, T026 | `tests/e2e/packages.spec.ts` Arabic/English, theme, keyboard and accessibility cases; `tests/unit/packages-page.test.ts` | Source/test on `d04ef52`; T033 manual validation remains open | PARTIAL |
| FR-014 | T001, T002, T030, T034 | `tests/integration/packages-publish.test.ts`, `packages-reads.test.ts`, `packages-availability.test.ts`; `tests/e2e/packages.spec.ts` | Source/test on `d04ef52`; T031-T034 execution/review gates remain open | PARTIAL |
| SC-001 | T010, T014, T018, T020, T027, T028, T033 | `tests/integration/packages-reads.test.ts::covers every identity x workspace...` | Source/test on `d04ef52` | VERIFIED |
| SC-002 | T010, T032 | `tests/integration/packages-publish.test.ts::serializes independent first/later distinct publications...` | Source/test on `d04ef52`; mutation execution T032 open | PARTIAL |
| SC-003 | T010, T014, T032 | all-role update/delete/truncate guard tests in `tests/integration/packages-publish.test.ts` | Source/test on `d04ef52` | VERIFIED |
| SC-004 | T010, T014, T032 | audit success/rollback/no-op assertions in publish and availability integration tests | Source/test on `d04ef52` | VERIFIED |
| SC-005 | T022, T023, T033 | `tests/e2e/packages.spec.ts`; PO landing and safe loading assertions in `tests/unit/packages-page.test.ts` | Source/test on `d04ef52`; T033 manual review remains open | PARTIAL |
| SC-006 | T005, T007, T010, T018 | duration/required-term tests in `tests/unit/packages-validation.test.ts`, `tests/unit/packages-money.test.ts`, `tests/integration/packages-publish.test.ts` | Source/test on `d04ef52` | VERIFIED |

## Summary

- Functional requirements: 12 VERIFIED, 2 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- Success criteria: 4 VERIFIED, 2 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- Static verification only; no tests executed. T031-T034 remain unchecked. ND-F9-1..5 are product decisions, not PO-deferred functionality.
