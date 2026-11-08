# Contract: Auth surface (P0-F4)

## Routes

| Route | Access | Purpose |
|---|---|---|
| `/login` | public | Email + password form and staff reset request. `?next=` is accepted only if `safeReturnTo` keeps it. |
| `/auth/recovery?token_hash&type=recovery` | public | GET/HEAD render "Continue" only. POST action verifies the link, then the set-password form appears. Staff self-service success ends the recovery session and redirects to normal login; client manual-link success keeps the existing FR-013 signed-in outcome. |
| `/` | session | Signed-in landing (placeholder until P1/P4 dashboards) with a sign-out control. |
| `/api/health` | public | unchanged |
| `(dev)` showcase routes | unchanged env gate (`LIFTER_SHOWCASE`) | public only when the gate is enabled; otherwise 404 as today |
| everything else | session | Anonymous → 303/307 to `/login?next=<path>`. |

## Server actions (all return `{ status }` discriminated results; no provider error text)

| Action | Input | Results |
|---|---|---|
| `signIn` | `email`, `password`, `next?` | `ok` (redirect to `safeReturnTo(next)` or `/`) · `invalid_credentials` (same for unknown email) · `unavailable` |
| `signOut` | — | redirect `/login` (scope: current browser only, `signOut({ scope: 'local' })`) |
| `requestStaffReset` | `email` | Every syntactically valid request reaches the authoritative send hook for policy accounting. Same generic confirmation where the hook response is mappable; no email for refused requests; no account, role, rate-limit or delivery details |
| `verifyRecovery` | `token_hash` | `ok` (session set, show password form) · `invalid_link` |
| `setNewPassword` | `password`, `confirm` | Staff self-service `ok` (end recovery session; redirect `/login`, no auto-login); client manual-link keeps FR-013 signed-in outcome; `weak_password` · `mismatch` · `invalid_link` (no recovery session) |
| `generateRecoveryLink` | `targetUserId` | `ok` + `{ link }` (only here, once) · `denied` · `rate_limited` · `unavailable` |

## Library (server-only)

- `getActor(): Promise<Actor | null>`, `requireActor(): Promise<Actor>` (redirects to `/login`).
- `actorFromRows(userId, staffRow | null, membershipRows): Actor`, a pure function. Only active memberships count. With no staff row, `role: null`.
- `safeReturnTo(value: unknown): string`, a pure function. It accepts only a single leading `/` path. It rejects `//`, `/\`, schemes, control characters and encoded variants of those, and anything over 512 characters. The fallback is `/`.
- `buildRecoveryUrl(origin, tokenHash): string`, a pure function. `origin` must be an absolute `https:` URL, or loopback `http:` for local.
- `createAdminClient()`: `server-only`, HTTPS guard, `redirect: 'manual'`, no session persistence.

## Environment (server only, never `NEXT_PUBLIC_`)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ORIGIN`. If any is missing, the middleware treats every request as anonymous and actions return `unavailable` (fail closed).

## UI component

`components/auth/RecoveryLinkDialog.tsx` is a client component that receives a server action prop. It confirms the action, shows the link once in a read-only field with a Copy button, and offers no share action (ND-F4-2). Closing the dialog clears the link from state. AR/EN, keyboard, labeled. It's mounted on the client profile in P1; in F4 it renders in the showcase with a stub action only.

## Staff recovery (FR-016 to FR-030; specified, not implemented)

- `requestStaffReset` calls the public Auth recovery route; the local send hook is the single authoritative place for accounting, eligibility, delivery permission, audit and sending. The app must not consume a second copy of the counters.
- Auth hook invocations are authenticated and payload-validated; only the recovery action is processed. Identity and destination are checked against provider/database state. Secrets are protected, duplicate side effects are prevented, and token-bearing payloads are never logged.
- Recovery intents are bound to both the staff user id and initiating recovery session id. `begin`, `complete` and `abort` require that same pair. A competing session cannot consume the intent. The local Auth trigger context must prove the session binding before implementation; an account-level open intent is insufficient.
- Known-success completion ends the recovery session and redirects to `/login`, including closing-audit failure; reconciliation is mandatory. Other pre-existing account sessions are revoked as specified by FR-025(b), FR-030 control C and PDN-F4-7-07.
- Local config only under S38-PO-3. Hosted Auth, SMTP, Resend and hosted send-path design are deferred until domain acquisition and the FR-020 approval gate.
- Exact new AR/EN recovery copy is [copy-proposal.md](copy-proposal.md), COPY-F4-R6 PENDING-PO; the run-dir copy is preserved for evidence. Approved reuse strings are identified in both copies.
