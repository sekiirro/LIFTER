# LIFTER - Agent Workflow (PO-approved 2026-10-28; adaptive routing amended 2026-10-29, D-27)

These rules govern agent dispatch, design/spec work, parallel development, and merge preparation.
The Constitution remains authoritative. The [Frontend Design Gate](09-frontend-design-gate.md)
applies to every unit that changes rendered UI.

## Roles

- **Claude - architect, orchestrator, independent reviewer.** Drafts briefs and technical designs,
  manages dependencies and merge order, reviews actual diffs and evidence, and presents unresolved
  product or design decisions to the PO. Claude may independently run read-only verification commands
  (Git read commands, `gh` read queries, `docker inspect`, and SELECT-only database reads against
  synthetic/test data only). Claude
  performs no repository writes, migrations, test runs, or stack modifications; agents execute those
  actions. (S29-PO-3 Q4)
- No AI agent may independently make product decisions, whether discovered during Specify, Clarify,
  Analyze, implementation, or reviews. Clarify is mandatory for every feature and records
  "zero open ambiguities" explicitly when none exist. Before implementation, the current Analyze must
  postdate the
  latest spec, plan, or tasks change and have zero open CRITICAL/HIGH findings. Unresolved product
  decisions are presented as numbered MCQs with options, implications, and a recommendation; wait for
  explicit PO approval. (S29-PO-2; S29-PO-3 Q1-Q2)
- **Delegated agents (Codex, or OpenCode for the GLM tier) own implementation and Git operations.** They own bounded implementation and checks. Codex may delegate eligible low-risk work through OpenCode; writers do not approve their own work.

## Adaptive Model Routing

Route according to task complexity, security risk, model capability, and quota (S22-PO-9 rule 5).

- **Current allocation:** Four Luna Medium slots, one MiniMax at highest effort, and Big Pickle, Beam, and Flint through OpenCode; Kilo Code's two best available free models are the fallback when OpenCode free quotas are exhausted (S22-PO-9 rule 2; S25-PO-4 raised Luna capacity to three, and S25-PO-9 superseded that cap with a fourth slot).
- **Retained tier rules:** The D-27 sequence GLM 5.3 Flash -> Luna -> Sol Medium governs ordinary task routing. S13 session 14 reserves Sol Medium for exceptionally difficult tasks or when GLM and Luna fail and requires explicit PO approval before every Sol invocation. For the mandatory independent feature-critic role, the PO ruled (S30-PO-8 Q15, verbatim):
  > Q15: Keep Sol Medium as the mandatory independent feature critic. Preserve the existing S13 rule requiring my explicit approval for each Sol invocation. Do not substitute Luna or other models, and do not skip critiques.
  Q15 establishes this specific feature-critic use while preserving S13's per-invocation approval. Obtain approval before invoking Sol. Sol High and xhigh remain prohibited (D-27). Without approval, do not substitute another model or skip the critique; hold feature acceptance until the approved critique is complete. If no permitted tier is available for ordinary routing, stop and request PO direction; do not substitute a model (D-27).
- **Performance records:** Keep one performance-log row per delegation, including model, effort, task class, outcome, review notes, and cost (D-27).
- **Development data and routing:** All development AI agents must use synthetic/test data only; no real client data may be shared during development or testing. Security-sensitive code work stays with approved paid models (Luna High or Sol Medium; Sol still requires per-invocation PO approval per S30-PO-8 Q15) (S31-PO-7 Q6). The PO clarification follows (S31-PO-8):
  > S31-Q6 — PO clarification:
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
- **Secrets and sensitive tasks:** Free models receive no secrets or sensitive tasks (S13 PO Kilo guardrail); third-party/free models receive no secrets or `.env` values (S22-PO-9; S29-PO-3 Q3). This is the same restriction expressed by the security-sensitive routing rule above (Luna High or Sol Medium with per-invocation PO approval); do not infer a separate sensitive-code category beyond it.
- **High-risk work:** Security, Auth, RLS, SECURITY DEFINER, migrations, admission, Storage policies, and financial logic require independent architect review and executed mutation tests. Never expand sensitive permissions without PO approval (S29-PO-3 Q3).
- **Hero assignment:** MiniMax's assignment to remaining Hero Glisse work supersedes S28-PO-5's Big Pickle assignment for that remaining work only (S29-PO-1).

## Mandatory Spec Debate

1. The architect drafts the feature spec and architecture.
2. An independent Sol Medium critique challenges the spec and architecture for every feature. Each invocation requires explicit PO approval under S13 session 14, as reaffirmed by S30-PO-8 Q15; do not substitute another model or skip a critique. If approval is absent, hold feature acceptance until the approved critique is complete.
3. The architect responds once by default. Additional rounds are only for significant unresolved
   issues.
4. The architect incorporates the critique and presents unresolved product/design decisions to the
   PO.
5. Implementation starts only after PO approval and completion of the plan and tasks. AI agreement
   never replaces PO approval. The architect remains the final technical authority.

## Controlled Parallel Development

- Use at most six concurrent delegated agents (the orchestrating architect is not counted).
- Each writer gets an isolated worktree and branch. Writers edit disjoint files and do not share a
  branch.
- Only one writer may hold a stack lock for Docker or Supabase operations that start, stop, restart,
  reset, provision, migrate, seed, or write shared DB state. Other writers stay out of that stack while
  the lock is held. Use one DB user per stack.
- Integrate feature branches sequentially. Each integration requires architect review and relevant
  green CI.

## Frontend Design Gate

Every unit that changes rendered UI follows [docs/09-frontend-design-gate.md](09-frontend-design-gate.md).
The environment-local design-skills catalog is not in the repo and is advisory. The Design System
and its implemented tokens/components remain the single source of truth. Missing decisions stop
that part of the work and go to the PO with A/B/C options and the architect's recommendation.

## Intermediate sub-branch merges

Intermediate merges of parallel sub-branches into a parent feature branch (for example,
`011-docs-drift` into `011-client-accounts`) are not merges into `main`. They require Claude's
independent review of the actual diff and green relevant CI on the exact head; no separate CodeRabbit
gate is required. The content must still pass the complete main merge gate below in the parent feature
PR before any merge into `main`. This process does not replace or bypass that gate (D-26).

- For local Supabase status checks, use [scripts/supabase-status-safe.mjs](../scripts/supabase-status-safe.mjs) with an absolute `--workdir` and expected project/API/DB values; it emits only `apiUrl` (origin), `dbPort`, and `projectId`. Never print raw status output.

## Main merge gate

Before asking the PO to approve a merge to `main`, require items 1-6 on the exact PR head:

1. A completed CodeRabbit review is APPROVED on the exact PR head (`commit_id == headRefOid`), with no later CHANGES_REQUESTED or DISMISSED review.
2. PR `reviewDecision` is APPROVED.
3. There are zero unresolved review threads and all actionable findings are resolved.
4. Both GitHub Actions CI runs are completed with success and required security checks are green. The required CI jobs are `validate`, `integration`, and `storage` from the main CI workflow; also require CodeRabbit review and the `check:secrets` security scan in `validate`. Update this authoritative list in the same PR as any workflow job rename or removal (S31-R6). For each run, record its run ID and attempt, require every required job to conclude `success`, and confirm each required job has a step count greater than zero; a zero-step job is NOT EXECUTED. For the PR-branch `push` run, require `head_sha == headRefOid`. For the `pull_request` run, require the PR number to match this PR, the run `head_sha == headRefOid`, and `github.event.pull_request.head.sha == headRefOid`. Obtain `github.event.pull_request.head.sha` from the GitHub Actions run's event payload or observable run logs, and obtain `GITHUB_SHA` from that run's metadata/logs or a workflow step that prints it; record the run URL and the source used for each value. Record the run `head_sha` as the PR-head SHA and `GITHUB_SHA` separately as the merge-result SHA; never use `head_sha` as the merge-result SHA. Verify the merge-result commit has the PR head and current `main` commit as parents. Record both the PR-head SHA and merge-result SHA in the PR body or feature report (S30-R10). If `main` advances, re-evaluate the gate on the new merge result. CI evidence counts only when `.github/workflows` at the exact PR head equals the base branch, or every workflow change is listed in the PR body and reviewed by CodeRabbit and the architect before evidence is accepted. Owner-only branch protection remains the PO admin step (S31-R4). Agent-reported local results never substitute. Claude (architect) does not run tests or Git writes and verifies both runs. The exact-merge-commit `head_sha` check for a main-branch push is post-merge verification, outside pre-approval items 1-6.
5. The architect has independently reviewed the actual diff and evidence.
6. The isolation gate, money gate, AR and EN UI check, log-scrub check, and acceptance criteria verified against [01-traceability.md](01-traceability.md) are satisfied. For high-risk work, executed mutation evidence (file:line kill, restore, diff exit 0) is recorded in the feature's reports/verification file and referenced from `traceability.md` (S30-R10; S29-PO-3 Q3). Record the tested commit SHA and Node, Vitest/Playwright, and PostgreSQL image versions. Evidence carries to a later head only with diff proof that the mutated source, its tests, and defining migrations are unchanged; otherwise rerun the mutation evidence (S31-R5).

Then ask the PO for explicit merge approval and record the approved head SHA with that approval.

7. Merge only after that approval, immediately re-checking items 1-6 and `po_approved_head == headRefOid`. If the head changed after PO approval, the approval lapses; re-satisfy items 1-6 on the new head and obtain new explicit PO approval. If `main` moved after the green `pull_request` run, rerun CI on the updated merge result before merging. Use `gh pr merge <n> --merge --match-head-commit <po_approved_head>`.

Never use `--admin`, `--auto`, or `--delete-branch`. Branch protection returns 403 on the current private Free plan, so this gate is process-only.

## Brief and implementation conventions

- A brief starts with the shared preamble or clearly identifies itself as a delta from it. The
  preamble covers worktree/branch, tests-first RED→GREEN, forward-only migrations, explicit staging,
  open decisions, and the required report.
- Follow tests-first RED→GREEN and use forward-only migrations.
- Stage only explicitly named files; never use `git add -A`.
- Commit trailers use `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` when the brief
  requires it.
