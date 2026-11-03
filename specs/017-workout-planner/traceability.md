# F17 static traceability — 2026-11-03

Analysed commit: `fd84fbaa334b9bfb77038fe17cd4996e6533f90f`. Static verification only; tests were not run. VERIFIED means the named test and relevant assertion were confirmed to exist in source. Database, integration, and runtime criteria remain PARTIAL or NOT-FOUND.

## Functional requirements

| Requirement | Task(s) | Test(s) | Evidence | Status |
|---|---|---|---|---|
| FR-001 | T011, T016, T019, T020 | Plan Core contract not present in this checkout | F17 spec delegates lifecycle to PC-FR-001..007; no F17 DB implementation found for full contract | PARTIAL |
| FR-001a | T019 | Plan Core delivery/activation contract unavailable | `spec.md:76`; PC-FR-004/005 unresolved on this branch | PARTIAL |
| FR-002 | T011, T016-T018 | Plan Core lifecycle contract unavailable | `spec.md:77`; dependent tasks unimplemented | PARTIAL |
| FR-003 | T002, T007, T011, T013 | `tests/unit/workout-schema.test.ts::accepts ordered sessions, rest days, references, sets, and document notes`; `tests/unit/workout-document-ops.test.ts` | Schema and operation source/tests exist; DB persistence tasks unchecked | PARTIAL |
| FR-003a | T026-T027 | `tests/unit/workout-builder-input.test.ts` | Picker UI implementation/tests exist; F16 indexed integration not statically verified here | PARTIAL |
| FR-004 | T007, T036, T041 | `tests/unit/workout-id-continuity.test.ts::duplicates an exercise with a new item id and new ids for every set`; `tests/unit/workout-document-property.test.ts::preserves every parameter across 1,000 seeded reorder/move/duplicate cases` | Tests assert identity continuity and parameter preservation | VERIFIED |
| FR-004a | T007, T041 | `tests/unit/workout-id-continuity.test.ts::retains known ids when the same day or item is edited`; `...::duplicates a day with a new id for every descendant item and set` | Named assertions present | VERIFIED |
| FR-004b | T021 | Contributor UI/source tests not confirmed | task exists; no verified immutable contributor contract test mapped | NOT-FOUND |
| FR-005 | T026-T028 | `tests/unit/workout-builder-input.test.ts`; `tests/unit/workout-schema.test.ts` | Exercise defaults path partial; catalog-backed data contract depends on F16 | PARTIAL |
| FR-006 | T012, T022-T025, T037 | `tests/unit/workout-template-schema.test.ts`; `tests/unit/workout-template-management.test.ts`; `tests/e2e/workout-templates.spec.ts` | Pure template logic tested; persistence/RLS/auth remain unchecked | PARTIAL |
| FR-007 | T018, T038 | Plan Core readiness/publish contract unavailable | `spec.md:85`; no DB gate test on current head | PARTIAL |
| FR-008 | T029, T032-T033 | `tests/unit/workout-schema-registry.test.ts` | Versioned schema path tested; authorized dynamic video resolution not fully proven | PARTIAL |
| FR-009 | T020, T040 | No named immutable-version DB test verified | Relevant database tasks unchecked | PARTIAL |
| FR-010 | T004, T031 | `tests/unit/workout-volume.test.ts::uses the fixed 5,000-basis-point secondary-muscle credit` | Test confirms working-set credit calculation; full session/week aggregation assertion exists in same file | VERIFIED |
| FR-011 | T009, T032-T035, T042 | `tests/unit/plans-workout-export-guard.test.ts::writes coach-authored cells as string cells with the text unchanged`; `tests/e2e/workout-print.spec.ts::workout print preview covers locale, theme, viewport, and A4 print media` | Export helper/print tests exist; audited route authorization and denial evidence incomplete | PARTIAL |
| FR-012 | T014-T015, T025, T040 | No database/RLS test confirmed on current head | Stack-dependent isolation and mutation gates unchecked | PARTIAL |
| FR-013 | T005, T015-T017, T022, T040 | `tests/unit/workout-operation-keys.test.ts::replays the saved result for the same actor, key, action, and hash`; `...::conflicts when the same key is reused with another request hash or action` | Idempotency helper tests exist; atomic DB effects not verified | PARTIAL |
| FR-014 | T003, T006, T013, T043-T044 | `tests/unit/workout-schema-registry.test.ts` | Version parser tests present; size/performance gate T043 incomplete | PARTIAL |
| FR-015 | — | Out of scope per `spec.md:93` (PRD-12) | Explicitly excluded; no task expected | NOT-FOUND |
| FR-016 | T036-T037, T039, T045 | `tests/e2e/workout-builder.spec.ts`; `tests/e2e/workout-print.spec.ts` | UI tests exist; complete keyboard/axe and design gate evidence not established | PARTIAL |

## Success criteria

| Criterion | Task(s) | Test(s) | Status |
|---|---|---|---|
| SC-001 | T007, T041 | `tests/unit/workout-document-property.test.ts::preserves every parameter across 1,000 seeded reorder/move/duplicate cases` | VERIFIED |
| SC-002 | T001, T014-T015, T040 | `tests/unit/workout-role-parity.test.ts`; database/RLS and endpoint denial tests not verified | PARTIAL |
| SC-003 | T032-T033, T042 | `tests/unit/workout-print-route.test.ts`; `tests/e2e/workout-print.spec.ts` | PARTIAL (golden equivalence test assertion not confirmed) |
| SC-004 | T019, T040 | Plan Core acceptance scenarios unavailable in branch | PARTIAL |
| SC-005 | T043-T044 | No benchmark result; T043 unchecked | NOT-FOUND |

No tests were executed. “NOT-FOUND” means the required evidence was not found on this analyzed branch; it is not a claim that the behavior is absent from every integration branch.
