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
| IV Scope | PO manual reset links: BRD lines 40/104/130. WO/Trainer extension: owner decision 2026-10-27, to be registered as D-19 (PO approval in this PR). Self-service email reset is sequenced, not removed (ND-F4-7, D-07). No 2FA or device-management screen (PRD-12). ✅ |
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

ND-F4-1..7, as listed in [spec.md](spec.md#needs-decision-owner-sub-decisions-not-invented-here). The interim behavior is deny or minimal in every case. ND-F4-3 (expiry) and ND-F4-4 (limits) must be decided before production.

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

## Complexity Tracking

| Item | Why | Simpler alternative rejected because |
|---|---|---|
| Deprecated `middleware.ts` instead of `proxy.ts` | OpenNext supports only edge middleware | `proxy.ts` is Node-only, which OpenNext calls experimental and unsupported |
| Two RPCs (authorize, record) around `generateLink` | No orphaned audit, no unauthorized invalidation of a client's link | A single post-generation RPC lets unauthorized callers burn links and probe whether accounts exist |
