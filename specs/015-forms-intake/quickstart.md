# Quickstart / Validation: F15 Forms/Intake

**Status**: Future verification instructions, 2026-10-29. This planning lane ran no application tests, database probes, Docker/Supabase commands, migrations, or mutation experiments. All implementation evidence below remains pending. [Tasks](tasks.md) assigns proof to units; [plan](plan.md) owns dependencies and blockers.

## Current artifact-only gates

Run only the documentation checks for this planning unit:

```powershell
npx prettier --check specs/015-forms-intake
git diff --check
```

Do not run application tests, database integrations, Docker, Supabase CLI, or `psql` as part of planning. This feature may not use Stack A (F12) or Stack B (F14). No command here authorizes cloud access, deployment, a PR merge, historic migration edits, or destructive cleanup.

## S25-PO-8 / S25-R4 alert channels

S25-PO-8 (verbatim): “**PO Decision — F15:** In-App + Telegram approved. No Email. Preserve escalation rules, prevent duplicates, protect sensitive data, and keep the scheduler disabled until approved. Update specs and handoff.” S25-R4 makes in-app always on and Telegram optional only for explicitly linked staff; email is forbidden. Preserve the D-03/client escalation policy and deduplicate per alert stage, recipient and channel. In-app rows are recipient-only, audited when resolving sensitive IDs, markable as read and retained with the source record under RET-3. Telegram linking uses a single-use short-lived `/start` token whose hash alone is stored. Validate Telegram's webhook secret header with constant-time comparison before parsing updates; bind the verified chat ID, never a username. Unlink and membership-loss revocation disable delivery. Telegram text is generic and includes only an in-app link; no names, answers, health data, token or raw update body may enter jobs, audit or logs. Use fake transport only in tests. Runtime server configuration key names are `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`; this document contains no values. No migration may activate the scheduler. Activation remains disabled pending separate PO approval.
## Future execution prerequisites

1. Obtain PO approval of the completed plan and tasks before implementation. This approval is not implied by the approved correction matrix or the Step 1 decision-record commit.
2. Reconcile the actual latest F12 and F14 integration heads, all migrations including unmerged review fixes, and the complete current bodies of `audit_row_change`, `role_has_capability`, `has_workspace_access`, and F12 guards. Preserve the F12 bidirectional capability-parity test and F14 `manage_branding` change. Do not use stale branch bodies.
3. Assign and verify a NEW isolated F15 database stack and exclusive lock before any DB-dependent task. Record project identity, distinct ports/endpoints, selector, isolation proof and lock owner without printing credentials. If the stack is unavailable or mismatched, stop DB work; never fall back to A or B.
4. Allocate each F15 migration timestamp only after rechecking every actual F12/F14 migration. Use forward-only migrations. The plan reserves no timestamp.
5. Use synthetic fixtures only. No real client Forms data until the 30-day all-copy retention review and applicable production-readiness gates are evidenced. Do not activate alert scheduling in a migration or enable Telegram delivery outside the fake test transport without the required runtime configuration and PO scheduler approval.
6. Any rendered-UI implementation brief must append `C:/Users/NEW LAP/.lifter/briefs/frontend-design-gate.txt` and follow `DESIGN.md`.

## S26 verified Stack D / F12-F14 baseline (2026-11-02)

This execution record supersedes the earlier future-only status above for the F1 work performed from `015-forms-intake` at `263497a0b7fd09d576596a004a2b5dd9d5402b07` (= `origin/015-forms-intake`). Source integration refs available locally were `origin/012-registration-approval-stage2` at `346ffe662d3b99d733a25e3a7bd624fe8e589ddf`, `origin/013-freeze-renewal-refunds` at `547ecd28790be4ab3ae13abdbdf6e06b6bffa489`, `origin/014-workspace-branding` at `c0026de5a65388e36e68336008e2d8b8893c46af`, and `origin/014b-branding-uploads` at `630c3dbfa3e5422e7793de2cf65165e586301eef`; all are ancestors of the verified F15 branch head. The fully integrated migration history was checked on local Stack D using the safe wrapper, not inferred from a feature-branch migration list. Local and remote migration entries matched through latest `20261104031800_f15_telegram_delivery_retry_state.sql`.

Current shared-function source heads in the integrated migration set are `app_private.current_staff_role()` from `20261027120000_tenancy.sql`, `app_private.has_workspace_access(uuid,text)` from `20261027140000_access_capability_for_po.sql`, `app_private.audit_row_change()` from `20261102139000_workspace_branding_audit_extension.sql` (preserving F11/F12/F13/F14 audit mappings), and `app_private.role_has_capability(public.staff_role,text)` from `20261104024000_f15_shared_forms_capability_reconciliation.sql` (including `manage_branding`, `author_forms`, `assign_intake_form`, and `read_form_answers`). T002's Stack D compatibility test compares the installed audit function body against its current migration definition and exercises all role/capability decisions against TypeScript.

Stack D identity and isolation evidence: `supabase-stack-d/supabase/config.toml` declares project `lifter-stack-d`; API `45421`, DB `45422`, Studio `45423`, Inbucket `45424` (SMTP `45425`, POP3 `45426`), analytics `45427`, edge inspector `45428`, and pooler `45429`. The local DB container was `/supabase_db_lifter-stack-d`, labelled with project `lifter-stack-d` and workdir `.../LFTR-p2/supabase-stack-d`, on `supabase_network_lifter-stack-d`; `StartedAt` was `2026-11-02T02:49:43.191849795Z`. The safe CLI wrapper explicitly selected `--stack D`; the bounded busy check found no competing Stack D wrapper/test process. No Stack A/B/C database, container, or config was queried in this execution. The architect assigned this worktree/session as Stack D lane owner; no separate lock file was present under `.lifter`.

No migration timestamp was allocated for T001/T002/T005. Future migrations remain forward-only and must be rechecked against the latest integrated history before choosing a valid version.

## Stack D reset and local provisioning

No repository script currently wraps Stack D reset. After every local reset of `supabase-stack-d`, run the existing local-only Vault/key provisioner immediately, before any integration test. It revokes Vault table/function privileges from API roles and provisions local test keys; these revokes belong in this provisioner, never in a migration. Set the explicit wrapper environment in each PowerShell command and use the Stack D workdir:

```powershell
$env:SUPABASE_SAFE_CLI='node "C:/Program Files/nodejs/node_modules/npm/bin/npx-cli.js"'
$env:LIFTER_SUPABASE_STACK='d'
node 'C:/Users/NEW LAP/.lifter/tools/supabase-safe.mjs' --workdir 'C:/Users/NEW LAP/Desktop/LFTR-p2/supabase-stack-d' --stack D db reset --yes

$env:SUPABASE_SAFE_CLI='node "C:/Program Files/nodejs/node_modules/npm/bin/npx-cli.js"'
$env:LIFTER_SUPABASE_STACK='d'
node 'C:/Users/NEW LAP/.lifter/tools/supabase-safe.mjs' --workdir 'C:/Users/NEW LAP/Desktop/LFTR-p2/supabase-stack-d' --stack D exec -- node -e "process.chdir('C:/Users/NEW LAP/Desktop/LFTR-p2'); import('file:///C:/Users/NEW%20LAP/Desktop/LFTR-p2/tests/integration/client-accounts-provision.mjs').catch(error => { console.error(error); process.exitCode=1; });"
```

Then run the existing Vault grant assertion (`tests/integration/client-accounts-schema.test.ts`, test `Vault keys are inaccessible to API roles, including service_role`) through the same Stack D wrapper. Do not run the provisioner directly or inspect/print its environment files; it handles local credentials internally.
## Future RED → GREEN commands

Run these only under a separately approved implementation brief and after satisfying the prerequisites above. Capture exact commands, expected RED failures, commit/stack/fixture revision, pass/fail/skip counts, and restored results for each mutation. Never commit a mutant.

```powershell
npm run typecheck
npm run test -- tests/unit/forms-authorization.test.ts
npm run test -- tests/unit/forms-progression.test.ts
npm run test:integration -- tests/integration/forms-r3-core.test.ts
npm run test:integration -- tests/integration/forms-r3-reader.test.ts
npm run test:integration -- tests/integration/forms-r3-assignment-races.test.ts
npm run test:integration -- tests/integration/forms-r3-submissions.test.ts
npm run test:integration -- tests/integration/forms-r3-corrections.test.ts
npm run test:integration -- tests/integration/forms-alerts.test.ts
```

These are scoped examples, not permission to omit related regressions. Unit tests do not need a database; every integration test needs the verified, exclusively owned F15 stack. Run the full relevant unit, integration and e2e suites at the release task, with no unapproved skips. The private-repository CI billing limitation remains external; do not change repository visibility to bypass it.

## Named verification scenarios

| ID | Required evidence | Owner |
| --- | --- | --- |
| Q-V01 | F12/F14 exact integration heads, latest shared-function bodies and migration timestamps are rechecked; F15 stack selector and endpoints fail closed on mismatch and prove isolation from A/B. | T001 |
| Q-V02 | Capability parity covers `assign_intake_form`, PO/WO/Trainer allow, Sales deny, and known/unknown values in both TS→SQL and SQL→TS directions; latest audit mappings remain intact. | T002 |
| Q-V03 | App and forced-RLS walls enforce client self-only, staff current workspace, PO explicit existing workspace, Sales denied, pending/rejected denial, and indistinguishable foreign/nonexistent denials. | T003 |
| Q-V04 | Every answer/current/history read uses the audited reader; audit append precedes content; audit failure returns zero answer bytes; direct table, embedding, PostgREST and unaudited RPC paths deny. | T004, T014 |
| Q-V05 | Answer responses are HTTPS/private/no-store; no service-role or browser persistence path exists; injected canaries and raw provider/DB errors do not reach enabled logs, traces, telemetry, jobs or audit. | T005, T012, T016 |
| Q-V06 | Published versions and assignment snapshots remain immutable, bilingual authored content is preserved, and unsupported executable/unbounded rules reject. | T006, T007 |
| Q-V07 | Approval/selection orderings, replay, backfill, distinct-key races, authorization rechecks and audit rollback produce at most one authorized one-time assignment. | T008, T010 |
| Q-V08 | PO supplies the actual Mandatory Intake name and questions at T009; absent input cannot publish/select a guessed form; required sections and no arbitrary fallback are enforced after input. | T009 |
| Q-V09 | Draft revision conflicts, canonical intent replay, cross-device resume, incomplete submission rejection and atomic original submission/SLA creation hold under concurrency. | T011–T013 |
| Q-V10 | Corrections append immutable versions for ordinary, medical and attachments wherever attachments exist; every answer/history path follows the audited-reader and four-actor authorization matrix; deny all corrections after Closure/Refund/Deactivation (Q1). D-29 permits only automatic server-validated D1 erasure of values currently inapplicable under authoritative answers, across versions and their answer-change/access-view rows; no human/service-role direct trigger/delete; legal hold defers and alerts; idempotent, tenant-isolated, fail-closed; counts-only/no-ID control record; no content logs; RET-3 all-copy purge. | T014, T026, T029 |
| Q-V11 | Pure `Africa/Cairo` D-03 fixtures cover Thursday 18:00, Friday, day five, leap/year boundaries, spring-forward gap and overlap; due threshold uses first valid instant. | T015 |
| Q-V12 | Synthetic client-late schedule tests prove Trainer at deadline+24h and PO+WO at +48h, no-Trainer PO+WO routing, reassignment without clock reset, current authorization and IDs-only state; separate D-03 Trainer-late tests preserve existing Q4 rules. Real-data behavior requires authoritative P4 facts. | T016, T017, T025 |
| Q-V13 | Purge uses authoritative Closure/Refund/Deactivation time, is idempotent, preserves reusable templates and immutable financial ledger, and meets 30 days across every recoverable copy before real data. | T018, T019, T025 |
| Q-V15 | Cairo assignment deadline is day 0 plus 3 calendar dates for Intake; other forms allow 1-14 days defaulting to 3; recurring occurrences get separate deadlines. DST, calendar boundaries, invalid values, +24h/+48h alerts, no-Trainer routing and reassignment without reset must pass pure tests; required mutants must fail. | T027, T028 |
| Q-V14 | Rendered AR-RTL/EN-LTR × light/dark × mobile/desktop states pass keyboard, screen reader, axe, contrast and DESIGN.md review; retain screenshots. | T020–T024 |

## Required mutation evidence

Security, authorization, audit, idempotency, retention and scheduler tasks name deliberate defects and their expected detectors directly in [tasks.md](tasks.md). Each mutation is disposable, must fail a meaningful assertion, then be restored before the same check passes. Mutation testing is future implementation evidence; none was run during planning.

## Production gates

- 30-day legal/technical feasibility across hosted DB, PITR, snapshots, backups and any future storage; no unresolved exception or recoverable copy beyond 30 days.
- Hosted at-rest encryption and applicable encrypted backup/restore gates, including BR-01/02 and DP-01/02 in `docs/13-production-readiness.md`.
- Authoritative P4 first-pair delivery and responsible-Trainer coverage; alert catch-up and recipient OPEN details resolved before real-data alerts or scheduler activation.
- Existing exact-head CI, security, review and explicit PO merge gates. This plan does not claim they have been checked.

No update to `docs/13-production-readiness.md` is made by this planning artifact; any readiness-register change belongs in an explicitly authorized readiness update.

The delivery worker also reads `TELEGRAM_BOT_USERNAME` to build the staff bot link and `APP_URL` to build the in-app inbox link. These are configuration key names only; tests use fake transport and local example URLs.
`TELEGRAM_WORKER_SECRET` guards the internal job-worker route; provision it as a server-only runtime secret before configuring an external runner. The scheduler remains disabled.
