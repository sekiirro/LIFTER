# Tasks: 023 Client Progress Coaching (P5 Progress)

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Status**: Spec-only. No task is ticked; no implementation is authorized. Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); this work proceeds without a flag; flags are reconsidered before production.

## Format

`[ID] [P?] [USn] Description` with exact target paths. `[HIGH-RISK: migration/RLS]` marks database migration, RLS, SECURITY DEFINER, grant, or audit-write work requiring independent review plus mutation evidence.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Feature module skeleton and shared contracts that unblock all stories.

- [ ] T001 [P] Create the progress-coaching module skeleton and shared types/constants in `lib/progress-coaching/types.ts`, `lib/progress-coaching/constants.ts`, and `lib/progress-coaching/index.ts`.
- [ ] T002 [P] Add copy key scaffolding only (no approved strings) in `lib/i18n/messages/en.ts` and `lib/i18n/messages/ar.ts`, keyed to `specs/023-client-progress-coaching/copy-proposal.md` (status PROPOSED — PENDING PO APPROVAL).
- [ ] T003 [P] Add shared validation schemas for F15 text limits and identifiers in `lib/progress-coaching/validation.ts` and `tests/unit/progress-coaching-validation.test.ts`.

**Checkpoint**: Shared module and validation scaffolding ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before any user story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 [HIGH-RISK: migration/RLS] CANCELLED (PO S56-PO-4): add the `progress_coaching_enabled` feature flag, its migration, reader/writer and flag-specific tests.
- [ ] T005 [P] Add authorization capabilities for progress coaching using the existing `authorize()` and `app_private.has_workspace_access` walls in `lib/progress-coaching/authorization.ts`, with parity tests in `tests/unit/progress-coaching-authorization.test.ts` and `tests/integration/progress-coaching-authorization-rls.test.ts`.
- [ ] T006 [P] Add background audit event constants and the append-only writer helper in `lib/progress-coaching/audit.ts`, with tests in `tests/unit/progress-coaching-audit.test.ts` and `tests/integration/progress-coaching-audit.test.ts`.
- [ ] T007 [P] Define the fixed client-timeline event-type contract and emission interfaces in `lib/progress-coaching/timeline/events.ts`, with tests in `tests/unit/progress-coaching-timeline-events.test.ts`.

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — Weekly check-in (Priority: P1) 🎯 MVP

**Goal**: Schedule and deliver weekly check-ins with freeze-aware recurrence, reminders, non-gating login, KPI counting, and neutral adherence self-report capture.

**Independent Test**: Activate a synthetic subscription, assert first check-in at day 7 and then every 7 days including Fridays, apply a 3-day freeze, assert resume shift and no catch-up delivery, and assert reminders at 10:00 AM workspace time.

### Tests for User Story 1 (write first; must fail before implementation)

- [ ] T008 [P] [US1] Unit tests for freeze-adjusted anchor calculation and no-catch-up behavior in `tests/unit/progress-coaching-checkin-schedule.test.ts` (FR-001, FR-002, FR-003, FR-004, SC-001, SC-002).
- [ ] T009 [P] [US1] Integration tests for F15 recurring assignment reuse: first occurrence at day 7, then every 7 days including Fridays, freeze pause/resume with shifted anchor, no missed deliveries, and outstanding forms remaining visible in `tests/integration/progress-coaching-checkins.test.ts` (FR-001, FR-002, FR-003, FR-004, SC-001, SC-002).
- [ ] T010 [P] [US1] Integration tests for reminders at 10:00 AM workspace time on the due day and 24 hours later when unanswered, including idempotent dedupe keys, in `tests/integration/progress-coaching-checkin-reminders.test.ts` (FR-006, FR-007, FR-009, SC-003).
- [ ] T011 [P] [US1] RLS and authorization tests for check-in occurrence reads/writes across client, trainer, workspace owner, platform owner, and denied sales/anonymous actors in `tests/integration/progress-coaching-checkins-rls.test.ts` (FR-001, FR-005, FR-009).
- [ ] T012 [P] [US1] UI and accessibility tests for login non-gate, neutral adherence self-report presentation, and absence of leaderboard scoring mechanics in `tests/unit/progress-coaching-checkin-ui.test.tsx` and `tests/e2e/progress-coaching-checkins.spec.ts` (FR-005, FR-037, FR-038, SC-011).

### Implementation for User Story 1

- [ ] T013 [US1] Implement freeze-aware weekly check-in scheduling by configuring F15 recurring assignments and anchor shifting in `lib/progress-coaching/checkins/schedule.ts` and `lib/progress-coaching/checkins/service.ts` (FR-001, FR-002, FR-003, FR-004, SC-001, SC-002).
- [ ] T014 [US1] Implement reminder creation and deduplication through the F15 notification inbox at 10:00 AM workspace time in `lib/progress-coaching/checkins/reminders.ts` and `app/api/progress-coaching/checkins/reminders/route.ts` (FR-006, FR-007, FR-009, SC-003).
- [ ] T015 [US1] Implement check-in read/status APIs and the explicit login non-gate in `lib/progress-coaching/checkins/repository.ts` and `app/api/progress-coaching/checkins/route.ts` (FR-005, FR-009).
- [ ] T016 [US1] Add `workoutAdherence` and `dietAdherence` as F15 typed answers on a 0–10 integer scale, with neutral self-report copy keys and value-only exposure to spec 024, in `lib/progress-coaching/adherence.ts` and `lib/progress-coaching/checkins/form-mapping.ts` (FR-037, FR-038, SC-011).
- [ ] T017 [US1] Implement KPI counting for check-ins received rather than sent in `lib/progress-coaching/kpi.ts` (FR-008).
- [ ] T018 [US1] Implement suppression of active-cycle check-in prompts for frozen clients in `lib/progress-coaching/checkins/freeze.ts` (FR-009).

**Checkpoint**: User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 — Measurements (Priority: P1)

**Goal**: Auto-extract measurements from weekly check-ins into a dedicated Progress store, reject duplicates, and allow authorized trainer corrections with background audit only.

**Independent Test**: Submit a weekly form with mapped measurement answers, assert Progress records with source reference and original units, reject a same-day duplicate, and assert a trainer correction updates directly with a background audit entry and no user-facing correction history.

### Tests for User Story 2 (write first; must fail before implementation)

- [ ] T019 [P] [US2] Unit tests for measurement auto-extraction, question mapping, unit preservation, and history retention in `tests/unit/progress-coaching-measurements-extraction.test.ts` (FR-010, FR-011, FR-014, SC-004).
- [ ] T020 [P] [US2] Integration tests for the Progress store: source reference, original units, duplicate manual-entry rejection, and same-day conflict direct update in `tests/integration/progress-coaching-measurements.test.ts` (FR-010, FR-012, FR-015, SC-004, SC-005).
- [ ] T021 [P] [US2] RLS and authorization tests for measurement reads, writes, and corrections across roles and workspaces in `tests/integration/progress-coaching-measurements-rls.test.ts` (FR-013, FR-016).
- [ ] T022 [P] [US2] [HIGH-RISK: migration/RLS] Mutation-evidence tests for measurement correction RPCs, SECURITY DEFINER boundaries, RLS denial, and append-only background audit writes in `tests/integration/progress-coaching-measurements-mutations.test.ts` (FR-012, FR-013, SC-006).
- [ ] T023 [P] [US2] UI tests for measurement visibility under F13 plan access and absence of any correction-history UI in `tests/unit/progress-coaching-measurements-ui.test.tsx` and `tests/e2e/progress-coaching-measurements.spec.ts` (FR-016, FR-017).

### Implementation for User Story 2

- [ ] T024 [US2] [HIGH-RISK: migration/RLS] Create the `progress_measurements` table, unique `(client, type, recorded_date)` constraint, RLS policies, and background correction audit table in `supabase/migrations/<timestamp>_023_progress_measurements.sql` (FR-010, FR-012, FR-013, SC-005, SC-006).
- [ ] T025 [US2] Implement auto-extraction from F15 weekly form answers into the Progress store in `lib/progress-coaching/measurements/extraction.ts` and `lib/progress-coaching/measurements/repository.ts` (FR-010, FR-011, FR-014, SC-004).
- [ ] T026 [US2] Implement duplicate manual-entry rejection and edit-existing redirection in `lib/progress-coaching/measurements/service.ts` and `app/api/progress-coaching/measurements/route.ts` (FR-012, FR-015, SC-005).
- [ ] T027 [US2] Implement authorized trainer correction as a direct in-place update recorded only in the background audit log in `lib/progress-coaching/measurements/corrections.ts` and `app/api/progress-coaching/measurements/[measurementId]/route.ts` (FR-013, SC-006).
- [ ] T028 [US2] Enforce F13 plan-access visibility restrictions on measurements in `lib/progress-coaching/measurements/access.ts` (FR-016).
- [ ] T029 [US2] Keep progress photos on Telegram by explicitly excluding web upload and automatic ingestion from the measurement UI and APIs in `components/progress-coaching/Measurements.tsx` and `app/api/progress-coaching/measurements/route.ts` (FR-017).

**Checkpoint**: User Story 2 is independently functional and testable.

---

## Phase 5: User Story 3 — Food replacement request (Priority: P2)

**Goal**: Allow free selection of existing approved alternatives, client free-text requests with one open request per food, cancellation, and trainer approval through a draft revision with manual publish.

**Independent Test**: Client selects an existing alternative without creating a request; client submits and cancels a request; trainer approves within the max-3 cap via draft plus manual Ready & Publish; stale-close occurs when the food is removed.

### Tests for User Story 3 (write first; must fail before implementation)

- [ ] T030 [P] [US3] Unit tests for request text limits, one-open-per-food, and cancel-without-edit behavior in `tests/unit/progress-coaching-food-replacement-validation.test.ts` (FR-019, FR-020, FR-021, SC-008).
- [ ] T031 [P] [US3] Integration tests for free selection of existing alternatives, request lifecycle, approval within the max-3 cap, manual publish, and stale-close in `tests/integration/progress-coaching-food-replacement.test.ts` (FR-018, FR-022, FR-023, FR-024, FR-025, SC-007, SC-008).
- [ ] T032 [P] [US3] RLS and authorization tests for food replacement request reads/writes across roles and workspaces in `tests/integration/progress-coaching-food-replacement-rls.test.ts` (FR-019, FR-020).
- [ ] T033 [P] [US3] Notification tests for trainer/workspace-owner notification on open and client notification on resolution in `tests/integration/progress-coaching-food-replacement-notifications.test.ts` (FR-027, FR-036).
- [ ] T034 [P] [US3] Mutation-evidence tests for request state transitions, SECURITY DEFINER boundaries, and audit writes in `tests/integration/progress-coaching-food-replacement-mutations.test.ts` (FR-025, FR-027).

### Implementation for User Story 3

- [ ] T035 [US3] [HIGH-RISK: migration/RLS] Create the `food_replacement_requests` table, status enum, one-open-per-food constraint, RLS policies, and indexes in `supabase/migrations/<timestamp>_023_food_replacement_requests.sql` (FR-019, FR-020, SC-008).
- [ ] T036 [US3] Implement free selection of existing approved F18 alternatives without creating a request or revision in `lib/progress-coaching/food-replacement/selection.ts` and `app/api/progress-coaching/food-replacement/select/route.ts` (FR-018).
- [ ] T037 [US3] Implement client request creation, cancellation, and validation with F15 text limits in `lib/progress-coaching/food-replacement/requests.ts` and `app/api/progress-coaching/food-replacement/requests/route.ts` (FR-019, FR-020, FR-021, SC-008).
- [ ] T038 [US3] Implement approval by preparing an F18 draft revision within the max-3 cap with manual Ready & Publish and no auto-publish in `lib/progress-coaching/food-replacement/approval.ts` and `app/api/progress-coaching/food-replacement/approve/route.ts` (FR-022, FR-023, FR-026, SC-007).
- [ ] T039 [US3] Implement stale-close when the target food is removed in a newer published revision in `lib/progress-coaching/food-replacement/stale.ts` (FR-025).
- [ ] T040 [US3] Implement lifecycle states and notifications through the F15 inbox in `lib/progress-coaching/food-replacement/lifecycle.ts` and `lib/progress-coaching/food-replacement/notifications.ts` (FR-027, FR-036).
- [ ] T041 [US3] Preserve F18 mapping, client-specific totals/exports, and fallback rules, and explicitly exclude SLA escalation, in `lib/progress-coaching/food-replacement/preservation.ts` (FR-026, FR-028).

**Checkpoint**: User Story 3 is independently functional and testable.

---

## Phase 6: User Story 4 — Client timeline (Priority: P2)

**Goal**: Provide a concise chronological timeline of the fixed meaningful event set to clients and authorized staff, without duplicating audit writes or adding retention rules.

**Independent Test**: Trigger registration, delivery, freeze, and replacement events; assert the timeline shows exactly the fixed meaningful set in order; assert no micro-audit events; assert authorized access and denial for unauthorized actors.

### Tests for User Story 4 (write first; must fail before implementation)

- [ ] T042 [P] [US4] Unit tests for the fixed meaningful event set, chronological ordering, and deterministic tie-break in `tests/unit/progress-coaching-timeline.test.ts` (FR-029, FR-032, SC-009).
- [ ] T043 [P] [US4] Integration tests for reuse of F13/F15/F19/F20/P4 event emission and absence of duplicate audit rows in `tests/integration/progress-coaching-timeline.test.ts` (FR-033).
- [ ] T044 [P] [US4] RLS and authorization tests for client own access and authorized trainer/workspace-owner/platform-owner access, with denial for unauthorized sales/client actors, in `tests/integration/progress-coaching-timeline-rls.test.ts` (FR-029, FR-030).
- [ ] T045 [P] [US4] Retention tests asserting existing F11/F20 audit retention applies with no new retention rule in `tests/integration/progress-coaching-timeline-retention.test.ts` (FR-031).
- [ ] T046 [P] [US4] Mutation-evidence tests for timeline projection and audit-write boundaries in `tests/integration/progress-coaching-timeline-mutations.test.ts` (FR-029, FR-033).

### Implementation for User Story 4

- [ ] T047 [US4] [HIGH-RISK: migration/RLS] Create the timeline projection table/view and RLS policies in `supabase/migrations/<timestamp>_023_client_timeline.sql` (FR-029, FR-030, SC-009).
- [ ] T048 [US4] Implement timeline service and API with the fixed event set and chronological ordering in `lib/progress-coaching/timeline/service.ts` and `app/api/progress-coaching/timeline/route.ts` (FR-029, FR-032, SC-009).
- [ ] T049 [US4] Implement client and staff timeline UI in `components/progress-coaching/Timeline.tsx` and `app/(client)/progress/timeline/page.tsx` (FR-030).
- [ ] T050 [US4] Implement F20 trainer-notes reuse by reference only: no notes FRs, tables, or endpoints; timeline references note events through F20 audit events in `lib/progress-coaching/timeline/sources.ts` (FR-034, FR-035, SC-010).

**Checkpoint**: User Story 4 is independently functional and testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements and completion gates affecting multiple stories.

- [ ] T051 [P] Validate quickstart and integration commands against the final implementation in `specs/023-client-progress-coaching/quickstart.md` and `docs/` (FR-001, FR-029, FR-034).
- [ ] T052 [HIGH-RISK: migration/RLS] CANCELLED (PO S56-PO-4): remove the `progress_coaching_enabled` feature flag and its conditional branches.
- [ ] T053 Re-run Analyze only when FR/SC/requirement text changes; code-only or test-only review rounds do not require re-dating. Record the date update in `specs/023-client-progress-coaching/checklists/analyze.md` (FR-001, FR-038).
- [ ] T054 Run independent UI/security review, repository checks, format gates, and required PR gates on the implementation head; record mutation evidence with tested SHA and tool versions in `specs/023-client-progress-coaching/traceability.md`. Runs last (FR-001, FR-038).

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
