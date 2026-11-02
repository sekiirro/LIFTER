# S25 F16 final release gate (Stack C)

Date: 2026-11-02. Stack C only. This local audit does not authorize a production migration or deploy.

| Gate | Status | Evidence / remaining item |
|---|---|---|
| Migration range, timestamp validity, uniqueness and order | PASS | 83 `origin/main` migrations + 24 F16 migrations + `20261106121000_catalog_food_defaults_and_search.sql` + `20261106122000_catalog_food_alternatives_bounds.sql` = 109 applied migrations. Timestamp validator passes with exactly 11 listed pre-F16 merged exceptions. |
| Fresh reset and replay | PASS | Final clean Stack C reset replayed all 109 migrations including `20261106122000_catalog_food_alternatives_bounds.sql`; the Vault provisioner completed immediately after reset. |
| Empty catalog seed | PASS | `catalog-schema.test.ts` passes on an isolated clean replay; only the approved 18 muscle and 10 equipment taxonomy rows are present. |
| Audit/idempotency atomicity | PASS | `catalog-operation-keys.test.ts`, operation integration assertions and migration transaction semantics cover operation-key result/claim/work/result and audit behavior. |
| Zero direct DML | PASS | `catalog-privileges.test.ts` and shared `client-accounts-catalog.test.ts` pass; direct API base-table writes remain denied and RPC grants are bounded. |
| Security denials, role parity and mutations | PASS | The full repository integration run passed 88 files and 1,409 tests; one opt-in SC-011 timing test was skipped, with zero failures. All F16/shared integration files passed, including `catalog-mutations.test.ts` 19/19 and the updated F11 schedule wrapper checks. Unauthorized malformed `catalog_search` filter regression test passes. |
| Fresh vs upgrade path | PASS for F16 base; follow-up upgrade not rehearsed | The prior upgrade rehearsal applied the 83 `origin/main` migrations, then 24 F16 migrations via `migration up`. Its schema fingerprint matched the then-current fresh replay: `ec8cfc41001a3f6f672c49031a7bd369092bfce4963fa661d8f8dc5c06956653` (598 relations, 520 constraints, 205 routines, 50 policies, 182 indexes). The round-one S26 fresh replay after `20261106121000_catalog_food_defaults_and_search.sql` had fingerprint `a7ca5e1462de0d1a61a0cad81607ef3c13880c88c9dacbaa55ffe4e34d528b07` (598 relations, 520 constraints, 211 routines, 50 policies, 182 indexes). Round two adds `20261106122000_catalog_food_alternatives_bounds.sql`; its schema fingerprint and incremental upgrade path have not been separately audited. |
| Unit suite | PASS | 135 files / 1,972 tests, clean-environment run with injected API/DB/Supabase variables unset. |
| Lint, typecheck, Prettier and diff checks | PASS | `npm run lint`, `npm run typecheck`, Prettier on touched supported files, timestamp check, and `git diff --check` pass. SQL migrations are validated by replay and migration audit, not Prettier's unsupported SQL parser. |
| Benchmark D16-10 | PASS locally / production gate open | Local Stack C 10,000-active / 1,000-removed fixture; five query classes at concurrency 1/8/32 and all local p95 values <300 ms after `20261106115400_catalog_search_browse_perf.sql`. Worker CPU and hosted HTTP/API results are unavailable locally. See `benchmark-s25.md`. |
| Production-only gates | OPEN | Production-like benchmark including Worker CPU, production migration/deploy approval, live dataset audit/import approval, and monitoring/backup verification. No production access occurred. |

## S26 F11 retention follow-up

The existing inactive `lifter-f11-purge-signup` job command now calls `app_private.purge_f11_retained_data()`, which purges both retained signup attempts and expired operation keys. The integration contract verifies the command, wrapper body, and postgres-only activation/execution. No schedule was activated; the job remains absent after replay. This is a local contract change only and does not authorize activation or production migration.

## Integration file outcome

The full repository integration run against the final fresh Stack C replay passed 88 test files and 1,409 tests, with one skipped test and zero failures. The skipped case is `client-accounts-timing.test.ts`'s existing opt-in `SC-011` measurement (`it.skipIf(process.env.SC011_TIMING_RUN !== 'true')`); it is not part of the F16/shared suite. All F16/shared integration files passed, including `rls-catalog.test.ts`, `client-accounts-catalog.test.ts` after local Vault provisioning, and the F11 schedule and catalog mutation tests. The Vault provisioner is documented in `quickstart.md` because Stack C resets clear its local setup.

The first full-repository attempt exposed a stale max-three mutation probe: after the new early RPC guard was added, dropping only the table constraint no longer reached the intended mutant. The probe now removes the RPC guard as well as the table constraint, and `catalog-mutations.test.ts` passes 19/19.

## Client-account reset finding

The first post-reset symptom was missing local Vault provisioning, which made signup admission return `signup_unavailable`. Running `tests/integration/client-accounts-provision.mjs` after reset resolves that setup issue. The ensuing shared suite also exposed a test harness omission for the Postgres `numeric` RPC argument type, fixed in the fixture, and the F16 authorization-order regression where unauthorized `catalog_search` callers could receive filter-validation `22023` before authorization. Forward migration `20261106115300_catalog_search_auth_first.sql` moves scope authorization before filter validation. With provisioning and fixes applied, `client-accounts-catalog.test.ts` passes 22/22.
