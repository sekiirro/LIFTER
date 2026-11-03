# Analyze: F11 Client Accounts and Signup

- **Date:** 2026-11-03
- **Analysed commit:** `0649423752419979d7f0eb3ef29ad2bf24689075` (Part 3 branch head before the local F11 clarification)
- **Scope:** static artifact/source/evidence review; no tests executed.
- **Inventory:** `spec.md` (FR-001..017, SC-001..012, PO Clarifications and decision register), `plan.md`, `tasks.md` (46 tasks and historical T046 PO approval), research/data-model/contract/quickstart, `checklists/requirements.md`; no feature Analyze or traceability artifact existed.

## Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F11-A01 | MEDIUM | `spec.md:FR-010`, ND-F11-7; D-20 | Signup-attempt logs have a decided 30-day period, but other audit-event retention remains unresolved under B4/ND-F5-1. | Preserve the explicit separation and raise SK-011-01; do not infer a retention period for other audit events. |
| F11-A02 | MEDIUM | `spec.md:FR-007`, ND-F11-9a/9b, SC-011 | Archived-state and admin-review design is explicitly deferred until ND-F5-1; archived collisions must continue to use generic D-08 output. | Preserve the bounded collision behavior and raise SK-011-02 for the later archive/reviewer decision. |

## Coverage and consistency

- FR-to-task mapping: 17/17; SC-to-task mapping: 12/12. The 46-task structure and historical PO approval of T046 remain unchanged.
- Clarifications cite the PO decision register and distinguish decided F11 attempt-log retention from open B4/other-audit retention and archived-state decisions.
- Static source/test evidence was inspected. No tests executed and no task checkboxes changed.

## Verdict

**PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 2 MEDIUM; 29/29 FR/SC items mapped. Static evidence only.
