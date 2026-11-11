# Implementation Plan: Authentication & Manual Recovery Links (P0-F4)

**Branch**: `004-auth` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

## Summary

F4 adds:

- **Sign-in and sign-out**: Supabase Auth email/password sessions through `@supabase/ssr` cookies. All auth calls run in server actions, and the browser has no Supabase client.
- **Session refresh**: an edge `middleware.ts` that also routes anonymous visitors (public allow-list) to `/login`.
- **Actor resolution**: a server-verified `getActor()` that feeds the existing `authorize()`.
- **Recovery links, server-side**:
  - a new capability, `generate_recovery_link` (PO/WO; all workspace Trainers may issue for clients in that workspace per S31-PO-2; future implementation requires a new spec cycle, RLS, tests, and security review)
  - an append-only `recovery_link_issuances` table audited as `recovery_link.generated`
  - DB-enforced rate limits
  - an authorize → generate → record ordering, so every link shown has exactly one audit row
- **The `/auth/recovery` page**: it consumes a link only on POST, then sets a new password.
  Client targeting stays closed until P1 creates client accounts (ND-F4-5).

## Technical Context

- **Language/Version**: TypeScript 6.0.3, Node 24, Next.js 16.4.3 (App Router), React 19.3.1
- **Primary Dependencies**:
  - `@supabase/supabase-js@2.118.0` (moved from dev to runtime dependencies)
  - new: `@supabase/ssr@0.12.7`, `server-only@0.0.1`
- **Storage**: Supabase Postgres 17 (local CLI 2.122.0), one forward migration
- **Testing**: Vitest unit, Vitest integration (local stack plus the CI `integration` job), Playwright + axe e2e
- **Target Platform**: Cloudflare Workers via OpenNext (`build:edge` is a CI gate)
- **Constraints**: $0. Workers Free has a 10 ms CPU limit per request, and auth adds one network verify per protected request, which is I/O, not CPU. No browser-side secrets. No external SMTP.
- **Scale/Scope**: pilot scale. Supabase Auth Free MAU is ample.

## Constitution Check

| Principle                                                                             | Status                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I Isolation                                                                           | The actor is derived server-side from a verified session. Generation is checked by the DB guard (`has_workspace_access` on the target's workspace) and app-layer `authorize()`. Denials are generic, so client existence isn't revealed. Foreign-workspace negative tests. ✅                                                                                                                                                         |
| III Least privilege                                                                   | The new capability is limited to PO and WO, Trainer is deny-by-default until ND-F4-1, and Sales is denied. Matrix parity is tested. ✅                                                                                                                                                                                                                                                                                                |
| IV Scope                                                                              | PO manual reset links: BRD lines 40/104/130. WO/Trainer extension: owner decision 2026-10-27, registered as D-19 and approved by the PO (S31-PO-2 SK-004-01). Self-service email reset is sequenced, not removed (ND-F4-7, D-07). No 2FA or device-management screen (PRD-12). ✅                                                                                                                                                     |
| VII Privacy                                                                           | Recovery tokens are hashed by the provider, single-use and expiring. LIFTER stores no secret. The link is shown once and never logged. The audit holds ids only. The service-role key is server-only, enforced by the build and a CI scan. ✅ — 60-minute expiry decided (ND-F4-3); remaining gaps before production: hosted configuration verification (provider OTP-expiry) and session-lifetime enforcement (open ND-F4-3 blocker) |
| VIII UI                                                                               | `/login` and `/auth/recovery` are built on Design System components, AR (RTL) default plus EN, with axe e2e. ✅                                                                                                                                                                                                                                                                                                                       |
| IX Reliability                                                                        | Rate-limit and record use advisory-locked transactions, so concurrent requests can't exceed the limit. ✅                                                                                                                                                                                                                                                                                                                             |
| Platform                                                                              | Edge middleware is the supported OpenNext path (research R1). No deploy. ✅                                                                                                                                                                                                                                                                                                                                                           |
| Workflow                                                                              | Sol Medium critique executed and dispositioned under S38-R4; security review required; implementation waits for passing Analyze and local feasibility; copy is approved (S39-PO-4/S39-PO-5).                                                                                                                                                                                                                                          |
| **Post-design re-check**: no violations. B4 remains a production blocker (unchanged). |

## Design

See [research.md](research.md) (decisions R1–R9), [data-model.md](data-model.md) (migration) and [contracts/auth-surface.md](contracts/auth-surface.md) (routes, actions, library, env).
Generation sequence (server action `generateRecoveryLink(targetUserId)`):

1. `requireActor()`. If there is no actor, the result is `denied`.
2. RPC `recovery_link_authorize(target)` with the user JWT → `ws`. The error `not_permitted` maps to `denied`, `rate_limited` maps to `rate_limited`, and anything else maps to `unavailable`.
3. `authorize(actor, 'generate_recovery_link', ws)` must be true, otherwise `denied` (second wall).
4. Admin `getUserById(target)` → email (kept in memory only), then admin `generateLink({ type: 'recovery', email })` → `hashed_token`. On failure → `unavailable`.
5. RPC `recovery_link_record(target)` with the user JWT. On failure → mapped as in step 2, and the link is discarded.
6. Return `{ status: 'ok', link: buildRecoveryUrl(APP_ORIGIN, hashed_token) }`.

## NEEDS DECISION

ND-F4-1..7, as listed in [spec.md](spec.md#decision-register-owner-sub-decisions). The interim behavior is deny or minimal in every case. ND-F4-3 (expiry) and ND-F4-4 (limits) are now decided (spec Clarifications; S31-PO-3 SK-004-04); ND-F4-6 is decided as clients only (S31-PO-2 SK-004-06). The limits are not yet configured to the decided values: task T031 (FR-010). S35-PO-1 decided ND-F4-5=A (option a) and ND-F4-7 (staff email reset, specified in the ND-F4-7 Design section above, not built); ND-F4-3 session-lifetime remains an open security blocker.

## Project Structure

```text
supabase/migrations/20261028120000_auth_recovery_links.sql
middleware.ts                                  # edge: session refresh + public allow-list
lib/supabase/{env,server,admin}.ts             # admin.ts is server-only
lib/auth/{actor,redirect,recovery-link,results}.ts
lib/auth/capabilities.ts                       # + generate_recovery_link
app/login/{page.tsx,actions.ts,login.module.css}
app/auth/recovery/{page.tsx,actions.ts,recovery.module.css}
app/(app)/page.tsx + app/(app)/actions.ts      # signed-in landing + signOut
components/auth/RecoveryLinkDialog.tsx (+ .module.css)
lib/i18n/messages/{ar,en}.ts                   # auth.* keys
scripts/check-client-secrets.mjs               # CI step after build:edge
tests/unit/{actor,redirect,recovery-link,auth-logs}.test.ts
tests/integration/auth-recovery.test.ts (+ rls-catalog, matrix-parity updates)
tests/e2e/auth.spec.ts
.env.example, README.md (Auth section), .github/workflows/ci.yml (secret scan step)
```

### Provider-boundary controls (FR-030; NF-1/NF-2; S36-PO-2 F4 line)

Status: specified, NOT implemented. No code, migration, env, hosted Auth or SMTP change. Controls A to D are defined in spec.md FR-030; the intent state machine is FR-025 (a) to (h). Decisions (S37-PO-8, 2026-11-08): control A = PDN-F4-7-14 option B (local send-email hook); control B = PDN-F4-7-15 option A (local guard). S38-PO-3 closes PDN-F4-7-17 and authorizes only the local T050b config; hosted Auth, SMTP and Resend remain deferred until domain acquisition. Implementation gates: T033 (remaining PO answers and approved copy), local feasibility spikes G1-G6, then T050a/T050b after the required RED tests and a passing Spec Kit entry check.
Experiment evidence (S37, Stack D, `research.md` R10): E1 and E2 CONFIRM the direct bypass of the app path (`/recover` mail with no app audit; direct password update with no audit row). E3 finds no deny rule for `/recover` in the generated CLI Kong configuration. E4 observes that GoTrue revoked the other session after a direct password update. The send hook (control A) and the guard (control B) were NOT run in the experiment, so both controls remain UNVERIFIED until their gates pass.
Facts verified read-only in this repo on 2026-11-06:

- `supabase/config.toml` sets `[auth.hook.custom_access_token]` (pg-functions) and `[auth.email] otp_expiry = 3600`. It sets no send-email hook and no switch that disables the recovery endpoint.
- `public.staff_profiles` (`supabase/migrations/20261027120000_tenancy.sql`, line 4) and `public.audit_events` (`supabase/migrations/20261027150000_audit_log.sql`, line 2) exist. `app_private.audit_row_change()` and `app_private.forbid_delete()` exist.
- Precedent for a trigger on `auth.users`: `signup_auth_claim_sync` (`supabase/migrations/20261031121000_client_accounts_model.sql`, line 183).
- Precedent for an intent-style two-phase record with reconciliation: F14 `reconciliation_pending` (`lib/branding/upload-state.ts`), cited by FR-025.
  Control B (guard on `auth.users`), decided as PDN-F4-7-15 = A: local-only in the test phase, hosted only at the FR-020 gate with its own approval, and the consequence that a staff password change outside the self-service flow is refused. Local design:
- Table `app_private.staff_password_reset_intents`: `intent_id uuid primary key default gen_random_uuid()`, `auth_user_id uuid not null references auth.users(id) on delete restrict`, `session_id uuid not null`, `state text not null check (state in ('open','completed','aborted','reconciled'))`, `started_at timestamptz not null default now()`, `recovery_verified_at timestamptz not null`, `password_changed_at timestamptz`, `closed_at timestamptz`, and `check ((state = 'open') = (closed_at is null))`. A partial unique index on `(auth_user_id) where state = 'open'`. RLS enabled and forced; `revoke all` from public, anon, authenticated and service_role; no policies. Immutability and no-delete triggers follow the F4 pattern (`forbid_delete`).
- Public RPCs, `security definer`, `set search_path = ''`, execute granted to `authenticated` only: `public.staff_password_reset_begin()` (uses `auth.uid()` and `auth.jwt()->>'session_id'`), `public.staff_password_reset_complete(intent_id uuid)` and `public.staff_password_reset_abort(intent_id uuid)`. Each accepts only an intent owned by the caller, and refuses any other intent with one generic error.
- `begin` order, in one transaction: (1) caller is an eligible staff identity (PDN-F4-7-02 is answered; T034 verifies the role set); (2) the caller's JWT `amr` carries the recovery verification entry within 900 s (control D), and the verification time is stored as `recovery_verified_at`; (3) if a fresh `open` intent exists for the same verified recovery session, return that intent idempotently without another audit row; if it belongs to another session, refuse; if it is older than 900 s, close it as `reconciled` before continuing; (4) otherwise insert the `open` intent. An AFTER INSERT trigger on the intent table appends exactly one `staff_password_reset.completion_started` with `{intent_id}`, so the audit row and intent commit together.
- Guard trigger `app_private.staff_password_guard()`, `BEFORE UPDATE OF encrypted_password ON auth.users FOR EACH ROW WHEN (old.encrypted_password IS DISTINCT FROM new.encrypted_password)`. If `new.id` has a `public.staff_profiles` row (verify the user column name on main at T050a), it requires an `open` intent for `new.id` and `now() <= intent.recovery_verified_at + interval '900 seconds'`. It then sets `password_changed_at = now()` on that intent and deletes `auth.sessions` rows of `new.id` where `id <> intent.session_id` (control C). Otherwise it raises `not_permitted` (SQLSTATE 42501) with a generic message. Non-staff rows return `new` unchanged.
- `app_private.staff_password_reset_reconcile()`: for each `open` intent with `started_at < now() - interval '900 seconds'`, set `state = 'reconciled'`, `closed_at = now()` and append `staff_password_reset.completion_reconciled` with `{intent_id, password_changed}`. The update is guarded by `state = 'open'`, so a second run changes nothing. It is executable by the job role only, not by `authenticated`, `anon` or `public`. Scheduling is decided at T050a under the F6 jobs convention.
- Closing transitions for `complete` and `abort` are guarded the same way (`where state = 'open'` and the `password_changed_at` condition from FR-025 (c) and (d)). Each appends exactly one audit row from an AFTER UPDATE trigger on the intent table.
  Why the database order gives the PO guarantee: the intent row is committed in its own transaction before `updateUser` runs, and the guard refuses any staff password change without it. A password change therefore always has a durable intent, and the closing record or reconciliation follows. The database cannot roll back GoTrue's update, so this is not a shared transaction across GoTrue and LIFTER. The guarantee holds for the app path and for a direct `updateUser` alike, because the guard does not depend on the caller.
  Control A (public `/recover`), decided mechanism: PDN-F4-7-14 = B. The local `[auth.hook.send_email]` hook is the sender in local testing, so every send passes through it, both on the app route and on a direct anon-key `/recover`. Design:
- The hook is the single enforcement point for the test phase: it checks eligibility (PDN-F4-7-02), delivery permission for permitted test addresses (the list's location is PDN-F4-7-01, still open), the per-account and global limits (FR-024), the 2-per-hour delivery cap (FR-019) and the `staff_password_reset.requested` audit before it sends. The audit row is written by database code (F5 FR-002). Writing the rules once, in the hook, avoids a second copy that could drift from the app route (complexity rule, S37-PO-3/-4).
- A policy refusal and an audit failure send nothing. A policy refusal and an application-caught audit failure use the generic response mapper. An unavailable hook transport and a hook timeout are distinct: the hook cannot map an error it did not receive. G6 records direct-Auth status/body for each class, verifies no mail and no SMTP fallback, and resolves any observed FR-018 conflict before acceptance; it does not assume generic parity.
- The hook trust boundary is mandatory: authenticate invocations using the selected pinned-stack transport contract; validate the payload schema and action type; process only the approved recovery action; match identity and destination to provider/database state; protect runtime secrets; make duplicate delivery/audit handling idempotent; and keep token-bearing payloads out of logs. T050b records the concrete transport and its evidence. No untrusted invocation may cause quota use, audit writes or mail.
- The transport of the hook (a local HTTP endpoint or a Postgres-function URI) is recorded at T050b, with the evidence from G6. It is an implementation choice, not a PO decision.
- Intent immutability applies to identity and origin fields, not every update: the validator allows only the guarded `open -> completed`, `open -> aborted` and age-qualified `open -> reconciled` transitions in FR-025. Identity/session/start/verification fields never change; password-changed and closed timestamps are one-time values; closed intents reject all updates. DELETE/TRUNCATE remain unconditionally refused.
- Option A (local ingress) is not selected: E3 found no route-level deny in the generated Kong configuration, so it would need a new proxy topology that is neither present nor proven.
- Local test scope: the hook exists only in local stack configuration under S38-PO-3. Hosted work is deferred under FR-020.
  Gate G6 (local feasibility spike, before the hook is relied on; each item is a RED-to-GREEN check on the local stack, none is assumed): (i) a direct anon-key `/auth/v1/recover` invokes `[auth.hook.send_email]`; (ii) policy refusal and application-caught audit failure send no mail; (iii) unavailable transport and timeout are tested separately, with direct-route status/body recorded; no SMTP fallback occurs; (iv) transport authentication, payload validation, recovery-action filtering, identity/destination checks, idempotence, secret handling and absence of token-bearing logs are proven; (v) repeated direct requests for known and unknown addresses are compared for status/body; any FR-018 conflict is technically resolved before acceptance; (vi) refusal does not replace an already delivered link. Failure blocks T050b; it does not revive PDN-F4-7-17 or imply a PO exception.
  The database cannot stop a recovery email on its own, because GoTrue generates the token and sends the mail itself. Control A therefore relies on the hook, and the guard on `auth.users` (control B) covers the password path separately.
  Hosted containment (FR-020): S38-PO-3 explicitly authorizes local-only T050b and defers hosted changes and Resend until domain acquisition. PDN-F4-7-17 is closed; no hosted config push, migration, Auth change or SMTP change is performed in this feature task. Hosted setup remains separately approved at the FR-020 release gate, where the sender must satisfy control A.
  Session scope (S38-R4 finding 4, technically remediated): the recovery intent is bound to the initiating user and recovery session. The database guard must validate that same session through trusted request context; an open account-level intent alone is insufficient. G1/G2 and T049a prove the pinned local Auth request context supports this. If not, implementation remains blocked until a technical design establishes the binding; no bypass exception is accepted.
  Local feasibility gates (T050a spike, before implementation of control B). Each gate is a RED-to-GREEN item on the local stack; none is assumed:
- G1: the guard refuses a staff `updateUser` without an open intent, binds an intent to the initiating recovery `session_id`, refuses a competing session while that intent is open, and allows a client manual-link completion (T049a).
- G2: GoTrue provides trusted session context to the guard for the update; the guard accepts only the matching session, returns refusal to a competing session and leaves the stored password and intent unchanged. If the context cannot be established, stop before T050a.
- G3: GoTrue refuses the access token of another session after a successful password change, and the pre-reset bearer token is refused at the Data API when replayed against a protected resource (control C). The test first confirms the token can read the staff user's own resource before reset. If Auth or Data API still accepts the token after reset, control C and T050a remain technically blocked until an enforcement design is proven. The required outcome is governed by FR-025(b), FR-030 control C and PDN-F4-7-07.
- G4: `auth.jwt()->'amr'` carries the `otp` entry for a verify-recovery session, and a password sign-in session does not. If either fails, control D remains technically blocked; no session-age fallback or product exception is inferred.
- G5: deleting `auth.sessions` cascades to `auth.refresh_tokens` on the pinned local stack.
- G6: authenticated send-hook boundary, unknown-address accounting, and distinct hook-failure-class spike for control A, as defined above.
  Migration versions (described only, not named here): T044 and T050a each add one forward migration. The version of each is chosen at implementation. It must be above the highest `supabase/migrations` version on every origin ref (scan on 2026-11-08: highest `20261108230000`, on `origin/014-hero-impl`) and unique across all origin refs at commit and push time.
  If G1 or G2 fails, control B cannot be enforced and the conflict is raised again; no workaround is attempted.
  Local-only limits: all tests run on the local Supabase stack and local Inbucket. Test fixtures must set staff passwords when the user is created. A later admin password update for a staff identity is refused by control B, so a fixture that changes a staff password after creation must use the intent path.

## ND-F4-7 Design (staff self-service email reset; specified, NOT built)

Status: specification only. No code, migration, env, hosted Supabase Auth or SMTP change. T033 entry requires answered PO decisions, COPY-F4-R6 copy approval recorded (English S39-PO-4, Egyptian Arabic S39-PO-5), critique disposition S38-R4, and fresh Analyze with 0 open CRITICAL/HIGH. PDN-F4-7-14=B and -15=A are answered; -17 is closed by S38-PO-3; -01/-02/-03/-05/-09/-12 are answered; -04/-06/-10/-11/-16 are pruned or deferred. Write RED tests before implementation, then run G1-G6 feasibility checks; failed checks block implementation technically. Hosted work stays deferred under FR-020.
Flow (requirements in spec.md FR-016 to FR-028):

1. The request form lives on `/login` (no new public route, so the FR-005 allow-list does not change). It is a second server action beside `signIn`.
2. Server action `requestStaffReset(email)` (proposed name) runs in this order, and the outcome is the same generic confirmation on every path (FR-018):
   a. Format check. A malformed address is rejected before any work (FR-017).
   b. Normalize the address; the hook is the single accounting owner for both app and direct routes, including unknown addresses. G6 must prove Auth does not skip required accounting.
   c. No separate app counter is consumed: the hook is the single authoritative accounting operation for app and direct routes. The local feasibility gate must prove unknown and non-staff requests are accounted even if Auth skips the hook; if not, implementation stays blocked (FR-024/G6).
   d. The Auth request reaches the single enforcement hook, which checks staff eligibility (PDN-F4-7-02), local delivery permission (PDN-F4-7-01), request/delivery limits and audit before send.
   e. `resetPasswordForEmail(email, { redirectTo })`, using the anon-key server client only. `redirectTo` is built from `APP_ORIGIN` and `/auth/recovery` (FR-023). Any provider error is discarded; unavailable/timeout outcomes are separately evidenced by G6.
3. The email link is the existing `/auth/recovery?token_hash&type=recovery` flow, the shape `buildRecoveryUrl` already uses for manual links. GET and HEAD show Continue only and never verify (FR-022, safe against link scanners). POST (`verifyRecovery`) verifies, then the set-password form appears. The session window stays 15 minutes (FR-026). `Referrer-Policy: no-referrer` is set for `/auth/recovery` in `next.config.ts`, as for `/register/:token` (FR-022; T045).
4. Completion (FR-025(a)-(h); FR-030 controls B-D). The database holds a session-bound intent. The guard accepts only the same verified user/session context, refuses competing sessions, records one atomic password change, and ends other pre-existing sessions. After known success, end the recovery session and redirect to normal login; closing-audit failure still shows success-then-login and requires reconciliation.
5. Hosted configuration (redirect allow-list, `token_hash` email template, sender, provider limit, CAPTCHA) is out of scope and deferred under FR-020/S38-PO-3. Local config sets `otp_expiry = 3600` (FR-021); local recovery template T044a uses `/auth/recovery` with `token_hash` and `type=recovery`; local mail goes to Inbucket.
   Open technical questions for the architect and the security review (not PO decisions):

- AT-1: audit-before-send (FR-025, fail closed) means a provider failure after the audit row leaves a `requested` row for an email that was not sent. Options: keep the row and mark the failure in a later row, or record the request only as accepted by the provider and accept that the send and the audit are not in one transaction. Decide with the security review.
- AT-2: the timing parity in FR-018 needs the same work on every path, including a non-sending path for unknown and non-staff addresses. The tolerance and the test method are decided here and reviewed by security.
- AT-3: whether a self-service request supersedes an earlier unused self-service link for the same account (ND-F4-3 replacement rule) is verified against the local provider in SC-010. The manual-link state is not shared, since staff targets are denied for manual links (SK-004-06).
  Constitution check for ND-F4-7:
  | Principle           | Status                                                                                                                                                                                                                                                                                         |
  | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | I Isolation         | Eligibility is decided on the server. The generic response reveals no workspace or membership. Foreign-workspace negatives are not applicable (staff reset is platform-scoped); the client-account negative (FR-016, S5) is tested.                                                            |
  | III Least privilege | Staff only; clients get no email; the eligible roles are a PO decision (PDN-F4-7-02).                                                                                                                                                                                                          |
  | IV Scope            | PO S35-PO-1 decision; BRD line 130 and PRD-02 (docs/01 row) are the sources; D-07 sequencing is closed by the PO decision. Nothing outside the PO words is added without a PDN.                                                                                                                |
  | VII Privacy         | Tokens stay with the provider (hashed); no LIFTER-side secret; no email or token in logs or audit; audit of sensitive actions (FR-025).                                                                                                                                                        |
  | VIII UI             | `/login` extension on Design System components; AR/EN; copy approved (S39-PO-4/S39-PO-5; FR-027/FR-031).                                                                                                                                                                                       |
  | IX Reliability      | Rate limit in one advisory-locked transaction; audit before send, fail closed; completion intent appended before any password change, closing row after, reconciliation for open intents; the `auth.users` guard refuses staff password changes without the intent (FR-025, FR-030 control B). |
  | Platform            | No hosted change; local stack only for tests.                                                                                                                                                                                                                                                  |
  | Workflow            | Sol Medium critique executed and dispositioned under S38-R4; security review required; implementation waits for passing Analyze and local feasibility; copy is approved (S39-PO-4/S39-PO-5).                                                                                                   |

## Complexity Tracking

| Item                                                                                                  | Why                                                                                                                            | Simpler alternative rejected because                                                               |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Deprecated `middleware.ts` instead of `proxy.ts`                                                      | OpenNext supports only edge middleware                                                                                         | `proxy.ts` is Node-only, which OpenNext calls experimental and unsupported                         |
| Two RPCs (authorize, record) around `generateLink`                                                    | No orphaned audit, no unauthorized invalidation of a client's link                                                             | A single post-generation RPC lets unauthorized callers burn links and probe whether accounts exist |
| Send-email hook for the test phase (PDN-F4-7-14 = B), one enforcement point for app and direct routes | Only the provider boundary sees a direct anon-key `/recover`; E3 found no route-level deny in the generated Kong configuration | Local ingress (option A): a new proxy topology that is absent and unproven                         |
| Guard trigger on `auth.users` password changes (PDN-F4-7-15 = A), with the existing intent table      | E2 confirmed a direct password update with no safeguard; only a row-level guard binds every caller                             | Application-only check (option B): the direct `updateUser` path stays open                         |
