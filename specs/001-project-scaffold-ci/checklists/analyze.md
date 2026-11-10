# F1 001-project-scaffold-ci - Analyze (S34 main merge reconciliation)

## S40 pre-implementation analysis (Playwright e2e sharding)

**Date**: 2026-11-09 14:33 UTC (after the S40 edits to spec.md, plan.md and tasks.md). **Scope**: FR-025, FR-026, SC-014, SC-015, User Story 5 scenario 8, T024.

- [x] `spec.md` has numbered FRs (FR-025, FR-026), measurable SCs (SC-014, SC-015) and a Given/When/Then scenario (US5.8) for the touched scope.
- [x] Clarifications record the byte-exact S39-PO-3 authority and state explicitly: **No open ambiguities** remain.
- [x] `plan.md` has an S40 Playwright sharding section covering the touched scope; `tasks.md` has T024 tagged FR-025, FR-026, SC-014 and SC-015.
- [x] This analysis is dated after the last spec/plan/tasks change and finds 0 open CRITICAL/HIGH findings.

### Findings

- File-level sharding is the only safe partition: the S39 audit (sections 3, 7) shows `fullyParallel` would break `branding-production-ui` declaration order and `client-accounts` shared tokens, shared server-log slice and the kong stop/start fault test. FR-025 therefore fixes file shards, `--workers=1`, no retries and unedited specs.
- Shard composition is authoritative from the tree: 282/156/191 = 629, all non-empty (N=5 was shown empty in the audit, hence N stays 3). Banner-loaded (273 tests) is one indivisible group, so shard 1 remains the longest; the expected critical path is bounded by shard 1's Vitest step plus ≈6 min of browser tests versus the 13.8 min single-job e2e step, so SC-015 is achievable without splitting the banner spec.
- Every shard needs the audit's §2.1/§2.2/§2.4 preconditions because the hidden 5.6 min integration warm-up disappears: Vault provisioning with `SIGNUP_*` export, `scripts/wait-storage-ready.mjs`, and a Docker CLI/daemon check for the kong fault test. One Playwright invocation per shard keeps exactly one `webServer` and a per-shard U8 manifest; `U8_SERVER_LOG_RUN_ID` must never be preset.
- Coverage proof is possible without checkout: shard jobs upload Playwright full/shard `--list` inventories, Vitest full file inventory, and the JSON run reports; the aggregator downloads artifacts and compares identities (`file::project::title path`) and Vitest file sets. Missing artifacts fail the download step, so the proof cannot silently pass.
- Skip baseline is exact and reproducible: 24 `exercise-library-production` tests skip via `beforeAll` on Stack A (the whole file, all 24 listed identities), and 14 `shell` project-guard skips are static; the ceiling is 38 with a documented identity allowlist. Environment regressions surface as new skip identities or as failures.
- Existing aggregator properties are preserved: `contents: read`, no checkout, no repository-configured secrets, and no Docker Hub credentials; its artifact download uses the GitHub-provided per-job `ACTIONS_RUNTIME_TOKEN`; optional Docker Hub pull credentials are job-level environment variables in `integration-shard` and `storage`, intended for authenticated image pulls; the existing success/revision-tuple step is unchanged, and no deployment secrets are used.
- No new secrets, permissions, rulesets or concurrency/dispatch changes; `validate` and `storage` are untouched. No product behaviour changes. **CRITICAL**: none. **HIGH**: none.

**Verdict**: PASS — 0 CRITICAL, 0 HIGH.

## S39 pre-implementation analysis

**Date**: 2026-11-09 05:07:56 UTC (after latest S39 spec, plan, and task updates). **Scope**: FR-022, FR-023, SC-012, T023; required-check name mapping, revision propagation, main-push revision validation, and three integration matrix executions.

- [x] `spec.md` has numbered FRs, measurable SCs, and Given/When/Then coverage for the matrix, aggregator, push event, and exact-once shard scope.
- [x] Clarifications cite the architect ruling for this exact required-check correction; **No open ambiguities** is explicit.
- [x] `plan.md` covers the matrix id and always-run aggregator; `tasks.md` has T023 tagged with FR-022 and FR-023.
- [x] This analysis is dated after the spec/plan/tasks edits and finds 0 open CRITICAL/HIGH findings.

### Findings

- GitHub branch protection requires the exact check name `integration`; matrix display names alone do not supply it. A separate aggregator depending on the matrix with `if: always()` can expose the required name and fail closed on failed, skipped, or cancelled shards. On success it receives unique shard-specific outputs, compares all three PR/head/merge tuples, fails on disagreement, and logs the common values.
- The matrix id change preserves shard display names, setup, test partition, and coverage. The aggregator uses no checkout, no repository-configured secrets (its artifact download uses the GitHub-provided `ACTIONS_RUNTIME_TOKEN`), and no additional stack.
- Required-check documentation, test assertions, and gate evidence must record both the three shard executions and aggregator. GitHub combines outputs from matrix jobs and does not guarantee completion order; unique per-shard output names avoid collisions. Each replica derives the same PR/head/merge values from the existing revision step, and the aggregator compares all three tuples before logging. The exactly-once criterion applies to the three integration-shard executions; the distinct Storage lane can also select tests from the integration config.
- Main `push` events do not provide PR number or PR head SHA. Requiring them unconditionally would break the existing main-push CI path; validate the common merge SHA for push and all three revisions for PR/dispatch.
- No product behavior or security requirement changes. **CRITICAL**: none. **HIGH**: none.

**Verdict**: PASS - 0 CRITICAL, 0 HIGH.

---


## S38 amendment pre-implementation entry check

**Date**: 2026-11-09 02:07:07 UTC (after S38 spec, plan, and task updates for trusted dispatch and fork-secret isolation). **Scope**: FR-021..FR-024, SC-011..SC-013, T020..T022.

- [x] `spec.md` has numbered FRs, measurable SCs, and Given/When/Then scenarios for touched scope. Existing scenarios plus FR-021..FR-024 specify dispatch provenance, three shard coverage, executed-run acceptance, and standing approval constraints.
- [x] Clarifications cite PO source S38-PO-6 mapping (b),(d),(e), S38-PO-7, and S38-PO-8; **No open ambiguities** is explicit in `spec.md`.
- [x] `plan.md` covers dispatch validation, integration sharding, gate-check provenance and preserved security checks; `tasks.md` has T020..T022 tagged with FR IDs.
- [x] This Analyze is dated after the spec/plan/tasks changes and finds 0 open CRITICAL/HIGH findings.

### Findings

- Exact merge-result validation is required before test execution for dispatch events; the workflow prints the evidence values and the runner verifies `HEAD^2`.
- Three shards use Vitest's deterministic shard assignments; locally enumerate full-suite and each shard to assert no omissions/duplicates. Supabase and environment setup plus provisioning remain in every shard. Playwright installation and the full browser suite run only in shard 1.
- Each full attempt must have executed `validate`, all integration shards, and `storage`; gate-check event provenance must bind dispatch merge SHA parent2 to exact head and record run ID/source.
- Dispatch provenance is trusted only from the PR base branch, with the workflow blob equal to the tested merge result; all required jobs log identical revision values. All jobs verify the PR head repository matches the base repository before dependency installation or untrusted code execution. The check uses unauthenticated public repository metadata and adds no permissions or secrets. No open ambiguities; 0 open CRITICAL/HIGH findings remain.
- GitHub only accepts `workflow_dispatch` after the workflow exists on the default branch. Pre-merge evidence for this constitution PR uses sequential `pull_request` runs; dispatch-path proof is post-merge and must not be claimed yet.
- No security gate is being removed or changed. Constitution-editing PRs remain outside standing PO approval.

**Verdict**: PASS — 0 open CRITICAL/HIGH findings. PO decisions are explicit; no product decision is needed.

**Date**: 2026-11-05. **Pass**: post-merge consistency re-analysis for S33 CI optimization (FR-015 to FR-019, SC-006 to SC-009, T016 to T018) and S32 migration-version guard (FR-020, SC-010, US6, T019). Main was merged into the #54 branch after #59 and #55 landed.

## Entry check (LIFTER Spec Kit gate, PO S29-PO-2)

- [x] spec.md has numbered FRs, measurable SCs and Given/When/Then scenarios for both scopes: FR-015 to FR-019 / SC-006 to SC-009 / User Story 5 cover CI efficiency; FR-020 / SC-010 / User Story 6 cover cross-branch migration-version detection.
- [x] Clarifications cite binding S33-PO-4 for CI scope and S32-PO-3 plus S32-R3 for the migration guard; both explicitly state: No open ambiguities.
- [x] plan.md covers both CI optimization and migration guard scopes.
- [x] tasks.md contains unique IDs: T016 to T018 for CI and T019 tagged FR-020/SC-010 for migration guard.
- [x] This analysis is dated after the post-merge spec/plan/tasks edits; findings below have 0 open CRITICAL/HIGH.

## ID collision resolution

The main-side CI requirements retain FR-015 to FR-019 and SC-006 to SC-009, with tasks T016 to T018 and User Story 5. The #54 migration-guard side was renumbered only: FR-015 to FR-020, SC-006 to SC-010, T016 to T019, User Story 5 to User Story 6. References in spec, plan, tasks and traceability were updated. No tests cited feature IDs.

## Findings

- Scope and traceability: CI event/concurrency/browser/storage requirements map to the existing #60 workflow changes and T016 to T018; migration guard FR-020/SC-010 maps to the opt-in script, existing unit tests, and T019.
- No workflow behavior was authored in this conflict resolution; workflow changes come from the already merged main branch. Main CI efficiency requirements remain intact.
- The migration guard remains opt-in detection-only; the in-tree checker and CI wiring remain unchanged. No migration file or product behavior is changed by conflict resolution.
- Clarifications cover both approved scopes; no unresolved product decision or ambiguity was found.
- **CRITICAL**: none. **HIGH**: none.

## Verdict

**PASS - 0 CRITICAL, 0 HIGH.**

- Dispatch trust finding: gate-check requires the run ref to match the PR base branch and the ci.yml blob at that ref to match the tested merge result; all required jobs must log the same PR/head/merge values. The logger already emits those values in validate, every integration shard, and storage. No open ambiguities; 0 open CRITICAL/HIGH findings remain.

## S40 CodeRabbit request 2 follow-up analysis

**Date**: 2026-11-09 11:45 UTC (after the S40 review corrections to spec, plan, and task text). **Scope**: FR-021, FR-023, SC-011, SC-013, T020, T023; authenticate the existing dispatch PR metadata lookup and distinguish PR-run provenance from dispatch workflow-ref provenance.

- [x] `spec.md` retains measurable FR-021/FR-023 requirements and Given/When/Then acceptance scenarios; the mixed-run scenario now requires the PR run on the exact head and applies trusted base-workflow/blob checks to dispatch runs.
- [x] Clarifications and PO approvals remain explicit; **No open ambiguities** remain for this technical review correction.
- [x] `plan.md` covers Bearer authentication of the dispatch metadata lookup using `github.token` under existing `contents: read`; `tasks.md` records this under T020 [FR-021, FR-023].
- [x] This analysis follows the latest spec/plan/task changes. Findings have 0 open CRITICAL/HIGH issues.

### Findings

- Use the workflow-provided `github.token` only to authenticate the existing GET of pull-request metadata in validate, each integration shard, and storage. Keep `contents: read`; do not add permissions or expose the token in logs. Existing fork rejection remains before dependency installation or untrusted execution.
- Preserve `pull_request` provenance as exact PR-head checks. The trusted base-branch workflow ref and matching workflow-blob requirement applies to `workflow_dispatch` attempts.
- Update the focused workflow contract test to require the token binding and Bearer/Accept headers in all three metadata-fetching jobs. No application behavior, schema, or product choice changes.
- **CRITICAL**: none. **HIGH**: none. **No open ambiguities** remain.

### Verdict

**PASS - 0 CRITICAL, 0 HIGH.**
## S41 main-sync reconciliation re-analysis

- Date: 2026-11-09 19:23:34 UTC, after the current-main merge resolution and this reconciliation's spec/plan/task edits.
- Scope: static Spec Kit recheck of the current-main baseline, Clarifications and decision citations, FR/SC/scenario and FR-tagged task cross-references, and the PR #52 compliance edits. Documentation only; no implementation or test task was marked complete, and no tests were executed.
- Result: Entry checks PASS for numbered FRs, measurable SCs and Given/When/Then coverage in this touched scope; plan and FR-tagged task coverage remains present. No new product ambiguity or unapproved behavior was introduced. FR-015..FR-019 cover CI optimization, FR-020 is the migration-version guard, and S33-PO-4 postpones self-hosted runner work.
- Findings: 0 open CRITICAL, 0 open HIGH. Existing medium/low findings, pending approvals, implementation gates and verification status remain as recorded above.
- Verdict: PASS for this documentation-only reconciliation; no task checkbox or verification status changed.

## S41 review-finding re-analysis

- Date: 2026-11-09 19:56:44 UTC, after the spec scope correction.
- Scope: static alignment of the Clarifications entry and Analyze scope: FR-015..FR-019 are CI optimization, FR-020 is the migration-version guard, and S33-PO-4 postpones self-hosted runner work.
- Findings: 0 open CRITICAL, 0 open HIGH. No workflow or task status changed. At the time of this analysis the FR-009 credential wording remained unreconciled and was escalated as S41-MCQ-001 in the run report; S41-R7 resolves it factually in the later analysis below.
- Verdict: PASS for the documentation correction.


## S41-R7 FR-009 documentation re-analysis

- Date: 2026-11-09 20:29 UTC, after final edits to spec, plan, tasks, and research.
- Scope: static Spec Kit recheck of User Story 2 scenario 2, FR-009 and FR-026 credential language, S41-R7 clarification, plan/research descriptions, and FR-tagged task T025. Checked the merged workflow reference at `9b4d7a4c9db0dc0493dbd6419a6fead95290f1dd`; no CI or application behavior was changed. T025 remains unchecked because no tests were run.
- Cross-references: FR-009 is numbered; FR-009 is linked by task T025; `9b4d7a4c9db0dc0493dbd6419a6fead95290f1dd` is the workflow evidence source. No copied PO decision text was changed.
- Findings: 0 open CRITICAL, 0 open HIGH. S41-MCQ-001 is resolved by the architect ruling as a factual reconciliation; **No open ambiguities** remain for this correction.
- Verdict: PASS for this documentation-only reconciliation.

## S41-R12 round-3 PR-wide re-analysis

- Date: 2026-11-09 22:50 UTC (2026-11-10 00:50 Africa/Cairo), recording the state at that time after the round-3 spec edits. The later 23:45 edits are recorded below.
- Scope: statically rechecked this feature's traceability rows and analyze totals, FR/SC/task references, workflow claims, and local links. Rechecked FR-009/FR-021 token wording and FR-022/FR-026 aggregator no-secret boundary against workflow revision 9d24e6444aea5f72ce5dd00e13d3d25c979c8619. The earlier 9b4d7a4c citation is insufficient for separate storage; round-3 spec evidence now points to the later revision.
- Entry gate: PASS - numbered FRs, measurable SCs and GWT scenarios exist; Clarifications explicitly state no open ambiguities for this correction; plan/tasks cover the scope. Traceability rows FR-001..026 and SC-001..015 reviewed. FR-022/SC-012 is PARTIAL because its cited partition script is an external artifact and no committed test asserts the complete partition at this head; FR-024 documentation evidence cites current head ed9f3079. PENDING/platform-gated rows remain pending; no task status changed.
- Traceability review left FR-022/SC-012 PARTIAL and retained FR-024 as documentation-VERIFIED with an explicit current-head commit.
- Findings: 0 open CRITICAL, 0 open HIGH. Static documentation consistency only; no tests or CI were run and no test status was upgraded.
- Verdict: PASS for this documentation-only correction.


## S41 CodeRabbit round-3 correction re-analysis

- Date: 2026-11-09 23:17 UTC, after the credential-boundary edits to plan, research and tasks, FR-024 traceability row correction, and restored baseline source map.
- Scope: verified the credential descriptions against workflow revision `9d24e6444aea5f72ce5dd00e13d3d25c979c8619`; `validate` requires no repository-configured secrets and uses `github.token` only for read-only metadata requests; the `integration` aggregator has no Docker Hub credentials; authenticated pull credentials are limited to `integration-shard` and `storage`. Restored the original FR-001..014 source map without upgrading statuses.
- Result: FR-024 row has five cells; all current amendment rows retain their recorded evidence/status. No tests or CI were run and no task status changed.
- Findings: 0 open CRITICAL, 0 open HIGH.
- Verdict: PASS for these documentation corrections.


## S41 CodeRabbit round-3 final-finding re-analysis

- Date: 2026-11-09 23:45 UTC, after final FR-009 wording edits in spec.md, plan.md, research.md, and tasks.md.
- Scope: rechecked the token boundary against workflow revision 9d24e6444aea5f72ce5dd00e13d3d25c979c8619: actions/checkout@v4 uses its GitHub-provided token for checkout on pull-request and push runs with contents: read; the workflow separately uses github.token for read-only revision/dispatch metadata requests. No repository-configured secrets are required by validate. The integration aggregator has no Docker Hub credentials; optional pull credentials remain limited to integration-shard/storage. FR-009, T025, and plan/research wording agree; T025 remains unchecked because no tests were run.
- Findings: 0 open CRITICAL, 0 open HIGH. Static documentation review; no workflow or application behavior changed. **No open ambiguities** remain for this factual reconciliation.
- Verdict: PASS for this documentation-only correction.

## S42 CodeRabbit round-4 credential-boundary re-analysis

- Date: 2026-11-10 00:55 UTC, after the FR-009, FR-022, FR-026, clarification, plan, research and task edits in this round.
- Scope: rechecked both credential boundaries against workflow revision `9d24e6444aea5f72ce5dd00e13d3d25c979c8619` and the head workflow. (a) `integration-shard` and `storage` declare `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` as job-level `env` (ci.yml lines 111-114 and 524-527), so every step of those two jobs, including `npm ci` and repository test code, can read them; the authenticated-pull restriction is intended use, not step isolation. (b) The `integration` aggregator downloads shard reports with `actions/download-artifact@v4` (ci.yml line 271), which authenticates through the GitHub-provided per-job `ACTIONS_RUNTIME_TOKEN`; earlier shorthand "access no secrets" means no repository-configured secrets, and that token is neither repository-configured nor a Docker Hub credential.
- Cross-references: FR-009, FR-022, FR-026, User Story 2 scenario 2, the S41-R7 clarification, plan constraints and S39/S40 sections, research, T012 and T025 now state the same boundary. The earlier "no secret access" shorthand in this file and in round-3 sections is defined by this entry as no repository-configured secrets. No PO decision text was changed; T025 remains unchecked because no tests were run.
- Findings: 0 open CRITICAL, 0 open HIGH. Static documentation review only; no workflow, test, or application behavior changed. **No open ambiguities** remain for this factual reconciliation.
- Verdict: PASS for this documentation-only correction.


## S42 CodeRabbit full-review token-scope re-analysis

- Date: 2026-11-10 03:04 UTC, after the round-4 second-batch FR-022/FR-026 wording correction.
- Scope: rechecked the `ACTIONS_RUNTIME_TOKEN` description against the Actions runtime behaviour used by `actions/download-artifact@v4` (ci.yml line 271). The token is a per-job GitHub Actions runtime token that is not limited to the artifact service (the same runtime token also authenticates Actions cache requests), so FR-022 and FR-026 no longer claim an artifact-only scope. Both keep "no repository-configured secrets", `contents: read` and no checkout. The S42 credential entries above remain otherwise accurate; the Docker Hub job-level env description is unchanged.
- Cross-references: FR-022, FR-026, plan aggregator steps, research, T012/T025 and the earlier S42 analyze entry agree. No PO decision text changed.
- Findings: 0 open CRITICAL, 0 open HIGH. Static documentation review only; no workflow, test, or application behavior changed. **No open ambiguities** remain for this factual reconciliation.
- Verdict: PASS for this documentation-only correction.
