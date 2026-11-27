# Analyze Checklist: Subscription expiry notices and scoped client list

**Created**: 2026-11-27 01:14 UTC
**Spec/plan/tasks last changed**: 2026-11-27 01:14 UTC
**Independent critique**: Sol Medium, recorded in [critique-sol-medium.md](critique-sol-medium.md); 3 HIGH and 3 MEDIUM findings corrected.
**Purpose**: Spec Kit post-Tasks requirements consistency and traceability analysis.

## Scope and source fidelity

- [x] S71-PO-1/6 scope and S71-R12 technical defaults are applied: PO, relevant WO, all Trainers with current workspace coaching access, revision-stage notices, and scoped expiring/expired list.
- [x] Client PRD-07 notices at T-3/T-1/expiry are preserved with no renewal CTA.
- [x] P8 drill-down/export/pen-test/performance are split into specs 029-031; leaderboard remains excluded because spec 024 owns it.
- [x] F13 is the lifecycle source; F22/F23 inboxes, F11 T057/F15 alert path, current Worker cron, staff directory, and F26 retention/purge are reused and differentiated.

## Requirements and traceability

- [x] FR-001..FR-013 have measurable SC coverage and Given/When/Then acceptance in the FR Acceptance Matrix.
- [x] Role matrix covers PO, WO, Trainers with and without workspace coaching access, Sales, Client, revoked, foreign and anonymous actors at app and DB/RLS boundaries.
- [x] Cairo exclusive-date conversion, T-3 instant, all F13 states and lifecycle race are explicit.
- [x] Retry/concurrency identity is `(subscription, effective-expiry revision, stage)`; delivered rows remain, obsolete due instants are suppressed, and read/dismiss is per recipient.
- [x] Short-lead T-3 catch-up and inclusive-now/exclusive-72-hour list window are specified as S71-R12 technical defaults.
- [x] One shared staff notifications surface lists F15 form alerts, F23 notices, and expiry kinds via existing read/mark APIs; no new inbox/table/job/Realtime publication.
- [x] F26 active-account/closure clock, dispute hold/restart, audit creation clock and inactive purge gate are explicit.
- [x] Tasks T001-T009 are RED tests and precede T010-T017 implementation; all tasks cite FR IDs.
- [x] Copy table is clearly PROPOSED; per-screen approval remains required.

## Findings

- CRITICAL: 0 open.
- HIGH: 0 open. Three independent critique findings were fixed and recorded; required changes after critique are analyzed here.
- MEDIUM: 0 open. Three independent critique findings were fixed and recorded.
- PO decisions: 0 remaining. MCQ 028-01/03 are DECIDED by S71-PO-6; 028-02/04 are S71-R12 architect technical defaults.
- Constitution conflicts: none. No amendment proposed.

No open ambiguities remain. Proposed copy still requires per-screen approval.

## S71 final re-Analyze status

The post-correction `/speckit-analyze` rerun was attempted twice on 2026-11-27 and both attempts failed before analysis with `Unable to connect to API: SSL certificate verification failed`. The prior Analyze findings were corrected in the spec package, but current CRITICAL/HIGH counts are unverified. Do not treat this checklist as final acceptance until Speckit Analyze completes on the changed requirement text.
