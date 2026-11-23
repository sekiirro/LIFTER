# T032 independent eight-mutant kill evidence

**Tested SHA:** `d4d5d18516b0de020404f93a8ae50cd88922226c`  
**Lane / stack:** `s69-luna-009mut-r2` / Stack C (`lifter-stack-c`)  
**Stack versions:** Supabase CLI `2.122.0`; Docker Engine `29.9.2`; Postgres image `17.11.0.006`; Studio `2026.10.19-sha-b375769`; PostgREST `v16.5`; GoTrue `v2.197.0`; Realtime `v2.147.1`; Storage API `v1.84.19`; Postgres Meta `v0.100.0`; Edge Runtime `v1.77.8`; Kong `2.8.1`; Mailpit `v1.31.3`.

All database changes below were made only on disposable Stack C through `supabase-safe.mjs`. Each database mutant was restored with a complete `db reset --local` before the next experiment. App and unit mutants were held in memory and restored from their original bytes in `finally`. No migration or tracked test file was changed. The campaign ended with `git diff --exit-code` returning 0 before the documentation file was created.

The standard wrapper context for the SQL commands below was:

```powershell
$env:SUPABASE_SAFE_CLI='node "C:/Program Files/nodejs/node_modules/npm/bin/npx-cli.js"'
node 'C:/Users/NEW LAP/.lifter/tools/supabase-safe.mjs' --stack C --workdir 'C:/Users/NEW LAP/Desktop/LFTR-s69-009mut/supabase-stack-c' db query --local '<SQL below>'
```

The standard integration-test wrapper context set `$env:LIFTER_SUPABASE_STACK='c'` and ran:

```powershell
node 'C:/Users/NEW LAP/.lifter/tools/supabase-safe.mjs' --stack C --workdir 'C:/Users/NEW LAP/Desktop/LFTR-s69-009mut/supabase-stack-c' exec -- npm run test:integration -- <exact file> -t '<test title fragment>'
```

## Mutant results

1. **Immutability trigger removal — killed.** Mutation: `drop trigger package_versions_no_update on public.package_versions`. Focused command: `npm run test:integration -- tests/integration/rls-catalog.test.ts -t 'package_versions forces RLS'`. The catalog test failed once because `package_versions_no_update` was absent (1 failed test). An additional attempted DML-role probe hit the existing RLS-filtered-row path and was not counted as kill evidence. Restoration: Stack C `db reset --local`; trigger recreated from migration. Tracked-tree check: final `git diff --exit-code` returned 0.

2. **Commission column grant — killed.** Mutation: `grant select (commission_rate_bp) on public.package_versions to authenticated`. Focused command: `npm run test:integration -- tests/integration/packages-reads.test.ts -t 'explicit, wildcard, embedded commission requests fail'`. The authenticated Sales read returned without the expected `42501` (1 failed test). Restoration: Stack C `db reset --local`; grant set restored from migration. Tracked-tree check: final `git diff --exit-code` returned 0.

3. **Commission RPC role weakening — killed.** Mutation: replaced `public.get_package_version_commissions(uuid)` with the same workspace-scoped function while removing the platform-owner/workspace-owner role predicate. Focused command: `npm run test:integration -- tests/integration/packages-reads.test.ts -t 'covers every identity x workspace'`. Sales received commission data where the test expected `42501` (1 relevant failed test). The same invocation also exposed one unrelated F15 setup failure because the reset stack had no synthetic `SIGNUP_*` Vault keys; it is not counted as mutant evidence. Restoration: Stack C `db reset --local`. Tracked-tree check: final `git diff --exit-code` returned 0.

4. **Publication serialization weakening — killed.** Mutation: fetched the definition of `public.publish_package_version(uuid,uuid,smallint,integer,smallint,text,text,bigint,text,integer)` with `pg_get_functiondef`, changed it to `CREATE OR REPLACE FUNCTION`, and removed the `pg_advisory_xact_lock(...)` statement with `regexp_replace(d, '  perform pg_catalog.pg_advisory_xact_lock\\([^;]*;', '', 'g')`. Focused command: `npm run test:integration -- tests/integration/packages-publish.test.ts -t 'serializes independent first/later distinct publications and identical calls'`. Concurrent first publication produced duplicate `package_offers_identity_key` (1 failed test). Restoration: Stack C `db reset --local`. Tracked-tree check: final `git diff --exit-code` returned 0.

5. **Composite FK removal — killed.** Mutation: `alter table public.package_versions drop constraint package_versions_workspace_id_offer_id_fkey`. Focused catalog command: `npm run test:integration -- tests/integration/rls-catalog.test.ts -t 'has all restrictive foreign keys'`. The catalog expected 9 FKs and found 8 (1 failed test). The package relation test also ran with the mutant and passed its remaining cross-workspace and same-workspace wrong-offer checks; the catalog failure is the kill evidence. Restoration: Stack C `db reset --local`. Tracked-tree check: final `git diff --exit-code` returned 0.

6. **Availability audit emitter removal — killed.** Mutation: `drop trigger audit_package_offers on public.package_offers`. Focused command: `npm run test:integration -- tests/integration/packages-availability.test.ts -t 'confirms false'`. The test expected the exact two availability audit rows and received none (1 failed test). Restoration: Stack C `db reset --local`; audit trigger recreated from migration. Tracked-tree check: final `git diff --exit-code` returned 0.

7. **Authorization walls, independently tested.**

   - **Database wall — killed.** Mutation: in the definitions of `public.publish_package_version(...)`, `app_private.guard_package_version_insert()`, and `app_private.guard_package_offer_update()`, replaced each package-pricing authorization `if` predicate with `if false then`, retaining the validation and write behavior. Focused command: `npm run test:integration -- tests/integration/packages-commercial-terms.test.ts -t 'allows PO to configure terms'`. The non-PO `woA` publication succeeded, so the test’s expected `42501` was absent (1 failed test). Restoration: Stack C `db reset --local`. Tracked-tree check: final `git diff --exit-code` returned 0.
   - **Application wall — killed separately.** Mutation: in `lib/packages/read.ts`, reduced the `loadPackageManagement` entry check from `!actor || actor.role !== 'platform_owner' || !isUuid(workspaceId) || !authorize(actor, 'set_package_pricing', workspaceId)` to `!actor || !isUuid(workspaceId)`. Focused command: `TZ=Africa/Cairo npm run test:unit -- tests/unit/packages-read.test.ts -t 'denies management before reads'`. The mocked read returned `status: 'ok'` instead of `status: 'denied'` (1 failed test). Restoration: `finally` wrote the in-memory original byte array; `git diff --exit-code -- lib/packages/read.ts` returned 0.

8. **Numeric rounding through Number — killed.** Mutation: in `lib/packages/money.ts`, changed `const amount = BigInt(exact);` to `const amount = BigInt(Number(exact));`. Focused command: `TZ=Africa/Cairo npm run test:unit -- tests/unit/packages-money.test.ts -t 'keeps exact digits and code'`. Both locale cases rounded `9223372036854775807` to `9223372036854775808` (2 failed tests). Restoration: `finally` wrote the in-memory original byte array; `git diff --exit-code -- lib/packages/money.ts` returned 0.

## Clean final rerun

After all eight experiments, Stack C was reset from migrations. Two random 32-byte synthetic test keys were held only in the PowerShell process and created in the disposable local Vault for fixtures that require `SIGNUP_RATE_KEY` and `SIGNUP_ATTEST_KEY`; no `.env*` file was read or written and key values were not printed.

Integration command, through Stack C `exec` with `LIFTER_SUPABASE_STACK=c`:

```text
npm run test:integration -- tests/integration/packages-availability.test.ts tests/integration/packages-c5-inventory.test.ts tests/integration/packages-c5-preflight.test.ts tests/integration/packages-c5-teardown.test.ts tests/integration/packages-cleanup.test.ts tests/integration/packages-commercial-terms.test.ts tests/integration/packages-markets-types.test.ts tests/integration/packages-promotion-lifecycle.test.ts tests/integration/packages-publish.test.ts tests/integration/packages-reads.test.ts tests/integration/packages-reporting.test.ts tests/integration/packages-retirement.test.ts tests/integration/packages-tier-names.test.ts tests/integration/rls-catalog.test.ts tests/integration/matrix-parity.test.ts
```

**Integration result:** 15 files, 722 passed, 0 failed, 0 skipped; exit 0.

Unit command with `TZ=Africa/Cairo`:

```text
npm run test:unit -- tests/unit/packages-actions.test.ts tests/unit/packages-approved-copy.test.ts tests/unit/packages-category-label.test.ts tests/unit/packages-commercial-terms.test.ts tests/unit/packages-fx-adapter.test.ts tests/unit/packages-fx-red.test.ts tests/unit/packages-manager.test.tsx tests/unit/packages-market-type.test.ts tests/unit/packages-money.test.ts tests/unit/packages-page.test.ts tests/unit/packages-promotion-red.test.ts tests/unit/packages-read.test.ts tests/unit/packages-tier-label.test.ts tests/unit/packages-tier-names.test.ts tests/unit/packages-validation.test.ts
```

**Unit result:** 15 files, 418 passed, 0 failed, 0 skipped; exit 0.

Stack C was then stopped with `stop --no-backup`. `docker ps -a --filter 'name=lifter-stack-c'` returned no containers. Stack C was released at `2026-11-20 09:56:03 UTC`.
