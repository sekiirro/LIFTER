# Quickstart / Validation: F11 client accounts

Future implementation runbook, not evidence of application tests passing in U2. Synthetic data and an owned disposable local stack only. U2 may run read-only metadata inspection but no database setup/write/reset. No linked/cloud commands, deploy, protected worktree access, committed-migration edits or dependency changes. Resolve AD-F11-1, ND-F11-1..10 and independent plan/Tasks/Analyze review before implementation approval.

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

For option (i), prove pgcrypto bcrypt → ordinary GoTrue email/password sign-in, correct email identity/provider metadata, confirmation without SMTP, UTF-8/NUL/72-byte behavior, safe role/aud and no phantom staff membership. Compare new identity behavior with provider-created synthetic controls. Hash/storage encryption or schema mismatch must fail closed, not be waived. Verify password accepted/rejected boundaries only after ND-F11-1 is approved.

For option (ii), prove createUser reserves the exact ID, initial permanent pending gate is effective at provider commit, every sign-in/recovery path denies pending users, and atomic gate release occurs only with committed client. Advance time beyond finite ban to prove that finite duration is not the safety barrier. Inject provider create response loss, DB commit response loss, delete/ban/reconcile failures and process death at every boundary; run overlapping finalize/cleanup workers under fencing. A committed user must never be compensated. If permanent gate/GoTrue infinity compatibility is not proven, this candidate cannot ship.

## Required scenarios and expected results

| Suite/area           | Proof                                                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure contract/policy | Every ND has one owner and provisional labels; no production provisional mode; approved normalization/password/fields boundary fixtures; no policy duplicated in app/SQL                                                                |
| Link/time            | Valid, malformed, unknown, expired, consumed; exact deadline equality; pre-expiry open/grace; never-opened expiry; repeat open; waits crossing expiry and expensive hash crossing grace; no now()-staleness admission                   |
| Success/snapshot     | One Auth user/email identity/client, issued same-workspace version/schedule unchanged, consumed once, exact safe audit events; no finance/subscription/membership/role effects                                                          |
| Concurrency          | Barrier-controlled same link and different-link email/phone/both collisions, normalized equivalents, staff/client cross-identity races; at most one canonical owner/link signup                                                         |
| Rollback             | Inject after each Auth/client/claim/consume/receipt step, zero-row consume and deferred integrity/audit failure; no partial DB effects or usable orphan                                                                                 |
| Replay               | Lost commit response/exact secret returns generic invalid, no extra identity/event/session; wrong secret on consumed link invalid; provider ambiguity reuses reserved ID; no expiry of dedup into reuse                                 |
| Public D-08          | Identical email-only/phone-only/both/same/foreign/staff collision outputs; invalid links never reveal duplicate diagnostics; no provider/constraint details                                                                             |
| Attempts             | Direct RPC cannot forge/bypass admission; durable failed-attempt counting, parallel token serialization, approved count/window/reset/exhaustion/duplicate rules; shared-IP legitimate users not blocked                                 |
| Isolation/grants     | All tenant tables have mandatory workspace/composite FK, forced RLS; anon/client/foreign/revoked negatives for every new table/surface; exact grants/no wildcard PII, no role/capability changes; narrow definer checks tested directly |
| Audit regression     | Full latest F10 mapping inventory preserved; exact-once new success events, no event on rollback/replay; non-PII allowlist; F4/F9/F10/jobs unchanged                                                                                    |
| F4 dependency        | Real signup targets through helper, own/foreign/revoked/anonymous and role negatives; fixture restoration cannot erase installed lookup                                                                                                 |
| UI/edge/privacy      | AR RTL/EN LTR, mobile/desktop, dark/light, keyboard/axe, correction/pending/duplicate/invalid/complete; no unapproved public terms; Workers build and secret scan                                                                       |

Record fixtures and assertions for every FR-001..015 and SC-001..007; link tests to the [surface contract](contracts/client-signup-surface.md) and [data model](data-model.md). Preserve existing F4/F10/integration catalog/matrix parity suites. No fake accepting RPC mock substitutes for real DB admission/RLS tests; app-wall tests also use accepting mocks to expose missing app checks.

GET and POST e2e assert headers on every business/error outcome, absent env and cookie-refresh/framework-error paths; malformed/nested register variants cannot leak through login next. Capture scrubbed app/provider-adapter logs, response headers, redirects, HTML/RSC/action payload and traces. Assert zero token/hash/request secret/password/PII/provider-body leaks. Host access/WAF/error log capture requires separate operational verification before real use, with no deployment authorized here.

## Reviewer mutation checks (at least ten; future execution)

Use owned disposable fixtures/scratch changes only. For each mutation record the exact assertion that fails, restore through a controlled patch or transaction rollback, then rerun green. Do not edit committed migrations, use prohibited git cleanup/reset or weaken production controls to manufacture test results. A failure from an unrelated grant/FK does not prove detection.

1. Remove **link FOR UPDATE** only; use barriers for simultaneous same-link attempts. The serialization/order test must fail even if UNIQUE still prevents two clients; assert no extra provider identity/side effect and authoritative post-wait recheck.
2. Remove **consume `consumed_at IS NULL` / validity guard or RETURNING-row requirement**. Race or wait across expiry; expect consume-once/expired rollback tests to fail. Independently probe set-once trigger so RPC guard cannot mask missing DB protection.
3. Drop **client canonical UNIQUE** and separately registry UNIQUE (or both enforcement layers as appropriate). Different-link normalized collisions must expose multiple owners and fail dedicated integrity tests; do not accept precheck-only coverage.
4. Add/loosen **RLS policy** to true with valid signed foreign identity. In a rolled-back isolated probe fixture-grant only safe id/workspace columns first; baseline default-deny rejects and mutated policy leaks A/B rows, so privilege denial cannot mask RLS. Product grants stay zero.
5. Widen **column grant** to email/phone or table SELECT. Exact zero-grant catalog assertion must fail; in a separate rolled-back probe supply a fixture-only scoped SELECT policy so explicit/wildcard reads detect the widened column grant independently of RLS.
6. Remove a **legacy audit branch**, especially F10 issued/opened or jobs/recovery, from the future full body. Dedicated existing mapping test must fail. Separately remove/duplicate client/consume audit and assert exact count/rollback behavior.
7. Differentiate **duplicate response** by phone/email/workspace/provider code, HTTP status or translated message. Exact public response equality tests must fail for all collision classes.
8. Permit **usable orphan Auth path** by releasing gate before finalize or omitting Auth transaction rollback/compensation. Force client/audit failure then actual GoTrue sign-in; test must fail. Also fail cleanup/reconciler and advance beyond finite ban; no finite-ban-only false pass.
9. Inject **token into redirect/login next or log**. Scrubbed capture assertions must detect actual Location/log emission, including nested register routes, server action exceptions and provider diagnostics.
10. Remove **no-referrer/no-store headers**, one at a time and after middleware response replacement. GET/POST success/invalid/duplicate/provider/framework-error assertions must fail.
11. Replace post-lock **clock_timestamp() with transaction-start now()**. Hold lock until expiry/grace passes; invalid/no-effects test must fail on the otherwise valid delayed submit.
12. Remove **request receipt/reserved-ID binding** or retry createUser with a fresh ID after lost response. Lost-response test must detect second identity, repeated success event or altered binding; every consumed replay, including matching secret after lost success, must stay invalid.
13. Disable **composite snapshot FK/insert match** and send a foreign or different issued version with otherwise valid data. Isolated integrity assertion must fail without relying on another constraint.
14. Bypass **app admission/authorize** with an accepting RPC mock; app negative test must fail. Separately bypass DB guard and call RPC directly to show the DB negative detects that wall independently.
15. Stop durable **per-token attempt accounting** or allow admission ticket reuse. Parallel failed/duplicate attempts must exceed injected limit and fail limiter tests; no IP-only blocking assertion may be substituted.
16. Race **reconciliation against committed finalize** by removing fence/committed check; committed identity must be incorrectly deleted/banned and cause the protection test to fail. This is required for option (ii), not optional best-effort cleanup.
17. Remove **DELETE/TRUNCATE guards** or widen UPDATE transitions. Privileged rollback-scoped probes must isolate guards from FK masking and detect the change on each new table. Restore constraints and functions afterward.

## U2 artifact validation and handoff

Run scoped formatting/check, relative-link/required-content review and `git diff --check`. Verify branch and base; review that only five new design artifacts changed and existing spec/checklist/application files did not. Application gates above are future obligations, not run/claimed for documentation-only changes. Check `.specify/extensions.yml` before and after planning; absent at this run, no hooks dispatched.

Stage only explicit F11 artifact paths, commit `docs(011): F11 plan` with required co-author trailer, then ordinary `git push` as authorized. Report SHA/push, both AD candidates/recommendation/evidence, verbatim lock/boundary, seam table, proposed tables/functions/grants and remaining risks. Independent architect review decides AD-F11-1; PO decides all ten ND seams.
