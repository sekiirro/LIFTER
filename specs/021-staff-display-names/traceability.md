# Traceability: F21 Staff Display Names

| FR     | Task                   | Test                    | Evidence                                                                                      |
| ------ | ---------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| FR-001 | T001, T002, T008       | Foundation suite        | PARTIAL: T008 backfill remains for later slice.                                               |
| FR-002 | T001, T008, T011       | Unit + foundation suite | PASS: Unicode 17.0 parity, NFC/trim, allowed characters, length and invalid-write behavior.   |
| FR-003 | T003, T004             | Foundation suite        | PASS: scoped read RPC and client/Sales/anonymous/revoked/foreign denials.                     |
| FR-004 | T003, T013             | Foundation suite        | PASS: single write RPC, expected-version conflict and metadata-only audit.                    |
| FR-005 | T002, T003, T004       | Unit + foundation suite | PASS: `authorize()` parity and membership-derived DB scope; mutation evidence in lane report. |
| FR-006 | T005                   | Not implemented         | UNVERIFIED                                                                                    |
| FR-007 | T005                   | Not implemented         | UNVERIFIED                                                                                    |
| FR-008 | T006, T012, T013       | Foundation suite        | PARTIAL: audit and retry/stale paths tested; race/rollback/purge matrix remains.              |
| FR-009 | T007                   | Not implemented         | UNVERIFIED                                                                                    |
| FR-010 | T002, T003, T004, T013 | Unit + foundation suite | PASS: unauthorized writes denied; key/version do not grant access.                            |
| FR-011 | T006, T007, T012       | Not implemented         | UNVERIFIED                                                                                    |
| FR-012 | T001                   | Foundation suite        | PASS: legacy rows nullable; new profiles require a name.                                      |
| FR-013 | T005, T010             | Not implemented         | UNVERIFIED                                                                                    |
| FR-014 | T012, T013             | Foundation suite        | PARTIAL: fingerprint/status and retry tested; full key lifecycle remains.                     |
| FR-015 | T012, T013             | Foundation suite        | PARTIAL: stale conflict tested; full retry/race matrix remains.                               |
| FR-016 | T012                   | Not implemented         | UNVERIFIED                                                                                    |

NAME-1..NAME-16 are resolved by S51-PO-4/S51-PO-7/S51-PO-8 and NAME-17..NAME-20 by S52-PO-2; no product decision remains open in this feature. Architect ruling S52-R10 fixes the post-purge retry path and is encoded in FR-014, FR-015, FR-016, SC-013, Story 4 scenario 7 and T012; it is an architect ruling derived from NAME-16=B, NAME-18=B and NAME-19=A, not a PO decision. SC-013 (late retry after the request-key purge) maps to FR-014/FR-015/FR-016 and T012 and has no evidence yet. Slice 1 local evidence is recorded in `C:/Users/NEW LAP/.lifter/runs/s55-luna-f21s1c/report.md`. No requirement text changed; Analyze was not rerun under constitution 1.16.0 / S54-R6.
