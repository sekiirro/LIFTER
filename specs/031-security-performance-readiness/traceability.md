# Traceability: P8 security and performance readiness

Docs-only artifact; no tests, vendor engagement, production run, or implementation task ticked.

| FR     | Task                     | Acceptance intent                                                                  | Evidence                                                                           |
| ------ | ------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| FR-001 | T001,T003,T005,T009,T010 | Blocking pre-go-live pen-test; vendor/timing after pilot                           | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |
| FR-002 | T003,T004,T009,T010      | Full PRD-13.1 test surface coverage                                                | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |
| FR-003 | T003,T004,T005,T009,T010 | Synthetic test and sanitized remediation                                           | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |
| FR-004 | T001,T004,T005,T009,T010 | Gate remains open until evidence                                                   | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |
| FR-005 | T002,T006,T008,T009,T010 | Repeatable route measurements                                                      | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |
| FR-006 | T002,T006,T008,T009,T010 | Existing spec 008 volume inputs                                                    | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |
| FR-007 | T002,T007,T008,T009,T010 | Baseline/proposed per-route p95 latency and error budgets; gate after PO signature | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |
| FR-008 | T006,T009,T010           | Synthetic data and redaction                                                       | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |
| FR-009 | T001,T005,T008,T009,T010 | Single readiness register                                                          | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |
| FR-010 | T009,T010                | Scope exclusions                                                                   | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |

## Success criteria

| SC     | Task(s)                       | Acceptance intent                                                            | Evidence                                                                           |
| ------ | ----------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| SC-001 | T003,T004,T005,T009,T010      | External test authorized, complete and remediated from sanitized evidence    | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |
| SC-002 | T004,T009,T010                | Every PRD-13.1 test surface has a coverage-evidence row                      | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |
| SC-003 | T002,T006,T007,T008,T009,T010 | Baseline and proposed per-route budgets are reproducible at spec 008 volumes | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |
| SC-004 | T003,T004,T009,T010           | No secret or real client datum appears in committed evidence                 | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |
| SC-005 | T001,T005,T008,T009,T010      | Every open requirement maps to a docs/13 gate                                | reports/pen-test-readiness.md; reports/coverage-map.md; reports/docs-acceptance.md |
