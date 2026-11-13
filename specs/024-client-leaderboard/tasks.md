# Tasks: F24 Workspace-Isolated Client Leaderboard

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Prerequisite**: The shared server-side default-OFF feature-flag mechanism must be specified and merged in its own small PR before this feature can merge unfinished.

**Organization**: Five independently verifiable P1 stories, with each vertical slice targeted at approximately 400-800 changed lines. No implementation or test execution is authorized by this specification PR. Every task names FR coverage and target file(s).

## Phase 1: Setup and dependencies

**Purpose**: Establish the safe feature boundary and confirm reused contracts.

- [ ] T001 [FR-004, FR-029] Complete the separate feature-flag mechanism spec/PR before implementation; add a server-only default-OFF leaderboard gate in `lib/feature-flags/server.ts` only after that prerequisite exists.
- [ ] T002 [FR-031-FR-037] Verify the pinned F11, F13, F15, F19, F21, spec 022, spec 023, spec 003 and spec 005 contracts in `specs/024-client-leaderboard/research.md`; update dependency notes if any source contract moved.

## Phase 2: Foundational authorization and audit

**Purpose**: Build the common deny-by-default boundary before story work.

- [ ] T003 [FR-001, FR-027, FR-035] Add workspace-resolving server authorization helpers for leaderboard capabilities in `lib/leaderboard/authorization.ts`, delegating identity and membership rules to spec 003.
- [ ] T004 [P] [FR-036, FR-039, FR-040] Define allow-listed leaderboard audit event mapping through spec 005 in `lib/leaderboard/audit.ts`; include actor/time/action/workspace and exclude health data and score details.
- [ ] T005 [FR-001, FR-035] Add tenant-scoped leaderboard database foundations and RLS policies in `supabase/migrations/<timestamp>_client_leaderboard.sql`; bind every relation and foreign key to workspace.
- [ ] T006 [P] [FR-035, FR-040] Add real local RLS negative coverage for anonymous, revoked and foreign-workspace readers/writers in `tests/integration/leaderboard-rls.test.ts`.

## Phase 3: User Story 2 - Eligible client identity and opt-out (Priority P1)

**Goal**: Clients use a workspace-unique username and can turn off participation directly; removal is immediate and audited.

**Independent test**: Signup/edit uniqueness holds within a workspace, the same username is allowed in another workspace, and a listed client's opt-out immediately hides the row and is audited.

**Slice 1 - client settings and username (approximately 400-800 changed lines)**

- [ ] T007 [US2] [FR-022, FR-037] Reuse/add the username field within `app/register/[token]/SignupForm.tsx` and `app/register/[token]/schema.ts`; preserve F11 route and `client_signup` transaction, and wait for S55-024-Q14 before final format/reserved-name validation.
- [ ] T008 [US2] [FR-022, FR-037] Add client-owned username edit at `app/(client)/account/settings/actions.ts` and `lib/leaderboard/username.ts`; enforce workspace uniqueness at the database boundary in `supabase/migrations/<timestamp>_client_leaderboard.sql`.
- [ ] T009 [US2] [FR-007-FR-009, FR-025, FR-039] Add idempotent self-service opt-out action to `app/(client)/account/settings/actions.ts`; resolve own client/workspace server-side and write the spec 005 audit event.
- [ ] T010 [US2] [FR-005-FR-009, FR-013, FR-025, FR-038] Add account-settings notice and direct opt-out control in `app/(client)/account/settings/page.tsx`, using proposed copy from `specs/024-client-leaderboard/copy-proposal.md`.
- [ ] T011 [P] [US2] [FR-005, FR-007-FR-009, FR-013, FR-025, FR-039] Verify immediate removal, later exclusion, audit and client-only action authorization in `tests/integration/leaderboard-opt-out.test.ts`.
- [ ] T012 [US2] [FR-022, FR-037] Verify signup, same-workspace uniqueness races, cross-workspace same-name allowance, own-edit and foreign-edit denial in `tests/integration/leaderboard-username.test.ts`; use Q14-approved validation only.

## Phase 4: User Story 3 - Ranking uses current-month inputs (Priority P1)

**Goal**: Apply the approved composite, tie-break and incumbent replacement rule without exposing scores.

**Independent test**: Re-score past winners and candidates from current-month fixtures; replace a winner only when a new candidate is higher; assert stable tie-breaks.

**Slice 2 - eligibility and scoring (approximately 400-800 changed lines)**

- [ ] T013 [P] [US3] [FR-010-FR-014, FR-031-FR-034] Build pure eligibility derivation over F13, F15 and F19 facts in `lib/leaderboard/eligibility.ts`; do not duplicate freeze, form or delivery engines.
- [ ] T014 [P] [US3] [FR-015-FR-021, FR-031, FR-033] Build pure score and tie-break functions in `lib/leaderboard/scoring.ts`, reading `workoutAdherence` and `dietAdherence` by name from spec 023 as 0-10 integers and normalized progress by goal type.
- [ ] T015 [US3] [FR-015-FR-021, FR-023-FR-024] Implement current-month re-scoring and "new candidate must score higher" incumbent comparison in `lib/leaderboard/ranking.ts`; retain only the minimal server-side candidate projection.
- [ ] T016 [P] [US3] [FR-010-FR-021, FR-031-FR-034] Verify active subscription, 14 active days, freeze pause, 50/50 calculation, current-month incumbent comparison and tie-breaks in `tests/unit/leaderboard-scoring.test.ts`.

## Phase 5: User Story 1 - PO publishes an approved result (Priority P1)

**Goal**: A PO decision atomically publishes a monthly result; the previous approved result remains visible until then.

**Independent test**: Submit a synthetic candidate, prove it is hidden before approval, approve as PO, then verify visibility and audit; rejection leaves the previous approved list current.

**Slice 3 - candidate and PO decision (approximately 400-800 changed lines)**

- [ ] T017 [P] [US1] [FR-003, FR-026, FR-028, FR-030] Add PO-only candidate approve/reject action and result boundary in `app/(app)/leaderboard/actions.ts`; WhatsApp verification remains external.
- [ ] T018 [US1] [FR-003, FR-026, FR-029, FR-030, FR-039] Implement transactional approve/reject state change and audit reference in `lib/leaderboard/publication.ts`; swap current publication only on approval.
- [ ] T019 [P] [US1] [FR-003, FR-004, FR-027-FR-030] Add localized PO review/decision screen in `app/(app)/leaderboard/page.tsx`, exposing no health inputs.
- [ ] T020 [US1] [FR-003, FR-004, FR-026, FR-029] Verify hidden pending/rejected results and visible previous approved result across PO decisions in `tests/integration/leaderboard-publication.test.ts`.

## Phase 6: User Story 4 - Privacy projection (Priority P1)

**Goal**: Return usernames and rank only; protect health inputs from UI, logs and exports.

**Independent test**: Inspect client/staff response and audit/log fixtures against an explicit allow-list; no health values, scores or inputs appear.

**Slice 4 - minimal read projection (approximately 400-800 changed lines)**

- [ ] T021 [US4] [FR-022-FR-024, FR-027, FR-038, FR-040] Create server-side display DTO and explicit field allow-list in `lib/leaderboard/projection.ts`; include rank and username only.
- [ ] T022 [US4] [FR-022-FR-024, FR-027, FR-038] Add authorized leaderboard read page in `app/(client)/leaderboard/page.tsx` and shared workspace viewer surface in `app/(app)/leaderboard/`; preserve localized empty/unavailable states.
- [ ] T023 [US4] [FR-023, FR-024, FR-038, FR-040] Scan response, telemetry, audit and error payloads for forbidden health, score and PII fields in `tests/integration/leaderboard-privacy.test.ts`.
- [ ] T024 [US4] [FR-005, FR-038] Validate AR-RTL/EN-LTR, mobile/desktop, light/dark, keyboard and error/empty states against `docs/09-frontend-design-gate.md`; use only exact proposal-table strings until separately approved.

## Phase 7: User Story 5 - Workspace isolation (Priority P1)

**Goal**: Keep every candidate, publication and read inside its owning workspace.

**Independent test**: Seed eligible clients in A and B, publish in A, and prove no B identity/data is observable from A or vice versa.

**Slice 5 - cross-tenant proof (approximately 400-800 changed lines)**

- [ ] T025 [US5] [FR-001, FR-027, FR-035, FR-037] Verify workspace ownership on every leaderboard and client-username query in `lib/leaderboard/authorization.ts` and `lib/leaderboard/projection.ts`.
- [ ] T026 [US5] [FR-001, FR-035, FR-037] Add two-workspace direct database/API negative tests in `tests/integration/leaderboard-workspace-isolation.test.ts`, including signup username uniqueness scope.

## Phase 8: Polish and cross-cutting gates

**Purpose**: Close traceability and required evidence after all story slices.

- [ ] T027 [P] [FR-001-FR-040] Update `specs/024-client-leaderboard/traceability.md` only after each mapped test passes; keep any unimplemented evidence marked NOT-IMPLEMENTED.
- [ ] T028 [FR-001-FR-040] Run full local lint, typecheck, unit, touched integration/e2e, format and security gates for the final feature head; record outcomes in `specs/024-client-leaderboard/traceability.md`.
- [ ] T029 [FR-001-FR-040] Remove the default-OFF flag only after all feature gates and the cumulative feature review pass, in `lib/feature-flags/server.ts`.

## Dependencies and execution order

- T001 is a separate prerequisite PR and blocks any unfinished merge. T002 confirms upstream contract versions.
- T003-T006 are foundational; story work starts after authorization/RLS foundations.
- US2 uses the established F11 signup and client settings boundaries. US3 builds candidate ranking after foundational adapters. US1 depends on T015 ranking output. US4 consumes approved publications. US5 is a cross-story negative-proof slice.
- T007-T012 depend on T003-T005. T013-T016 depend on read-only F13/F15/F19/spec 023 adapters. T017-T020 depend on T015 candidate output plus T003-T005. T021-T024 depend on the publication/read boundary. T025-T026 exercise all workspace-owned relations. T027-T029 are final gates.
- Username-specific format/reserved-name implementation is blocked until a PO answer to Q14; other username lifecycle behavior follows decided Q11.

## Parallel opportunities

- T004 and T006 can proceed after T003's authorization shape is defined, in separate files.
- T013, T014 and T021 are separate modules after shared interfaces are agreed.
- T010, T019 and T022 are separate UI surfaces after their server contracts exist.

## Implementation strategy

Start with the separate flag prerequisite and authorization foundations. Deliver one small story slice at a time, keeping each PR near 400-800 changed lines. Candidate ranking and display remain inaccessible until PO approval. Keep incomplete work dark behind the server-side default-OFF flag. Complete each slice with local CI-equivalent evidence before its one push; remove the flag only after cumulative feature gates pass.
