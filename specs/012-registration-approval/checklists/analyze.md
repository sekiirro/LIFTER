# Analyze: F12 Registration approval and payments

- **Date:** 2026-11-03
- **Analysed commit:** `d04ef52eb93df68b9361106a5ee4fd4fcaebb108` (origin/main baseline; this artifact follows the local spec/task reconciliation)
- **Scope:** static consistency and evidence review; no test suites executed.
- **Entry inventory:** `spec.md` (FR-001..029, SC-001..011, acceptance scenarios); `plan.md`, `tasks.md`, `research.md`, `data-model.md`, `contracts/*`, `quickstart.md`, `checklists/requirements.md`; clarifications recorded in `spec.md`; no prior `analyze.md` or `traceability.md`.

## Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F12-A01 | MEDIUM | `tasks.md:T051` | The planned migration filename was stale; the shipped migration is `20261101131000_flexible_registration_link_terms_forward.sql`. | Corrected to the exact shipped filename; migration exists on the analysed commit. |
| F12-A02 | MEDIUM | `tasks.md:T053`, `tests/unit/registration-links-flexible-ui.test.ts` | The task names a UI test file that is absent. Existing pure validation and dialog tests cover parts of the schedule contract, but no matching file proves the full listed UI acceptance matrix. | Left task unchecked; UI-specific traceability is PARTIAL. No requirement changed. |

## Coverage and consistency

- FR-to-task mapping: 29/29 requirements mapped in the task coverage table.
- SC-to-task mapping: 11/11 success criteria mapped in the task coverage table.
- Requirement-to-test evidence is recorded in `traceability.md`; tests were inspected statically only.
- Clarifications: zero open ambiguities for F12 scope, citing D-23 and the final F12 PO record. P2's Trainer capability question remains explicitly outside F12 (FR-022).
- Task status: T050/T051/T053/T054 remain unchecked. The migration and T050 integration assertions exist, but this lane did not execute tests; the UI evidence named by T053 is missing. No task status was changed.

## Verdict

**PASS WITH MEDIUM EVIDENCE GAPS** — 0 CRITICAL, 0 HIGH, 2 MEDIUM; 40/40 FR/SC items mapped to tasks. Static code/test evidence only; no test suite execution.

## S33 SK-52 fix round 3 refresh

- **Date:** 2026-11-04T20:55:00+02:00 (after the S33 PR #52 fix-round-3 edits).
- **Analyzed commit:** `ab3111caeecbac0594eaf7d3cb42de5c1fba0ebe` (S33 round 3 for PR #52; base `ff2174de9e9594d76f8497b0108fd6e23cb813be`). The reviewed patch changes `traceability.md` (FR-025 split from the FR-014..015 row) and this refresh only. No `spec.md`, `plan.md` or `tasks.md` text changed.
- **Scope:** static consistency and evidence review; no test suites executed.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F12-R3-01 | LOW | `traceability.md:14` (FR-014..015, FR-025 row) | The row listed T035 and T043 for FR-025, while `tasks.md` maps FR-025/SC-011 to T019-T022/Q-V17 only. | Corrected as documentation-only wording: FR-025 now has its own row mapped to T019-T022 with the T019 Cairo-month `effective_on` assertion as evidence (SC-011); FR-014..015 keep T019-T022, T035, T043 unchanged. Requirement meaning unchanged; FR-025 remains VERIFIED. |

### Coverage and verdict

- FR-to-task mapping remains 29/29; SC-to-task mapping remains 11/11 (40/40 total). No task status changed; T050/T051/T053/T054 remain unchecked.
- Requirement-to-test evidence remains recorded in `traceability.md`; tests were inspected statically only. Clarifications: zero open ambiguities for F12 scope, citing D-23 and the final F12 PO record; P2's Trainer capability question remains explicitly outside F12 (FR-022).
- **PASS WITH MEDIUM EVIDENCE GAPS** — 0 CRITICAL, 0 HIGH, 2 MEDIUM (F12-A01, F12-A02; unchanged), 1 LOW documentation-only correction in this round; 40/40 FR/SC items mapped.

## S33 SK-52 fix round 5 refresh

- **Date:** 2026-11-04T22:56:44+02:00 (after the S33 PR #52 round-5 edits).
- **Analyzed commit:** `70d465e1b2c76f952e8222b212acafc36520eabf` (parent of this round-5 fix commit; the analyzed state is held in that revision, and this section lands in the round-5 fix commit). Round 3 landed as `ab3111caeecbac0594eaf7d3cb42de5c1fba0ebe` and round 4 as `70d465e1b2c76f952e8222b212acafc36520eabf`.
- **Scope:** static consistency and evidence review; no tests, scans, stacks, deployments, cloud queries, or implementation actions performed. This round changes `traceability.md` (FR-013 evidence cell), this file (S33 round-3 "Analyzed commit" SHA pin + this refresh) and nothing else. No `spec.md`, `plan.md` or `tasks.md` text changed.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F12-R5-01 | LOW | `specs/012-registration-approval/checklists/analyze.md:30` (S33 round-3 refresh, "Analyzed commit" line) | The line said "this fix commit (S33 round 3 for PR #52; base `ff2174d`)", which does not identify the exact commit holding the analyzed text. | Corrected as documentation-only wording: the line now cites `ab3111caeecbac0594eaf7d3cb42de5c1fba0ebe` (the commit that changed `traceability.md` and the round-3 refresh; base `ff2174de9e9594d76f8497b0108fd6e23cb813be`). Requirement semantics unchanged. |
| F12-R5-02 | LOW | `specs/012-registration-approval/traceability.md:13` (FR-013 row) | The FR-013 evidence cell cited `tests/integration/registration-approval-activation.test.ts::T025 exact custom offsets survive across Cairo date...`, which asserts activation-relative `due_on` offsets and does not assert FR-013's historical `collected_on` handling or future-date rejection. | Corrected as documentation-only traceability reconciliation: the row now cites executed T018/historical-date assertions — `tests/integration/registration-approval-payments.test.ts::T018 po full early collection after activation, past date, exact snapshot commission` asserts `expect(r.status).toBe('ok')` and `collected_on: '1900-01-01'` stored; `::T018 invalid collection {"collected_on":"9999-12-31"} writes nothing` asserts `toEqual({ status: 'invalid_input', fields: [] })` with unchanged state; `::T018 Cairo today is accepted without a signup lower bound` asserts `.status` `toBe('ok')`; `tests/unit/registration-approval-validation.test.ts::accepts historical finite date %s without a signup lower bound` asserts `?.collectedOn` `toBe(collectedOn)`. Stack A U4 GREEN (47 passed / 3 files) recorded in `tests/integration/registration-approval-verification.md`. VERIFIED retained; FR/SC counts unchanged (23 VERIFIED / 6 PARTIAL FR; 7 VERIFIED / 4 PARTIAL SC); requirement meaning unchanged. |

### Coverage and verdict

- FR-to-task mapping remains 29/29; SC-to-task mapping remains 11/11 (40/40 total). No task checkbox or evidence status changed.
- Requirement-to-test evidence remains recorded in `traceability.md`; FR-013 now points at executed tests that assert the requirement. Tests were inspected statically in this lane; the cited Stack A U4 GREEN run is recorded in `tests/integration/registration-approval-verification.md`.
- Clarifications: zero open ambiguities for F12 scope, citing D-23 and the final F12 PO record; P2's Trainer capability question remains explicitly outside F12 (FR-022).
- **PASS WITH MEDIUM EVIDENCE GAPS** — 0 CRITICAL, 0 HIGH, 2 MEDIUM (F12-A01, F12-A02; unchanged), 2 LOW documentation-only corrections in this round; 40/40 FR/SC items mapped.
