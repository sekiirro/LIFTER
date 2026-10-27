# Research: F11 client accounts and signup

**Date**: 2026-10-28. Design only; branch `011-client-accounts`, starting HEAD `b1c75d3`. Sources: [spec](spec.md), Constitution v1.1.0, F10 artifacts and actual code/migrations. A read-only research agent inspected F4/public admission; the author inspected local Auth catalog metadata. No application, DB, dependency, seed or deployment mutation was performed.

## R1 — Source precedence and readiness

**Decision:** Preserve FR-003's atomic client/link/audit database unit and its separate Auth consistency outcome. D-08/D-16/D-19 override older collision/SMTP text. No F12 approval, subscription, activation, payment or plan access. All ten ND-F11 items remain open behind the single-owner seams in [plan](plan.md#open-decision-seams).

**Rationale:** The user explicitly requests planning without interactive input. The skill's unresolved-clarification gate therefore remains **ERROR for implementation readiness**, rather than silently resolving the spec's three markers. Research resolves technical questions into evidence, alternatives and proof obligations; it cannot answer PO questions or approve AD-F11-1. Independent architect review remains required; this author does not approve its own design.

**Alternatives considered:** Adopting clarification recommendations as defaults, weakening atomicity, or inferring staff permissions; all rejected.

## R2 — Local feasibility evidence for AD-F11-1

Read-only Docker inspection of the existing local `project_id = "lifter"` stack (not a freshly migrated isolated fixture):

- `supabase_auth_lifter`: image `public.ecr.aws/supabase/gotrue:v2.197.0`; `docker exec supabase_auth_lifter auth version` returned `v2.197.0`. CLI pin **2.122.0 is not the GoTrue version**. The initial `auth --version` form was unsupported; the `version` subcommand succeeded.
- `supabase_db_lifter`: image `public.ecr.aws/supabase/postgres:17.11.0.006`; `SELECT version()` returned PostgreSQL 17.11. All catalog queries ran inside `BEGIN READ ONLY ... COMMIT`; no row data, hashes, passwords or keys were selected.
- `auth.users`: UUID PK `id`; email, phone, encrypted_password, aud, role, confirmation and recovery markers, JSON app/user metadata, timestamps, `banned_until`, `deleted_at`, `is_sso_user NOT NULL DEFAULT false`, `is_anonymous NOT NULL DEFAULT false`. `confirmed_at` is generated as `LEAST(email_confirmed_at, phone_confirmed_at)`; never insert it.
- `auth.identities`: UUID PK `id DEFAULT gen_random_uuid()`; mandatory `provider_id`, `user_id`, `identity_data`, `provider`; FK `user_id → auth.users(id) ON DELETE CASCADE`; UNIQUE `(provider_id,provider)`. `email` is generated from `lower(identity_data->>'email')`; never insert it.
- `users_email_partial_key` uniquely indexes **email**, only where `is_sso_user = false`; the instance/lower(email) index is nonunique. `users_phone_key` is unique. These do **not** prove the approved cross-identity normalized uniqueness contract; F11 needs its own DB-enforced canonical claims.
- No noninternal triggers on either Auth table in this local catalog. `postgres` has INSERT/UPDATE/DELETE/REFERENCES/TRIGGER rights and BYPASSRLS; anon/authenticated do not have those enumerated Auth grants. `pgcrypto` is installed in `extensions`.

This establishes structural feasibility, not a successful write/sign-in experiment. U2 forbids those mutations. Future isolated tests must prove actual Auth parity, hashing, sign-in, cleanup and schema-upgrade behavior before implementation acceptance.

Version-pinned primary source cross-checks: [GoTrue admin implementation](https://github.com/supabase/auth/blob/v2.197.0/internal/api/admin.go), [user model](https://github.com/supabase/auth/blob/v2.197.0/internal/models/user.go), [password crypto](https://github.com/supabase/auth/blob/v2.197.0/internal/crypto/password.go), [password grant](https://github.com/supabase/auth/blob/v2.197.0/internal/api/token.go). These support the following engineering inferences, not product policy.

## R3 — AD-F11-1 option (i): direct transactional Auth writes

**Decision candidate:** A hardened postgres-owned SECURITY DEFINER signup function inserts `auth.users`, email `auth.identities`, canonical claims and client, guarded consumption and audit in one transaction. No Auth HTTP call or service-role application key is needed. This is **pending architect decision**.

**Feasibility/coupling:** Local rights and schema permit it. The function must reproduce required aud/role, provider metadata, email identity subject/provider_id, safe empty token markers and confirmation state, while omitting generated columns. Restrict role to ordinary authenticated, never accept caller role/metadata. This couples F11 to GoTrue internals and bypasses its creation hooks/validation; every Auth upgrade needs schema/behavior comparison and compatibility tests. A schema mismatch must fail closed.

**Password/sign-in:** Use `extensions.crypt` with a bcrypt salt/cost matching the pinned provider only after proving GoTrue accepts its hash; never assume a token digest is a password hash. GoTrue's current generator uses bcrypt default cost; DB encryption configuration must also be checked because stored encrypted_password may require provider encryption. Test UTF-8 byte boundaries, NUL rejection and bcrypt's 72-byte boundary; do not silently truncate or prehash. Any mismatch with approved ND-F11-1 blocks this candidate rather than inventing a password policy. Set email-password eligibility without SMTP under D-19, with exact provider parity proven on an isolated stack. Normal later `signInWithPassword` must work; signup session behavior remains ND-F11-6.

**Consistency/retries:** Rollback removes the Auth user and identity too, so cleanup outages cannot leave a usable orphan. The link lock plus UNIQUE client link and an internal committed receipt bound to link/request-secret prevent a second identity after response loss. Every public consumed-link replay returns generic invalid, including exact retry after a lost success response, as the spec's edge-case contract requires. Receipts serve internal dedup/reconciliation only; never recover a public success, user/client ID or session from them.

**Tests/runtime:** Inject failures after Auth insert, identity insert, claims, client, consumption and deferred audit; every effect must roll back. HTTPS RPC works from Workers with no DB socket, native bcrypt module, subprocess or persistent connection. Password hashing occupies the DB and needs per-token admission before hashing; do not invent throughput targets.

## R4 — AD-F11-1 option (ii): Auth admin API plus compensation

**Decision candidate:** Server-only `createUser` handles provider hashing/identity construction; a separate atomic DB finalize function inserts client, consumes link and audits. Reserve one random UUIDv4 Auth ID and request-secret hash per link before HTTP creation, then reuse that exact ID on retry (the pinned admin endpoint supports an explicit ID; verify SDK typing/transport before use). No public caller supplies an arbitrary Auth ID. Do not look up ownership by email or retry with a new identity after a timeout.

**No usable orphan:** Plain create-confirmed → DB finalize → delete-on-error is unsafe. Create with a ban already applied in the provider transaction, and use an additional durable pending-user gate. A finite `ban_duration` alone eventually expires; unconfirmed alone is not sufficient across configuration/recovery paths. A viable variant needs a reviewed Auth-row guard tied to the private reservation that holds pending users at `banned_until = 'infinity'`, including subsequent admin updates, until DB finalization. Finalization atomically inserts client, consumes, audits, marks the reservation committed and clears the pending ban; rollback leaves it banned. This narrows direct Auth coupling to gating/unban, but does not eliminate it. GoTrue timestamp scanning/ban enforcement for infinity and the guard's interactions with createUser must be proven; **not verified and a blocker**. An equivalent provider-enforced permanent gate may replace it only with the same proof. No API-only construction has been proven here to satisfy FR-003.

**Compensation/reconciliation:** On definitive DB rollback, a privileged server reconciler locks the link then reservation, records cleanup-pending and prevents concurrent finalize before deleting only the reserved Auth ID. If delete fails, the durable gate keeps it unusable; retain retry evidence and retry delete/ban idempotently. On unknown DB outcome, first query the authoritative receipt/reservation: committed means never delete/ban that user; pending may be finalized on exact retry if still valid; abandoned/expired is gated then cleaned. On createUser response loss, get that reserved ID and verify private binding, never create a second ID. Concurrent cleanup/finalize must serialize in the same lock order, with an active operation lease/fence around HTTP work so a slow response cannot resurrect a cleaned reservation. A process crash or failed cleanup leaves durable work discoverable without retaining a password/token/email in the work item. Do not log provider bodies. Retention/attempt policy remains ND-F11-7/10.

**API/runtime:** `lib/auth/recovery-link.ts` already uses server-only `createAdminClient()` from `lib/supabase/admin.ts`, after signed preflight and app `authorize()`. It calls `getUserById` and `generateLink`, disables session persistence/refresh and follows no provider redirects. Keep `SUPABASE_SERVICE_ROLE_KEY` in that server-only boundary, never NEXT_PUBLIC variables, props, browser bundles or logs. HTTP is Workers-compatible; do not rely on fire-and-forget cleanup after an isolate terminates. Durable reconciliation is required, with no cloud work in U2.

**Tests:** Fail create response delivery, DB commit delivery, finalize, unban, delete and reconciler; terminate between each step, race retry/cleanup, advance beyond a finite ban and test sign-in/recovery while pending. Provider HTTP success cannot report signup completion before DB commit. New credentials are usable only with a committed client; later sign-in is ordinary GoTrue sign-in.

## R5 — Comparison and recommendation

| Criterion                    | (i) Direct transaction                                                   | (ii) Admin API + DB transaction                                                |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Local structural feasibility | Auth INSERT rights, schema and pgcrypto present; sign-in parity unproven | Version-pinned API supports create ID and ban; durable pending gate unproven   |
| Internal/upgrade coupling    | High: full user/identity shape and hashing semantics                     | Lower for creation, still meaningful for permanent gate and atomic unban       |
| Hash correctness             | Must prove pgcrypto/provider parity and storage-encryption compatibility | Provider owns hashing; approved password acceptance still tested               |
| Failure/lost response        | One rollback boundary and private receipt; simplest guarantee            | Reservation, fencing, permanent gate, compensation and reconciliation required |
| No usable orphan             | Atomic rollback structurally supplies it                                 | API-only compensation insufficient; gated variant conditional on proof         |
| Key placement                | No service key in signup application path                                | Service key only in server-only orchestration/reconciler                       |
| Workers                      | One fetch/RPC; DB does bcrypt                                            | Multiple HTTP calls; no isolate-lifetime assumptions                           |
| Failure injection            | DB step/deferred failure + lost commit response                          | Adds provider ambiguity, cleanup outages and durable-worker races              |

**Recommendation — pending architect decision:** Prefer **(i)** for this binding unit if isolated hashing/sign-in and Auth configuration parity tests pass. It gives the strongest FR-003 outcome with the smallest failure state space and no new service-key signup path. Accept its explicit upgrade coupling only after architect review. If parity fails, do not ship it: evaluate the permanently gated variant of (ii); the easier API-only delete/ban compensation variant is rejected because it does not meet the indefinite no-usable-orphan outcome. No candidate is selected or implemented by this plan.

## R6 — Two authorization walls and global uniqueness

**Decision:** Protected access keeps existing `authorize()` + `has_workspace_access()`; default deny, no new capabilities/memberships. Current `actor.ts` loads staff roles only, so clients have role NULL and cannot be made staff to get signup through. Public admission uses a separate bounded `authorizePublicClientSignup()` app check and the independent definer RPC deriving scope from the secret link. RLS remains forced with no anon table policy; the definer's elevated execution is constrained by its own checks, not claimed to be subject to RLS despite owner BYPASSRLS. Architect must review this narrow pattern as F10 does, not approve general service-role DML.

**Rationale:** A globally unique canonical claim registry is necessary across clients and existing Auth/staff identities; UNIQUE on clients alone is insufficient. Future additive migration/backfill must detect existing conflicts and stop, never merge/rewrite by assumption. Sync all Auth identifier writes and staff/client classification paths, not only signup. ND-F11-2/9 own transformations and account-state participation; unresolved policy blocks deployment.

## R7 — Authoritative time, privacy and F4

**Decision:** Sample `clock_timestamp()` after the link lock, then again at guarded consumption. Existing F10 uses transaction-start `now()`; merely copying it into a transaction that waits on a lock could admit an expired request. A future forward-only extension of the consumed-marker guard must use the same authoritative consume-time check while preserving every first-open immutability rule. Do not modify the committed F10 migration or broaden UPDATE grants.

F4 needs only `recovery_target_workspace(target)` to return the committed client's workspace by unique Auth ID. Preserve its caller/target checks, capabilities, expiry, rates, audit and ND-F4-5. See the [contract](contracts/client-signup-surface.md#f4-recovery-dependency). A discovered test hazard: `tests/integration/auth-recovery.test.ts` replaces that helper for fixtures and restores `SELECT NULL::uuid`; future tests must restore the installed real definition or use real client fixtures, otherwise suite order erases F11 linkage.

Privacy follows F10: exact public route, no token-bearing redirect/next/log, headers on every GET/POST/error outcome and host log redaction. Server Actions do not make a bound token safe for logging. B4/retention, host access logging and inherited F4/F10 open decisions remain blockers where already defined. No new ND-F11 number is introduced; new technical risks belong to AD-F11-1 or the existing ND owner.
