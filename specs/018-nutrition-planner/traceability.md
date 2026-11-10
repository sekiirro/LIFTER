# F18 traceability

**Date**: 2026-11-10 (S44-PO-7 spec-only update). **Base**: `origin/main` `d0c5d1ac7ec8adb13ad12712f85cf9702a97a414`. **Branch**: `speckit-018-nutrition-planner-s42`.

**Scope**: specification artefacts only. **No test was executed; no implementation exists on this branch.** Statuses below are specification statuses, not verification claims.

Status legend: `SPECIFIED` = requirement and design are complete and internally consistent; `SPECIFIED (resolved by S43-PO-5; architect mapping (S43-R6))` = approved prompt body is byte-exact in the local contract; `BLOCKED-MCQ` = dependent behavior awaits the listed PO decision; `EXCLUDED` = deliberately out of scope; `DELEGATED` = owned by another feature and referenced only.

## 1. Requirement → authority → task

| Requirement | Authority (type)                                                  | Task(s)                            | Contract/design                        | Status                                                                                                  |
| ----------- | ----------------------------------------------------------------- | ---------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| F18-FR-001  | S42-PO-2 + S42-PO-4 MCQ-12 + F19 pending (DIRECT/DELEGATED)       | T009, T026                         | plan §1, data-model §1                 | SPECIFIED                                                                                               |
| F18-FR-002  | D18-2=A, D18-6, retained F18 FR-002 (DIRECT); S44-PO-7            | T001, T007, T022, T025             | nutrition-document.md sections 1-2     | SPECIFIED; all meals visible on every day, with no day-type filtering                                   |
| F18-FR-003  | D18-4=C, S27-PO-2, S43-PO-1 MCQ-4, F16 scales (DIRECT + evidence) | T002, T008, T022                   | data-model section 2                   | SPECIFIED (exact persistence; every meal included in day totals; half-up once at display; S43-R9 Sol-1) |
| F18-FR-004  | PRD-05 acceptance, F16 FR-005 (DIRECT)                            | T001, T002, T008, T022             | `nutrition-document.md` §2.5           | SPECIFIED                                                                                               |
| F18-FR-005  | F16 FR-020, retained F18 FR-005 (DIRECT)                          | T003, T009, T022                   | data-model §1-2, contract §4           | SPECIFIED                                                                                               |
| F18-FR-006  | PRD-05, S20-11/S20-13, PRD-12 (DIRECT)                            | T001, T005, T023, T025             | `nutrition-document.md` §1             | SPECIFIED                                                                                               |
| F18-FR-007  | S20-17/D18-1, A2, A5 Q1=A (DIRECT)                                | T012, T013, T015                   | `template-assignment.md` §1, §3        | SPECIFIED                                                                                               |
| F18-FR-008  | A5 Q1=A + A2 (DIRECT)                                             | T006, T014                         | `template-assignment.md` §2            | SPECIFIED (skip/report all held versions)                                                               |
| F18-FR-009  | S20-17, F19-FR-008, A2 (DIRECT)                                   | T006, T012, T013                   | `template-assignment.md` §1            | SPECIFIED                                                                                               |
| F18-FR-010  | PRD-05, A6, F19-FR-003 (DIRECT/DELEGATED)                         | T026                               | plan §1                                | SPECIFIED                                                                                               |
| F18-FR-011  | A5 Q2=A, S20-19, S42-PO-3 Q9 (DIRECT)                             | T004, T010                         | `nutrition-api.md` §4, data-model §3   | SPECIFIED                                                                                               |
| F18-FR-012  | A5 Q2=A, D18-9=A (DIRECT)                                         | T004, T011                         | data-model §2-3                        | SPECIFIED                                                                                               |
| F18-FR-013  | A5 Q2=A, PRD-05 (DIRECT)                                          | T004, T010, T023                   | plan §5, contract §6                   | SPECIFIED (selected primary; per-item coach note; S43-PO-2 for prompt note and totals representation)   |
| F18-FR-014  | PRD-05, D18-6, S20-16 pattern (DIRECT)                            | T005, T023                         | contract §6                            | Current-revision export specified; historical-revision export specified by S43-PO-8                     |
| F18-FR-015  | A5 Q3=A (DIRECT)                                                  | T005, T024                         | contract §6, plan §7                   | SPECIFIED prompt body resolved by S43-PO-5                                                              |
| F18-FR-016  | Constitution VII, retained F18 FR-010a (DIRECT)                   | T010, T016                         | contract §4, §7                        | SPECIFIED                                                                                               |
| F18-FR-017  | Constitution I/III, F16 FR-012/033 (DIRECT)                       | T018                               | data-model §6, contract §2             | SPECIFIED                                                                                               |
| F18-FR-018  | PRD-06:188, retained F18 FR-010b (DIRECT/OPEN-TECH)               | T017                               | data-model §1 note, conflicts C-11     | SPECIFIED (ownership to reconcile with F19)                                                             |
| F18-FR-019  | Constitution IX, F16 FR-016, F19-FR-010 (DIRECT)                  | T003, T009, T010, T013, T014, T019 | contract §3, template-assignment.md §4 | SPECIFIED                                                                                               |
| F18-FR-020  | Constitution V, retained F18 FR-013 (DIRECT)                      | T020, T027                         | data-model §1, §8                      | SPECIFIED                                                                                               |
| F18-FR-021  | Constitution VIII, retained F18 FR-012 (DIRECT)                   | T001, T025                         | plan §9                                | SPECIFIED (copy gate before UI)                                                                         |
| F18-FR-022  | PRD-12, S20-21 (DIRECT)                                           | none                               | spec Out of scope                      | EXCLUDED                                                                                                |
| F18-FR-023  | S44-PO-7; architect mapping (S44-R7)                              | T001, T005, T025                   | nutrition-document.md §1; US1 GWT 8    | SPECIFIED (separate, independently editable Meal Notes and Food Notes)                                  |

## 2. Success criteria → task

| Criterion  | Task(s)                | Evidence expected                                             | Status                                                              |
| ---------- | ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| F18-SC-001 | T002, T008, T022, T027 | identical TS/SQL golden run (500 cases)                       | SPECIFIED                                                           |
| F18-SC-002 | T018, T019, T027       | full negative/concurrency matrix                              | SPECIFIED                                                           |
| F18-SC-003 | T026                   | multi-plan projection fixture                                 | SPECIFIED                                                           |
| F18-SC-004 | T001, T008, T027       | invalid-unit matrix                                           | SPECIFIED                                                           |
| F18-SC-005 | T005, T023, T024       | Current and historical AR/EN export goldens + prompt fidelity | Current revision specified; historical export specified by S43-PO-8 |
| F18-SC-006 | T021                   | recorded envelope + benchmark report                          | SPECIFIED                                                           |
| F18-SC-007 | T006, T014             | assignment state-machine fixtures                             | SPECIFIED (skip/report all held versions)                           |
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
| S44-MCQ-F18-1 (closed by S44-PO-7) | F18-FR-002; T001: all meals visible and counted on every day; no day-type meal blocker                                |
