# Data Model: P0-F4

One forward migration, `supabase/migrations/20261028120000_auth_recovery_links.sql`. Committed migrations are never edited. Functions that change are redefined with `create or replace`, starting from their **latest** definition: `audit_row_change` was last redefined in `20261027160100_audit_jobs.sql`.

## Capability `generate_recovery_link`

- `app_private.role_has_capability`: approved future branch for `cap = 'generate_recovery_link'` includes `platform_owner`, `workspace_owner`, and all workspace `trainer` roles (S31-PO-2); Sales is denied. The existing implementation is not changed in this documentation lane; a new spec cycle, RLS, tests, and security review are required.
- `lib/auth/capabilities.ts`: add to `CAPABILITIES`. The PO gets all capabilities. Add it to the `workspace_owner` list. `tests/integration/matrix-parity.test.ts` must keep both walls equal.

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
