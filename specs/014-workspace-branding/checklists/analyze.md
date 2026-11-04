# Analyze: F14 Workspace Branding — merged core

- **Date:** 2026-11-03
- **Analyzed commit:** `0e727eec8277831d433bd14a48800d341f148efb` (Part 3 baseline); task-tag reconciliation is recorded at `0649423752419979d7f0eb3ef29ad2bf24689075` (adds FR/SC tags to T039-T041 and T043; T042 remains untagged; the 18/18 and 11/11 mapping statement below reflects this later revision).
- **Scope:** core merged on main only; F14b owner-facing upload/alt-text UI excluded. Static artifact/source/evidence review; no tests executed.
- **Inventory:** `spec.md` (FR-001..018, SC-001..011, scenarios, PO decisions), `plan.md`, `tasks.md`, research, data model/contracts/quickstart, `checklists/requirements.md`; no feature Analyze or traceability artifact existed.

## Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F14-A01 | MEDIUM | `spec.md:FR-009`; S19 PO record | Owner-facing logo/banner upload controls and alt-text editor UI are explicitly deferred to F14b; FR-009 is therefore only partially complete. | Preserve PARTIAL status; do not include F14b work in this core reconciliation. |
| F14-A02 | MEDIUM | `tasks.md:T039-T041,T043`; D-24 | Capacity, backup/restore, complete Q-M matrix, and final release/hosted evidence remain open. D-24 describes hosted verification as a production blocker; it does not explicitly defer these tasks. | Leave tasks unchecked and report as open production gates; do not mark deferred. |
| F14-A03 | MEDIUM | `FR-011`; `traceability.md` | Proxy-response tests assert `private, no-store`; registration-page tests assert no-store/referrer policy but no registration-route test asserts `private`. | Keep FR-011 PARTIAL until registration responses, including errors, assert `private, no-store`; do not infer render behavior from proxy tests. |

## Coverage and consistency

- FR-to-task mapping: 18/18; SC-to-task mapping: 11/11. T039/T040/T041/T043 were tagged to their FR/SC coverage; no task status changed. FR-012/SC-005 remain PARTIAL because evidence does not cover unchanged signup authorization and entered form values.

## S31 round 6 refresh

- **Date:** 2026-11-04
- **Analyzed commit:** `cb08f711716d7f0667dadb4fdce286c1a09cdc92` plus S31 documentation traceability correction.
- **Scope:** F14 core traceability consistency; static only, no tests.
- **Finding:** FR-011 remains PARTIAL specifically because no registration-route assertion for the `private` cache directive was located. FR-012 and SC-005 remain PARTIAL because assertions for unchanged signup authorization and entered values across publication were not located.
- **Coverage:** 18/18 FR and 11/11 SC mapped; traceability totals 20 VERIFIED / 9 PARTIAL; no CRITICAL/HIGH findings; 3 MEDIUM remain.
- Clarifications cite D-24 and S19-PO-2. Zero open product ambiguities remain in the core scope; the documented F14b deferral and production evidence gates are preserved.
- Existing code and test assertions were inspected statically. No tests, CI, Stack B, Storage, or hosted verification were executed.

## Verdict

**PASS WITH MEDIUM EVIDENCE GAPS** — 0 CRITICAL, 0 HIGH, 3 MEDIUM; 29/29 FR/SC items mapped. Static review only.

## S33 SK-52 round 7 refresh

- **Date:** 2026-11-04T18:13:06+02:00 (after the S33 PR #52 fix-round edits).
- **Analyzed commit:** this fix commit (S33 round for PR #52; base `2eb3733`). The reviewed patch changes `specs/014-workspace-branding/tasks.md` (T039/T040 FR tags), `specs/014-workspace-branding/traceability.md` (FR-009/FR-014 rows) and this refresh only.
- **Scope:** static consistency and evidence review; no tests, scans, stacks, or implementation actions performed.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F14-R7-01 | LOW | `tasks.md:117-118`; `traceability.md` FR-009/FR-014 rows | T039 carries the FR-009 worst-case CPU/memory benchmark requirement but tagged only FR-017/SC-010; T040 carries the FR-014 audit-retention requirement but omitted FR-014; the FR-009/FR-014 traceability rows did not list T039/T040. | Corrected as documentation-only tag reconciliation: T039 now tags FR-009, FR-017; SC-010; T040 now tags FR-014, FR-017, FR-018; SC-010. Traceability FR-009 row tasks become `T009,T013,T014,T021,T022,T039,T043` (status stays PARTIAL); FR-014 row tasks become `T005,T014,T027,T040,T043` (see F14-R7-02). |
| F14-R7-02 | LOW | `traceability.md` FR-014 row | Adding the open T040 tag must not upgrade FR-014 on a tag change alone. | Status kept VERIFIED solely on executed evidence already cited: T021 (`tests/integration/branding-audit.test.ts::keeps audit rows detached from collectible targets and immutable`) — RED before migration, GREEN on final fresh Stack B reset and integration; audit schema has no version/asset FK, proving audit rows permanent and independent of version/asset retention. T040 (production backup/restore + independent audit-retention verification) remains open and is not claimed as satisfied; FR-014 does not rely on the T040 tag. If the architect prefers strict open-T040 alignment, demote FR-014 to PARTIAL and set the summary to 19 VERIFIED / 10 PARTIAL. |

### Coverage and verdict

- FR-to-task mapping remains 18/18; SC-to-task mapping remains 11/11 (29/29 total). No task checkbox or evidence status changed; traceability totals remain 20 VERIFIED / 9 PARTIAL.
- Requirement semantics are unchanged (no scope or behavior change); the only requirement↔task linkage change is FR-009↔T039 and FR-014↔T040, mirrored in traceability.
- FR-009 remains PARTIAL (owner-facing editor deferred by S19-PO-2); FR-011, FR-012, SC-005 remain PARTIAL unchanged; T039/T040/T041/T043 remain open production-evidence tasks.
- **PASS WITH MEDIUM EVIDENCE GAPS** — 0 CRITICAL, 0 HIGH, 3 MEDIUM, 2 LOW documentation-only corrections in this round; 29/29 FR/SC items mapped.

## S33 SK-52 fix round 4 refresh

- **Date:** 2026-11-04T21:49:05+02:00 (after the S33 PR #52 round-4 edits).
- **Analyzed commit:** `ab3111caeecbac0594eaf7d3cb42de5c1fba0ebe` (this round-4 fix commit's parent; the analyzed state is held in that revision, and this section lands in the round-4 fix commit). Baseline for the S33 round-7 analysis remains `2eb3733b`.
- **Scope:** static consistency and evidence review; no tests, scans, stacks, or implementation actions performed. No `spec.md`, `plan.md` or `tasks.md` text changed in this round.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F14-R4-01 | LOW | `traceability.md` FR-014 row | The FR-014 Evidence cell cites T021 for audit-row permanence and independence (`tests/integration/branding-audit.test.ts::keeps audit rows detached from collectible targets and immutable` — RED before migration, GREEN on final fresh Stack B reset), but the Task(s) cell omitted T021. | Corrected as documentation-only traceability reconciliation: FR-014 Task(s) now cite `T005,T014,T021,T027,T040,T043`. No asserting test, evidence value, or status changed; FR-014 remains VERIFIED on the cited executed T021 evidence. T040 (production backup/restore + independent audit-retention verification) remains open and is not claimed as satisfied. |

### Coverage and verdict

- FR-to-task mapping remains 18/18; SC-to-task mapping remains 11/11 (29/29 total). No task checkbox or evidence status changed; traceability totals remain 20 VERIFIED / 9 PARTIAL.
- Requirement semantics are unchanged (no scope or behavior change); the only requirement–task linkage change is FR-014↔T021, mirrored in traceability.
- FR-009 remains PARTIAL (owner-facing editor deferred by S19-PO-2); FR-011, FR-012, SC-005 remain PARTIAL unchanged; T039/T040/T041/T043 remain open production-evidence tasks.
- **PASS WITH MEDIUM EVIDENCE GAPS** — 0 CRITICAL, 0 HIGH, 3 MEDIUM, 1 LOW documentation-only correction in this round; 29/29 FR/SC items mapped.
