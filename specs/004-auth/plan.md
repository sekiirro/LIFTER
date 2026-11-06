# Implementation Plan: Authentication & Manual Recovery Links (P0-F4)

**Branch**: `004-auth` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

## Summary

F4 adds:

- **Sign-in and sign-out**: Supabase Auth email/password sessions through `@supabase/ssr` cookies. All auth calls run in server actions, and the browser has no Supabase client.
- **Session refresh**: an edge `middleware.ts` that also routes anonymous visitors (public allow-list) to `/login`.
- **Actor resolution**: a server-verified `getActor()` that feeds the existing `authorize()`.
- **Recovery links, server-side**:
  - a new capability, `generate_recovery_link` (PO, WO; Trainer denied pending ND-F4-1)
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

| Principle | Status |
|---|---|
| I Isolation | The actor is derived server-side from a verified session. Generation is checked by the DB guard (`has_workspace_access` on the target's workspace) and app-layer `authorize()`. Denials are generic, so client existence isn't revealed. Foreign-workspace negative tests. ✅ |
| III Least privilege | The new capability is limited to PO and WO, Trainer is deny-by-default until ND-F4-1, and Sales is denied. Matrix parity is tested. ✅ |
| IV Scope | PO manual reset links: BRD lines 40/104/130. WO/Trainer extension: owner decision 2026-10-27, registered as D-19 and approved by the PO (S31-PO-2 SK-004-01). Self-service email reset is sequenced, not removed (ND-F4-7, D-07). No 2FA or device-management screen (PRD-12). ✅ |
| VII Privacy | Recovery tokens are hashed by the provider, single-use and expiring. LIFTER stores no secret. The link is shown once and never logged. The audit holds ids only. The service-role key is server-only, enforced by the build and a CI scan. ✅ — expiry value pending ND-F4-3 before production |
| VIII UI | `/login` and `/auth/recovery` are built on Design System components, AR (RTL) default plus EN, with axe e2e. ✅ |
| IX Reliability | Rate-limit and record use advisory-locked transactions, so concurrent requests can't exceed the limit. ✅ |
| Platform | Edge middleware is the supported OpenNext path (research R1). No deploy. ✅ |
| Workflow | Spec → Plan → Tasks. Codex implements, and Claude reviews and re-runs the gates and local Docker checks. ✅ |

**Post-design re-check**: no violations. B4 remains a production blocker (unchanged).

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

ND-F4-1..7, as listed in [spec.md](spec.md#needs-decision-owner-sub-decisions-not-invented-here). The interim behavior is deny or minimal in every case. ND-F4-3 (expiry) and ND-F4-4 (limits) are now decided (spec Clarifications; S31-PO-3 SK-004-04); ND-F4-6 is decided as clients only (S31-PO-2 SK-004-06). The limits are not yet configured to the decided values: task T031 (FR-010). S35-PO-1 decided ND-F4-5=A (option a) and ND-F4-7 (staff email reset, specified in the ND-F4-7 Design section above, not built); ND-F4-3 session-lifetime remains an open security blocker.

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

## ND-F4-7 Design (staff self-service email reset; specified, NOT built)

Status: specification only. No code, migration, env or hosted Supabase Auth or SMTP change. The Sol Medium critique is PENDING (not invoked; invocation approval is not given in the architect notes). Implementation gate (all must pass before tasks T043 to T046 start): the PO answers PDN-F4-7-01 to PDN-F4-7-11 that block them; BLOCKED-COPY strings approved (PDN-F4-7-06); Analyze re-run after those answers; security review scheduled.

Flow (requirements in spec.md FR-016 to FR-028):

1. The request form lives on `/login` (no new public route, so the FR-005 allow-list does not change). It is a second server action beside `signIn`.
2. Server action `requestStaffReset(email)` (proposed name) runs in this order, and the outcome is the same generic confirmation on every path (FR-018):
   a. Format check. A malformed address is rejected before any work (FR-017).
   b. Normalize the address and derive the hashed key (PDN-F4-7-04).
   c. Rate limit, per target and global, in one advisory-locked transaction (Constitution IX). The check applies to unknown and non-staff addresses too (FR-024).
   d. Eligibility, server-only: a staff identity with an eligible role (PDN-F4-7-02). Non-eligible addresses stop here with no send.
   e. Delivery permission and the 2-per-hour cap (FR-019, PDN-F4-7-01). If not permitted, stop with no send.
   f. Audit `staff_password_reset.requested` written before the send (fail closed, FR-025).
   g. `resetPasswordForEmail(email, { redirectTo })`, using the anon-key server client only. `redirectTo` is built from `APP_ORIGIN` and `/auth/recovery` (FR-023). Any provider error is discarded and never returned.
3. The email link is the existing `/auth/recovery?token_hash&type=recovery` flow, the shape `buildRecoveryUrl` already uses for manual links. GET and HEAD show Continue only and never verify (FR-022, safe against link scanners). POST (`verifyRecovery`) verifies, then the set-password form appears. The session window stays 15 minutes (FR-026). `Referrer-Policy: no-referrer` is set for `/auth/recovery` in `next.config.ts`, as for `/register/:token` (FR-022; T045).
4. Completion (S35-R5, FR-025). After the recovery-session and password checks pass, and immediately before `auth.updateUser`, the server appends `staff_password_reset.completion_started` and obtains its intent id. If that append fails, the password is not changed. After `updateUser` succeeds, the server appends `staff_password_reset.completed` referencing the intent id, then redirects. If `updateUser` returns an unchanged-password error, the server appends `staff_password_reset.completion_aborted`. Reconciliation (`app_private.staff_password_reset_reconcile()`) appends `completion_reconciled` for open intents older than `RECOVERY_SESSION_MAX_AGE_SECONDS`. Audit rows are written only by database code (F5 FR-002), so these are database functions with the same guard style as `recovery_link_record`, in one forward migration (T044). The database cannot roll back the Auth update, so the guarantee is the ordering in FR-025 and not a shared transaction. Scheduling of the reconciliation call is decided at T044 under the F6 jobs convention and is not a PO decision.
5. Hosted configuration (redirect allow-list, `token_hash` email template, sender, provider rate limit, CAPTCHA) is out of scope and is gated by FR-020 and PDN-F4-7-11. Local `supabase/config.toml` already sets `otp_expiry = 3600` (FR-021). The local recovery email template that links to `/auth/recovery` with `token_hash` and `type=recovery` is T044a; the provider default (`ConfirmationURL`) is not used. Local email is captured by Inbucket for tests only.

Open technical questions for the architect and the security review (not PO decisions):

- AT-1: audit-before-send (FR-025, fail closed) means a provider failure after the audit row leaves a `requested` row for an email that was not sent. Options: keep the row and mark the failure in a later row, or record the request only as accepted by the provider and accept that the send and the audit are not in one transaction. Decide with the security review.
- AT-2: the timing parity in FR-018 needs the same work on every path, including a non-sending path for unknown and non-staff addresses. The tolerance and the test method are decided here and reviewed by security.
- AT-3: whether a self-service request supersedes an earlier unused self-service link for the same account (ND-F4-3 replacement rule) is verified against the local provider in SC-010. The manual-link state is not shared, since staff targets are denied for manual links (SK-004-06).

Constitution check for ND-F4-7:

| Principle | Status |
|---|---|
| I Isolation | Eligibility is decided on the server. The generic response reveals no workspace or membership. Foreign-workspace negatives are not applicable (staff reset is platform-scoped); the client-account negative (FR-016, S5) is tested. |
| III Least privilege | Staff only; clients get no email; the eligible roles are a PO decision (PDN-F4-7-02). |
| IV Scope | PO S35-PO-1 decision; BRD line 130 and PRD-02 (docs/01 row) are the sources; D-07 sequencing is closed by the PO decision. Nothing outside the PO words is added without a PDN. |
| VII Privacy | Tokens stay with the provider (hashed); no LIFTER-side secret; no email or token in logs or audit; audit of sensitive actions (FR-025). |
| VIII UI | `/login` extension on Design System components; AR/EN; copy BLOCKED until approved (FR-027). |
| IX Reliability | Rate limit in one advisory-locked transaction; audit before send, fail closed; completion intent appended before any password change, closing row after, reconciliation for open intents (FR-025, S35-R5). |
| Platform | No hosted change; local stack only for tests. |
| Workflow | Sol Medium critique PENDING; security review required; implementation waits for Analyze and PO approval. |

## Complexity Tracking

| Item | Why | Simpler alternative rejected because |
|---|---|---|
| Deprecated `middleware.ts` instead of `proxy.ts` | OpenNext supports only edge middleware | `proxy.ts` is Node-only, which OpenNext calls experimental and unsupported |
| Two RPCs (authorize, record) around `generateLink` | No orphaned audit, no unauthorized invalidation of a client's link | A single post-generation RPC lets unauthorized callers burn links and probe whether accounts exist |
