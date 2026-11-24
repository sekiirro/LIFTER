# Tasks: 023 Client Progress Coaching (P5 Progress)

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Status**: Spec-only. No task is ticked; no implementation is authorized. Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); this work proceeds without a flag; flags are reconsidered before production.

## Format

`[ID] [P?] [USn] Description` with exact target paths. `[HIGH-RISK: migration/RLS]` marks database migration, RLS, SECURITY DEFINER, grant, or audit-write work requiring independent review plus mutation evidence.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Feature module skeleton and shared contracts that unblock all stories.

- [x] T001 [P] Create the progress-coaching module skeleton and shared types/constants in `lib/progress-coaching/types.ts`, `lib/progress-coaching/constants.ts`, and `lib/progress-coaching/index.ts`. Evidence (CI green on bdefe1b8): lib/progress-coaching/types.ts, constants.ts; tests/unit/progress-coaching-timeline.test.ts.
- [x] T002 [P] Add copy key scaffolding only (no approved strings) in `lib/i18n/messages/en.ts` and `lib/i18n/messages/ar.ts`, keyed to `specs/023-client-progress-coaching/copy-proposal.md` (each row carries its approval status; all rows are approved). Evidence (CI green on bdefe1b8): lib/i18n/messages/en.ts and ar.ts (start-of-object block, approved S55-PO-10 keys only); progress-coaching-timeline.test.ts, progress-coaching-adherence.test.ts, progress-coaching-copy.test.ts.
- [x] T003 [P] Add shared validation schemas for F15 text limits and identifiers in `lib/progress-coaching/validation.ts` and `tests/unit/progress-coaching-validation.test.ts`. Evidence (CI green on bdefe1b8): identifiers in lib/progress-coaching/correction-input.ts and F15 text limits in lib/progress-coaching/food-replacement/validation.ts (path differs from the task text); tests/unit/progress-coaching-correction.test.ts, progress-coaching-food-replacement-validation.test.ts.

**Checkpoint**: Shared module and validation scaffolding ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before any user story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 [HIGH-RISK: migration/RLS] CANCELLED (PO S56-PO-4): add the `progress_coaching_enabled` feature flag, its migration, reader/writer and flag-specific tests.
- [x] T005 [P] Add authorization capabilities for progress coaching using the existing `authorize()` and `app_private.has_workspace_access` walls in `lib/progress-coaching/authorization.ts`, with parity tests in `tests/unit/progress-coaching-authorization.test.ts` and `tests/integration/progress-coaching-authorization-rls.test.ts`. Evidence (CI green on bdefe1b8): lib/progress-coaching/service.ts authorize(coaching_work) plus has_workspace_access in every RPC (no new authorization.ts); tests/unit/progress-coaching-correction.test.ts, tests/integration/progress-coaching.test.ts.
- [x] T006 [P] Add background audit event constants and the append-only writer helper in `lib/progress-coaching/audit.ts`, with tests in `tests/unit/progress-coaching-audit.test.ts` and `tests/integration/progress-coaching-audit.test.ts`. Evidence (CI green on bdefe1b8): supabase/migrations/20261118200300_f23_measurement_operations.sql (f23_write_measurement_correction), append-only progress_measurement_corrections; audit assertions in tests/integration/progress-coaching.test.ts.
- [x] T007 [P] Define the fixed client-timeline event-type contract and emission interfaces in `lib/progress-coaching/timeline/events.ts`, with tests in `tests/unit/progress-coaching-timeline-events.test.ts`. Evidence (CI green on bdefe1b8): lib/progress-coaching/constants.ts TIMELINE_EVENT_TYPES, parse.ts; tests/unit/progress-coaching-timeline.test.ts.

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — Weekly check-in (Priority: P1) 🎯 MVP

**Goal**: Schedule and deliver weekly check-ins with freeze-aware recurrence, reminders, non-gating login, KPI counting, and neutral adherence self-report capture.

**Independent Test**: Activate a synthetic subscription, assert first check-in at day 7 and then every 7 days including Fridays, apply a 3-day freeze, assert resume shift and no catch-up delivery, and assert reminders at 10:00 AM workspace time.

### Tests for User Story 1 (write first; must fail before implementation)

- [x] T008 [P] [US1] Unit tests for freeze-adjusted anchor calculation and no-catch-up behavior in `tests/unit/progress-coaching-checkin-schedule.test.ts` (FR-001, FR-002, FR-003, FR-004, SC-001, SC-002). Evidence (CI green on bdefe1b8): tests/unit/progress-coaching-checkin-schedule.test.ts.
- [x] T009 [P] [US1] Integration tests for F15 recurring assignment reuse: first occurrence at day 7, then every 7 days including Fridays, freeze pause/resume with shifted anchor, no missed deliveries, and outstanding forms remaining visible in `tests/integration/progress-coaching-checkins.test.ts` (FR-001, FR-002, FR-003, FR-004, SC-001, SC-002). Evidence (CI green on bdefe1b8): tests/integration/progress-coaching.test.ts, progress-coaching-activation-anchor.test.ts.
- [x] T010 [P] [US1] Integration tests for reminders at 10:00 AM workspace time on the due day and 24 hours later when unanswered, including idempotent dedupe keys, in `tests/integration/progress-coaching-checkin-reminders.test.ts` (FR-006, FR-007, FR-009, SC-003). Evidence (CI green on bdefe1b8): tests/integration/progress-coaching-reminders.test.ts (10:00 Cairo gate with SQL/TS instant parity, day-of then +24h follow-up, idempotent reruns, answered suppresses follow-up, owner-only run, client-only reads, foreign-workspace and staff negatives, mutants of the 10:00 gate and the answered filter). File name differs from the task text. Review fix B2: a late start sends only the follow-up (progress-coaching-review-fixes.test.ts, with mutant).
- [x] T011 [P] [US1] RLS and authorization tests for check-in occurrence reads/writes across client, trainer, workspace owner, platform owner, and denied sales/anonymous actors in `tests/integration/progress-coaching-checkins-rls.test.ts` (FR-001, FR-005, FR-009). Evidence (CI green on bdefe1b8): tests/integration/progress-coaching.test.ts (in-transaction and PostgREST denials).
- [x] T012 [P] [US1] UI and accessibility tests for login non-gate, neutral adherence self-report presentation, and absence of leaderboard scoring mechanics in `tests/unit/progress-coaching-checkin-ui.test.tsx` and `tests/e2e/progress-coaching-checkins.spec.ts` (FR-005, FR-037, FR-038, SC-011). Evidence (CI green on bdefe1b8): tests/unit/progress-coaching-adherence.test.ts; tests/e2e/progress-coaching-screenshots.spec.ts (check-in form, no scoring vocabulary).

### Implementation for User Story 1

- [x] T013 [US1] Implement freeze-aware weekly check-in scheduling by configuring F15 recurring assignments and anchor shifting in `lib/progress-coaching/checkins/schedule.ts` and `lib/progress-coaching/checkins/service.ts` (FR-001, FR-002, FR-003, FR-004, SC-001, SC-002). Evidence (CI green on bdefe1b8): app/(app)/check-ins/page.tsx, components/progress-coaching/CheckinConfiguration.tsx, lib/progress-coaching/checkins/, SQL f23_weekly_checkin_run (20261118200200); integration anchor tests. Review fixes A3/A4: per-policy isolation with audited skip and weekly-run idempotency (progress-coaching-review-fixes.test.ts); the audience is a snapshot per due day (analyze.md).
- [x] T014 [US1] Implement reminder creation and deduplication through the F15 notification inbox, via the spec 022 client inbox (S57-PO-10), at 10:00 AM workspace time in `lib/progress-coaching/checkins/reminders.ts` and `app/api/progress-coaching/checkins/reminders/route.ts` (FR-006, FR-007, FR-009, SC-003). Evidence (CI green on bdefe1b8): supabase/migrations/20261125030200_f23_notifications.sql: app_private.f23_checkin_reminders_run(p_now) over app_private.f22_enqueue_client_notice (kinds checkin_reminder_day_of / checkin_reminder_followup, source_key = assignment id), scheduled hourly after the weekly run by f23_weekly_checkin_schedule_activate; timing in lib/progress-coaching/checkins/schedule.ts; client copy mapping in lib/client-access/notices-projection.ts (approved S55-PO-10 keys). Done in the database rather than reminders.ts and an HTTP route (cron-driven, no endpoint).
- [x] T015 [US1] Implement check-in read/status APIs and the explicit login non-gate in `lib/progress-coaching/checkins/repository.ts` and `app/api/progress-coaching/checkins/route.ts` (FR-005, FR-009). Evidence (CI green on bdefe1b8): check-ins are ordinary F15 assignments; app/(client)/progress/page.tsx shows checkin.completed.notGate; no new API route.
- [x] T016 [US1] Add `workoutAdherence` and `dietAdherence` as F15 typed answers on a 0–10 integer scale, with neutral self-report copy keys and value-only exposure to spec 024, in `lib/progress-coaching/adherence.ts` and `lib/progress-coaching/checkins/form-mapping.ts` (FR-037, FR-038, SC-011). Evidence (CI green on bdefe1b8): lib/progress-coaching/adherence.ts; 20261118200000 and 20261118200500 migrations; tests/unit/progress-coaching-adherence.test.ts, progress-coaching-contract.test.ts.
- [x] T017 [US1] Implement KPI counting for check-ins received rather than sent in `lib/progress-coaching/kpi.ts` (FR-008). Evidence (CI green on bdefe1b8): public.progress_checkins_received_count (20261118200200); tests/integration/progress-coaching.test.ts.
- [x] T018 [US1] Implement suppression of active-cycle check-in prompts for frozen clients in `lib/progress-coaching/checkins/freeze.ts` (FR-009). Evidence (CI green on bdefe1b8): f23_weekly_checkin_run admits only active entitlements; tests/unit/progress-coaching-checkin-schedule.test.ts and the integration freeze shift.

**Checkpoint**: User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 — Measurements (Priority: P1)

**Goal**: Auto-extract measurements from weekly check-ins into a dedicated Progress store, reject duplicates, and allow authorized trainer corrections with background audit only.

**Independent Test**: Submit a weekly form with mapped measurement answers, assert Progress records with source reference and original units, reject a same-day duplicate, and assert a trainer correction updates directly with a background audit entry and no user-facing correction history.

### Tests for User Story 2 (write first; must fail before implementation)

- [x] T019 [P] [US2] Unit tests for measurement auto-extraction, question mapping, unit preservation, and history retention in `tests/unit/progress-coaching-measurements-extraction.test.ts` (FR-010, FR-011, FR-014, SC-004). Evidence (CI green on bdefe1b8): lib/progress-coaching/adherence.ts; tests/unit/progress-coaching-adherence.test.ts.
- [x] T020 [P] [US2] Integration tests for the Progress store: source reference, original units, duplicate manual-entry rejection, and same-day conflict direct update in `tests/integration/progress-coaching-measurements.test.ts` (FR-010, FR-012, FR-015, SC-004, SC-005). Evidence (CI green on bdefe1b8): tests/integration/progress-coaching.test.ts (extraction, duplicate rejection, same-day in-place update).
- [x] T021 [P] [US2] RLS and authorization tests for measurement reads, writes, and corrections across roles and workspaces in `tests/integration/progress-coaching-measurements-rls.test.ts` (FR-013, FR-016). Evidence (CI green on bdefe1b8): tests/integration/progress-coaching.test.ts RLS block.
- [x] T022 [P] [US2] [HIGH-RISK: migration/RLS] Mutation-evidence tests for measurement correction RPCs, SECURITY DEFINER boundaries, RLS denial, and append-only background audit writes in `tests/integration/progress-coaching-measurements-mutations.test.ts` (FR-012, FR-013, SC-006). Evidence (CI green on bdefe1b8): tests/integration/progress-coaching-mutations.test.ts (rolled-back mutants of the wall, RLS and append-only triggers). Review fix A7 adds mutants of record, list, self view, the spec 024 readers, the client RLS policy and the entitlement half in tests/integration/progress-coaching-review-fixes.test.ts.
- [x] T023 [P] [US2] UI tests for measurement visibility under F13 plan access and absence of any correction-history UI in `tests/unit/progress-coaching-measurements-ui.test.tsx` and `tests/e2e/progress-coaching-measurements.spec.ts` (FR-016, FR-017). Evidence (CI green on bdefe1b8): tests/unit/progress-coaching-measurements-ui.test.tsx; tests/e2e/progress-coaching-screenshots.spec.ts.

### Implementation for User Story 2

- [x] T024 [US2] [HIGH-RISK: migration/RLS] Create the `progress_measurements` table, unique `(client, type, recorded_date)` constraint, RLS policies, and background correction audit table in `supabase/migrations/<timestamp>_023_progress_measurements.sql` (FR-010, FR-012, FR-013, SC-005, SC-006). Evidence (CI green on bdefe1b8): supabase/migrations/20261118200100_f23_progress_measurements.sql.
- [x] T025 [US2] Implement auto-extraction from F15 weekly form answers into the Progress store in `lib/progress-coaching/measurements/extraction.ts` and `lib/progress-coaching/measurements/repository.ts` (FR-010, FR-011, FR-014, SC-004). Evidence (CI green on bdefe1b8): trigger f23_extract_checkin_measurements (supabase/migrations/20261118200300_f23_measurement_operations.sql).
- [x] T026 [US2] Implement client manual entry, client edit of own manual entries (S57-PO-8; check-in-extracted rows stay trainer-only), duplicate manual-entry rejection and edit-existing redirection in `lib/progress-coaching/measurements/service.ts` and `app/api/progress-coaching/measurements/route.ts` (FR-012, FR-015, SC-005). Evidence (CI green on bdefe1b8): record_progress_measurement and update_own_progress_measurement; tests/unit/progress-coaching-client-entry.test.ts, tests/integration/progress-coaching-client-edit.test.ts. Review fix A1: 366-day date floor in SQL and parseOwnEntryInput (progress-coaching-client-entry.test.ts, progress-coaching-review-fixes.test.ts).
- [x] T027 [US2] Implement authorized trainer correction of any measurement as a direct in-place update recorded only in the background audit log in `lib/progress-coaching/measurements/corrections.ts` and `app/api/progress-coaching/measurements/[measurementId]/route.ts` (FR-013, SC-006). Evidence (CI green on bdefe1b8): correct_progress_measurement; lib/progress-coaching/service.ts; tests/unit/progress-coaching-correction.test.ts. Review fix A9: manual rows are range-checked against the current check-in question (progress-coaching-review-fixes.test.ts).
- [x] T028 [US2] Enforce F13 plan-access visibility restrictions on measurements in `lib/progress-coaching/measurements/access.ts` (FR-016). Evidence (CI green on bdefe1b8): supabase/migrations/20261125030300_f23_measurements_overdue_restriction.sql redefines app_private.f23_client_progress_visible to require not overdue from app_private.f13_client_overdue_state (F13 PR #265), so the RLS policy, record/update/correct RPCs, client_self_progress and the timeline flag inherit it; tests/integration/progress-coaching-overdue-access.test.ts (restricted while overdue, restored on collection, staff keep access, other client and foreign workspace negatives, mutant). Done in SQL rather than lib/progress-coaching/measurements/access.ts.
- [x] T029 [US2] Keep progress photos on Telegram by explicitly excluding web upload and automatic ingestion from the measurement UI and APIs in `components/progress-coaching/Measurements.tsx` and `app/api/progress-coaching/measurements/route.ts` (FR-017). Evidence (CI green on bdefe1b8): no upload or ingestion surface; tests/unit/progress-coaching-measurements-ui.test.tsx.

**Checkpoint**: User Story 2 is independently functional and testable.

---

## Phase 5: User Story 3 — Food replacement request (Priority: P2)

**Goal**: Allow free selection of existing approved alternatives, client free-text requests with one open request per food, cancellation, and trainer approval through a draft revision with manual publish.

**Independent Test**: Client selects an existing alternative without creating a request; client submits and cancels a request; trainer approves within the max-3 cap via draft plus manual Ready & Publish; stale-close occurs when the food is removed.

### Tests for User Story 3 (write first; must fail before implementation)

- [x] T030 [P] [US3] Unit tests for request text limits, one-open-per-food, and cancel-without-edit behavior in `tests/unit/progress-coaching-food-replacement-validation.test.ts` (FR-019, FR-020, FR-021, SC-008). Evidence (CI green on bdefe1b8): lib/progress-coaching/food-replacement/validation.ts; tests/unit/progress-coaching-food-replacement-validation.test.ts and progress-coaching-food-replacement-services.test.ts.
- [x] T031 [P] [US3] Integration tests for free selection of existing alternatives, request lifecycle, approval within the max-3 cap, manual publish, and stale-close in `tests/integration/progress-coaching-food-replacement.test.ts` (FR-018, FR-022, FR-023, FR-024, FR-025, SC-007, SC-008). Evidence (CI green on bdefe1b8): tests/integration/progress-coaching-food-replacement.test.ts (free selection, lifecycle, max-3 approval into a draft, manual publish, stale-close). Review fix B1: cancel after approval returns already_prepared and approval after publish returns not_open (progress-coaching-food-replacement.test.ts).
- [x] T032 [P] [US3] RLS and authorization tests for food replacement request reads/writes across roles and workspaces in `tests/integration/progress-coaching-food-replacement-rls.test.ts` (FR-019, FR-020). Evidence (CI green on bdefe1b8): tests/integration/progress-coaching-food-replacement-rls.test.ts (client, other client, trainer, owner, Sales, foreign-workspace trainer, anon).
- [x] T033 [P] [US3] Notification tests for trainer/workspace-owner notification on open and client notification on resolution in `tests/integration/progress-coaching-food-replacement-notifications.test.ts` (FR-027, FR-036). Evidence (CI green on bdefe1b8): tests/integration/progress-coaching-food-replacement-notifications.test.ts (owner notified once on open, not Sales or foreign trainer, mark-read wall, client notice on reject and approve only, none on cancel or stale, other client sees none, mutants of the owner rule, mark-read recipient filter and resolution producer).
- [x] T034 [P] [US3] Mutation-evidence tests for request state transitions, SECURITY DEFINER boundaries, and audit writes in `tests/integration/progress-coaching-food-replacement-mutations.test.ts` (FR-025, FR-027). Evidence (CI green on bdefe1b8): tests/integration/progress-coaching-food-replacement-mutations.test.ts (guard, reject wall, max-3 cap, stale-close mutants).

### Implementation for User Story 3

- [x] T035 [US3] [HIGH-RISK: migration/RLS] Create the `food_replacement_requests` table, status enum, one-open-per-food constraint, RLS policies, and indexes in `supabase/migrations/<timestamp>_023_food_replacement_requests.sql` (FR-019, FR-020, SC-008). Evidence (CI green on bdefe1b8): supabase/migrations/20261125030000_f23_food_replacement_requests.sql (table, status, one-open index, guard trigger, RLS); the timeline projection is 20261125030100_f23_timeline_replacement_events.sql.
- [x] T036 [US3] Implement free selection of existing approved F18 alternatives without creating a request or revision in `lib/progress-coaching/food-replacement/selection.ts` and `app/api/progress-coaching/food-replacement/select/route.ts` (FR-018). Evidence (CI green on bdefe1b8): lib/progress-coaching/food-replacement/selection.ts and app/api/progress-coaching/food-replacement/select/route.ts (thin wrapper of F18 select_nutrition_alternative).
- [x] T037 [US3] Implement client request creation, cancellation, and validation with F15 text limits in `lib/progress-coaching/food-replacement/requests.ts` and `app/api/progress-coaching/food-replacement/requests/route.ts` (FR-019, FR-020, FR-021, SC-008). Evidence (CI green on bdefe1b8): lib/progress-coaching/food-replacement/requests.ts and app/api/progress-coaching/food-replacement/requests/route.ts (submit, cancel); RPCs submit_food_replacement_request and cancel_food_replacement_request.
- [x] T038 [US3] Implement approval by preparing an F18 draft revision within the max-3 cap with manual Ready & Publish and no auto-publish in `lib/progress-coaching/food-replacement/approval.ts` and `app/api/progress-coaching/food-replacement/approve/route.ts` (FR-022, FR-023, FR-026, SC-007). Evidence (CI green on bdefe1b8): lib/progress-coaching/food-replacement/approval.ts and app/api/progress-coaching/food-replacement/approve/route.ts; RPC approve_food_replacement_request writes the F19 draft through save_plan_draft, never publishes.
- [x] T039 [US3] Implement stale-close when the target food is removed in a newer published revision in `lib/progress-coaching/food-replacement/stale.ts` (FR-025). Evidence (CI green on bdefe1b8): done in the database, not a TS file: trigger f23_reconcile_food_requests on nutrition_plan_version_contents (supabase/migrations/20261125030000); covered by the stale-close tests in progress-coaching-food-replacement.test.ts and the mutation test.
- [x] T040 [US3] Implement lifecycle states and notifications through the F15 inbox in `lib/progress-coaching/food-replacement/lifecycle.ts` and `lib/progress-coaching/food-replacement/notifications.ts` (FR-027, FR-036). Evidence (CI green on bdefe1b8): lifecycle.ts plus 20261125030200: staff_inbox_notices sibling inbox (read_staff_notices, mark_staff_notice_read), new client kind food_replacement_resolved, triggers f23_notify_food_request_change; lib/progress-coaching/food-replacement/notifications.ts and notice-projection.ts; tests/unit/progress-coaching-staff-notices.test.ts.
- [x] T041 [US3] Preserve F18 mapping, client-specific totals/exports, and fallback rules, and explicitly exclude SLA escalation, in `lib/progress-coaching/food-replacement/preservation.ts` (FR-026, FR-028). Evidence (CI green on bdefe1b8): preservation by construction (draft-only approval through F19/F18; F18 publish recomputes totals and carries selections); no separate TS module needed; asserted in progress-coaching-food-replacement.test.ts (snapshot map, selection carry-forward, no alert schedules).

**Checkpoint**: User Story 3 is independently functional and testable.

---

## Phase 6: User Story 4 — Client timeline (Priority: P2)

**Goal**: Provide a concise chronological timeline of the fixed meaningful event set to clients and authorized staff, without duplicating audit writes or adding retention rules.

**Independent Test**: Trigger registration, delivery, freeze, and replacement events; assert the timeline shows exactly the fixed meaningful set in order; assert no micro-audit events; assert authorized access and denial for unauthorized actors.

### Tests for User Story 4 (write first; must fail before implementation)

- [x] T042 [P] [US4] Unit tests for the fixed meaningful event set, chronological ordering, and deterministic tie-break in `tests/unit/progress-coaching-timeline.test.ts` (FR-029, FR-032, SC-009). Evidence (CI green on bdefe1b8): tests/unit/progress-coaching-timeline.test.ts.
- [x] T043 [P] [US4] Integration tests for reuse of F13/F15/F19/F20/P4 event emission and absence of duplicate audit rows in `tests/integration/progress-coaching-timeline.test.ts` (FR-033). Evidence (CI green on bdefe1b8): tests/integration/progress-coaching.test.ts, progress-coaching-activation-anchor.test.ts.
- [x] T044 [P] [US4] RLS and authorization tests for client own access and authorized trainer/workspace-owner/platform-owner access, with denial for unauthorized sales/client actors, in `tests/integration/progress-coaching-timeline-rls.test.ts` (FR-029, FR-030). Evidence (CI green on bdefe1b8): tests/integration/progress-coaching.test.ts, progress-coaching-activation-anchor.test.ts.
- [x] T045 [P] [US4] Retention tests asserting existing F11/F20 audit retention applies with no new retention rule in `tests/integration/progress-coaching-timeline-retention.test.ts` (FR-031). Evidence (CI green on bdefe1b8): tests/integration/progress-coaching-timeline-retention.test.ts.
- [x] T046 [P] [US4] Mutation-evidence tests for timeline projection and audit-write boundaries in `tests/integration/progress-coaching-timeline-mutations.test.ts` (FR-029, FR-033). Evidence (CI green on bdefe1b8): projection is stable and read-only; tests/integration/progress-coaching.test.ts and progress-coaching-mutations.test.ts. Timeline wall and projection-filter mutants are in tests/integration/progress-coaching-review-fixes.test.ts (A7).

### Implementation for User Story 4

- [x] T047 [US4] [HIGH-RISK: migration/RLS] Create the timeline projection table/view and RLS policies in `supabase/migrations/<timestamp>_023_client_timeline.sql` (FR-029, FR-030, SC-009). Evidence (CI green on bdefe1b8): supabase/migrations/20261118200400_f23_client_timeline.sql plus replacement events in 20261125030100_f23_timeline_replacement_events.sql; trainerChange stays unsourced (F11 current_assigned_trainer deferred).
- [x] T048 [US4] Implement timeline service and API with the fixed event set and chronological ordering in `lib/progress-coaching/timeline/service.ts` and `app/api/progress-coaching/timeline/route.ts` (FR-029, FR-032, SC-009). Evidence (CI green on bdefe1b8): lib/progress-coaching/service.ts, parse.ts; tests/unit/progress-coaching-timeline.test.ts.
- [x] T049 [US4] Implement client and staff timeline UI in `components/progress-coaching/Timeline.tsx` and `app/(client)/progress/timeline/page.tsx` (FR-030). Evidence (CI green on bdefe1b8): components/progress-coaching/ProgressView.tsx, app/(client)/progress/page.tsx, app/(app)/clients/[clientId]/progress/page.tsx; e2e screenshots spec.
- [x] T050 [US4] Implement F20 trainer-notes reuse by reference only: no notes FRs, tables, or endpoints; timeline references note events through F20 audit events in `lib/progress-coaching/timeline/sources.ts` (FR-034, FR-035, SC-010). Evidence (CI green on bdefe1b8): no notes tables or endpoints added (FR-034); note events are not projected (FR-035 is MAY).

**Checkpoint**: User Story 4 is independently functional and testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements and completion gates affecting multiple stories.

- [x] T051 [P] Validate quickstart and integration commands against the final implementation in `specs/023-client-progress-coaching/quickstart.md` and `docs/` (FR-001, FR-029, FR-034). Verified on origin/main base `788cf3a1` by lane s70-hy4-023docs (S70-PO-8; orchestrator docs PR). Prior BLOCKED note (2026-11-17, docs/ write access) is resolved by this docs PR.

  Verified — commands (each resolved in `package.json` scripts): `npm test` → `test = vitest run`; `npm run test:integration` → `test:integration = vitest run --config vitest.integration.config.ts --configLoader=runner`; `npm run e2e` → `e2e = playwright test`. All 3 commands in quickstart.md exist; 0 stale commands.

  Verified — paths (each asserted present in the worktree): `tests/unit/progress-coaching-checkin-schedule.test.ts`; `tests/integration/progress-coaching.test.ts`; `tests/integration/progress-coaching-activation-anchor.test.ts`; `tests/e2e/progress-coaching-screenshots.spec.ts`; `tests/unit/progress-coaching-correction.test.ts`; `tests/integration/progress-coaching-client-edit.test.ts`; `tests/integration/progress-coaching-food-replacement.test.ts`; `tests/unit/progress-coaching-food-replacement-services.test.ts`; `tests/integration/progress-coaching-food-replacement-rls.test.ts`; `tests/unit/progress-coaching-food-replacement-validation.test.ts`; `tests/integration/progress-coaching-food-replacement-mutations.test.ts`; `tests/integration/progress-coaching-timeline-retention.test.ts`; `tests/unit/progress-coaching-timeline.test.ts`; `tests/unit/progress-coaching-adherence.test.ts`; `tests/integration/progress-coaching-mutations.test.ts`. All 15 quickstart test paths exist; 0 stale paths. Integration/e2e execution needs the local stack and port 3000, so this task validates command/path correctness, not a new test run.

  Verified — docs/ pages describing F23: `docs/00-assessment.md`, `docs/01-traceability.md`, `docs/02-architecture.md`, `docs/03-roadmap.md`, `docs/04-changes-and-questions.md`, `docs/05-review-log.md`. No F23 npm script, test path, source path or broken relative link exists in these pages; 0 command/path corrections needed. Stale F23 decision references (C1 check-in anchor, still marked open although S54-PO-12 Q15 decided it and spec 023 FR-001 encodes it) were corrected in `docs/00-assessment.md`, `docs/03-roadmap.md` and `docs/04-changes-and-questions.md`. No other docs or tasks touched.

  Verified — gates on this head: `node scripts/format-check-changed.mjs` with `FORMAT_BASE_SHA=788cf3a1` exit 0; `npm run format:check` exit 0; `npm run check:secrets` exit 0 (0 findings); `npm run lint` exit 0; `npm run typecheck` exit 0; `TZ=Africa/Cairo npm test` exit 0 (365 files / 4190 tests passed). `check:secrets` scanned `.next/static` because a local Turbopack build is blocked by the junctioned `node_modules`; CI `validate` rebuilds from source.

- [ ] T052 [HIGH-RISK: migration/RLS] CANCELLED (PO S56-PO-4): remove the `progress_coaching_enabled` feature flag and its conditional branches.
- [x] T053 Re-run Analyze only when FR/SC/requirement text changes; code-only or test-only review rounds do not require re-dating. Record the date update in `specs/023-client-progress-coaching/checklists/analyze.md` (FR-001, FR-038). Evidence (CI green on bdefe1b8): specs/023-client-progress-coaching/checklists/analyze.md (re-dated 2026-11-17, 0 CRITICAL/HIGH).
- [x] T054 Run independent UI/security review, repository checks, format gates, and required PR gates on the implementation head; record mutation evidence with tested SHA and tool versions in `specs/023-client-progress-coaching/traceability.md`. Runs last (FR-001, FR-038). Verified: zero BLOCKING findings; unblocked by S70-PO-8 (F23 progress-coaching remaining tasks are now our work). Evidence: specs/023-client-progress-coaching/traceability.md (tested SHA 788cf3a1e8d1decb661acda78f8ca8d08ecf9b62).

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1) has no dependencies.
- Foundational (Phase 2) depends on Setup and blocks all user stories.
- User Stories 1–4 depend on Foundational completion.
- Polish (Phase 7) depends on all desired user stories being complete.

### User Story Dependencies

- US1 (P1) can start after Foundational; no dependencies on other stories.
- US2 (P1) can start after Foundational; consumes F15 form submissions but remains independently testable.
- US3 (P2) can start after Foundational; integrates with F18/F19 but remains independently testable.
- US4 (P2) can start after Foundational; consumes events from F13/F15/F19/F20/P4 but remains independently testable.

### Within Each User Story

- Tests must be written and must fail before implementation.
- RLS and mutation-evidence tests must be included for every new table, RPC, SECURITY DEFINER function, and audit write.
- Models/migrations before services; services before API routes; core implementation before UI integration.

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel.
- All Foundational tasks marked [P] can run in parallel.
- Tests within a story marked [P] can run in parallel.
- Different user stories can be worked on in parallel by different developers after Foundational.

## Notes

- No agent-roster labels are used; high-risk work is marked `[HIGH-RISK: migration/RLS]` and requires independent review plus mutation evidence.
- No task is ticked. Evidence must be recorded in `traceability.md` before ticking.
- Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); this work proceeds without a flag; flags are reconsidered before production. Security/authorization/RLS remain mandatory.
- Spec-only lane: no implementation, migrations, tests, or merges are authorized by this task list.
