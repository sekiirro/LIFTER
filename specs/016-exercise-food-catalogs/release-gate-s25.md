# S25 F16 final release gate (Stack C)

Date: 2026-11-02. Stack C only. This local audit does not authorize a production migration or deploy.

| Gate | Status | Evidence / remaining item |
|---|---|---|
| Migration range, timestamp validity, uniqueness and order | PASS | 83 `origin/main` migrations + 24 F16 migrations + `20261106121000_catalog_food_defaults_and_search.sql` = 108 applied migrations. Timestamp validator passes with exactly 11 listed pre-F16 merged exceptions. |
| Fresh reset and replay | PASS | Final clean Stack C reset replayed all 108 migrations; the Vault provisioner completed immediately after reset. |
| Empty catalog seed | PASS | `catalog-schema.test.ts` passes on an isolated clean replay; only the approved 18 muscle and 10 equipment taxonomy rows are present. |
| Audit/idempotency atomicity | PASS | `catalog-operation-keys.test.ts`, operation integration assertions and migration transaction semantics cover operation-key result/claim/work/result and audit behavior. |
| Zero direct DML | PASS | `catalog-privileges.test.ts` and shared `client-accounts-catalog.test.ts` pass; direct API base-table writes remain denied and RPC grants are bounded. |
| Security denials, role parity and mutations | PASS | All 23 F16/shared integration files pass on isolated clean Stack C resets. `rls-catalog.test.ts` 34/34, `client-accounts-catalog.test.ts` 22/22, `catalog-mutations.test.ts` 18/18. Unauthorized malformed `catalog_search` filter regression test passes. T006–T010 evidence includes all 18 mutants in `tasks.md` / task audit. |
| Fresh vs upgrade path | PASS for F16 base; follow-up upgrade not rehearsed | The prior upgrade rehearsal applied the 83 `origin/main` migrations, then 24 F16 migrations via `migration up`. Its schema fingerprint matched the then-current fresh replay: `ec8cfc41001a3f6f672c49031a7bd369092bfce4963fa661d8f8dc5c06956653` (598 relations, 520 constraints, 205 routines, 50 policies, 182 indexes). S26 fresh replay adds one migration and has fingerprint `a7ca5e1462de0d1a61a0cad81607ef3c13880c88c9dacbaa55ffe4e34d528b07` (598 relations, 520 constraints, 211 routines, 50 policies, 182 indexes); the incremental upgrade path for this follow-up has not been rerun. |
| Unit suite | PASS | 135 files / 1,972 tests, clean-environment run with injected API/DB/Supabase variables unset. |
| Lint, typecheck, Prettier and diff checks | PASS | `npm run lint`, `npm run typecheck`, Prettier on touched supported files, timestamp check, and `git diff --check` pass. SQL migrations are validated by replay and migration audit, not Prettier's unsupported SQL parser. |
| Benchmark D16-10 | PASS locally / production gate open | Local Stack C 10,000-active / 1,000-removed fixture; five query classes at concurrency 1/8/32 and all local p95 values <300 ms after `20261106115400_catalog_search_browse_perf.sql`. Worker CPU and hosted HTTP/API results are unavailable locally. See `benchmark-s25.md`. |
| Production-only gates | OPEN | Production-like benchmark including Worker CPU, production migration/deploy approval, live dataset audit/import approval, and monitoring/backup verification. No production access occurred. |

## Integration file outcome

All 24 F16/shared integration files passed against the final fresh Stack C replay (153 tests). The shared files were included: `rls-catalog.test.ts` and, after local Vault provisioning, `client-accounts-catalog.test.ts`. No requested F16/shared integration file was skipped. The Vault provisioner is documented in `quickstart.md` because Stack C resets clear its local setup.

## Client-account reset finding

The first post-reset symptom was missing local Vault provisioning, which made signup admission return `signup_unavailable`. Running `tests/integration/client-accounts-provision.mjs` after reset resolves that setup issue. The ensuing shared suite also exposed a test harness omission for the Postgres `numeric` RPC argument type, fixed in the fixture, and the F16 authorization-order regression where unauthorized `catalog_search` callers could receive filter-validation `22023` before authorization. Forward migration `20261106115300_catalog_search_auth_first.sql` moves scope authorization before filter validation. With provisioning and fixes applied, `client-accounts-catalog.test.ts` passes 22/22.
