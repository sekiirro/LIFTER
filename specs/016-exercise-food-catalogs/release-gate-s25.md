# S25 F16 final release gate (Stack C)

Date: 2026-11-02. Stack C only. This local audit does not authorize a production migration or deploy.

| Gate | Status | Evidence / remaining item |
|---|---|---|
| Migration range, timestamp validity, uniqueness and order | PASS | 106 migrations sort in range/order. F16 food migrations are `20261106115100`, `20261106115200`, `20261106115300`, `20261106115400`; they follow `20261106115000`. Timestamp validator passes with exactly 11 listed pre-F16 merged exceptions. |
| Fresh reset and replay | PASS | Final clean Stack C reset and full replay; 106 migration rows applied. |
| Empty catalog seed | PASS | `catalog-schema.test.ts` passes on an isolated clean replay; only the approved 18 muscle and 10 equipment taxonomy rows are present. |
| Audit/idempotency atomicity | PASS | `catalog-operation-keys.test.ts`, operation integration assertions and migration transaction semantics cover operation-key result/claim/work/result and audit behavior. |
| Zero direct DML | PASS | `catalog-privileges.test.ts` and shared `client-accounts-catalog.test.ts` pass; direct API base-table writes remain denied and RPC grants are bounded. |
| Security denials, role parity and mutations | PASS | All 23 F16/shared integration files pass on isolated clean Stack C resets. `rls-catalog.test.ts` 34/34, `client-accounts-catalog.test.ts` 22/22, `catalog-mutations.test.ts` 18/18. Unauthorized malformed `catalog_search` filter regression test passes. T006–T010 evidence includes all 18 mutants in `tasks.md` / task audit. |
| Fresh vs upgrade path | PARTIAL | Fresh replay passed. No distinct prior-schema upgrade rehearsal was run; keep the upgrade-path item open. |
| Unit suite | PASS | 133 files / 1,958 tests; run outside the wrapper after clearing injected API/DB/Supabase environment variables. |
| Lint, typecheck, Prettier and diff checks | PASS | `npm run lint`, `npm run typecheck`, Prettier on touched supported files, timestamp check, and `git diff --check` pass. SQL migrations are validated by replay and migration audit, not Prettier's unsupported SQL parser. |
| Benchmark D16-10 | PASS locally / production gate open | Local Stack C 10,000-active / 1,000-removed fixture; five query classes at concurrency 1/8/32 and all local p95 values <300 ms after `20261106115400_catalog_search_browse_perf.sql`. Worker CPU and hosted HTTP/API results are unavailable locally. See `benchmark-s25.md`. |
| Production-only gates | OPEN | Production-like benchmark including Worker CPU, production migration/deploy approval, live dataset audit/import approval, and monitoring/backup verification. No production access occurred. |

## Integration file outcome

All 23 requested F16/shared integration files passed individually against a fresh Stack C replay. The shared files were included: `rls-catalog.test.ts` and, after local Vault provisioning, `client-accounts-catalog.test.ts`. No integration file was skipped. The Vault provisioner is documented in `quickstart.md` because Stack C resets clear its local setup.

## Client-account reset finding

The first post-reset symptom was missing local Vault provisioning, which made signup admission return `signup_unavailable`. Running `tests/integration/client-accounts-provision.mjs` after reset resolves that setup issue. The ensuing shared suite also exposed a test harness omission for the Postgres `numeric` RPC argument type, fixed in the fixture, and the F16 authorization-order regression where unauthorized `catalog_search` callers could receive filter-validation `22023` before authorization. Forward migration `20261106115300_catalog_search_auth_first.sql` moves scope authorization before filter validation. With provisioning and fixes applied, `client-accounts-catalog.test.ts` passes 22/22.
