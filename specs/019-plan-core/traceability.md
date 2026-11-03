# Plan Core static traceability — 2026-11-03

Analysed commit: `e4130898db1f4e794bd7dff5a4f42b2a3ed320c7`. Static only; no tests executed.

## Functional requirements

| Requirement | Task(s) | Test(s) | Evidence | Status |
|---|---|---|---|---|
| PC-FR-001 | T001, T006-T010 | `tests/unit/plan-core-schemas.test.ts`; `tests/unit/plan-core-revision-audit.test.ts` | Schema/revision tests present; full persisted identity lifecycle remains incomplete | PARTIAL |
| PC-FR-002 | T001, T003-T004, T007, T009-T010, T021 | `tests/unit/plan-core-schemas.test.ts`; `tests/unit/plan-core-client.test.ts` | Draft privacy and lifecycle UI acceptance pending | PARTIAL |
| PC-FR-003 | T001, T004, T011-T012, T021 | `tests/unit/plan-core-schemas.test.ts` | Explicit creation behavior has schema/test foundation; RPC/database path pending | PARTIAL |
| PC-FR-004 | T002, T013-T014, T017, T021, T024 | `tests/unit/plan-core-delivery.test.ts`; `tests/unit/plan-core-delivery-projection.test.ts` | Independent delivery projection tests exist; durable cross-feature implementation pending | PARTIAL |
| PC-FR-005 | T002, T005, T014-T016, T017, T020, T022 | `tests/unit/plan-core-delivery.test.ts`; integration test task T020 not complete | Exactly-once activation/outbox DB behavior not verified | PARTIAL |
| PC-FR-006 | T003, T007, T009-T010, T012-T014, T019-T020, T022, T024 | `tests/unit/plan-core-revision-audit.test.ts`; `tests/contracts/plan-core-catalog-snapshot.test.ts` | Unit/contracts present; RLS, locks and audit atomicity integration evidence pending | PARTIAL |
| PC-FR-007 | T008, T018, T023 | No consumer contract test found in this pass | F17/F18 reference boundary remains pending handoff | NOT-FOUND |

## Success criteria

No Success Criterion IDs are specified in `spec.md`. The task file's SC-1..SC-5 labels cannot be traced to measurable requirements, so there are no SC rows to verify. Their existence is a finding, not a basis to invent acceptance criteria.

No test suite was run. A present test file is not evidence that its suite passed on this commit.