# Implementation Plan: F15 — Forms/Intake

**Branch**: `015-forms-intake` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Plan status**: Plan APPROVED by PO 2026-10-29 (session 13).

**Input**: Feature specification from `specs/015-forms-intake/spec.md`. This is a plan, not implementation authorization; implementation starts only after PO plan approval.

## Summary

Build a tenant-scoped Forms/Intake engine around immutable published form versions and assignment snapshots, conflict-safe drafts, immutable submissions/corrections, Cairo D-03 delivery obligations, and ID-only in-app alerts. Authorization is enforced in TypeScript and PostgreSQL. Every answer read is audited before data is returned, and failures fail closed. Implement Q3 audience/recurrence policies, with one-time per-client delivery available as an initial slice. Only Q2 removal from already-submitted history/audit is blocked pending PO resolution; no role may correct after Closure/Refund/Deactivation (Q1). Q4 specifies assigned-Trainer alerts, seven-day catch-up, deduplication/reassignment, and simultaneous WO+PO escalation after 24 hours unresolved. No MVP attachment feature or storage is introduced. Real client data and scheduler activation remain gated by retention feasibility/legal review and authoritative P4 facts.

## Technical Context

**Language/Version**: TypeScript (repository Node engine 24), SQL/PostgreSQL migrations
**Primary Dependencies**: Next.js App Router, React, Supabase Auth/SSR/PostgreSQL/RLS, existing `lib/auth`, `lib/i18n`, DESIGN.md components
**Storage**: PostgreSQL only for MVP Forms data; no Forms attachment storage. Hosted encryption and 30-day all-copy purge behavior require pre-production evidence.
**Testing**: Vitest unit/contract; isolated Supabase integration tests; Playwright/axe and rendered screenshots for UI. Tests are written first and observed RED before implementation.
**Target Platform**: LIFTER web application and PostgreSQL-backed Supabase deployment
**Project Type**: Next.js web application with SQL/RLS backend
**Performance Goals**: No numeric product latency promises. Approved bounds: 20 questions per section, 60 per form, 400 conditions, 16 per-question conditions, 4,000 evaluation steps, 131,072 definition bytes, 4,096 UTF-8 text bytes, and 50 choices. The 16,384-byte `maxPayloadBytes` remains pending PO: must accommodate all valid forms; the recorded worst-case valid form exceeds it. Measure and review autosave debounce/max-unsaved behavior before UI/publication ships.
**Constraints**: Sensitive health data; forced tenant RLS; two authorization walls; audited fail-closed reads; append-only versioning; no browser persistence, cache, Realtime or service-role answer path; fixed Cairo D-03 calendar; no real-data alerting without complete P4 facts.
**Scale/Scope**: Six user stories, FR-001-FR-033; Q3 audiences include all active workspace clients, joining/onboarding clients, searched specific clients, custom recurrence, and renewal actual-start triggers.

## Constitution Check

- **I Strict Workspace Isolation**: pass by design only when every tenant relation uses `(workspace_id,id)`, forced RLS, current app authorization, generic foreign/nonexistent denials and cross-tenant negative tests.
- **II Immutable Financial Truth**: no financial writes. P2 reads only required F12 identities/facts and never changes subscriptions or ledgers.
- **III Least Privilege**: approved F15-1/F15-3/correction matrix; Sales denied; PO workspace action requires an explicit existing workspace; unknown capability strings deny.
- **IV Approved Scope**: F15-6's BRD-06 exception is recorded in the spec; no arbitrary rules, attachments, discipline or P4 behavior.
- **V Versioned Content**: immutable published versions, assignment snapshots, answer/submission/correction revisions.
- **VI Human-Governed Decisions**: alerts do not cause strikes, deductions, firing or compensation changes.
- **VII Privacy/Health Data**: no-store answers, IDs-only audit, fail-closed audited reads, redacted safe errors, encrypted backup gates, retention review.
- **VIII UI System**: existing components/tokens and bilingual authored content; every rendered UI brief appends the Frontend Design Gate and follows DESIGN.md.
- **IX Reliability**: idempotent assignment/save/submit/alert flows, concurrency controls, fixed D-03 and DST fixtures.

All checks are design requirements; none is runtime-verified by this DB-free planning lane. Re-check each gate after design and before release.

## Architecture and Unit Boundaries

The detailed ownership and DB classification is in [tasks.md](tasks.md). DB-dependent F15 units require a **NEW isolated stack**: “needs verified isolated stack, not yet assigned.” F15 may not use Stack A or Stack B. Pure helpers, policy logic and component tests use no DB. No F15 integration run, migration, Docker or Supabase operation is part of this planning lane.

### Data/security boundaries

1. App/server routes derive actor and client identity from signed Auth context; client requests never supply client/workspace targets.
2. SQL/RLS independently checks tenant, client association, role capability and current membership. PO scope binds an explicitly existing `public.workspaces` row.
3. Every sensitive-answer/current-answer/history read uses one audited reader. Append IDs-only access evidence first; return no answer content if audit append fails. Direct table, embedding, PostgREST and unaudited RPC paths are denied.
4. Mutations append safe audit atomically. Audit contains identifiers and allow-listed operation codes only, never answer values, labels, authored text, correction notes, identity PII or request bodies.
5. Assignment snapshots and answer versions are immutable. Original submission/SLA facts never change after correction.

### Locking and idempotency

Use the existing F12 order whenever F12 rows are involved: **client → subscription → obligations/ledger**. P2 lock order is: **client → subscription → selected-form/assignment policy → assignment/SLA obligation → answer revision**, with authorization rechecked after every lock wait. Never acquire a P2 selection lock before a client/subscription lock. Keep audit append in the same transaction as the mutation. Stable operation keys bind canonical intent; independent unique constraints protect initial assignment, original submission and SLA against distinct-key races.

## Migration and Shared-Function Ordering

- F15 migrations must be strictly later than every F12 and F14 migration actually merged at implementation time, including unmerged review-fix/planned migrations. Known F12 timestamps include `20261101120000`, `20261101121000`, `20261101122000`, and planned `20261101123000`/`20261101124000`. Known F14 timestamps include `20261102120000`–`20261102122000`, with further migrations planned. Reinspect both full branches and all timestamps before assigning any F15 timestamp; do not allocate one in this plan.
- F15 cannot use Stack A (F12) or Stack B (F14). Provision and verify a separate isolated stack before any DB-dependent task; ownership is currently unassigned.
- Rebuild the full latest `audit_row_change()` body after F12 and F14 integration, preserving all mappings and scrubbed allow-lists; never copy a stale function body.
- Extend SQL `app_private.role_has_capability` and TypeScript `lib/auth/capabilities.ts` only after F12's Sales `approve_registration` removal and F14's `manage_branding` change are integrated. Add `assign_intake_form` for PO/WO/Trainer, deny Sales, and require bidirectional parity for known and unknown strings.
- Extend `app_private.has_workspace_access` only from its latest integrated definition. PO global authority must additionally join a real existing workspace for workspace-scoped F15 actions.
- Preserve F12 `f12_guard_client_transition`, private approval-event contract, `client_self_status()`/client access contracts and F14 branding contract. Use forward-only migrations; do not replace shared functions from stale branches.

## Cross-Feature Dependencies and Integration Order

| Area | F15 dependency / owner seam | Required order / guard |
| --- | --- | --- |
| Shared tables/FKs | F11 client/Auth binding; F12 clients, subscriptions, approval event; P2-owned workspace-bound templates, assignments, answers, SLA, jobs and alerts | F11 identity and F12 schema/functions must be merged and inspected before DB design is finalized. Consume F13 entitlement projection for actual renewed-subscription service start (including freeze shifts) and frozen/inactive state. No financial payload reads. |
| Shared functions | `audit_row_change`, `role_has_capability`, `has_workspace_access`, F12 client guards/access helpers | F12 then F14 latest bodies first; F15 adds forward extensions only. |
| Capability TS/SQL | `lib/auth/capabilities.ts`, SQL `app_private.role_has_capability`; add `assign_intake_form` | Sequence after F12 Sales removal and F14 branding addition; F12 bidirectional parity test available and passes. |
| i18n | `lib/i18n/messages/ar.ts`, `lib/i18n/messages/en.ts` | Coordinate shared-file ownership; bilingual authored form content is separate from UI strings. |
| Dashboard/nav | `app/(app)/page.tsx`, authorized dashboard routes, `app/(client)/account/status/`, future intake routes | F12 status navigation remains intact; F15 registers only an existing authorized route, no guessed route or staff redirect. |
| Branding | F14-8 published workspace brand contract | F14 merge first; per-request scope, neutral fallback, no shared actor/workspace cache. No editor/storage copied into F15. |
| Alerts/delivery | P4 authoritative first-pair delivery and responsible-Trainer facts; F15 Q4 timing/recipient policy | Synthetic fixtures first; real-data classification/alerts blocked until complete authoritative coverage and Q4 details left unstated are resolved. |
| Retention/CI | F11 owner-only `pg_cron` pattern; docs/13 readiness gates; encrypted backups | Reuse pattern without activation in migration. 30-day legal/technical review and backup/PITR evidence block production real data. Private CI billing remains an external gate; do not change visibility. |

Merge readiness of F12 and F14 is not asserted by this plan; their latest integrated source must be revalidated at implementation time.

## OPEN Items, Exact Blocking Tasks, and Gates

| OPEN item | What it blocks |
| --- | --- |
| Mandatory Intake name and actual questions (PO supplies when task reached) | T009 seeding/publication of the initial Mandatory Intake content and related question-specific fixtures. Build engine and placeholder beforehand; ask PO at T009. |
| 30-day retention technical/legal review (including backup/PITR and exceptions) | T019 evidence gathering and T025 production readiness for real client data and purge acceptance against hosted recoverable copies. Synthetic local/CI work may continue. |
| Authoritative P4 first-pair delivery and responsible-Trainer coverage | T016 synthetic alert engine can proceed; T017 real-data scheduler activation and T025 production readiness stay blocked. |
| Future attachment storage lifecycle | No MVP attachment task is authorized. FR-032 remains no attachment feature/storage until separately specified; future attachment implementation requires a new scoped decision/design and RET-2/3 proof. |
| Q2 removal from already-submitted answer history/audit | Only the affected branch-history removal/projection sub-case in T011/T013/T020; do not erase records pending PO resolution. |
| Q3/Q4 unstated operational details | Only recurrence resumption after freeze, no-Trainer initial alert routing, and whether reassignment restarts the 24-hour clock; escalation behavior for unavailable/revoked owners; T023 otherwise proceeds. |

## Project Structure

```text
specs/015-forms-intake/
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── authorization-and-audit.md
│   ├── forms-api.md
│   └── retention-and-alerts.md
├── quickstart.md
├── tasks.md
└── checklists/analyze.md

lib/forms/                         # domain services, validation, dates, repositories
lib/auth/capabilities.ts           # shared TS capability parity
app/api/forms/                     # authorized server routes
components/forms/                  # authored and client form UI
supabase/migrations/               # forward F15 migrations after F12/F14
tests/unit/                        # no-DB invariants and UI units
tests/contract/                    # route/safe-response contracts
tests/integration/                 # isolated F15 stack only
tests/e2e/                         # rendered user journeys and Design Gate
```

**Structure Decision**: Extend the existing Next.js/Supabase application with bounded `lib/forms`, `app/api/forms`, and `components/forms` modules. Database authority remains in forward SQL/RLS migrations and explicit repositories; no separate service or attachment store is introduced.

## Complexity Tracking

No constitution deviation is proposed. The separate verified F15 stack is a resource prerequisite, not an architecture exception. Any missing DESIGN.md decision stops only its rendered-UI unit and is escalated through the Frontend Design Gate.
