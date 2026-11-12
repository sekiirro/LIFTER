# Traceability: F21 Staff Display Names

| FR     | Task                   | Test            | Evidence   |
| ------ | ---------------------- | --------------- | ---------- |
| FR-001 | T001, T002, T008       | Not implemented | UNVERIFIED |
| FR-002 | T001, T008, T011       | Not implemented | UNVERIFIED |
| FR-003 | T003, T004             | Not implemented | UNVERIFIED |
| FR-004 | T003, T013             | Not implemented | UNVERIFIED |
| FR-005 | T002, T003, T004       | Not implemented | UNVERIFIED |
| FR-006 | T005                   | Not implemented | UNVERIFIED |
| FR-007 | T005                   | Not implemented | UNVERIFIED |
| FR-008 | T006, T012, T013       | Not implemented | UNVERIFIED |
| FR-009 | T007                   | Not implemented | UNVERIFIED |
| FR-010 | T002, T003, T004, T013 | Not implemented | UNVERIFIED |
| FR-011 | T006, T007, T012       | Not implemented | UNVERIFIED |
| FR-012 | T001                   | Not implemented | UNVERIFIED |
| FR-013 | T005, T010             | Not implemented | UNVERIFIED |
| FR-014 | T012, T013             | Not implemented | UNVERIFIED |
| FR-015 | T012, T013             | Not implemented | UNVERIFIED |
| FR-016 | T012                   | Not implemented | UNVERIFIED |

No task is ticked. NAME-1..NAME-16 are resolved by S51-PO-4/S51-PO-7/S51-PO-8 and NAME-17..NAME-20 by S52-PO-2; no product decision remains open in this feature. Architect ruling S52-R10 fixes the post-purge retry path and is encoded in FR-014, FR-015, FR-016, SC-013, Story 4 scenario 7 and T012; it is an architect ruling derived from NAME-16=B, NAME-18=B and NAME-19=A, not a PO decision. SC-013 (late retry after the request-key purge) maps to FR-014/FR-015/FR-016 and T012 and has no evidence yet. This spec-only commit is not implementation evidence.
