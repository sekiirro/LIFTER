# LIFTER - Agent Workflow (PO-approved 2026-10-28; adaptive routing amended 2026-10-29, D-27)

These rules govern agent dispatch, design/spec work, parallel development, and merge preparation.
The Constitution remains authoritative. The [Frontend Design Gate](09-frontend-design-gate.md)
applies to every unit that changes rendered UI.

## Roles

- **Claude - architect, orchestrator, independent reviewer.** Drafts briefs and technical designs,
  manages dependencies and merge order, reviews actual diffs and evidence, and presents unresolved
  product or design decisions to the PO. Claude does not code or run Git, tests, or Docker; read-only
  `gh` inspection is allowed.
- **Codex - implementer and Git operator.** Owns bounded implementation, authorized Git operations,
  and checks. It may delegate eligible low-risk work through OpenCode; writers do not approve their
  own work.

## Adaptive Model Routing

Choose the cheapest capable reliable model allowed by the task's risk and sensitivity. Escalate
GLM -> Luna -> Sol when capability or reliability evidence requires it; do not down-route a sensitive
or high-risk task.

- **GLM 5.3 Flash free:** `opencode/glm-5.3-flash-free` through OpenCode using the
  `opencode-delegate` skill, only for simple, low-risk, non-sensitive tasks. Never use it for secrets
  or `.env`, Auth, RLS, SECURITY DEFINER, migrations, admission, Storage policies, financial logic,
  CI configuration, Docker, Supabase, DB work, or unreviewed pushes.
- **Luna High:** `gpt-6-luna` at `high` is the standard for moderate work and tasks not suited to GLM.
- **Sol Medium:** `gpt-6.1-sol` at `medium` is for complex, security-sensitive, or otherwise high-risk
  work, including spec-debate critiques. Record a one-line reason for each Sol dispatch.
- **Prohibited:** Sol High and any `xhigh` effort. The maximum tier is Sol Medium.
- Record selected and actual model, effort, task class, escalation, and outcome in a dated
  performance-log entry in the task handoff. Verify actual model and effort in each delegation result.

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

- Use no more than six concurrent agents total, including architects and reviewers.
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

## Main merge gate

Before asking the PO to approve a merge to `main`, require items 1-5 on the exact PR head:

1. A completed CodeRabbit review is APPROVED on the exact PR head (`commit_id == headRefOid`), with no later CHANGES_REQUESTED or DISMISSED review.
2. PR `reviewDecision` is APPROVED.
3. There are zero unresolved review threads and all actionable findings are resolved.
4. Both GitHub Actions CI runs for the PR head are completed with success, and required security checks are green: the `push`-event run with `headSha == headRefOid` is the independent, non-author rerun of typecheck, lint, unit, and applicable integration/e2e gates; the `pull_request`-event run checks the merge result with current `main`. Agent-reported local results never substitute. Claude (architect) does not run tests or git and verifies both runs.
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
