# H5 purge scheduling (phase 1; PO 2026-10-29)

Written before implementation. No DB operations authorized. Constitution: preserve
isolation, privacy, audit and deletion guards; architect review and green CI precede
D-26 integration. Activation deferred to Pre-Production.

| State / existing function                                        | Retention and current invocation                                                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attempts: `app_private.purge_client_signup_attempts()`           | Deletes strictly older than 30 days, from `signup_retention_policy()`; private/manual and integration fixtures only; no scheduler found.                  |
| Counters / nonces: same purge; `public.client_signup_admit(...)` | Counters expire at `<= sampled_at`; nonces at `< sampled_at`. Admission also cleans inline (latest body `20261031123700`).                                |
| `signup_attempt_purge_proof()` / `signup_guard_attempt_delete()` | Purge-only signed transaction capability and age guard; invoked by purge/delete trigger. No independent schedule.                                         |
| Admission tickets / operation receipts / identifier claims       | Preserved; delete/truncate guards in `20261031121000`; no cleanup function or approved timed retention. Not a proven deletion gap.                        |
| Audit / registration links / client snapshots                    | Preserved; no F11 timed purge. Audit retention remains ND-F5-1/B4 unresolved. Purge appends `client.signup_cleanup`, run UUID and count only (ND-F11-10). |

Migration `20261031130000_purge_scheduling_pg_cron.sql` is after `20261031125000`
and has no filename/version collision at branch base `ac50a64`. Use
`create extension if not exists pg_cron with schema pg_catalog`: [Supabase installation](https://supabase.com/docs/guides/cron/install),
[Supabase postgres grants](https://github.com/supabase/postgres/blob/develop/migrations/schema-15.sql)
and [upstream control](https://github.com/citusdata/pg_cron/blob/main/pg_cron.control)
support this placement; job objects live in `cron`, not `extensions`.
Repo evidence: CLI 2.122.0 / postgres 17.11. Actual image preload, extension
version/placement and execution remain phase-2 checks; hosted proof requires PO
approval. Source review establishes placement, not runtime compatibility.

Create zero jobs at migration time. Postgres-owned, private, SECURITY INVOKER
`purge_schedule_activate()` / `purge_schedule_deactivate()` use empty search paths,
explicit postgres caller checks, revoked PUBLIC/API EXECUTE and a shared advisory
transaction lock. Activation unschedules the stable name before scheduling
`lifter-f11-purge-signup` at `0 * * * *` with exactly
`select app_private.purge_client_signup_attempts();`. Runs as postgres; hourly cadence adds about an hour of lag when healthy, without
changing 30-day eligibility. No PII in command/results; preserve atomic cleanup
audit. Revoke PUBLIC/API cron schema/table access; preserve unrelated jobs.

Reject app/Edge/HTTP scheduling (PO chose pg_cron; unnecessary credentials/network),
auto-activation or inactive placeholder jobs (zero-jobs gate), SECURITY DEFINER
(no privilege elevation needed), and new ticket/audit deletion (unapproved policy).

Pre-Production checklist text: **[ ] After PO approval, green phase-2 evidence,
hosted pg_cron/preload/owner connectivity verification, Vault provisioning and
existing C4/B4/backup/restore gates, connect privately as postgres and run
`begin; select app_private.purge_schedule_activate(); commit;`. Verify exactly one
`lifter-f11-purge-signup` job, schedule `0 * * * *`, expected command, active=true,
username=postgres; observe a successful scheduled run and counts-only cleanup audit
without PII. Record PO approval and scrubbed evidence. To disable future runs:
`select app_private.purge_schedule_deactivate();` as postgres (an already-running
purge can finish). Activation remains deferred until this gate.**

Phase 2, unlocked Stack A: new tests plus existing catalog/audit/admission purge
regressions. Mutation plan:
scratch auto-activation must fail zero-jobs; change cadence/command/owner must fail
exact job assertions; remove revokes or use SECURITY DEFINER must fail catalogs;
omit unscheduling must fail replacement job-id assertion; modify purge age/audit
must fail pinned body checks and existing retention/audit tests. Restore mutations
before green reruns. No integration/e2e/mutation execution in phase 1.
