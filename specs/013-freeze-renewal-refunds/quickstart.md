# F13 implementation and verification quickstart

This document records the approved local Stack C readiness work and PO-1 supported API evidence. It is not authorization to use production data or infrastructure.

## PO-1 policy update

The binding update is quoted verbatim in spec.md and the PO-1 follow-up appears in research.md. The refund transaction atomically writes the client deactivation fact and one durable, idempotent Auth-lockout outbox row with the refund, audit and receipt. The synchronous Custom Access Token hook checks the committed fact before token issuance, so password sign-in and refresh are denied without waiting for the worker. App/DB access helpers also deny deactivated clients even when a valid JWT remains. The existing cron Worker runs every minute and drains at most 25 Auth-lockout jobs per tick. It applies the supported Auth Admin ban as defense in depth, retries with bounded exponential backoff, and records success. A separate per-tick sweep alerts after 3 consecutive failures or 5 minutes since deactivation, whichever comes first, even when the next Auth retry is not due. One durable alert and its audit row are committed atomically per lockout episode; current PO and active workspace-owner recipients are resolved at alert time. Alerts contain IDs, threshold reason, attempt count and an allow-listed safe error code only. A narrow current-role PO/WO reader is available. There is no staff-notification surface yet; rendering is deferred to the notifications feature. Existing JWTs may expire naturally. Do not write Auth-managed tables directly.

Supabase permits one `custom_access_token` hook per project. Any future claim customization must be composed into `custom_access_token_hook`; tests assert claims pass through unchanged for staff and active clients. A hook error (including malformed event data) fails token issuance closed. Hosted Supabase requires enabling the Custom Access Token hook in the dashboard. First enable and verify it on a non-production hosted project; production enablement is a production change requiring PO approval. Root `supabase/config.toml` and Stack C config carry the same local hook block; this config parity change does not operate Stack A.

## Stack C Auth API measurement

On 2026-10-30, using synthetic test users on project lifter-stack-c (API 35421):

- Auth Admin updateUserById with ban_duration 876000h returned HTTP 200.
- Fresh password sign-in after the ban returned HTTP 400, User is banned.
- Refresh with a pre-ban refresh token after the ban returned HTTP 400, Invalid Refresh Token: User Banned.
- The ban alone denied both fresh sign-in and refresh while active; no separate sign-out call is needed for those outcomes.
- With the Custom Access Token hook active and the worker returning `retry_scheduled`, fresh password sign-in and refresh returned HTTP 403 with message `account_unavailable`; neither response contained an access token. A rolled-back deactivation left sign-in available, and staff sign-in remained available.
- Controlled pre-hook pause (worker failed, then held for 1,000 ms): first request was 1,005.366 ms after commit; sign-in HTTP 200 and refresh HTTP 200 issued tokens. The id-based worker ban then returned HTTP 200 at 1,118.289 ms after commit; subsequent sign-in and refresh both returned HTTP 400.
- Hook enabled: first Auth request began 5.379 ms after commit in the final full integration run; sign-in and refresh both returned HTTP 403 with no token while worker status was `retry_scheduled`. There is no successful token issuance window after the committed fact is visible to the hook; the 5.379 ms is commit-to-probe latency, not an allowed window.
- Follow-up after the clean Stack C reset and migration rename: first Auth request began 4.411 ms after commit; sign-in and refresh both returned HTTP 403 with no token while worker status was `retry_scheduled`. Allowed issuance window remains 0 ms at the request boundary.
- The documented auth.admin.signOut call requires the user's JWT and has no user-id-only form ([Supabase reference](https://supabase.com/docs/reference/javascript/auth-admin-signout)). A global sign-out is not required by the updated PO-1 policy.
- Synthetic user cleanup via Auth Admin delete returned HTTP 500 after unban and global sign-out. No direct Auth-table cleanup was attempted.

**Commit-to-worker window:** with the hook active, Stack C denied sign-in and refresh at the first request after the deactivation/outbox commit while the worker was failing. The measured post-hook pre-worker issuance window is 0 ms at the request boundary; already-issued JWT expiry remains accepted by PO.

During the former pre-hook window, a client could call public GoTrue endpoints, including password sign-in and refresh, and receive a session (measured above). With the hook enabled, any flow requesting a new access JWT is denied for that deactivated client. Non-issuance endpoints remain callable: a client can request a password-reset email and can sign out/clear sessions; these do not grant authenticated access. Already-issued access JWTs can be presented until expiry, but app/RPC deactivation checks deny client data. Supabase documents reset-email initiation separately from token issuance ([resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)) and notes that access JWTs remain valid until expiry after sign-out ([signOut](https://supabase.com/docs/reference/javascript/auth-signout)). These remaining actions do not conflict with the updated PO direction: new authentication stays controlled, while existing JWT expiry is accepted.

## Stack and execution

Stack C is project lifter-stack-c, API 35421, DB 35422, full port block 35420-35429. The observed Docker container names used separate lifter, lifter-stack-b and lifter-stack-c projects. Stacks A/B were not targets. Never open or print `.env*`; use the stack-aware integration harness, which infers the selected stack from generic CI endpoints or validates an explicit stack before opening sockets. The F14 core merges before F13 because its migration timestamps sort earlier. After F14, F13 migration `20261103129200_f13_f14_capability_reconciliation.sql` is the final capability writer and preserves F14 `manage_branding` alongside F12/F13 grants. It does not replace F14's registration-link wrapper.

F12 U4 and latest F12/F14 migrations remain dependencies for full refund ledger implementation. T012-T015 own that ledger; the scheduled Auth-lockout drain and durable PO/WO alert runtime are implemented on Stack C, and T015 plus T017 acceptance is recorded in tasks.md. Alert rendering is deferred to the notifications feature. Retention across backups remains a production blocker.

**Migration timestamp exception (architect-authorized once):** the original proof migration was renamed with normal `git mv` from `20261031140000_refund_auth_lockout_hook.sql` to `20261103120000_refund_auth_lockout_hook.sql` so it sorts after the stated F12 migrations through `20261101124000` and F14 through `20261102130000`. This applies only to the unmerged F13 branch and its F13-owned Stack C; no history was rewritten.

## Gates

Run the unit suite, Stack C integration suite with LIFTER_SUPABASE_STACK=c and CI-shaped generic endpoints, typecheck, lint, build, build:edge, size, Prettier checks on changed files, and git diff --check. Record exact pass/fail/skip counts and final/pushed SHAs. Never use production credentials or Stacks A/B/D.
