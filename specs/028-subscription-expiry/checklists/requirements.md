# Requirements Checklist: Subscription expiry notices and scoped client list

**Purpose**: Specify/Clarify quality gate using the repository checklist lifecycle.
**Created**: 2026-11-27
**Feature**: [spec.md](../spec.md)

## Scope and source

- [x] CHK001 S71-PO-1 approved staff notices, timing, recipients, and scoped list are carried without reopening.
- [x] CHK002 PRD-07 client T-3/T-1/expiry behavior and no renewal CTA are preserved.
- [x] CHK003 P8 leaderboard spec 024 is excluded.
- [x] CHK004 Reuse decisions cite existing F13/F15/F22/F23/F26/worker/cron surfaces.

## Authorization and lifecycle

- [x] CHK005 PO/WO/Trainer/Sales/Client access is specified; pending Trainer interpretation is an MCQ.
- [x] CHK006 Current F13 effective expiry and state changes drive stage eligibility.
- [x] CHK007 Retry/concurrency idempotency and per-recipient read/dismiss are explicit.
- [x] CHK008 Retention, audit, P7 audit isolation, and no Realtime publication are explicit.

## Pending decisions

- [ ] CHK009 Resolve MCQ 028-01 Trainer definition before implementing Trainer recipient/list access.
- [ ] CHK010 Resolve MCQ 028-02 short-lead catch-up before implementing that boundary.
- [ ] CHK011 Resolve MCQ 028-03 post-delivery extension identity before implementing revision behavior.
