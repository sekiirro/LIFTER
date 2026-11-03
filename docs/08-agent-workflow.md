# LIFTER - Agent Workflow (PO-approved 2026-10-28; adaptive routing amended 2026-10-29, D-27)

These rules govern agent dispatch, design/spec work, parallel development, and merge preparation.
The Constitution remains authoritative. The [Frontend Design Gate](09-frontend-design-gate.md)
applies to every unit that changes rendered UI.

## Roles

- **Claude - architect, orchestrator, independent reviewer.** Drafts briefs and technical designs,
  manages dependencies and merge order, reviews actual diffs and evidence, and presents unresolved
  product or design decisions to the PO. Claude may independently run read-only verification commands
  (Git read commands, `gh` read queries, `docker inspect`, and SELECT-only database reads). Claude
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

Use the current PO-approved model and agent allocation records. High-risk work (security, Auth, RLS,
SECURITY DEFINER, migrations, admission, Storage policies, and financial logic) requires independent
architect review and executed mutation tests; never expand sensitive permissions without PO approval.
Third-party/free models must not receive secrets or `.env` values. PO-approved free-model use excludes
secrets, client data, and sensitive tasks (S13; S29-PO-3 Q3). Model-routing details and eligibility
require PO source support; see the S30 compliance report for any item still needing source confirmation.

- **Free/third-party models:** Never provide secrets or `.env` values; S13 also excludes client data
  and sensitive tasks from PO-approved free-model use. S29-PO-3 Q3 requires independent architect
  review and executed mutation tests for high-risk work. Do not expand sensitive permissions without PO
  approval. Specific model/task eligibility must follow an explicit PO source; do not infer it from
  agent capacity or prior technical recommendations.
- Current Luna/MiniMax assignments and remaining Hero work follow the latest PO records (S25-PO-9 and S29-PO-1). Do not generalize a feature-specific assignment into a global model-risk rule.
- If the applicable PO source does not establish model eligibility or escalation, record a PO-decision-needed item and do not route that task based on inference.

## Mandatory Spec Debate

1. The architect drafts the feature spec and architecture.
2. An independent Sol Medium critique challenges the spec and architecture.
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

Before asking the PO to approve a merge to `main`, require items 1-5 on the exact PR head:

1. A completed CodeRabbit review is APPROVED on the exact PR head (`commit_id == headRefOid`), with no later CHANGES_REQUESTED or DISMISSED review.
2. PR `reviewDecision` is APPROVED.
3. There are zero unresolved review threads and all actionable findings are resolved.
4. Both GitHub Actions CI runs for the PR head are completed with success, and required security checks are green: the `push`-event run with `headSha == headRefOid` is the independent, non-author rerun of typecheck, lint, unit, and applicable integration/e2e gates; the `pull_request`-event run checks the merge result with current `main`. Agent-reported local results never substitute. Claude (architect) does not run tests or Git writes and verifies both runs.
5. The architect has independently reviewed the actual diff and evidence.

Then ask the PO for explicit merge approval and record the approved head SHA with that approval.

6. Merge only after that approval, immediately re-checking items 1-5 and `po_approved_head == headRefOid`. If the head changed after PO approval, the approval lapses; re-satisfy items 1-5 on the new head and obtain new explicit PO approval. Use `gh pr merge <n> --merge --match-head-commit <po_approved_head>`.

Never use `--admin`, `--auto`, or `--delete-branch`. Branch protection returns 403 on the current private Free plan, so this gate is process-only.

## Brief and implementation conventions

- A brief starts with the shared preamble or clearly identifies itself as a delta from it. The
  preamble covers worktree/branch, tests-first RED→GREEN, forward-only migrations, explicit staging,
  open decisions, and the required report.
- Follow tests-first RED→GREEN and use forward-only migrations.
- Stage only explicitly named files; never use `git add -A`.
- Commit trailers use `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` when the brief
  requires it.
