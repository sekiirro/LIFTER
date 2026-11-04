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
