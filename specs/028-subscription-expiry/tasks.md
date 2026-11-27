---
description: 'Dependency-ordered implementation tasks for subscription expiry notices'
---

# Tasks: Subscription expiry notices and scoped client list

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts](contracts/)

All tasks are implementation work for a later authorized feature lane. None is completed in this docs-only spec PR. All authorization, lifecycle, notice, list, UI, and retention tests are RED-first and precede implementation.

## Phase 1: RED acceptance contracts

- [ ] T001 [FR-003, FR-009, FR-010, SC-002, SC-005] Add RED contract tests for direct reader/list RPC denial by foreign workspace, revoked user, Sales, Client, anonymous, and unknown IDs; assert no existence/count disclosure.
- [ ] T002 [FR-003, FR-009, FR-012, SC-002] Add RED role matrix tests for PO platform, own-workspace WO, every Trainer with coaching access in the client workspace, Trainer without that access, Sales deny, Client self-only, and P7 audit exclusion before changing RLS/RPC code.
- [ ] T003 [FR-007, FR-009, SC-002] Add RED tests for per-recipient read/dismiss state, repeated operations, foreign IDs, and no cross-recipient mutation.
- [ ] T004 [FR-008, FR-009, FR-010, SC-005] Add RED directory cursor/filter/page-size/count tests for the inclusive `now` and exclusive `now + 72h` edges, all-Trainer coaching-access scope, foreign workspace, malformed filter, and empty result behavior.
- [ ] T005 [FR-001, FR-004, FR-005, SC-003, SC-004] Add RED exact Cairo boundary conversion tests based on F13 FR-004, including expected UTC instants for 2026-04-24 and 2026-10-30, T-3 = expiry minus exactly 72 elapsed hours, and client T-1 = expiry minus exactly 24 elapsed hours.
- [ ] T006 [FR-004, FR-005, FR-006, SC-003] Add RED state/stage fixtures for awaiting_activation, future, active, frozen, expired, refunded, deactivated, closed and purged; include before/at/after effective expiry.
- [ ] T007 [FR-005, FR-006, SC-001, SC-003] Add RED lifecycle race tests where renewal, freeze, date correction, refund, membership revocation, or reassignment wins before enqueue; assert post-lock projection/recipient recheck suppresses stale or unauthorized rows.
- [ ] T008 [FR-001, FR-002, FR-006, FR-007, FR-013, SC-001, SC-002, SC-004] Add RED client/staff notice tests for all stages, including T-1 at expiry minus 24h; 1,000 repeated/concurrent scans; client/staff read and dismiss; immediate-once T-3 for each applicable recipient when first eligible with upcoming expiry under 72 hours; client T-1 remains tied to its own due instant; per-revision stage dedup; retained delivered rows; obsolete due-instant suppression; no renewal CTA; and empty/error states.
- [ ] T009 [FR-011, FR-012, SC-006] Add RED F26 retention tests: active account retains notices; closure/deletion starts 30-day relationship clock; tied refund/dispute hold pauses and restarts; audit notices follow independent 30-day creation clock; purge activation remains gated.

## Phase 2: Idempotent lifecycle evaluator and producer

- [ ] T010 [FR-004, FR-005, FR-006, SC-003] Extend the current evaluator to use F13's Cairo exclusive-end date conversion and shared subscription lock order; after waits resample time, recompute state/end, and re-resolve recipients before enqueue.
- [ ] T011 [FR-002, FR-003, FR-006, FR-012, SC-001, SC-007] Extend current client/staff producer seams with allowed notice kinds, `(subscription, effective-expiry revision, stage)` dedup identity plus recipient-scoped rows, IDs-only payloads, and safe audit metadata.
- [ ] T012 [FR-002, FR-006, FR-009, FR-013, SC-001, SC-002] Add evaluator call to the existing Worker scheduled dispatch/outbox path; retain one cron schedule and PII-free errors/results.
- [ ] T013 [FR-001, FR-005, FR-006, FR-007, FR-009, SC-002, SC-004] Extend existing client/staff notice readers, read/dismiss mutations and adapters; check current authorization at every operation.

## Phase 3: Existing directory and notification surfaces

- [ ] T014 [FR-008, FR-009, FR-010, FR-013, SC-002, SC-005] Extend existing staff directory query/UI with `expiring` (`now <= expiry < now + 72h`) and F13-expired filters; include all Trainers with current coaching access; reuse the existing 100-row max, stable page/count and query-plan evidence; no new list route/page.
- [ ] T016 [FR-013, SC-007] Obtain per-screen PO copy approval before implementing proposed AR/EN strings; verify Design Gate screenshot coverage for AR-RTL/EN-LTR, light/dark, mobile/desktop, keyboard and accessibility states.
- [ ] T015 [FR-001, FR-002, FR-007, FR-013, SC-007] Build ONE shared notifications surface in the staff app shell listing F15 form alerts (`read_form_alert_inbox`, `mark_form_alert_read`, `app/api/forms/alerts/route.ts`), F23 `staff_inbox_notices` (`read_staff_notices`, `mark_staff_notice_read`), and new expiry kinds. Reuse existing readers/mutations and per-recipient state; fetch on open and refresh after action; cover accessible empty/error/loading/mobile/desktop/light/dark/AR/RTL/EN/LTR states; introduce no new inbox, table, job, or Realtime publication. Copy is PROPOSED.

## Phase 4: Retention and acceptance

- [ ] T017 [FR-011, FR-012, SC-006] Extend F26's existing purge allowlist for expiry notice rows and linked IDs; do not add a scheduler, do not imply activation, and preserve audit creation-clock behavior.
- [ ] T018 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007] Run acceptance suites for each FR/SC, direct-RPC/RLS probes, exact-time fixtures, lifecycle races, worker reruns/concurrency, directory and UI; record exact-head evidence in traceability.
- [ ] T019 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007] Reconcile implementation/research evidence and re-Analyze after requirement/plan/task text changes; complete required implementation CI gates.

## Dependencies

T001-T009 are RED tests and precede all implementation tasks T010-T017. S71-PO-6 resolves Trainer scope and revision-pair behavior; S71-R12 supplies the short-lead and 72-hour window technical defaults. These decisions are encoded in the requirements and tests. T018-T019 follow all affected slices.
