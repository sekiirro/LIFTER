# F18 static traceability — 2026-11-03

Analysed commit: `066636358f7256e10426efae2290112f15a62e14`. No tests were run. VERIFIED requires a named asserting test confirmed statically; database and integration behavior is not inferred from unit tests.

## Functional requirements

| Requirement | Task(s) | Test(s) | Evidence | Status |
|---|---|---|---|---|
| FR-001 | T004, T009, T010 | Plan Core contract absent | Lifecycle delegates to PC-FR-001..007 | PARTIAL |
| FR-001b | T003, T009, T010 | `tests/unit/nutrition-operation-keys.test.ts` if present | SQL ledger/replay checks not confirmed | PARTIAL |
| FR-002 | T001, T006, T014 | `tests/unit/nutrition-schema.test.ts::rejects single_day without implicitDayTypeId`; `...::accepts a valid seven_day document with day types` | Named schema assertions at current head | VERIFIED |
| FR-003 | T002, T008, T014 | `tests/unit/nutrition-macros.test.ts::does not derive an aggregate by adding already-rounded item values`; `tests/golden/nutrition-macros.ts` | TS calculation fixture/assertion; SQL parity task T008 remains pending | PARTIAL |
| FR-004 | T002, T008 | `tests/unit/nutrition-schema.test.ts` | Unit conversion schema coverage exists; full invalid-swap gate not statically mapped | PARTIAL |
| FR-005 | T003, T008, T009, T016 | `tests/unit/nutrition-id-continuity.test.ts::duplicates an item with new descendant ids and no inherited choice` | Continuity helper tests; persistence/selection partially implemented | PARTIAL |
| FR-006 | T009-T011 | `tests/unit/nutrition-template-schema.test.ts` (if present) | Verify template test file on checkout before relying; DB/RLS tasks pending | PARTIAL |
| FR-007 | T007, T012 | Plan Core acceptance contract absent | Selection/activation relies on PC lifecycle | PARTIAL |
| FR-008 | T006, T009, T013, T019 | `tests/unit/nutrition-id-continuity.test.ts` | Snapshot/selection persistence not proven end-to-end | PARTIAL |
| FR-009 | T005, T010, T011, T013 | `tests/unit/nutrition-display.test.ts::shows one decimal below 10 g and an integer at or above 10 g` | Display rounding behavior asserted | VERIFIED |
| FR-010 | T005, T010, T013 | Task mapping present; exact asserting tests not confirmed | Static mapping insufficient for full requirement | PARTIAL |
| FR-010a | task mapping not confirmed | No asserting test identified | No exact evidence established | NOT-FOUND |
| FR-010b | task mapping not confirmed | No asserting test identified | No exact evidence established | NOT-FOUND |
| FR-011 | task mapping not confirmed | No exact asserting test identified | No exact evidence established | PARTIAL |
| FR-012 | T014 | `tests/unit/NutritionPlanEditor.test.tsx` | UI task evidence exists; full UI accessibility matrix not reviewed | PARTIAL |
| FR-013 | task mapping not confirmed | No exact asserting test identified | No exact evidence established | PARTIAL |

## Success criteria

| Criterion | Tasks | Test/evidence | Status |
|---|---|---|---|
| SC-001 | T002, T008 | `tests/golden/nutrition-macros.ts` | PARTIAL (SQL half not verified) |
| SC-002 | security/persistence tasks | No current-head DB/RLS assertion established | NOT-FOUND |
| SC-003 | export task | Current selection/version export assertion not identified | PARTIAL |
| SC-004 | T004/T009/T010 | Plan Core scenarios absent | PARTIAL |
| SC-005 | T014+ | Playwright/axe matrix not established | PARTIAL |
| SC-006 | benchmark task | No benchmark report identified | NOT-FOUND |

No tests executed. The branch’s existing task evidence reports prior implementation verification where stated; this pass is static.