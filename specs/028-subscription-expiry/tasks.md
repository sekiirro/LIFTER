---
description: 'Dependency-ordered implementation tasks for subscription expiry notices'
---

# Tasks: Subscription expiry notices and scoped client list

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts](contracts/)

All tasks are implementation work for a later authorized feature lane. None is completed in this docs-only spec PR. All authorization, lifecycle, notice, list, UI, and retention tests are RED-first and precede implementation.

## Phase 1: RED acceptance contracts

- [ ] T001 [FR-003, FR-009, FR-010] Add RED contract tests for direct reader/list RPC denial by foreign workspace, revoked user, Sales, Client, anonymous, and unknown IDs; assert no existence/count disclosure.
- [ ] T002 [FR-003, FR-009, FR-012] Add RED role matrix tests for PO platform, own-workspace WO, Trainer scope, Sales deny, Client self-only, and P7 audit exclusion before changing RLS/RPC code.
- [ ] T003 [FR-007, FR-009] Add RED tests for per-recipient read/dismiss state, repeated operations, foreign IDs, and no cross-recipient mutation.
- [ ] T004 [FR-010] Add RED directory cursor/filter/page-size/count tests, including window edges from MCQ 028-04, foreign workspace, malformed filter, and empty result behavior.
- [ ] T005 [FR-004, FR-005] Add RED exact Cairo boundary conversion tests based on F13 FR-004, including expected UTC instants for 2026-04-24 and 2026-10-30 and T-3 = expiry minus exactly 72 elapsed hours.
- [ ] T006 [FR-004, FR-005, FR-006] Add RED state/stage fixtures for awaiting_activation, future, active, frozen, expired, refunded, deactivated, closed and purged; include before/at/after effective expiry.
- [ ] T007 [FR-005, FR-006] Add RED lifecycle race tests where renewal, freeze, date correction, refund, membership revocation, or reassignment wins before enqueue; assert post-lock projection/recipient recheck suppresses stale or unauthorized rows.
- [ ] T008 [FR-001, FR-002, FR-006, FR-007, FR-013] Add RED client/staff inbox tests for all notice stages, repeated/concurrent scans, client/staff read and dismiss, short-lead behavior from MCQ 028-02, extension behavior from MCQ 028-03, no renewal CTA, and empty/error states.
- [ ] T009 [FR-011, FR-012] Add RED F26 retention tests: active account retains notices; closure/deletion starts 30-day relationship clock; tied refund/dispute hold pauses and restarts; audit notices follow independent 30-day creation clock; purge activation remains gated.

## Phase 2: Idempotent lifecycle evaluator and producer

- [ ] T010 [FR-004, FR-005, FR-006] Extend the current evaluator to use F13's Cairo exclusive-end date conversion and shared subscription lock order; after waits resample time, recompute state/end, and re-resolve recipients before enqueue.
- [ ] T011 [FR-002, FR-003, FR-006, FR-012] Extend current client/staff producer seams with allowed notice kinds, per-recipient/subscription/stage dedup keys, IDs-only payloads, and safe audit metadata.
- [ ] T012 [FR-002, FR-006, FR-009, FR-013] Add evaluator call to the existing Worker scheduled dispatch/outbox path; retain one cron schedule and PII-free errors/results.
- [ ] T013 [FR-001, FR-005, FR-006, FR-007, FR-009] Extend existing client/staff notice readers, read/dismiss mutations and adapters; check current authorization at every operation.

## Phase 3: Existing directory and notification surfaces

- [ ] T014 [FR-008, FR-009, FR-010, FR-013] Extend existing staff directory query/UI with PO-approved expiring-window and F13-expired filters; bounded stable page/count; no new list route/page.
- [ ] T015 [FR-001, FR-002, FR-007, FR-013] Extend current notification presentation for expiry kinds, per-recipient state, fetch-on-open/refresh-after-action, and accessible empty/error/loading/mobile/AR/RTL/EN/LTR states; no new inbox or Realtime publication.
- [ ] T016 [FR-013] Obtain per-screen copy approval before shipping any proposed AR/EN strings; verify Design Gate screenshots/accessibility for existing surfaces.

## Phase 4: Retention and acceptance

- [ ] T017 [FR-011, FR-012] Extend F26's existing purge allowlist for expiry notice rows and linked IDs; do not add a scheduler, do not imply activation, and preserve audit creation-clock behavior.
- [ ] T018 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Run acceptance suites for each FR, direct-RPC/RLS probes, exact-time fixtures, lifecycle races, worker reruns/concurrency, directory and UI; record exact-head evidence in traceability.
- [ ] T019 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Reconcile implementation/research evidence and re-Analyze after requirement/plan/task text changes; complete required implementation CI gates.

## Dependencies

T001-T009 are RED tests and precede all implementation tasks T010-T017. MCQ 028-01 gates Trainer access implementation; 028-02 gates short-lead catch-up; 028-03 gates post-delivery extension semantics; 028-04 gates the expiring-window predicate. Other roles, stages, tests, and retention groundwork can proceed independently. T018-T019 follow all affected slices.
