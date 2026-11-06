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
  - the ND-F4 placeholders: expiry = provider OTP expiry, set per environment; the rate-limit function
  - that `recovery_target_workspace` is replaced in P1
  - that generation is denied for every target until then
- [x] T027 Run locally (Codex sandbox flags): `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`. All must be green before handing back.

## Phase 8: Review (Claude)

- [x] T028 Re-run all gates. Then `npm run build:edge` and `npm run check:secrets`.
- [x] T029 Local Docker integration suite. Negative checks per [quickstart.md](quickstart.md) §6. e2e.
- [ ] T030 Docs (Claude) (FR: FR-006, FR-010, FR-012): D-19 is registered in `docs/04-changes-and-questions.md` and approved by the PO (S31-PO-2 SK-004-01); answered ND-F4-4/-6 recorded in spec Clarifications; traceability AT-AUTH-01 in `traceability.md`. Remaining before ticking: PR merged with CI and CodeRabbit gates passed (not satisfiable by the documentation change alone).
- [ ] T031 (FR: FR-010) Not implemented; Spec Kit cycle required. Align `app_private.recovery_link_limits()` and its tests with the decided limits (S31-PO-3 SK-004-04): 10 links per issuing staff account per rolling hour, and 3 per client per rolling 24 hours across all issuers. Replaces the 20 / 3 / 1 hour placeholders (T003(e), data-model.md, research.md); needs counter-semantics, rolling-window and concurrency tests, and a new forward migration.
- [ ] T032 (FR: FR-006) Not implemented; Spec Kit cycle required. Allow all Trainers of the client's workspace to generate client recovery links (S31-PO-2 SK-004-02, "All workspace Trainers"): permission-matrix change in both walls (app layer and database), RLS, executed mutation tests (allowed in own workspace, denied in other workspaces and for staff targets), a new forward migration and security review. Until then Trainers stay denied. SK-004-03 ("Copy only") needs no task: `components/auth/RecoveryLinkDialog.tsx:40` already copies only and no share action exists.

## Phase 9: ND-F4-7 staff self-service email reset (S35-PO-1; specified, NOT implemented)

Source: spec.md FR-016 to FR-030, SC-008 to SC-015, User Story 5, Security Notes, PDN-F4-7-01 to PDN-F4-7-13. Rules: tests are written first (RED) and must fail before the matching implementation task; local Supabase and local Inbucket only; no hosted Auth or SMTP change (T047, gated on separate PO approval); no task is ticked until its tests executed and passed on the current head (traceability.md).

- [ ] T033 [GATE] (FR-020, FR-027, FR-030) Before any implementation: PO answers PDN-F4-7-14 (public `/recover` mechanism; CONFLICT with S35-PO-3 if option B) and PDN-F4-7-15 (migration-installed guard on `auth.users`; CONFLICT check); PDN-F4-7-02 (eligible staff roles) and PDN-F4-7-01 (permitted list), PDN-F4-7-03 and PDN-F4-7-04 (request limits) are answered; PDN-F4-7-12 and PDN-F4-7-13 are answered by S36-PO-2 (recorded in spec.md; the user-visible sub-question of PDN-F4-7-12 awaits PO confirmation); PO approves all copy still open under PDN-F4-7-06 (FR-029 closes only two states); the independent critique is recorded as PENDING (Sonnet 5.5 authorized by S36-PO-2; the constitution's Sol Medium requirement conflicts and is reported to the PO; implementation blocker); feasibility gates G1 to G5 (plan.md) are scheduled; Analyze re-run after those answers. Documentation only.
- [ ] T034 [RED] (FR-016) `tests/unit/staff-reset.test.ts`: pure eligibility over fixture identities (PO, WO, Trainer, Sales, client, unknown). Role rows are blocked by PDN-F4-7-02. Client and unknown rows are not blocked.
- [ ] T035 [RED] (FR-018, FR-028) `tests/unit/staff-reset.test.ts`: the response builder returns the identical object for every branch (sent, not eligible, rate-limited, not permitted, provider error). Provider text such as "Email address not authorized" never appears in the result.
- [ ] T036 [RED] (FR-023, FR-028) `tests/unit/staff-reset.test.ts`: `redirectTo` is built only from `APP_ORIGIN` and `/auth/recovery`. `next`, query and header values are ignored. A non-https non-loopback origin is refused.
- [ ] T037 [RED] (FR-022, FR-011, FR-028) `tests/unit/auth-logs.test.ts` extended: no `console.*` output contains an email, token or link on any staff-reset path. The `/auth/recovery` response carries `Referrer-Policy: no-referrer` (set by `next.config.ts`, T045).
- [ ] T037a [RED] (FR-022, FR-028, S35-R5 T2) `tests/integration/auth-recovery.test.ts`, section "staff-reset-prefetch": a GET and a HEAD to the reset URL with a valid `token_hash`, as a link scanner sends them, do not call `verifyOtp` (spy), create no session, and leave the token usable; a later POST from Continue verifies it once and a second POST fails. Also asserts that the reset email link is `/auth/recovery` with `token_hash` and `type=recovery`, not the provider verification URL. Local stack and Inbucket only. Copy (PDN-F4-7-06) is not asserted.
- [ ] T038 [RED] (FR-024, SC-009) `tests/integration/auth-recovery.test.ts`, section "staff-reset-rate": the first five per-account requests in a rolling hour pass the account limit, and the sixth and later requests are blocked when other limits do not intervene; the PO-decided global cap applies to known, unknown and non-staff addresses alike. A refused request makes no provider call (spy). PDN-F4-7-03 sets the global cap; PDN-F4-7-04 sets keying.
- [ ] T038a [RED] (FR-019, FR-028; review nitpick on tasks.md:168) `tests/integration/auth-recovery.test.ts`, section "staff-reset-permitted": an eligible staff identity outside the permitted-test list, requesting through the app route, causes no provider call and no email, and receives the generic response. Blocked by PDN-F4-7-01 (list) for its implementation, not for writing the test.
- [ ] T039 [RED] (FR-025, SC-004, S35-R5 T1) `tests/integration/auth-recovery.test.ts`, section "staff-reset-audit": an accepted request writes exactly one `staff_password_reset.requested` row with ids only; audit of a refused request follows PDN-F4-7-05 (undecided, no default encoded); an injected `requested` append failure sends no email (fail closed). Completion for a staff recovery session: `completion_started` is appended before `updateUser` (order spy); an injected `completion_started` failure leaves the password unchanged and `updateUser` uncalled; a successful set writes exactly one `completed` referencing the intent id; an injected failure of the `completed` append after `updateUser` leaves the intent open, and `staff_password_reset_reconcile()` then appends exactly one `completion_reconciled` for it and none for any intent that has a closing row; an unchanged-password `updateUser` error writes `completion_aborted`. No audit row contains a password, email, token or link.
- [ ] T040 [RED] (FR-021, SC-006, SC-010) `tests/integration/auth-recovery.test.ts`, section "staff-reset-link": a second use fails; a self-service link fails after 60 minutes (real expiry: `auth.users.recovery_sent_at` backdated past 60 minutes, then verified, the same technique as the merged F4 test "rejects a link verified 61 minutes after it was issued"); a newer self-service reset supersedes the earlier unused link (AT-3). `otp_expiry = 3600` in `supabase/config.toml` is a supporting check only, not the expiry test. If the provider does not enforce supersession, the test fails and the gap is escalated, not worked around.
- [ ] T041 [RED] (FR-016, FR-017, FR-018, FR-019, SC-008, SC-009) `tests/e2e/auth.spec.ts`: the `/login` request form renders in AR and EN with axe clean; a permitted test staff address receives one email in Inbucket; unknown, client and non-permitted addresses produce the same confirmation and no email. For the permitted staff address the flow continues: open the link from Inbucket, Continue, set a new password, reach the signed-in area, and confirm the old password no longer works. No time target is asserted (SC-013 target is PDN-F4-7-09, open). Local stack only.
- [ ] T042 [RED] (FR-027) `tests/unit/i18n-keys.test.ts` (or the existing i18n test): every new `auth.*` key exists in both `ar.ts` and `en.ts`. Tests check keys plus exact byte equality for the two states in FR-029; all other string comparisons remain blocked by PDN-F4-7-06.
- [ ] T042b [RED] (FR-029, SC-014): localization and application-output tests compare invalid/expired-link and generic reset-confirmation strings in AR and EN byte-for-byte against FR-029. Assert both catalog values and rendered output; comparison includes the shadda, Arabic comma and ASCII apostrophe. No other F4 copy is asserted until approved.
- [ ] T049a [RED] (FR-030 control B, FR-025 (b), SC-015) `tests/integration/auth-recovery.test.ts`, section "staff-reset-guard" (local Auth only): a direct `updateUser({ password })` with a staff recovery session and no open intent is refused, and the stored password does not change; a client manual-link completion still succeeds (client rows unaffected); staff fixtures set their password when created, because a later admin update for a staff identity is refused by control B.
- [ ] T049b [RED] (FR-030 controls A and D, FR-025 (a), SC-015) section "staff-reset-direct": a direct anon-key `/recover` for an ineligible identity sends nothing (control A on the route the selected mechanism enables, PDN-F4-7-14); `begin` with a session older than 900 s is refused; `begin` with a session that carries no recovery authentication is refused (control D; method check per G4); a second `begin` while an `open` intent younger than 900 s exists is refused.
- [ ] T049c [RED] (FR-024, FR-030 control A, SC-015; review nitpick on tasks.md:168) section "staff-reset-public-route": if the selected boundary enables public `/recover`, the per-account five-request rolling-hour limit is tested through that route directly and through mixed direct and app-route requests, with other limits not intervening: the first five pass and the sixth and later requests are refused; the global cap applies to direct requests; and a direct request for an eligible staff address outside the permitted-test list sends no email (app-side delivery permission). If the boundary denies public `/recover`, the test asserts that denial with no delivery, and the five-request test runs through the controlled app route only.
- [ ] T049d [RED] (FR-025 (c), (d), (e), (f), (g), SC-004, SC-012) section "staff-reset-intent": `complete` after a successful change writes exactly one `completed`; `abort` after an unchanged error writes exactly one `completion_aborted`; a second `complete` or `abort` changes no row and appends no event; `staff_password_reset_reconcile()` closes an `open` intent older than 900 s with `password_changed` as recorded, and a second run is a no-op; no closed intent changes; an injected `begin` insert failure leaves `updateUser` uncalled; an injected `complete` failure leaves the intent open and reconciliation closes it; no audit row contains a password, email, token or link.
- [ ] T049e [RED] (FR-030 control C, SC-015) section "staff-reset-sessions": after a permitted staff change, the other sessions' `auth.sessions` rows are deleted and their access tokens are refused by the local Auth API; the intent's own session stays usable; client session behaviour is unchanged. If local Auth still accepts a deleted session's token, the test stays RED and PDN-F4-7-16 is raised.
- [ ] T050a [IMPL] (FR-025 (a) to (g), FR-030 controls B, C and D; SC-015) After T033, PDN-F4-7-15 and feasibility gates G1 to G5 (plan.md) pass, and T049a, T049d and T049e are RED: one forward migration (unique version across all origin refs, scanned right before commit and push) for `app_private.staff_password_reset_intents`, the RPCs `public.staff_password_reset_begin`, `_complete` and `_abort` (authenticated only), the audit triggers for intent transitions, `app_private.staff_password_reset_reconcile()` and the `auth.users` guard trigger. Local stack only; no hosted Auth change. Acceptance: T049a, T049d and T049e pass after this task, the existing client manual-link tests still pass, and the migration's unique closing-event index is verified against `public.audit_events`. Blocked by T033, PDN-F4-7-15 and PDN-F4-7-02 (eligibility in `begin`).
- [ ] T050b [IMPL] (FR-030 control A, FR-024; SC-015) After PDN-F4-7-14 is decided and its feasibility spike passes, implement the selected local public-route control. Option A: a local ingress or proxy denies anon-key `/auth/v1/recover` and only the LIFTER server route reaches the recovery endpoint; the app enforces eligibility, the five-per-account limit, the global cap and request audit before the call. Option B (only with the PO's written waiver of the built-in-sender wording): a local send hook. Acceptance: T049b and T049c pass. Blocked by T033, PDN-F4-7-14, and by T049b and T049c being RED.
- [ ] T043 [IMPL] (FR-016, FR-017, FR-018) After T034 to T042, T042b, T038a and T049a to T049e are RED: `app/login/actions.ts` gains `requestStaffReset`; `app/login/page.tsx` gains the request form (`components/ui/Field`, `Button`, `Alert`); server-only eligibility; the generic response. Blocked by T033.
- [ ] T044 [IMPL] (FR-019, FR-023, FR-024, FR-025 request audit) One forward migration (unique version across all origin refs, scanned right before commit and push) for the rate-limit table and the `staff_password_reset.requested` audit, and the provider call with the server-built `redirectTo`. The completion intent functions and the guard move to T050a. Blocked by T033, PDN-F4-7-01, PDN-F4-7-03, PDN-F4-7-04 and PDN-F4-7-14 (control A: the send path cannot be released without it, per PDN-F4-7-13).
- [ ] T044a [IMPL] (FR-022, FR-027, S35-R5 T2) Local recovery email template (`supabase/config.toml` `[auth.email.template.recovery]`) that links to `/auth/recovery` with `token_hash` and `type=recovery` instead of the provider's `ConfirmationURL`, with PO-approved copy. Local stack only; the hosted template is under T047. Blocked by T033 and PDN-F4-7-06.
- [ ] T045 [IMPL] (FR-022, FR-025, FR-026) `next.config.ts` `headers()` gains a `/auth/recovery` entry with `Referrer-Policy: no-referrer`, the pattern already used for `/register/:token` (not set in the page component). `setNewPassword` for a staff recovery session calls `public.staff_password_reset_begin()` before `updateUser`, then `public.staff_password_reset_complete()` or `public.staff_password_reset_abort()` after it, per FR-025 (a) to (d). Blocked by T050a (guard and RPCs), PDN-F4-7-06 (copy, including the failure state) and T033. PDN-F4-7-12 is answered (S36-PO-2); its user-visible sub-question awaits PO confirmation. PDN-F4-7-07 is decided by S35-PO-3.
- [ ] T046 [DOC] (FR-020, SC-011) `docs/13-production-readiness.md` gets the SMTP rollout gate row; README "Authentication" section describes the self-service flow and its limits. No hosted configuration. Blocked by T033.
- [ ] T047 [GATE, OUT OF SCOPE] (FR-020, FR-023; PDN-F4-7-10, PDN-F4-7-11) Hosted Auth and SMTP configuration: redirect allow-list, `token_hash` email template, sender, provider rate limit, CAPTCHA, external SMTP. Requires separate explicit PO approval of an exact change set. Not performed in this cycle.
- [ ] T048 [REVIEW] (FR-028, FR-030) Security review of T043 to T045, T050a and T050b; the independent critique of the implementation design: Sonnet 5.5 authorized by S36-PO-2 (result recorded; the constitution's Sol Medium requirement conflicts and is reported to the PO); CodeRabbit review on the exact head; three executed green GitHub Actions `pull_request` runs on the exact final head, including validate, integration, storage and secret-scan jobs (reruns on that unchanged head may supply the three runs; feature-branch `push` events do not create separate runs). Verify the tested merge base: at least one of the three executed green `pull_request` runs must have tested the final head merged with the current `main`. Record the base SHA with the run ids, and re-verify it immediately before acceptance; if `main` moved, re-verify all gates (S36-R9). PO merge approval recorded against the head SHA.


## Dependencies & order

- T001 → everything. T003 → T011, T020, T022. T005/T006 → T009, T013, T014, T017, T018. T007 → T014, T017, T018. T008 → UI tasks.
- US2 (T009–T011) before US1 (T013–T016), because the middleware and landing use the actor. US3 needs T003, T006 and T009. US4 needs T013.
- Parallel batches: {T002, T004, T005, T006, T007, T008}, then {T009, T010, T012}, then {T017, T019, T021, T024, T025, T026}.

## Implementation strategy

One Codex pass for Phases 1–7 (bounded, single worktree), then Claude's review in Phase 8. MVP = US2 + US1 (sign-in with a verified actor). US3 completes the owner's recovery requirement, which stays closed for clients until P1 (ND-F4-5).
