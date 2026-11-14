# Traceability: F21 Staff Display Names

| FR     | Task                   | Test                                         | Evidence                                                                                                           |
| ------ | ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| FR-001 | T001, T002, T008       | Foundation suite                             | PASS: authorized Workspace Owner backfill stores a name and leaves the active membership unchanged.                |
| FR-002 | T001, T008, T011       | Unit + foundation suite                      | PASS: Unicode 17.0 parity, NFC/trim, allowed characters, length and invalid-write behavior.                        |
| FR-003 | T003, T004             | Foundation suite                             | PASS: scoped read RPC and client/Sales/anonymous/revoked/foreign denials.                                          |
| FR-004 | T003, T013             | Foundation suite                             | PASS: single write RPC, expected-version conflict and metadata-only audit.                                         |
| FR-005 | T002, T003, T004       | Unit + foundation suite                      | PASS: `authorize()` parity and membership-derived DB scope; mutation evidence in lane report.                      |
| FR-006 | T005                   | Client Notes UI + integration                | PASS: scoped server-owned author label replaces fallback; absent source retains fallback.                          |
| FR-007 | T005                   | Client Notes UI + integration                | PASS: retained deactivated-author name uses approved EN/AR markers.                                                |
| FR-008 | T006, T012, T013       | Staff display-name foundation                | PASS: actor/time audit, serialized races, duplicate retries, rollback and purge paths.                             |
| FR-009 | T007                   | Staff display-name Client Notes              | PASS: membership deactivation retains the name; historical lookup marks it deactivated. No new retention behavior. |
| FR-010 | T002, T003, T004, T013 | Unit + foundation suite                      | PASS: unauthorized writes denied; key/version do not grant access.                                                 |
| FR-011 | T006, T007, T012       | Staff display-name foundation + Client Notes | PASS: actor/time-only audit; lifecycle retains the name and adds no retention rule.                                |
| FR-012 | T001                   | Foundation suite                             | PASS: legacy rows nullable; new profiles require a name.                                                           |
| FR-013 | T005, T010             | Change review + Client Notes tests           | PASS: only the Client Notes author line consumes names; other surfaces remain unchanged.                           |
| FR-014 | T012, T013             | Staff display-name foundation                | PASS: duplicate retry status-only; applied retry after key purge is stale, never reapplied.                        |
| FR-015 | T012, T013             | Staff display-name foundation                | PASS: stale conflict status-only; concurrent writes yield one winner and one conflict.                             |
| FR-016 | T012                   | Staff display-name foundation                | PASS: content-free key record, status-only outcome, post-purge stale/applied paths.                                |

NAME-1..NAME-16 are resolved by S51-PO-4/S51-PO-7/S51-PO-8 and NAME-17..NAME-20 by S52-PO-2; no product decision remains open in this feature. Architect ruling S52-R10 fixes the post-purge retry path and is encoded in FR-014, FR-015, FR-016, SC-013, Story 4 scenario 7 and T012; it is an architect ruling derived from NAME-16=B, NAME-18=B and NAME-19=A, not a PO decision. Slice 1 local evidence is recorded in `C:/Users/NEW LAP/.lifter/runs/s55-luna-f21s1c/report.md`. No requirement text changed; Analyze was not rerun under constitution 1.16.0 / S54-R6. Slice 2 evidence is in `C:/Users/NEW LAP/.lifter/runs/s55-luna-f21s2/report.md`.
