# Tasks: Outbox Jobs & Cron Drain Worker (P0-F6)

**Input**: [spec.md](spec.md), [plan.md](plan.md) (Design is binding). Never edit committed migrations. No new dependencies. No PII. Don't touch `LIFTER_Claude_Files/`, `DESIGN.md`, `docs/`, `.specify/` or `specs/` (except checking tasks off).

## Phase 1: Database

- [x] T001 `supabase/migrations/20261027160000_jobs.sql`: the jobs table, indexes, forced RLS, grants, `app_private.enqueue_job`, and `public.jobs_claim/jobs_complete/jobs_fail` per plan § Design. Add an `updated_at` trigger.
- [x] T002 `supabase/migrations/20261027160100_audit_jobs.sql`: `create or replace function app_private.audit_row_change()` keeping every existing branch byte-for-byte and adding the `jobs` branch (`job.dead_lettered` only when status becomes `dead`; otherwise `return new`). Add trigger `audit_jobs` AFTER UPDATE ON public.jobs. Re-assert owner and revokes.

## Phase 2: Worker

- [x] T003 [P] `workers/cron/src/{drain,rpc,handlers,index}.ts` + `workers/cron/wrangler.jsonc` per plan. Make sure the root `tsconfig.json`, ESLint and Prettier cover `workers/**`. Add Workers types only through existing deps; if `@cloudflare/workers-types` isn't installed, declare minimal local types for `ScheduledController`/`ExecutionContext` in `workers/cron/src/types.ts` (no new dependency). Add the `build:cron` script and a CI step `npm run build:cron` after `build:edge` in the validate job.
- [x] T004 [P] `tests/unit/cron-drain.test.ts`: fake rpc. Cases: all succeed → each completed once; a throwing handler → `jobs_fail(handler_error, permanent=false)` and the others continue; `JobError('x_y', {permanent:true})` → fail permanent with code `x_y`; unknown kind → `unknown_kind` permanent; the budget is exceeded after the first batch → no second claim; an empty claim stops the loop; error codes never include handler error messages.

## Phase 3: Integration tests

- [x] T005 `tests/integration/jobs.test.ts` using `sql()` (as postgres, calling `app_private.enqueue_job`) and service-role/anon/staff API clients:
  - (a) Idempotent enqueue: sequential twice → same id and count 1; 10 parallel enqueues of a single key over separate connections → 1 row.
  - (b) Concurrent claims: 20 due jobs, two parallel `rpc('jobs_claim', {batch: 10})` calls via two service-role clients → disjoint, union 20.
  - (c) Fail with backoff: status pending, attempts 1, `run_at` roughly now + 1 min, last_error set.
  - (d) Dead after max attempts (`max_attempts` 2): status dead, never claimed again, exactly 1 `job.dead_lettered` audit event with the right workspace/details.
  - (e) Lease expiry: claim with `lease_seconds` 1, wait ~1.5 s (poll), reclaim succeeds with a new token, and complete with the old token returns false.
  - (f) Complete with the right token → done.
  - (g) Future `run_at` isn't claimed.
  - (h) anon and PO/trainer API clients: `from('jobs')` select/insert/update fail or return nothing; `rpc('jobs_claim')` etc. are denied.
  - (i) Payload > 4 KB and an invalid kind or error code are rejected.
  Clean up by using unique kinds/keys per test, and filter claims by asserting only on this test's ids. Note: claims can pick up other tests' due jobs, so give each test its own `kind` and complete/fail only its own jobs; tolerate foreign rows. Use `fileParallelism: false` as already configured.
- [x] T006 Extend `tests/integration/rls-catalog.test.ts`: jobs has forced RLS; anon/authenticated have no table privileges; `service_role` has SELECT only; the RPCs are executable by service_role and not by anon/authenticated; `enqueue_job` is not executable by any API role.

## Phase 4: Docs and review

- [x] T007 README "Background jobs": enqueue from SQL, the deterministic key convention `<kind>:<workspace>:<entity>:<period>`, the no-PII payload rule, adding a handler, `build:cron`, and the deploy-time secret (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` via `wrangler secret`, PO approval required).
- [x] T008 (Claude) Local Docker integration run, a negative check (remove `skip locked` in a temp migration → (b) must fail, or the lease guard → (e) must fail), and green CI.
