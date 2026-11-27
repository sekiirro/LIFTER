# Tasks: PO comprehensive client export

**Prerequisites**: spec, plan, research, data model, contracts. All tasks are unchecked; no implementation evidence exists in this docs-only lane.

## Phase 1: Security RED

- [ ] T001 [FR-002,FR-004,FR-007] RED API/RPC tests deny WO/Trainer/Sales/Client/anonymous and revoked PO; include direct endpoints, counts, scope mutation and guessed IDs before implementation.
- [ ] T002 [FR-002,FR-007] RED storage/artifact tests deny foreign actor, foreign workspace, expired and replayed identifiers; test direct reads/RLS.
- [ ] T003 [FR-005] RED audit/log tests assert no client/health values, exported rows, secrets, URLs or raw provider errors.

## Phase 2: Manifest and bounded reader

- [ ] T004 [FR-003,FR-004] Resolve MCQ 030-01 and record exact fields/format/scope/lifetime before schema or package implementation.
- [ ] T005 [US1] [FR-003,FR-004,FR-006] Add RED synthetic manifest completeness, omission, workspace scoping, ordering and duplicate-row tests.

## Phase 3: Audit and package lifecycle

- [ ] T006 [US2] [FR-006,FR-007] RED idempotent request/replay, consistent snapshot, safe failure, artifact ownership/retrieval/expiry tests matching approved package.
- [ ] T007 [US1,US2] [FR-002,FR-003,FR-004,FR-006] Extend existing report source readers with an export-specific PO guard, manifest allow-list and bounded export generation; preserve existing WO reporting and add no duplicate dataset store.
- [ ] T008 [US2] [FR-005,FR-006,FR-007] Implement selected artifact lifecycle and audit via existing storage/job facilities only if selected; preserve current authorization on every retrieval, and preserve plan PDF/Excel behavior.
- [ ] T009 [US1,US2] [FR-001,FR-008,FR-009] Extend existing report surface and add empty/loading/error/download, locale, keyboard/mobile and per-screen copy acceptance. Include AR-RTL/EN-LTR rendered evidence for light/dark, mobile/desktop and relevant states.

## Phase 4: Acceptance

- [ ] T010 [US1,US2] [FR-001..009] Run all acceptance, authorization/RLS, mutation and artifact lifecycle tests on exact implementation head; add executed evidence to traceability.

Dependencies: T001-T003 RED security tests precede implementation. T004 gates T005-T009. T005-T006 must fail before T007-T008 are implemented. T007-T008 precede T009-T010. The export-specific PO gate must preserve authorized WO access to existing reports. Record exact source/test paths in implementation tasks before execution; copy remains proposed until per-screen PO approval.
