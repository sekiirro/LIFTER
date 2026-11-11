# Analyze: F12 Registration approval and payments

- **Date:** 2026-11-03
- **Analyzed commit:** `d04ef52eb93df68b9361106a5ee4fd4fcaebb108` (origin/main baseline; this artifact follows the local spec/task reconciliation)
- **Scope:** static consistency and evidence review; no test suites executed.
- **Entry inventory:** `spec.md` (FR-001..029, SC-001..011, acceptance scenarios); `plan.md`, `tasks.md`, `research.md`, `data-model.md`, `contracts/*`, `quickstart.md`, `checklists/requirements.md`; clarifications recorded in `spec.md`; no prior `analyze.md` or `traceability.md`.

## Findings

| ID      | Severity | Artifact                                                             | Finding                                                                                                                                                                                         | Disposition                                                                       |
| ------- | -------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| F12-A01 | MEDIUM   | `tasks.md:T051`                                                      | The planned migration filename was stale; the shipped migration is `20261101131000_flexible_registration_link_terms_forward.sql`.                                                               | Corrected to the exact shipped filename; migration exists on the analyzed commit. |
| F12-A02 | MEDIUM   | `tasks.md:T053`, `tests/unit/registration-links-flexible-ui.test.ts` | The task names a UI test file that is absent. Existing pure validation and dialog tests cover parts of the schedule contract, but no matching file proves the full listed UI acceptance matrix. | Left task unchecked; UI-specific traceability is PARTIAL. No requirement changed. |

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

| ID        | Severity | Artifact                                       | Finding                                                                                               | Disposition                                                                                                                                                                                                                                                                |
| --------- | -------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F12-R3-01 | LOW      | `traceability.md:14` (FR-014..015, FR-025 row) | The row listed T035 and T043 for FR-025, while `tasks.md` maps FR-025/SC-011 to T019-T022/Q-V17 only. | Corrected as documentation-only wording: FR-025 now has its own row mapped to T019-T022 with the T019 Cairo-month `effective_on` assertion as evidence (SC-011); FR-014..015 keep T019-T022, T035, T043 unchanged. Requirement meaning unchanged; FR-025 remains VERIFIED. |

### Coverage and verdict

- FR-to-task mapping remains 29/29; SC-to-task mapping remains 11/11 (40/40 total). No task status changed; T050/T051/T053/T054 remain unchecked.
- Requirement-to-test evidence remains recorded in `traceability.md`; tests were inspected statically only. Clarifications: zero open ambiguities for F12 scope, citing D-23 and the final F12 PO record; P2's Trainer capability question remains explicitly outside F12 (FR-022).
- **PASS WITH MEDIUM EVIDENCE GAPS** — 0 CRITICAL, 0 HIGH, 2 MEDIUM (F12-A01, F12-A02; unchanged), 1 LOW documentation-only correction in this round; 40/40 FR/SC items mapped.

## S33 SK-52 fix round 5 refresh

- **Date:** 2026-11-04T22:56:44+02:00 (after the S33 PR #52 round-5 edits).
- **Analyzed commit:** `70d465e1b2c76f952e8222b212acafc36520eabf` (parent of this round-5 fix commit; the analyzed state is held in that revision, and this section lands in the round-5 fix commit). Round 3 landed as `ab3111caeecbac0594eaf7d3cb42de5c1fba0ebe` and round 4 as `70d465e1b2c76f952e8222b212acafc36520eabf`.
- **Scope:** static consistency and evidence review; no tests, scans, stacks, deployments, cloud queries, or implementation actions performed. This round changes `traceability.md` (FR-013 evidence cell), this file (S33 round-3 "Analyzed commit" SHA pin + this refresh) and nothing else. No `spec.md`, `plan.md` or `tasks.md` text changed.

### Findings

| ID        | Severity | Artifact                                                                                                 | Finding                                                                                                                                                                                                                                                                                           | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------- | -------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F12-R5-01 | LOW      | `specs/012-registration-approval/checklists/analyze.md:30` (S33 round-3 refresh, "Analyzed commit" line) | The line said "this fix commit (S33 round 3 for PR #52; base `ff2174d`)", which does not identify the exact commit holding the analyzed text.                                                                                                                                                     | Corrected as documentation-only wording: the line now cites `ab3111caeecbac0594eaf7d3cb42de5c1fba0ebe` (the commit that changed `traceability.md` and the round-3 refresh; base `ff2174de9e9594d76f8497b0108fd6e23cb813be`). Requirement semantics unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| F12-R5-02 | LOW      | `specs/012-registration-approval/traceability.md:13` (FR-013 row)                                        | The FR-013 evidence cell cited `tests/integration/registration-approval-activation.test.ts::T025 exact custom offsets survive across Cairo date...`, which asserts activation-relative `due_on` offsets and does not assert FR-013's historical `collected_on` handling or future-date rejection. | Corrected as documentation-only traceability reconciliation: the row now cites executed T018/historical-date assertions — `tests/integration/registration-approval-payments.test.ts::T018 po full early collection after activation, past date, exact snapshot commission` asserts `expect(r.status).toBe('ok')` and `collected_on: '1900-01-01'` stored; `::T018 invalid collection {"collected_on":"9999-12-31"} writes nothing` asserts `toEqual({ status: 'invalid_input', fields: [] })` with unchanged state; `::T018 Cairo today is accepted without a signup lower bound` asserts `.status` `toBe('ok')`; `tests/unit/registration-approval-validation.test.ts::accepts historical finite date %s without a signup lower bound` asserts `?.collectedOn` `toBe(collectedOn)`. Stack A U4 GREEN (47 passed / 3 files) recorded in `tests/integration/registration-approval-verification.md`. VERIFIED retained; FR/SC counts unchanged (23 VERIFIED / 6 PARTIAL FR; 7 VERIFIED / 4 PARTIAL SC); requirement meaning unchanged. |

### Coverage and verdict

- FR-to-task mapping remains 29/29; SC-to-task mapping remains 11/11 (40/40 total). No task checkbox or evidence status changed.
- Requirement-to-test evidence remains recorded in `traceability.md`; FR-013 now points at executed tests that assert the requirement. Tests were inspected statically in this lane; the cited Stack A U4 GREEN run is recorded in `tests/integration/registration-approval-verification.md`.
- Clarifications: zero open ambiguities for F12 scope, citing D-23 and the final F12 PO record; P2's Trainer capability question remains explicitly outside F12 (FR-022).
- **PASS WITH MEDIUM EVIDENCE GAPS** — 0 CRITICAL, 0 HIGH, 2 MEDIUM (F12-A01, F12-A02; unchanged), 2 LOW documentation-only corrections in this round; 40/40 FR/SC items mapped.

## S41 main-sync reconciliation re-analysis

- Date: 2026-11-09 19:23:34 UTC, after the current-main merge resolution and this reconciliation's spec/plan/task edits.
- Scope: static Spec Kit recheck of the current-main baseline, Clarifications and decision citations, FR/SC/scenario and FR-tagged task cross-references, and the PR #52 compliance edits. Documentation only; no implementation or test task was marked complete, and no tests were executed.
- Result: Entry checks PASS for numbered FRs, measurable SCs and Given/When/Then coverage in this touched scope; plan and FR-tagged task coverage remains present. No new product ambiguity or unapproved behavior was introduced. Existing approval-flow decisions and separately recorded open gates remain unchanged; no new behavior is specified.
- Findings: 0 open CRITICAL, 0 open HIGH. Existing medium/low findings, pending approvals, implementation gates and verification status remain as recorded above.
- Verdict: PASS for this documentation-only reconciliation; no task checkbox or verification status changed.

## S41 review-finding re-analysis

- Date: 2026-11-09 19:56:44 UTC, after the T051 task and FR-002/FR-029 traceability corrections.
- Scope: migration already installed; T050 Stack A verification remains pending; no committed migration was edited. FR-002 cites T013 issued-binding evidence. FR-029 is PARTIAL because the cited test does not prove the UI retains the request and shows the uncertainty warning.
- Findings: 0 open CRITICAL, 0 open HIGH; 22 VERIFIED and 7 PARTIAL functional requirements. No test was run or changed.
- Verdict: PASS for documentation correction; Stack A and UI evidence gates remain open.

## S41-R12 round-3 PR-wide re-analysis

- Date: 2026-11-09 22:50 UTC (2026-11-10 00:50 Africa/Cairo), recording the state at that time after traceability evidence/status edits; the later plan reconciliation is recorded in the S43 analysis below.
- Scope: rechecked all 29 FR and 11 SC identifiers across the traceability rows, current totals, task links and cited evidence. FR total is 21 VERIFIED / 8 PARTIAL after FR-007 is marked PARTIAL; SC total is 6 VERIFIED / 5 PARTIAL. T041 is complete for mock status/accessibility outcomes; the signed-session proof remains pending in U9. FR-016 cites T010 rollback, T017 audit assertions and T022 replay assertions. SC-004 remains PARTIAL pending U9 real signed-session evidence; SC-005 remains VERIFIED with T023 staff role/commission projection and T017 owner-scoped audit evidence.
- Entry gate: PASS - numbered FRs, measurable SCs, GWT scenarios, Clarifications, plan and tasks are present. T041 is complete for mock status/accessibility outcomes; real signed-session proof remains pending in U9.
- Findings: 0 open CRITICAL, 0 open HIGH. Static review only; no tests were run and no status was upgraded.
- Verdict: PASS for this documentation-only reconciliation.

## S41 CodeRabbit round-3 traceability re-analysis

- Date: 2026-11-09 23:17 UTC, after FR-007 status and FR-014..015 evidence corrections.
- Current totals: FR 21 VERIFIED / 8 PARTIAL; SC 6 VERIFIED / 5 PARTIAL. FR-007 remains PARTIAL until an already-open pending page observes approval through its existing signed session. T041 is complete for mock status/accessibility outcomes; the real signed-session proof remains pending in U9. FR-014..015 includes T020 exact-correction replay and T022 audit replay assertions.
- Findings: 0 open CRITICAL, 0 open HIGH. Static review only; no tests were run and no task status changed.
- Verdict: PASS for this documentation-only evidence correction.

## S42 CodeRabbit full-review traceability re-analysis

- Date: 2026-11-10 03:04 UTC, after the round-4 traceability citations for FR-004..005/FR-009..010 and FR-011..012.
- Scope: rechecked the T018 payments suite (activation, sequence, invalid-input and Cairo-date tests), the T015 exact-replay and binding tests, and the T020 exact-replay, revocation-after-wait and subscription-lock tests. FR-004..005/FR-009..010 stay VERIFIED with the T018 activation/sequence/collection-input evidence added alongside the commission and correction citations. FR-011 stays VERIFIED; FR-012 is now PARTIAL because the full lock order (client, subscription, then obligations/ledger) is not asserted as a whole by the cited tests, while staff re-authorization after a wait is asserted.
- Current totals: FR 20 VERIFIED / 9 PARTIAL; SC 6 VERIFIED / 5 PARTIAL. SC-004 remains PARTIAL pending U9 real signed-session evidence.
- Findings: 0 open CRITICAL, 0 open HIGH. Static documentation review only; no tests ran. **No open ambiguities** remain for this correction.
- Verdict: PASS for this documentation-only correction.

## S43 CodeRabbit finding reconciliation — 2026-11-10 08:52 UTC

- Scope: static review of the live PR #52 findings for this feature, migration status in plan.md, FR/SC traceability and cited tests/verification record. Plan and traceability edits are dated above; spec, task identifiers, requirements, and implementation are unchanged.
- Entry gate: PASS — numbered FRs, measurable SCs, GWT scenarios, Clarifications, plan and FR-tagged tasks are present. T051 migration verification remains pending; no task checkbox changed.
- Evidence: FR-024 is PARTIAL because existing unit/route tests use mocked status reads and do not establish authenticated-page automatic detection. FR-007 and SC-004 are VERIFIED by T042 (`registration-approval-operations.test.ts::T042 real F11 client session observes pending then approved status without signing in again`; final S14 verification reports T042 45/45 passed) and T024 (`registration-approval-client-access.test.ts::T024 zero-argument self status returns only the signed client state`; `::T024 foreign and nonexistent users receive the same denial; no target can be supplied`). FR-026 retains VERIFIED status with T014 rejection, invalid-shape, and PO-only reconsideration assertions. The installed U1F migration and pending T051 verification are stated consistently in plan.md and tasks.md.
- Totals: FR 20 VERIFIED / 9 PARTIAL (29); SC 7 VERIFIED / 4 PARTIAL (11). FR-024's page-level detection gap remains explicit; it is not inferred from FR-007/SC-004 evidence.
- Findings: 0 open CRITICAL, 0 open HIGH. Static review only; no tests executed and no task status changed.
- Verdict: PASS for this documentation reconciliation; no product decision or requirement meaning changed.

## S46 CodeRabbit round-5 finding re-analysis

- Date: 2026-11-10 23:29 UTC (2026-11-11 01:29 Africa/Cairo), after the F4 SC-010 traceability correction.
- Scope: F4 — SC-010 is now PARTIAL: the cited status-page/route tests assert redirect-on-transition and home-fallback-on-failure but do not assert page-level link retention after a redirect failure (spec SC-010). Summary counts updated to FR 20 VERIFIED / 9 PARTIAL, SC 6 VERIFIED / 5 PARTIAL. No other row changed.
- Entry gate: PASS — numbered FRs, measurable SCs, GWT scenarios, Clarifications, plan and FR-tagged tasks are present. No task checkbox changed.
- Findings: 0 open CRITICAL, 0 open HIGH. Static review only; no tests executed.
- Verdict: PASS for this documentation reconciliation; no product decision or requirement meaning changed.

## S46 Greptile round finding reconciliation — 2026-11-11T01:37:00Z

- Scope: Greptile review PRR_kwDOVYgYQ88AAAABXNMIkw (COMMENTED 2026-11-11T01:26:51Z, confidence 4/5) on cf6664982: 2 P2 findings. Fixed both documentation-only: (1) docs/01-traceability.md coverage note now records the F1 SC-010-and-later rows plus the restored baseline SC-001..SC-005, with SC-006..SC-009 having no row in that map; (2) traceability.md SC summary corrected to 6 VERIFIED / 5 PARTIAL with the repeated current totals in this file corrected to match. No spec, plan, task, evidence, or requirement meaning changed.
- Entry gate: PASS — numbered FRs, measurable SCs, GWT scenarios, Clarifications (zero open ambiguities), plan and FR-tagged tasks present. No task checkbox changed.
- Evidence: rechecked all 29 FR and 11 SC rows. SC-001..SC-005 and SC-011 are VERIFIED (6); SC-006, SC-007, SC-008, SC-009, SC-010 are PARTIAL (5). FR 20 VERIFIED / 9 PARTIAL unchanged.
- Findings: 0 open CRITICAL, 0 open HIGH. Static review only; no tests executed.
- Verdict: PASS for this documentation-only reconciliation.

# Analyze — F12 registration approval and payment recording

## 2026-11-10 08:42 +02:00 - S43 finding 73 analysis (CodeRabbit thread PRRT_kwDOVYgYQ861jSoF; PR #73)

- Scope: split the deletion-state replay and deleted-client reconsideration cases out of F12 U9 T042 into T055; keep T042's remaining U9 coverage intact; require both T042 and T055 before the 011 deletion release (spec.md FR-022 cross-reference; 011 T048 release gate).
- Validation: the finding is valid. The cases depend on 011 T048's forward-only 012 operation changes and therefore made U9 depend on work that is explicitly gated for the 011 deletion release. T055 is a separate post-T042 gate, outside U9, and runs after those operation changes exist. The 011 release remains blocked until both verification tasks pass on the current head.
- Entry check: FR-011 replay semantics, FR-017 stale-state behavior, FR-001 authorization and their existing acceptance scenarios remain present and unchanged; clarified deletion lifecycle cross-reference remains tied to 011 FR-018/T048. No product behavior or copy changed. Clarifications and PO records remain applicable; no new product decision is introduced. Zero open ambiguities is not claimed: the existing non-PO A-S41-4 review gates and the single-current-responsible-Trainer working assumption remain recorded. This is an existing open PR fix within approved scope. T042 retains its US7 tag; T055 carries US7, FR-011 and FR-017 tags, and the task coverage table maps T055 to FR-011/017. PASS.
- Cross-reference check: 011 T048 owns the forward-only operation changes and names both 012 T042/T055 as release prerequisites; 012 FR-022 and task text agree. No task is marked complete because no tests ran.
- Findings: CRITICAL 0, HIGH 0, MEDIUM 0 new.
- Result: PASS. Static consistency analysis only; no implementation or product behavior changed.

## 2026-11-10 00:11 +02:00 — S41 round 7 analysis (CodeRabbit round 7 review 5832806947 finding 3; S41-PO-11 cross-reference; PR #73)

- Scope: 012 spec.md line 148 (the deletion-state check now names the 011 T048 owner and the 012 T042 gate) and FR-022 (the delayed-job no-op now excludes the Trainer-deletion reassignment of 011 FR-028 (h)), plus the gating note in tasks.md T042. The S41-PO-11 cross-reference changes no F12 decision: approval still auto-assigns through 011, and a deleted rejected client is still refused before any subscription or payment.
- Entry check: FR-011 (an authorised replay returns the identical receipt), FR-017 (stale states are not changed) and FR-001 (PO/WO approval authority) remain consistent; 011 T048 now owns the forward-only 012 operation changes and requires this task to pass before the 011 deletion release ships. PASS.
- Findings: CRITICAL 0. HIGH 0. MEDIUM 0 new. The P2 capability question (DG-F12-1) and the other open items are unchanged.
- Result: PASS, 0 CRITICAL, 0 HIGH. Static consistency only; no product behaviour, migration or implementation is changed.

## 2026-11-09 22:59 +02:00 — S41 round 6 analysis (CodeRabbit round 6 on head 1c569497: 012 spec.md line 148 and tasks T042; PR #73) (superseded by round 7 for statuses)

- Scope: 012 spec.md line 148 and tasks.md T042 after CodeRabbit round 6. The deletion-state refusal now covers approve, reject and registration_reconsider, reads the F11 deletion state explicitly under the client lock (forward-only, 011 FR-018), and runs after an authorised receipt replay is checked. Because deletion keeps `approval_state` unchanged, a deleted rejected client still carries `rejected` and cannot be reconsidered into a subscription or payment. T042 adds the deleted rejected-client reconsideration case.
- Entry check: FR-011 (replay returns the identical receipt) and FR-017 (stale states are not changed) remain consistent; FR-001 (PO/WO approval authority) is unchanged; the change is a technical enforcement of the already-decided terminal deletion state, not a new product rule. PASS.
- Findings: CRITICAL 0. HIGH 0. MEDIUM 0 new. The P2 capability question (DG-F12-1) and the other open items are unchanged.
- Result: PASS, 0 CRITICAL, 0 HIGH. Static consistency only; no product behaviour, migration or implementation is changed.

## 2026-11-09 21:46 +02:00 — S41 round 5 analysis (CodeRabbit round 5 on head db094e12: 012 spec.md line 148 and tasks T042; PR #73)

- Scope: 012 spec.md line 148 (deletion-state refusal) and tasks.md T042 (RED case) after CodeRabbit round 5. A new approve or reject for a deletion-pending or deleted client is refused with the FR-017 stale-state response; an exact authorised replay with an existing receipt returns that identical receipt under FR-011 and changes nothing.
- Entry check: the requirement now agrees with FR-011 (replay re-authorises and returns the identical receipt) and FR-017 (stale states are not changed). The new case is a RED test case in T042, not a new task. PASS.
- Findings: CRITICAL 0. HIGH 0. MEDIUM 0 new. The earlier open items are unchanged; the P2 capability question (DG-F12-1) remains an existing P2 item.
- Result: PASS, 0 CRITICAL, 0 HIGH. Static consistency only; no product behaviour, migration or implementation is changed.

## 2026-11-09 21:30 +02:00 — S41 round 4 analysis (S41-PO-1..3 and S41-R4 cross-reference; PR #73)

- Scope: 012 FR-022 (approval commit as trigger for 011 distribution through a durable job) after the S41 edit that adds the delayed-job no-op for a Platform Owner manual assignment (011 FR-028 (g); S41-R4 F2). Other 012 FRs unchanged.
- Entry check: FR-022 has an existing acceptance path (012 T016 and the 011 T063 cross-reference); no new requirement or copy is introduced. PASS.
- Findings: CRITICAL 0. HIGH 0. MEDIUM 0 new. The 012 open items are unchanged; the P2 capability question (DG-F12-1) is an existing P2 item.
- The PO decisions S41-PO-1..3 concern 011 only. Their 012 effect is the cross-reference above and nothing else.
- Result: PASS, 0 CRITICAL, 0 HIGH. Static consistency only; no product behaviour, migration or implementation is changed.

## 2026-11-09 18:45 +02:00 — S40 round 3 analysis (S40-PO-13 + S40-R19 cross-references; PR #73)

- Entry check (Spec Kit gate section 1): spec.md requirements, measurable SCs and Given/When/Then scenarios for the touched scope (FR-022, Out of Scope, edge cases): PASS. Clarifications: the 2026-10-28 and 2026-10-29 PO records are the register; the S40 cross-references cite S40-PO-13 and S40-R19 (architect ruling, labelled). PASS. plan.md and tasks.md: present; no task was added or changed in this round. PASS.
- Gap at entry: this folder had no `checklists/analyze.md` before this round, so the "analyze.md exists" check FAILED. This file is the first analysis for spec 012 and closes that gap for the cross-reference scope. No implementation task is opened by it.
- Scope of change: (1) FR-022 names the approval commit as the trigger for the 011 FR-028 automatic responsible-Trainer distribution (S40-PO-13 MCQ-11 defaults); the distribution is a separate system write that grants nothing and changes no approval semantics. (2) Out of Scope: client closure/deletion now points to 011 FR-018–FR-026 (S40-PO-13); F12 adds no deletion behavior. (3) Edge case: a deletion-pending or deleted client is refused on approve and reject with the FR-017 stale-state response; no subscription, obligation or payment is created. (4) Status line notes the round.
- Consistency checks: FR-001 (WO/PO approve only) and FR-017 (stale state not changed) are unchanged. The F12 "Sales has no approval capability" rule is unchanged. No money, commission, receipt or audit requirement changed. The 011 deletion path keeps approved payments, obligations and collections immutable (011 FR-020), which F12 FR-005 already requires.
- Open items that touch F12 (not F12 decisions): the deletion-confirmation content (011 S40-F11-MCQ-18) and the last-active Workspace Owner case (011 S40-F11-MCQ-13) affect approver availability only through 011; neither changes an F12 requirement. P2 Trainer form-selection capability (DG-F12-1) remains open and unchanged.
- Findings: CRITICAL 0. HIGH 0. MEDIUM 0 new. Previously recorded open items in F12 are unchanged; the P2 capability question (DG-F12-1) is an existing P2 item.
- Fix round (2026-11-09 18:56 +02:00, CodeRabbit round 1 on d8bb100d, review-body finding "Specify delivery of approval events to distribution"): FR-022 now says the distribution is consumed from a durable job written in the approval transaction; ownership is 011 FR-028 (g) (011 consumes, 012 emits; retries, backlog and idempotency specified there). No F12 approval, payment or audit behavior changed. Treated as valid: without a durable job a crash after approval leaves an eligible client unassigned.
- Result: PASS — 0 CRITICAL, 0 HIGH. Static consistency only; no product behavior, migration or implementation is changed.

## S47 merge-main re-analysis — 2026-11-11T02:17:23Z

- Scope: merge of origin/main b1476db5 (PR #73 F11 lifecycle cross-references: FR-022 distribution trigger and job, deletion-state edge case, out-of-scope deletion boundary, T042/T055 split) into PR #52 branch at f5ec56e. Static documentation-only recheck of the merged spec.md, tasks.md and traceability rows. No migration, code, config or test executed; no task checkbox changed.
- Conflict in this file: add/add (PR S33 through S46 history vs main S40/S41 lifecycle sections) resolved by concatenation of both full histories, each kept byte-exact (proofs in run report). docs/01-traceability.md resolved as main PO Gap text plus PR S30 rows, byte-exact.
- Entry gate: PASS for numbered FRs, measurable SCs, GWT scenarios, Clarifications, plan and FR-tagged tasks. Totals unchanged by the merge: FR 20 VERIFIED / 9 PARTIAL, SC 6 VERIFIED / 5 PARTIAL.
- Findings: 0 open CRITICAL, 0 open HIGH. Static review only; no tests executed and no requirement meaning changed.
- Verdict: PASS for this merge reconciliation.
