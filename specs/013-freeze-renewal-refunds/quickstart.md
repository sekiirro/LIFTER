# F13 implementation and verification quickstart

This document records the approved local Stack C readiness work and PO-1 supported API evidence. It is not authorization to use production data or infrastructure.

## PO-1 policy update

The binding update is quoted verbatim in spec.md. The refund transaction atomically writes client deactivation and one durable, idempotent Auth-lockout outbox row with the refund, audit and receipt. App/DB access helpers deny deactivated clients even when a valid JWT remains. A server-only worker applies the supported Auth Admin ban, retries with bounded exponential backoff, records success and raises a safe PO/WO operational alert after persistent failure. Existing JWTs may expire naturally. Do not write Auth-managed tables directly.

## Stack C Auth API measurement

On 2026-10-30, using synthetic test users on project lifter-stack-c (API 35421):

- Auth Admin updateUserById with ban_duration 876000h returned HTTP 200.
- Fresh password sign-in after the ban returned HTTP 400, User is banned.
- Refresh with a pre-ban refresh token after the ban returned HTTP 400, Invalid Refresh Token: User Banned.
- The ban alone denied both fresh sign-in and refresh while active; no separate sign-out call is needed for those outcomes.
- The documented auth.admin.signOut call requires the user's JWT and has no user-id-only form ([Supabase reference](https://supabase.com/docs/reference/javascript/auth-admin-signout)). A global sign-out is not required by the updated PO-1 policy.
- Synthetic user cleanup via Auth Admin delete returned HTTP 500 after unban and global sign-out. No direct Auth-table cleanup was attempted.

**Unresolved timing conflict:** between refund commit and the first successful worker ban, direct GoTrue sign-in and refresh remain callable and may issue tokens. App/DB deactivation checks can deny client data access but cannot intercept Auth endpoints or deny token issuance. This conflicts with an immediate reading of ?block new sign-ins and token refresh?; the outbox design does not claim to close that window.

## Stack and execution

Stack C is project lifter-stack-c, API 35421, DB 35422, full port block 35420-35429. The observed Docker container names used separate lifter, lifter-stack-b and lifter-stack-c projects. Stacks A/B were not targets. Stack C's env file is .env.stack-c; do not inspect or print its values. Use the stack-aware integration harness, which validates Stack C API/DB ports before opening sockets.

F12 U4 and latest F12/F14 migrations remain dependencies for full refund ledger implementation. T012-T015 own that ledger; the current worker/outbox module is a minimal proof only. Retention across backups remains a production blocker.

## Gates

Run the unit suite, Stack C integration suite with LIFTER_SUPABASE_STACK=c, typecheck, lint, Prettier checks on changed files, and git diff --check. Record exact pass/fail/skip counts and final/pushed SHAs. Never use production credentials or Stack A/B.
