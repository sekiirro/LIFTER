# Tasks: PO comprehensive client export

**Prerequisites**: spec, plan, research, data model, contracts. All tasks are unchecked; no implementation evidence exists in this docs-only lane.

## Phase 1: Security RED

- [ ] T001 [FR-002,FR-004,FR-007] RED API/RPC tests deny WO/Trainer/Sales/Client/anonymous and revoked PO; include direct endpoints, counts, scope mutation and guessed IDs before implementation.
- [ ] T002 [FR-002,FR-007] RED storage/artifact tests deny foreign actor, foreign workspace, expired and replayed identifiers; test direct reads/RLS.
- [ ] T003 [FR-005] RED audit/log tests assert request, generation and every artifact retrieval have actor/scope/outcome evidence; retrieval audit failures release no bytes; no client/health values, exported rows, secrets, URLs or raw provider errors are logged.

## Phase 2: Manifest and bounded reader

- [ ] T004 [FR-003,FR-004,FR-006,FR-007] Record S71-PO-6 asynchronous UTF-8 CSV file, workspace/all-workspaces scope, spec 006 job/outbox reuse, and short-lived authenticated download. Present the versioned field manifest and expiry duration as PROPOSED per-screen PO approval items before implementation.
- [ ] T005 [US1] [FR-003,FR-004,FR-006,FR-010] Add RED synthetic manifest completeness, omission, workspace scoping, ordering, duplicate-row, RFC 4180 quoting, newline/delimiter handling and formula-injection tests.

## Phase 3: Audit and package lifecycle

- [ ] T006 [US2] [FR-006,FR-007] RED idempotent spec 006 job/outbox request/replay, consistent snapshot, safe failure, artifact ownership/retrieval/approved-expiry tests.
- [ ] T007 [US1,US2] [FR-002,FR-003,FR-004,FR-006,FR-010] Implement the new export-specific source reader/request path with a PO-only guard, PO-approved manifest allow-list, RFC 4180 CSV serialization, formula-injection neutralization by manifest field type, and keyset pages of at most 500 rows; preserve existing WO reporting and add no duplicate dataset store.
- [ ] T008 [US1,US2] [FR-005,FR-007] Add migration for the export audit event allow-list/definer path and private export-artifacts bucket policies; direct storage access is denied, and retrieval audit failure fails closed. Add foreign actor/workspace negative tests and executed mutation evidence.
- [ ] T009 [US2] [FR-005,FR-006,FR-007] Implement generation through an added handler in the existing spec 006 jobs/outbox registry; adapt authorization/audit/spreadsheet-safety patterns from the audited export paths, use the private bucket, audit every authenticated current-PO download, and preserve plan PDF/Excel behavior.
- [ ] T010 [US1,US2] [FR-001,FR-008,FR-009] Extend the existing report surface and add empty/loading/error/download, locale, keyboard/mobile and per-screen copy acceptance. Include AR-RTL/EN-LTR rendered evidence for light/dark, mobile/desktop and relevant states.

## Phase 4: Acceptance

- [ ] T011 [US1,US2] [FR-001..010] Run all acceptance, authorization/RLS, mutation, CSV-injection and artifact lifecycle tests on exact implementation head; add executed evidence to traceability.

Dependencies: T001-T003 RED security tests precede implementation. S71-PO-6 fixes archive format, scope options and download requirements. T004 documents the proposed field manifest and expiry-duration approval items; neither is enabled until per-screen PO approval. T005-T006 must fail before T007-T009 are implemented. T007-T008 precede T009-T011. The export-specific PO gate must preserve authorized WO access to existing reports. Record exact source/test paths in implementation tasks before execution; copy/manifest remain PROPOSED until per-screen PO approval.
