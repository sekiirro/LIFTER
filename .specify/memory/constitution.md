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
- Access MUST deny by default and be authorized server-side at two walls (an app-layer policy
  check and database RLS/authorization functions keyed to the signed identity). For every actor except the verified
  Platform Owner, authorization requires actual workspace membership. The verified Platform
  Owner is authorized across workspaces without a workspace-membership row, as defined by the
  merged F3 rule (`specs/003-tenancy-rls/spec.md` FR-004 and FR-007;
  `supabase/migrations/20261027120000_tenancy.sql:43-46` and `supabase/migrations/20261027140000_access_capability_for_po.sql:1-18`). The UI is never a security
  boundary.
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

- Every feature follows the mandatory workflow: Constitution → Specify → Clarify → Plan → Tasks → Analyze → Implement. Clarify is mandatory and MUST end with zero open ambiguities before implementation, recorded explicitly, never assumed. Before implementation, the current Analyze must be dated after the latest spec, plan, or task change and have zero open CRITICAL or HIGH findings; CI enforces this date order. Review-fix rounds that change only code or tests (no spec, plan or tasks edits) need no new Analyze. When only task status or traceability evidence changes, re-dating Analyze is a date update recording that no requirement text changed; a full Analyze is required only when FR/SC/acceptance or plan design text changes. (S29-PO-3 Q1, tightened by S37-PO-1 Q1; S54-R6)
- Feature flags: an unfinished feature may merge to `main` only behind a server-side flag that defaults OFF. A flag MUST never gate security, authorization, or RLS. All gates (security scan, tests, and RLS/money mutation evidence) apply to flagged code exactly as to released code. Removing the flag is part of feature completion. (S54-PO-14; S54-R39)
- Claude is the architect/orchestrator and independent reviewer. Claude may independently run read-only verification commands, including Git read commands, gh read queries, docker inspect, and SELECT-only database reads against synthetic/test data only. Claude performs no repository writes, migrations, test runs, or stack modifications; agents execute those actions. (S29-PO-3 Q4; S31-PO-7 Q6; S31-PO-8)
- Adaptive model routing follows task complexity, security risk, model capability, and quota (S22-PO-9 rule 5), within the PO rules in this section (S36-PO-5, which records S36-PO-4 items 3 and 4). The PO's delegation preferences (S36-PO-3 section 1) are preferences, not hard rules; the architect keeps them outside the repository. Any change to routing, including adding, removing, or reordering a model or fallback, requires PO approval before use. The earlier fixed model pool and D-27 tier sequence (S22-PO-9 rule 2; S25-PO-4; S25-PO-9; D-27) are superseded for model selection only by S36-PO-3, S36-PO-4 and S36-PO-5; their history remains in the sync reports below and in the decision register.
- Sol High and xhigh remain prohibited (D-27). Sol Medium is used exclusively for the mandatory independent Spec Kit spec/plan critique, not for implementation or routine reviews, and each invocation requires the explicit PO approval of S13 session 14 (S36-PO-5). For the mandatory independent feature-critic role, the PO ruled (S30-PO-8 Q15, verbatim; it stays in force, and S36-PO-2 later authorized Sonnet 5.5 critiques for F16 and F4 by explicit PO authorization):
  > Q15: Keep Sol Medium as the mandatory independent feature critic. Preserve the existing S13 rule requiring my explicit approval for each Sol invocation. Do not substitute Luna or other models, and do not skip critiques.
- Obtain PO approval before each critic invocation. If approval is absent, do not skip the critique; hold feature acceptance until the approved critique is complete. A critic other than Sol Medium requires explicit PO authorization naming it. If no approved model is available for a task or for the critic role, stop and ask the PO; do not use a model the PO has not approved for that role (D-27; S36-PO-5). Keep one performance-log row per delegation with model, effort, task class, outcome, review notes, and cost (D-27).
- Luna routes (S36-PO-4 item 4; S36-PO-5): Codex Luna is primary. `opencode-go/gpt-6-luna` is a fallback only when Codex Luna quota is exhausted; return to Codex Luna when quota is restored. Verify provider/model capability and security before using the fallback. No gate is weakened by either route.
- S29-PO-1 assigns MiniMax to the remaining Hero Glisse work, superseding S28-PO-5's Big Pickle assignment for that remaining work only. Free models receive no secrets or sensitive tasks (S13 PO Kilo guardrail); third-party/free models receive no secrets or `.env` values (S22-PO-9; S29-PO-3 Q3). All development AI agents must use synthetic/test data only; no real client data may be shared during development or testing (S31-PO-7 Q6, clarified by S31-PO-8). High-risk work (listed below) is routed as follows (S36-PO-5): Luna is preferred; Haiku is allowed only with independent Luna or Claude review, and only after this amendment (PR #48) is merged. No other model receives high-risk work unless the PO approves it before use. The earlier Luna High or Sol Medium list (S31-PO-7 Q6) is superseded for model eligibility only by S36-PO-5. The free-model guardrail above is unchanged: S36-PO-5 names Luna and Haiku only, so it approves no free model for sensitive or high-risk tasks, and the review and gate requirements below still apply to every route. The production-AI distinction and safeguards are recorded verbatim below; this does not authorize implementation or production data access (S31-PO-8). High-risk work (security, Auth, RLS, SECURITY DEFINER, migrations, admission, Storage policies, and financial logic) requires independent architect review and executed mutation tests; sensitive permissions are never expanded without PO approval (S29-PO-3 Q3).
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
- Mandatory Spec Debate: the architect drafts the spec and architecture; an independent critique by a model other than the spec's author is mandatory for every feature (S30-PO-8 Q15; S36-PO-5). Sol Medium is used exclusively for this critique (see Development Workflow & Quality Gates above). Each invocation requires explicit PO approval before the critic is invoked; do not use a critic the PO has not approved or skip the critique. If approval is absent or no approved critic is available, stop and ask the PO and hold feature acceptance until the approved critique is complete. By default there is one response round, with more rounds only for significant unresolved issues. The architect incorporates critique and presents unresolved product/design decisions to the PO. Implementation starts only after PO approval and a completed plan/tasks. AI agreement never replaces PO approval; the architect remains the final technical authority.
- Controlled Parallel Development: at most nine concurrent delegated agents (the orchestrating architect is not counted), of which at most five may write to pull requests at the same time. On-demand slots include the PO-approved Sol Medium critique, which keeps its per-invocation PO approval (S37-PO-15; S37-PO-12; S37-PO-13). Each writer uses an isolated worktree and branch and edits disjoint files. Only one
  writer may hold a stack lock for Docker or Supabase operations that start, stop, restart, reset,
  provision, migrate, seed, or write shared DB state; other writers stay out of that stack while the
  lock is held. Use one DB user per stack. Feature branches integrate sequentially, each after
  architect review and relevant green CI.
- Main merge gate: before any merge to `main`, require one executed successful full CI attempt on the exact PR head. There is no timing relationship between CI attempts and AI review. For a non-docs-only PR, the counted attempt may be (a) a sequential `pull_request` attempt/rerun, or (b) one `workflow_dispatch` run of the same CI workflow under the existing dispatch-validity rules. Each dispatch supplies the PR number and head SHA, is launched from the PR base branch's trusted workflow ref, tests `refs/pull/<n>/merge`, and is valid only when the merge-result SHA's second parent equals that exact head SHA. The workflow definition at the dispatch ref must match the workflow definition in the tested merge result; every job in one attempt must log the same PR, head SHA, and merge-result SHA. A code failure voids the head until fixed; an infrastructure failure (e.g. Docker Hub `toomanyrequests`) may be rerun, is recorded and never counted. A test failure that passes on rerun is a flake, recorded and reported; it still requires one clean counted run and is never masked. Record each run's ID and attempt; every required job concludes `success` and has a step count greater than zero (zero steps means NOT EXECUTED); an attempt counts only if `validate`, every `integration-shard` matrix shard, the `integration` aggregator, and `storage` each have job records with executed steps in that attempt (a partial rerun may retain earlier job outputs, which do not count). For a `pull_request` run, require this PR number, run `head_sha == headRefOid`, and `github.event.pull_request.head.sha == headRefOid`. Obtain the event head SHA from the GitHub Actions run event payload or observable run logs, and obtain `GITHUB_SHA` from run metadata/logs or a workflow step that prints it; record the run URL and source for each value. Record `head_sha` as the PR-head SHA and `GITHUB_SHA` separately as merge SHA `M`; never use `head_sha` as `M`. For every counted attempt, record `M`, its tree `T = git rev-parse M^{tree}`, and its base SHA; verify `M` has the exact PR head as its second parent and the base SHA as its first parent. For dispatch runs, require the CI workflow identity, `workflow_dispatch` event, a run ref equal to the PR base branch, an identical `ci.yml` blob at the dispatch ref and tested merge result, `inputs.pr` matching the PR, `inputs.head_sha == headRefOid`, and checked-out merge SHA whose second parent is that head; read and record these values from run metadata and logs. All required jobs within one attempt must log identical PR, head, and merge SHAs. The required CI jobs are `validate`, `integration-shard` (all three matrix shards, all successful), `integration` (the aggregator, successful), and `storage` from the main CI workflow; `validate` must include the `check:secrets` security scan. Update this list in the same PR as any workflow job rename or removal (S31-R6). For a main-branch push, `head_sha` must equal the exact merge commit; this is post-merge verification outside pre-approval items 1-6. Record both PR-head and merge-result SHAs in the PR body or feature report (S30-R10). A counted attempt remains valid while the current merge result for that exact head has the same tree as its recorded `T`, including after `main` advances. Immediately before merge, require GitHub to report the current merge ref `refs/pull/<n>/merge` as `MERGEABLE`; record its current merge SHA, tree `T'`, and current base tip. Verify its second parent is the exact PR head, its first parent is the current base tip, and `T'` equals the recorded `T` for every counted attempt. If the head changes, `T'` differs from any counted `T`, or the current merge result cannot be computed / mergeability is `UNKNOWN` or `CONFLICTING`, fail closed and require one fresh executed attempt after a valid current merge result is available. Rerunning an old `pull_request` attempt tests its old merge SHA and does not count for a changed result; use a fresh `pull_request` event or fresh dispatches.
- AI PR reviews are optional and provider-independent; they may use any provider. They do not affect the timing or count of CI attempts. At most one AI review per provider may be requested for an unchanged exact head. If an AI review is used on the exact PR head, classify each finding: a BLOCKING finding is P0/P1, or any finding about security, authorization/RLS, data loss or corruption, money math, privacy, a failing or missing test for changed behavior, or a spec/FR contradiction, and it MUST be fixed in the current round with a test; a NON-BLOCKING finding is P2/P3, a nitpick, style, refactor, or "consider" suggestion, and it is not fixed in the PR—reply once "Deferred to backlog: <backlog id>", append it to `~/.lifter/backlog/review-deferred.md`, then resolve the thread, which satisfies "answer it with evidence". Uncertain severity is decided by the architect and recorded; it is never silently downgraded. At most two AI-review rounds per PR (one provider per round); if blocking findings remain after round two, stop and the PO decides (fix-and-merge without another review, another round, or split). Never request a review with known unaddressed BLOCKING findings; one push per round. Fix every blocking finding or answer it with evidence, resolve every blocker, and leave zero unresolved review threads before merge. Do not repeat an AI review on an unchanged head or rerun CI after the counted green while the current merge-result tree remains equal to the validated tree of the counted attempt; reruns of recorded infrastructure-failed, non-counted attempts remain allowed. A review on another SHA does not qualify as a review on the exact head.
- After the required live gates are satisfied, an independent architect must review the full diff and evidence on the exact SHA. When an AI review was used on that same SHA and all live gates pass, the existing standing-approval rule applies to normal PRs, including docs-only PRs, PRs that hit the R2 two-round cap after the PO's decision, and feature slice PRs: a slice PR of a feature may merge on one counted green CI attempt plus the independent architect's full-diff review of the exact SHA under standing approval, without a per-slice AI review. Exactly one AI review is required per feature, on the cumulative feature diff when the feature is complete (before its feature flag is removed or the feature is declared done); its BLOCKING findings are fixed in one follow-up slice (max two AI-review rounds). The merge lane records `po_approved_head` as the architect-reviewed SHA, rechecks immediately before merge, and uses `gh pr merge <n> --merge --match-head-commit <po_approved_head>`; report after merge. If there was no AI review on the exact SHA and the PR is not a covered feature slice, merge requires the PO's explicit approval of that exact SHA in the form `merge #N at <sha>`. Standing approval never covers a PR that changes `.specify/memory/constitution.md`, `.github/workflows/**`, branch protection, secrets handling, or production configuration, or that has an open PO-DECISION-NEEDED; such a PR always requires the PO's explicit exact-SHA command `merge #N at <sha>`. A PR that changes `.specify/memory/constitution.md` is never covered by standing approval and always requires explicit PO approval of its exact SHA, regardless of AI review. Any head change voids the recorded approval SHA; re-satisfy all applicable gates and obtain the applicable approval for the new SHA. CI evidence counts only when `.github/workflows` at the exact PR head equals the base branch, or every workflow change is listed in the PR body and reviewed by the AI reviewer (if used) and architect before evidence is accepted. Owner-only branch protection remains the PO admin step (S31-R4). Intermediate sub-branch merges into a parent feature branch require Claude review and green relevant CI on the exact head and do not bypass this main merge gate (see docs/08 and D-26). Immediately before merge, recheck the gates and approval SHA; no writes to `main` may occur between the final live recheck and merge. If `main` moved, re-verify all gates. Never use `--admin`, `--auto`, `--delete-branch`, or bypass branch protection. This is process-only because branch protection returns 403.
- For docs-only PRs, the counted attempt is one full `workflow_dispatch` run for the exact PR/head, executing `validate`, all three integration shards, `integration`, and `storage`; it need not follow or precede an AI review. The `pull_request` run may skip integration/storage for docs-only changes and does not count as the counted attempt. A PR is docs-only only when every changed path is a lowercase `.md` file beneath `docs/`, `specs/`, or `.specify/`, or exactly root `README.md` or `CHANGELOG.md`; both rename endpoints must qualify. Any other path or a path-detection error uses the ordinary full-CI attempt forms above. `workflow_dispatch` always runs full CI. No gate is relaxed.
- When an AI review is used, all its actionable findings must be fixed or answered with evidence and blockers resolved; the threads-resolved gate applies. The Absolute PO Decision Rule, Spec Kit gate, security gates, agent limits and independent architect review remain in force. The required AI review provider is not a CI job or required check.
- Supplementary merge gates (from [docs/03-roadmap.md](../../docs/03-roadmap.md)): apply the preceding Main merge gate in full, including exact PR/head binding, run ID and attempt recording, per-job `success` and positive step-count checks, and current-merge-tree comparison. Agent-reported local gate results never substitute. Claude (architect) does not run tests or Git writes and verifies the counted run on that head. Also require the isolation gate; the money gate; AR and EN UI check; log-scrub check; and acceptance criteria verified against [docs/01-traceability.md](../../docs/01-traceability.md). High-risk changes also require executed mutation evidence (file:line kill, restore, diff exit 0) recorded in the feature's reports/verification file and referenced from `traceability.md` (S30-R10; S29-PO-3 Q3). Record the tested commit SHA and Node, Vitest/Playwright, and PostgreSQL image versions. Evidence carries to a later head only with diff proof that the mutated source, its tests, and defining migrations are unchanged; otherwise rerun the mutation evidence (S31-R5).
- Only passing work that satisfies the required gates and independent architect review is committed.

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

**Version**: 1.16.0 | **Ratified**: 2026-10-27 | **Last Amended**: 2026-11-13 (S54-PO-14; S54-R39)

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

PATCH (version 1.6.0 to 1.6.1; clarification only, no principle change; S36-R3): per PO decision `#48=A (3 executed PR greens)` (S35-PO-1), align the main merge gate with the CI triggers as written in `.github/workflows/ci.yml`: count the main-side gate on three executed `pull_request` runs on the exact PR head (plus same-head rerun evidence), and remove the nonexistent feature-branch `push` run requirement (`head_sha == headRefOid`) and the inconsistent "both" wording. CI triggers are not changed. Mirrored in `docs/08-agent-workflow.md` (items 1-6 header de-duplicated; "Both ... runs" -> "Three executed ... runs"; PR-branch push check removed; "verifies both runs" -> "verifies all three runs"). `docs/03-roadmap.md` unchanged. No application code, tests, migrations, or CI workflow files changed. Follow-up (S36-R8): an attempt counts only if validate, integration and storage each have executed job records in that attempt (codifies existing practice). Follow-up (S36-R1/R2/R3): gate wording is now "three executed successful `pull_request` attempts (initial run or reruns) on the same exact head SHA; a failure caused by code voids that head until fixed; an infrastructure failure may be rerun, is recorded and never counted"; step 7 requires a fresh `pull_request` event when `main` moves; the restored duplicate "items 1-5" line is removed. (S34-48-CR-2, S35-PO-1, S36-R1, S36-R2, S36-R3)

### Sync impact report and amendment note - 2026-11-08 (S36-PO-4 item 3; S36-PO-2; S36-PO-3 section 1; S36-R9)

MINOR (version 1.6.1 to 1.7.0; governance rule change). Authority: the PO decision recorded verbatim in S36-PO-4 item 3, applied under an explicit architect instruction (S36 round 5):

> Constitution = B: Formally amend via #48 for controlled model-routing flexibility. Preserve mandatory independent critique, security gates, and PO authority. No premature relaxation. Pause unauthorized high-risk mutations until policy conflicts are resolved.

Related PO sources: S36-PO-2 (Sonnet 5.5 independent critiques authorized for F16 and F4, with the constitution conflict reported) and S36-PO-3 section 1 (delegation routing preferences, to be changed only with PO approval).

Changed (model routing only): (1) Adaptive model routing now follows the PO-approved routing record kept by the architect outside the repository (cited by S36-PO-3 and S36-PO-4; the record is not in the repository), and any routing change needs PO approval before use. (2) High-risk work (security, Auth, RLS, SECURITY DEFINER, migrations, admission, Storage policies, financial logic) goes only to models the PO has explicitly approved for high-risk work in that record; independent architect review and executed mutation evidence are still required; third-party/free models receive no secrets or `.env` values and development agents use synthetic data only (S31-PO-8 wording unchanged). (3) Mandatory Spec Debate stays mandatory: an independent critique by a model other than the spec's author, chosen from the PO-approved critic list, with PO approval per invocation, one response round by default, and AI agreement never replacing PO approval. (4) If no approved model is available, stop and ask the PO.

Superseded with pointers (history retained, not deleted): the fixed model pool (S22-PO-9 rule 2; S25-PO-4; S25-PO-9) and the D-27 tier sequence GLM 5.3 Flash -> Luna -> Sol Medium are superseded for model selection only; S30-PO-8 Q15 (Sol Medium as sole critic) is superseded for the critic model only by S36-PO-2 and S36-PO-4, and its quoted text is retained above; S31-PO-7 Q6's "Luna High or Sol Medium" list is superseded for high-risk model eligibility only.

Unchanged: the six-agent cap, worktree isolation, one stack-lock writer, all CI, CodeRabbit, exact-SHA, and PO merge approval gates, PO authority and the Absolute PO Decision Rule, the free-model secrets/sensitive-task guardrail (S13), the Sol High and xhigh prohibition (D-27), per-invocation PO approval wherever Sol Medium is used (S13 session 14), the performance log, and the production-AI safeguards (S31-PO-8). Also included (S36-R9, codifies existing practice, no new policy): no writes to `main` between the final live recheck and the merge; if `main` moved, re-verify all gates.

Dependent documents updated in the same PR, separate commits: `docs/08-agent-workflow.md`, `docs/03-roadmap.md` (critic wording), and `docs/04-changes-and-questions.md` (decision-register row D-29). No application code, tests, migrations, or CI workflow files changed.

### Sync impact report and amendment note - 2026-11-08 (S36-PO-5; S37-PO-1 Q1; PR #48 round 6)

MINOR (version 1.7.0 to 1.8.0; governance rule change within the same open amendment PR, following its per-round bump practice). Authority: the final S36-PO-5 "Models / Constitution" block, S36-PO-4 items 3 and 4, and S37-PO-1 Q1 = A ("Tighten": require zero open ambiguities before implementation).

Changed: (1) The model-routing text now states the PO's final words instead of an external routing record. Sol Medium is used exclusively for the mandatory independent Spec Kit spec/plan critique, not for implementation or routine reviews, with PO approval for each invocation. High-risk work: Luna is preferred; Haiku is allowed only with independent Luna or Claude review, and only after this amendment is merged; no other model without prior PO approval. Codex Luna is primary; `opencode-go/gpt-6-luna` is a fallback only on Codex quota exhaustion, returning to Codex Luna when quota is restored, with provider/model capability and security verified. At most six concurrent agents. This supersedes the 1.7.0 routing-record and PO-approved critic list wording; S30-PO-8 Q15 is no longer treated as superseded for the critic model, and any critic other than Sol Medium needs explicit PO authorization (S36-PO-2 gave it for Sonnet 5.5 on F16 and F4). (2) The free-model guardrail (S13) is unchanged. S36-PO-5 names Luna and Haiku only and approves no free model, so no free model receives sensitive or high-risk tasks (resolves the guardrail tension noted in round 5, R5-2). (3) Clarify must end with zero open ambiguities before implementation, recorded explicitly and never assumed, tightening S29-PO-3 Q1 (CodeRabbit thread BfzT).

Unchanged: mandatory independent critique with per-invocation PO approval, independent architect review and executed mutation evidence for high-risk work, all security, CI, CodeRabbit and exact-SHA PO merge gates, PO authority, the Absolute PO Decision Rule, Sol High and xhigh prohibition, the performance log, and the production-AI safeguards.

Dependent documents updated in the same PR, separate commit: `docs/08-agent-workflow.md`, `docs/03-roadmap.md`, and `docs/04-changes-and-questions.md` (D-29 revised, D-30 added). No application code, tests, migrations, or CI workflow files changed.

### Sync impact report and amendment note - 2026-11-08 (S37-PO-12; S37-PO-13; S37-PO-15)

MINOR (version 1.8.0 to 1.9.0; governance rule change to the concurrency limit). Authority: the PO messages recorded verbatim in `s37-po-1.verbatim.txt`, sections S37-PO-12, S37-PO-13 and S37-PO-15, quoted byte-exact:

> S37-PO-12 (PO message verbatim, re Sol critique slot): "no open for Sol a 7 slot when using in crituqe"
> Architect reading recorded at the time: open a 7th concurrent slot for Sol when it runs a critique.

> S37-PO-13 (PO message verbatim): "A"
> Option A as presented: "add one sentence to the constitution saying a PO-approved Sol Medium critique may run as a 7th slot. It would go in a small new PR right after #48 merges. Then #48 merges at 5e22855e as you approved, and the critique waits for that PR's own gates and your approval. Interim: Sol runs only when fewer than 6 agents are running."

> S37-PO-15 (PO message verbatim): "approve"
> Architect mapping of item (2) as recorded: "a constitution amendment for 8 concurrent slots with at most 5 PR-writing lanes (the Sol Medium critique is one of the on-demand slots; supersedes the separate 7th-slot wording of S37-PO-13 by folding it into the same amendment PR)".

Changed: (1) Controlled Parallel Development: the cap moves from six to eight concurrent delegated agents (the orchestrating architect not counted), of which at most five may write to pull requests at the same time. On-demand slots include the PO-approved Sol Medium critique, folded into this single amendment as S37-PO-15 records. (2) Worktree isolation, disjoint files and one stack-lock writer are unchanged. (3) Not broadened: this text grants no Sol use beyond the PO-approved, per-invocation spec/plan critique; Sol Medium remains exclusively for that critique, and Sol High and xhigh remain prohibited. The model allocation table is operational and is not encoded in this constitution.

Unchanged: every gate in Development Workflow & Quality Gates (Clarify and Analyze, mandatory independent critique, the main merge gate and its CI, CodeRabbit and exact-SHA requirements, PO merge approval, supplementary gates), the Absolute PO Decision Rule, the free-model secrets and sensitive-task guardrail (S13), per-invocation PO approval for Sol Medium (S13 session 14), the performance log, and the production-AI safeguards (S31-PO-8).

MINOR (version 1.9.0 to 1.10.0; S38-PO-6 mapping items (b), (d), and (e), S38-PO-7, and S38-PO-8). PO authority, byte-exact from the PO source below (the S38-PO-6 architect mapping is included as written):

S38-PO-6 (2026-11-09, PO message verbatim): Approve all
(Architect mapping, NOT PO words — "all" = every open item in the architect's preceding message: (a) merge PR #70 at exactly fc0f69df24ece3a935a47a8e287cc671acd6f5ae; (b) Decision 1: the 3 executed greens may be 3 concurrent full runs on the same exact SHA (each with validate/integration/storage executing), not only sequential reruns; (c) Decision 2: within one PR round, one additional CodeRabbit request is allowed after fixes are pushed (max 2 per round); (d) Decision 3: standing merge approval for any PR whose exact head passes gate-check a-h and an independent architect review, reported after merge — subject to a constitution check, and a constitution amendment PR if the constitution requires per-PR exact-SHA PO approval; (e) the CI integration-job sharding PR.)

S38-PO-7 (2026-11-09, PO message verbatim):
Correction: PO explicitly APPROVES BOTH parallel 3-run CI and standing automatic merge approval after all 8 gates pass on the architect-reviewed exact SHA. Update Constitution 1.10.0, workflows and gate-check through existing approval gates. Preserve security and test coverage. Prioritize speed.
(Architect note, NOT PO words: the change takes effect only after the constitution 1.10.0 amendment PR merges through the current gates, including this PO's explicit exact-SHA approval of that amendment PR. Until then every merge needs per-PR exact-SHA PO approval.)

S38-PO-8 (2026-11-09, PO message verbatim):
PO decision: Future Constitution changes ALWAYS require explicit PO approval of the exact SHA. Standing merge approval applies to normal PRs only after all 8 gates pass. Proceed with Constitution 1.10.0 and CI optimization as approved.

The three full successful CI attempts may be one `pull_request` run plus two concurrent `workflow_dispatch` runs. Dispatch runs use the PR base branch's trusted workflow ref; its `ci.yml` blob must match the tested merge result, and every required job logs identical PR/head/merge SHAs. They bind PR number and head SHA to the checked-out merge ref's second parent. Each attempt must execute `validate`, all three `integration-shard` jobs, the `integration` aggregator, and `storage`; the aggregator compares and logs the shared PR/head/merge tuple exported by all three shards. Gate-check d enforces exact-head provenance and identical logged revisions across every required job in each executed `pull_request` attempt. Infrastructure failures are recorded but do not count. Standing approval applies only to normal PRs after all eight live gates and an independent full-diff architect review pass on the same exact SHA; any head change voids it. The merge lane records `po_approved_head`, rechecks immediately before merging with `--match-head-commit`, and reports after merge. Constitution-changing PRs always require explicit PO approval of their exact SHA. Existing CodeRabbit, thread, mutation evidence, product-decision, security, no-writes-to-main, no-admin/bypass, and other merge gates remain.

Dependent documents updated in the same PR and commit: `docs/08-agent-workflow.md` and `docs/04-changes-and-questions.md` (decision-register row D-32). CI workflow, gate-check, regression tests, feature spec, plan, tasks, and Analyze updated; no application code or migrations changed.

### Sync impact report and amendment note - 2026-11-09 (S41-PO-8/9/10; S41-R11)

MINOR (version 1.10.0 to 1.11.0): materially expands Development Workflow & Quality Gates to define the docs-only CI green form approved by S41-PO-9b and the path boundary selected by S41-PO-10. For a PR whose every changed path is a `.md` file under `docs/`, `specs/`, or `.specify/`, or root `README.md` or `CHANGELOG.md`, the initial pull_request run executes validate and its format/spec-consistency checks; integration-shard, integration and storage may be skipped by design. Three full `workflow_dispatch` runs for the exact PR and head SHA, each executing validate, all three integration shards, integration and storage and started after exact-head CodeRabbit APPROVED, provide the three green attempts. Any unlisted path, rename endpoint outside the allow-list, or path-detection error is non-docs-only and requires full pull_request integration and storage execution. workflow_dispatch always runs full CI. A skipped integration is never a successful executed green. This does not relax any gate; future constitution changes still require PO approval of the exact SHA (S38-PO-8).

The CI workflow and feature spec/plan/tasks/Analyze are synchronized in this PR. Gate-check d remains unchanged and its separate proposed patch is provided for architect review. The Constitution amendment itself requires explicit PO exact-SHA approval.

### Sync impact report and amendment note - 2026-11-10 (S44-PO-5; S44-R5)

MINOR (version 1.11.0 to 1.12.0).

Changed: the main merge gate requires three independent executed successful full CI attempts on the exact PR head, with no timing tie to AI review; docs-only PRs use three full workflow_dispatch runs. Each counted attempt records merge SHA `M`, tree `T`, and base SHA. Greens remain valid while the current merge result for the exact head has the same tree as every counted attempt, even if `main` advances. Immediately before merge, record the current merge SHA, tree `T'`, and base tip; compare `T'` with each counted `T`. A changed head or tree, uncomputable merge ref, or mergeability `UNKNOWN`/`CONFLICTING` fails closed and requires three fresh attempts once a valid merge result is available. An old pull_request rerun tests its old merge SHA and does not count for a changed result. AI PR review is optional and provider-independent. When used on the exact head, actionable findings must be fixed or answered with evidence, blockers resolved, and review threads resolved; no redundant provider review or CI rerun is allowed while the current merge-result tree remains equal to all three counted trees, except recorded infrastructure-failure retries. A merge without AI review on the exact head requires explicit PO approval of that exact SHA. With an AI review, the existing standing-approval rule and independent architect review on the same SHA remain. The authoritative CI job list no longer includes an AI provider review. Authority: S44-PO-5, S44-R5, and S44-PO-6 as mapped by S44-R6.

Unchanged: exact-head CI provenance, executed-step, infrastructure-failure and CI form requirements; the `check:secrets` security check; independent architect review; threads-resolved when review findings exist; Spec Kit and agent limits; the Absolute PO Decision Rule; exact-SHA approval for Constitution PRs; branch protections and all other live gates. Branch-protection required checks and the gate-check tool remain PO admin / follow-up work outside this amendment. Authority: S44-PO-5 / S44-R5 and S44-PO-6 / S44-R6. Dependent current-rule text updated in `docs/08-agent-workflow.md`, `docs/03-roadmap.md`, and `docs/10-feature-tracker.md`. No workflow or application code changed.

### Sync impact report and amendment note - 2026-11-11 (S47-PO-14)

MINOR (version 1.12.0 to 1.13.0): Principle I now states the explicit, identity-verified
Platform Owner exception already implemented by merged F3. Spec 003 FR-004 defines database
authorization for the PO across every workspace and active membership plus capability for other
actors; FR-007 requires the matching app-layer policy. Migration
`supabase/migrations/20261027120000_tenancy.sql:43-46` defines
`app_private.is_platform_owner()` from the signed-in actor's staff role, and `supabase/migrations/20261027140000_access_capability_for_po.sql:1-18` defines
`app_private.has_workspace_access()` with the PO branch and membership branch. The two
authorization walls remain mandatory. Every other actor still requires actual workspace
membership. No other Principle I semantics changed; Principle III and its capability grants are
unchanged.

Authority: PO S47-PO-14, `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-14.verbatim.txt`,
SHA-256 `945c9c68387d0ceb7e03a8ba4ea089b567e89bd8a9bb086a58645cd39a20d56e`. The source's
verbatim text is “Amend constitution (Rec.)”. The approved amendment scope is the explicit
Principle I exception above; no new capability is granted.

Sync checklist: no dependent templates, commands, or docs are changed. The
`.claude/skills/speckit-constitution/SKILL.md` scope guard says dependent templates and commands
read the constitution at runtime and are not modified in this workflow. No other dependent-file
sync is required by that checklist. The F20 spec and plan remain unchanged; their entry check is
recorded in the external run report.

### Sync impact report and amendment note - 2026-11-12 (S48-PO-22; S48-R28)

MINOR (version 1.13.0 to 1.14.0): Controlled Parallel Development now permits at most nine
concurrent delegated agents. The total cap accommodates the third concurrent Luna slot. The
maximum of five PR writers, worktree isolation, disjoint-file editing, the stack lock, and
per-invocation PO approval for Sol Medium remain unchanged. All merge gates remain unchanged.

Authority: PO S48-PO-22, `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-22.verbatim.txt`,
SHA-256 `ea229789b02a9b05bd22e2e7f6a6bc3a07a8b9e72e5ddd216b32e72dcb70d548`. PO words:
“Permanently allow 3 concurrent Luna slots, adjusting the total cap.”

Architect mapping (S48-R28; not PO words): Luna concurrent slots 2 to 3; total delegated-agent
cap 8 to 9 (adds the third Luna slot); PR writers <= 5 unchanged.

Sync checklist: the current-rule mirror in `docs/08-agent-workflow.md` and the decision register
in `docs/04-changes-and-questions.md` are updated. Worktree isolation, Sol per-invocation
approval, and all merge gates are unchanged. No feature spec, workflow, or application code
changed.

### Sync impact report and amendment note - 2026-11-13 (S54-PO-4; S54-R11)

MINOR (version 1.14.0 to 1.15.0): fast-track governance gates. Authority: PO S54-PO-4, `C:/Users/NEW LAP/.lifter/runs/s54-po/s54-po-4.verbatim.txt`, SHA-256 `c479c44991ccc33991a6c8c0b2ec7b37cfa7b6e4c4fd50e39c6ce09019e0aa4f`.

Changed (a-d): (a) Main merge gate now requires one executed successful full CI attempt on the exact PR head instead of three; per-attempt validity rules, dispatch validity, merge-tree recheck, fail-closed, infra reruns, and flake recording are retained. (b) AI review clause defines BLOCKING vs NON-BLOCKING findings, backlog-citing replies, and a two-round cap with PO decision after round two. (c) Standing approval extended to docs-only PRs and PRs at the two-round cap after the PO's decision; always-explicit-PO-command exclusions listed. (d) Spec Kit Analyze reruns required only when FR/SC/acceptance requirement text changes.

Unchanged: security scan, RLS/money mutation evidence, architect exact-SHA review, PO decision rule, agent limits, worktree isolation, constitution exact-SHA approval.

Sync checklist: `docs/08-agent-workflow.md` mirrors the changed rules; `docs/04-changes-and-questions.md` records S54-PO-1..4. No application code or workflows changed.

### Sync impact report and amendment note - 2026-11-13 (S54-PO-14; S54-R39)

MINOR (version 1.15.0 to 1.16.0): hybrid slice workflow. Authority: PO S54-PO-14, `C:/Users/NEW LAP/.lifter/runs/s54-po/s54-po-14.verbatim.txt`, SHA-256 `f542f2a154440b792e0be8ee909dcb0259b42a47ea3cb24de3333e7b73dae101`. PO words: "approve".

Changed: (a) AI review / standing approval: a slice PR of a feature may merge on one counted green CI attempt plus the independent architect's full-diff review of the exact SHA under standing approval, without a per-slice AI review; exactly one AI review is required per feature on the cumulative feature diff when the feature is complete (before its feature flag is removed or the feature is declared done); its BLOCKING findings are fixed in one follow-up slice (max two AI-review rounds). The two-round cap and the BLOCKING/NON-BLOCKING definitions are unchanged. (b) Feature flags: unfinished features may merge to `main` only behind a server-side flag that defaults OFF; flags never gate security, authorization, or RLS; all gates (security scan, tests, and RLS/money mutation evidence) apply to flagged code exactly as to released code; removing the flag is part of feature completion.

Unchanged: one counted green CI attempt, the security scan, RLS/money mutation evidence, architect exact-SHA review, the PO decision rule, agent limits, worktree isolation, constitution exact-SHA approval, and all standing-approval exclusions (constitution, workflows, branch protection, secrets handling, production configuration, open PO-DECISION-NEEDED), which still require the PO's explicit `merge #N at <sha>`.

Sync checklist: `docs/08-agent-workflow.md` mirrors the changed AI-review/standing-approval rule; `docs/04-changes-and-questions.md` records S54-PO-5..S54-PO-14. No application code or workflows changed.