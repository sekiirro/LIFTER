# Analyze Checklist: Subscription expiry notices and scoped client list

**Created**: 2026-11-27 00:12 UTC
**Spec last changed**: 2026-11-27 00:08 UTC
**Plan/tasks last changed**: 2026-11-27 00:08 UTC
**Independent critique**: Sol Medium, recorded in [critique-sol-medium.md](critique-sol-medium.md); 3 HIGH and 3 MEDIUM findings corrected.
**Purpose**: Spec Kit post-Tasks requirements consistency and traceability analysis.

## Scope and source fidelity

- [x] S71-PO-1 scope is applied without reopening: staff notifications at T-3/expiry for PO, relevant WO, authorized Trainers, and scoped expiring/expired list.
- [x] Client PRD-07 notices at T-3/T-1/expiry are preserved with no renewal CTA.
- [x] P8 drill-down/export/pen-test/performance are split into specs 029-031; leaderboard remains excluded because spec 024 owns it.
- [x] F13 is the lifecycle source; F22/F23 inboxes, F11 T057/F15 alert path, current Worker cron, staff directory, and F26 retention/purge are reused and differentiated.

## Requirements and traceability

- [x] FR-001..FR-013 have measurable SC coverage and Given/When/Then acceptance in the FR Acceptance Matrix.
- [x] Role matrix covers PO, WO, Trainer, Sales, Client, revoked, foreign and anonymous actors at app and DB/RLS boundaries.
- [x] Cairo exclusive-date conversion, T-3 instant, all F13 states and lifecycle race are explicit.
- [x] Retry/concurrency idempotency and read/unread/dismiss per recipient are explicit.
- [x] Expiring list horizon is PENDING-PO (MCQ 028-04); row/count predicates are constrained to match.
- [x] F26 active-account/closure clock, dispute hold/restart, audit creation clock and inactive purge gate are explicit.
- [x] Tasks T001-T009 are RED tests and precede T010-T017 implementation; all tasks cite FR IDs.
- [x] Copy table is clearly PROPOSED; per-screen approval remains required.

## Findings

- CRITICAL: 0 open.
- HIGH: 0 open. Three independent critique findings were fixed and recorded.
- MEDIUM: 0 open. Three independent critique findings were fixed and recorded.
- PENDING-PO: MCQ 028-01, 028-02, 028-03, 028-04. These are product choices, not hidden defaults; affected behavior remains gated and independent work continues.
- Constitution conflicts: none. No amendment proposed.

No open ambiguities are assumed beyond the four explicitly numbered MCQs.
