# F15 Research Notes

**Scope**: design research for `specs/015-forms-intake/spec.md`; no runtime behavior was tested and no implementation is authorized by this document.

## Existing system constraints inspected

- Repository is a Next.js 16 / React 19 / TypeScript 6 application using Supabase Auth/PostgreSQL, Vitest and Playwright (from `package.json`).
- Constitution requires workspace composite identity, server authorization plus forced database RLS, immutable versioned content, audited sensitive access, least privilege and no invented policy.
- F15 specifies actual helpers `app_private.role_has_capability` and `app_private.has_workspace_access`; PO workspace operations still require joining an existing workspace. Client identity comes from signed Auth association and approved state.
- F12 owns the immutable registration approval fact, subscription identity and client self-access contract. F15 consumes those seams; it does not mutate F12 finance or approval records.
- F14 owns workspace branding. F15 consumes only its published data/token contract after merge.
- F11's migration `20261031130000_purge_scheduling_pg_cron.sql` is the approved owner-only scheduler pattern. F15 alert schedule must not activate from a migration.
- The shared `audit_row_change()` and capability SQL/TS files require reconstruction from the latest merged F12 and F14 bodies. A stale branch copy would discard mappings.

## Decisions carried forward

### S25-R3 renewal occurrence semantics

- Renewal occurrences use the opaque key `renewal:<subscription-id>`. Payment or confirmation time is not a delivery clock. Evaluation is eligible once the current F13 service window has started in Cairo: the latest `subscription_renewal_date_revisions.service_start_date`, falling back to the immutable `subscription_renewals.service_start_date`, is on or before today, and `f13_project_entitlement(..., today)` is `active`.
- The check is level-triggered and idempotent. A later evaluation can materialize a missed renewal occurrence exactly once; replay is suppressed by the occurrence ledger. This does not replay recurring dates skipped while the entitlement was frozen or inactive: each recurring date has its own key and is evaluated only for that date.
- Worked freeze example: if a renewal was initially scheduled for day 10 and an F13 freeze reflows its actual start to day 15, day 10 remains ineligible even if payment was recorded earlier. Day 15 is the first eligible date when F13 projects `active`; a later repeated evaluation sees the same `renewal:<subscription-id>` key and creates no duplicate.
- Stack D has the forward migrations `20261104030600_f15_renewal_service_start_idempotency.sql` and `20261104030700_f15_assignment_evaluation_date_core.sql`. Renewal, recurring, approval-cutoff, future-eligibility, and the 12 requested rollback-only mutation probes passed on Stack D. The date-taking core is private to the owner; the public three-argument RPC retains its grants and evaluates using the current Cairo date. The full Stack D integration run passed 87 files / 1,456 tests with 1 existing skip. The full unit gate passed outside the safe wrapper in a clean PowerShell process after unsetting API_URL, DB_URL, ANON_KEY, SERVICE_ROLE_KEY, LIFTER_SUPABASE_STACK, SUPABASE_SAFE_CLI, and all `SUPABASE_*` variables: 156 files / 2,056 tests, no skips or errors. T010/T023 B4 acceptance is complete; unrelated task gaps remain tracked in the S25 audit.

| Topic | Planning decision | Basis |
| --- | --- | --- |
| Storage | PostgreSQL only for MVP Forms data; no attachment feature/storage | FR-032 and Final PO APPROVAL: permission covers attachments wherever they exist, not creation of storage |
| Authorization | Client self-only; staff current workspace; PO explicit existing workspace; Sales denied | FR-020/021, approved correction matrix |
| Audited reads | All sensitive answer and history reads append IDs-only audit before returning content; audit failure returns no answers | FR-024 and approved matrix |
| Versioning | Published versions, assignment snapshots and answer corrections are append-only/immutable | FR-004/005/013 |
| Assignment sequencing | First one-time per-client; cohorts/recurrence only after eligibility semantics are clarified | FR-003/031 and OPEN items |
| Calendar | Pure `Africa/Cairo` D-03 calculation with `cairo-d03-v1`, Friday excluded, first valid instant after day five | FR-015/016 |
| Retention | 30 days from authoritative Closure/Refund/Deactivation, including recoverable backups; legal/technical review blocks real data | FR-012/033, RET-1..3 |
| Alerts | Synthetic implementation allowed; real data requires complete P4 facts and resolution of catch-up/recipient OPEN cases | FR-017–019 |
| UI | Existing DESIGN.md system, separately authored Arabic/English, mandatory appended Frontend Design Gate per UI brief | FR-026/029 and repository gate |

## Engineering questions resolved by planning

- **Locking**: preserve F12 client → subscription → obligations/ledger order. P2 adds selection/assignment policy and answer revision locks after the client/subscription locks and rechecks authorization after waits.
- **Idempotency**: operation keys bind canonical intent, but independent unique constraints must protect original assignment/submission/SLA against distinct-key races.
- **Read path**: one server-side audited reader is the only answer-bearing route; RLS denies direct reads that bypass audit. The reader writes safe audit evidence before materializing the answer response and fails closed.
- **Failure responses**: raw database/constraint/provider errors are mapped to allow-listed codes; do not log raw errors because constraints may echo health values.
- **Unknown policy**: hidden-answer disposition, cohort membership semantics, alert catch-up/unavailable recipients, post-end correction eligibility and exact PO-supplied Mandatory Intake content remain open. No technical convenience resolves them.

## External/runtime facts not assumed

- F12/F14 merge state, final latest migrations, isolated F15 database availability, current hosted backup/PITR capabilities, provider at-rest encryption, real P4 fact coverage and hosted scheduler readiness are unverified by this DB-free lane.
- Before implementation, re-open latest merged source branches and inspect their actual function bodies and migration timestamps. The handoff timestamps are lower-bound planning evidence, not an upper bound.
- No DB, Docker, Supabase CLI, `psql`, integration tests, hosted project or live data was used for this research.
# S25 CHUNK B — assignment policy details and S25-R2 rulings

- An occurrence's audience snapshot instant is the start of the materializing
  database transaction (`transaction_timestamp()`). The policy row and the
  candidate clients are read under the form's transaction advisory lock. A
  retry uses the stored `(workspace, policy, occurrence key)` snapshot and
  cannot add clients who joined later.
- **S25-R2 architect ruling (a):** “New clients on joining/onboarding” means
  clients whose authoritative F12 approval fact has `approved_at >=
  form_assignment_policies.configured_at`. The source is
  `app_private.registration_approval_events.approved_at`; client creation time
  is not used. This includes a client created before the policy and approved
  afterward.
- **S25-R2 architect ruling (b):** F13 projection `active` is required for
  `all_active_clients` and for `recurring`/`renewal` triggers. Onboarding and
  joining delivery, and manual specific-client delivery, accept `active` or
  `future`. `frozen`, `refunded`, `expired`, missing subscriptions and every
  other projection state are excluded for every trigger.
- Each occurrence key is an opaque caller supplied identifier, scoped by its
  form and client in the assignment uniqueness constraint. The same occurrence
  key is recorded once even if its audience snapshot is empty.
- The initial client deadline defaults to three Cairo calendar days after the
  snapshot date and may be configured from one through fourteen days, matching
  FR-034. The due instant is the final millisecond of that Cairo date. B2 must
  continue to use this per-assignment deadline for every recurrence.
- Custom recurrence is represented as an interval of 1–365 Cairo calendar
  days with a Cairo `starts_on` date. This is a bounded, non-executable format;
  arbitrary cron expressions and time zones are not accepted.
- A recurrence scheduled while frozen or inactive is skipped. Resume uses the
  next scheduled date after service resumes; it does not replay missed dates.
- Renewal delivery is due on or after the projected F13 service start when the
  projection is `active`. A freeze that reflows an unstarted renewal moves that
  service start; e.g. a projected start on day 10 frozen through day 12 reflows
  to day 15, so evaluation on day 10 queues nothing and evaluation on day 15
  queues `renewal:<subscription-id>` once. Early payment does not change this
  date. A missed evaluation day is safely materialized later by the idempotent
  renewal key; recurring dates skipped while frozen or inactive remain skipped
  and are not replayed.
- No cron schedule is activated by migrations. T017's owner-only activation
  gate remains separate.
- A recurring occurrence is addressed as `recurring:<Cairo-date>` and is valid
  only on a date on or after `recurrence_starts_on` whose offset is divisible
  by `recurrence_interval_days`. A renewal occurrence is addressed as
  `renewal:<subscription-id>` and is valid when the actual projected service
  start is on or before evaluation and F13 reports `active`. This makes the
  projection, including F13 freeze reflow, authoritative over payment time.
  Manual delivery remains an opaque caller-keyed occurrence. Each stored
  occurrence snapshots its eligible audience once and receives independent
  assignment rows and deadlines.
- T016 materializes client-late and D-03 Trainer-late schedules,
  stage/recipient occurrences, authorization-checked IDs-only `public.jobs`
  enqueueing, and IDs-only audit events. S25-PO-8 resolves the delivery
  channels: in-app is always on; Telegram is optional for explicitly linked
  staff; email is out of scope. The scheduler remains disabled pending separate
  PO approval.
- Client-late clocks are independent from D-03 Trainer-late clocks: a client
  alert is due to the assigned, currently authorized Trainer at deadline+24h;
  if no eligible Trainer exists then PO+WO receive the +24h stage, and PO+WO
  receive the +48h stage in either case. Reassignment changes the recipient
  without changing the original deadline. D-03 Trainer-late retains its existing
  Q4 initial and owner-escalation timing/catch-up rules. T017's pg_cron schedule
  uses the owner-only F11 activation/deactivation pattern and is not activated
  by the migration; explicit-time integration tests call the private evaluator
  core directly.

## S25-PO-8 / S25-R4 channel boundary

- The in-app inbox is the mandatory channel. Inbox rows contain opaque IDs and
  stage metadata, are readable only by the current authorized recipient, and
  are audited when read or marked read. Inbox retention follows the source
  assignment under RET-3.
- Telegram is staff-only and opt-in through a single-use, ten-minute `/start`
  token stored only as a hash. A verified Telegram webhook secret is checked
  with a constant-time comparison before body parsing. Webhook update IDs are
  stored for replay prevention; raw request bodies are not stored.
- Membership loss and explicit unlink revoke the chat binding. Delivery checks
  current authorization and link state immediately before send. Telegram
  content is generic text with only an in-app inbox link; client names, answers
  and health data are excluded. Tests use a fake transport; the server runtime
  reads `TELEGRAM_BOT_TOKEN` without putting its value in source or logs.
- Email and external delivery adapters other than Telegram are out of scope.
  Scheduler activation is not included in any migration and needs separate PO
  approval.
