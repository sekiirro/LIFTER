# Tasks: F24 Workspace-Isolated Client Leaderboard

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); this work proceeds without a flag; flags are reconsidered before production.

**Organization**: Five independently verifiable P1 stories, with each vertical slice targeted at approximately 400-800 changed lines. No implementation or test execution is authorized by this specification PR. Every task names FR coverage and target file(s).

## Format

`[ID] [P?] [USn] Description` with exact target paths. `[HIGH-RISK: RLS/authorization]` marks database migration, RLS, authorization, audit-write, publish-approval or username-constraint work requiring independent review plus mutation evidence.

## Phase 1: Setup and dependencies

**Purpose**: Establish the safe feature boundary and confirm reused contracts.

- [ ] T001 [FR-004, FR-029] CANCELLED (PO S56-PO-4): complete the separate feature-flag mechanism prerequisite and add a server-only leaderboard flag gate.
- [ ] T002 [FR-031-FR-037] Verify the pinned F11, F13, F15, F19, F21, spec 022, spec 023, spec 003 and spec 005 contracts in `specs/024-client-leaderboard/research.md`; update dependency notes if any source contract moved.

## Phase 2: Foundational authorization and audit

**Purpose**: Build the common deny-by-default boundary before story work.

- [ ] T003 [FR-001, FR-027, FR-035] Add workspace-resolving server authorization helpers for leaderboard capabilities in `lib/leaderboard/authorization.ts`, delegating identity and membership rules to spec 003.
- [ ] T004 [P] [FR-036, FR-039, FR-040] Define allow-listed leaderboard audit event mapping through spec 005 in `lib/leaderboard/audit.ts`; include actor/time/action/workspace and exclude health data and score details.
- [ ] T005 [HIGH-RISK: RLS/authorization] [FR-001, FR-035] Add tenant-scoped leaderboard database foundations and RLS policies in `supabase/migrations/<timestamp>_client_leaderboard.sql`; bind every relation and foreign key to workspace.
- [ ] T006 [P] [FR-035, FR-040] Add real local RLS negative coverage for anonymous, revoked and foreign-workspace readers/writers in `tests/integration/leaderboard-rls.test.ts`.
- [ ] T007 [HIGH-RISK: RLS/authorization] [FR-001, FR-035, FR-036, FR-039, FR-040] Mutation-evidence tests (kill/restore/diff exit 0) for the foundational RLS, authorization and audit boundary; record results in `specs/024-client-leaderboard/traceability.md`.

## Phase 3: User Story 2 - Eligible client identity and opt-out (Priority P1)

**Goal**: Clients use a workspace-unique username and can turn off participation directly; removal is immediate and audited.

**Independent test**: Signup/edit uniqueness holds within a workspace, the same username is allowed in another workspace, and a listed client's opt-out immediately hides the row and is audited.

### Tests for User Story 2 (write first; must fail before implementation)

- [ ] T008 [P] [US2] [FR-022, FR-037] Verify signup, same-workspace case-insensitive uniqueness races, cross-workspace same-name allowance, own-edit and foreign-edit denial, and Q14 format/reserved-name validation in `tests/integration/leaderboard-username.test.ts`.
- [ ] T009 [P] [US2] [FR-007-FR-009, FR-025, FR-039] Verify immediate removal, later exclusion, audit and client-only action authorization in `tests/integration/leaderboard-opt-out.test.ts`.
- [ ] T010 [P] [US2] [HIGH-RISK: RLS/authorization] Mutation-evidence tests (kill/restore/diff exit 0) for the username uniqueness/reserved-name constraint and opt-out immediate-removal/audit control; record results in `specs/024-client-leaderboard/traceability.md`.
- [ ] T011 [P] [US2] [FR-005, FR-007-FR-009, FR-013, FR-025, FR-039] Verify the eligibility notice, opt-out control and account-settings surface in `tests/unit/leaderboard-notice.test.tsx` and `tests/e2e/leaderboard-opt-out.spec.ts`.

### Implementation for User Story 2

- [ ] T012 [US2] [FR-022, FR-037] Reuse/add the username field within `app/register/[token]/SignupForm.tsx` and `app/register/[token]/schema.ts`; preserve F11 route and `client_signup` transaction; apply Q14 format and reserved-name validation.
- [ ] T013 [US2] [FR-022, FR-037] Add client-owned username edit at `app/(client)/account/settings/actions.ts` and `lib/leaderboard/username.ts`; enforce case-insensitive workspace uniqueness at the database boundary in `supabase/migrations/<timestamp>_client_leaderboard.sql`.
- [ ] T014 [US2] [FR-007-FR-009, FR-025, FR-039] Add idempotent self-service opt-out action to `app/(client)/account/settings/actions.ts`; resolve own client/workspace server-side and write the spec 005 audit event.
- [ ] T015 [US2] [FR-005-FR-009, FR-013, FR-025, FR-038] Add account-settings notice and direct opt-out control in `app/(client)/account/settings/page.tsx`, using approved copy (S55-PO-10/S55-PO-11) from `specs/024-client-leaderboard/copy-proposal.md` where approved; month label approved (S55-PO-11).

## Phase 4: User Story 3 - Ranking uses current-month inputs (Priority P1)

**Goal**: Apply the approved composite, tie-break and incumbent replacement rule without exposing scores.

**Independent test**: Re-score past winners and candidates from current-month fixtures; replace a winner only when a new candidate is higher; assert stable tie-breaks.

### Tests for User Story 3 (write first; must fail before implementation)

- [ ] T016 [P] [US3] [FR-010-FR-014, FR-031-FR-034] Verify active subscription, 14 active days and freeze pause in `tests/unit/leaderboard-eligibility.test.ts`.
- [ ] T017 [P] [US3] [FR-015-FR-021, FR-031, FR-033] Verify 50/50 calculation, current-month incumbent comparison and tie-breaks in `tests/unit/leaderboard-scoring.test.ts`.

### Implementation for User Story 3

- [ ] T018 [P] [US3] [FR-010-FR-014, FR-031-FR-034] Build pure eligibility derivation over F13, F15 and F19 facts in `lib/leaderboard/eligibility.ts`; do not duplicate freeze, form or delivery engines.
- [ ] T019 [P] [US3] [FR-015-FR-021, FR-031, FR-033] Build pure score and tie-break functions in `lib/leaderboard/scoring.ts`, reading `workoutAdherence` and `dietAdherence` by name from spec 023 as 0-10 integers and normalized progress by goal type.
- [ ] T020 [US3] [FR-015-FR-021, FR-023-FR-024] Implement current-month re-scoring and "new candidate must score higher" incumbent comparison in `lib/leaderboard/ranking.ts`; retain only the minimal server-side candidate projection.

## Phase 5: User Story 1 - PO publishes an approved result (Priority P1)

**Goal**: A PO decision atomically publishes a monthly result; the previous approved result remains visible until then.

**Independent test**: Submit a synthetic candidate, prove it is hidden before approval, approve as PO, then verify visibility and audit; rejection leaves the previous approved list current.

### Tests for User Story 1 (write first; must fail before implementation)

- [ ] T021 [P] [US1] [FR-003, FR-004, FR-026, FR-029, FR-030] Verify hidden pending/rejected results and visible previous approved result across PO decisions in `tests/integration/leaderboard-publication.test.ts`.
- [ ] T022 [P] [US1] [FR-003, FR-026, FR-028] Verify PO-only approve/reject authorization boundary in `tests/integration/leaderboard-publication-rls.test.ts`.
- [ ] T023 [P] [US1] [HIGH-RISK: RLS/authorization] Mutation-evidence tests (kill/restore/diff exit 0) for the publish-approval control; record results in `specs/024-client-leaderboard/traceability.md`.

### Implementation for User Story 1

- [ ] T024 [P] [US1] [FR-003, FR-026, FR-028, FR-030] Add PO-only candidate approve/reject action and result boundary in `app/(app)/workspace-leaderboard/actions.ts`; WhatsApp verification remains external.
- [ ] T025 [US1] [FR-003, FR-026, FR-029, FR-030, FR-039] Implement transactional approve/reject state change and audit reference in `lib/leaderboard/publication.ts`; swap current publication only on approval.
- [ ] T026 [P] [US1] [FR-003, FR-004, FR-027-FR-030] Add localized PO review/decision screen for the full ranking in `app/(app)/workspace-leaderboard/review/page.tsx`, exposing no health inputs.

## Phase 6: User Story 4 - Privacy projection (Priority P1)

**Goal**: Return usernames and rank only; protect health inputs from UI, logs and exports.

**Independent test**: Inspect client/staff response and audit/log fixtures against an explicit allow-list; no health values, scores or inputs appear.

### Tests for User Story 4 (write first; must fail before implementation)

- [ ] T027 [P] [US4] [FR-023, FR-024, FR-038, FR-040] Scan response, telemetry, audit and error payloads for forbidden health, score and PII fields in `tests/integration/leaderboard-privacy.test.ts`.

### Implementation for User Story 4

- [ ] T028 [US4] [FR-022-FR-024, FR-027, FR-038, FR-040] Create server-side display DTO and explicit field allow-list in `lib/leaderboard/projection.ts`; include rank and username only.
- [ ] T029 [US4] [FR-022-FR-024, FR-027, FR-038, FR-042] Add the authorized client Top 5 section inside `app/(client)/progress/page.tsx` (one F24 component), redirect `app/(client)/leaderboard/page.tsx` to it, and add the shared workspace viewer surface in `app/(app)/workspace-leaderboard/`; preserve localized empty/unavailable states.
- [ ] T030 [US4] [FR-005, FR-038] Validate AR-RTL/EN-LTR, mobile/desktop, light/dark, keyboard and error/empty states against `docs/09-frontend-design-gate.md`; use only exact proposal-table strings until separately approved.

## Phase 7: User Story 5 - Workspace isolation (Priority P1)

**Goal**: Keep every candidate, publication and read inside its owning workspace.

**Independent test**: Seed eligible clients in A and B, publish in A, and prove no B identity/data is observable from A or vice versa.

### Tests for User Story 5 (write first; must fail before implementation)

- [ ] T031 [P] [US5] [FR-001, FR-035, FR-037] Add two-workspace direct database/API negative tests in `tests/integration/leaderboard-workspace-isolation.test.ts`, including signup username uniqueness scope.

### Implementation for User Story 5

- [ ] T032 [US5] [FR-001, FR-027, FR-035, FR-037] Verify workspace ownership on every leaderboard and client-username query in `lib/leaderboard/authorization.ts` and `lib/leaderboard/projection.ts`.

## Phase 8: Polish and cross-cutting gates

**Purpose**: Close traceability and required evidence after all story slices.

- [ ] T033 [P] [FR-001-FR-040] Update `specs/024-client-leaderboard/traceability.md` only after each mapped test passes; keep any unimplemented evidence marked NOT-IMPLEMENTED.
- [ ] T034 [FR-001-FR-040] Run full local lint, typecheck, unit, touched integration/e2e, format and security gates for the final feature head; record outcomes in `specs/024-client-leaderboard/traceability.md`.
- [ ] T035 [HIGH-RISK: RLS/authorization] [FR-001-FR-040] CANCELLED (PO S56-PO-4): remove the leaderboard feature flag after completion.

## Phase 9: PO decisions S57-PO-1 to S57-PO-12 (2026-11-14/15)

**Purpose**: Apply the decided progress formula, tie-breaks, full ranking, private rank and placement.

- [ ] T036 [P] [US3] [FR-014, FR-018, FR-035, FR-036, FR-043] [HIGH-RISK: RLS/authorization] Add the workspace-scoped goal-type store with coaching-staff set/read RPCs and audit in `supabase/migrations/<timestamp>_f24_client_goal_types.sql`, and the Client Details Goals section in `components/client-goals/ClientGoals.tsx`; prove trainer/owner/PO access and Sales, foreign-workspace, client and anonymous denial in `tests/integration/leaderboard-goal-types.test.ts`.
- [ ] T037 [P] [US3] [FR-016-FR-018, FR-021] Implement the S57-PO-1 formula, S57-PO-4 monthly mean, S57-PO-2 last scoring input and S57-PO-3 registration order as resolvers in `lib/leaderboard/goals.ts` and `lib/leaderboard/resolvers.ts`, with boundary and tie-break tests in `tests/unit/leaderboard-goal-progress.test.ts` and end-to-end generation in `tests/integration/leaderboard-generation.test.ts`.
- [ ] T038 [US1] [FR-002, FR-008, FR-019, FR-020, FR-029] [HIGH-RISK: RLS/authorization] Store the full ranking, derive the public Top 5 at read time, promote on opt-out without reapproval, and keep past winners at the Top 5 boundary in `supabase/migrations/<timestamp>_f24_full_ranking.sql` and `lib/leaderboard/ranking.ts`; prove it in `tests/integration/leaderboard-full-ranking.test.ts` with kill/restore/diff mutation evidence for the public cap.
- [ ] T039 [US4] [FR-041] [HIGH-RISK: RLS/authorization] Add the own-only private rank (rank and participant total, eligible callers only, opted-out kept) in `supabase/migrations/<timestamp>_f24_private_rank_eligible.sql` and `components/leaderboard/MyRank.tsx`; prove own-only, ineligible-nothing, staff/anonymous/foreign denial and kill/restore/diff mutation evidence in `tests/integration/leaderboard-full-ranking.test.ts`.
- [ ] T040 [US4] [FR-038, FR-042] Place the Top 5 and private rank inside the client Progress page, apply the S57-PO-12 approved copy, and verify AR-RTL/EN-LTR, mobile/desktop and the redirect in `tests/e2e/leaderboard-screenshots.spec.ts` and `tests/e2e/leaderboard-opt-out.spec.ts`.

## Dependencies and execution order

- T002 confirms upstream contract versions.
- T003-T007 are foundational; story work starts after authorization/RLS foundations.
- US2 uses the established F11 signup and client settings boundaries. US3 builds candidate ranking after foundational adapters. US1 depends on T020 ranking output. US4 consumes approved publications. US5 is a cross-story negative-proof slice.
- T008-T015 depend on T003-T005. T016-T020 depend on read-only F13/F15/F19/spec 023 adapters. T021-T026 depend on T020 candidate output plus T003-T005. T027-T030 depend on the publication/read boundary. T031-T032 exercise all workspace-owned relations. T033-T034 are final gates.
- Username validation follows S55-PO-9 Q14; no implementation may expand beyond those rules.

## Parallel opportunities

- T004 and T006 can proceed after T003's authorization shape is defined, in separate files.
- T016, T017, T018, T019 and T028 are separate modules after shared interfaces are agreed.
- T012, T026 and T029 are separate UI surfaces after their server contracts exist.

## Implementation strategy

Start with authorization foundations. Deliver one small story slice at a time, keeping each PR near 400-800 changed lines. Candidate ranking and display remain inaccessible until PO approval. Proceed without a feature flag while LIFTER is not live (PO S56-PO-4); reconsider flags before production. Complete each slice with local CI-equivalent evidence before its one push; complete the feature review and gates.
