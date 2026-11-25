# Specification Quality Checklist: P7 Workforce Management

**Purpose**: Review requirement quality and PO decision boundaries.
**Created**: 2026-11-25
**Feature**: [spec.md](../spec.md)

**Review Ownership**: Requirement quality only; `[x]` does not indicate implementation completion.

## Requirement coverage and clarity

- [x] All functional requirements have stable FR identifiers and testable outcomes.
- [x] Success criteria have stable SC identifiers and measurable pass conditions.
- [x] Each primary user journey has Given/When/Then acceptance scenarios.
- [x] Edge cases cover duplicates, negative totals, refund replay, late-state history, retention, revocation and month-close concurrency.
- [x] Reused system ownership is named for F10/F11/F12/F13/F15/F19/F20/F23/F26; duplicate Forms engine is excluded.
- [x] Net formula, penalty values, refund reversal and month snapshot concepts are explicit.

## Authorization, privacy and accounting

- [x] PO/WO/Trainer/Sales permissions are defined in an explicit matrix with deny-by-default treatment for unlisted P7 capabilities.
- [x] Sales confidentiality is explicit at UI/API/RPC/RLS/export/cache/replay boundaries.
- [x] Staff compensation is self-only; payroll approval means externally paid; automated payouts/salary deductions are excluded.
- [x] F19 immutability and separate append-only KPI ledger/reversal/correction history are specified.
- [x] F26 retention interaction preserves non-PII staff attribution in the KPI ledger, not `audit_events`.
- [x] Idempotency and serialization requirements cover double-clicks, retries, PO edits and month close.

## PO decisions and copy

- [x] Binding S70-PO-16 decisions are cited and not re-asked.
- [x] Open product decisions are numbered MCQs with three options, recommendation and custom answer.
- [x] FR-008 salary unit/currency is PENDING-PO only; decided payroll boundaries remain explicit.
- [x] FR-014/FR-021 post-finalization correction policy is PENDING-PO.
- [x] Arabic/English copy table introduces no unapproved user-facing strings; Egyptian Arabic is explicitly awaiting PO-approved copy.
- [x] Telegram response speed is post-launch documentation only, with unverified capability claims marked as such.

## Status

Review complete. Two Constitution conflicts remain CRITICAL in `checklists/analyze.md`; plan.md contains proposed amendment text only. This checklist does not authorize Constitution edits or implementation.
