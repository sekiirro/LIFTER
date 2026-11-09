# Data Model: P0-F4

One forward migration, `supabase/migrations/20261028120000_auth_recovery_links.sql`. Committed migrations are never edited. Functions that change are redefined with `create or replace`, starting from their **latest** definition: `audit_row_change` was last redefined in `20261027160100_audit_jobs.sql`.

## Capability `generate_recovery_link`

- `app_private.role_has_capability`: approved future branch for `cap = 'generate_recovery_link'` includes `platform_owner`, `workspace_owner`, and all workspace `trainer` roles (S31-PO-2); Sales is denied. The existing implementation is not changed in this documentation lane; a new spec cycle, RLS, tests, and security review are required.
- `lib/auth/capabilities.ts`: add to `CAPABILITIES`. The PO gets all capabilities. Add it to the `workspace_owner` list; when the approved Trainer scope is implemented in its own spec cycle, add it to the `trainer` list and the SQL wall in the same change. `tests/integration/matrix-parity.test.ts` must keep both walls equal.

## `public.recovery_link_issuances` (append-only)

| Column | Type | Rule |
|---|---|---|
| id | uuid PK default `gen_random_uuid()` | |
| workspace_id | uuid not null → `workspaces(id)` | the target's workspace |
| target_user_id | uuid not null → `auth.users(id)` on delete restrict | never a staff profile, never the actor |
| issued_by | uuid not null → `staff_profiles(user_id)` | = `auth.uid()` |
| issued_at | timestamptz not null default now() | |

- `unique (workspace_id, id)`. Indexes `(issued_by, issued_at desc)` and `(target_user_id, issued_at desc)`.
- No secret, email or link is stored.
- RLS enabled and forced. `revoke all` from public, anon, authenticated and service_role. No policies, so it's unreadable through the API. Rows are inserted only by `recovery_link_record`, which is SECURITY DEFINER and owned by postgres.
- Immutability: BEFORE UPDATE OR DELETE raises (reuse `app_private.forbid_delete()` for delete and truncate, plus an update guard like `audit_events_immutable`).

## Audit mapping

`app_private.audit_row_change()` gets a new branch: `recovery_link_issuances` INSERT → action `recovery_link.generated`, `target_table = 'recovery_link_issuances'`, `target_id = new.id`, `workspace_id = new.workspace_id`, details `{ "target_user_id": new.target_user_id }`. Any other operation returns without an event. Trigger: AFTER INSERT.

## Functions

| Function | Kind | Behavior |
|---|---|---|
| `app_private.recovery_target_workspace(target uuid) → uuid` | stable, SECURITY DEFINER | F4: `select null::uuid`. P1 replaces it with the client-account lookup (ND-F4-5). |
| `app_private.recovery_link_limits() → table(per_actor int, per_target int, win interval)` | immutable | Existing 20 / 3 / 1-hour values are not compliant with S31-PO-3. Approved future values: 10 per issuer per rolling hour and 3 per client per rolling 24 hours across issuers. No code changed; future implementation and configuration verification remain open. |
| `app_private.recovery_link_guard(target uuid) → uuid` | SECURITY DEFINER | Raises `42501 'not_permitted'` if `auth.uid()` is null, the workspace is null, `not has_workspace_access(ws,'generate_recovery_link')`, `target = auth.uid()`, or the target has a `staff_profiles` row. Raises `P0001 'rate_limited'` if the issuance counts in the window are ≥ the limits. Returns the workspace. |
| `public.recovery_link_authorize(target uuid) → uuid` | SECURITY DEFINER, granted to authenticated only | `return app_private.recovery_link_guard(target)`. |
| `public.recovery_link_record(target uuid) → uuid` | SECURITY DEFINER, granted to authenticated only | `pg_advisory_xact_lock` on the target and the actor (`hashtextextended`), then the guard, then the insert. Returns the issuance id. |

Every function has `set search_path = ''`, owner postgres, and execute revoked from public and anon. The denial message is identical for "no such target", "foreign workspace" and "no capability".

## State: recovery link (provider-managed)

`issued` →(verify within expiry, first use)→ `consumed` (session created) → password set.
`issued` →(newer link for the same account)→ `superseded`. `issued` →(expiry)→ `expired`. Consumed, superseded and expired links all fail verification.


## Staff self-service recovery (FR-016 to FR-030; future local-only implementation)

This section specifies future F4 state; it creates no migration in this spec-only change.

- The future app_private.staff_password_reset_intents relation holds an intent id, auth user id, initiating session id, state (open, completed, aborted, reconciled), start and recovery verification times, nullable password-changed time, and close time. One open intent is allowed per staff account; the intent is bound to the initiating user and recovery session, not only the account. A repeated `begin` from that same verified session returns the existing fresh intent without inserting a row or duplicate `completion_started` event; a different session cannot reuse it.
- Update immutability applies to identity and origin fields (`intent_id`, `auth_user_id`, `session_id`, `started_at`, `recovery_verified_at`): once inserted these values cannot change. A guarded update validator allows only `open -> completed` when `password_changed_at` is set, `open -> aborted` when it is null, and `open -> reconciled` by reconciliation after the 900-second age threshold while preserving whether a password changed. A closing transition sets `closed_at` once; a non-null `password_changed_at` can only be set once while open. Closed rows are immutable. The no-delete guard is separate and continues to reject every DELETE/TRUNCATE.
- public.staff_password_reset_begin(), _complete(intent_id), and _abort(intent_id) are authenticated RPCs. Each verifies auth.uid() and the verified JWT session_id match the intent owner and initiating session. begin requires recovery authentication (amr evidence) no older than 900 seconds. Completion and abort are one-way transitions, with exactly one closing audit event or later reconciliation.
- The auth.users password guard validates trusted request context against the intent initiating session id, allows at most one password change atomically, and refuses an account-level intent used by another session. If the pinned local Auth stack cannot expose trustworthy context to the guard, the migration is blocked pending a technical design; no account-scope exception is accepted.
- After a known-successful password change, the recovery session ends and the user goes to normal login. All other pre-existing account sessions are revoked per FR-025(b), control C and PDN-F4-7-07. Closing-audit failure still produces success-then-login and mandatory reconciliation.
- The local send hook is the authoritative counter/audit/delivery boundary for both app and direct /recover requests. It enforces five requests per account and ten globally per rolling hour, plus the local test delivery permission and two-email-per-hour cap. The app does not separately consume counters. Unknown-address request accounting and no-SMTP-fallback are proven by G6 before implementation.
- The hook authenticates invocations, validates payload shape and action type, checks identity/destination, prevents duplicate side effects, protects runtime secrets and never logs token-bearing payloads. Hosted Auth, SMTP, Resend and the hosted sender remain deferred under FR-020/S38-PO-3.
