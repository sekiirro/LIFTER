# Traceability: PO full export

Documentation-only lane; implementation tasks remain unchecked and implementation tests were not run. Approval of the proposed field manifest remains a per-screen gate.

## Functional requirements

| FR     | Tasks                              | Test intent                                             | Evidence                                  |
| ------ | ---------------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| FR-001 | T010,T011                          | PO-only export section in existing Reports screen       | Implementation pending                    |
| FR-002 | T001,T002,T007,T011                | PO-only server/storage authorization                    | Implementation pending                    |
| FR-003 | T004,T005,T007,T011                | PO-approved proposed field manifest                     | Implementation pending; approval required |
| FR-004 | T001,T004,T005,T007,T011           | Explicit workspace/all-workspace scope                  | Implementation pending                    |
| FR-005 | T003,T008,T009,T011                | Request/generation/retrieval audit; no PII logs         | Implementation pending                    |
| FR-006 | T004,T005,T006,T007,T009,T011      | Async UTF-8 CSV via spec 006 outbox                     | Implementation pending                    |
| FR-007 | T001,T002,T004,T006,T008,T009,T011 | Actor binding, revocation, approved short expiry        | Implementation pending                    |
| FR-008 | T010,T011                          | Required scope exclusions                               | Implementation pending                    |
| FR-009 | T010,T011                          | Accessible localized states and per-screen approvals    | Implementation pending; approval required |
| FR-010 | T005,T007,T011                     | RFC 4180 serialization and formula-injection protection | Implementation pending                    |

## Success criteria

| SC     | Tasks               | Verification intent                                       | Evidence               |
| ------ | ------------------- | --------------------------------------------------------- | ---------------------- |
| SC-001 | T005,T007,T011      | Fields and rows match the approved manifest and scope     | Implementation pending |
| SC-002 | T001,T002,T011      | Non-PO/foreign-scope requests disclose no data/existence  | Implementation pending |
| SC-003 | T003,T008,T009,T011 | Each action, including retrieval, has safe audit evidence | Implementation pending |
| SC-004 | T006,T007,T009,T011 | One outbox job and authenticated short-lived download     | Implementation pending |
| SC-005 | T005,T007,T011      | CSV cells round-trip safely and formula text stays inert  | Implementation pending |
