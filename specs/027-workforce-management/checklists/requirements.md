# Specification Quality Checklist: P7 Workforce Management

**Purpose**: Review requirement quality and PO decision boundaries.
**Feature**: spec.md.
**Review ownership**: Requirement quality only; checklist completion does not mean implementation completion.

## Requirement coverage and clarity

- [x] Numbered FRs, measurable SCs and Given/When/Then acceptance scenarios.
- [x] All SOL-01..24 findings mapped in checklists/critique.md with ruling, authority and artifact paths.
- [x] Trigger-month attribution, immutable closed months, current-month corrections and payroll ownership are explicit.
- [x] Durable non-PII earned ledger, F10 source-unit map/backfill, unique refund reversal, F13 full-refund predicate and latest-effective quality revisions are explicit.
- [x] Due evaluator, reminder/outbox, payroll snapshot approval, F26 purge/hold, distinct funnel counts and channel inventory are tasked.
- [x] F15 persisted plan deadline and current-assignment-at-breach attribution are explicit.
- [x] Strike correction is separate from point correction; Telegram penalty is post-launch only.

## Authorization, privacy and accounting

- [x] PO/WO/Trainer/Sales permission matrix covers UI/API/RPC/RLS/exports and audit paths.
- [x] Sales sees only own finalized month total after month-end; no details via Realtime/counts/notifications/cache/replay.
- [x] F19 source remains immutable; retained P7 facts have no client FK/PII; F26 tied-dispute hold is explicit.
- [x] Person-level salary is monthly, currency is market-allowed, platform PO owns it, staff see own only.
- [x] Manual monetary entries are separate from points; one payroll approval binds to reviewed immutable snapshot.
- [x] Shared workspace+month fence and source-lock ordering are specified.

## PO decisions and copy

- [x] S70-PO-16, S70-R95 and S70-PO-18 decisions are recorded and not re-asked.
- [x] P7-MCQ-01/02 and SOL-08/09/20 are answered; no PENDING-PO FR remains.
- [x] UI copy approval is per screen batch; no Arabic or English UI copy has been invented or treated as approved.
- [x] Telegram response speed remains post-launch documentation only in this lane.

## Status

Requirement review complete. Constitution C1/C2 are recorded as resolved by the separate pending Constitution 1.20.0 amendment PR; no other CRITICAL/HIGH Analyze finding remains. Constitution is unchanged in this PR.
