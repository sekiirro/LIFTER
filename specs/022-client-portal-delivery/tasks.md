# Tasks: Client Portal Delivery

**Input**: Design documents from `/specs/022-client-portal-delivery/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`
**Task format**: `[ID] [P?] [USn] Description` with exact target paths. `[HIGH-RISK: authorization]` marks authorization, entitlement, export-authorization or workspace-authorization work requiring independent review plus mutation evidence. Group work into vertical slices of approximately 400 to 800 changed lines; merge `origin/main` before each slice. Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); this work proceeds without a flag; flags are reconsidered before production. Authorization/RLS remain mandatory. Each user-story phase lists its failing tests first; they must fail before any implementation task in that phase is started.

## Phase 1: Setup

**Purpose**: Feature module skeleton and shared contracts that unblock all stories.

- [ ] T001 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] CANCELLED (PO S56-PO-4): configure the server-side portal feature flag.
- [ ] T002 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] CANCELLED (PO S56-PO-4): wire the portal feature flag into server routes and services.

**Checkpoint**: Shared module and portal setup tasks are complete.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before any user story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Map planned server reads/actions to existing F11/F13 identity, workspace, capability and entitlement checks in `lib/client-access/authorize.ts`.
- [x] T004 [FR-010, FR-011] Add workspace-isolation negative coverage for portal and directory boundaries in `tests/integration/client-portal-isolation.test.ts`.
- [x] T005 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Record slice boundaries and owned files in `specs/022-client-portal-delivery/tasks.md`.

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — Deliver first plans and activate (Priority: P1)

**Goal**: Use F19 independent Ready & Publish operations and its exactly-once completion transaction.
**Independent Test**: Publish the first workout and nutrition plans separately; verify each F19 delivery appears once and only the completing first-plan delivery activates and awards the approved point.

### Tests for User Story 1 (write first; must fail before implementation)

- [x] T006 [P] [US1] Unit tests for first-plan delivery idempotency and activation decision logic in `tests/unit/plan-delivery-activation.test.ts` (FR-001, FR-002, FR-003, SC-001, SC-002, SC-003).
- [x] T007 [P] [US1] Integration tests for split-day delivery, retry/concurrency and exactly-once activation in `tests/integration/plan-delivery-activation.test.ts` (FR-001, FR-002, FR-003, SC-001, SC-002, SC-003).
- [x] T008 [P] [US1] Authorization and entitlement tests for the publish action across roles and workspaces in `tests/integration/plan-delivery-authorization.test.ts` (FR-001, FR-002, FR-003, FR-006, FR-007, FR-010).

### Implementation for User Story 1

- [x] T009 [US1] [FR-001] Wire eligible workout Ready & Publish to F19 delivery/idempotency in `app/(app)/clients/[clientId]/actions.ts`.
- [x] T010 [US1] [FR-001] Wire eligible nutrition Ready & Publish to F19 delivery/idempotency in `app/(app)/clients/[clientId]/actions.ts`.
- [x] T011 [US1] [FR-002, FR-003] Reuse F19 activation and F13 T044 productivity behavior in `lib/productivity/points.ts`. Per S57-PO-11 the F19 normal and PO override activations each give an eligible new client its one unit; P4 adds no unit writer and verifies the override case against F19.

**Checkpoint**: User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 — Review delivered plans and subscription (Priority: P1)

**Goal**: Let a client see all own delivered plans and authoritative subscription details, subject to F13 entitlement.
**Independent Test**: Verify latest revision defaults, older published revisions are selectable, foreign/draft plans are absent, and entitlement denial returns only status/end date/restricted state.

### Tests for User Story 2 (write first; must fail before implementation)

- [x] T012 [P] [US2] Unit tests for delivered-plan projection and published-revision selection in `tests/unit/client-portal-projection.test.ts` (FR-004, FR-005, SC-004, SC-005).
- [x] T013 [P] [US2] Integration tests for projection, revision selection, entitlement, draft and foreign-client cases in `tests/integration/client-portal-access.test.ts` (FR-004, FR-005, FR-006, FR-007, FR-010, SC-004, SC-005, SC-006).
- [x] T014 [P] [US2] Authorization and entitlement tests for plan reads across roles and workspaces in `tests/integration/client-portal-access.test.ts` (the role and workspace cases of the access suite) (FR-004, FR-005, FR-006, FR-007, FR-010).
- [x] T015 [P] [US2] [HIGH-RISK: authorization] Mutation-evidence tests for the fresh F13 entitlement and restricted projection control in `lib/client-access/portal-projection.ts` and `client_portal_overview`/`f22_portal_client`/`f22_delivered_revisions`: kill/restore evidence is the test record itself, `tests/integration/client-portal-db-mutation.test.ts` (K1, K5, K8, K9, each rolled back and followed by an installed-definition check) and the app-layer mutations in the PR body (FR-004, FR-005, FR-006, FR-007, SC-006).

### Implementation for User Story 2

- [x] T016 [US2] [FR-004, FR-005] Build client-safe delivered-plan projection using F19/F13 in `app/(client)/plans/page.tsx`, with the S57-PO-12 status labels (Refunded only for a full refund) and the S57-PO-5 last covered day.
- [ ] T017 [US2] [FR-004] Add own-plan published-revision selection in `app/(client)/plans/[planId]/page.tsx`. The plan body embeds the F17/F18 shared read-only views once they merge (S57-PO-9); P4 builds no renderer.
- [ ] T018 [US2] [FR-004, FR-005, FR-006, FR-007] [HIGH-RISK: authorization] Enforce fresh F13 entitlement and restricted projection in `lib/client-access/authorize.ts` (independent review + mutation evidence required).

**Checkpoint**: User Story 2 is independently functional and testable.

---

## Phase 5: User Story 3 — Receive in-app plan notices (Priority: P2)

**Goal**: Reuse F15 inbox and create one notice per first-plan delivery.
**Independent Test**: Complete a first-plan pair; verify two notices total and activation text only on the completing delivery's notice.

### Tests for User Story 3 (write first; must fail before implementation)

- [x] T019 [P] [US3] Unit tests for notice payload, deduplication and recipient authorization in `tests/unit/client-portal-notices.test.ts` (FR-009, SC-007).
- [x] T020 [P] [US3] Integration tests for notice count, deduplication, recipient authorization and payload in `tests/integration/client-portal-notices.test.ts` (FR-009, SC-007).

### Implementation for User Story 3

- [x] T021 [US3] [FR-009] Extend F15 inbox delivery for client recipients (S57-PO-10): a client notice record beside the unchanged F15 staff inbox, client-only read/mark-read, the enqueue seam and the client notices surface, in `lib/client-access/notices.ts` (F15 `lib/forms/alert-inbox.ts` stays staff-only).
- [ ] T022 [US3] [FR-009] Emit one notice per delivery and activation text on the completing delivery through the F19 delivery/activation hook (an F19 task under S57-PO-10) calling the T021 enqueue seam.

**Checkpoint**: User Story 3 is independently functional and testable.

---

## Phase 6: User Story 4 — Export a published plan (Priority: P2)

**Goal**: Export the currently viewed revision of the client's own delivered plan in PDF or Excel.
**Independent Test**: Select a prior published revision and verify the export matches it; deny draft, foreign-client and entitlement-restricted exports without returning content.

### Tests for User Story 4 (write first; must fail before implementation)

- [ ] T023 [P] [US4] Unit tests for export revision fidelity and guards in `tests/unit/client-plan-export.test.ts` (FR-006, FR-008, FR-010, SC-005, SC-009).
- [ ] T024 [P] [US4] Integration tests for selected-revision fidelity, denied requests and formula safety in `tests/integration/client-nutrition-plan.test.ts` and `tests/unit/client-plan-export.test.ts` (FR-006, FR-008, FR-010, SC-005, SC-009).
- [ ] T025 [P] [US4] Authorization and entitlement tests for export requests across roles and workspaces in `tests/integration/client-nutrition-plan.test.ts` and `tests/unit/client-plan-export-route.test.ts` (FR-006, FR-008, FR-010, FR-012, SC-006, SC-009).
- [ ] T026 [P] [US4] [HIGH-RISK: authorization] Mutation-evidence tests for the export authorization control in `lib/client-access/plan-export.ts`, `lib/client-access/nutrition-projection.ts` and `client_portal_nutrition_plan`: the test record is `tests/integration/client-portal-db-mutation.test.ts` (K6, K7) plus the app-layer mutations M6-M8 in the Round 5 section (FR-006, FR-008, FR-010, FR-012, SC-006, SC-009).

### Implementation for User Story 4

- [ ] T027 [US4] [FR-006, FR-008, FR-010, FR-012] [HIGH-RISK: authorization] Authorize export for own delivery and current entitlement in `app/(client)/plans/[planId]/actions.ts` (independent review + mutation evidence required).
- [ ] T028 [US4] [FR-008] Pass selected revision to F17 exporters in `lib/workout-planner/export-guards.ts`.
- [x] T029 [US4] [FR-008] Pass selected revision to F18 exporters and preserve selections/totals in `lib/plans/nutrition/export.ts`.

**Checkpoint**: User Story 4 is independently functional and testable.

---

## Phase 7: User Story 5 — Find clients and outstanding work (Priority: P1)

**Goal**: Provide a workspace-authorized staff directory with approved fields, existing state filters and links to owning work surfaces.
**Independent Test**: Search each approved identity field, apply each existing filter, verify indicators and confirm no cross-workspace disclosure.

### Tests for User Story 5 (write first; must fail before implementation)

- [x] T030 [P] [US5] Unit tests for directory query, filter and indicator logic in `tests/unit/client-directory.test.ts` (FR-011, SC-008).
- [x] T031 [P] [US5] Integration tests for search, filters, indicators and workspace isolation in `tests/integration/client-directory.test.ts` (FR-011, SC-008).
- [x] T032 [P] [US5] Authorization and workspace-isolation tests for directory reads across roles and workspaces in `tests/integration/client-portal-isolation.test.ts` (FR-010, FR-011, SC-008).
- [x] T033 [P] [US5] [HIGH-RISK: authorization] Mutation-evidence tests for the directory workspace authorization control: the test record is `tests/integration/client-portal-db-mutation.test.ts` (K2) and the app-layer mutation M3 in the PR body (FR-010, FR-011, SC-008).

### Implementation for User Story 5

- [ ] T034 [US5] [FR-011] Build directory query over F11 identity fields in `app/(app)/clients/page.tsx`.
- [ ] T035 [US5] [FR-011] Add existing account/approval, subscription and assignment filters in `app/(app)/clients/page.tsx`; the subscription filter and row labels use the separate staff labels (S57-PO-13) and its Refunded option matches full refunds only.
- [ ] T036 [US5] [FR-011] Show three owning-surface indicators in `app/(app)/clients/page.tsx`.
- [ ] T037 [US5] [FR-011] Link indicators to existing F15/F18/F19 surfaces in `app/(app)/clients/page.tsx`.
- [x] T038 [US5] [FR-010, FR-011] [HIGH-RISK: authorization] Enforce workspace authorization for directory reads (independent review + mutation evidence required).

**Checkpoint**: User Story 5 is independently functional and testable.

---

## Phase 8: Polish and completion

- [x] T039 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Review changed strings against the proposal in `lib/i18n/messages/en.ts` and `lib/i18n/messages/ar.ts`.
- [x] T040 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Run required local validation on the final feature slice as documented in `specs/022-client-portal-delivery/quickstart.md`.
- [ ] T041 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Complete one cumulative feature AI review and resolve blockers as recorded in `specs/022-client-portal-delivery/tasks.md`.
- [x] T042 [FR-012, FR-013] Verify per-plan exports remain within the approved boundary and no YBS access/sync enters the feature scope in `specs/022-client-portal-delivery/spec.md`.
- [ ] T043 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] CANCELLED (PO S56-PO-4): remove the portal feature flag after feature completion.

## Dependencies and slice order

1. Setup and foundational authorization mapping precede all user stories. Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); this work proceeds without a flag; flags are reconsidered before production.
2. User Story 1 uses existing F19/F13 behavior. User Stories 2 and 4 depend on its delivered-plan projections and F13 authorization. User Story 3 consumes F19 delivery completion via F15. User Story 5 uses F11/F13/F15/F18/F19 data and can proceed after foundation.
3. Slice the above phases into reviewable vertical slices near 400 to 800 changed lines, merge current `origin/main` before each, and complete the required local validation before one push per slice.
4. The feature is not complete until all stories are implemented, one cumulative AI review has passed its blocking-finding gate, and its approved completion requirements are satisfied.

## Parallel opportunities

After shared authorization contracts are mapped, directory work (US5) can proceed separately from client portal projection (US2). Export work (US4) can proceed after projection contract is stable. Inbox work (US3) can proceed alongside UI work once F19 delivery events are available. Avoid simultaneous edits to shared routes, message catalogs and integration test files.

## Implementation strategy

Ship vertical slices without a feature flag while LIFTER is not live (PO S56-PO-4); reconsider flags before production. Complete independent first-plan delivery as the first user-facing slice; then add client projection, notices, exports and directory slices in dependency order. Keep all authorization active. Run local CI-equivalent validation before each push. Obtain one AI review when the cumulative feature diff is complete; follow the approved feature-completion requirements.

## Slice record (T005)

| Slice                                                   | Tasks                                                                                                                                                      | Owned files                                                                                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Portal and directory DB boundary                     | T003, T004, T013, T014, T031, T032, T038                                                                                                                   | `supabase/migrations/20261118100000_f22_client_portal_directory.sql`; `tests/integration/client-portal-*.test.ts`, `tests/integration/client-directory.test.ts`                       |
| 2. Client delivered-plan portal                         | T012, T015, T016, T017, T018                                                                                                                               | `app/(client)/plans/**`; `lib/client-access/portal*.ts`; `components/client-portal/**`                                                                                                |
| 3. Staff directory                                      | T030, T033, T034, T035, T036                                                                                                                               | `app/(app)/clients/page.tsx`; `lib/client-directory/**`                                                                                                                               |
| 4. Ready & Publish over F19                             | T006, T007, T008, T009, T010, T011                                                                                                                         | `app/(app)/clients/[clientId]/actions.ts`; `lib/plans/ready-and-publish.ts`; `tests/integration/plan-delivery-*.test.ts`                                                              |
| 5. Client notices (S57-PO-10)                           | T019, T020, T021                                                                                                                                           | `supabase/migrations/20261118100100_f22_client_notice_inbox.sql`; `lib/client-access/notices*.ts`; `app/(client)/plans/actions.ts`                                                    |
| 6. Status labels and refund scope (S57-PO-5, S57-PO-12) | T016, T035, T039                                                                                                                                           | `supabase/migrations/20261118100200_f22_refund_scope_status.sql`; F22 block at the end of `lib/i18n/messages/en.ts` and `ar.ts`                                                       |
| 7. Client nutrition view and export (Round 5)           | T017 (nutrition body), T023-T027 (nutrition scope), T029                                                                                                   | `supabase/migrations/20261123000000_f22_client_nutrition_plan_view.sql`; `lib/client-access/nutrition-projection.ts`, `plan-export.ts`; `app/(client)/plans/[planId]/export/route.ts` |
| Blocked until owners deliver                            | T022 (F19 hook), T017/T023-T028 workout part (F16/F17 client exercise projection), T018 (F13 overdue), T034-T037 remainder (F11, F23, F18, F17/F18 routes) | None in P4 until the contract exists                                                                                                                                                  |

Shared files touched: the F22 block at the end of `lib/i18n/messages/en.ts` and `ar.ts`, and the `f22Private` list in `tests/integration/rls-catalog.test.ts`.

## Round 5 re-audit against main db118f6d (2026-11-17)

Ticked tasks have exact-head green CI on `4805692c` (run 44123585619: validate, integration shards 1-3, integration, storage, docs-only). The ticked set is T003-T016, T019-T021, T029, T030-T033, T038-T040 and T042. Unticked: the cancelled flag tasks (T001, T002, T043), the partial or blocked tasks below and T041.

Main now contains F17 (workout exporters, publish intake gate), F18 (`publish_nutrition_revision`, `select_nutrition_alternative`, `lib/plans/nutrition/export.ts`, `record_nutrition_export_audit`), F9, F10 and the F11 assignment (`assign_client_responsible_trainer`, `client_responsible_trainer`, `app_private.current_assigned_trainer`). Merge fallout fixed: the generic `ready_and_publish_plan` now refuses nutrition and gates workout on a submitted F15 intake, so the F22 adapter routes by plan kind and the fixtures use current F17/F18 documents.

| Task      | Round 5 status                                     | Evidence or exact missing contract (owner)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T011      | DONE                                               | Assigned-recipient cases in `tests/integration/plan-delivery-recipient.test.ts`: assignment between deliveries with a non-Trainer completer, unassigned fallback, no unit for a later assignment or revision, foreign-workspace Trainer refused. F22 adds no unit writer. The F13 T044 `trainer_productivity_points` versus F19 `productivity_units` reconciliation is an F13/F19 architect item, not an F22 deliverable.                                                                                                                                                                                                                                                                                                                                           |
| T017      | PARTIAL: nutrition body done; workout body BLOCKED | Nutrition: `client_portal_nutrition_plan` plus the F18 print renderer in a sandboxed frame (`app/(client)/plans/[planId]/page.tsx`). Workout missing contract: a client-authorized F16 exercise projection (exercise name and live video for each referenced global or workspace-private exercise of a delivered revision, under the client wall). Owner: F16/F17.                                                                                                                                                                                                                                                                                                                                                                                                  |
| T018      | BLOCKED                                            | No F13 overdue input exists on main. Owner: F13 FR-028 overdue input (F12/F13).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| T022      | BLOCKED                                            | No F19 delivery/activation hook calls `app_private.f22_enqueue_client_notice`. Owner: F19 (S57-PO-10 hook task).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| T023-T027 | PARTIAL: nutrition scope done; workout BLOCKED     | Nutrition: `tests/unit/client-plan-export.test.ts`, `tests/unit/client-nutrition-plan.test.ts`, `tests/integration/client-nutrition-plan.test.ts`, kill tests K6 and K7 in `tests/integration/client-portal-db-mutation.test.ts`. App-layer mutations killed and restored (diff clean): M6 removing the non-active restriction in `nutrition-projection.ts` fails the restricted test; M7 releasing the file despite a failed success audit in `plan-export.ts` fails the fail-closed test; M8 dropping the plan-id match fails the mismatch test. Path note: authorization is the database wall plus `lib/client-access/plan-export.ts` and `app/(client)/plans/[planId]/export/route.ts` (no export server action). Workout scope: same F16/F17 contract as T017. |
| T028      | BLOCKED                                            | F17 `loadAuthorizedWorkoutExportPayload` denies the client role and resolves exercises through staff-only catalog RPCs; there is no client-authorized entry point. Owner: F16/F17.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| T029      | DONE                                               | The nutrition export passes the selected revision to the F18 builders (`exportClientNutritionPlan`) and keeps selections, totals and formula safety; no duplicate export engine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| T034      | BLOCKED                                            | No client-code field exists in F11 or the database. Owner: F11 (docs/01-traceability open item 6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| T035      | BLOCKED (PO-DECISION-NEEDED)                       | The assignment data now exists, but (1) no approved copy exists for the assignment filter label and options (new `staff.clientDirectory` keys are needed), and (2) the F11 unassigned-visibility rule (spec 011, S40-PO-10 item 5) limits assignment reads to the Workspace Owner and Platform Owner while the directory wall is `coaching_work` (Trainers). A PO/F11 ruling on who may filter by assignment is open. Owner: PO with F11.                                                                                                                                                                                                                                                                                                                           |
| T036      | BLOCKED                                            | No check-in fact (F23 not on main) and no pending food-replacement state (the F18 selection is an immediate client selection, not a staff-actionable request). Owner: F23 check-ins; F18 replacement request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| T037      | BLOCKED                                            | The staff check-in, replacement and planner routes do not exist. Owner: F15/F23, F18 T025, F17 T042/T043.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| T041      | INCOMPLETE                                         | Orchestrator cumulative review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Review follow-up (2026-11-18, independent review of head 0f25ee46, PASS-WITH-CONDITIONS):

- Kill tests K5, K8 and K9 added. K5 (`d.client_id = p_client_id`) and K8 (`d.client_id = client_row.client_id`) are defense in depth: the F19 foreign key `(workspace, subscription, client)` binds a subscription to its client, so the subscription-resolution predicate isolates on its own. Each test shows the client filter alone is masked (no leak), then kills both independent controls and shows the leak, then checks the installed definition. K9 kills the approved and not-deactivated conditions of `f22_portal_client` separately with an unapproved and a closed client.
- The evidence paths in T014, T015, T024, T025, T026, T032 and T033 point at real files. No `verification-report.md` is written; the test files are the record.
- The client export no longer writes a denial audit row for unknown or foreign targets: only a restricted (entitlement) denial of the authenticated client is audited, because the F18 recorder derives the row target from a caller-chosen id. Unit test and `tests/unit/client-plan-export-route.test.ts` (staff actor 404, bad input 404, denial redirect, response headers) added.
- Accepted LOW findings, no change: the staff directory evaluates the F13 summary once per matching row (a lateral join was not changed without a database to measure it), and the notice read surface ignores F13 entitlement by design (see FR-009).
