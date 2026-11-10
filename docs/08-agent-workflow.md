# LIFTER - Agent Workflow (PO-approved 2026-10-28; adaptive routing amended 2026-10-29, D-27; model routing amended 2026-11-08, S36-PO-4, S36-PO-5)

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
  Analyze, implementation, or reviews. Clarify is mandatory for every feature and must end with
  zero open ambiguities before implementation, recorded explicitly, never assumed. Before implementation, the current Analyze must
  postdate the
  latest spec, plan, or tasks change and have zero open CRITICAL/HIGH findings. Unresolved product
  decisions are presented as numbered MCQs with options, implications, and a recommendation; wait for
  explicit PO approval. (S29-PO-2; S29-PO-3 Q1-Q2, Q1 tightened by S37-PO-1 Q1)
- **Delegated agents (Codex, or OpenCode for the GLM tier) own implementation and Git operations.** They own bounded implementation and checks. Codex may delegate eligible low-risk work through OpenCode; writers do not approve their own work.

## Adaptive Model Routing

Route according to task complexity, security risk, model capability, and quota (S22-PO-9 rule 5).

- **Routing rules:** Routing follows the PO rules in this section (S36-PO-5, which records S36-PO-4 items 3 and 4). The PO's delegation preferences (S36-PO-3 section 1) are preferences, not hard rules; the architect keeps them outside the repository. Any change to routing, including adding, removing, or reordering a model or fallback, needs PO approval before use. The earlier fixed model pool and D-27 tier sequence (S22-PO-9 rule 2; S25-PO-4; S25-PO-9; D-27) are superseded for model selection only by S36-PO-3, S36-PO-4 and S36-PO-5; their history remains in the constitution's sync reports and the decision register.
- **Luna routes:** Codex Luna is primary. `opencode-go/gpt-6-luna` is a fallback only when Codex Luna quota is exhausted; return to Codex Luna when quota is restored. Verify provider/model capability and security before using the fallback. No gate is weakened by either route (S36-PO-4 item 4; S36-PO-5).
- **Retained tier rules:** Sol High and xhigh remain prohibited (D-27). Sol Medium is used exclusively for the mandatory independent Spec Kit spec/plan critique, not for implementation or routine reviews, and each invocation requires the explicit PO approval of S13 session 14 (S36-PO-5). For the mandatory independent feature-critic role, the PO ruled (S30-PO-8 Q15, verbatim; it stays in force, and S36-PO-2 later authorized Sonnet 5.5 critiques for F16 and F4 by explicit PO authorization):
  > Q15: Keep Sol Medium as the mandatory independent feature critic. Preserve the existing S13 rule requiring my explicit approval for each Sol invocation. Do not substitute Luna or other models, and do not skip critiques.
  > Obtain PO approval before each critic invocation. Without approval, do not skip the critique; hold feature acceptance until the approved critique is complete. A critic other than Sol Medium requires explicit PO authorization naming it. If no approved model is available for a task or for the critic role, stop and ask the PO; do not use a model the PO has not approved for that role (D-27; S36-PO-5).
- **Performance records:** Keep one performance-log row per delegation, including model, effort, task class, outcome, review notes, and cost (D-27).
- **Development data and routing:** All development AI agents must use synthetic/test data only; no real client data may be shared during development or testing. High-risk work (listed below) is routed as follows (S36-PO-5): Luna is preferred; Haiku is allowed only with independent Luna or Claude review, and only after the formal constitution amendment (PR #48) is merged. No other model receives high-risk work unless the PO approves it before use. The earlier Luna High or Sol Medium list (S31-PO-7 Q6) is superseded for model eligibility only by S36-PO-5. The PO clarification follows (S31-PO-8):
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
- **Secrets and sensitive tasks:** Free models receive no secrets or sensitive tasks (S13 PO Kilo guardrail); third-party/free models receive no secrets or `.env` values (S22-PO-9; S29-PO-3 Q3). This guardrail is unchanged: the high-risk routing rule above names Luna and Haiku only, so it approves no free model for sensitive or high-risk tasks.
- **High-risk work:** Security, Auth, RLS, SECURITY DEFINER, migrations, admission, Storage policies, and financial logic require independent architect review and executed mutation tests. Never expand sensitive permissions without PO approval (S29-PO-3 Q3).
- **Hero assignment:** MiniMax's assignment to remaining Hero Glisse work supersedes S28-PO-5's Big Pickle assignment for that remaining work only (S29-PO-1).

## Mandatory Spec Debate

1. The architect drafts the feature spec and architecture.
2. An independent critique by a model other than the spec's author challenges the spec and architecture for every feature (S30-PO-8 Q15; S36-PO-5). Sol Medium is used exclusively for this critique. Each invocation requires explicit PO approval; do not use a critic the PO has not approved or skip a critique. If approval is absent or no approved critic is available, stop and ask the PO and hold feature acceptance until the approved critique is complete.
3. The architect responds once by default. Additional rounds are only for significant unresolved
   issues.
4. The architect incorporates the critique and presents unresolved product/design decisions to the
   PO.
5. Implementation starts only after PO approval and completion of the plan and tasks. AI agreement
   never replaces PO approval. The architect remains the final technical authority.

## Controlled Parallel Development

- Use at most eight concurrent delegated agents (the orchestrating architect is not counted), of which at most five may write to pull requests at the same time (S37-PO-15). On-demand slots include the PO-approved Sol Medium critique, which keeps its per-invocation PO approval.
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
independent review of the actual diff and green relevant CI on the exact head; an AI review is optional.
The content must still pass the complete main merge gate below in the parent feature PR before any
merge into `main`. This process does not replace or bypass that gate (D-26).

- For local Supabase status checks, use [scripts/supabase-status-safe.mjs](../scripts/supabase-status-safe.mjs) with an absolute `--workdir` and expected project/API/DB values; it emits only `apiUrl` (origin), `dbPort`, and `projectId`. Never print raw status output.

## Main merge gate

Before any merge to `main`, require three independent executed successful full CI attempts on the exact PR head. AI review timing does not affect the CI count. Non-docs-only PRs may use three sequential full `pull_request` attempts/reruns or one full `pull_request` run plus two concurrent full `workflow_dispatch` runs. For docs-only PRs, count three full `workflow_dispatch` runs; a docs-only `pull_request` run that skips integration or storage does not count. A docs-only PR changes only lowercase Markdown files under `docs/`, `specs/`, or `.specify/`, or root `README.md` or `CHANGELOG.md`; both rename endpoints must qualify. Any other path or path-detection error uses the ordinary full-CI forms. workflow_dispatch always runs full CI.

For every counted attempt, record run ID, attempt, and source; all required jobs must conclude `success` and have executed steps greater than zero. A partial rerun retaining earlier jobs does not count. Required jobs are `validate`, all three `integration-shard` matrix executions, the `integration` aggregator, and `storage`; `validate` includes `check:secrets`. A zero-step job is NOT EXECUTED. Infrastructure failures are recorded and never counted; rerunning a failed non-counted infrastructure attempt is allowed. A code failure voids that head until fixed. Once three attempts count for an unchanged head, do not rerun CI.

For `pull_request`, require the matching PR number, run `head_sha == headRefOid`, and `github.event.pull_request.head.sha == headRefOid`. Record the event head SHA source and `GITHUB_SHA` separately as the merge-result SHA; verify that merge-result commit has the PR head and current base commit as parents. For `workflow_dispatch`, require the CI workflow identity, `workflow_dispatch` event, run ref equal to the PR base branch, an identical `ci.yml` blob at the dispatch ref and tested merge result, matching PR and full head SHA inputs, and the checked-out `refs/pull/<n>/merge` commit's second parent equal to `headRefOid`. All required jobs in each attempt must log identical PR, head, and merge-result SHAs. The dispatch workflow definition must match the tested merge result. If `main` advances, reevaluate against the new merge result. Gate-check d verifies exact-head provenance and identical logged revisions across required jobs in executed `pull_request` attempts. Record PR-head and merge-result SHAs in the PR body or report. CI evidence counts only when `.github/workflows` at the exact PR head equals the base branch, or every workflow change is listed in the PR body and reviewed by the AI reviewer (if used) and architect.

AI PR reviews are optional and provider-independent. At most one AI review per provider may be requested for an unchanged exact head. AI review is not a required CI job or check. When an AI review is used on the exact head, fix every actionable finding or answer it with evidence, resolve every blocker, and leave zero unresolved review threads before merge. Do not repeat an AI review on an unchanged head. With an AI review on the exact SHA and all live gates satisfied, the existing standing-approval rule applies to normal PRs after independent architect review of the full diff and evidence on that same SHA; record `po_approved_head`, recheck before merge, and report after merge. Without an AI review on the exact SHA, require explicit PO approval of that exact SHA in the form `merge #N at <sha>`. A PR changing `.specify/memory/constitution.md` always requires explicit PO approval of its exact SHA, regardless of review. A head change voids approval; re-satisfy applicable gates and obtain approval for the new SHA.

Keep the Absolute PO Decision Rule, Spec Kit gate, security gates, agent limits, threads-resolved gate when review findings exist, and independent architect review. Branch protection required checks and gate-check tool changes are PO admin/follow-up work outside this repository change. Owner-only branch protection remains the PO admin step. No writes to `main` may occur between the final live recheck and merge. If `main` moved, re-verify all gates. Never use `--admin`, `--auto`, `--delete-branch`, or bypass branch protection. Branch protection returns 403 on the current private Free plan, so this gate is process-only.

## Brief and implementation conventions

- A brief starts with the shared preamble or clearly identifies itself as a delta from it. The
  preamble covers worktree/branch, tests-first RED→GREEN, forward-only migrations, explicit staging,
  open decisions, and the required report.
- Follow tests-first RED→GREEN and use forward-only migrations.
- Stage only explicitly named files; never use `git add -A`.
- Commit trailers use `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` when the brief
  requires it.
