# Specification Analysis: F24 Client Leaderboard

**Date**: 2026-11-15  
**Run**: full re-run after the S57-PO-1, S57-PO-2, S57-PO-3, S57-PO-4, S57-PO-6, S57-PO-7 and S57-PO-12 decisions changed requirement, acceptance, success-criteria, data-model, contract, plan and task text.  
**Inputs**: `spec.md`, `plan.md`, `tasks.md`, `data-model.md`, `contracts/`, `research.md`, `traceability.md`, `copy-proposal.md`, `.specify/memory/constitution.md`  
**Requirements**: 43 FRs, 10 SCs  
**Tasks**: 40

## S57 decisions applied

- S57-PO-1 (goal type and progress formula): FR-014, FR-018 and the new FR-043; the ClientGoalType entity; the goal-type contract; tasks T036 and T037.
- S57-PO-2 (last scoring input) and S57-PO-3 (registration order): FR-021, the Story 3 scenarios and task T037.
- S57-PO-4 (monthly mean): FR-017 and task T037.
- S57-PO-6 (full ranking, private rank, promotion without reapproval): FR-002, FR-008, FR-019, FR-020, FR-027, FR-029, the new FR-041, SC-001, the new SC-009 and SC-010, the Story 1 and Story 2 scenarios, the edge cases, the data model and the contract; tasks T038 and T039.
- S57-PO-7 (signup keeps the generic message): FR-022 and the contract.
- S57-PO-12 (Top 5 inside Progress; private rank for eligible clients only; approved copy): FR-022, FR-027, FR-041, the new FR-042, `copy-proposal.md`, the plan structure and tasks T029 and T040.

## Findings

No open CRITICAL, HIGH, MEDIUM or LOW findings.

- The earlier "at most 5 entries" wording (FR-002, SC-001, data-model invariant 2) is reconciled with the full ranking: the stored ranking holds all eligible clients; only the public view is capped at five.
- The FR-019 past-winner rule is reconciled with the full ranking: past winners are the clients currently shown in the public Top 5, and the rule governs the Top 5 boundary only.
- The private rank (FR-041) and placement (FR-042) are new requirements; both are mapped to tasks and success criteria. FR-041 states the total-participants reading (all ranked clients, opted-out included) and that ineligible clients see no private rank.
- The plan route list now matches the implemented routes, including the staff/PO surfaces under `app/(app)/workspace-leaderboard/` (which avoid colliding with the client route) and the Progress placement.
- Copy: the S57-PO-12 strings are recorded as APPROVED. Earlier proposals that the decision does not change stay marked PROPOSED (awaiting the PO's edits) and are not shipped as approved.

## Coverage Summary

All 43 functional requirements have at least one task reference (43/43, 100%). All 10 success criteria map to task groups in `traceability.md`. No task is unmapped. HIGH-RISK markers cover the new goal-type store (T036), the full-ranking storage and public cap (T038), and the private-rank wall (T039), each with kill/restore/diff mutation evidence. Feature flags remain cancelled (S56-PO-4) for T001 and T035.

## Constitution Alignment

No CRITICAL or HIGH constitution conflicts. The goal-type store is workspace-scoped, has forced RLS with no grants, uses composite keys and audited coaching-staff RPCs, and denies Sales. The private rank returns only the caller's own rank and total, with no client argument. The public view stays a rank/username allow-list. The near-term goal reference is read only through F15's audited answer reader. Bilingual copy follows the S57-PO-12 approvals.

## Duplication and Inconsistency

No unresolved contradiction across the FRs, scenarios, success criteria, entity model, plan, contracts, tasks and copy proposal. Spec 023 remains read-only and is consumed through its contract; F13 lifecycle, F15 forms/answers and F19 delivery are reused, not duplicated.

## Metrics

- Total requirements: 43 FRs; 10 SCs
- Total tasks: 40
- FR task coverage: 100% (43/43)
- Open CRITICAL: 0
- Open HIGH: 0
- Open MEDIUM: 0
- Open LOW: 0

## Result

PASS for Plan/Tasks/Analyze after the S57 decisions. Spec consistency passes. Traceability evidence statuses stay NOT-IMPLEMENTED until CI evidence for each mapped test is recorded (T033).

## History

- 2026-11-14: S55-PO-10 approved copy; S55-PO-11 month label; S56-PO-4 cancelled the feature-flag tasks T001 and T035. No open findings at that time.
