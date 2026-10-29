# Specification Quality Checklist: F13 — Freeze, renewal, refunds and expiry

**Purpose**: Review specification quality after Session 12/13 PO decisions. Checked means requirements-quality review, not implementation, executed acceptance tests or approval to implement.

**Feature**: [spec.md](../spec.md)

**Architecture**: [ledger-architecture.md](../ledger-architecture.md)

**Debate**: [debate.md](../debate.md)

## Content quality

- [x] Scope, ownership and binding sources are identified.
- [x] User stories cover refunds, freezes, renewals, expiry and role boundaries.
- [x] Functional requirements are testable and trace to decisions.
- [x] Superseded D-09/D-15 assumptions are called out.
- [x] Cairo date, installment timing, concurrency and idempotency cases are specified.
- [x] Architecture proposal distinguishes logical guarantees from unmerged F12 runtime work.

## Remaining decisions and confidence

- [x] ND-01 DECIDED 2026-10-29 (Final PO APPROVAL): Freeze duration is 1–30 calendar days; freezes do not overlap, while sequential freezes are allowed. The Apply day counts as frozen and the STOP day is excluded.
- [x] ND-08 DECIDED 2026-10-29 (Final PO APPROVAL): Purchases remain financially independent. A refund never automatically refunds or shifts another purchase. PO-1 global client deactivation applies; any other-purchase resolution is manual.
- [x] Resolve PO-1 commit-to-worker token issuance window with a Stack C Custom Access Token hook: committed deactivation denies new password sign-in and refresh while the worker fails; existing JWT expiry remains accepted.
- [x] Refund cap, proportional commission, idempotency and lock-order arguments each include a worked numeric/ordering example.

## Traceability and scope

- [x] F13-1..11, PO-1, PO-2 and RET-1..3 have explicit FR traceability.
- [x] AT-FIN-09/10 are updated for partial refunds; obsolete AT-FIN-12 is marked superseded.
- [x] P4/P5 integration and production retention gates remain separate; no execution evidence is claimed.
- [x] FR-001..036, SC-001..013, and the two remaining NDs (ND-01/ND-08) are represented.
- [x] No plan/tasks, code, migrations, DB operations, or shared-register edits are included.

**Status**: Draft for architect review. This checklist does not authorize implementation or claim any acceptance test has run.
