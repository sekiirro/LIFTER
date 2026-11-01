# S25 F16 final release gate (Stack C)

Date: 2026-11-02. Stack C only. This is a local release audit; it does not authorize a production migration or deploy.

| Gate | Status | Evidence / remaining item |
|---|---|---|
| Migration range, timestamp validity, uniqueness and order | FAIL | All 104 names sort lexically and F16 files are in range; however T027 `20261106116000` encodes 11:60:00 and T028 `20261106117000` encodes 11:70:00, both invalid UTC clock times. The full repo scan found 13 invalid timestamp names (11 pre-existing outside F16 plus these 2 F16). Pushed migrations were not edited. This is a release blocker. |
| Fresh reset and replay | PASS | Clean Stack C reset completed; full replay count 104. |
| Empty catalog seed | PASS | Clean replay `catalog-schema.test.ts` 1/1. |
| Audit/idempotency atomicity | PASS | `catalog-operation-keys.test.ts` and catalog operation integration assertions; operation key result, claim/work/result and audit behavior tested transactionally. |
| Zero direct DML | PASS | `catalog-privileges.test.ts` and role-denial coverage; authenticated base-table writes remain denied and RPC grants are bounded. |
| Security denials and mutation checks | PARTIAL | Isolated F16 run passed all catalog mutation probes (18/18), role parity and RLS suites. The shared `client-accounts-catalog.test.ts` had 3 failures / 22 tests on a clean Stack C replay, including an RPC denial assertion for `client_signup_admit`; investigate before claiming the combined shared security gate. |
| Fresh vs upgrade path | PARTIAL | Fresh reset/replay verified. No distinct old-schema upgrade rehearsal was run. |
| Unit, lint, typecheck, formatting, diff checks | PASS | Unit 132 files / 1,953 tests; lint and typecheck pass; Prettier check and `git diff --check` pass. |
| Benchmark D16-10 | FAIL / pre-production gate | Local browse query exceeded 120 seconds at concurrency 1, versus <=300 ms p95; remaining classes/plans/sizes/Worker metrics incomplete. See `benchmark-s25.md`. No index tuning performed. |
| Production-only gates | OPEN | Production-like benchmark (all classes and Worker CPU), production migration/deploy approval, live dataset audit/import approval, monitoring/backup verification. No production access occurred. |

## Integration file outcome

The 23 requested F16 files were run individually with a fresh Stack C reset before each file to isolate their fixtures: 22 files passed and `client-accounts-catalog.test.ts` failed 3 of 22 tests. Across these isolated runs, 138 assertions passed and 3 failed (141 total). Shared `rls-catalog.test.ts` passed 34/34. No suite was skipped. Failure details are recorded above; do not treat this gate as release-ready until investigated.