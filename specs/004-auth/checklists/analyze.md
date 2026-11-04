# Analyze: F4 Authentication and manual recovery

- **Date:** 2026-11-03
- **Analyzed commit:** `43963eab79d0cd4f511267d3a0ede1181f201e2a` (baseline); final evidence review at `458fa385ef2fa5c8c023b8db3743b11e17303062` includes the local F4 clarification and the traceability reconciliation.
- **Scope:** static consistency and evidence review; no tests executed.
- **Inventory:** `spec.md` (FR-001..015, SC-001..007, scenarios and ND-F4 register), `plan.md`, `tasks.md`, research/quickstart/contracts/data-model, `checklists/requirements.md`; no prior feature `checklists/analyze.md` or `traceability.md`.

## Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F4-A01 | MEDIUM | `spec.md:129-135` | ND-F4-1: Trainer eligibility remains open; current behavior denies Trainers. | Preserved and escalated as SK-004-02. |
| F4-A02 | MEDIUM | `spec.md:130` | ND-F4-2: link delivery remains copy-only pending a decision. | Preserved and escalated as SK-004-03. |
| F4-A03 | MEDIUM | `spec.md:132` | ND-F4-4: actor/target rate-limit values remain configuration placeholders in local/dev; production needs a decision. | Preserved and escalated as SK-004-04. |
| F4-A04 | MEDIUM | `spec.md:133` | ND-F4-5: sequencing of client-target enablement across F4/P1 remains open; the current path denies targets before the P1 test seam. | Preserved and escalated as SK-004-05. |
| F4-A05 | MEDIUM | `spec.md:134` | ND-F4-6: whether PO staff recovery is included remains open and unbuilt. | Preserved and escalated as SK-004-06. |
| F4-A06 | MEDIUM | `spec.md:135` | ND-F4-7: SMTP/self-service reset timing remains open; the flow is sequenced, not removed. | Preserved and escalated as SK-004-07. |
| F4-A07 | MEDIUM | `tasks.md:T030`; `docs/04-changes-and-questions.md:D-19` | T030 says D-19 is pending PO approval, but D-19 is already recorded as an owner decision; the underlying approval status/source is not present in this checkout's allowed records. | Preserve both statements and escalate SK-004-01; do not infer approval from the register entry. |

## Coverage and consistency

- FR-to-task and SC-to-task mapping exists in the task artifact; all 15 FRs and 7 SCs have acceptance scenarios.
- The clarification entry cites D-19 and keeps all unresolved decisions explicit. ND-F4-3's 60-minute link expiry, one-time use, replacement invalidation, and independent 15-minute session are marked decided in the spec and are not reopened.
- Concrete tests and controls were inspected statically. No tests were executed. T030 remains unchecked; no task status was changed.

## Verdict

**PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 7 MEDIUM; 22/22 FR/SC items mapped. The open items do not authorize guessed product behavior.

## S31 round 6 refresh

- **Date:** 2026-11-04
- **Reviewed after:** S31-PO-2/3 changes to `spec.md`, `plan.md`, `tasks.md`, `research.md`, `data-model.md`, and `README.md`; static only, no tests run.
- **Decisions:** D-19 is approved as the scope authority. Trainer scope, copy-only delivery, client-only recovery, client lookup sequencing, and rate values are recorded per S31-PO-2/3. ND-F4-7 remains open.
- **Evidence gaps:** approved Trainer permission and approved rate values are not implemented/asserted. Provider expiry configuration in every environment is not verified; T031 tracks that gap. T030 closure is PO-directed, but remains unchecked pending current-head review/CI gates under the task evidence rule.
- **Coverage:** FR mapping 15/15, SC mapping 7/7; traceability reports 9 VERIFIED / 6 PARTIAL functional requirements and 4 VERIFIED / 3 PARTIAL success criteria. 0 CRITICAL, 0 HIGH; 7 MEDIUM. No new PO ambiguity found.

## S32 SK-B round 7 refresh

- **Date:** 2026-11-04T12:53:27+02:00 (after the S32-SK-B7 documentation edits).
- **Analyzed commit:** `4a831dc3b9f9ea401c3c6265856cdc320277acbb` (S32-SK-B7 base); the reviewed patch changes `spec.md`, `data-model.md`, and this refresh only.
- **Scope:** static consistency and evidence review; no tests, scans, stacks, or implementation actions performed.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F4-B7-01 | LOW | `spec.md:FR-006`; `data-model.md` capability matrix | The shared membership qualifier made PO scope ambiguous, and the TypeScript matrix instruction did not explicitly carry the approved future Trainer scope into the same future parity change. | Corrected as a documentation-only clarification: PO is independent of workspace membership; WO requires active membership in the client's workspace; Trainer parity remains deferred to its own approved Spec Kit cycle. No behavior was implemented. |
| F4-A01 (inherited) | MEDIUM | `traceability.md` FR-006/SC-003; `tasks.md:T032` | Approved all-workspace-Trainer recovery behavior remains unimplemented and has no asserting test. | Preserve the existing PARTIAL traceability status and leave T032 unchecked. No new product decision is required. |

### Coverage and verdict

- FR-to-task mapping remains 15/15; SC-to-task mapping remains 7/7 (22/22 total). No task checkbox or evidence status changed.
- The S31-PO-2 clarification remains recorded in `spec.md`; there are no ambiguities about the approved role scope. Existing ND-F4-7 and implementation/configuration gaps remain explicit.
- Constitution I/III/IV alignment is preserved: role scope remains explicit, both authorization walls remain required, and the new Trainer behavior is not implemented early.
- **PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 7 inherited MEDIUM, 1 LOW resolved in this round; 22/22 FR/SC items mapped.

## S33 SK-52 round 8 refresh

- **Date:** 2026-11-04T18:13:06+02:00 (after the S33 PR #52 fix-round edits).
- **Analyzed commit:** this fix commit (S33 round for PR #52; base `2eb3733`). The reviewed patch changes `README.md`, `specs/004-auth/plan.md` and this refresh only.
- **Scope:** static consistency and evidence review; no tests, scans, stacks, or implementation actions performed.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F4-R8-01 | LOW | `README.md`; `specs/004-auth/plan.md:19,63` | The README/plan wording stated configuration values were unverified without recording that a placeholder enforcement exists and mismatches the approved S31-PO-3 limits. | Corrected as documentation-only wording: `app_private.recovery_link_limits()` (`20261028120000_auth_recovery_links.sql`) enforces 20 per actor and 3 per target per one-hour window, which does not match the approved S31-PO-3 limits (10 per issuing staff account per rolling hour; 3 per client per rolling 24 hours across issuers). No claim that approved values are enforced; no configuration verification has been executed in this lane; implementation/verification remains with T032/T033. |
| F4-R8-02 | LOW | `specs/004-auth/plan.md:38` | Constitution Check III still said Trainer is deny-by-default "until ND-F4-1" even though ND-F4-1 is decided (spec.md:129, S31-PO-2). | Corrected as documentation-only wording: Trainer is deny-by-default until T032 completes its separate implementation cycle, RLS, tests, and security review. Matrix parity is tested as before; no capability, RLS or matrix behavior changed. |

### Coverage and verdict

- FR-to-task mapping remains 15/15; SC-to-task mapping remains 7/7 (22/22 total). No task checkbox or evidence status changed.
- Requirement semantics are unchanged (S31-PO-3 remains the authority; no scope or behavior change); no FR/SC re-mapping is required. Existing ND-F4-7 and implementation/configuration gaps remain explicit.
- Constitution I/III/IV alignment is preserved: both authorization walls remain required, Trainer stays denied until its own approved Spec Kit cycle, and no Trainer behavior is implemented early.
- **PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 7 inherited MEDIUM, 2 LOW documentation-only corrections in this round; 22/22 FR/SC items mapped.

## S33 SK-52 round 9 refresh

- **Date:** 2026-11-04T19:51:07+02:00 (after the S33 PR #52 fix-round-2 edits).
- **Analyzed commit:** this fix commit (S33 round 2 for PR #52; base `327bce2`). The reviewed patch changes `tasks.md` (T031 wording) and this refresh only.
- **Scope:** static consistency and evidence review; no tests, scans, stacks, or implementation actions performed.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F4-R9-01 | LOW | `tasks.md:T031` | T031 asked for recovery-link provider expiry evidence from one approved safe environment while ND-F4-3 (decided PO 2026-10-29) requires a 60-minute expiry in every environment. | Corrected as documentation-only task wording: T031 now requires per-environment provider/configuration evidence for every supported environment, or a documented configuration parity proof for any environment not checked directly; "No implementation change is implied" is preserved. FR-012/SC-005 semantics are unchanged (ND-F4-3 remains the authority); no checkbox changed. |

### Coverage and verdict

- FR-to-task mapping remains 15/15; SC-to-task mapping remains 7/7 (22/22 total). No task checkbox or evidence status changed.
- Requirement semantics are unchanged; no FR/SC re-mapping is required. ND-F4-3 is unchanged and explicit.
- Constitution I/III/IV alignment is preserved: no capability, matrix, RLS, or recovery-link behavior changed.
- **PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 7 inherited MEDIUM, 1 LOW documentation-only correction in this round; 22/22 FR/SC items mapped.

## S33 SK-52 fix round 4 refresh

- **Date:** 2026-11-04T21:49:05+02:00 (after the S33 PR #52 round-4 edits).
- **Analyzed commit:** `ab3111caeecbac0594eaf7d3cb42de5c1fba0ebe` (this round-4 fix commit's parent; the analyzed state is held in that revision, and this section lands in the round-4 fix commit). Round 2 landed as `ff2174de9e9594d76f8497b0108fd6e23cb813be`.
- **Scope:** static consistency and evidence review; no tests, scans, stacks, deployments, cloud queries, or implementation actions performed. No `spec.md`, `plan.md` or `tasks.md` text changed in this round.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F4-R4-01 | LOW | `traceability.md` FR-001/FR-002/FR-003/FR-007/FR-011 rows | Task references did not match task ownership: FR-001 and FR-002 omitted T014 (owns sign-in), FR-003 omitted T015 (owns sign-out), FR-007 cited work through T020 while the cited unit test is owned by T021, and FR-011 cited the `tests/e2e/auth.spec.ts::closing the recovery dialog clears the displayed link` assertion without T016 (owner of `tests/e2e/auth.spec.ts`, which contains the cited test). | Corrected as documentation-only traceability reconciliation: FR-001/FR-002 now cite `T014`, FR-003 cites `T015`, FR-007 cites `T017-T021`, FR-011 cites `T016,T019-T020,T024`. No asserting test, evidence value, or status changed; all five rows remain VERIFIED. Requirement semantics unchanged. |

### Coverage and verdict

- FR-to-task mapping remains 15/15; SC-to-task mapping remains 7/7 (22/22 total). No task checkbox or evidence status changed.
- Requirement semantics are unchanged; no FR/SC re-mapping is required. ND-F4-7 and implementation/configuration gaps remain explicit.
- Constitution I/III/IV alignment is preserved: no capability, matrix, RLS, or recovery-link behavior changed.
- **PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 7 inherited MEDIUM, 1 LOW documentation-only correction in this round; 22/22 FR/SC items mapped.

## S33 SK-52 fix round 5 refresh

- **Date:** 2026-11-04T22:56:44+02:00 (after the S33 PR #52 round-5 edits).
- **Analyzed commit:** `70d465e1b2c76f952e8222b212acafc36520eabf` (parent of this round-5 fix commit; the analyzed state is held in that revision, and this section lands in the round-5 fix commit). Round 4 landed as `70d465e1b2c76f952e8222b212acafc36520eabf`.
- **Scope:** static consistency and evidence review; no tests, scans, stacks, deployments, cloud queries, or implementation actions performed. This round changes `specs/004-auth/plan.md` (Constitution IV Scope row) and this refresh only. No `spec.md` or `tasks.md` text changed.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F4-R5-01 | LOW | `specs/004-auth/plan.md:39` (Constitution IV Scope row) | The line said the WO/Trainer extension was "owner decision 2026-10-27, to be registered as D-19 (PO approval in this PR)", contradicting the recorded approved state of D-19. | Corrected as documentation-only wording: the row now records D-19 as approved and the recovery scope authority — "clients only; all workspace Trainers may issue a link for any client in the workspace; copy-only delivery; keep as built/F4 owns recovery/client lookup from P1" (verbatim from `docs/04-changes-and-questions.md` D-19, approved S31-PO-2/SK-004-01; `specs/004-auth/spec.md` decision register). No capability, matrix, RLS, or tasks text changed; requirement meaning unchanged; no FR/SC re-mapping. |

### Coverage and verdict

- FR-to-task mapping remains 15/15; SC-to-task mapping remains 7/7 (22/22 total). No task checkbox or evidence status changed.
- Requirement semantics are unchanged (S31-PO-2/3 remain the authority; no scope or behavior change); no FR/SC re-mapping is required. ND-F4-7 and implementation/configuration gaps remain explicit.
- Constitution I/III/IV alignment is preserved: the plan now matches the recorded D-19 approval; no capability, matrix, RLS, or recovery-link behavior changed.
- **PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 7 inherited MEDIUM, 1 LOW documentation-only correction in this round; 22/22 FR/SC items mapped.
