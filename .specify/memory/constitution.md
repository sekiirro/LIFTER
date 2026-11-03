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
  photos, Hevy, AI-generated alternatives, automatic bonuses/deductions/firing, mandatory 2FA, YBS sync.
- Nutrition templates may be global (PO-managed) or workspace-owned (managed by authorized staff).
  The PO may Make it Global only after private data and references are removed. This is the
  PO-approved D18-1 amendment; template copies and audit must preserve workspace isolation.
- Unknown values MUST be marked NEEDS SOURCE CONFIRMATION, never guessed.
- The pilot MAY sequence features but MUST NOT remove Full Launch scope (D-07).

### V. Versioned, Non-Retroactive Content

- Published plans, form templates, package versions and catalog entries MUST be immutable
  versions. Edits create new versions.
- Published plans MUST snapshot the food nutrition values and canonical exercise identities they
  use. Submitted forms MUST remain readable after template changes.
- First workout and nutrition plans may be delivered independently, including on different
  days. A subscription activates exactly once after both first deliveries succeed. Delivery
  operations are secure, idempotent and concurrency-safe; later edits never restart activation.

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

- Every feature follows the mandatory workflow: Constitution → Specify → Clarify → Plan → Tasks → Analyze → Implement. Clarify is mandatory and records "zero open ambiguities" explicitly when none exist. Before implementation, the current Analyze must be dated after the latest spec, plan, or task change and have zero open CRITICAL or HIGH findings. (S29-PO-3 Q1)
- Claude is the architect/orchestrator and independent reviewer. Claude may independently run read-only verification commands, including Git read commands, gh read queries, docker inspect, and SELECT-only database reads. Claude performs no repository writes, migrations, test runs, or stack modifications; agents execute those actions. (S29-PO-3 Q4)
- Adaptive model routing follows task complexity, security risk, model capability, and quota (S22-PO-9 rule 5). The available pool is four Luna Medium slots, one MiniMax at highest effort, and Big Pickle, Beam, and Flint through OpenCode; Kilo Code's two best available free models are the fallback when OpenCode free quotas are exhausted (S22-PO-9 rule 2; S25-PO-4 raised Luna capacity to three, and S25-PO-9 superseded that cap with a fourth slot).
- The D-27 tier sequence GLM 5.3 Flash -> Luna -> Sol Medium remains subject to current allocations. S13 session 14 reserves Sol Medium for exceptionally difficult tasks or when GLM and Luna fail; S13 requires explicit PO approval before Sol use. Sol High and xhigh remain prohibited (D-27). If no permitted tier is available, stop and request PO direction; do not substitute a model (D-27). Keep one performance-log row per delegation with model, effort, task class, outcome, review notes, and cost (D-27).
- S29-PO-1 assigns MiniMax to the remaining Hero Glisse work, superseding S28-PO-5's Big Pickle assignment for that remaining work only. Free models receive no secrets, client data, or sensitive tasks (S13 PO Kilo guardrail); third-party/free models receive no secrets or .env values (S22-PO-9; S29-PO-3 Q3). High-risk work (security, Auth, RLS, SECURITY DEFINER, migrations, admission, Storage policies, and financial logic) requires independent architect review and executed mutation tests; sensitive permissions are never expanded without PO approval (S29-PO-3 Q3).
- Mandatory Spec Debate: the architect drafts the spec and architecture; an independent Sol Medium
  critique follows; by default there is one response round, with more rounds only for significant
  unresolved issues. The architect incorporates critique and presents unresolved product/design
  decisions to the PO. Implementation starts only after PO approval and a completed plan/tasks.
  AI agreement never replaces PO approval; the architect remains the final technical authority.
- Controlled Parallel Development: at most six concurrent delegated agents (the orchestrating architect is not counted). Each writer uses an isolated worktree and branch and edits disjoint files. Only one
  writer may hold a stack lock for Docker or Supabase operations that start, stop, restart, reset,
  provision, migrate, seed, or write shared DB state; other writers stay out of that stack while the
  lock is held. Use one DB user per stack. Feature branches integrate sequentially, each after
  architect review and relevant green CI.
- Main merge gate: before requesting PO approval, require a completed CodeRabbit review APPROVED on
  the exact PR head (`commit_id == headRefOid`), with no later CHANGES_REQUESTED or DISMISSED
  review; `reviewDecision` APPROVED; zero unresolved threads and all actionable findings resolved;
  both GitHub Actions CI runs for the PR head completed successfully and required security checks
  are green: record each run's ID and attempt; every required job concludes `success` and has a step
  count greater than zero (zero steps means NOT EXECUTED); the `push` run has `head_sha == headRefOid`;
  and the `pull_request` run belongs to this PR number, has a head SHA equal to `headRefOid`, and
  tests the merge result with current `main`. Record this evidence in the PR body or feature report.
  If `main` advances, re-evaluate the gate on the new merge result (S30-R10); and
  independent architect review of the diff and evidence. Intermediate sub-branch merges into a
  parent feature branch require Claude review and green relevant CI on the exact head and do not
  bypass this main merge gate (see docs/08 and D-26). Ask the PO for explicit merge approval and
  record the approved head SHA with that approval. Merge only after that approval, immediately
  re-checking these checks remain true, including `commit_id == headRefOid` and
  `po_approved_head == headRefOid`. If the head changes after PO approval, the approval lapses;
  re-satisfy these checks on the new head and obtain new explicit PO approval. Use
  `gh pr merge <n> --merge --match-head-commit <po_approved_head>`. Never use `--admin`,
  `--auto`, or `--delete-branch`. This is process-only because branch protection returns 403.
- Merge gates (from [docs/03-roadmap.md](../../docs/03-roadmap.md)): the `push`-event GitHub Actions
  CI run with `headSha == headRefOid` is the independent, non-author rerun of typecheck, lint, unit
  and applicable integration/e2e gates; the `pull_request`-event run checks the merge result with
  current `main`. Both runs must complete successfully and have executed steps; agent-reported local
  gate results never substitute. Claude (architect) does not run tests or Git writes and verifies
  both runs on that head.
  Also require the isolation gate; the money gate; AR and EN UI check; log-scrub check; and acceptance
  criteria verified against [docs/01-traceability.md](../../docs/01-traceability.md). High-risk changes also require executed mutation evidence (file:line kill, restore, diff exit 0) recorded in the feature's reports/verification file and referenced from `traceability.md` (S30-R10; S29-PO-3 Q3).
- Only passing, reviewed work is committed.

## Governance

- This Constitution overrides conflicting practices, plans and briefs. Where the architecture or
  roadmap conflicts with it, the Constitution wins until amended.
- No AI agent may independently make product decisions, whether discovered during Specify, Clarify, Analyze, implementation, or reviews. Unresolved decisions MUST be presented to the PO as numbered multiple-choice questions with options, implications, and a recommendation. Work requiring that decision waits for explicit PO approval. (S29-PO-2, verbatim)
- Amendments require Product Owner approval, a decision-register entry, and a semantic version
  bump:
  - MAJOR: a principle is removed or redefined.
  - MINOR: a principle or section is added or materially expanded.
  - PATCH: clarification only.
- Every spec, plan and review MUST include a constitution check. Deviations MUST be justified in
  the plan's complexity tracking and approved before implementation.

**Version**: 1.5.0 | **Ratified**: 2026-10-27 | **Last Amended**: 2026-11-03 (mandatory Spec Kit workflow, PO decision rule, architect read-only verification, and high-risk review requirements; S29-PO-3 Q1-Q4)

### Sync impact report and amendment note - 2026-10-29 (D-27)

Adaptive Model Routing and the six-agent concurrency limit were approved by the PO (sessions 10 + 11). Sync impact: `docs/08-agent-workflow.md` mirrors model eligibility, escalation, performance logging, worktree isolation, and concurrency. Tests-first, CI push + pull_request, CodeRabbit approval on the final head, resolved threads, exact-head checks, and explicit PO merge approval are unchanged. No product or feature requirements changed. The PO later expanded the GLM tier (2026-10-29) from documentation-only to implementation, CI workflows, configuration and moderate-risk work under mandatory architect review and passing tests, while reserving genuinely high-risk security, Auth, RLS, migration and financial work for Luna High or Sol Medium.

### Sync impact report and amendment note: 2026-10-31 (PO S20 Message B sections 3 and 4)

The PO amended PRD-05/PRD-12 to allow workspace-owned nutrition templates managed by authorized staff alongside PO-managed global templates. The PO may Make it Global after private data and references are removed. Shared Plan Core now allows same-Plan-ID editing, private draft autosave, Save as Draft, one Ready & Publish action, independent first deliveries on different days, and exactly-once activation after both deliveries succeed. Specs 016 through 019, PRD/BRD, docs/03-roadmap.md, docs/04-changes-and-questions.md, docs/01-traceability.md, docs/10-feature-tracker.md and DESIGN.md record the matching contracts. D18-1 materially expands Principle IV/product scope; version bumped from 1.3.0 to 1.4.0.

### Sync impact report and amendment note - 2026-11-03 (S29-PO-3 Q1-Q4)

Version 1.4.0 to 1.5.0 (MINOR): materially expanded Development Workflow & Quality Gates and Governance. Clarify is mandatory for every feature; a current Analyze with zero open CRITICAL/HIGH findings is required before implementation. Added the verbatim S29-PO-2 Absolute PO Decision Rule and its numbered MCQ escalation process. Clarified Claude's read-only verification authority and prohibited repository writes, migrations, test runs, and stack modifications by Claude. Updated model allocation to current PO records while retaining the D-27 tier sequence, Sol effort prohibition, stop-and-ask rule, and performance log; S22-PO-9 and S25-PO-9 supersede earlier Luna capacity constraints; high-risk work requires independent architect review and executed mutation tests, and sensitive permissions are not expanded without PO approval. Existing principles I-IX, delivery constraints, merge gates, CI/CodeRabbit/security rules, and prior amendment history are preserved.

Dependent document updated in the same PR, separate commit: `docs/08-agent-workflow.md` aligns agent governance with the mandatory Spec Kit workflow, PO-only product decisions, high-risk review/mutation-test requirements, model data restrictions, and Claude read-only boundary (authority: S29-PO-2 and S29-PO-3 Q1-Q4). No `.specify/templates/*`, `.claude/skills/*`, or command files changed.
