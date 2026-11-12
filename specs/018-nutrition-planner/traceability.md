# F18 traceability

**Date**: 2026-11-11 (CodeRabbit + Greptile PR #79 spec-consistency fixes). **Base**: `origin/main` `d0c5d1ac7ec8adb13ad12712f85cf9702a97a414`. **Branch**: `speckit-018-nutrition-planner-s42`.

**Scope**: sections 1–3 and 4b record the specification artefacts only (pre-implementation state). Section 4a records the executed Phase 0 evidence on branch `018-impl-s47-p0` (PO S47-PO-13).

Status legend: `SPECIFIED` = requirement and design are complete and internally consistent; `SPECIFIED (resolved by S43-PO-5; architect mapping (S43-R6))` = approved prompt body is byte-exact in the local contract; `BLOCKED-MCQ` = dependent behavior awaits the listed PO decision; `EXCLUDED` = deliberately out of scope; `DELEGATED` = owned by another feature and referenced only.

## 1. Requirement → authority → task

| Requirement | Authority (type)                                                  | Task(s)                            | Contract/design                        | Status                                                                                                             |
| ----------- | ----------------------------------------------------------------- | ---------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| F18-FR-001  | S42-PO-2 + S42-PO-4 MCQ-12 + F19 pending (DIRECT/DELEGATED)       | T009, T026                         | plan §1, data-model §1                 | SPECIFIED                                                                                                          |
| F18-FR-002  | D18-2=A, D18-6, retained F18 FR-002 (DIRECT); S44-PO-7            | T001, T007, T022, T025             | nutrition-document.md sections 1-2     | SPECIFIED; each meal visible and counted only on its containing day, no day-type filtering                         |
| F18-FR-003  | D18-4=C, S27-PO-2, S43-PO-1 MCQ-4, F16 scales (DIRECT + evidence) | T002, T008, T022                   | data-model section 2                   | SPECIFIED (exact persistence; each meal counted only in its containing day; half-up once at display; S43-R9 Sol-1) |
| F18-FR-004  | PRD-05 acceptance, F16 FR-005 (DIRECT)                            | T001, T002, T008, T022             | `nutrition-document.md` §2.5           | SPECIFIED                                                                                                          |
| F18-FR-005  | F16 FR-020, retained F18 FR-005 (DIRECT)                          | T003, T009, T022                   | data-model §1-2, contract §4           | SPECIFIED                                                                                                          |
| F18-FR-006  | PRD-05, S20-11/S20-13, PRD-12 (DIRECT)                            | T001, T005, T023, T025             | `nutrition-document.md` §1             | SPECIFIED                                                                                                          |
| F18-FR-007  | S20-17/D18-1, A2, A5 Q1=A (DIRECT)                                | T012, T013, T015                   | `template-assignment.md` §1, §3        | SPECIFIED                                                                                                          |
| F18-FR-008  | A5 Q1=A + A2 (DIRECT)                                             | T006, T014                         | `template-assignment.md` §2            | SPECIFIED (held copies skipped/reported; zero-copy race rejected)                                                  |
| F18-FR-009  | S20-17, F19-FR-008, A2 (DIRECT)                                   | T006, T012, T013                   | `template-assignment.md` §1            | SPECIFIED                                                                                                          |
| F18-FR-010  | PRD-05, A6, F19-FR-003 (DIRECT/DELEGATED)                         | T026                               | plan §1                                | SPECIFIED                                                                                                          |
| F18-FR-011  | A5 Q2=A, S20-19, S42-PO-3 Q9 (DIRECT)                             | T004, T010                         | `nutrition-api.md` §4, data-model §3   | SPECIFIED                                                                                                          |
| F18-FR-012  | A5 Q2=A, D18-9=A (DIRECT)                                         | T004, T011                         | data-model §2-3                        | SPECIFIED                                                                                                          |
| F18-FR-013  | A5 Q2=A, PRD-05 (DIRECT)                                          | T004, T010, T023                   | plan §5, contract §6                   | SPECIFIED (selected primary; per-item coach note; S43-PO-2 for prompt note and totals representation)              |
| F18-FR-014  | PRD-05, D18-6, S20-16 pattern (DIRECT)                            | T005, T023                         | contract §6                            | Current-revision export specified; historical-revision export specified by S43-PO-8                                |
| F18-FR-015  | A5 Q3=A (DIRECT)                                                  | T005, T024                         | contract §6, plan §7                   | SPECIFIED prompt body resolved by S43-PO-5                                                                         |
| F18-FR-016  | Constitution VII, retained F18 FR-010a (DIRECT)                   | T010, T016                         | contract §4, §7                        | SPECIFIED                                                                                                          |
| F18-FR-017  | Constitution I/III, F16 FR-012/033 (DIRECT)                       | T018                               | data-model §6, contract §2             | SPECIFIED                                                                                                          |
| F18-FR-018  | PRD-06:188, retained F18 FR-010b (DIRECT/OPEN-TECH)               | T017                               | data-model §1 note, conflicts C-11     | SPECIFIED (ownership to reconcile with F19)                                                                        |
| F18-FR-019  | Constitution IX, F16 FR-016, F19-FR-010 (DIRECT)                  | T003, T009, T010, T013, T014, T019 | contract §3, template-assignment.md §4 | SPECIFIED                                                                                                          |
| F18-FR-020  | Constitution V, retained F18 FR-013 (DIRECT)                      | T020, T027                         | data-model §1, §8                      | SPECIFIED                                                                                                          |
| F18-FR-021  | Constitution VIII, retained F18 FR-012 (DIRECT)                   | T001, T025                         | plan §9                                | SPECIFIED (copy gate before UI)                                                                                    |
| F18-FR-022  | PRD-12, S20-21 (DIRECT)                                           | none                               | spec Out of scope                      | EXCLUDED                                                                                                           |
| F18-FR-023  | S44-PO-7; architect mapping (S44-R7)                              | T001, T005, T025                   | nutrition-document.md §1; US1 GWT 8    | SPECIFIED (separate, independently editable Meal Notes and Food Notes)                                             |

## 2. Success criteria → task

| Criterion  | Task(s)                | Evidence expected                                             | Status                                                              |
| ---------- | ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| F18-SC-001 | T002, T008, T022, T027 | identical TS/SQL golden run (500 cases)                       | SPECIFIED                                                           |
| F18-SC-002 | T018, T019, T027       | full negative/concurrency matrix                              | SPECIFIED                                                           |
| F18-SC-003 | T026                   | multi-plan projection fixture                                 | SPECIFIED                                                           |
| F18-SC-004 | T001, T008, T027       | invalid-unit matrix                                           | SPECIFIED                                                           |
| F18-SC-005 | T005, T023, T024       | Current and historical AR/EN export goldens + prompt fidelity | Current revision specified; historical export specified by S43-PO-8 |
| F18-SC-006 | T021                   | recorded envelope + benchmark report                          | SPECIFIED                                                           |
| F18-SC-007 | T006, T014             | assignment state-machine fixtures                             | SPECIFIED (held copies skipped/reported; zero-copy race rejected)   |
| F18-SC-008 | T004, T010, T011       | selection/carry-forward fixtures                              | SPECIFIED                                                           |
| F18-SC-009 | T012, T015             | template isolation + Make it Global fixtures                  | SPECIFIED                                                           |
| F18-SC-010 | T016                   | log-scrub report                                              | SPECIFIED                                                           |
| F18-SC-011 | T002, T025             | display fixtures                                              | SPECIFIED (half-up)                                                 |
| F18-SC-012 | T001, T005, T025       | separate-field schema/editor contract tests                   | SPECIFIED                                                           |

## 3. Delegated and excluded

| Item                                                                      | Owner          | Why not F18                                 |
| ------------------------------------------------------------------------- | -------------- | ------------------------------------------- |
| Stable plan identity, draft, revision, delivery, activation, productivity | F19 (pending)  | F19-FR-001..014; F18-FR-001 references only |
| Client projection and expiry surface                                      | F19/P4         | F18 supplies data + selection RPC           |
| Food identity/versions/serving units/search                               | F16 (landed)   | F18 consumes                                |
| Subscription entitlement, freeze, refund                                  | F13/P4         | F18 consumes                                |
| Food-replacement requests, check-ins                                      | P5             | F18-FR-022                                  |
| Telegram                                                                  | P6             | F18-FR-022                                  |
| Workout planning                                                          | F17 (parallel) | separate collection/types                   |
| Meal logging, AI-generated content, offline queue                         | excluded       | PRD-12                                      |

## 4. Verification status

- Tasks: **T001–T006 ticked** — Phase 0 (frozen contracts and fixtures) implemented on branch `018-impl-s47-p0` (PO S47-PO-13: F18 Phase 0 only).
- Tests executed for F18 Phase 0 on implementation head `fd73d7b5`: T001 `tests/unit/nutrition-schema.test.ts` 24 passed; T002 `tests/golden/nutrition-macros.ts` 11 passed; T003 `tests/contracts/nutrition-publish.test.ts` 11 passed; T004 `tests/contracts/nutrition-selection.test.ts` 11 passed; T005 `tests/contracts/nutrition-export-contract.test.ts` 9 passed; T006 `tests/unit/nutrition-assignment.test.ts` 10 passed. Full unit suite on the final head: 174 files / 2372 tests passed (`npx tsc --noEmit` OK; `npx eslint . --max-warnings=0` OK). RED and mutation logs are archived in the run dirs `runs/s47-glm-f18-p0/` and `runs/s48-glm-f18-p0b2/`.
- `tests/contracts/*.test.ts` and `tests/golden/*.ts` are collected by `vitest.config.ts` (include extended in the T002 commit `c0c572a4`); no DB, migration or UI file was touched.
- Rows for §1/§2 below remain specification-status rows; executed evidence per task is listed in section 4a.

## 4a. Executed evidence (FR → Task → Test → commit)

| FR                                         | Task | Test                                                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ---- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F18-FR-002, FR-004, FR-006, FR-021, FR-023 | T001 | `tests/unit/nutrition-schema.test.ts` (24)              | commit `da94d1da`; RED `t001-red.log`, mutation (implicitDayTypeId optional) `t001-mutation.log` in `runs/s47-glm-f18-p0/`                                                                                                                                                                                                                                                                         |
| F18-FR-002, FR-003, FR-004                 | T002 | `tests/golden/nutrition-macros.ts` (11)                 | commits `c0c572a4` (goldens) + S48-PO-11 implementation per S48-R14: revert `dc605d3d` (reverts the retracted S48-R13 fix `d8e48ea4`) + goldens `9510710a`; S48-R14 logs `t002-green-r14.log`, mutation `t002-mutation-r14.log` (2 failing), restore `t002-green-r14b.log` in `runs/s48-glm-f18-fix2/`; earlier T002 RED `t002-red.log` and mutation `t002-mutation.log` in `runs/s47-glm-f18-p0/` |
| F18-FR-005, FR-019                         | T003 | `tests/contracts/nutrition-publish.test.ts` (11)        | commit `e3f1d19a`; RED (no-contract stub, 9 failing) `t003-red.log`, mutation (replay conflation, 2 failing) `t003-mutation.log` in `runs/s47-glm-f18-p0/`                                                                                                                                                                                                                                         |
| F18-FR-011..013, FR-016                    | T004 | `tests/contracts/nutrition-selection.test.ts` (11)      | commit `5d5aa65c`; RED (no-contract stub, 11 failing) `t004-red.log`, mutation (approved-list check removed, 2 failing) `t004-mutation.log` in `runs/s47-glm-f18-p0/`                                                                                                                                                                                                                              |
| F18-FR-006, FR-014, FR-015, FR-023         | T005 | `tests/contracts/nutrition-export-contract.test.ts` (17) | commit `3b7816af` (baseline 9) + S49-R12/S49-PO-5 follow-up T028: `LABELS` parameterization, EN byte-identical, AR approved labels; RED->GREEN `runs/s49-beam-f18-labels/`; mutation (swap one AR label) fails.                                                                                                                                                                                                                                             |
| F18-FR-008, FR-009                         | T006 | `tests/unit/nutrition-assignment.test.ts` (10)          | commit `fd73d7b5`; RED (module absent) `t006-red.log`, mutation (All tops up partial workspace, 1 failing) `t006-mutation.log` in `runs/s48-glm-f18-p0b2/`                                                                                                                                                                                                                                         |
| F18-FR-006, FR-014, FR-015                 | T028 | `tests/contracts/nutrition-export-contract.test.ts` (P6 AR labels) | S49-R12/S49-PO-5: P6 table in `contracts/copy-ai-prompt.md`; `LABELS` const; AR assertions for all 18 labels; mutation (swap one AR label) fails; EN byte-identical (17/17 pass). Run `runs/s49-beam-f18-labels/`.                                                                                                                                                                                                                                         |

## 4b. Historical verification status (pre-implementation)

- Tasks: **0 ticked** — no task in `tasks.md` is marked complete.
- Tests executed for F18: **0**. This branch contains no code, SQL, migration, fixture or test.
- The only verified facts are read-only observations on `main` and on historic branches, each cited in `research/conflicts.md`.
- Traceability will be updated with `FR → Task → Test → Evidence` rows only after tests execute on an implementation head, per the Spec Kit gate. A task may not be ticked from this file alone.

## 5. Open decisions attached to traceability

| MCQ                                | Requirements/rows affected                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Resolved S43-MCQ-A (S43-PO-5)      | F18-FR-015 P3/P4 byte equality after payload substitution, T024                                                       |
| Resolved S43-MCQ-B (S43-PO-2)      | F18-SC-005; per-item prompt note and client-selection totals, T005/T023/T024                                          |
| Resolved S43-F18-MCQ-7 (S43-PO-8)  | F18-FR-014 / F18-SC-005; T023 exports the last valid selection for the requested historical revision; task unblocked. |
| S44-MCQ-F18-1 (closed by S44-PO-7) | F18-FR-002; T001: each meal visible and counted only on its containing day; no day-type meal blocker                  |
