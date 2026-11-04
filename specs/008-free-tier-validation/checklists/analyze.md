# Analyze: F8 Free-tier Validation Prep

- **Date:** 2026-11-03
- **Analyzed revisions:** baseline `f08ee556eb22f6b33ddd4297251e868ea82e1a16`; final evidence review `0449b10075254be9bd31ce6296cf0404abea63d8` (includes the Clarifications and task scope tags). This follow-up clarifies tag semantics without changing requirements, evidence status, or task completion.
- **Scope:** static consistency and evidence review; no tests, deployments, cloud queries, or stack actions performed.
- **Inventory:** `spec.md` (FR-001..008, SC-001..004, scenarios, ND-F8-1..3), `plan.md`, `tasks.md`, `checklists/requirements.md`, scripts/tests/report/quickstart; the baseline had no feature-level `checklists/analyze.md` or `traceability.md`, which this S30 reconciliation adds.

## Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F8-A01 | MEDIUM | `spec.md:80` | ND-F8-1: pilot volume inputs are not sourced; projection must remain missing rather than guessed. | Preserved and escalated as SK-008-01. |
| F8-A02 | MEDIUM | `spec.md:81` | ND-F8-2: deployment target/approval remains open; feature scope expressly prohibits deployment. | Preserved and escalated as SK-008-02; no cloud action taken. |
| F8-A03 | MEDIUM | `spec.md:82` | ND-F8-3: permission to use a dedicated test account for authenticated route measurement remains open. | Preserved and escalated as SK-008-03; authenticated external measurement remains blocked. |

## Coverage and consistency

- FR-to-task mapping: 8/8. SC-to-task mapping: 4/4. Task FR/SC tags describe implementation scope; they do not identify evidence owners. `traceability.md` maps each criterion to cited evidence and may list a different task ID. No task checkbox changed.
- The Clarifications entry preserves preparation-only scope and all missing inputs/approvals.
- Static checks/tests were inspected; no tests, local stacks, cloud APIs, or deployments were run. Historical checked tasks T010/T011 are not re-executed here.

## Verdict

**PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 3 MEDIUM; 12/12 FR/SC items mapped. Static evidence only.

## S31 round 6 refresh

- **Date:** 2026-11-04
- **Reviewed after:** S31-PO-4 input and T012 were added to `spec.md`, `plan.md`, and `tasks.md`; no code/tests/cloud actions.
- **Decision:** ND-F8-1 is decided as an illustrative pilot input: 2 workspaces × 150 clients/workspace × 2 staff/workspace × 2 plans/client × 2 new plan versions/client/month. T012 requires schema/unit verification before table-level values are recorded.
- **Remaining gates:** ND-F8-2 deployment approval remains open for deployment-dependent measurements. ND-F8-3 authenticated-route test-account approval remains open only for measurements that use authenticated routes. Offline measurements remain authorized.
- **Coverage:** FR-to-task 8/8, SC-to-task 4/4; 0 CRITICAL/HIGH, 2 MEDIUM (ND-F8-2/3). Static only.

## S32 SK-B round 7 refresh

- **Date:** 2026-11-04T12:53:27+02:00 (after the S32-SK-B7 task-tag edit).
- **Analyzed commit:** `4a831dc3b9f9ea401c3c6265856cdc320277acbb` (S32-SK-B7 base); the reviewed patch changes `tasks.md` and this refresh only.
- **Scope:** static consistency and evidence review; no tests, stacks, deployments, cloud queries, or secret scans performed.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F8-B7-01 | LOW | `tasks.md:T012`; `traceability.md` SC-003 | T012 carried an `SC-003` scope tag even though it verifies pilot-unit mappings and defers measurement; SC-003 is the no-secrets criterion mapped to T005-T006 and T008. | Removed only the unsupported `SC-003` tag from T012. FR-006, the task text, checkbox, and evidence ownership remain unchanged. |

### Coverage and verdict

- FR-to-task mapping remains 8/8; SC-to-task mapping remains 4/4 (12/12 total). No task checkbox or evidence status changed.
- ND-F8-1 remains decided by S31-PO-4. ND-F8-2 deployment approval and ND-F8-3 authenticated-route measurement remain explicit open decisions; no new ambiguity was found.
- Constitution IV alignment is preserved: preparation-only scope and the no-deployment/no-cloud-write boundary are unchanged.
- **PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 2 inherited MEDIUM, 1 LOW resolved in this round; 12/12 FR/SC items mapped.

## S33 SK-52 fix round 2 refresh

- **Date:** 2026-11-04T19:51:07+02:00 (after the S33 PR #52 fix-round-2 edits).
- **Analyzed commit:** `ab3111caeecbac0594eaf7d3cb42de5c1fba0ebe` (the commit that actually holds the analyzed text; parent of this round-4 fix commit). The reviewed patch changes `tasks.md` (T012 wording), this file (S31 remaining-gates line) and this refresh. Round 2 landed as `ff2174de9e9594d76f8497b0108fd6e23cb813be` (baseline parent `327bce265e292c12023c24f8c242ebb1dd53d48a`); round 3 landed as `ab3111caeecbac0594eaf7d3cb42de5c1fba0ebe`.
- **Scope:** static consistency and evidence review; no tests, scans, stacks, deployments, cloud queries, or implementation actions performed.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F8-R2-01 | LOW | `checklists/analyze.md` (S31 round 6 refresh, "Remaining gates"); `tasks.md:T012` | The S31 remaining-gates line stated neither measurement nor implementation was authorized, and T012 deferred all measurement until both independently open decisions were approved. Both contradicted the spec (User Story 1 — offline measurements now; FR-001..FR-008; SC-001) and the S31-PO-4 pilot input, under which offline projection remains authorized. | Corrected as documentation-only wording: the S31 line now scopes ND-F8-2 to deployment-dependent measurements and ND-F8-3 to measurements using authenticated routes and a dedicated test account; offline measurements remain authorized. T012 now requires schema/unit verification, recording the mapping and source in the projection volume artifact, and completing offline projection after verification; only deployment-dependent and authenticated-route measurements are deferred until the independently open decisions (ND-F8-2/ND-F8-3) are approved. FR-006 semantics are unchanged; the FR-006 reference is preserved; no checkbox changed. |

### Coverage and verdict

- FR-to-task mapping remains 8/8; SC-to-task mapping remains 4/4 (12/12 total). No task checkbox or evidence status changed.
- ND-F8-1 remains decided by S31-PO-4; ND-F8-2 and ND-F8-3 remain explicitly open. No new ambiguity was introduced; offline scope is unchanged from the spec.
- Constitution IV alignment is preserved: preparation-only scope, no deployment/no cloud-write boundary, and no invented approval are unchanged.
- **PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 2 inherited MEDIUM (ND-F8-2/ND-F8-3), 1 LOW documentation-only correction in this round; 12/12 FR/SC items mapped.

## S33 SK-52 fix round 4 refresh

- **Date:** 2026-11-04T21:49:05+02:00 (after the S33 PR #52 round-4 edits).
- **Analyzed commit:** `ab3111caeecbac0594eaf7d3cb42de5c1fba0ebe` (the commit that actually holds the analyzed text; parent of this round-4 fix commit). Baseline for the S33 round-2 refresh remains `327bce265e292c12023c24f8c242ebb1dd53d48a`; round 2 landed as `ff2174de9e9594d76f8497b0108fd6e23cb813be`.
- **Scope:** static consistency and evidence review; no tests, scans, stacks, deployments, cloud queries, or implementation actions performed. No `spec.md`, `plan.md` or `tasks.md` text changed in this round.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F8-R4-01 | LOW | `checklists/analyze.md` (S33 SK-52 fix round 2 refresh, "Analyzed commit" line) | The line read "this fix commit (S33 round 2 for PR #52; base `327bce2`)", which does not identify the exact commit holding the analyzed text. | Corrected as documentation-only wording: the line now cites `ab3111caeecbac0594eaf7d3cb42de5c1fba0ebe` (holds the analyzed text; parent of this round-4 fix commit) and records `ff2174de9e9594d76f8497b0108fd6e23cb813be` (baseline parent `327bce265e292c12023c24f8c242ebb1dd53d48a`) as the round-2 landing commit and `ab3111caeecbac0594eaf7d3cb42de5c1fba0ebe` as round 3. No requirement text changed. |

### Coverage and verdict

- FR-to-task mapping remains 8/8; SC-to-task mapping remains 4/4 (12/12 total). No task checkbox or evidence status changed.
- ND-F8-1 remains decided by S31-PO-4; ND-F8-2 and ND-F8-3 remain explicitly open. No new ambiguity was introduced; offline scope is unchanged from the spec.
- Constitution IV alignment is preserved: preparation-only scope, no deployment/no cloud-write boundary, and no invented approval are unchanged.
- **PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 2 inherited MEDIUM (ND-F8-2/ND-F8-3), 1 LOW documentation-only correction in this round; 12/12 FR/SC items mapped.
