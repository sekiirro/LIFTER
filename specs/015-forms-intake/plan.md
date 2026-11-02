# Implementation Plan: F15 — Forms/Intake

**Branch**: `015-forms-intake` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Plan status**: Base plan approved by PO 2026-10-29 (session 13); S14 amendment reflects binding decisions dated 2026-10-30. This documentation update is not a new implementation/merge approval.

**Input**: Feature specification from `specs/015-forms-intake/spec.md`. This is a plan, not implementation authorization; implementation starts only after PO plan approval.

## Summary

Build a tenant-scoped Forms/Intake engine around immutable published form versions and assignment snapshots, conflict-safe drafts, immutable submissions/corrections, distinct client-submission and D-03 Trainer-delivery deadlines, and channel-aware ID-only alerts: in-app always, Telegram for explicitly linked staff, and no email. S17 sets Your First Step as an ordinary editable default onboarding form in Forms. Previously supplied intake questions may be editable starter content; Workspace Owners may edit, replace, or select another onboarding form. Per-form audience and delivery timing follow Q3=D. Health guidance is minimal and contextual only where useful; there is no standalone health notice. Preserve F15 validation and authored requiredness, immutable published versions/snapshots, sex-dependent N12 mapping, read-only-source media derivatives, signup extension without T&C consent, post-Nutrition Terms consent, and Welcome flow. Implement approved audiences/recurrence; recurrence resumes after freeze without catch-up (F1). D1 design/security is approved by D-29: automatic server-validated erasure selects every answer value whose question is currently inapplicable under authoritative answers, across versions and its answer-change/access-view audit rows; legal hold defers and alerts; the process is idempotent, tenant-isolated, fail-closed, emits counts only to its control record, and never logs answer content. No person or service-role caller can directly trigger/delete. RET-3 requires all-copy purge within 30 days. The exact database migration remains blocked pending F12/F14 integration and verified Stack D. Client-late alerts are Trainer at deadline+24h and PO+WO at +48h; no Trainer routes to PO+WO; reassignment transfers without clock reset; deliver to currently authorized owners. Preserve D-03 Trainer-late Q4 rules exactly. No role may correct after relationship end (Q1). No MVP attachment feature/storage. Real data and scheduler remain gated by retention review and authoritative P4 facts.

### S25-PO-8 and S25-R4 alert delivery plan


The PO approved In-App + Telegram, no Email, preservation of escalation rules and duplicate prevention, sensitive-data protection, and a disabled scheduler pending approval. In-app is mandatory for each authorized stage recipient. Telegram is an additional staff-only channel after one-time `/start` deep-link account linking; usernames do not establish identity. Link and webhook state uses hashed short-lived tokens, a verified webhook secret header and persisted chat IDs. Membership loss revokes the link; staff can unlink. Messages remain generic and link to the authorized in-app inbox. No client name, answer text or health data enters Telegram, jobs, audit or logs. Use a fake Telegram transport in tests; no test network calls. Server config key names are `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`; values are managed outside the repository. Email is out of scope. Delivery idempotency is per occurrence/stage/recipient/channel. No migration activates the scheduler; separate PO approval is required.

## Technical Context

**Language/Version**: TypeScript (repository Node engine 24), SQL/PostgreSQL migrations
**Primary Dependencies**: Next.js App Router, React, Supabase Auth/SSR/PostgreSQL/RLS, existing `lib/auth`, `lib/i18n`, DESIGN.md components
**Storage**: PostgreSQL only for MVP Forms data; no Forms attachment storage. Hosted encryption and 30-day all-copy purge behavior require pre-production evidence.
**Testing**: Vitest unit/contract; isolated Supabase integration tests; Playwright/axe and rendered screenshots for UI. Tests are written first and observed RED before implementation.
**Target Platform**: LIFTER web application and PostgreSQL-backed Supabase deployment
**Project Type**: Next.js web application with SQL/RLS backend
**Performance Goals**: No numeric product latency promises. Approved bounds: 20 questions per section, 60 per form, 400 conditions, 16 per-question conditions, 4,000 evaluation steps, 131,072 definition bytes, 4,096 UTF-8 bytes per textual answer, 50 choices, and 262,144 answer-value JSON UTF-8 bytes per draft/submission. Short/long text maxima are 150/1,000 Unicode code points; a per-question `charLimit` may lower but never exceed its type maximum. Payload bytes sum serialized answer values only, excluding keys, envelope fields and transport framing. The worst-case valid form of 60 long answers × 1,000 four-byte code points measures 240,120 serialized bytes including the JSON string quotes and fits. New answer types and N7/N8 derived options remain subject to the same bounds; profile-bound and computed values are not client-editable answers. Measure and review autosave debounce/max-unsaved behavior before UI/publication ships.
**Constraints**: Sensitive health data; forced tenant RLS; two authorization walls; audited fail-closed reads; append-only versioning except the D-29 erasure exception; no browser persistence, cache, Realtime or service-role answer path; fixed Cairo D-03 calendar; no real-data alerting without complete P4 facts. D1 erasure is automatic and server-validated only; no human trigger or direct PO/WO/Trainer/Client/service-role delete. It deletes inapplicable answer values across versions and their answer-change/access-view audit rows only, never financial/authentication/authorization/security/unrelated audit; it is legal-hold defer+alert, idempotent, tenant-isolated and fail-closed. The control record stores counts only with no IDs; answer content is never logged; RET-3 purges all recoverable copies within 30 days.
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

The detailed ownership and DB classification is in [tasks.md](tasks.md). Body-fat source originals are read-only at `C:/Users/NEW LAP/Desktop/YBS SYSTEM/public/body-fat/`; reproducible derivatives go under `public/images/body-fat/` (WebP/AVIF, max 2x display width, target <=150 KB). Original binaries are never committed. DB-dependent F15 units require the PO-approved **Stack D**, verified isolated from Stacks A/B/C and against latest merged F12/F14. Pure helpers, policy logic, media and component tests use no DB. No F15 integration run, migration, Docker or Supabase operation is part of this specification amendment.

### Default onboarding template and signup plan

- Your First Step is the ordinary editable default onboarding form in Forms. Previously supplied S14 questions may be initial editable starter content, not an invariant inventory; do not require all 26 parents or substantive section completeness. Workspace Owners may edit, replace, or select another onboarding form.
- Replace T009's old “wait for PO-supplied inventory” gate: content and rules are now specified. T009 remains dependent on the approved Builder/version pipeline and immutable assignment snapshots. Configure N7 maximum five meals and meal-timing choices as dependent data, N8 budget food lists as editable versioned options, N11 slider with 150-250ms motion and reduced-motion bypass, and N12 image cards last. The P4 N7 maximum-five rule is an explicit PO-approved deviation; canonical Arabic source remains unchanged.
- Forms use the normal Builder. Authors may add/remove/reorder sections and questions, revise bilingual copy/options/types/conditions/assets, and publish Draft → Preview → Publish. Published versions and assignment snapshots remain immutable; edits create a new version. Each form controls audience, trigger, delivery timing, recurrence and stop conditions under Q3=D.
- Signup is an F11 surface extension delivered by F15: preserve transactional Auth/link consumption, pending approval, no-session signup, and all existing F11 protections. Add DOB, three-part name, workspace-scoped unique normalized username, optional Telegram and sex as personal data. Signup creates the pending account without T&C consent; the unchecked required T&C consent with policy version/server timestamp is captured only at the post-Nutrition Terms Card; marketing remains separate and optional. The detailed cross-feature contract is `contracts/signup-extension.md`.
- Terms consent remains at the post-Nutrition Terms Card with an unchecked required box and no signup-time consent; marketing consent is separate and optional. There is no standalone health notice or acknowledgment. Use minimal contextual health guidance only where genuinely useful. Do not change Terms Card consent rules. Sex question labels and Terms AR/EN wording remain DRAFT pending their separate approvals.
- New F15 migration timestamps must be `20261104000000` or later, and strictly later than the complete F12/F14 migration sets actually merged at implementation time. This lower bound does not remove the requirement to re-inspect merged history. DB work uses Stack D only, after Stack D isolation and F12/F14 integration are verified; all other new S14 units are DB-free.

### Data/security boundaries

1. App/server routes derive actor and client identity from signed Auth context; client requests never supply client/workspace targets.
2. SQL/RLS independently checks tenant, client association, role capability and current membership. PO scope binds an explicitly existing `public.workspaces` row.
3. Every sensitive-answer/current-answer/history read uses one audited reader. Append IDs-only access evidence first; return no answer content if audit append fails. Direct table, embedding, PostgREST and unaudited RPC paths are denied.
4. Mutations append safe audit atomically. Audit contains identifiers and allow-listed operation codes only, never answer values, labels, authored text, correction notes, identity PII or request bodies.
5. Assignment snapshots and answer versions are immutable. Original submission/SLA facts never change after correction.

### Locking and idempotency

Use the existing F12 order whenever F12 rows are involved: **client → subscription → obligations/ledger**. P2 lock order is: **client → subscription → selected-form/assignment policy → assignment/SLA obligation → answer revision**, with authorization rechecked after every lock wait. Never acquire a P2 selection lock before a client/subscription lock. Keep audit append in the same transaction as the mutation. Stable operation keys bind canonical intent; independent unique constraints protect initial assignment, original submission and SLA against distinct-key races.

## Migration and Shared-Function Ordering

- F15 migrations must be `20261104000000` or later and strictly later than every F12 and F14 migration actually merged at implementation time, including later review fixes. Reinspect both full integrated histories before allocating any exact timestamp; this plan creates none.
- F15 DB work uses the PO-approved Stack D exception only, after verifying isolation from Stacks A/B/C and the latest F12/F14 shared contracts. Never use Stack A, Stack B or Stack C for this lane.
- Rebuild the full latest `audit_row_change()` body after F12 and F14 integration, preserving all mappings and scrubbed allow-lists; never copy a stale function body.
- Extend SQL `app_private.role_has_capability` and TypeScript `lib/auth/capabilities.ts` only after F12's Sales `approve_registration` removal and F14's `manage_branding` change are integrated. Add `assign_intake_form` for PO/WO/Trainer, deny Sales, and require bidirectional parity for known and unknown strings.
- Capability additions approved by architect; keep their shared SQL/TypeScript mappings pending final F14/F13 reconciliation:

  | Capability | Staff roles | Source and scope |
  | --- | --- | --- |
  | `assign_intake_form` | PO, WO, Trainer | F15-3; `spec.md` FR-022 and SC-017. Sales and unknown capabilities deny. |
  | `author_forms` | PO, WO, Trainer | F15-1; `spec.md` FR-004/030, SC-017, and the approved workspace builder operation matrix. Trainers may publish and retire workspace forms. Workspace membership is a separate check; global template governance is PO-only. |
  | `read_form_answers` | PO, WO, Trainer | `correction-matrix.md`, “Approved operations × roles × field classes”: current ordinary/sensitive answers and version history allow these staff roles in authorized workspace scope; Sales denies. PO scope requires an explicitly existing workspace. Clients read only their own assigned form through the client authorization path and are not granted this staff capability. PO final correction approval (2026-10-29) and Q1 relationship-end denial also apply. |

  These capability names and role sets are approved, but do not edit `role_has_capability` or `lib/auth/capabilities.ts` until F14 and F13 have merged and the full matrices can be reconciled.
- Extend `app_private.has_workspace_access` only from its latest integrated definition. PO global authority must additionally join a real existing workspace for workspace-scoped F15 actions.
- Preserve F12 `f12_guard_client_transition`, private approval-event contract, `client_self_status()`/client access contracts and F14 branding contract. Use forward-only migrations; do not replace shared functions from stale branches.

## Cross-Feature Dependencies and Integration Order

| Area | F15 dependency / owner seam | Required order / guard |
| --- | --- | --- |
| Shared tables/FKs | F11 client/Auth binding; F12 clients, subscriptions, approval event; P2-owned workspace-bound templates, assignments, answers, SLA, jobs and alerts | F11 identity and F12 schema/functions must be merged and inspected before DB design is finalized. Consume F13 entitlement projection for actual renewed-subscription service start (including freeze shifts) and frozen/inactive state. No financial payload reads. |
| Shared functions | `audit_row_change`, `role_has_capability`, `has_workspace_access`, F12 client guards/access helpers | F12 then F14 latest bodies first; F15 adds forward extensions only. |
| Capability TS/SQL | `lib/auth/capabilities.ts`, SQL `app_private.role_has_capability`; reconcile `author_forms`, `assign_intake_form`, and `read_form_answers` | Final shared mapping follows F12/F14/F13 merges; retain Sales/unknown denial and full SQL/TypeScript matrix parity. |
| i18n | `lib/i18n/messages/ar.ts`, `lib/i18n/messages/en.ts` | One i18n copy owner owns both shared message files; bilingual authored form content and the canonical Arabic fixture remain separate from UI chrome strings. |
| Dashboard/nav | `app/(app)/page.tsx`, authorized dashboard routes, `app/(client)/account/status/`, future intake routes | F12 status navigation remains intact; F15 registers only an existing authorized route, no guessed route or staff redirect. |
| Branding | F14-8 published workspace brand contract | F14 merge first; per-request scope, neutral fallback, no shared actor/workspace cache. No editor/storage copied into F15. |
| Alerts/delivery | P4 authoritative first-pair delivery and responsible-Trainer facts; D4 client-late and existing Q4 D-03 policies; S25-PO-8 in-app/Telegram channels | Synthetic fixtures first; in-app always; Telegram only for explicitly linked staff. Reauthorize at delivery/read; real-data classification remains gated on complete authoritative coverage. No email. Scheduler stays disabled pending PO activation approval.
| Retention/CI | F11 owner-only `pg_cron` pattern; docs/13 readiness gates; encrypted backups | Reuse pattern without activation in migration. 30-day legal/technical review and backup/PITR evidence block production real data. Private CI billing remains an external gate; do not change visibility. |

Merge readiness of F12 and F14 is not asserted by this plan; their latest integrated source must be revalidated at implementation time.

## OPEN Items, Exact Blocking Tasks, and Gates

| OPEN item | What it blocks |
| --- | --- |
| Draft copy approval | Terms publication and its rendered UI: PO approval of sex labels and Terms AR/EN wording. The standalone health notice is superseded; minimal contextual health guidance may use the PO-given label where useful. |
| 30-day retention technical/legal review (including backup/PITR and exceptions) | T019 evidence gathering and T025 production readiness for real client data and purge acceptance against hosted recoverable copies. Synthetic local/CI work may continue. |
| Authoritative P4 first-pair delivery and responsible-Trainer coverage | T016 synthetic alert engine can proceed; T017 real-data scheduler activation and T025 production readiness stay blocked. |
| Future attachment storage lifecycle | No MVP attachment task is authorized. FR-032 remains no attachment feature/storage until separately specified; future attachment implementation requires a new scoped decision/design and RET-2/3 proof. |
| D1 exact deletion migration | DB-dependent implementation task T029 is blocked pending F12/F14 merge and verified Stack D. The pure DB-free selector task T026 is unblocked under D-29; no SQL or database operation is part of this lane. |

## Project Structure

```text
specs/015-forms-intake/
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── authorization-and-audit.md
│   ├── forms-api.md
│   ├── retention-and-alerts.md
│   └── signup-extension.md
├── fixtures/mandatory-intake-copy-ar.md
├── assets/body-fat/PROVENANCE.md
└── reports/S14-terms-draft.md
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

D-29 approves a material Constitution VII expansion; the MINOR version bump to 1.4.0 follows the Constitution's semantic-version rule. D1's accepted loss of who-viewed evidence for the erased answer is recorded as a security consequence. The exact migration still requires F12/F14 merge and verified Stack D. Any missing DESIGN.md decision stops only its rendered-UI unit and is escalated through the Frontend Design Gate.
