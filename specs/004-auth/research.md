# Research: Authentication & Manual Recovery Links (P0-F4)

## R1 — Session handling on Next.js 16 + OpenNext Cloudflare

- **Decision**: `@supabase/ssr@0.12.7` (published 2026-09-08) cookie sessions. Session refresh runs in an **edge-runtime `middleware.ts`**. Server Components only read the session; server actions and route handlers may write cookies.
- **Rationale**: Supabase refresh tokens rotate. If a Server Component refreshes a session but can't write the cookie, the next request reuses a spent refresh token and may be signed out. Middleware can write cookies on every request. Next 16's `proxy.ts` always runs on the Node runtime, and `@opennextjs/cloudflare@1.20.13` marks Node middleware on workerd as "experimental and not supported by the OpenNext maintainers" (`dist/cli/build/open-next/bundle-node-middleware.js`). Edge `middleware.ts` is deprecated in Next 16 but still supported, and it's the path OpenNext supports.
- **Alternatives**: `proxy.ts` (unsupported on the adapter); no middleware with refresh only in actions (sessions break after token expiry); a browser Supabase client (puts auth traffic and the anon key in the browser for no benefit).
- **Risk / exit**: when Next removes `middleware.ts`, revisit once OpenNext supports Node proxy. `npm run build:edge` in CI is the gate that catches breakage.

## R2 — No browser Supabase client

- **Decision**: All auth calls (sign-in, sign-out, verify recovery, set password, generate link) run in **server actions**. The browser never imports `@supabase/*`.
- **Rationale**: This is the smallest attack surface. The privileged key can't leak through a client bundle that never imports a Supabase module. It also keeps the bundle small, which matters for the Workers size and CPU limits.
- **Alternatives**: a browser client for sign-in, which is the usual pattern but isn't needed here.

## R3 — Verifying the identity on the server

- **Decision**: `supabase.auth.getUser()`, which is verified by the auth server, then reads of `staff_profiles` and active `workspace_memberships` with the user's JWT (the existing RLS allows self-reads).
- **Rationale**: `getSession()` trusts the cookie without verification. `getClaims()` verifies locally only with asymmetric signing keys, and the local stack uses HS256, so it falls back to a network call anyway. `getUser()` also notices revoked users. The network wait doesn't count against the Workers CPU limit.

## R4 — Recovery link mechanics

- **Decision**: The server calls `auth.admin.generateLink({ type: 'recovery', email })` with the service-role client and uses only `properties.hashed_token`. LIFTER builds its own URL: `${APP_ORIGIN}/auth/recovery?token_hash=…&type=recovery`.
  - Opening the URL (GET) only renders a "Continue" button.
  - Pressing it calls a POST server action, `verifyOtp({ type: 'recovery', token_hash })`, which creates the session.
  - The user then sets a new password (`updateUser`).
- **Rationale**:
  - Supabase stores only a hash of the recovery token, and verification is single-use and expiring (Constitution VII).
  - A newer `generateLink` replaces the stored token, so it supersedes earlier links (spec edge case).
  - Consuming the token only on POST stops link scanners and chat previews from burning the link.
  - `APP_ORIGIN` comes from server configuration, never from the request `Host` header, to prevent host-header injection.
  - The default `action_link` would send the client to the Supabase domain and needs redirect-URL configuration.
- **Expiry**: The provider's email OTP expiry applies (local default 3600 s). The value is ND-F4-3, set per environment and not in code.

## R5 — Audit and rate-limit ordering (two walls, no orphaned links)

- **Decision**: The flow has four steps.
  1. `public.recovery_link_authorize(target)` (RPC, user JWT): checks the capability on the target's workspace, the target kind, and the rate limits. It returns the workspace id or raises a generic error.
  2. The app-layer `authorize(actor, 'generate_recovery_link', ws)`.
  3. `generateLink` (service role).
  4. `public.recovery_link_record(target)` (RPC, user JWT): repeats every check under a transaction advisory lock on the target and the actor, then inserts into `recovery_link_issuances`. Its audit trigger writes `recovery_link.generated` in the same transaction.

  The link is returned to the UI only after step 4 commits.
- **Rationale**:
  - Unauthorized callers never reach `generateLink`. Otherwise they could invalidate a client's live link, and the call would reveal that the account exists.
  - Every link shown has exactly one audit row (FR-009, SC-004). If step 4 fails (a lost race on the limit, or an audit failure), the link is never shown.
  - The audit actor is `auth.uid()`, because step 4 runs with the user's JWT, not the service role.
- **Accepted residual**: if step 3 succeeds and step 4 fails, the client's earlier unused link is superseded without an audit row. Nobody can see the new link. This needs a race on the limit or a DB failure between two calls.

## R6 — Client target before P1 (ND-F4-5)

- **Decision**: `app_private.recovery_target_workspace(target uuid) returns uuid` returns `null` for every target in F4, so every generation is denied. P1 replaces it (`create or replace`) to look up the client account's workspace. Integration tests swap it, on their serial connection, for a fixture-table lookup and restore it afterwards. `fileParallelism: false` is already set.
- **Rationale**: This ships and tests the whole mechanism without inventing P1's client schema. It also keeps the system closed until P1.

## R7 — Rate limits (ND-F4-4)

- **Decision**: The limits live in one SQL function, `app_private.recovery_link_limits()`, which returns `(per_actor_max, per_target_max, window)`. The **placeholders** are 20 per actor and 3 per target per rolling hour. They're marked ND-F4-4 and must be confirmed before production. A new migration changes them.
- **Rationale**: The limits are enforced in the database, in the same transaction as the insert, so they work across Worker isolates without needing a KV store ($0).

## R8 — Keeping the privileged key server-side

- **Decision**:
  - `lib/supabase/admin.ts` starts with `import 'server-only'` (package `server-only@0.0.1`), so a client import fails the build.
  - The env names have no `NEXT_PUBLIC_` prefix.
  - The admin client uses the F6 HTTPS guard (loopback http allowed) and `redirect: 'manual'`.
  - A CI script, `scripts/check-client-secrets.mjs`, scans `.next/static` and `.open-next/assets` after the build for `service_role`, `SUPABASE_SERVICE_ROLE_KEY` and JWT-shaped strings, and fails on any match.
- **Dependencies**: Move `@supabase/supabase-js` from dev to runtime dependencies. Add `@supabase/ssr@0.12.7` and `server-only@0.0.1`.

## R9 — Generic errors and no secret logging

- **Decision**: Server actions return discriminated result codes (`ok | denied | rate_limited | unavailable | invalid_link`), never provider messages. No `console.*` in the auth modules: an ESLint `no-console` override for `lib/auth/**`, `lib/supabase/**` and `app/**/auth/**`. A unit test spies on the console during failure paths and asserts that no token or link substring appears.

## R10 — Direct Auth bypass experiment (S37, evidence for PDN-F4-7-14 and -15)

- **Decision**: No design change in this section. The results below are the evidence that the FR-030 controls answer. Control A is decided as PDN-F4-7-14 = B and control B as PDN-F4-7-15 = A (S37-PO-8, 2026-11-08). Neither control is verified by this experiment.
- **Source and conditions**: `C:/Users/NEW LAP/.lifter/runs/s37-luna-f4-bypass2/report.md` (E1 to E4 and "PDN implications"). Stack D only (`lifter-stack-d`, API 45421, DB 45422), unmodified wrapper, pinned `supabase@2.122.0`, HEAD `801b5e67`. The DB container StartedAt was the same before and after the run. Synthetic users only; no secret value is recorded here.

| Probe | What was done | Result | Status |
|---|---|---|---|
| E1 | Six direct anon-key `POST /auth/v1/recover` calls, no app request | Attempt 1 returned 200; attempts 2 to 6 returned 429 `over_email_send_rate_limit`. One matching reset mail reached the local mail capture. Zero `audit_events` rows matched the user. | Direct route bypass of the app request path and audit: CONFIRMED. Bypass of the app five-per-account limit: NOT CONFIRMED (GoTrue's own email limit refused five of six). |
| E2 | Direct `PUT /auth/v1/user` password change, with a password sign-in session created outside the app | Returned 200. Zero matching `audit_events` rows before and after. `updated_at` changed; email, phone and app metadata did not. The only non-internal `auth.users` trigger, `signup_auth_claim_sync` (BEFORE INSERT OR UPDATE OF email, phone), did not fire. | Direct password update bypass of audit intent, with no existing guard: CONFIRMED. The recovery-OTP route: NOT CONFIRMED (verify returned 403 `otp_expired`). |
| E3 | Read-only inspection of the pinned CLI Kong template and the profile config | `/auth/v1/` routes to GoTrue. No `/auth/v1/recover` route and no recovery deny toggle. The only Auth hook in `supabase/config.toml` is `custom_access_token`. | A deny rule is NOT AVAILABLE as-is. Option A (local ingress) would need a new topology, not proven. |
| E4 | Two password sessions created directly; the other session after a direct password update | `GET /auth/v1/user` returned 403 for the other session. | GoTrue revoked one tested session on a direct password update: CONFIRMED for that session. The app path is not tested. |

- **Mapping to decisions (no new decision here)**:
  - Control A: PDN-F4-7-14 = B. The send hook was NOT tested by this experiment, so gate G6 (plan.md) is the evidence that is still needed. Option A is not selected because E3 found no route control.
  - Control B: PDN-F4-7-15 = A. E2 is the evidence of need: no existing guard covers a password-only update. The guard is not tested. E2's account is not stated to hold a staff profile, and the update used a password sign-in session, so the staff-scoped guard is still UNVERIFIED.
  - Control C: E4 is evidence for the required outcome on one tested session. Per S37-PO-3/-4, T050a first checks whether GoTrue's own revocation covers the app path before any explicit deletion is added.
  - Control D: E2 did not exercise the recovery verify path, so G4 stays open.
- **Hygiene (operational, not a spec change)**: the two synthetic users `f4-bypass-1@example.test` and `f4-bypass-2@example.test` remain in `auth.users` on Stack D. Their deletion was refused by the foreign key `account_identifier_claims_auth_user_id_fkey` and by the `app_private.forbid_delete()` trigger; no trigger or constraint was disabled. Cleanup needs a supported path and is recorded as a blocker in the S37 report.


## R11 ? F4 round 6 critique disposition and technical requirements

S38-R4 dispositions the executed Sol Medium critique (result: CRITICAL 0 / HIGH 6 / MEDIUM 3 / LOW 1). Findings 1-7, 9 and 10 are addressed in the round-6 spec artifacts. Finding 4 is technically remediated by binding every recovery intent to the initiating user and session; it is not accepted as an exception. Finding 8 pruning removes PDN-F4-7-04, -06, -10, -11 and -16 as technical/obsolete/hosted-deferred, and closes -17 under S38-PO-3.

- Hook failures are distinct: policy refusal, caught audit failure, unavailable transport and timeout. The last two cannot be assumed to receive a generic response from a hook that did not execute. G6 records direct-Auth responses per class, proves no send/no SMTP fallback, and resolves FR-018 technically before acceptance.
- The hook must authenticate calls, validate payloads and action type, verify identity/destination, protect secrets, prevent duplicate side effects, persist the required audit before send and never log token-bearing payloads. Transport specifics are selected and evidenced at local G6; hosted configuration is deferred.
- The hook is the only request-counter owner for app and direct routes. App requests do not pre-consume counters. Mixed and unknown-address traffic, concurrency, five-per-account and ten-global-per-hour semantics, plus the separate two-per-hour delivery cap, are tested without relying on GoTrue throttling. If Auth skips the hook for unknown identities and no technical accounting path covers them, implementation remains blocked.
- Recovery intents bind the initiating session. The guard validates trusted context, and T049a proves another session cannot consume an open intent. If the pinned local stack cannot attest the binding, T050a remains blocked; no exception is accepted.
- After success, end the recovery session and send the user to normal login. Revoke every other pre-existing account session per FR-025(b), FR-030 control C and PDN-F4-7-07. Closing-audit failure after known success still shows success-then-login and requires reconciliation.
- Testing target: 2 minutes. Real-user UX target: 5 minutes from opening the recovery link to successful reset.
