# F5 Traceability ? static source review

Analyzed source commit: `ed88574ae09c722b1f6ded4fc0b66122bbeb4f13`. Tests were checked statically; no suite was run. VERIFIED means an asserting test exists on this commit.

| Requirement | Task(s) | Test(s) (file::test name) | Evidence | Status | Gap |
|---|---|---|---|---|---|
| FR-001 | T001,T005,T007 | `tests/integration/rls-catalog.test.ts::forces RLS and grants only authenticated SELECT`; `tests/integration/audit.test.ts::audits every PO governance change exactly once, with allow-listed details` | Migration `20261027150000_audit_log.sql`; commit `ed88574` | PARTIAL | Store and policy behavior are asserted, but the full required column/check inventory has no dedicated schema assertion. |
| FR-002 | T001,T003,T005,T007 | `tests/integration/audit.test.ts::'%s cannot UPDATE, DELETE or TRUNCATE audit history' (it.each postgres/service_role/authenticated/anon)` | Migration and audit integration source; commit `ed88574` | VERIFIED | ? |
| FR-003 | T001,T002,T007 | `tests/integration/audit.test.ts::audits every PO governance change exactly once, with allow-listed details`; `tests/integration/audit.test.ts::emits nothing for rejected writes or a rolled-back source transaction` | Migration and audit integration source; commit `ed88574` | VERIFIED | ? |
| FR-004 | T001,T002,T007 | `tests/integration/audit.test.ts::audits every PO governance change exactly once, with allow-listed details` | Allow-listed trigger details; commit `ed88574` | PARTIAL | Assertions exclude `@` and fixture emails; no complete phone/person-name value assertion for SC-004. |
| FR-005 | T001,T004,T007 | `tests/integration/audit.test.ts::PO sees A, B and platform events; WO sees only active own-workspace events` | RLS select policy and audit integration source; commit `ed88574` | VERIFIED | ? |
| FR-006 | T005,T006,T007 | NOT-FOUND: no asserting test found for the reusable attach-helper documentation/test pattern | `README.md` ?Auditing new tables?; migration source; commit `ed88574` | PARTIAL | Documentation exists; no test asserts the example/pattern for a future tenant table. |
| FR-007 | T001-T005,T007 | `tests/integration/audit.test.ts::'%s cannot UPDATE, DELETE or TRUNCATE audit history' (it.each postgres/service_role/authenticated/anon)`; `tests/integration/audit.test.ts::'%s cannot insert, update or delete through the API' (it.each po/woA/trainerA)` | Audit integration source; commit `ed88574` | VERIFIED | Tests include foreign visibility and direct mutation-denial cases. |
| SC-001 | T002,T007 | `tests/integration/audit.test.ts::audits every PO governance change exactly once, with allow-listed details`; `tests/integration/audit.test.ts::emits nothing for rejected writes or a rolled-back source transaction` | Commit `ed88574` | VERIFIED | ? |
| SC-002 | T003,T005,T007 | `tests/integration/audit.test.ts::'%s cannot UPDATE, DELETE or TRUNCATE audit history' (it.each postgres/service_role/authenticated/anon)` | Commit `ed88574` | VERIFIED | ? |
| SC-003 | T004,T007 | `tests/integration/audit.test.ts::PO sees A, B and platform events; WO sees only active own-workspace events` | Commit `ed88574` | VERIFIED | ? |
| SC-004 | T002,T007 | `tests/integration/audit.test.ts::audits every PO governance change exactly once, with allow-listed details` | Commit `ed88574` | PARTIAL | Fixture emails and `@` are checked; phone/person-name classes are not asserted. |

## Static verification notes

- All named test files and titles above were checked in the analyzed source tree; test execution is not claimed.
- Plan ND-F5-1/2 remain PO-owned questions. Neither is marked DEFERRED because no cited PO record explicitly resolves the future behavior.

## S33 traceability — S33-PO-4

| FR | Task | Test | Evidence |
|---|---|---|---|
| FR-005, FR-007 | T009 | `tests/integration/audit.test.ts::PO sees A, B and platform events; WO sees only active own-workspace events` | Commit `368ff0a`; focused integration run on current head: 5 files / 41 tests passed. |


## S34 traceability — P37 close-out (FR-008)

| Requirement | Task(s) | Test(s) / Evidence | Status |
|---|---|---|---|
| FR-008 | T010, T011 (deferred) | `tests/integration/client-accounts-fixture.ts::pendingHttpAccess` (audit_events denial probes are client-side and filtered by wsB and `workspace_id is null`, each `.limit(5)`; no privileged ID sample); Stack C `client-accounts-catalog.test.ts`, `client-accounts-auth.test.ts`, `client-accounts-recovery.test.ts`: 3 files / 43 tests passed on the S35-R3 fix commit (this commit); deferred measurement task records method only | PARTIAL (rule recorded; future feature implements pagination) |
