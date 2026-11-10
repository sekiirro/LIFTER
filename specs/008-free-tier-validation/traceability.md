# Traceability: F8 Free-tier Validation Prep

Static source inspection only. No tests, stacks, deployments, cloud queries, or secret scans were run in this compliance lane. VERIFIED means a concrete asserting test/control exists, not that it was freshly executed. Task FR/SC tags identify implementation scope; matrix task IDs identify the cited evidence owner and need not match scope tags.

| Requirement | Task(s) | Asserting test/control | Evidence | Status |
|---|---|---|---|---|
| FR-001 | T003, T008-T011 | `tests/unit/free-tier-db.test.ts::uses a read-only transaction, bounded catalog reads...`; static review that tooling contains no deploy/write operation | Code/test on `d04ef52` | VERIFIED |
| FR-002 | T003, T005-T006, T008-T009 | `tests/unit/free-tier-tail.test.ts::never prints fixture headers, queries, logs or exceptions`; token-bearing `/register/<token>` output is not asserted as redacted in console output and JSON aggregates | Code/test on `d04ef52`; token-path assertion not demonstrated | PARTIAL |
| FR-003 | T002, T005, T008 | `tests/unit/free-tier-routes.test.ts::probes in bounded batches...`; URL safety checks do not reject credential-bearing query parameters passed to the probe | Code/test on `d04ef52`; credential-bearing route input remains unhandled | PARTIAL |
| FR-004 | T001, T006, T008 | `tests/unit/free-tier-tail.test.ts::aggregates the fixture...`; CPU threshold/report logic | Code/test on `d04ef52` | VERIFIED |
| FR-005 | T003, T008-T009 | `tests/unit/free-tier-db.test.ts::uses a read-only transaction...`; `scripts/free-tier/db-usage.mjs` prints `report.tables` with `console.table` while exact `--count` results outside those top-15 rows appear only in `report.counts` and are not printed without `--json` | Code/test on `d04ef52`; console output does not display every requested exact count | PARTIAL |
| FR-006 | T007-T008, T013 | `tests/unit/free-tier-projection.test.ts::reports absent and null volumes as MISSING...`; `scripts/free-tier/lib/projection.mjs` divides by `Math.max(reltuples, 1)`, so PostgreSQL `reltuples = -1` for an unanalyzed table is treated as one row and can yield a guessed per-row size and a complete-looking projection when volumes are supplied. Separately, `db-usage.mjs` supplies at most 15 relations and omits other tables/database overhead. | Code/test on `d04ef52`; full-relation coverage and unknown-row-count handling are not demonstrated | PARTIAL |
| FR-007 | T001, T004, T009, T011 | `docs/06-free-tier-report.md`; report sections and script output reviewed statically | Source/docs on `d04ef52`; no measurement run performed | PARTIAL |
| FR-008 | T009, T011 | `docs/06-free-tier-report.md` records limits, official source links and check dates | Source/docs on `d04ef52`; source freshness not independently rechecked | PARTIAL |
| SC-001 | T003-T004, T007, T009-T011 | Offline commands and report fields in `docs/06-free-tier-report.md`; full row-by-row completion evidence is not present | Source/docs on `d04ef52` | PARTIAL |
| SC-002 | T001-T011 | Scope/tool inspection shows no deployment or cloud-resource mutation path; no runtime attempt made | Source on `d04ef52` | PARTIAL |
| SC-003 | T005-T006, T008 | `tests/unit/free-tier-tail.test.ts::never prints fixture headers, queries, logs or exceptions`; only the tested tail-output path is asserted, not every tool output | Code/test on `d04ef52` | PARTIAL |
| SC-004 | T005-T006, T009 | The post-approval instructions in [`README.md`](../../README.md) ("Free-tier validation", after-PO-approval paragraph) describe the commands without deployment steps; the tool CLIs do not implement `--help` | Source/docs on `d04ef52`; not run against a deployment | PARTIAL |

## Summary

- Functional requirements: 2 VERIFIED, 6 PARTIAL, 0 NOT-FOUND, 0 DEFERRED. FR-005 is PARTIAL because console output omits exact counts for tables outside the top 15 unless `--json` is used. FR-006 is PARTIAL because projection coverage is limited to the supplied 15 relations, omits other tables/database overhead, and treats `reltuples = -1` as one row.
- Success criteria: 0 VERIFIED, 4 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- Static verification only. T010/T011 remain historically checked but were not executed in this lane. ND-F8-1 is decided by S31-PO-4; ND-F8-2/3 remain open.
