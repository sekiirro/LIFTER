# Quickstart / Validation: P1-F9

Future implementation/reviewer runbook: this artifact-only run does not claim application tests passed. Use disposable local Docker and synthetic fixtures only. No deployment/cloud migration/YBS access. Existing [production gates](../../docs/07-production-readiness.md) stay open. Fields and results: [data-model.md](data-model.md), [contract](contracts/packages-surface.md).

## 1. Prerequisites and gates

Node 24/npm, `npm ci`, Docker Desktop, pinned Supabase CLI 2.122.0. Configure existing server-only local auth env privately; no F9 env/dependency additions. Never commit credentials/status output.

```powershell
npm run typecheck
npm run lint
npx prettier --check specs/009-packages
npm run format:check
npm test -- --configLoader native --pool threads
npm run build:edge
npm run check:secrets
```

Stop on nonzero exit. Codex sandbox Vitest flags are `--configLoader native --pool threads`; reviewer independently repeats gates and runs Docker/integration/e2e. Unit tests cover validators, exact money above 2^53, zero-/three-decimal currency cases, actor checks, generic result mapping, no console and no privileged client calls.

## 2. Disposable database validation (reviewer)

Verify DB_URL/CLI status identify local Docker before applying anything. Start a fresh disposable stack per README; migrations apply from scratch, including the single F9 migration. Never reset shared/remote data.

```powershell
npx supabase@2.122.0 start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta
npx supabase@2.122.0 status -o env | ForEach-Object {
  if ($_ -match '^([A-Z_]+)="?(.*?)"?$') {
    Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2]
  }
}
npm run test:integration
```

Harness accepts API_URL/ANON_KEY/SERVICE_ROLE_KEY/DB_URL or README's SUPABASE aliases. Missing env must fail, not silently skip. Signed-in clients exercise RPC/read paths; privileged SQL is confined to fixture setup and guard/constraint checks.

Required evidence:

- **Publication**: PO create/code replay, first/later distinct terms, identical-to-current replay with same id/no event; revert to an older payload creates N+1 and moves current; duration/required fields; snapshot parity and rollback on audit failure. Simultaneous distinct first/later calls give one offer and consecutive versions; identical concurrent requests give one id/version/event. Use independent clients/connections, not the harness's max:1 connection, for concurrency.
- **RPC matrix**: create is globally PO-only; publish/toggle target both workspaces for PO, own/foreign WO/Sales/Trainer, revoked, no-profile/client and anon. PO needs no membership; others fail generically with no partial rows/events. No service-role execute/direct-write grants.
- **Read matrix**: packages, offers, safe view, explicit safe base columns, commission RPC, commission-bearing audit and shared helper. Staff only active scope; WO rates only own; Sales/Trainer no rates via explicit/wildcard/embedded requests, RPC, audit or app result. Foreign-only canonical package absent; PO sees unattached identities. Unavailable/history rows still readable in scope.
- **Relations/guards**: cross-workspace version/offer/current references, same-workspace wrong-offer pointer and snapshot mismatch fail. All-role UPDATE/DELETE/TRUNCATE on versions fails; canonical identity cannot update/delete/truncate; offer identity fixed. Service-role trigger tests temporarily grant DML inside rolled-back transactions; postgres DML must raise guard `23514`. Use savepoints to continue after expected errors.
- **Audit**: exact detail keys/values, signed actor/scope/target, one event per actual change, none for internal pointer/offer creation, no-op/replay/denial; no PII/labels. Existing jobs/recovery/workspace mapping regressions stay green.
- **Catalog/parity**: RLS enabled AND forced; view security_invoker; safe column grants and commission withheld; no direct writes/anonymous access; function owner/search path/EXECUTE; enabled guards and composite FKs; app/DB pricing/read parity.

## 3. Route, AR/EN and accessibility

```powershell
$env:CI = '1'
npm run e2e -- tests/e2e/packages.spec.ts
npm run e2e
```

Anonymous `/packages` redirects to login with safe next; axe checks rendered public login/error markup in AR and EN. Local fixture sessions prove every signed-in non-PO gets 404/denied without management data and PO gets the page. If ordinary CI has no DB, public checks stay there and authenticated cases run explicitly in local-stack reviewer mode; final acceptance cannot silently skip them.

PO manual journey: synthetic code → workspace → all explicit terms → publish → enable with ConfirmDialog. Exercise preset/custom, AR RTL/EN LTR, light/dark, narrow viewport, keyboard focus, loading/no-workspace/no-offer/error/retry states, cancelled toggle, pending duplicate submission and workspace-switch stale results. Authored labels remain authored; amounts and currency/rate are exact. No real catalog defaults. Any added public-state markup gets axe; no public management test route is added. Verify non-PO receives no commission through RSC/action payloads.

## 4. Reviewer negative/mutation checks

Only in isolated disposable local stack/worktree, with rollback or scratch uncommitted migrations. Never edit committed migrations. Record the expected failing assertion, restore original state in finally or recreate the stack, rerun green; leave no temporary grants/functions installed.

1. Temporarily drop `package_versions_no_update`; postgres UPDATE guard test and catalog test MUST fail. Independently remove DELETE/TRUNCATE guards too. Use an older unreferenced version for row tests so FK blockers cannot impersonate the guard. For standalone TRUNCATE trigger proof, temporarily remove incoming current-pointer FKs inside a rolled-back local test transaction; otherwise Postgres may reject TRUNCATE for the FK before the trigger is reached. Restore constraints by rollback, and verify their presence separately in catalog tests. No other table's truncate guard may stand in for the version guard.
2. Temporarily `GRANT SELECT (commission_rate_bp) ON public.package_versions TO authenticated`. Sales/Trainer direct commission negative and column-grant catalog test MUST fail on a real own-workspace row. Restore grants.
3. Remove PO/WO role clause from commission RPC while retaining workspace checks. Sales/Trainer own-workspace rate test MUST fail; safe-view coverage alone is insufficient.
4. Remove advisory/row publication serialization in scratch function definition. Synchronized independent first/later publish tests MUST fail (not all expected consecutive successful outcomes). Do not remove constraints to make races pass.
5. Remove/miswire composite FK: catalog definition or cross-workspace rejection MUST fail. Also test same-workspace wrong-offer current pointer.
6. Add duplicate audit emission or remove availability-change predicate: exact-one/no-op test MUST fail. Remove legacy jobs/recovery branch: existing audit regressions MUST fail.
7. Remove app authorize alone with accepting mocked RPC: unit denial MUST fail. Remove DB pricing guard independently: non-PO integration negatives MUST fail. One wall does not prove the other.
8. Remove price text projection or round through Number: >2^53 transport/formatting test MUST fail. Accept preset 2/4 months or custom 0 days: boundary tests MUST fail.

## 5. S31 future validation gate

Do not run the S31 implementation until SK-009-05..SK-009-09 are explicitly answered and the
selected owner/mutability/legacy/copy/downstream contracts are recorded in the spec and plan. The
future validation must then include:

- RED-first unit fixtures for the complete Egypt/International × EGP/USD/SAR matrix, invalid enum
  values, no inferred market, exact own-currency formatting and no cross-currency total;
- RED-first integration fixtures for every role × own/foreign workspace, multiple independent
  packages, the PO-approved legacy treatment, current-only replay, concurrent publications,
  unchanged existing version rows and all-role version immutability;
- a forward-migration catalog check proving the shipped F9 migration is untouched, the new
  constraints/functions/grants/triggers exist and no direct market/type write bypass exists;
- permission/RLS mutations that independently remove the PO app wall, DB pricing wall, market
  currency check, legacy classification guard and offer/version immutability guard; each mutation
  MUST make the relevant negative test fail;
- no-conversion scans across package, registration-link, subscription, installment, payment, refund
  and commission surfaces as supplemental schema evidence; and
- runtime integration assertions across those surfaces using the SK-009-09-approved currency
  contract: preserve amount and currency snapshots and reject mixed-currency totals for
  same-currency propagation, or verify the approved conversion source, timestamp, rounding and
  immutable snapshot contract when a different downstream currency is approved;
- PO-approved exact Arabic/English market/type copy fixtures, AR-RTL/EN-LTR × light/dark ×
  mobile/desktop Frontend Design Gate screenshots, required states and accessibility evidence; and
- static and runtime evidence that existing package-version identifiers and stored
  price/currency/commission/duration terms remain unchanged after the forward migration.

A format-valid currency outside the approved market set, a currency-derived market guess, an
unapproved legacy default, an unreviewed bilingual string or an old publication path that bypasses
the matrix is a blocking failure.

## 6. Evidence and handoff

Claude independently records commands/counts/mutation results in review/PR evidence and checks FR/SC coverage in tasks.md Analyze. Preserve the retained NDs, all explicit SK-009-05..SK-009-09 PO gates and documented replay/initial state/duration representation interpretations. No push/deployment authorized by this runbook. When synthetic data is no longer needed, stop only the disposable stack with `npx supabase@2.122.0 stop --no-backup`.
