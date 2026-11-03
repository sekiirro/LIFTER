# Traceability: F8 Free-tier Validation Prep

Static source inspection only. No tests, stacks, deployments, cloud queries, or secret scans were run in this compliance lane. VERIFIED means a concrete asserting test/control exists, not that it was freshly executed. Task FR/SC tags identify implementation scope; matrix task IDs identify the cited evidence owner and need not match scope tags.

| Requirement | Task(s) | Asserting test/control | Evidence | Status |
|---|---|---|---|---|
| FR-001 | T003, T008-T011 | `tests/unit/free-tier-db.test.ts::uses a read-only transaction, bounded catalog reads...`; static review that tooling contains no deploy/write operation | Code/test on `d04ef52` | VERIFIED |
| FR-002 | T005-T006, T008-T009 | `tests/unit/free-tier-tail.test.ts::never prints fixture headers, queries, logs or exceptions`; redaction and no-credential controls | Code/test on `d04ef52` | VERIFIED |
| FR-003 | T002, T005, T008 | `tests/unit/free-tier-routes.test.ts::probes in bounded batches...`; URL safety checks | Code/test on `d04ef52` | VERIFIED |
| FR-004 | T001, T006, T008 | `tests/unit/free-tier-tail.test.ts::aggregates the fixture...`; CPU threshold/report logic | Code/test on `d04ef52` | VERIFIED |
| FR-005 | T003, T008-T009 | `tests/unit/free-tier-db.test.ts::uses a read-only transaction...`; DB usage tool/report fields | Code/test on `d04ef52` | VERIFIED |
| FR-006 | T007-T008 | `tests/unit/free-tier-projection.test.ts::reports absent and null volumes as MISSING...` | Code/test on `d04ef52` | VERIFIED |
| FR-007 | T001, T004, T009, T011 | `docs/06-free-tier-report.md`; report sections and script output reviewed statically | Source/docs on `d04ef52`; no measurement run performed | PARTIAL |
| FR-008 | T009, T011 | `docs/06-free-tier-report.md` records limits, official source links and check dates | Source/docs on `d04ef52`; source freshness not independently rechecked | PARTIAL |
| SC-001 | T003-T004, T007, T009-T011 | Offline commands and report fields in `docs/06-free-tier-report.md`; full row-by-row completion evidence is not present | Source/docs on `d04ef52` | PARTIAL |
| SC-002 | T001-T011 | Scope/tool inspection shows no deployment or cloud-resource mutation path; no runtime attempt made | Source on `d04ef52` | PARTIAL |
| SC-003 | T005-T006, T008 | `tests/unit/free-tier-tail.test.ts::never prints fixture headers, queries, logs or exceptions`; only the tested tail-output path is asserted, not every tool output | Code/test on `d04ef52` | PARTIAL |
| SC-004 | T005-T006, T009 | CLI help and README/quickstart procedure describe the post-approval commands without deployment steps | Source/docs on `d04ef52`; not run against a deployment | PARTIAL |

## Summary

- Functional requirements: 6 VERIFIED, 2 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- Success criteria: 0 VERIFIED, 4 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- Static verification only. T010/T011 remain historically checked but were not executed in this lane. ND-F8-1..3 remain open.
