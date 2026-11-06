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
- Claude is the architect/orchestrator and independent reviewer. Claude may independently run read-only verification commands, including Git read commands, gh read queries, docker inspect, and SELECT-only database reads against synthetic/test data only. Claude performs no repository writes, migrations, test runs, or stack modifications; agents execute those actions. (S29-PO-3 Q4; S31-PO-7 Q6; S31-PO-8)
- Adaptive model routing follows task complexity, security risk, model capability, and quota (S22-PO-9 rule 5). The available pool is four Luna Medium slots, one MiniMax at highest effort, and Big Pickle, Beam, and Flint through OpenCode; Kilo Code's two best available free models are the fallback when OpenCode free quotas are exhausted (S22-PO-9 rule 2; S25-PO-4 raised Luna capacity to three, and S25-PO-9 superseded that cap with a fourth slot).
- The D-27 tier sequence GLM 5.3 Flash -> Luna -> Sol Medium governs ordinary task routing. S13 session 14 reserves Sol Medium for exceptionally difficult tasks or when GLM and Luna fail, and requires explicit PO approval before every Sol invocation. For the mandatory independent feature-critic role, the PO ruled (S30-PO-8 Q15, verbatim):
  > Q15: Keep Sol Medium as the mandatory independent feature critic. Preserve the existing S13 rule requiring my explicit approval for each Sol invocation. Do not substitute Luna or other models, and do not skip critiques.
  Q15 establishes this specific feature-critic use while preserving S13's per-invocation approval. Obtain approval before invoking Sol. Sol High and xhigh remain prohibited (D-27). If approval is absent, do not substitute another model or skip the critique; hold feature acceptance until the approved critique is complete. If no permitted tier is available for ordinary routing, stop and request PO direction; do not substitute a model (D-27). Keep one performance-log row per delegation with model, effort, task class, outcome, review notes, and cost (D-27).
- S29-PO-1 assigns MiniMax to the remaining Hero Glisse work, superseding S28-PO-5's Big Pickle assignment for that remaining work only. Free models receive no secrets or sensitive tasks (S13 PO Kilo guardrail); third-party/free models receive no secrets or `.env` values (S22-PO-9; S29-PO-3 Q3). All development AI agents must use synthetic/test data only; no real client data may be shared during development or testing (S31-PO-7 Q6, clarified by S31-PO-8). Security-sensitive code work stays with approved paid models (Luna High or Sol Medium; Sol still requires per-invocation PO approval per S30-PO-8 Q15) (S31-PO-7 Q6). The production-AI distinction and safeguards are recorded verbatim below; this does not authorize implementation or production data access (S31-PO-8). High-risk work (security, Auth, RLS, SECURITY DEFINER, migrations, admission, Storage policies, and financial logic) requires independent architect review and executed mutation tests; sensitive permissions are never expanded without PO approval (S29-PO-3 Q3).
  > S31-Q6 — PO clarification:
  >
  > Development AI agents (Luna, Sol, Claude, MiniMax, etc.) must use synthetic data only. No real client data may be shared during development or testing.
  >
  > This restriction does NOT prohibit the future production Ask LIFTER AI or Telegram Bot from processing real client data.
  >
  > Production AI may access only the minimum authorized data needed for each request, through authenticated, workspace-scoped backend services.
  >
  > Require verified identity, strict authorization, data minimization, appropriate privacy safeguards, and an explicitly approved production AI provider.
  >
  > Keep production AI data access disabled until its separate security and privacy design is reviewed and approved.
  >
  > Record this distinction in the constitution. No implementation changes yet.
- Mandatory Spec Debate: the architect drafts the spec and architecture; the independent Sol Medium critique is mandatory for every feature under S30-PO-8 Q15. Each invocation requires explicit PO approval under S13 session 14 before Sol is invoked; do not substitute another model or skip the critique. If approval is absent, hold feature acceptance until the approved critique is complete. By default there is one response round, with more rounds only for significant unresolved issues. The architect incorporates critique and presents unresolved product/design decisions to the PO. Implementation starts only after PO approval and a completed plan/tasks. AI agreement never replaces PO approval; the architect remains the final technical authority.
- Controlled Parallel Development: at most six concurrent delegated agents (the orchestrating architect is not counted). Each writer uses an isolated worktree and branch and edits disjoint files. Only one
  writer may hold a stack lock for Docker or Supabase operations that start, stop, restart, reset,
  provision, migrate, seed, or write shared DB state; other writers stay out of that stack while the
  lock is held. Use one DB user per stack. Feature branches integrate sequentially, each after
  architect review and relevant green CI.
- Main merge gate: before requesting PO approval, require a completed CodeRabbit review APPROVED on
  the exact PR head (`commit_id == headRefOid`), with no later CHANGES_REQUESTED or DISMISSED
  review; `reviewDecision` APPROVED; zero unresolved threads and all actionable findings resolved;
  three executed GitHub Actions CI runs for the PR head completed successfully and required security checks
  are green: record each run's ID and attempt; every required job concludes `success` and has a step
  count greater than zero (zero steps means NOT EXECUTED). For the `pull_request` run, require this PR number, run `head_sha == headRefOid`, and `github.event.pull_request.head.sha == headRefOid`. Obtain `github.event.pull_request.head.sha` from the GitHub Actions run event payload or observable run logs, and obtain `GITHUB_SHA` from run metadata/logs or a workflow step that prints it; record the run URL and source for each value. Record `head_sha` as the PR-head SHA and `GITHUB_SHA` separately as the merge-result SHA; never use `head_sha` as the merge-result SHA, and verify the merge-result commit has the PR head and current `main` commit as parents. The required CI jobs are `validate`, `integration`, and `storage` from the main CI workflow; also require CodeRabbit review and the `check:secrets` security scan in `validate`. Update the list in the same PR as any workflow job rename or removal (S31-R6). For a main-branch push,
  `head_sha` must equal the exact merge commit; this is a post-merge verification outside pre-approval items 1-6. Record both PR-head and merge-result SHAs in the PR
  body or feature report (S30-R10). If `main` advances, re-evaluate on the new merge result; and
  independent architect review of the diff and evidence. CI evidence counts only when `.github/workflows` at the exact PR head equals the base branch, or every workflow change is listed in the PR body and reviewed by CodeRabbit and the architect before evidence is accepted. Owner-only branch protection remains the PO admin step (S31-R4). Intermediate sub-branch merges into a
  parent feature branch require Claude review and green relevant CI on the exact head and do not
  bypass this main merge gate (see docs/08 and D-26). Ask the PO for explicit merge approval and
  record the approved head SHA with that approval. Merge only after that approval, immediately
  re-checking these checks remain true, including `commit_id == headRefOid` and
  `po_approved_head == headRefOid`. If the head changes after PO approval, the approval lapses;
  re-satisfy these checks on the new head and obtain new explicit PO approval. Use
  `gh pr merge <n> --merge --match-head-commit <po_approved_head>`. Never use `--admin`,
  `--auto`, or `--delete-branch`. This is process-only because branch protection returns 403.
- Supplementary merge gates (from [docs/03-roadmap.md](../../docs/03-roadmap.md)): apply the preceding
  Main merge gate in full, including exact PR/head binding, run ID and attempt recording, per-job
  `success` and positive step-count checks, current-main merge-result validation, and the CI rerun
  required when `main` advances. Agent-reported local gate results never substitute. Claude
  (architect) does not run tests or Git writes and verifies all three runs on that head.
  Also require the isolation gate; the money gate; AR and EN UI check; log-scrub check; and acceptance
  criteria verified against [docs/01-traceability.md](../../docs/01-traceability.md). High-risk changes also require executed mutation evidence (file:line kill, restore, diff exit 0) recorded in the feature's reports/verification file and referenced from `traceability.md` (S30-R10; S29-PO-3 Q3). Record the tested commit SHA and Node, Vitest/Playwright, and PostgreSQL image versions. Evidence carries to a later head only with diff proof that the mutated source, its tests, and defining migrations are unchanged; otherwise rerun the mutation evidence (S31-R5).
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

**Version**: 1.6.0 | **Ratified**: 2026-10-27 | **Last Amended**: 2026-11-04 (development-agent synthetic-data rule and production-AI distinction; S31-PO-7 Q6/S31-PO-8; CI provenance, mutation-evidence binding, and required-check list; S31-R4/R5/R6)

### Sync impact report and amendment note - 2026-10-29 (D-27)

Adaptive Model Routing and the six-agent concurrency limit were approved by the PO (sessions 10 + 11). Sync impact: `docs/08-agent-workflow.md` mirrors model eligibility, escalation, performance logging, worktree isolation, and concurrency. Tests-first, CI push + pull_request, CodeRabbit approval on the final head, resolved threads, exact-head checks, and explicit PO merge approval are unchanged. No product or feature requirements changed. The PO later expanded the GLM tier (2026-10-29) from documentation-only to implementation, CI workflows, configuration and moderate-risk work under mandatory architect review and passing tests, while reserving genuinely high-risk security, Auth, RLS, migration and financial work for Luna High or Sol Medium.

### Sync impact report and amendment note: 2026-10-31 (PO S20 Message B sections 3 and 4)

The PO amended PRD-05/PRD-12 to allow workspace-owned nutrition templates managed by authorized staff alongside PO-managed global templates. The PO may Make it Global after private data and references are removed. Shared Plan Core now allows same-Plan-ID editing, private draft autosave, Save as Draft, one Ready & Publish action, independent first deliveries on different days, and exactly-once activation after both deliveries succeed. Specs 016 through 019, PRD/BRD, docs/03-roadmap.md, docs/04-changes-and-questions.md, docs/01-traceability.md, docs/10-feature-tracker.md and DESIGN.md record the matching contracts. D18-1 materially expands Principle IV/product scope; version bumped from 1.3.0 to 1.4.0.

### Sync impact report and amendment note - 2026-11-03 (S29-PO-3 Q1-Q4)

Version 1.4.0 to 1.5.0 (MINOR): materially expanded Development Workflow & Quality Gates and Governance. Clarify is mandatory for every feature; a current Analyze with zero open CRITICAL/HIGH findings is required before implementation. Added the verbatim S29-PO-2 Absolute PO Decision Rule and its numbered MCQ escalation process. Clarified Claude's read-only verification authority and prohibited repository writes, migrations, test runs, and stack modifications by Claude. Updated model allocation to current PO records while retaining the D-27 tier sequence, Sol effort prohibition, stop-and-ask rule, and performance log; S22-PO-9 and S25-PO-9 supersede earlier Luna capacity constraints; high-risk work requires independent architect review and executed mutation tests, and sensitive permissions are not expanded without PO approval. Existing principles I-IX, delivery constraints, merge gates, CI/CodeRabbit/security rules, and prior amendment history are preserved.

Dependent document updated in the same PR, separate commit: `docs/08-agent-workflow.md` aligns agent governance with the mandatory Spec Kit workflow, PO-only product decisions, high-risk review/mutation-test requirements, model data restrictions, and Claude read-only boundary (authority: S29-PO-2 and S29-PO-3 Q1-Q4). No `.specify/templates/*`, `.claude/skills/*`, or command files changed.

### Sync impact report and amendment note - 2026-11-04 (S31-PO-7 Q6/S31-PO-8; S31-R4/R5/R6)

Version 1.5.0 to 1.6.0 (MINOR): record the PO's verbatim distinction between development agents (synthetic/test data only, no real client data) and future production Ask LIFTER AI/Telegram Bot access, which remains disabled until a separate security/privacy design is approved and must use minimum authorized data through authenticated, workspace-scoped services. No implementation changes are authorized. Add CI workflow provenance conditions (S31-R4), tested-SHA and tool-version mutation evidence with carry-forward diff proof or rerun (S31-R5), and the authoritative `validate`, `integration`, `storage`, CodeRabbit, and `check:secrets` list (S31-R6). Clarify that the exact main-branch merge-commit check is post-merge, outside pre-approval items 1-6. `docs/08-agent-workflow.md` and `docs/03-roadmap.md` are updated in this PR. No application code, tests, migrations, or CI workflow files changed.

### Sync impact report and amendment note - 2026-11-04 (ARCHITECT RULING S32-R2; S32-PO-2 docs-only fix)

PATCH (no version bump — clarification only): remove Claude from the security-sensitive implementer list and name the tier `Luna High or Sol Medium` (Sol requires per-invocation PO approval per S30-PO-8 Q15) in the sentence at `.specify/memory/constitution.md` line 144 and the mirror sentence in `docs/08-agent-workflow.md` (~line 34). No other sentence changed. Add the authoritative merge-gate reference (`validate`/`integration`/`storage` with executed steps > 0, plus `check:secrets` and CodeRabbit) to the checklist line in `docs/03-roadmap.md` (~line 41), preserving test-ownership wording. No version bump; file rules reserve MAJOR for principle removal/redefinition and MINOR for material expansion. `docs/08-agent-workflow.md` and `docs/03-roadmap.md` updated in the same PR.

### Sync impact report and amendment note - 2026-11-06 (S35-PO-1; option A for PR #48 thread S34-48-CR-2)

PATCH (no version bump — clarification only): per PO decision `#48=A (3 executed PR greens)` (S35-PO-1), align the main merge gate with the CI triggers as written in `.github/workflows/ci.yml`: count the main-side gate on three executed `pull_request` runs on the exact PR head (plus same-head rerun evidence), and remove the nonexistent feature-branch `push` run requirement (`head_sha == headRefOid`) and the inconsistent "both" wording. CI triggers are not changed. Mirrored in `docs/08-agent-workflow.md` (items 1-6 header de-duplicated; "Both ... runs" -> "Three executed ... runs"; PR-branch push check removed; "verifies both runs" -> "verifies all three runs"). `docs/03-roadmap.md` unchanged. No application code, tests, migrations, or CI workflow files changed. (S34-48-CR-2, S35-PO-1)
