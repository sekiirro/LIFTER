# F9 implementation verification

Executed locally on 2026-10-27, branch `009-packages`. R1 artifact correction is commit `60c8684`. This is implementer evidence; independent reviewer acceptance remains pending (T031-T034).

## Gates

| Gate                                                                  | Result                                                                              |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run typecheck`                                                   | PASS; 0 diagnostics                                                                 |
| `npm run lint`                                                        | PASS; 0 errors, 0 warnings                                                          |
| `npm run format:check`                                                | PASS                                                                                |
| `npm test`                                                            | PASS; 39 files, 1,032 tests; 0 failed/skipped                                       |
| `npm run build`                                                       | PASS                                                                                |
| `npm run build:edge`                                                  | PASS; local build only                                                              |
| `npm run check:secrets`                                               | PASS                                                                                |
| `npm run size`                                                        | PASS; web 6,054.67 KiB and cron 2.85 KiB uncompressed against 65,536 KiB each       |
| `npx --yes supabase@2.122.0 db reset` then `npm run test:integration` | PASS; 10 files, 390 tests; 0 failed/skipped                                         |
| `CI=1 npm run e2e` with local harness and app env                     | PASS; 73 tests, 8 existing desktop/mobile shell exclusions; all 5 F9 cases executed |

The final browser run includes actual PO sessions, every non-PO role/no-profile/revoked identity, AR/EN RTL/LTR, light/dark narrow viewport axe checks, explicit blank terms, preset/custom publication, focus/cancel/confirmed availability, failed transport/retry, and a held save response across workspace navigation.

Credentials were captured in-process from pinned local Supabase status. No credentials were printed or written to evidence. Size invokes local Wrangler dry-run bundling only; no deploy or cloud API operation was run.

## Database mutation checks

Each break below was made only against the disposable local database. No migration file was altered to create a mutant. Each negative command ran the listed integration files with `vitest run --config vitest.integration.config.ts`. Immediately afterward, `npx --yes supabase@2.122.0 db reset` restored the migration state and the entire integration suite ran green: **390/390 tests across 10 files, zero skips**, independently for every row. All negative commands exited 1; all resets and restored suites exited 0.

Removing just the redundant explicit PO predicate leaves the PO-only workspace capability check in place. The publication-authority mutation therefore removes both publication authority predicates to exercise the effective DB wall, while leaving the separate insert guard intact. Non-PO replay denial fails, independently of insert protection.

### update-guard

Dropped package_versions_no_update.

Negative counts: Test Files 2 failed (2); Tests 3 failed | 70 passed (73). Restored: 10 files / 390 tests PASS.

Failed tests:

- `tests/integration/packages-publish.test.ts > package publication > all DML roles hit update/delete guards independently of grants`
- `tests/integration/rls-catalog.test.ts > audit security catalog (T005) > attaches all emitters plus row and statement immutability guards`
- `tests/integration/rls-catalog.test.ts > package security catalog > package_versions forces RLS, scoped SELECT and no API writes`

### delete-guard

Dropped package_versions_no_delete.

Negative counts: Test Files 2 failed (2); Tests 2 failed | 71 passed (73). Restored: 10 files / 390 tests PASS.

Failed tests:

- `tests/integration/packages-publish.test.ts > package publication > all DML roles hit update/delete guards independently of grants`
- `tests/integration/rls-catalog.test.ts > package security catalog > package_versions forces RLS, scoped SELECT and no API writes`

### truncate-guard

Dropped package_versions_no_truncate. Test removes incoming FKs inside a transaction and forces rollback if the guard is missing.

Negative counts: Test Files 2 failed (2); Tests 2 failed | 71 passed (73). Restored: 10 files / 390 tests PASS.

Failed tests:

- `tests/integration/packages-publish.test.ts > package publication > truncate guards raise 23514 even for postgres/service_role after removing incoming FKs in rollback`
- `tests/integration/rls-catalog.test.ts > package security catalog > package_versions forces RLS, scoped SELECT and no API writes`

### commission-grant

Granted SELECT(commission_rate_bp) on package_versions to authenticated.

Negative counts: Test Files 2 failed (2); Tests 2 failed | 30 passed (32). Restored: 10 files / 390 tests PASS.

Failed tests:

- `tests/integration/packages-reads.test.ts > scoped package reads and commission secrecy > explicit, wildcard, embedded commission requests fail for every authenticated SQL role`
- `tests/integration/rls-catalog.test.ts > package security catalog > grants only safe columns and uses an exact-text security-invoker view`

### publication-authority

Removed explicit PO and workspace-pricing predicates from publish_package_version; retained signed-identity requirement and the independent insert guard. Exact-term replay then leaked a protected version id to staff.

Negative counts: Test Files 2 failed (2); Tests 2 failed | 288 passed (290). Restored: 10 files / 390 tests PASS.

Failed tests:

- `tests/integration/matrix-parity.test.ts > package operation parity > pricing and registration scope match app/DB for active, revoked, null-role and membership-free PO`
- `tests/integration/packages-publish.test.ts > package publication > enforces role x own/foreign publication before target lookup`

### historical-replay

Changed v.id = offer.current_version_id to true in the replay lookup, reproducing the full-history R1 bug.

Negative counts: Test Files 1 failed (1); Tests 1 failed | 47 passed (48). Restored: 10 files / 390 tests PASS.

Failed tests:

- `tests/integration/packages-publish.test.ts > package publication > R1: current replay is no-op; v1 -> v2 -> v1 terms appends v3 and moves current`

### commission-role

Removed PO/WO role clause from get_package_version_commissions while retaining workspace authorization.

Negative counts: Test Files 1 failed (1); Tests 1 failed | 6 passed (7). Restored: 10 files / 390 tests PASS.

Failed tests:

- `tests/integration/packages-reads.test.ts > scoped package reads and commission secrecy > covers every identity x workspace on offers, safe/base versions, packages, rate RPC and audit`

### publication-locks

Removed publication advisory lock and FOR UPDATE row locking; retained unique constraints. Independent connections synchronize their publication start.

Negative counts: Test Files 1 failed (1); Tests 1 failed | 47 passed (48). Restored: 10 files / 390 tests PASS.

Failed tests:

- `tests/integration/packages-publish.test.ts > package publication > serializes independent first/later distinct publications and identical calls`

### same-offer-fk

Dropped package_offers_current_same_offer_fk, retaining the workspace-pair FK.

Negative counts: Test Files 2 failed (2); Tests 2 failed | 71 passed (73). Restored: 10 files / 390 tests PASS.

Failed tests:

- `tests/integration/packages-publish.test.ts > package publication > rejects cross-workspace FKs, same-workspace wrong-offer pointer and duration snapshot mismatches`
- `tests/integration/rls-catalog.test.ts > package security catalog > has all restrictive foreign keys including workspace pair and same-offer triple`

### availability-audit

Removed the actual-boolean-change predicate from the offer audit branch, so pointer maintenance also emitted availability events.

Negative counts: Test Files 1 failed (1); Tests 3 failed | 2 passed (5). Restored: 10 files / 390 tests PASS.

Failed tests:

- `tests/integration/packages-availability.test.ts > package availability > denies non-PO x workspace; missing and foreign offers are generic`
- `tests/integration/packages-availability.test.ts > package availability > confirms false -> true -> false with exact events, no-op retry and unchanged history`
- `tests/integration/packages-availability.test.ts > package availability > audit failure rolls back availability`

### legacy-audit

Returned before recovery_link.generated and job.dead_lettered audit emission.

Negative counts: Test Files 2 failed (2); Tests 7 failed | 23 passed (30). Restored: 10 files / 390 tests PASS.

Failed tests:

- `tests/integration/auth-recovery.test.ts > recovery > po / A: preflight, record and exact audit attribution`
- `tests/integration/auth-recovery.test.ts > recovery > po / B: preflight, record and exact audit attribution`
- `tests/integration/auth-recovery.test.ts > recovery > woA / A: preflight, record and exact audit attribution`
- `tests/integration/auth-recovery.test.ts > recovery > enforces the per-target limit across actors without a fourth row or event`
- `tests/integration/jobs.test.ts > jobs outbox (T005) > (d) dead-letters at max attempts exactly once, with scoped allow-listed audit details`
- `tests/integration/jobs.test.ts > jobs outbox (T005) > dead-letters an expired lease at max attempts exactly once instead of reclaiming it`
- `tests/integration/jobs.test.ts > jobs outbox (T005) > permanent failure dead-letters a platform job on its first attempt`

### price-projection

Recreated package_versions_safe with numeric bigint price_minor instead of price_minor::text, retaining invoker security and grants.

Negative counts: Test Files 2 failed (2); Tests 2 failed | 30 passed (32). Restored: 10 files / 390 tests PASS.

Failed tests:

- `tests/integration/packages-reads.test.ts > scoped package reads and commission secrecy > retains unavailable and historical rows and exact text above 2^53`
- `tests/integration/rls-catalog.test.ts > package security catalog > grants only safe columns and uses an exact-text security-invoker view`

## Boundaries and remaining review

- No data-model or public-contract deviation. Initial availability remains false; duration representation stays fixed; older terms append a new current version; current-only equality is replay.
- No capability matrix, dependencies, lockfile, pre-existing migrations, production catalog, protected deleted files, `.agents/`, `docs/SESSION_HANDOFF.md` or `.env.local` was changed. No push was run.
- Workflow exception: the SQL migration draft preceded its integration story tests during the original sandboxed pass. Application unit tests were authored before their implementations; the later live mutation runs supply behavioral negative evidence for the SQL boundaries.
- The eight existing shell skips are viewport/project exclusions, not missing F9 authentication. All five package e2e tests execute with the local environment.
- App-source mutation and a permissive-duration mutant were not applied: this run's temporary breaks were restricted to the local DB, with the four mandatory mutations and eight additional DB mutations above. Accepting-RPC app-denial tests and preset/custom validation boundaries pass normally. Other unlisted variants of the quickstart mutation examples were not executed.
- ND-F9-1..5 remain unresolved. Production deployment, remote data, physical-device/manual assistive-technology review, and independent reviewer acceptance are not claimed.

Raw negative/reset/restored logs and structured per-mutation JSON remain in `%TEMP%/lifter-f9-mutation-evidence/` on this machine. The truncate case was repeated after adding unconditional rollback on unexpected success; this record uses the final two-failure run. No mutant remains installed.
