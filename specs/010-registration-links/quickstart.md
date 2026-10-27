# Quickstart / Validation: Registration Links (P1-F10)

Future implementation and verification runbook. This artifact-only run does not claim these application tests passed. Use local disposable Docker and synthetic terms/accounts only. No remote migration, deployment, shared-data reset, stash, force push or YBS access. Never touch `C:\Users\NEW LAP\Desktop\LFTR` (protected deletions). Existing production gates stay open; ND-F10-3 adds a rate-value production blocker.

## 1. Prerequisites and ordinary gates

Node 24/npm, existing dependencies via `npm ci`, Docker Desktop, repository-pinned Supabase CLI command `npx supabase@2.122.0`. Branch is stacked on F9 PR #9; verify the F9 migration/read surfaces exist before F10. Future migration sorts after `20261029120000_packages.sql`; never edit an already committed migration. Existing env is server-only; no new secret/dependency is required. Do not print local/remote keys or status env in evidence.

```powershell
npm run typecheck
npm run lint
npx prettier --check specs/010-registration-links --ignore-path .gitignore
npm run format:check
npm test -- --configLoader native --pool threads
npm run build:edge
npm run check:secrets
```

Stop at failures. Native-loader/thread flags support the established Codex Vitest path; this run is unsandboxed as PO-authorized. No dependency update or audit-fix is in F10 scope.

The repository's `.prettierignore` excludes `specs`. The explicit `--ignore-path .gitignore` override is required to actually format/check these artifacts; otherwise a successful scoped command can match no files. It changes no ignore configuration. Both the user-requested plain write/check and the effective overridden write/check are run in this artifact pass.

## 2. Isolated local integration

Before starting/applying migrations, verify the CLI project and DB target belong to a disposable local Docker fixture environment, not a shared live stack. Use README's local setup and an isolated project configuration/checkout when needed; never reset or mutate another task's stack. Start only the local stack you own:

```powershell
npx supabase@2.122.0 start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta
```

Capture `npx supabase@2.122.0 status -o env` privately into environment variables as in the existing F9 runbook/harness; do not echo its content. Harness accepts API_URL/ANON_KEY/SERVICE_ROLE_KEY/DB_URL or documented SUPABASE aliases. Assert loopback API/DB and local Docker identity before tests. Migrations apply from scratch on this new disposable environment; no `git reset` or shared DB reset. Missing credentials/env must fail, not silently skip.

```powershell
npm run test:integration
```

Use signed JWT staff clients for real RPC/RLS paths and an anonymous client for open/read negatives. Privileged connection is confined to fixture creation, assertions and rollback-scoped integrity probes. Never let service-role calls stand in for signed authorization tests. Existing recovery/package/audit/job tests must still pass.

Historical/consumed open fixtures cannot pass the production insert guard that insists on fresh server timestamps and NULL markers. In an isolated fixture transaction only, temporarily suspend that insert guard while inserting synthetic backdated rows with correct expiry/snapshots, then restore it before any subject call. Scope restoration with finally/rollback; do not disable marker UPDATE, open validation, RLS, audit or schedule guards during subject calls. Keep separate normal-issuance fixtures for insert-guard integrity tests. This is a local fixture seam, never an application clock override or migration bypass.

Read-only digest schema check on the identified local DB:

```sql
select e.extname, n.nspname
from pg_extension e join pg_namespace n on n.oid=e.extnamespace
where e.extname='pgcrypto';
select encode(extensions.digest('abc','sha256'),'hex');
```

Expect schema extensions and SHA-256 `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`. This schema/vector was confirmed on the existing local stack read-only during artifact authoring; a fresh migrated F10 database still needs its own check.

Required integration suites:

| Suite                                       | Required proof                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| registration-links-issue.test.ts            | Four roles × own/foreign × NULL/present schedule, PO cross-workspace, Trainer malformed/empty/present denial; anon/client/auth-only/revoked denial; unavailable/missing-current; current-only snapshot; stale offer refresh behavior; exact total/order/shape; global hash uniqueness; concurrent issuance and actor-limit boundary across workspaces |
| registration-links-integrity.test.ts        | Composite version/child foreign FKs; non-current/wrong-source insertion rejected; exact immutable snapshots; late child insert rejected; amount/offset/sequence constraints; all-role UPDATE/DELETE/TRUNCATE; set-once opened and consumed marker guards under privileged DML                                                                         |
| registration-links-open.test.ts             | Valid/unknown/malformed/expired-never-opened/grace-before/grace-after/consumed; identical invalid JSON/status; first-open/repeated/concurrent opens exactly once; first-open at expiry refused; no shortening or sliding grace; anon/authenticated parity; no IP block; TS/private SQL clock-table parity and strict SQL boundary                     |
| registration-links-reads.test.ts            | Staff safe rows only in scope; no table reads anon; explicit/wildcard/embedded hash and commission denied; PO/WO commission gated by scope; revoked/client denied; exact text money above 2^53; no cross-workspace child/version joins                                                                                                                |
| registration-links-audit.test.ts            | Exactly one issued with final child count/price text, exactly one opened `{}` including anonymous actor NULL, no secret/hash/commission/PII in F10 details, no events on failed/repeated opens; forced audit-failure rollback; legacy F9/F4/jobs mappings preserved                                                                                   |
| rls-catalog.test.ts / matrix-parity.test.ts | Forced RLS/two tables, composite FKs, guards/deferred checks, safe view security_invoker/text projections, exact column grants, function owner/search_path/EXECUTE inventories, unchanged role matrix, both capabilities and commission role gates match app                                                                                          |

R10-1 tests: publish a successor between load and issue -> stale_terms, no link/children/event; disable the offer -> stale_terms; foreign/unknown version -> not_permitted, including unauthorized stale callers. Validate schedules against the displayed exact version.

Pure unit fixtures cover all time-table rows in data-model.md, schedule bigint/string boundaries and sums above 2^53, string-only money transport, arbitrary valid nonzero first offsets, token byte count/encoding/hash SQL parity, correct origin, no logs, two walls even against accepting RPC mocks, sanitized failures, late dialog results and status precedence. Public server helper never exposes raw provider failures or extra RPC fields.

## 3. E2E, AR/EN and privacy

```powershell
$env:CI = '1'
npm run e2e -- tests/e2e/registration-links.spec.ts
npm run e2e
```

Public CI cases: `/register/<bogus>` remains public and renders the same generic invalid message in Arabic RTL and English LTR; axe has zero violations; response has no-referrer even with absent backend env/error response; anonymous `/registration-links` redirects to login; nested/prefix lookalikes do not gain public access. Existing auth/showcase/health paths retain behavior. Do not add a public test bypass route.

Local authenticated cases are mandatory final verification, even if CI only supports public cases. Four-role staff journey: selector scope, available/current filtering, price exactness, PO/WO/Sales schedule editor, Trainer no editor and forged request denial, live sum/order checks, Copy-only issue confirmation, close/unmount/workspace-switch clearing, ignored late response, recent status precedence. Verify all labels/states in AR/EN, keyboard/focus restoration, light/dark and narrow viewport, no-workspace/no-offer/empty/loading/error/retry states. PO/WO commission may be present only through gate; Sales/Trainer HTML/RSC/action payloads must contain no rate/hash. An opened public fixture shows name and minimal message only, never price/package/form/placeholder.

Check no raw token/hash/path in captured app logs, error objects, analytics/breadcrumbs, audit details or cache keys; do not attach full real generated URLs as screenshots/test evidence. Use synthetic token fixtures and scrub secret-bearing Playwright traces/artifacts. Generated URL itself necessarily appears in the one-time dialog and browser's request path; “never stored” means no application persistence or logs, not removal from recipient browser history. Platform access logging needs independent route-redaction verification before production; tests do not certify Cloudflare operational configuration.

## 4. Reviewer mutation checks — executed by Codex, audited by Claude

Only on an owned disposable local stack and uncommitted scratch changes. Record mutation, exact assertion that fails, restoration and green rerun. Restore functions/grants with transaction rollback or rebuild a fresh disposable fixture environment; do not edit committed migrations or use git reset. A test that fails for an unrelated FK/grant does not prove the intended invariant.

1. **Drop sum-equals-price enforcement**: disable/remove both RPC total check and deferred DB sum check, preserving other schema/guards. An otherwise valid increasing schedule with total different from captured price must wrongly commit; `registration-links-issue` total rejection and privileged commit-time integrity tests must now fail. Test the RPC and deferred barriers separately too so neither hides a missing wall. Restore and rerun green.
2. **Allow Trainer schedules**: remove only issuance DB configure_installment_schedule check, leaving generate capability and valid Trainer membership intact. Trainer-with-valid-schedule integration must fail because it unexpectedly succeeds. Separately bypass the app second authorization check with an accepting RPC mock; action unit test must fail. Do not modify the approved capability matrix to perform this mutation. Restore and rerun green.
3. **Distinct invalid states**: alter open RPC to return expired/consumed/unknown-specific status or extra discriminating field. Exact response equality in open integration must fail, with valid still working. Separately mutate UI adapter and verify public generic-state test detects divergence. Restore and rerun green.
4. **Skip opened_at set-once guard**: remove the guard's populated-marker overwrite/reset rejection. A privileged rollback-scoped UPDATE that changes a populated opened_at must succeed and make the integrity test fail. Ordinary repeated-open still passing is insufficient because the RPC's conditional UPDATE masks the missing guard. Catalog trigger existence alone is also insufficient. Restore and rerun green.
5. Remove child same-transaction INSERT guard and add one full-price row at seq 1 to an older no-schedule link. Its amount/order rules otherwise pass, so the dedicated late-insert assertion must fail. Also test no-op-parent-UPDATE followed by INSERT and insertion after a later first-open; the complete guard combination must reject both. Independently remove DELETE/TRUNCATE guards. Use unreferenced fixtures or temporarily remove incoming FKs in a rolled-back transaction so FK errors cannot impersonate guards. Restore constraints/guards and prove final green.
6. Temporarily grant parent hash/rate column or table SELECT; explicit/wildcard secrecy tests and catalog grants assertions must fail. Weaken PO/WO reader scope or safe view invoker setting and verify foreign/role tests detect it. Restore grants/functions.
7. Remove actor advisory lock and synchronize concurrent issuance at the local placeholder boundary across two workspaces for one actor. Expected successful-count upper-bound test must fail (use a barrier to make the race deterministic). Restore lock. Remove offer lock or current-source guard and verify current coherent-snapshot tests detect the corresponding mutation with R10-1 superseded-version stale_terms assertions.
8. Duplicate issued audit in RPC or reset first-open on every call; exact-one/empty-details tests must fail. Omit no-referrer after middleware response replacement; header e2e/unit check must fail. Change grace to expiry+30m, sliding open time or non-strict deadline; table/parity tests must fail. Restore and rerun complete gates.

Codex records execution evidence and unresolved failures in final task notes. Claude independently audits the evidence, code and required reruns and owns approval. Completion of Codex verification is not Claude acceptance and cannot close policy NDs.

## 5. Artifact-only validation and handoff

For this documentation run execute only scoped Prettier write/check, artifact consistency/link/FR-task-test checks, git diff checks and local feature-state verification. Feature pointer: `.specify/feature.json` → `{"feature_directory":"specs/010-registration-links"}`; deliberately leave outside the requested artifact commit. Commit only `specs/010-registration-links` with the exact requested subject/trailer; do not push. Report commit SHA, open decisions, Analyze result and every flagged interpretation/conflict from research.

9. **R10-1 current-version mutation**: remove current-version comparison from issuance and insert guard in scratch SQL only. Superseded displayed-version test must fail by unexpectedly succeeding. Reset DB and rerun the full integration suite green.
