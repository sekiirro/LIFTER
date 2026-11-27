# Traceability: Subscription expiry notices and scoped client list

Documentation-only lane: implementation tests were not run and implementation tasks remain unchecked. Task links below describe required future test coverage. Future implementation evidence must cite executed tests on that implementation head.

## Functional requirements

| FR     | Task(s)                       | Acceptance coverage                                             | Evidence               |
| ------ | ----------------------------- | --------------------------------------------------------------- | ---------------------- |
| FR-001 | T008,T010,T013,T018           | Client T-3/T-1/expiry and no renewal CTA                        | Implementation pending |
| FR-002 | T008,T011,T012,T015,T018      | PO/WO/all authorized workspace Trainers receive staff notices   | Implementation pending |
| FR-003 | T001,T002,T007,T008,T011,T013 | Recipient resolution and current coaching-access authorization  | Implementation pending |
| FR-004 | T005,T006,T010,T018           | F13 expiry instant and T-3/T-1 Cairo timing                     | Implementation pending |
| FR-005 | T006,T007,T010,T018           | Lifecycle recomputation and obsolete due-instant suppression    | Implementation pending |
| FR-006 | T007,T008,T010,T011,T012,T018 | Retry/concurrency dedup per subscription/revision/stage         | Implementation pending |
| FR-007 | T003,T008,T013,T015,T018      | Recipient-specific read/dismiss                                 | Implementation pending |
| FR-008 | T004,T014,T018                | Existing directory filters and 72-hour edges                    | Implementation pending |
| FR-009 | T001,T002,T012,T014,T018      | RLS/permission matrix including all-Trainer coaching access     | Implementation pending |
| FR-010 | T001,T004,T014,T018           | Bounded pagination, counts, and directory query bounds          | Implementation pending |
| FR-011 | T009,T017,T018                | F26 30-day purge reuse                                          | Implementation pending |
| FR-012 | T002,T009,T011,T012,T017,T018 | Safe audit and no P7 disclosure                                 | Implementation pending |
| FR-013 | T015,T016,T018                | Shared F15/F23/expiry surface, accessible states, approved copy | Implementation pending |

## Success criteria

| SC     | Task(s)             | Verification intent                                           | Evidence               |
| ------ | ------------------- | ------------------------------------------------------------- | ---------------------- |
| SC-001 | T008,T018           | 1,000 repeated/concurrent scans create one row per identity   | Implementation pending |
| SC-002 | T001,T002,T018      | Role and foreign-scope probes cannot read unauthorized data   | Implementation pending |
| SC-003 | T006,T007,T010,T018 | Lifecycle races suppress stale stages and use current F13 end | Implementation pending |
| SC-004 | T008,T013,T018      | Client stages and no-renewal-CTA behavior                     | Implementation pending |
| SC-005 | T004,T014,T018      | Bounded pages and exact 72-hour authorized predicate          | Implementation pending |
| SC-006 | T009,T017,T018      | F26 retention clocks, dispute holds, and purge gate           | Implementation pending |
| SC-007 | T015,T016,T018      | One shared F15/F23/expiry staff notifications surface         | Implementation pending |
