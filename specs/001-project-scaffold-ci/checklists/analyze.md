# F1 001-project-scaffold-ci - Analyze (S34 main merge reconciliation)

## S39 pre-implementation analysis

**Date**: 2026-11-09 05:07:56 UTC (after latest S39 spec, plan, and task updates). **Scope**: FR-022, FR-023, SC-012, T023; required-check name mapping, revision propagation, main-push revision validation, and three integration matrix executions.

- [x] `spec.md` has numbered FRs, measurable SCs, and Given/When/Then coverage for the matrix, aggregator, push event, and exact-once shard scope.
- [x] Clarifications cite the architect ruling for this exact required-check correction; **No open ambiguities** is explicit.
- [x] `plan.md` covers the matrix id and always-run aggregator; `tasks.md` has T023 tagged with FR-022 and FR-023.
- [x] This analysis is dated after the spec/plan/tasks edits and finds 0 open CRITICAL/HIGH findings.

### Findings

- GitHub branch protection requires the exact check name `integration`; matrix display names alone do not supply it. A separate aggregator depending on the matrix with `if: always()` can expose the required name and fail closed on failed, skipped, or cancelled shards. On success it receives unique shard-specific outputs, compares all three PR/head/merge tuples, fails on disagreement, and logs the common values.
- The matrix id change preserves shard display names, setup, test partition, and coverage. The aggregator uses no checkout, secrets, or additional stack.
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
