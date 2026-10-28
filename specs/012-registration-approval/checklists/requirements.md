# Requirements Quality Checklist: F12 — Registration approval and payment recording

**Purpose**: Review specification quality, completeness, traceability, and treatment of unresolved decisions.
**Created**: 2026-10-28
**Feature**: [spec.md](../spec.md)

**Note**: This checklist records requirements review only. A checked item does not mean implementation or policy approval is complete.
**Review Ownership**: Requirements quality review by the specification author; PO decisions remain open as marked in the spec.

## Scope and traceability

- [x] CHK001 Scope states F12 outcomes and dependencies on F10/F11.
- [x] CHK002 F13, P2, and P4 exclusions are stated.
- [x] CHK003 Business requirements trace to BRD/PRD, D-08..D-17, constitution, and F9/F10/F11 artifacts.
- [x] CHK004 Architect r1 supersedes v0 on conflicts and its ten technical outcomes are represented.
- [x] CHK005 Specification clearly states it is not implementation approval and creates no plan/tasks.

## User stories and acceptance criteria

- [x] CHK006 User stories have priorities, value statements, independent tests, and acceptance scenarios.
- [x] CHK007 Approval, rejection, later installment recording, live approval visibility, isolation/denials, concurrency, and replay are covered.
- [x] CHK008 Acceptance scenarios state observable outcomes and failure behavior without relying on UI as a security boundary.
- [x] CHK009 Edge cases cover snapshot staleness, exact money, Cairo dates, authorization revocation, duplicate collection, and audit failure.

## Requirement quality

- [x] CHK010 FR numbering is unique and sequential; measurable SC numbering is unique and sequential.
- [x] CHK011 Requirements use clear normative language and identify relevant role, scope, and failure conditions.
- [x] CHK012 Key entities describe business meaning without prescribing SQL or migration implementation.
- [x] CHK013 Security, privacy, money integrity, idempotency, and live status requirements are explicit.
- [x] CHK014 UI requirements reference the Frontend Design Gate and DESIGN.md; the gate document's pending-merge status is stated in the spec.

## Decisions and constitution

- [x] CHK015 ND-F12-1..7 each state OPEN (PO), the question, and a separately labeled conservative default that is explicitly NOT approved.
- [x] CHK016 DG-F12-1..4 each state OPEN (PO design decision).
- [x] CHK017 Constitution I..IX are each checked against the specified scope and requirements.
- [x] CHK018 No open policy is silently promoted to an approved default; acceptance criteria preserve the dependencies on PO decisions.
- [x] CHK019 The spec no longer depends on machine-local source or design-gate paths.
- [x] CHK020 The in-repository debate record includes v0, the verbatim critique, architect response r1, thread id, date, models, and outcome.
- [x] CHK021 Source review found no email addresses or secret-like assignments in the three debate texts.

## Notes

- Plan/tasks and implementation verification are intentionally pending PO decisions and later Spec Kit phases.
- `docs/09-frontend-design-gate.md` is referenced as added by branch `docs-workflow-governance`, pending merge to main; it is not present in this worktree's base.
- Gate results, if run, are repository artifact checks only; they do not close checklist items about future implementation behavior.
