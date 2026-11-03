# F6 Traceability ? static source review

Analyzed source commit: `ed88574ae09c722b1f6ded4fc0b66122bbeb4f13`. Tests and source were inspected statically; no tests or CI jobs were run by this review. VERIFIED means a concrete asserting test exists on this commit.

| Requirement | Task(s) | Test(s) (file::test name) | Evidence | Status | Gap |
|---|---|---|---|---|---|
| FR-001 | T001,T005,T008 | `tests/integration/jobs.test.ts::rejects oversized/non-object payloads, invalid kinds and invalid error codes`; `tests/integration/rls-catalog.test.ts::forces RLS and grants service_role SELECT only` | `supabase/migrations/20261027160000_jobs.sql`, commit `ed88574` | PARTIAL | Tests cover payload constraints and access grants, but not every required column/default/index as an asserting schema test. |
| FR-002 | T001,T005,T008 | `tests/integration/jobs.test.ts::(a) enqueues idempotently, including ten separate concurrent connections` | Migration and integration source; commit `ed88574` | VERIFIED | ? |
| FR-003 | T001,T005,T008 | `tests/integration/jobs.test.ts::(b) two service-role clients claim disjoint sets covering twenty due jobs`; `tests/integration/jobs.test.ts::(e,f) reclaims an expired lease, ignores stale reports, and completes the current lease` | Migration and integration source; commit `ed88574` | VERIFIED | ? |
| FR-004 | T001,T005,T008 | `tests/integration/jobs.test.ts::(c) failure records a code and retries after one minute using database time`; `tests/integration/jobs.test.ts::dead-letters an expired lease at max attempts exactly once instead of reclaiming it` | Migration and integration source; commit `ed88574` | VERIFIED | ? |
| FR-005 | T002,T005,T008 | `tests/integration/jobs.test.ts::(d) dead-letters at max attempts exactly once, with scoped allow-listed audit details` | `supabase/migrations/20261027160100_audit_jobs.sql`; commit `ed88574` | VERIFIED | ? |
| FR-006 | T001,T005,T006,T008 | `tests/integration/jobs.test.ts::(h) anon, PO and trainers cannot access either workspace jobs or execute RPCs`; `tests/integration/rls-catalog.test.ts::forces RLS and grants service_role SELECT only` | Migration and catalog integration source; commit `ed88574` | VERIFIED | ? |
| FR-007 | T003,T004,T007,T008 | `tests/unit/cron-drain.test.ts::dispatches each job once with explicit workspace and completes its lease`; `tests/unit/cron-drain.test.ts::POSTs scoped RPC arguments using runtime secrets`; `tests/unit/cron-drain.test.ts::configures the existing cron Worker for a one-minute tick` | `workers/cron/src/*`, `workers/cron/wrangler.jsonc`; commit `ed88574` | VERIFIED | ? |
| FR-008 | T003,T007,T008 | NOT-FOUND: no test assertion that CI runs `build:cron` with dry-run and does not deploy | `.github/workflows/ci.yml` and `package.json` statically inspected; commit `ed88574` | PARTIAL | Workflow/build configuration exists; no test asserts this CI gate. |
| SC-001 | T005,T008 | `tests/integration/jobs.test.ts::(a) enqueues idempotently, including ten separate concurrent connections` | Integration source; commit `ed88574` | VERIFIED | ? |
| SC-002 | T005,T008 | `tests/integration/jobs.test.ts::(b) two service-role clients claim disjoint sets covering twenty due jobs` | Integration source; commit `ed88574` | VERIFIED | ? |
| SC-003 | T002,T005,T008 | `tests/integration/jobs.test.ts::(d) dead-letters at max attempts exactly once, with scoped allow-listed audit details` | Audit migration and integration source; commit `ed88574` | VERIFIED | ? |
| SC-004 | T005,T006,T008 | `tests/integration/jobs.test.ts::(h) anon, PO and trainers cannot access either workspace jobs or execute RPCs`; `tests/integration/rls-catalog.test.ts::forces RLS and grants service_role SELECT only` | Integration/catalog source; commit `ed88574` | VERIFIED | ? |

## Static verification notes

- Test paths and exact names above were checked in the `ed88574` source tree; no suite was run.
- No deferred status is used because the plan's future alerting scope is not an FR/SC requirement of this feature.
