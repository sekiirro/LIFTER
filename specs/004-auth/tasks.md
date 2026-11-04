# Tasks: Authentication & Manual Recovery Links (P0-F4)

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/auth-surface.md](contracts/auth-surface.md). The plan's Design section and data-model are binding.

**Coder rules**:

- Never edit committed migrations.
- Add only the dependencies listed in T001.
- No `console.*` in auth code. Never log or return provider error text, links, tokens, passwords or emails.
- Don't touch `LIFTER_Claude_Files/`, `DESIGN.md`, `docs/`, `.specify/` or `specs/` (except checking tasks off).
- Codex sandbox: run vitest with `--configLoader native --pool threads`. Docker, integration and e2e runs are done by the reviewer.

Tests are required (Constitution: negative tests for every new endpoint and table).

## Phase 1: Setup

- [x] T001 `package.json`/`package-lock.json`: move `@supabase/supabase-js` `2.118.0` from devDependencies to dependencies; add exact `@supabase/ssr` `0.12.7` and `server-only` `0.0.1` to dependencies (`npm install --save-exact`).
- [x] T002 [P] `.env.example`: add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ORIGIN` with comments ("server only, never NEXT_PUBLIC_"). No real values.

## Phase 2: Foundational (blocks all stories)

- [x] T003 Migration `supabase/migrations/20261028120000_auth_recovery_links.sql`, exactly per [data-model.md](data-model.md):
  - (a) `create or replace app_private.role_has_capability` from its current body, adding `when cap = 'generate_recovery_link' then r in ('platform_owner','workspace_owner')`. Keep the ownership, revoke and grant statements as in F3.
  - (b) Table `public.recovery_link_issuances` with the columns, FKs (`target_user_id` → `auth.users(id)` **on delete restrict**), `unique (workspace_id, id)` and the two indexes. RLS enabled and forced. `revoke all … from public, anon, authenticated, service_role`. No policies.
  - (c) Immutability: BEFORE UPDATE row trigger raising `23514`; BEFORE DELETE row and BEFORE TRUNCATE statement triggers using `app_private.forbid_delete()`.
  - (d) `create or replace app_private.audit_row_change()`, copied from its **latest** definition in `20261027160100_audit_jobs.sql`, adding the `recovery_link_issuances` INSERT branch → `recovery_link.generated`, details `{target_user_id}`. Any other op returns `new` without an event. AFTER INSERT trigger `audit_recovery_link_issuances`.
  - (e) Functions `app_private.recovery_target_workspace` (returns `null::uuid`, comment `ND-F4-5: P1 replaces this`), `app_private.recovery_link_limits` (20, 3, `interval '1 hour'`, comment `ND-F4-4 placeholders`), `app_private.recovery_link_guard`, `public.recovery_link_authorize`, `public.recovery_link_record`. Use the error codes and messages `not_permitted` (42501) and `rate_limited` (P0001). Every check in the guard raises the same `not_permitted`. `recovery_link_record` takes `pg_advisory_xact_lock(hashtextextended(target::text, 0))` and `pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0))` before the guard and the insert. All functions: `set search_path = ''`, owner postgres, execute revoked from public and anon. The two public RPCs are granted to authenticated only.
  - SQL comments cite FR numbers.
- [x] T004 [P] `lib/auth/capabilities.ts`: add `'generate_recovery_link'` to `CAPABILITIES` and to the `workspace_owner` list (not trainer, not sales). Update `tests/unit/authorize.test.ts` expectations.
- [x] T005 [P] `lib/supabase/env.ts`: `readServerEnv()` returns `{ url, anonKey, serviceRoleKey, appOrigin } | null`. It returns null if any value is missing. It validates `url` and `appOrigin` as `https:`, or `http:` on loopback hosts only (port the guard from `workers/cron/src/rpc.ts`).
- [x] T006 [P] `lib/supabase/server.ts`: `createSessionClient()` uses `@supabase/ssr` `createServerClient` with `next/headers` cookies `getAll`/`setAll`. `setAll` is wrapped in try/catch, because Server Components can't set cookies and middleware refreshes. `lib/supabase/admin.ts`: first line `import 'server-only';`, then `createAdminClient()` with the service-role key, `auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }` and a `global.fetch` wrapper forcing `redirect: 'manual'`.
- [x] T007 [P] `lib/auth/results.ts`: the result union types from the contract (`ok | denied | rate_limited | unavailable | invalid_link | invalid_credentials | weak_password | mismatch`) and `mapRpcError(error): 'denied' | 'rate_limited' | 'unavailable'`. The mapping uses the error code and message (`42501` with `not_permitted` → denied; `P0001` with `rate_limited` → rate_limited; everything else → unavailable).
- [x] T008 [P] `lib/i18n/messages/ar.ts` and `en.ts`: `auth.*` keys for every label, error and state in the contract:
  - sign-in title, email, password, submit, the generic invalid-credentials message, unavailable
  - recovery continue, new password, confirm, set password, invalid-link ("This link is invalid or expired. Ask your coach or workspace for a new link."), weak, mismatch
  - signed-in landing, sign out
  - recovery dialog title, confirm text, copy, copied, close, a "shown once" notice, denied, rate-limited

  Write the Arabic first, natural rather than literal.

## Phase 3: US2 — Server-verified identity (P1) 🎯 foundation for US1/US3

Independent test: unit tests on the pure actor functions, plus the integration revocation test.

- [x] T009 [P] [US2] `lib/auth/actor.ts`: pure `actorFromRows(userId, staff: {role} | null, memberships: {workspace_id, revoked_at}[]): Actor`, which counts only rows with `revoked_at === null` and gives `role: null` when there is no staff row. `getActor()` builds a session client and calls `auth.getUser()`; on error or no user it returns null. It then selects `staff_profiles.role` for that user and `workspace_memberships(workspace_id, revoked_at)` where `user_id = user.id`. It never reads role or workspace from headers, query or form. `requireActor()` redirects to `/login` when there's no actor.
- [x] T010 [P] [US2] `tests/unit/actor.test.ts`: covers revoked memberships excluded, no staff row → `role: null` and `authorize()` false for every capability, and duplicate rows deduplicated.
- [x] T011 [US2] `tests/integration/auth-recovery.test.ts`, section "actor":
  - Using `twoWorkspaceFixture()`, the trainerA client reads its own staff role and memberships through the same queries as `getActor` (export a `loadActorRows(client, userId)` helper from `lib/auth/actor.ts`, without `next/headers` imports, to share them).
  - After the PO revokes the membership, A is no longer in the scope.
  - An auth-only user, with no staff profile, gets `role: null`.

## Phase 4: US1 — Sign in / sign out (P1)

Independent test: e2e plus a manual local sign-in.

- [x] T012 [P] [US1] `lib/auth/redirect.ts`: pure `safeReturnTo(value: unknown): string` per contract. `tests/unit/redirect.test.ts` covers `/`, `/a?b=1`, `//evil`, `/\evil`, `https://evil`, `/%2F%2Fevil`, `javascript:`, control characters, non-strings, and over 512 characters → `/` where unsafe.
- [x] T013 [US1] `middleware.ts` at the repo root (edge runtime; no `runtime` export, which defaults to edge for `middleware.ts`):
  - Refresh the session via `@supabase/ssr` `createServerClient` on request and response cookies, and call `auth.getUser()`.
  - Public allow-list: `/login`, `/auth/recovery`, `/api/health`, `/_next/*`, static file extensions, and the existing `(dev)` showcase/print paths. Those keep their own `LIFTER_SHOWCASE` gate, so the middleware just lets them through.
  - Anonymous requests to any other path → redirect to `/login?next=<encoded path+query>`.
  - Missing env (`readServerEnv()` null) → treat as anonymous, without throwing.
  - `config.matcher` excludes `_next/static`, `_next/image` and `favicon.ico`.
- [x] T014 [US1] `app/login/page.tsx`, `app/login/actions.ts` (`'use server'` `signIn`) and `app/login/login.module.css`. Build the form from `components/ui/Field`, `Button` and `Alert`, using the locale/theme cookies like `app/layout.tsx`.
  - `signIn` calls `signInWithPassword`. Any auth error → `invalid_credentials`, and a network or env failure → `unavailable`. Success → `redirect(safeReturnTo(next))`.
  - Use `useActionState` for pending/error states. Include the language and theme switchers. `autocomplete="email"` / `"current-password"`.
- [x] T015 [US1] `app/(app)/page.tsx`: `requireActor()`, then a minimal signed-in landing (translated title and a sign-out button). `app/(app)/actions.ts`: `signOut` → `auth.signOut({ scope: 'local' })` → `redirect('/login')`.
- [x] T016 [P] [US1] `tests/e2e/auth.spec.ts` (no database in CI):
  - `/login` renders in AR (`dir=rtl`) and EN, and axe is clean in both.
  - Anonymous `/` → URL `/login?next=%2F`.
  - `/login?next=//evil.example` keeps the user on-site: assert the form's hidden `next` is sanitized, or that `safeReturnTo` is applied.
  - The existing showcase and health e2e still pass.

## Phase 5: US3 — Manual recovery links (P1)

Independent test: the integration matrix plus the link lifecycle.

- [x] T017 [P] [US3] `lib/auth/recovery-link.ts` (`import 'server-only'`):
  - Pure `buildRecoveryUrl(origin, tokenHash)`: path `/auth/recovery`, params `token_hash` and `type=recovery`, URL-encoded. It throws on a non-https, non-loopback origin.
  - `generateRecoveryLink(targetUserId)`, which follows plan § Design steps 1–6 exactly. It validates `targetUserId` as a UUID first (otherwise `denied`), and it never includes the email or token in any thrown error.
  - `app/auth/recovery/generate-action.ts`: the `'use server'` wrapper `generateRecoveryLinkAction(targetUserId)`.
- [x] T018 [US3] `app/auth/recovery/page.tsx` + `actions.ts` + `recovery.module.css`:
  - GET with `token_hash` → a "Continue" form posting the hash to `verifyRecovery`. No verification on GET.
  - `verifyRecovery` → `verifyOtp({ type: 'recovery', token_hash })`. An error gives `invalid_link`; on success, render the set-password form.
  - `setNewPassword` requires the same session (a `getUser()` user), checks that the password and confirmation match, and calls `updateUser({ password })`. A provider weak-password error gives `weak_password`; success → `redirect('/')`.
  - With no `token_hash` → the invalid-link state.
  - `autocomplete="new-password"`, AR/EN, axe.
- [x] T019 [P] [US3] `components/auth/RecoveryLinkDialog.tsx` (+ `.module.css`), a client component with props `{ targetUserId, action }`:
  - It reuses `ConfirmDialog`. On ok it shows the link in a read-only labeled field with a Copy button (`navigator.clipboard.writeText`) and the "shown once" notice.
  - Closing it clears the state. No share button (ND-F4-2).
  - Errors map to the translated denied, rate-limited and unavailable messages.
  - Add a showcase demo in `app/(dev)/showcase/ComponentDemos.tsx` with a **stub** action returning a fake `https://example.test/auth/recovery?token_hash=demo&type=recovery`.
- [x] T020 [US3] `tests/integration/auth-recovery.test.ts`, section "recovery".
  - **beforeAll** (via `sql()` as postgres):
    - create `create table if not exists public.test_recovery_targets(user_id uuid primary key, workspace_id uuid not null)`
    - `create or replace app_private.recovery_target_workspace` to select from it
  - **afterAll**: restore the original `select null::uuid` body and drop the table. Wrap restoration in `finally`.
  - **Fixtures**: client users `cA` and `cB`, created as auth-only users through admin `createUser`, and registered in workspaces A and B.
  - **Before the seam** (first test): the PO calling `recovery_link_authorize(cA)` → `not_permitted`.
  - **Matrix** for `recovery_link_authorize` + `recovery_link_record` via `.rpc()` per identity:
    - PO: A ✔, B ✔
    - woA: A ✔, B ✘
    - trainerA: A ✘
    - salesA: A ✘
    - anon: ✘
    - every ✘ has an identical error message
  - **Target checks**:
    - an unknown UUID → `not_permitted`
    - a staff target (woA's id, even if inserted into the test table) → `not_permitted`
    - self target → `not_permitted`
  - **Audit**: each successful record produces exactly one `audit_events` row `recovery_link.generated` with the actor = caller, workspace, and `details = {target_user_id}`. No `@` appears in the details.
  - **Rate limit**: the 4th record for the same target within the hour → `rate_limited`, and no 4th row or event. Use the PO for 3 and then woA, since the limit is per target.
  - **Immutability**: through the API, insert, update and delete on `recovery_link_issuances` affect 0 rows or error. Via `sql()` with `set local role service_role`, update and delete raise.
  - **Lifecycle** (admin `generateLink` + `verifyOtp` on an anon client):
    - the first verify succeeds and a second verify of the same hash fails
    - generate twice → the first hash fails and the second succeeds
    - after verify, `updateUser({password})` succeeds and the new password signs in
- [x] T021 [P] [US3] `tests/unit/recovery-link.test.ts`. Mock the session and admin client factories with `vi.mock` and check:
  - **Order**: `generateLink` isn't called when authorize is denied or rate-limited, and the link isn't returned when record fails. `authorize()` false → denied without `generateLink`.
  - **Origin**: `buildRecoveryUrl` rejects an `http://evil` origin.
  - **No leaks**: with `console.*` spied on every path, none receives a value containing the token or email, and results never contain provider messages.
- [x] T022 [US3] Update `tests/integration/matrix-parity.test.ts` if it enumerates capabilities, so `generate_recovery_link` parity is checked. In `tests/integration/rls-catalog.test.ts`, check:
  - `recovery_link_issuances` has RLS enabled and forced, and no privileges for anon, authenticated or service_role
  - its triggers exist
  - the 5 new functions are `prosecdef` (except the limits function) with `search_path=""`
  - `anon` can't execute the two public RPCs

## Phase 6: US4 — Public surface (P2)

- [x] T023 [US4] Extend `tests/e2e/auth.spec.ts`: for `/`, `/some/unknown/path` and `/auth/recovery` without a token, anonymous requests behave per the contract. The first two redirect to `/login`, and the last renders the invalid-link state. `/api/health` stays 200.

## Phase 7: Polish & cross-cutting

- [x] T024 [P] `scripts/check-client-secrets.mjs`: scans every file under `.next/static` and `.open-next/assets` (whichever exist; error if neither) for `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `SERVICE_ROLE` and the regex `eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}`. It prints only file paths and pattern names, never matched text, and exits 1 on any finding. Add a `check:secrets` npm script and a CI step after `npm run build:edge` in `.github/workflows/ci.yml`.
- [x] T025 [P] `eslint.config.mjs`: `no-console: error` for `lib/auth/**`, `lib/supabase/**`, `app/login/**`, `app/auth/**`, `app/(app)/**` and `middleware.ts`. Also `no-restricted-imports` of `@supabase/*` and `lib/supabase/admin` in any file containing `'use client'`. If file-content targeting isn't possible, restrict for `components/**` instead.
- [x] T026 [P] README "Authentication" section covering:
  - env vars (server only)
  - the local sign-in flow
  - how recovery links work (show once, never logged, audited)
  - the approved ND-F4-3 expiry of 60 minutes in all environments and independent 15-minute recovery session; S31-PO-3 limit values of 10 per issuer per rolling hour and 3 per client per rolling 24 hours across issuers; identify implementation/configuration verification gaps
  - that `recovery_target_workspace` is replaced in P1
  - that generation is denied for every target until then
- [x] T027 Run locally (Codex sandbox flags): `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`. All must be green before handing back.

## Phase 8: Review (Claude)

- [x] T028 Re-run all gates. Then `npm run build:edge` and `npm run check:secrets`.
- [x] T029 Local Docker integration suite. Negative checks per [quickstart.md](quickstart.md) §6. e2e.
- [ ] T030 Docs (Claude): register approved D-19 as the scope authority and reconcile traceability AT-AUTH-01. S31-PO-2 directs closure; PO approval is confirmed, while current-head CI/CodeRabbit acceptance evidence remains pending. FR-006, FR-010, FR-012.
- [ ] T031 Verify the configured recovery-link provider expiry in an approved safe environment against the 60-minute all-environment PO decision; record provider/configuration evidence. No implementation change is implied. FR-012; SC-005.
- [ ] T032 Implement the approved all-workspace-Trainer recovery capability in a new Spec Kit cycle with RLS, tests, and security review. FR-006; SC-002.
- [ ] T033 Implement the approved per-issuer and per-client rolling limits in a new Spec Kit cycle, including concurrency and configuration evidence. FR-010; SC-004.

## Dependencies & order

- T001 → everything. T003 → T011, T020, T022. T005/T006 → T009, T013, T014, T017, T018. T007 → T014, T017, T018. T008 → UI tasks.
- US2 (T009–T011) before US1 (T013–T016), because the middleware and landing use the actor. US3 needs T003, T006 and T009. US4 needs T013.
- Parallel batches: {T002, T004, T005, T006, T007, T008}, then {T009, T010, T012}, then {T017, T019, T021, T024, T025, T026}.

## Implementation strategy

One Codex pass for Phases 1–7 (bounded, single worktree), then Claude's review in Phase 8. MVP = US2 + US1 (sign-in with a verified actor). US3 completes the owner's recovery requirement, which stays closed for clients until P1 (ND-F4-5).
