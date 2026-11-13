# Tasks: Client Portal Delivery

**Input**: Design documents from `/specs/022-client-portal-delivery/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`
**Task format**: Each implementation task names FR coverage, and user-story tasks also carry a story label. Group work into vertical slices of approximately 400 to 800 changed lines; merge `origin/main` before each slice. No feature slice may gate authorization/RLS behind the flag. The prerequisite flag-mechanism spec/PR must establish the approved integration point before portal implementation starts.

## Phase 1: Setup

- [ ] T001 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Complete the prerequisite feature-flag mechanism spec/PR, then configure the server-side portal flag with default OFF in `specs/feature-flags/plan.md`.
- [ ] T002 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Wire the default-OFF flag into portal server routes and services in `lib/feature-flags/client-portal.ts`.

## Phase 2: Foundational

- [ ] T003 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Map planned server reads/actions to existing F11/F13 identity, workspace, capability and entitlement checks in `lib/client-access/authorize.ts`.
- [ ] T004 [FR-010, FR-011] Add workspace-isolation negative coverage for portal and directory boundaries in `tests/integration/client-portal-isolation.test.ts`.
- [ ] T005 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Record slice boundaries and owned files in `specs/022-client-portal-delivery/tasks.md`.

## Phase 3: User Story 1 to Deliver first plans and activate (Priority: P1)

**Goal**: Use F19 independent Ready & Publish operations and its exactly-once completion transaction.
**Independent Test**: Publish the first workout and nutrition plans separately; verify each F19 delivery appears once and only the completing first-plan delivery activates and awards the approved point.

- [ ] T006 [US1] [FR-001] Wire eligible workout Ready & Publish to F19 delivery/idempotency in `app/(app)/clients/[clientId]/actions.ts`.
- [ ] T007 [US1] [FR-001] Wire eligible nutrition Ready & Publish to F19 delivery/idempotency in `app/(app)/clients/[clientId]/actions.ts`.
- [ ] T008 [US1] [FR-002, FR-003] Reuse F19 activation and F13 T044 productivity behavior in `lib/productivity/points.ts`.
- [ ] T009 [US1] [FR-001, FR-002, FR-003] Cover split-day delivery, retry/concurrency and exactly-once activation in `tests/integration/plan-delivery-activation.test.ts`.

## Phase 4: User Story 2 to Review delivered plans and subscription (Priority: P1)

**Goal**: Let a client see all own delivered plans and authoritative subscription details, subject to F13 entitlement.
**Independent Test**: Verify latest revision defaults, older published revisions are selectable, foreign/draft plans are absent, and entitlement denial returns only status/end date/restricted state.

- [ ] T010 [US2] [FR-004, FR-005] Build client-safe delivered-plan projection using F19/F13 in `app/(client)/plans/page.tsx`.
- [ ] T011 [US2] [FR-004] Add own-plan published-revision selection in `app/(client)/plans/[planId]/page.tsx`.
- [ ] T012 [US2] [FR-004, FR-005, FR-006, FR-007] Enforce fresh F13 entitlement and restricted projection in `lib/client-access/authorize.ts`.
- [ ] T013 [US2] [FR-004, FR-005, FR-006, FR-007, FR-010] Cover projection, revision, entitlement, draft and foreign-client cases in `tests/integration/client-portal-access.test.ts`.

## Phase 5: User Story 3 to Receive in-app plan notices (Priority: P2)

**Goal**: Reuse F15 inbox and create one notice per first-plan delivery.
**Independent Test**: Complete a first-plan pair; verify two notices total and activation text only on the completing delivery's notice.

- [ ] T014 [US3] [FR-009] Extend F15 inbox delivery for client recipients in `lib/forms/alert-inbox.ts`.
- [ ] T015 [US3] [FR-009] Emit one notice per delivery and activation text on the completing delivery in `lib/forms/alert-inbox.ts`.
- [ ] T016 [US3] [FR-009] Cover notice count, deduplication, recipient authorization and payload in `tests/integration/client-portal-notices.test.ts`.

## Phase 6: User Story 4 to Export a published plan (Priority: P2)

**Goal**: Export the currently viewed revision of the client's own delivered plan in PDF or Excel.
**Independent Test**: Select a prior published revision and verify the export matches it; deny draft, foreign-client and entitlement-restricted exports without returning content.

- [ ] T017 [US4] [FR-006, FR-008, FR-010, FR-012] Authorize export for own delivery and current entitlement in `app/(client)/plans/[planId]/actions.ts`.
- [ ] T018 [US4] [FR-008] Pass selected revision to F17 exporters in `lib/workout-planner/export-guards.ts`.
- [ ] T019 [US4] [FR-008] Pass selected revision to F18 exporters and preserve selections/totals in `lib/plans/nutrition/export.ts`.
- [ ] T020 [US4] [FR-006, FR-008, FR-010] Cover selected-revision fidelity, denied requests and formula safety in `tests/integration/client-plan-export.test.ts`.

## Phase 7: User Story 5 to Find clients and outstanding work (Priority: P1)

**Goal**: Provide a workspace-authorized staff directory with approved fields, existing state filters and links to owning work surfaces.
**Independent Test**: Search each approved identity field, apply each existing filter, verify indicators and confirm no cross-workspace disclosure.

- [ ] T021 [US5] [FR-011] Build directory query over F11 identity fields in `app/(app)/clients/page.tsx`.
- [ ] T022 [US5] [FR-011] Add existing account/approval, subscription and assignment filters in `app/(app)/clients/page.tsx`.
- [ ] T023 [US5] [FR-011] Show three owning-surface indicators in `app/(app)/clients/page.tsx`.
- [ ] T024 [US5] [FR-011] Link indicators to existing F15/F18/F19 surfaces in `app/(app)/clients/page.tsx`.
- [ ] T025 [US5] [FR-011] Cover search, filters, indicators and workspace isolation in `tests/integration/client-directory.test.ts`.

## Phase 8: Polish and completion

- [ ] T026 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Review changed strings against the proposal in `lib/i18n/messages/en.ts` and `lib/i18n/messages/ar.ts`.
- [ ] T027 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Run required local validation on the final feature slice as documented in `specs/022-client-portal-delivery/quickstart.md`.
- [ ] T028 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Complete one cumulative feature AI review and resolve blockers as recorded in `specs/022-client-portal-delivery/tasks.md`.
- [ ] T029 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013] Remove the default-OFF flag after feature completion in `lib/feature-flags/client-portal.ts`.

- [ ] T030 [FR-012, FR-013] Verify per-plan exports remain within the approved boundary and no YBS access/sync enters the feature scope in `specs/022-client-portal-delivery/spec.md`.

## Dependencies and slice order

1. Setup and foundational authorization mapping precede all user stories. The flag remains OFF until deliberately enabled for implementation validation.
2. User Story 1 uses existing F19/F13 behavior. User Stories 2 and 4 depend on its delivered-plan projections and F13 authorization. User Story 3 consumes F19 delivery completion via F15. User Story 5 uses F11/F13/F15/F18/F19 data and can proceed after foundation.
3. Slice the above phases into reviewable vertical slices near 400 to 800 changed lines, merge current `origin/main` before each, and complete the required local validation before one push per slice.
4. The feature is not complete until all stories are implemented, one cumulative AI review has passed its blocking-finding gate, and the default-OFF flag is removed in the completion slice.

## Parallel opportunities

After shared authorization contracts are mapped, directory work (US5) can proceed separately from client portal projection (US2). Export work (US4) can proceed after projection contract is stable. Inbox work (US3) can proceed alongside UI work once F19 delivery events are available. Avoid simultaneous edits to shared routes, message catalogs and integration test files.

## Implementation strategy

Ship vertical slices with a default-OFF server flag. Complete independent first-plan delivery as the first user-facing slice; then add client projection, notices, exports and directory slices in dependency order. Keep all authorization active for flagged code. Run local CI-equivalent validation before each push. Obtain one AI review when the cumulative feature diff is complete; remove the flag in the final completion slice.
