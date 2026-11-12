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
- [ ] T030 Docs (Claude) (FR: FR-006, FR-010, FR-012): D-19 is registered in `docs/04-changes-and-questions.md` and approved by the PO (S31-PO-2 SK-004-01); answered ND-F4-4/-6 recorded in spec Clarifications; traceability AT-AUTH-01 in `traceability.md`. Remaining before ticking: PR merged with CI and CodeRabbit gates passed (not satisfiable by the documentation change alone).
- [ ] T031 (FR: FR-010) Not implemented; Spec Kit cycle required. Align `app_private.recovery_link_limits()` and its tests with the decided limits (S31-PO-3 SK-004-04): 10 links per issuing staff account per rolling hour, and 3 per client per rolling 24 hours across all issuers. Replaces the 20 / 3 / 1 hour placeholders (T003(e), data-model.md, research.md); needs counter-semantics, rolling-window and concurrency tests, and a new forward migration.
- [ ] T032 (FR: FR-006) Not implemented; Spec Kit cycle required. Allow all Trainers of the client's workspace to generate client recovery links (S31-PO-2 SK-004-02, "All workspace Trainers"): permission-matrix change in both walls (app layer and database), RLS, executed mutation tests (allowed in own workspace, denied in other workspaces and for staff targets), a new forward migration and security review. Until then Trainers stay denied. SK-004-03 ("Copy only") needs no task: `components/auth/RecoveryLinkDialog.tsx:40` already copies only and no share action exists.

## Phase 9: ND-F4-7 staff self-service email reset (S35-PO-1; specified, NOT implemented)

Source: spec.md FR-016 to FR-031, SC-008 to SC-016, User Story 5, Security Notes, and the round-6 PO decisions. Rules: tests are written first (RED) and must fail before matching implementation; local Supabase and Inbucket only; no hosted Auth or SMTP change; no task is ticked until its tests execute and pass on the current head (traceability.md). PDN-17 is closed by S38-PO-3; Resend and hosted send-path work are deferred until domain acquisition. PDN-F4-7-01, -02, -03, -05, -09 and -12 are answered in the S38 register. The AR/EN copy is approved in [copy-proposal.md](copy-proposal.md) by S39-PO-4 (English) and S39-PO-5 (Egyptian Arabic); COPY-F4-R6 is resolved. The five-key Arabic term switch is FR-031.

- [ ] T033 [GATE] (FR-020, FR-027, FR-030, FR-031) Spec Kit implementation-entry gate. Confirm PDN-F4-7-01, -02, -03, -05, -09 and -12 are answered in the S38 register; confirm COPY-F4-R6 copy is approved (English S39-PO-4, Arabic S39-PO-5) and no PENDING-PO copy remains; confirm Analyze is dated after spec/plan/tasks changes and has 0 open CRITICAL/HIGH; confirm critique disposition and local-only T050b under S38-PO-3. PDN-F4-7-14=B and -15=A are answered (S37-PO-8); -17 is closed (S38-PO-3); -04, -06, -10, -11 and -16 are pruned/deferred; -13 is answered by S36-PO-2. This gate does not require feasibility results before their RED tests or local spikes may run. Documentation only.
- [ ] T034 [RED] (FR-016) `tests/unit/staff-reset.test.ts`: pure eligibility over fixture identities (PO, WO, Trainer, Sales, client, unknown). Role rows are blocked by PDN-F4-7-02. Client and unknown rows are not blocked.
- [ ] T035 [RED] (FR-018, FR-028) `tests/unit/staff-reset.test.ts`: the app response builder returns one identical confirmation for eligible, unknown, client, non-permitted and policy-refused requests. Provider text never appears. Test provider policy refusal, caught audit failure, unavailable hook transport and timeout separately; assert identical generic status/body only where the response mapper executes, and record observed direct-Auth status/body for transport failures. Timing parity (FR-018; review nitpick on tasks.md:158): add a timing-parity acceptance check for the eligible, permitted provider path against the non-sending branches. The measurement method and tolerance are the architect's AT-2 decision and are not encoded here; the threshold stays unset until that decision, and FR-018 stays unverified until then.
- [ ] T036 [RED] (FR-023, FR-028) `tests/unit/staff-reset.test.ts`: `redirectTo` is built only from `APP_ORIGIN` and `/auth/recovery`. `next`, query and header values are ignored. A non-https non-loopback origin is refused.
- [ ] T037 [RED] (FR-022, FR-011, FR-028) `tests/unit/auth-logs.test.ts` extended: no `console.*` output contains an email, token or link on any staff-reset path. The `/auth/recovery` response carries `Referrer-Policy: no-referrer` (set by `next.config.ts`, T045).
- [ ] T037a [RED] (FR-022, FR-027, FR-028, S35-R5 T2) `tests/integration/auth-recovery.test.ts`, section "staff-reset-prefetch": a GET and a HEAD to the reset URL with a valid `token_hash`, as a link scanner sends them, do not call `verifyOtp` (spy), create no session, and leave the token usable; a later POST from Continue verifies it once and a second POST fails. Also asserts that the staff reset email link is `/auth/recovery` with `token_hash`, `type=recovery` and the display-only `flow=staff` marker, not the provider verification URL; client manual links retain the existing `auth.invalid_link` copy. Local stack and Inbucket only. Copy is approved in copy-proposal.md (S39-PO-4/S39-PO-5).
- [ ] T038 [RED] (FR-024, SC-009) `tests/integration/auth-recovery.test.ts`, section "staff-reset-rate": verify five per-account requests per rolling hour and the tenth global request per rolling hour boundary, counting unknown/non-staff traffic as required, with other limits isolated. App/direct mixed calls reach one authoritative hook counter and are never double-counted. Refused requests still reach the hook for policy accounting; assert no email and verify shared counters and generic response behavior.
- [ ] T038a [RED] (FR-019, FR-028; review nitpick on tasks.md:168) `tests/integration/auth-recovery.test.ts`, section "staff-reset-permitted": an eligible staff identity outside the permitted-test list, requesting through the app route, reaches the authoritative hook, causes no email, and receives the generic response. Blocked by the selected test-permission configuration for implementation, not for writing the test.
- [ ] T038b [RED] (FR-019, FR-028; review nitpick on tasks.md:162) `tests/integration/auth-recovery.test.ts`, section "staff-reset-delivery-cap": after two emails are sent within an hour, another request that passes the request limits sends no email, returns the generic confirmation, and exposes no delivery failure. Other limits must not mask this case. Distinct from T038 (request limits) and T041 (single delivery). Blocked by PDN-F4-7-01 for implementation, not for writing the test.
- [ ] T039 [RED] (FR-025, SC-004, S35-R5 T1) `tests/integration/auth-recovery.test.ts`, section "staff-reset-audit": an accepted request writes exactly one `staff_password_reset.requested` row with ids only; PDN-F4-7-05 = A means refused/unknown probes are not audited; an injected `requested` append failure sends no email (fail closed). Completion for a staff recovery session: `completion_started` is appended before `updateUser` (order spy); an injected `completion_started` failure leaves the password unchanged and `updateUser` uncalled; a successful set writes exactly one `completed` referencing the intent id; an injected failure of the `completed` append after `updateUser` leaves the intent open, and `staff_password_reset_reconcile()` then appends exactly one `completion_reconciled` for it and none for any intent that has a closing row; an unchanged-password `updateUser` error writes `completion_aborted`. No audit row contains a password, email, token or link.
- [ ] T040 [RED] (FR-021, SC-006, SC-010) `tests/integration/auth-recovery.test.ts`, section "staff-reset-link": a second use fails; a self-service link fails after 60 minutes (real expiry: `auth.users.recovery_sent_at` backdated past 60 minutes, then verified, the same technique as the merged F4 test "rejects a link verified 61 minutes after it was issued"); a newer self-service reset supersedes the earlier unused link (AT-3). `otp_expiry = 3600` in `supabase/config.toml` is a supporting check only, not the expiry test. If the provider does not enforce supersession, the test fails and the gap is escalated, not worked around.
- [ ] T041 [RED] (FR-016, FR-017, FR-018, FR-019, FR-026, SC-008, SC-009, SC-013) `tests/e2e/auth.spec.ts`: the `/login` request form renders in AR and EN with axe clean; a permitted test staff address receives one email in Inbucket; unknown, client and non-permitted addresses produce the same confirmation and no email. Measure from opening the recovery link through successful reset; assert the 2-minute local test target. After setting the new password, the recovery session ends and the user is sent to normal login without auto-login; confirm the old password fails and sign in successfully with the new password. Real-user UX target is 5 minutes from opening the link to successful reset. Local stack only. In CI this test depends on T041a, because the current `integration` job excludes Inbucket.
- [ ] T041a [CI, IMPL] (FR-019, FR-028; review round 7) Enable local mail capture for the CI `integration` job: stop excluding `inbucket` from the job's `supabase start` (or provide an equivalent local capture) so T041 can read the delivered message through the local API. Local-only; no hosted Auth/SMTP change. The workflow edit is scheduled with the F4 implementation round, not this specification-only PR. Required before T041 can pass in CI.
- [ ] T042 [RED] (FR-027, FR-031) `tests/unit/i18n-keys.test.ts` (or the existing i18n test): every new `auth.*` key exists in both `ar.ts` and `en.ts`. Tests check keys plus exact byte equality for the two states in FR-029 and for the approved table in copy-proposal.md; the five term-switched keys are compared byte-for-byte to FR-031.
- [ ] T042b [RED] (FR-029, SC-014): localization and application-output tests compare invalid/expired-link and generic reset-confirmation strings in AR and EN byte-for-byte against FR-029. Assert both catalog values and rendered output; comparison includes the shadda, Arabic comma and ASCII apostrophe. Other approved F4 copy is compared by T042 and T052.
- [ ] T049a [RED] (FR-030 control B, FR-025 (a), (b), SC-015) `tests/integration/auth-recovery.test.ts`, section "staff-reset-guard" (local Auth only): a direct staff `updateUser({ password })` without an intent is refused; a client manual-link completion still succeeds; a second session cannot change password without an intent; and when recovery session A opens an intent, session B of that account cannot consume it or change the password, while A can. The refused attempt leaves both password and intent unchanged. A second password change under the same intent after `password_changed_at` is set is refused atomically. Record the trusted request-context evidence that binds the guard to the initiating session; if the pinned stack cannot provide it, leave T050a blocked. Staff fixtures set passwords at creation.
- [ ] T049b [RED] (FR-018, FR-030 controls A and D, FR-025 (a), SC-015) section "staff-reset-direct": test policy refusal, audit append failure, unavailable hook transport and timeout as separate direct Auth cases. Assert no mail and no SMTP fallback for each; record caller status/body and assert generic mapping only where it executes. Control-D subset: test `begin` with verification older than 900 s, without recovery `amr`, after the 900 s window, and with a fresh open intent owned by another session; same-session retry is covered in T049d. No age fallback.
- [ ] T049c [RED] (FR-024, FR-030 control A, SC-015) section "staff-reset-public-route": enabled public `/recover` is controlled by the send hook. Verify five-per-account and ten-global-per-hour limits across direct/app mixed requests, including unknown identities and without GoTrue rate-limits masking results; two-per-hour delivery cap stays separate. Each accepted delivery has exactly one requested audit, and refusals do not replace an already delivered link. Compare route responses by failure class; do not assume generic parity for a transport error the hook cannot map.
- [ ] T049d [RED] (FR-025 (a), (c), (d), (e), (f), (g), SC-004, SC-012) section "staff-reset-intent": retrying `begin` from the same verified recovery session after a committed intent with a lost response returns the same intent id and creates no second intent or `completion_started` event; a different session's fresh open intent remains refused. `complete` after a successful change writes exactly one `completed`; `abort` after an unchanged error writes exactly one `completion_aborted`; a second `complete` or `abort` changes no row and appends no event; `staff_password_reset_reconcile()` closes an `open` intent older than 900 s with `password_changed` as recorded, and a second run is a no-op; no closed intent changes; an injected `begin` insert failure leaves `updateUser` uncalled; an injected `complete` failure leaves the intent open and reconciliation closes it; an ambiguous `updateUser` outcome (timeout or lost connection) calls no abort and leaves the intent open, and reconciliation records `password_changed` from `password_changed_at` for both the changed and the unchanged case; no audit row contains a password, email, token or link.
- [ ] T049e [RED] (FR-030 control C, SC-015) Before reset, prove the initiating staff access token can read its own row from an existing protected Data API resource. After a permitted staff change, assert every other pre-existing account session access token and the initiating recovery session are refused by local Auth, and replay the pre-reset access token against that same Data API resource; it must return no protected data and be rejected. Client behaviour is unchanged. Identify whether GoTrue native revocation suffices at both Auth and Data API boundaries or a technical control is needed. Any replay or access failure remains a technical blocker; do not accept session revocation based only on deleting Auth session rows.
- [ ] T050a [IMPL] (FR-025 (a) to (g), FR-030 controls B, C and D; SC-015) After T033 passes, gates G1 to G5 are proven, and T049a, T049b control-D cases, T049d and T049e have executed RED: one forward migration (unique version across all origin refs, scanned right before commit and push) for the intent, RPCs, audit transitions, reconciliation and guard. The guard must bind the password change to the initiating recovery session using verified trusted request context; account id/open intent alone is insufficient. Local stack only; no hosted Auth change. Acceptance: T049a, the control-D cases of T049b, T049d and T049e pass, client manual-link tests still pass, and the unique closing-event index is verified against `public.audit_events`. T050a acceptance does not depend on control-A implementation T050b. If G1/G2 cannot establish the binding, stop before migration and resolve the technical design; do not accept a competing-session exception.
- [ ] T050b [IMPL] (FR-018, FR-024, FR-030 control A; SC-015) S37-PO-8 selects local send-hook option B for testing; S38-PO-3 permits this local-only config and defers hosted changes/Resend. After T033, G6 and T049b/T049c RED, implement the local `[auth.hook.send_email]` sender. It enforces eligibility, the five-per-account limit, ten-per-hour global cap, 2-per-hour delivery cap and requested audit before send; authenticates and validates invocations; filters action types; checks identity/destination; protects secrets; prevents duplicate side effects; and emits no token-bearing logs. Acceptance: T049b/T049c and all G6 evidence pass on local stack. PDN-F4-7-17 is closed and is not a merge blocker.
- [ ] T043 [IMPL] (FR-016, FR-017, FR-018) After T034 to T042, T042b, T038a and T049a to T049e are RED: `app/login/actions.ts` gains `requestStaffReset`; `app/login/page.tsx` gains the request form (`components/ui/Field`, `Button`, `Alert`); server-only eligibility; the generic response. Under PDN-F4-7-14 = B the send is performed by the send hook (T050b): the app calls the Auth reset route only, and the hook writes the `staff_password_reset.requested` audit (FR-025), so this task writes no `requested` row itself. Blocked by T033.
- [ ] T044 [IMPL] (FR-019, FR-023, FR-024, FR-025 request audit) Forward migration for rate-limit state and requested audit, plus provider call with server-built `redirectTo`. Completion intent and guard are in T050a. Blocked by T033 and the corresponding RED tests; policy values are answered by S38-PO-5.
- [ ] T044a [IMPL] (FR-022, FR-027, S35-R5 T2) Local recovery email template linking to `/auth/recovery` with `token_hash`, `type=recovery` and the display-only `flow=staff` marker, with the approved strings in copy-proposal.md (FR-029 exact bytes; English S39-PO-4; Arabic S39-PO-5). Client manual links omit the marker. Local stack only; hosted template remains deferred under FR-020. Blocked by T033.
- [ ] T045 [IMPL] (FR-022, FR-025, FR-026) Add the no-referrer header and set-password flow. Bind begin/complete/abort to the same verified staff user/session; after known staff self-service success end the recovery session and redirect to `/login`, including closing-audit failure, with mandatory reconciliation. Preserve the existing client manual-link signed-in outcome in FR-013. Blocked by T050a and T033; copy is approved (S39-PO-4/S39-PO-5). Hosted deployment is not part of this task.
- [ ] T046 [DOC] (FR-020, SC-011) Record the external SMTP and hosted rollout gate in docs/13 and README. No hosted configuration; local-only T050b is authorized by S38-PO-3. Hosted work remains deferred until domain acquisition and separate FR-020 approval.
- [ ] T047 [GATE, OUT OF SCOPE] (FR-020, FR-023) Hosted Auth/SMTP configuration: redirect allow-list, `token_hash` template, sender, provider limit and CAPTCHA. Hosted send-path design and Resend are deferred until domain acquisition; exact hosted changes require separate explicit PO approval. Not performed in this cycle.
- [ ] T048 [REVIEW] (FR-028, FR-030) Security review of T043 to T045, T050a and T050b; record the executed Sol Medium critique and its S38-R4 disposition; obtain CodeRabbit review on the exact head; three executed green GitHub Actions `pull_request` runs on the exact final head, including the `validate` (with its `check:secrets` step), `integration` and `storage` jobs (reruns on that unchanged head may supply the three runs; feature-branch `push` events do not create separate runs). Verify the tested merge base: at least one of the three executed green `pull_request` runs must have tested the final head merged with current `main`; reverify before acceptance. PO merge approval must match the head SHA.
- [ ] T051 [GATE] (FR-028, FR-030; SC-015) Mutation-evidence acceptance for the recovery security controls. For the hook, session-bound guard/intent, authorization, audit transitions, account/global limits and session revocation, execute meaningful mutations that disable or bypass each control and show the corresponding acceptance test fails. Record killed assertions, exact tested SHA, tool/image versions, mutation set, restoration, and clean-diff evidence in traceability/report. No migration, hook, guard or related task is accepted until this evidence is executed on the candidate head and independently checked; carry-forward requires unchanged source, tests and migration proof.
- [ ] T052 [IMPL] (FR-031, FR-027) Apply the S39-PO-5 Arabic term switch to `lib/i18n/messages/ar.ts` for exactly five keys: `auth.newPassword` = "كلمة السر الجديدة", `auth.confirmPassword` = "تأكيد كلمة السر", `auth.setPassword` = "حفظ كلمة السر", `auth.weak_password` = "اختر كلمة سر أقوى.", `auth.mismatch` = "كلمتا السر غير متطابقتين.". English (`en.ts`) and every other key are unchanged. Add a catalog byte-comparison test for SC-016 and verify the screens/tests listed in spec.md FR-031. No behaviour change. Not implemented in this specification-only PR #65; schedule in the F4 implementation round after T033.

## Dependencies & order

F4 execution order (round 6): (1) complete T033's PO/spec entry checks; (2) write and execute the relevant T049 RED cases before implementation; (3) run approved local feasibility spikes G1-G6 to establish technical feasibility and capture direct-route evidence; these spikes and RED tests are pre-implementation design work and are not conditional on their own GREEN result; (4) rerun Analyze after any spec/plan/tasks changes and require 0 open CRITICAL/HIGH before implementation; (5) implement T043-T045 and T050a/T050b only after their corresponding RED tests and feasibility gates pass; (6) run acceptance tests and T051 mutation evidence before ticking tasks. A failed spike remains an explicit blocker and cannot be waived by this ordering.

- T001 → everything. T003 → T011, T020, T022. T005/T006 → T009, T013, T014, T017, T018. T007 → T014, T017, T018. T008 → UI tasks.
- US2 (T009–T011) before US1 (T013–T016), because the middleware and landing use the actor. US3 needs T003, T006 and T009. US4 needs T013.
- Parallel batches: {T002, T004, T005, T006, T007, T008}, then {T009, T010, T012}, then {T017, T019, T021, T024, T025, T026}.

## Implementation strategy

One Codex pass for Phases 1–7 (bounded, single worktree), then Claude's review in Phase 8. MVP = US2 + US1 (sign-in with a verified actor). US3 completes the owner's recovery requirement, which stays closed for clients until P1 (ND-F4-5).
