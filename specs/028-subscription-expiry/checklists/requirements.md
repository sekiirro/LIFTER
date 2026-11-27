# Requirements Checklist: Subscription expiry notices and scoped client list

**Purpose**: Specify/Clarify quality gate using the repository checklist lifecycle.
**Created**: 2026-11-27
**Feature**: [spec.md](../spec.md)

## Scope and source

- [x] CHK001 S71-PO-1/6 and S71-R12 approved scope, recipient rules, revision identity, short-lead behavior, and list window are recorded without reopening.
- [x] CHK002 PRD-07 client T-3/T-1/expiry behavior and no renewal CTA are preserved.
- [x] CHK003 P8 leaderboard spec 024 is excluded.
- [x] CHK004 Reuse decisions cite existing F13/F15/F22/F23/F26/worker/cron surfaces; one shared staff notifications surface uses existing F15/F23 readers and mutations.

## Authorization and lifecycle

- [x] CHK005 PO/WO/all Trainers with current coaching access/Sales/Client access is specified in requirements, contracts, and test tasks.
- [x] CHK006 Current F13 effective expiry and state changes drive stage eligibility.
- [x] CHK007 Retry/concurrency idempotency and per-recipient read/dismiss are explicit.
- [x] CHK008 Retention, audit, P7 audit isolation, and no new inbox/table/job/Realtime publication are explicit.

## Decision status

No open PO decisions remain. Architect technical defaults are identified separately from PO answers in `po-mcqs.md`.
