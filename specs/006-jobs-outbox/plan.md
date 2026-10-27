# Implementation Plan: Outbox Jobs & Cron Drain Worker (P0-F6)

**Branch**: `006-jobs-outbox` (stacked on `005-audit-log`) | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

## Summary

This feature adds:

- **One forward migration:**
  - a `public.jobs` table with forced RLS and no API grants
  - `app_private.enqueue_job()`, for SQL feature code only
  - three service-role-only RPCs in `public`: `jobs_claim`, `jobs_complete` and `jobs_fail`
  - dead-letter auditing into `audit_events`, extending `audit_row_change` in a new `create or replace` migration
- **A new Cloudflare Worker** in `workers/cron/` (a separate wrangler config, cron `* * * * *`) with a pure, unit-tested `drain()` loop and a handler registry.

The integration tests extend the F3 harness.

## Technical Context

TypeScript strict. No new runtime dependencies: the Worker calls PostgREST RPC with `fetch` and doesn't use supabase-js, which keeps the bundle tiny. Wrangler 4.153 is already a devDep. Vitest unit + integration.

## Design

- `jobs`: `id uuid pk default gen_random_uuid()`, `kind text CHECK ^[a-z_]+\.[a-z_]+$`, `workspace_id uuid null REFERENCES workspaces(id)`, `payload jsonb not null default '{}' CHECK object AND pg_column_size(payload) <= 4096`, `idempotency_key text not null UNIQUE CHECK length 1..200`, `status text CHECK in (pending, running, done, dead) default pending`, `run_at timestamptz default now()`, `attempts int default 0`, `max_attempts int default 5 CHECK 1..20`, `lease_token uuid null`, `lease_expires_at timestamptz null`, `last_error text null CHECK ^[a-z0-9_.:-]{1,64}$`, `created_at`, `updated_at`, `finished_at`. Indexes: `(status, run_at)` partial on pending; `(lease_expires_at)` partial on running.
- `app_private.enqueue_job(kind, workspace_id, payload, idempotency_key, run_at default now(), max_attempts default 5) returns uuid`. `insert … on conflict (idempotency_key) do nothing returning id`; if there's no row, select the existing id. SECURITY DEFINER. Execute revoked from every API role and service_role (SQL-only).
- `public.jobs_claim(batch int default 25, lease_seconds int default 300) returns setof jobs`. Pick ids `where (status='pending' and run_at <= now()) or (status='running' and lease_expires_at < now()) order by run_at limit least(batch,100) for update skip locked`; update status=running, attempts+1, lease_token=gen_random_uuid(), lease_expires_at=now()+lease. Return rows.
- `public.jobs_complete(id uuid, lease uuid) returns boolean`: `update … set status='done', finished_at=now(), lease_token=null where id=$1 and lease_token=$2 and status='running'`.
- `public.jobs_fail(id uuid, lease uuid, error_code text, permanent boolean default false) returns text`. Guarded by lease. If `permanent or attempts >= max_attempts` → dead (finished_at, last_error); else → pending with `run_at = now() + least(power(2, attempts-1), 60) * interval '1 minute'`. Returns the new status.
- Audit: a new migration replaces `app_private.audit_row_change()` with a `jobs` mapping: UPDATE where status changes to `dead` → `job.dead_lettered`, details `{kind, error: last_error, attempts}`, workspace_id = job.workspace_id. No other job transitions are audited (noise). The job row itself is the job's lifecycle record. Trigger `audit_jobs` AFTER UPDATE.
- Grants: revoke all on jobs from public, anon, authenticated, service_role, then grant SELECT to service_role (ops visibility). The three RPCs are SECURITY DEFINER with `search_path=''` and `revoke execute from public, anon, authenticated` and `grant execute to service_role`.
- Worker `workers/cron/`:
  - `src/index.ts`: `scheduled(event, env, ctx)` → `ctx.waitUntil(drain(...))`.
  - `src/drain.ts`: `drain({ rpc, handlers, now, budgetMs, batch })`. It loops claim → for each job run its handler with `{ jobId, kind, workspaceId, payload }` → complete or fail. Error codes: the handler throws `JobError(code, {permanent})`, any other error → `handler_error`, and an unknown kind → `unknown_kind` permanent. It stops when a claim returns empty or the budget is exceeded.
  - `src/rpc.ts`: a fetch wrapper to `${SUPABASE_URL}/rest/v1/rpc/<fn>` with the service key from `env`.
  - `src/handlers.ts`: registry `{ 'system.noop': async () => {} }`.
  - `wrangler.jsonc`: name `lifter-cron`, `triggers.crons ['* * * * *']`, no account_id, no vars containing secrets.
- Scripts: `build:cron` = `wrangler deploy --dry-run --config workers/cron/wrangler.jsonc --outdir .wrangler/cron-dist`. CI runs `npm run build:cron` in the validate job.

## Constitution Check

| Principle | Status |
|---|---|
| I Isolation | Jobs are inaccessible to API roles. Handlers get the explicit `workspace_id`. Negative tests. ✅ |
| VII Privacy | Payload is ids only (documented, size-capped). The error is a constrained code, never a message or PII. ✅ |
| IX Reliability | Unique idempotency key, skip-locked claims, lease tokens, backoff, dead-letter. ✅ |
| Platform | Separate cron Worker per Architecture. $0. No deploy. ✅ |

## NEEDS DECISION

None blocking. Defaults are technical (spec Assumptions). Dead-letter alerting to staff waits for the notifications feature.

## Structure

```text
supabase/migrations/20261027160000_jobs.sql
supabase/migrations/20261027160100_audit_jobs.sql
workers/cron/{wrangler.jsonc, src/index.ts, src/drain.ts, src/rpc.ts, src/handlers.ts, tsconfig.json?}
tests/unit/cron-drain.test.ts
tests/integration/jobs.test.ts  (+ rls-catalog additions)
```
