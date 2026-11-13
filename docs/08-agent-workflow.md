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
  zero open ambiguities before implementation, recorded explicitly, never assumed. Before implementation, the current Analyze must be dated after the latest spec, plan, or task change and have zero open CRITICAL or HIGH findings; CI enforces this date order. Review-fix rounds that change only code or tests (no spec, plan or tasks edits) need no new Analyze. When only task status or traceability evidence changes, re-dating Analyze is a date update recording that no requirement text changed; a full Analyze is required only when FR/SC/acceptance or plan design text changes. Unresolved product
  decisions are presented as numbered MCQs with options, implications, and a recommendation; wait for
  explicit PO approval. (S29-PO-2; S29-PO-3 Q1-Q2, Q1 tightened by S37-PO-1 Q1)
- **Delegated agents (Codex, or OpenCode for the GLM tier) own implementation and Git operations.** They own bounded implementation and checks. Codex may delegate eligible low-risk work through OpenCode; writers do not approve their own work.

## Adaptive Model Routing

Route according to task complexity, security risk, model capability, and quota (S22-PO-9 rule 5).

- **Routing rules:** Routing follows the PO rules in this section (S36-PO-5, which records S36-PO-4 items 3 and 4). The PO's delegation preferences (S36-PO-3 section 1) are preferences, not hard rules; the architect keeps them outside the repository. Any change to routing, including adding, removing, or reordering a model or fallback, needs PO approval before use. The earlier fixed model pool and D-27 tier sequence (S22-PO-9 rule 2; S25-PO-4; S25-PO-9; D-27) are superseded for model selection only by S36-PO-3, S36-PO-4 and S36-PO-5; their history remains in the constitution's sync reports and the decision register.
- **Luna routes:** Codex Luna is primary. `opencode-go/gpt-6-luna` is a fallback only when Codex Luna quota is exhausted; return to Codex Luna when quota is restored. Verify provider/model capability and security before using the fallback. No gate is weakened by either route (S36-PO-4 item 4; S36-PO-5).
- **Retained tier rules:** Sol High and xhigh remain prohibited (D-27). Sol Medium is used exclusively for the mandatory independent Spec Kit spec/plan critique, not for implementation or routine reviews, and each invocation requires the explicit PO approval of S13 session 14 (S36-PO-5). For the mandatory independent feature-critic role, the PO ruled (S30-PO-8 Q15, verbatim; it stays in force, and S36-PO-2 later authorized Sonnet 5.5 critiques for F16 and F4 by explicit PO authorization):

  > Q15: Keep Sol Medium as the mandatory independent feature critic. Preserve the existing S13 rule requiring my explicit approval for each Sol invocation. Do not substitute Luna or other models, and do not skip critiques.

  Obtain PO approval before each critic invocation. Without approval, do not skip the critique; hold feature acceptance until the approved critique is complete. A critic other than Sol Medium requires explicit PO authorization naming it. If no approved model is available for a task or for the critic role, stop and ask the PO; do not use a model the PO has not approved for that role (D-27; S36-PO-5).

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

- Use at most nine concurrent delegated agents (the orchestrating architect is not counted), of which at most five may write to pull requests at the same time (S48-R28). On-demand slots include the PO-approved Sol Medium critique, which keeps its per-invocation PO approval.
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

CI runs on pushes to `main` and through `pull_request` for PR heads; feature-branch pushes do not create duplicate push runs. Superseded pull request runs are canceled by PR-scoped concurrency, while main pushes use unique ref-plus-run-ID groups and are neither canceled nor replaced by that policy. A required-input `workflow_dispatch` runs the same CI against `refs/pull/<n>/merge`; it fails before checks unless the merge result second parent matches the supplied full head SHA. Secret-bearing jobs reject fork PR dispatches before dependency installation or untrusted code execution. Dispatch runs use the PR base branch's trusted workflow ref, whose `ci.yml` blob must match the tested merge result; all required jobs must log the same PR, head, and merge SHAs. Dispatch runs use unique non-canceling concurrency groups. Integration tests run in three required matrix executions under job id `integration-shard`, displayed as `integration shard 1/3` through `3/3`; all shards together cover the full suite. Each shard also runs its own file-level Playwright browser partition (`--shard=<k>/3`, `--workers=1`, no retries, unedited spec files) with the same stack, Vault, Storage-readiness, Docker and environment preconditions in every shard; each shard asserts its `--list --shard=<k>/3` selection is non-empty and records full Playwright and Vitest inventories. The required job id/name `integration` is an always-run aggregator that succeeds only when the matrix succeeds, compares the PR/head/merge tuples exported by all three shards, and logs their shared tuple. It also downloads every shard's Playwright and Vitest JSON reports and fails closed unless the union of reported Playwright tests and Vitest integration files equals the full inventory exactly once (no duplicates or gaps), skips stay within the documented 38-identity baseline (24 Stack-C-only exercise tests plus 14 static shell project guards), and no test failed, flaked or reported errors. It does not compare revisions from `validate` or `storage`; gate-check d enforces exact-head provenance and identical logged revisions across required jobs in executed `pull_request` attempts. For main pushes, it allows empty PR/head fields and validates the common merge SHA. For each merge candidate, require one executed successful full attempt on the exact final PR head: either a sequential `pull_request` attempt/rerun or one `workflow_dispatch` run of the same CI workflow under the existing dispatch-validity rules. Code failures void that head; infrastructure failures are recorded and never counted. The required jobs are `validate`, all three `integration-shard` executions, the `integration` aggregator, and `storage`; the secret scan remains in `validate`.

Before asking the PO to approve a merge to `main`, require items 1-6 on the exact PR head:

1. When an AI review is used, it is on the exact PR head (`commit_id == headRefOid`); every actionable finding is fixed or answered with evidence and every blocker is resolved.
2. AI PR reviews are optional and provider-independent; no provider review approval or required provider check is a merge gate.
3. When an AI review exists, there are zero unresolved review threads and all actionable findings are resolved.

For an AI review on the exact PR head, a BLOCKING finding is P0/P1, or any finding about security, authorization/RLS, data loss or corruption, money math, privacy, a failing or missing test for changed behavior, or a spec/FR contradiction, and it must be fixed in the current round with a test. A NON-BLOCKING finding is P2/P3, a nitpick, style, refactor, or "consider" suggestion, and is not fixed in the PR: reply once "Deferred to backlog: <backlog id>", append it to `~/.lifter/backlog/review-deferred.md`, then resolve the thread, which satisfies "answer it with evidence". Uncertain severity is decided by the architect and recorded, never silently downgraded. At most two AI-review rounds per PR (one provider per round); if blocking findings remain after round two, stop and the PO decides. Never request a review with known unaddressed BLOCKING findings; one push per round.

At most one AI review per provider may be requested for an unchanged exact head. An AI review is not a required CI job or check. Do not repeat an AI review on an unchanged head or rerun CI after the counted green while the current merge-result tree remains equal to the validated tree of the counted attempt; reruns of recorded infrastructure-failed, non-counted attempts remain allowed. A review on another SHA does not qualify as a review on the exact head.

4. Gate: one successful full attempt on the exact same head SHA. It may be a sequential `pull_request` attempt/rerun, or one `workflow_dispatch` run of the same CI workflow under the existing dispatch-validity rules. For each dispatch, launch from the PR base branch's trusted workflow ref; verify the run's workflow ref is that base branch and the `ci.yml` blob at the dispatch ref matches the tested merge result. Verify the PR input matches, `head_sha` input equals `headRefOid`, the run checked out `refs/pull/<n>/merge`, and the logged merge SHA second parent equals `headRefOid`. All required jobs in a dispatch attempt must log the same PR, head SHA, and merge-result SHA. Each attempt must have successful executed `validate`, all three `integration-shard` jobs, the `integration` aggregator, and `storage`; validate must include the secret scan. For executed `pull_request` attempts, gate-check d verifies exact-head provenance and identical logged revisions across every required job. The aggregator itself compares and logs the shared tuple from the three integration shards. A code failure voids that head until fixed; infrastructure failures (e.g. Docker Hub `toomanyrequests`) are recorded and never counted. A test failure that passes on rerun is a flake, recorded and reported; it still requires one clean counted run and is never masked. Feature-branch push events do not create duplicate push runs. Agent-reported local results never substitute. Claude (architect) does not run tests or Git writes and verifies the exact head, execution, and conclusions.

Detailed execution and provenance requirements retained from the branch version:

Gate: one executed successful full attempt on the same exact PR head using either allowed event pattern. The attempts on the exact PR head must complete successfully and required security checks must be green. The required CI jobs are `validate`, all three `integration-shard` matrix executions, the `integration` aggregator, and `storage` from the main CI workflow; also require the `check:secrets` security scan in `validate`. Update this authoritative list in the same PR as any workflow job rename or removal (S31-R6). For each run, record run ID, attempt, source, merge SHA `M`, tree `T = git rev-parse M^{tree}`, and base SHA; require every required job to conclude `success` and have a substantive executed step count greater than zero; a zero-step job is NOT EXECUTED. Each attempt must have its own `validate`, all three shard jobs, the `integration` aggregator (which compares and logs the shared PR/head/merge tuple exported by the shards), and `storage` records with executed steps (partial reruns retaining prior jobs do not count). For `pull_request`, require matching PR number, run `head_sha == headRefOid`, and `github.event.pull_request.head.sha == headRefOid`; record source for these values and `GITHUB_SHA` (the merge-result SHA), and verify `M` has the exact PR head as its second parent and recorded base SHA as its first parent. Gate-check d enforces identical logged revisions across every required job in executed `pull_request` attempts. For `workflow_dispatch`, require the CI workflow, matching PR and full head SHA inputs, launch from the PR base branch, compare the `ci.yml` blob at the run SHA with the tested merge result, read the logged PR/head/merge values, verify `M` has `headRefOid` as parent 2 and the recorded base SHA as parent 1, and require identical revision values across all required jobs. Record PR-head and merge-result SHAs in the PR body or report (S30-R10). A counted green remains valid while the current merge result for that exact head has a tree equal to its recorded `T`; therefore a `main` advance alone does not trigger reruns. Immediately before merge, require GitHub to report `refs/pull/<n>/merge` as `MERGEABLE`; record its current merge SHA, tree `T'`, and base tip. Verify its second parent is the exact PR head, its first parent is the current base tip, and `T'` equals every counted `T`. If the head changes, any tree differs, the merge ref cannot be computed, or mergeability is `UNKNOWN`/`CONFLICTING`, fail closed and require one fresh executed attempt after a valid current merge result is available. An old `pull_request` rerun tests the old merge SHA and does not count for a changed result; use a fresh `pull_request` event or fresh dispatches. Recheck immediately before merge and make no writes to `main` between that recheck and merge. CI evidence counts only when `.github/workflows` at the exact PR head equals the base branch, or every workflow change is listed in the PR body and reviewed by the AI reviewer (if used) and the architect before evidence is accepted. Owner-only branch protection remains the PO admin step (S31-R4). Agent-reported local results never substitute. Claude (architect) does not run tests or Git writes and verifies every counted run. The exact-merge-commit `head_sha` check for a main-branch push is post-merge verification, outside pre-approval items 1-6.

5. The architect has independently reviewed the actual diff and evidence.

6. The isolation gate, money gate, AR and EN UI check, log-scrub check, and acceptance criteria verified against [01-traceability.md](01-traceability.md) are satisfied. For high-risk work, executed mutation evidence (file:line kill, restore, diff exit 0) is recorded in the feature's reports/verification file and referenced from `traceability.md` (S30-R10; S29-PO-3 Q3). Record the tested commit SHA and Node, Vitest/Playwright, and PostgreSQL image versions. Evidence carries to a later head only with diff proof that the mutated source, its tests, and defining migrations are unchanged; otherwise rerun the mutation evidence (S31-R5).

For a normal PR, standing PO approval applies only when an AI review exists on the exact head, all applicable live gates pass, and an independent architect review of the full diff is recorded for that SHA; after C1.15 it also covers docs-only PRs and PRs that hit the R2 two-round cap after the PO's decision. The merge lane records `po_approved_head` as that reviewed SHA and reports to the PO after merge. Without an AI review on the exact head, require explicit PO approval of that exact SHA in the form `merge #N at <sha>`. Standing approval never covers a PR that changes `.specify/memory/constitution.md`, `.github/workflows/**`, branch protection, secrets handling, or production configuration, or that has an open PO-DECISION-NEEDED; such a PR always requires the PO's explicit exact-SHA command `merge #N at <sha>`. A PR that changes `.specify/memory/constitution.md` is always excluded and requires explicit PO approval of its exact SHA. Immediately before merging, recheck all gates and `po_approved_head == headRefOid`; merge with `gh pr merge <n> --merge --match-head-commit <po_approved_head>`. Any head change voids the recorded SHA; for a normal PR, rerun the gates and obtain a fresh independent full-diff architect review. Standing approval on the new head applies only if an AI review exists on that new head; otherwise require explicit PO approval of the new SHA. For a constitution-changing PR, new explicit PO approval of the exact new SHA is required.

7. Merge only after that approval, immediately re-checking items 1-6 and `po_approved_head == headRefOid`. No writes to `main` may occur between the final live recheck and the merge; re-verify the current merge tree as specified in item 4. A `main` advance requires fresh CI only when the current merge tree differs from a counted tree; equal trees preserve the greens. Any head change voids the recorded approval SHA. For a normal PR, re-satisfy items 1-6 and obtain a fresh independent full-diff architect review on the new head. Standing approval on that new head applies only if an AI review exists on that new head; otherwise explicit PO approval of the new SHA is required. For a constitution-changing PR, obtain explicit PO approval of the exact new SHA after the fresh gates and review. An old `pull_request` rerun re-tests its original merge SHA and does not count for a changed result. Use `gh pr merge <n> --merge --match-head-commit <po_approved_head>`.

Never use `--admin`, `--auto`, `--delete-branch`, or bypass branch protection. Branch protection returns 403 on the current private Free plan, so this gate is process-only.

## Brief and implementation conventions

- A brief starts with the shared preamble or clearly identifies itself as a delta from it. The
  preamble covers worktree/branch, tests-first RED→GREEN, forward-only migrations, explicit staging,
  open decisions, and the required report.
- Follow tests-first RED→GREEN and use forward-only migrations.
- Stage only explicitly named files; never use `git add -A`.
- Commit trailers use `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` when the brief
  requires it.
