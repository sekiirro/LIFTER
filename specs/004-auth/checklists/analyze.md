# Analyze: F4 Authentication and manual recovery

- **Date:** 2026-11-03
- **Analysed commit:** `43963eab79d0cd4f511267d3a0ede1181f201e2a` (Part 3 branch head before the local F4 clarification; clarification included in this review)
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
