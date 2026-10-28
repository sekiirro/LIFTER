# Quickstart / Validation: F11 client accounts

**AD-F11-1: PENDING PO — architect recommendation: option (i).** All option-(i) schema, RPC, hashing, compatibility and proof details below are conditional proposals, blocked on AD-F11-1 (PENDING PO). C1–C4 are **proposed evaluation criteria**, not approved conditions; no implementation or hosted proof is claimed. Option (ii) analysis remains in research.md. ND-F11-1..10 are Decided (PO, 2026-10-28); the verbatim decisions and explicit open sub-decisions are in [spec.md](spec.md#po-decision-register-and-open-sub-decisions).

Future implementation runbook, not evidence of application tests passing in design-only U3. **Q-M03** Synthetic data and an owned disposable local stack only. This design run may run read-only metadata inspection but no database setup/write/reset. No linked/cloud commands, deploy, protected worktree access, committed-migration edits or dependency changes. Obtain PO decision on AD-F11-1, evaluate proposed C1–C4, resolve explicit open sub-decisions and independent plan/Tasks/Analyze review before implementation approval.

## Prerequisites and gates

Node 24/npm, existing pinned dependencies, Docker Desktop, CLI `npx --yes supabase@2.122.0`; actual Auth version must be checked independently. Future implementer installs existing dependencies using lockfile, without updates. Confirm fresh isolated local migrations, loopback DB/API, synthetic users and private environment configuration; do not reuse/mutate another task's `lifter` stack. Never print service keys or status environment output. Existing integration harness must fail if missing configuration, not silently skip.

From repository root, run independently and stop on failure:

```powershell
npm run typecheck
npm run lint
npm run format:check
npx --yes prettier@3.9.10 --check specs/011-client-accounts --ignore-path .gitignore
npm test -- --configLoader native --pool threads
npm run test:integration
$env:CI = '1'
npm run e2e
npm run build:edge
npm run check:secrets
npm run size
```

Scoped Prettier uses the ignore override because `.prettierignore` excludes specs. `build:edge` is local output only, not deploy. Inspect size report and existing limits without inventing a budget. Reviewer independently reruns meaningful gates and isolation tests; backup/restore and B4/production-readiness obligations remain unchanged. CI public tests do not replace local authenticated/provider integration coverage.

## Local feasibility and Auth proof

U2 observed local GoTrue v2.197.0/PostgreSQL 17.11/pgcrypto in extensions; [research](research.md) records catalog details and version-pinned primary sources. Future owned test stack must recheck users/identities columns, generated fields, indexes, grants, triggers, Auth configuration and encryption settings. Never query password values into test reports.

**Q-C1:** On the owned local GoTrue v2.197.0 stack capture the latest `auth.schema_migrations` value, explicit allowlist, every written Auth column/type and actual bcrypt cost; never guess them. Before any RPC write (including attempt insert/redemption), a version or column/type mismatch returns generic unavailable, zero row changes and no consumption. Test conditions separately.

**Q-C2:** Create a synthetic account via signup with anon/publishable credentials, then sign in via real local GoTrue `signInWithPassword`. Create a separate local GoTrue-admin reference user in the server-only harness. Diff every GoTrue-set column of `auth.users` and `auth.identities` at the same pre-sign-in lifecycle point. Explicitly normalize only ids, timestamps, hashes, email/phone values (including nested representations). Enumerate columns so additions fail coverage rather than disappearing from a hand-picked projection. Both proofs must pass; report only pass/fail and column names, never hashes/PII/credentials.

**Q-C3:** Prove `extensions.crypt(..., extensions.gen_salt('bf', <GoTrue cost>))` with captured local cost, correct metadata/confirmation without SMTP, safe role/aud, no phantom membership, UTF-8/NUL/72-byte behavior without silent truncation/prehash. ND-F11-1 sets minimum 8 characters including a number and symbol; maximum length/symbol definition remain ND-F11-1a. Plaintext must be absent from exceptions/RAISE, audit, logs, receipts and returns. Verify server anon/publishable-only signup RPC calls and no browser service key. Admin reference creation and existing F4 are separate server-only paths.

**Q-C4:** Production blocker: "Option (i) verified on local stack only; hosted Supabase Auth version/DML permission and upgrade allowlist must be re-verified before any deployment (PO approval)". C1–C3 local proof has not run in U3. Do not contact hosted services.

## Required scenarios and expected results

| Suite/area           | Proof                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pure contract/policy | Every ND has one owner and decided values/open sub-decisions; no unresolved production defaults; approved normalization/password/fields boundary fixtures; no policy duplicated in app/SQL                                                                                                                                     |
| Link/time            | Valid, malformed, unknown, expired, consumed; exact deadline equality; unchanged F10 pre-expiry/grace-open rendering versus strict signup; never-opened expiry; repeat open; waits crossing expiry and expensive hash crossing strict expires_at; no now()-staleness admission                                                 |
| Success/snapshot     | One Auth user/email identity/client, issued same-workspace version/schedule unchanged, consumed once, exact safe audit events; no finance/subscription/membership/role effects                                                                                                                                                 |
| Concurrency          | Barrier-controlled same link and different-link email/phone/both collisions, normalized equivalents, staff/client cross-identity races; at most one canonical owner/link signup                                                                                                                                                |
| Rollback             | Inject after each Auth/client/claim/consume/receipt step, zero-row consume and deferred integrity/audit failure; no partial DB effects or usable orphan                                                                                                                                                                        |
| Replay               | Lost commit response/exact secret returns generic invalid, no extra identity/success or consumption event/session; separate structured attempt/failure evidence survives rollback; wrong secret on consumed link invalid; no expiry of dedup into reuse                                                                        |
| Public D-08          | Identical email-only/phone-only/both/same/foreign/staff collision outputs; invalid links never reveal duplicate diagnostics; no provider/constraint details                                                                                                                                                                    |
| Attempts             | Direct RPC cannot forge/bypass admission; durable failed-attempt counting, parallel token serialization, decided numerical limits/generic exhaustion; attempt definition and rolling/fixed windows ND-F11-5a open; both 5/link/15-minute and 30/IP/hour limits enforced, including shared IPs; counting/windows ND-F11-5a open |
| Isolation/grants     | All tenant tables have mandatory workspace/composite FK, forced RLS; anon/client/foreign/revoked negatives for every new table/surface; exact grants/no wildcard PII, no role/capability changes; narrow definer checks tested directly                                                                                        |
| Audit regression     | Full latest F10 mapping inventory preserved; exact-once new success events, no success/consumption event on rollback/replay; attempt/failure evidence persists independently; non-PII allowlist; F4/F9/F10/jobs unchanged                                                                                                      |
| F4 dependency        | Real signup targets through helper, own/foreign/revoked/anonymous and role negatives; fixture restoration cannot erase installed lookup                                                                                                                                                                                        |
| UI/edge/privacy      | AR RTL/EN LTR, mobile/desktop, dark/light, keyboard/axe, correction/pending/duplicate/invalid/complete; no unapproved public terms; Workers build and secret scan                                                                                                                                                              |

Record fixtures and assertions for every FR-001..015 and SC-001..007; link tests to the [surface contract](contracts/client-signup-surface.md) and [data model](data-model.md). Preserve existing F4/F10/integration catalog/matrix parity suites. No fake accepting RPC mock substitutes for real DB admission/RLS tests; app-wall tests also use accepting mocks to expose missing app checks.

GET and POST e2e assert headers on every business/error outcome, absent env and cookie-refresh/framework-error paths; malformed/nested register variants cannot leak through login next. Capture scrubbed app/provider-adapter logs, response headers, redirects, HTML/RSC/action payload and traces. Assert zero token/hash/request secret/password/PII/provider-body leaks. Host access/WAF/error log capture requires separate operational verification before real use, with no deployment authorized here.

## Reviewer mutation checks (at least ten; future execution)

Use owned disposable fixtures/scratch changes only. For each mutation record the exact assertion that fails, restore through a controlled patch or transaction rollback, then rerun green. Do not edit committed migrations, use prohibited git cleanup/reset or weaken production controls to manufacture test results. A failure from an unrelated grant/FK does not prove detection.

1. **Q-M01** Remove **link FOR UPDATE** only; use barriers for simultaneous same-link attempts. The serialization/order test must fail even if UNIQUE still prevents two clients; assert no extra Auth identity/side effect and authoritative post-wait recheck.
2. **Q-M02** Remove **consume `consumed_at IS NULL` / validity guard or RETURNING-row requirement**. Race or wait across expiry; expect consume-once/expired rollback tests to fail. Independently probe set-once trigger so RPC guard cannot mask missing DB protection.
3. Drop **client canonical UNIQUE** and separately registry UNIQUE (or both enforcement layers as appropriate). Different-link normalized collisions must expose multiple owners and fail dedicated integrity tests; do not accept precheck-only coverage.
4. **Q-M04** Add/loosen **RLS policy** to true with valid signed foreign identity. In a rolled-back isolated probe fixture-grant only safe id/workspace columns first; baseline default-deny rejects and mutated policy leaks A/B rows, so privilege denial cannot mask RLS. Product grants stay zero.
5. **Q-M05** Widen **column grant** to email/phone or table SELECT. Exact zero-grant catalog assertion must fail; in a separate rolled-back probe supply a fixture-only scoped SELECT policy so explicit/wildcard reads detect the widened column grant independently of RLS.
6. **Q-M06** Remove a **legacy audit branch**, especially F10 issued/opened or jobs/recovery, from the future full body. Dedicated existing mapping test must fail. Separately remove/duplicate client/consume audit and assert exact count/rollback behavior.
7. **Q-M07** Differentiate **duplicate response** by phone/email/workspace/provider code, HTTP status or translated message. Exact public response equality tests must fail for all collision classes.
8. **Q-M08** Permit a **usable orphan Auth path** by omitting Auth rollback from the protected transaction. Force client/audit failure, then try real local GoTrue sign-in; no-orphan tests must fail.
9. **Q-M09** Inject **token into redirect/login next or log**. Scrubbed capture assertions must detect actual Location/log emission, including nested register routes, server action exceptions and provider diagnostics.
10. **Q-M10** Remove **no-referrer/no-store headers**, one at a time and after middleware response replacement. GET/POST success/invalid/duplicate/provider/framework-error assertions must fail.
11. **Q-M11** Replace post-lock **clock_timestamp() with transaction-start now()**. Hold lock until expires_at passes; invalid/no-effects test must fail on the otherwise valid delayed submit.
12. **Q-M12** Remove **committed receipt/request-secret/link binding** or permit a second identity after lost commit response. Lost-response tests must detect second identity/repeated event/altered binding; matching-secret consumed replay stays invalid.
13. **Q-M13** Disable **composite snapshot FK/insert match** and send a foreign or different issued version with otherwise valid data. Isolated integrity assertion must fail without relying on another constraint.
14. **Q-M14** Bypass **app admission/authorize** with an accepting RPC mock; app negative test must fail. Separately bypass DB guard and call RPC directly to show the DB negative detects that wall independently.
15. **Q-M15** Stop durable **per-token attempt accounting** or allow admission ticket reuse. Parallel failed/duplicate attempts must exceed injected limit and fail limiter tests; both link and IP limits must be independently tested.
16. **Q-M16** Bypass **C1 compatibility guard**, separately for unknown latest migration and missing/wrong-type written columns. Mismatch no-write/no-consumption assertions must fail, including zero attempt/redemption changes.
17. **Q-M17** Remove **DELETE/TRUNCATE guards** or widen UPDATE transitions; distinguish forbidden general attempt deletion from the required narrow 30-day purge exception. Privileged rollback-scoped probes must isolate guards from FK masking and detect the change on each new table. Restore constraints and functions afterward.

## U4 documentation validation and handoff

Verify branch `011-client-accounts`, starting HEAD `054b86b`; only `specs/011-client-accounts/**` changes. Check all verbatim PO decisions, explicit open sub-decisions, AD-F11-1 PENDING PO, relative links, scoped formatting, `git diff --check`, T001–T046 order/units and unchanged T046 scope. No application/mutation gates execute in this documentation-only unit.

SQL mutations Q-M01–Q-M06, Q-M08, Q-M11–Q-M17 (where SQL) use local DB only: `CREATE OR REPLACE` function changes or rollback-scoped catalog/constraint probes, never committed-migration edits. Restore the owned DB with `npx --yes supabase@2.122.0 db reset --local` and rerun green. Never reuse another task's stack. TS mutations Q-M07/Q-M09/Q-M10/Q-M12/Q-M14 (where TS) use exact scratch patches; record SHA-256 before/after mutation and verify restored SHA-256 equals original before rerunning green. No prohibited git commands. Identify the failing assertion and rule out unrelated grant/FK masking for each mutation.

Stage explicit F11 artifact paths, commit `docs(011): integrate PO decisions ND-F11-1..10; AD-F11-1 pending PO` with the required co-author trailer, then ordinary `git push`. Claude independent audit is the final placeholder, not executed by this agent. PR creation belongs to a separate later authorized unit.

## Added PO acceptance coverage (future local execution)

Require name/email/phone/password, no Telegram; minimum 8 characters with number and symbol, Supabase Auth email rules and E.164 phone. Maximum/symbol ND-F11-1a open. Assert pending-approval and no client capabilities through both walls; roles/action scope ND-F11-6a and session/destination ND-F11-6b open, no interim view/UI inferred. Signed-in visitors receive manual sign-out prompt; no auto sign-out/linking/merge or token redirects.

Test both 5/link/15-minute and 30/IP/hour limits independently and together, including shared IPs and generic exhaustion. Attempt definition/rolling versus fixed windows ND-F11-5a and trusted client-IP source AD-F11-2 remain blocked; synthetic fixtures are not policy answers. Counts and structured attempt/failure evidence survive signup rollback. Test local-only 30-day attempt-log purge including stored IP PII, younger-record protection, cleanup evidence and preserved one-use receipts. Other audit retention remains undecided; ND-F5-1/B4 unchanged.

DB uniqueness covers active/pending; archived collision generic D-08/admin review; review mechanism/reviewer ND-F11-9a and absent archived state ND-F11-9b open, behavior blocked pending ND-F5-1 closure. D-16 unchanged. Audit coverage includes attempt/success/failure/link consumption/cleanup without secrets/passwords/tokens/hashes; names/payload allow-list technical design. Strict consume requires authoritative time < expires_at; unchanged F10 grace-open may render valid but submit returns generic invalid. ND-F11-4a public-page alignment would need PO-approved F10 change.
