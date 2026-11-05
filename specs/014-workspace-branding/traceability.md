
## S33 traceability — S33-PO-4

| FR | Task | Test | Evidence |
|---|---|---|---|
| FR-009 | T900 | `tests/integration/branding-upload-recovery.test.ts::keeps attached uploads in both GC candidate and finalize paths`; `tests/integration/branding-owner-gc.test.ts::T050 collects a stale attached upload after its asset references disappear` | Commit `c0e969b`; migration `20261107032002`; focused integration run on current head: 5 files / 41 tests passed; finalizer mutation RED failed at the expected `attached` vs `cleaned` assertion and MD5 teardown passed. |
