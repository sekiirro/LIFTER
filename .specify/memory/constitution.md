# LIFTER Constitution

This Constitution holds LIFTER's non-negotiable principles. It does not replace the technical plan
([docs/02-architecture.md](../../docs/02-architecture.md)), the roadmap
([docs/03-roadmap.md](../../docs/03-roadmap.md)) or the decision register
([docs/04-changes-and-questions.md](../../docs/04-changes-and-questions.md)). Business rules come
from `LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md` (DR-01) and the register (D-03..D-17).

## Core Principles

### I. Strict Workspace Isolation (NON-NEGOTIABLE)

- Every tenant-owned record MUST carry `workspace_id`, and its relations MUST use composite
  `(workspace_id, id)` keys.
- Access MUST be authorized server-side by actual membership: deny by default, at two walls (an
  app-layer policy check and database RLS keyed to the signed identity). The UI is never a
  security boundary.
- Every surface MUST be isolated: APIs, exports, Telegram bot, jobs, storage, notifications, logs.
  No data, existence or membership of one workspace may be revealed in another. Duplicate
  email/phone responses MUST be the generic support message only (D-08).
- Every new tenant table, endpoint, job or bot command MUST ship with a foreign-workspace
  negative test.

Rationale: BRD invariant 1; a single leak breaks the product's core promise.

### II. Immutable Financial Truth (NON-NEGOTIABLE)

- Ledger, payroll and subscription snapshots are append-only. Corrections MUST be new reversing
  or adjusting events; UPDATE/DELETE of financial history MUST be impossible for the application.
- Price, duration, commission rate and installment schedule MUST be snapshotted at purchase.
  Later settings changes apply prospectively only.
- Commission MUST be earned only on each confirmed collected payment at the snapshot rate,
  attributed to its collection month (Africa/Cairo). Unpaid balances earn nothing (D-13).
- Refunds MUST be full only: 100% of the amount actually collected. A refund MUST reverse all
  related revenue and commission, cancel unpaid installments, and is Platform Owner only (D-10,
  D-15).
- Installment totals MUST equal the Platform Owner's approved price (D-17).
- Amounts MUST be integer minor units with currency. Money-changing operations MUST be
  idempotent. LIFTER records owed commission, never inter-party settlement.

Rationale: BRD invariants 3–4; historical truth must survive any later change.

### III. Platform Owner Governance & Least Privilege

- Only the Platform Owner creates workspaces, manages staff access, sets prices and durations,
  issues refunds, deletes clients, exports full client datasets and decides compensation or
  discipline.
- Capabilities MUST follow the approved permission matrix (D-09/D-10, architecture §
  Multi-tenancy). Any capability not explicitly granted is denied, including unlisted Sales
  rights.
- A staff member's role MUST be the same across all of their authorized workspaces. Staff and
  client accounts are separate identities with separate emails (D-16). Client email and phone
  are globally unique, with no merging or transfer (D-08).

### IV. Approved Scope Only (NON-NEGOTIABLE)

- Features MUST trace to the BRD/PRD or an approved D-xx decision. No business rule may be
  invented, and no behavior may be imported from YBS.
- PRD-12 exclusions MUST NOT be built. Examples: public marketing pages, payment gateway,
  in-app chat/helpdesk/broadcasts, bulk client actions, web workout/meal logging, web progress
  photos, Hevy, AI alternatives, automatic bonuses/deductions/firing, mandatory 2FA, YBS sync.
- Unknown values MUST be marked NEEDS SOURCE CONFIRMATION, never guessed.
- The pilot MAY sequence features but MUST NOT remove Full Launch scope (D-07).

### V. Versioned, Non-Retroactive Content

- Published plans, form templates, package versions and catalog entries MUST be immutable
  versions. Edits create new versions.
- Published plans MUST snapshot the food nutrition values and canonical exercise identities they
  use. Submitted forms MUST remain readable after template changes.
- A first subscription activates only on the atomic delivery of both initial plans, with
  `activated_at` = the delivery timestamp and exactly one productivity unit per subscription.

### VI. Human-Governed People Decisions

- KPIs are decision support only. Incentives, deductions, strikes and termination MUST be
  explicit, audited Platform Owner decisions. Nothing is automatic.
- Payroll approval means paid. It is a single, immutable step.
- Historical attribution and payroll MUST be preserved through access revocation and
  reassignment.

### VII. Privacy & Health-Data Protection

- Client health, fitness and personal data MUST be least-privilege, never written to logs, and
  every access to sensitive actions and exports MUST be audited.
- Audit history MUST be append-only and tamper-resistant. The client timeline is a curated
  projection, not the audit log.
- Account closure MUST deactivate access and pseudonymize PII while keeping the legally required
  ledger and audit records.
- Reset, registration and Telegram link tokens MUST be hashed, expiring and single-use.
- Production with real client data MUST NOT start until the jurisdiction/retention values (B4)
  are confirmed.

### VIII. Bilingual, Accessible, Design-System UI

- All UI MUST be built on the P0 Design System ([DESIGN.md](../../DESIGN.md)): neutral dark and light
  modes, LIFTER emerald `#059669` as the default brand with workspace-customizable brand colors
  that MUST pass WCAG 2.2 AA contrast (D-18), Arabic-first RTL plus English LTR, with
  loading/empty/error states.
- The Design System — [DESIGN.md](../../DESIGN.md), `specs/002-design-system/`, and implemented
  tokens/components — is the single source of truth. Installed design skills are advisory only.
- Every UI feature MUST pass the [Frontend Design Gate](../../docs/09-frontend-design-gate.md):
  real rendered screenshots for AR-RTL/EN-LTR × light/dark × mobile/desktop, all required states,
  and accessibility verification.
- Any UI decision missing from the Design System MUST be escalated to the Product Owner (PO) with
  A/B/C options and the architect's recommendation. It MUST NOT be invented or silently change the
  Design System. Approved decisions MUST be recorded and reused.
- UI MUST be responsive and accessible (keyboard access, labeled inputs, clear errors).
- Trainer-authored content MUST be displayed as authored, never machine-translated.

### IX. Reliable, Idempotent Operations

- Scheduled and asynchronous work MUST be idempotent with deterministic dedup keys: reminders,
  expiry/installment notices, check-ins, SLA timers, Telegram delivery.
- Registration-token consumption, approval, delivery and payment events MUST be
  transaction-safe under concurrency.
- Time rules MUST be pure, tested functions in Africa/Cairo: 5 working days with Friday
  excluded and an 18:00 cutoff; 30-day months; freeze stop/remove semantics; early renewal
  stacking (D-03..D-05, D-11).

## Platform & Delivery Constraints

- The approved stack and hosting are fixed by [docs/02-architecture.md](../../docs/02-architecture.md):
  Next.js on Cloudflare plus Supabase, $0 recurring initially (D-06). Moving to a paid tier is a
  Platform Owner decision.
- Encrypted backups of the database and storage MUST run with a periodic restore test (D-14). A
  failed or missing restore test blocks production migrations.
- Migrations MUST be forward-only, expand/contract. Destructive migrations, pushes, production
  deploys and any production change require explicit Product Owner approval.
- LIFTER is independent of YBS. YBS production systems MUST NOT be touched.

## Development Workflow & Quality Gates

- Every feature follows Spec Kit: Specify → Clarify (only if blocking) → Plan → Tasks → Analyze,
  before any code.
- Claude is the architect/orchestrator/reviewer; Codex implements bounded tasks. There are no
  fallback agents or automatic model substitutions. On quota or capacity limits, work stops and the
  PO is asked. Operational model routing is in [docs/08-agent-workflow.md](../../docs/08-agent-workflow.md).
- Mandatory Spec Debate: the architect drafts the spec and architecture; an independent Sol Medium
  critique follows; by default there is one response round, with more rounds only for significant
  unresolved issues. The architect incorporates critique and presents unresolved product/design
  decisions to the PO. Implementation starts only after PO approval and a completed plan/tasks.
  AI agreement never replaces PO approval; the architect remains the final technical authority.
- Controlled Parallel Development: at most three concurrent agents. Each code-changing agent uses
  its own worktree and branch, edits disjoint files, and respects the single local-DB lock. Feature
  branches integrate sequentially, each after architect review and relevant green CI.
- Main merge gate: before requesting PO approval, require a completed CodeRabbit review APPROVED
  with no later CHANGES_REQUESTED or DISMISSED review; `reviewDecision` APPROVED; zero unresolved
  threads and all actionable findings resolved; green CI/security checks on the exact PR head; and
  independent architect review of the diff and evidence. Intermediate sub-branch merges into a
  parent feature branch require Claude review and green relevant CI on the exact head and do not
  bypass this main merge gate (see docs/08 and D-26). Then ask the PO for explicit merge approval.
  Merge only after that approval, once these checks remain true, using
  `gh pr merge <n> --merge --match-head-commit <sha>` on the approved head. Never use `--admin`,
  `--auto`, or `--delete-branch`. This is process-only because branch protection returns 403.
- Merge gates (from [docs/03-roadmap.md](../../docs/03-roadmap.md)): typecheck, lint, unit and
  integration tests independently re-run by the reviewer; the isolation gate; the money gate; AR
  and EN UI check; log-scrub check; acceptance criteria verified against
  [docs/01-traceability.md](../../docs/01-traceability.md).
- Only passing, reviewed work is committed.

## Governance

- This Constitution overrides conflicting practices, plans and briefs. Where the architecture or
  roadmap conflicts with it, the Constitution wins until amended.
- Amendments require Product Owner approval, a decision-register entry, and a semantic version
  bump:
  - MAJOR: a principle is removed or redefined.
  - MINOR: a principle or section is added or materially expanded.
  - PATCH: clarification only.
- Every spec, plan and review MUST include a constitution check. Deviations MUST be justified in
  the plan's complexity tracking and approved before implementation.

**Version**: 1.2.1 | **Ratified**: 2026-10-27 | **Last Amended**: 2026-10-28 (workflow governance and Frontend Design Gate, D-22; intermediate sub-branch merge clarification, D-26)
