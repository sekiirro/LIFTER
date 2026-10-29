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
