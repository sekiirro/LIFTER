# Contract: Auth surface (P0-F4)

## Routes

| Route | Access | Purpose |
|---|---|---|
| `/login` | public | Email + password form. `?next=` is accepted only if `safeReturnTo` keeps it. |
| `/auth/recovery?token_hash&type=recovery` | public | GET renders "Continue" only. POST action verifies the link, then the set-password form appears. |
| `/` | session | Signed-in landing (placeholder until P1/P4 dashboards) with a sign-out control. |
| `/api/health` | public | unchanged |
| `(dev)` showcase routes | unchanged env gate (`LIFTER_SHOWCASE`) | public only when the gate is enabled; otherwise 404 as today |
| everything else | session | Anonymous → 303/307 to `/login?next=<path>`. |

## Server actions (all return `{ status }` discriminated results; no provider error text)

| Action | Input | Results |
|---|---|---|
| `signIn` | `email`, `password`, `next?` | `ok` (redirect to `safeReturnTo(next)` or `/`) · `invalid_credentials` (same for unknown email) · `unavailable` |
| `signOut` | — | redirect `/login` (scope: current browser only, `signOut({ scope: 'local' })`) |
| `verifyRecovery` | `token_hash` | `ok` (session set, show password form) · `invalid_link` |
| `setNewPassword` | `password`, `confirm` | `ok` (redirect `/`) · `weak_password` · `mismatch` · `invalid_link` (no recovery session) |
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
