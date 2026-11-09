# Feature Specification: Authentication & Manual Recovery Links (P0-F4)

**Feature Branch**: `004-auth`
**Created**: 2026-10-27
**Status**: Draft
**Input**: Roadmap P0 "Supabase Auth". Owner decisions of 2026-10-27 recorded in the session handoff (Supabase Auth, no external SMTP for now, server-side manual recovery links for PO/WO/authorized Trainers, audited, shown once, never logged, rate-limited, no admin credentials in the browser). BRD lines 40, 104, 120, 129–130, 254, 304, 309. Traceability AT-AUTH-01, AT-REG-01. Constitution I, III, VII.

## User Scenarios & Testing *(mandatory)*

Actors: **Platform Owner (PO)**, **Workspace Owner (WO)**, **Trainer**, **Sales**, **Client**, **Anonymous visitor**.

### User Story 1 - Sign in and sign out with email and password (Priority: P1)

A staff member (and, once client accounts exist in P1, a client) signs in with email and password and reaches LIFTER. They stay signed in across page loads and on several devices at once, and can sign out. No second factor is required and there is no device-management screen.

**Why this priority**: Every later feature depends on a verified identity. BRD line 129.

**Independent Test**: Sign in as a fixture staff user, load a protected page, sign out, load it again.

**Acceptance Scenarios**:

1. **Given** a valid email and password, **When** the user signs in, **Then** they reach the signed-in area, in the language and theme they already chose.
2. **Given** a wrong password or an unknown email, **When** the user signs in, **Then** the same generic message is shown for both, and nothing reveals whether the account exists or which workspace it belongs to.
3. **Given** a signed-in user, **When** they sign out, **Then** protected pages are no longer reachable from that browser, and their other devices stay signed in.
4. **Given** a user signed in on two devices, **When** they use both, **Then** both work.

---

### User Story 2 - Server-verified identity drives authorization (Priority: P1)

Every protected page and server action derives the actor (identity, staff role, active workspace memberships) on the server from a verified session. Nothing sent by the browser (headers, cookies other than the signed session, form fields) can raise the actor's role or widen its workspaces.

**Why this priority**: Constitution I "two walls"; the app-layer wall needs a trustworthy actor.

**Independent Test**: Call protected endpoints with no session, an expired or tampered session, and a valid session with forged role or workspace inputs.

**Acceptance Scenarios**:

1. **Given** no session or an invalid/tampered session, **When** a protected page or action is requested, **Then** access is denied (pages redirect to sign-in, actions return a generic denial).
2. **Given** a valid session for a Trainer of workspace A, **When** a request claims PO role or workspace B, **Then** the actor is still "Trainer, workspace A only".
3. **Given** a staff member whose membership in A was revoked, **When** they make their next request, **Then** A is no longer in their actor scope.
4. **Given** a signed-in identity with no staff role (e.g. a future client), **When** a staff capability is checked, **Then** it is denied.

---

### User Story 3 - Generate a one-time manual recovery link for a client (Priority: P1)

Because LIFTER has no outgoing email yet, an authorized staff member opens a client's profile and generates a secure password-recovery link. The link is shown once so the staff member can pass it to the client. The client opens it, sets a new password and is signed in. Every generation is audited, and generation is rate-limited.

**Why this priority**: Owner decision 2026-10-27; without email, a client who forgets their password has no other way back in. BRD lines 104, 120, 130.

**Independent Test**: As each role, attempt generation for a client inside and outside their workspaces; use the link; reuse it; let it expire; exceed the rate limit; read the audit log and server logs.

**Acceptance Scenarios**:

1. **Given** the PO, or a WO with an active membership in the client's workspace, **When** they generate a link, **Then** a link is shown once, and one audit event records the actor, the target client and the workspace (without the link or any secret).
2. **Given** a WO, Trainer or Sales user without access to the client's workspace, **When** they try, **Then** it is denied with a generic message that does not confirm the client exists.
3. **Given** a Sales user, **When** they try for a client in their own workspace, **Then** it is denied.
4. **Given** a Trainer in the client's workspace, **When** they try, **Then** it is denied until ND-F4-1 decides which Trainers are authorized.
5. **Given** a generated link, **When** the client opens it and sets a valid new password, **Then** they are signed in and the old password no longer works.
6. **Given** a link that was already used, has expired, or was superseded by a newer link for the same account and purpose, **When** it is opened, **Then** it is rejected with a message to ask staff for a new link.
7. **Given** the generation rate limit is reached, **When** another link is requested, **Then** it is refused and no link is created.
8. **Given** the dialog showing the link is closed or the page reloaded, **When** the staff member looks again, **Then** the link cannot be displayed again; only a new generation produces a link.

---

### User Story 4 - Only sign-in and recovery pages are public (Priority: P2)

Anonymous visitors can reach only the sign-in page, the recovery (set new password) page, and health/static assets. Token registration joins this list in P1. Everything else requires a session.

**Why this priority**: AT-REG-01 / BRD Inv.5 (post-sale registration only; no public marketing pages).

**Independent Test**: Request every route anonymously.

**Acceptance Scenarios**:

1. **Given** an anonymous visitor, **When** they request any non-public page, **Then** they are sent to sign-in and then returned to a same-site page only.
2. **Given** a sign-in "return to" value pointing at another site, **When** sign-in completes, **Then** the user lands on the default signed-in page instead.

### User Story 5 - Staff reset their own password by email (Priority: P1)

A staff member who has forgotten their password requests a reset email from the sign-in page, without being signed in. The email contains a single-use link that opens the set-new-password step. Clients keep the manual-link flow of User Story 3. Built-in Supabase email is used only for permitted test addresses (at most 2 emails per hour, PO S35-PO-1). General rollout waits for external SMTP (FR-020).

**Why this priority**: PO S35-PO-1 ("Implement staff email password recovery now"). BRD line 130 requires self-service email reset. Before this, staff had no self-service recovery path (ND-F4-6 architect note).

**Independent Test**: As a permitted test staff account on the local stack, request a reset, open the link delivered to the local mail capture, set a password, sign out, and sign in with the new password. Repeat the request for an unknown, client and non-permitted address and confirm the responses are identical and that no email is sent.

**Acceptance Scenarios**:

1. **Given** a staff member on the sign-in page who is not signed in, **When** they request a reset for their staff email, **Then** they see the same confirmation as for any other address, and, if the address is permitted for test delivery and within the limits in FR-019 and FR-024, one email arrives with a single-use link.
2. **Given** an unknown address, a client address or a staff address not permitted for test delivery, **When** a reset is requested, **Then** the confirmation and its response status are the same as in scenario 1, no email is sent to that address, and no provider error text is shown.
3. **Given** a valid link in the reset email, **When** it is opened, **Then** the page shows only a "Continue" step, and a GET or HEAD request (including a prefetch by a mail or link scanner) does not consume the link (FR-022). After Continue the set-new-password form is shown.
4. **Given** the new password meets the password rules, **When** it is set, **Then** a `staff_password_reset.completion_started` row is written before the password changes, the old password no longer works, the recovery session ends, and the user is sent to normal login without auto-login. Exactly one `staff_password_reset.completed` audit event exists for that intent (FR-025). If the started row cannot be written, the password does not change.
5. **Given** a link that was already used, is more than 60 minutes old, or was superseded by a newer self-service reset for the same account, **When** it is opened, **Then** the invalid-link state is shown and no session is created.
6. **Given** a request exceeds the application-level rate limit for the target or the global cap, **When** it is made, **Then** no email is sent, the response is still the generic confirmation, and whether the refused request is audited follows PDN-F4-7-05 (not yet decided).
7. **Given** the built-in limit of 2 emails per hour is already used, **When** another permitted staff request is made, **Then** no email is sent, the response is the generic confirmation, and the attempt is not reported as a delivery failure.
8. **Given** a client identity, **When** it requests a reset, **Then** no email is sent, the response is the generic confirmation, and the client uses the manual-link flow of User Story 3.
9. **Given** the external SMTP gate in FR-020 is not recorded as passed, **When** general rollout to staff outside the permitted test list is considered, **Then** rollout is refused.
10. **Given** a reset request or password change, **When** it is sent directly to the public Auth API with an anon key or recovery access token, **Then** the local provider boundary denies any bypass of eligibility, the five-per-account rolling-hour limit, request and completion audit and session revocation, as FR-030 requires. A password change for a staff identity is refused without an open completion intent (FR-030 control B), and a successful reset revokes other sessions (control C). Public `/recover` is covered by the route control selected under PDN-F4-7-14 (option B, the local send hook; control A, NF-1); this scenario is not met for that route until T049b and T049c pass on the local stack.
11. **Given** a staff reset email link with the display-only `flow=staff` marker is invalid/expired, or a staff reset request receives its generic confirmation, **When** the application renders AR or EN, **Then** output and the corresponding localization catalog value equal the matching FR-029 string byte-for-byte. Given a client manual link is invalid/expired, the existing `auth.invalid_link` value and its new-link instruction are preserved exactly. The marker never changes verification or authorization.
12. **Given** `updateUser` has known-successfully changed the password but the closing audit append fails, **When** the recovery flow ends, **Then** the user sees the approved success-then-login outcome, is not automatically signed in, and mandatory reconciliation closes the intent.
13. **Given** a recovery session has opened an intent for a staff account, **When** a different session of that account attempts the password change, **Then** the guard refuses it and leaves the password and intent unchanged; the initiating recovery session remains the only session allowed to consume the intent.
14. **Given** `staff_password_reset_begin()` commits an intent but its response is lost, **When** the same verified recovery session retries, **Then** it receives the same intent id and no duplicate intent or `completion_started` event is created; a fresh intent belonging to a different session is refused.
15. **Given** the recovery screens render in Arabic, **When** the new-password labels, the set-password action, the weak-password validation and the mismatch validation are shown, **Then** they use "كلمة السر"/"كلمتا السر" exactly as FR-031 specifies, and every recovery string equals the approved table in [copy-proposal.md](copy-proposal.md).


---

### Edge Cases

- A recovery link opened in a different browser than the staff member's still works for the client, and only for that client's account.
- Generating a new link for the same account and purpose invalidates any earlier unused link.
- A staff member generating a link for their own account through the client flow is denied (staff and clients are separate identities, D-16).
- A target whose account is closed, pseudonymized or removed cannot receive a link (applies once closure exists).
- A recovery link must not sign the user in somewhere they cannot use: after setting a password the client lands on their own signed-in area only.
- The service credential that creates links is unavailable or misconfigured: generation fails closed with a generic error, and nothing partial is shown.
- Links, passwords and session tokens never appear in logs, audit details, error messages, analytics or URLs other than the link itself.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST sign in with email and password. No mandatory second factor; no device/session-management screen; multiple simultaneous sessions allowed.
- **FR-002**: Failed sign-in MUST show one generic message for wrong password and unknown email, and MUST NOT reveal account existence, role or workspace.
- **FR-003**: Users MUST be able to sign out of the current browser.
- **FR-004**: The server MUST derive the actor (identity, staff role, active workspace memberships) only from a server-verified session on every protected request, and MUST pass it to the existing `authorize()` check. Identities without a staff role MUST hold no staff capabilities.
- **FR-005**: Only sign-in, recovery (set new password), health and static assets MAY be public. Every other page and action MUST require a verified session. Post-sign-in redirects MUST be same-site only.
- **FR-006**: A new capability for generating manual recovery links MUST be added to the permission matrix in both walls (app layer and database): PO yes, WO yes (within workspaces of active membership), Sales no, Trainer denied until ND-F4-1 is decided.
- **FR-007**: Generation MUST happen only on the server, MUST check the capability against the target client's workspace, and MUST deny with a generic message that does not confirm whether the client exists.
- **FR-008**: The privileged credential used to create links MUST exist only on the server and MUST never be sent to, or readable from, the browser.
- **FR-009**: Every successful generation MUST produce exactly one append-only audit event in the same unit of work, with the new action `recovery_link.generated`, the actor, the target account and workspace, and no link, token, password, email, phone or name. If the audit record cannot be written, no link is issued.
- **FR-010**: Generation MUST be rate-limited per actor and per target. Over the limit, the request is refused and no link is created. Values: ND-F4-4.
- **FR-011**: The link MUST be shown once to the requesting staff member, MUST never be stored by LIFTER in readable form, and MUST never be written to logs, audit details, error reports or analytics.
- **FR-012**: A recovery link MUST be single-use, MUST expire (value: ND-F4-3), and MUST be invalidated when a newer link is generated for the same account and purpose. Its secret MUST be stored only in hashed form (Constitution VII).
- **FR-013**: Opening a valid recovery link MUST let the account holder set a new password (meeting the same password rules as sign-in) and then sign them in. Invalid, used or expired links MUST show a message asking the user to contact staff for a new link.
- **FR-014**: All sign-in and recovery pages MUST be available in Arabic (RTL, default) and English (LTR), keyboard accessible, with labeled inputs, clear errors and loading states, built on the Design System.
- **FR-015**: Negative tests MUST cover: foreign-workspace generation, Sales and Trainer denial, anonymous access to protected routes, forged actor inputs, link reuse, expired and superseded links, rate-limit refusal, absence of the privileged credential in browser bundles, and absence of links/tokens in logs and audit details.

ND-F4-7 (staff self-service email reset; S35-PO-1). Specified, not built. Status of every ND-F4-7 requirement: UNVERIFIED until implemented and executed (see traceability.md).

- **FR-016** (scope): Staff MUST be able to request a password-reset email from the sign-in page without being signed in. Only staff identities receive that email; the eligible staff roles are PDN-F4-7-02. Client accounts MUST NOT receive a self-service reset email in this feature. Clients keep the manual-link flow (FR-006, FR-007, SK-004-06, ND-F4-6).
- **FR-017** (request flow): The request form MUST be on the sign-in page, MUST NOT require a session, and MUST use a labelled email input (`autocomplete="email"`). A malformed address is rejected before submission with a validation message. Every syntactically valid address receives the response in FR-018.
- **FR-018** (no account enumeration): For every syntactically valid address (staff, client, unknown or non-permitted), the server MUST return the same confirmation text, layout and result status. It MUST NOT expose provider errors (including "Email address not authorized"), delivery status, rate-limit status or any account role. The response timing MUST NOT reveal whether an account exists. The timing mechanism and its tolerance are an architect decision recorded in plan.md, subject to the security review. The local direct-Auth tests MUST separately record outcomes for policy refusal, audit failure, unavailable hook transport and hook timeout; no-send and no-SMTP-fallback are mandatory for each. Generic response parity is claimed only for failures whose mapper actually executes; if a transport-level error reaches the direct caller, record the observed status/body and resolve the FR-018 technical gap before acceptance rather than assuming the hook can map an error it did not receive.
- **FR-019** (delivery scope): During local testing, delivery MUST go through the local send-email hook `[auth.hook.send_email]` as the sender (PDN-F4-7-14 = B), and only to addresses permitted for test delivery. This is the PO-approved test-phase waiver of the built-in-email wording. It MUST NOT send more than 2 emails per hour, enforced by the hook itself; GoTrue's own email-send limit is not relied on. When the hook refuses the address or the cap is reached, no email is sent. The permitted-address list is PDN-F4-7-01. This setting is local-only under S38-PO-3. Resend and every hosted send path are deferred until domain acquisition; no hosted Auth or SMTP change is authorized here. General rollout remains blocked by FR-020 and its separate approval; the application-level limits of FR-024 continue to apply.
- **FR-020** (rollout gate): General rollout of self-service reset (any staff address outside the permitted test list, or any real-staff production use) MUST be blocked until an external SMTP provider is configured and validated and the PO approves that configuration (PO S35-PO-1: "External SMTP required before general rollout."). Hosted Supabase Auth and SMTP configuration are out of scope and require separate explicit PO approval. The gate is recorded as a pre-production item in docs/13. Under S38-PO-3, hosted send-path design and Resend are deferred until domain acquisition; the local-only T050b config block is not a hosted change and does not wait on the closed PDN-F4-7-17. The hosted sender, template, redirect allow-list, provider limit and CAPTCHA remain gated by FR-020 and the remaining release approvals.
- **FR-021** (link lifecycle): A self-service reset link MUST be single-use, MUST expire 60 minutes after issue (ND-F4-3 link expiry, decided 2026-10-29; `supabase/config.toml` `otp_expiry = 3600`), and MUST be superseded by a newer self-service reset for the same account (ND-F4-3 replacement rule). LIFTER MUST NOT store the token or link in readable form (FR-012; Constitution VII). Whether the provider enforces single use and supersession for email links is UNVERIFIED until SC-010 is executed on the local stack.
- **FR-022** (link handling, S35-R5): Opening the reset URL MUST NOT consume the token. A GET or HEAD request to the reset URL, including a prefetch by a mail or link scanner, MUST NOT call the verification step, MUST NOT create a session and MUST leave the token usable. Verification happens only on the POST that the explicit "Continue" step submits (the existing FR-013 step, `verifyRecovery`). The reset email MUST link to the app page `/auth/recovery` with `token_hash` and `type=recovery`, the shape `buildRecoveryUrl` already uses for manual links (`lib/auth/recovery-link.ts`). It MUST NOT use the provider's verification URL (`ConfirmationURL`), which verifies on GET. The local email template that produces this link is task T044a; the hosted template is deferred under FR-020. Whether the provider's verify endpoint consumes a token on GET is UNVERIFIED and is not relied on; the app path is tested by T037a. The recovery page MUST send `Referrer-Policy: no-referrer` as a response header, set in `next.config.ts` (the pattern already used for `/register/:token`), not in the page component. The token MUST NOT appear in logs, audit details, error reports or analytics (FR-011).
- **FR-023** (redirect integrity): The `redirectTo` for reset emails MUST be built on the server from the fixed path `/auth/recovery` and `APP_ORIGIN` only. No request value (form, query, header or `next`) may change it. The Supabase redirect allow-list MUST list only that URL; that configuration is hosted and gated by FR-020. A tampered `redirectTo` or `next` MUST be ignored or refused.
- **FR-024** (rate limiting): Self-service requests MUST be rate-limited per normalized target and globally, including unknown and non-staff addresses, so one requester cannot exhaust the shared provider quota and limits cannot reveal account existence. The per-target key is a normalized, hashed email that is not stored or logged in readable form; the per-account limit is 5 requests per rolling hour. The PO-decided global limit is 10 requests per rolling hour (PDN-F4-7-03 = B). The send hook is the single authoritative accounting operation for both app and direct routes; the app route MUST NOT pre-consume or separately increment the same counters. Hook accounting MUST include unknown-address requests even if Auth does not invoke the hook for an unknown identity; G6 must prove how that path is accounted on the pinned stack. If the pinned Auth flow cannot enforce the global cap for unknown addresses, implementation remains blocked for a technical design. A refused request sends no email. FR-030 applies eligibility, account/global limits and audit at the provider boundary.
- **FR-025** (audit, durable completion intent; S36-PO-2 F4 line; PDN-F4-7-12 answered): Each self-service reset request accepted for delivery to an eligible staff account MUST produce exactly one append-only `staff_password_reset.requested` event before the send. If the audit record cannot be written, no email is sent (fail closed, as in F4 FR-009). The actor is null for an anonymous request. Every self-service password change for a staff identity MUST be preceded by a durable completion intent, and that intent MUST be closed by exactly one completion record or by reconciliation. The intent is a database-enforced state machine in `app_private.staff_password_reset_intents` (states `open`, `completed`, `aborted`, `reconciled`; field `password_changed_at`):
  - (a) Begin, before any password change: `public.staff_password_reset_begin()`, called with the recovery session, requires an eligible staff identity (PDN-F4-7-02), recovery authentication whose verification time is within `RECOVERY_SESSION_MAX_AGE_SECONDS` (900 s) (FR-030 control D), and no fresh `open` intent for that user owned by another session. If the same verified recovery session retries after a committed `begin` whose response was lost, the function returns the existing intent idempotently and appends no duplicate `completion_started` event. A fresh `open` intent owned by a different session is refused; an older open intent is reconciled before a new intent is inserted. The first successful call inserts the `open` intent with the session id and verification time `recovery_verified_at`, and exactly one `staff_password_reset.completion_started` audit row carrying the intent id, in one transaction. If either write fails, no intent exists, `updateUser` MUST NOT be called, and the response is a failure state (copy under COPY-F4-R6).
  - (b) Password change: the guard trigger on `auth.users` (FR-030 control B) allows a staff identity's `encrypted_password` to change only under the open intent created by the same recovery session, with the current time within 900 s of `recovery_verified_at`. The intent binds both the staff user id and initiating session id; `begin`, `complete` and `abort` require the same verified user/session pair. A competing session of that account MUST NOT consume or use the open intent. The database guard MUST validate the initiating-session binding from trusted request context; it MUST NOT infer binding from account id or an open intent alone. Feasibility G1/G2 and T049a MUST prove that the pinned local Auth path exposes sufficient trusted context. If it does not, T050a remains blocked and the control is not accepted. In the same transaction as the allowed password update, the guard sets `password_changed_at` on that intent and revokes the user's other sessions (FR-030 control C; existing PO decision PDN-F4-7-07). A second change under the same intent is refused: the guard permits a change only while `password_changed_at` is null, and sets it in the same atomic statement. A staff password change without the matching intent is refused by the database, whatever the caller.
  - (c) Completion: after `updateUser` succeeds, `public.staff_password_reset_complete(intent_id)` moves the intent from `open` to `completed` only when `password_changed_at` is set, and appends exactly one `staff_password_reset.completed` event. Then the server redirects.
  - (d) Abort: the server calls `public.staff_password_reset_abort(intent_id)` only when `updateUser` returns an explicit Auth error. That error leaves the password unchanged, because the guard and the password update share one transaction. The intent moves from `open` to `aborted` only when `password_changed_at` is null, and `staff_password_reset.completion_aborted` is appended. An ambiguous outcome (timeout, lost connection, or any response that does not establish the result) is not an abort: the server does not call abort, and the intent stays `open` for reconciliation to decide from `password_changed_at`.
  - (e) Reconciliation: `app_private.staff_password_reset_reconcile()` moves each `open` intent older than 900 s to `reconciled` and appends `staff_password_reset.completion_reconciled` with `password_changed` set to whether `password_changed_at` is set. A closed intent is never changed. A second run changes no row and appends no event (idempotent). The scheduling of this call is decided at T050a under the F6 jobs convention and is not a PO decision.
  - (f) Interrupted or failed completion: if (c) or (d) fails, or the process stops after (b), the intent stays `open` with its `password_changed_at` value, and (e) closes it later. The same holds for an ambiguous `updateUser` outcome under (d). If (e) itself fails, the intent stays `open` and the next run retries it. No password is changed and no closing event is duplicated.
  - (g) At most one closing event exists per intent: the state moves once (guarded by `state = 'open'`), and a unique index on the closing audit events by intent id enforces it (T050a verifies this against `public.audit_events`). Details hold ids and booleans only (F5 FR-004). Audit rows are written only by database code (F5 FR-002).
  - (h) PDN-F4-7-12 (S38-PO-5, clarified by S38-R7): after a known-successful password change, the recovery session is ended and the user is sent to the normal login; there is no auto-login. If the closing audit fails after the change is known successful, show the success-then-login outcome and require reconciliation. For an ambiguous `updateUser` outcome, keep the intent open for reconciliation and do not report an abort or claim success until the result is established.
  The application-path rules apply to recovery sessions of staff identities (FR-016). The client manual-link completion is unchanged by this feature. Actions are namespaced and follow the `recovery_link.generated` pattern (F4 FR-009) and the append-only store `public.audit_events` (F5 FR-001). Auditing of refused and unknown-address attempts is PDN-F4-7-05.
- **FR-026** (session after reset): After a successful staff self-service set-password, end the recovery session and send the user to normal login; do not automatically sign in. This applies after known success even when the closing audit failed; mandatory reconciliation remains in FR-025. Client manual-link recovery keeps the existing FR-013 signed-in outcome unchanged. The recovery session window is 15 minutes (`RECOVERY_SESSION_MAX_AGE_SECONDS = 900`, ND-F4-3). Session-lifetime enforcement stays the open ND-F4-3 blocker and is not addressed here (see Security Notes).
- **FR-027** (copy, language and accessibility): Every new string (request form, confirmation, rate-limited and unavailable states, reset email subject and body, staff invalid-link wording, new-password form, validation, success-then-login and errors) MUST exist in Arabic (RTL, default) and English (LTR), keyboard accessible, with labels and loading states (FR-014). The four approved strings in FR-029 are final and byte-exact for only the two named states. All remaining recovery copy is approved in [copy-proposal.md](copy-proposal.md): English of the 13 former proposal rows by S39-PO-4 option 2, and their Egyptian Arabic by S39-PO-5 option 1. COPY-F4-R6 is resolved. The five previously approved keys `auth.newPassword`, `auth.confirmPassword`, `auth.setPassword`, `auth.weak_password` and `auth.mismatch` carry the S39-PO-5 term switch, recorded as FR-031. The complete approved AR/EN table is reproduced below. The shared recovery page distinguishes invalid-link copy with the display-only `flow=staff` marker on the staff email link; client manual links preserve the existing `auth.invalid_link` catalog value. The marker MUST NOT affect verification, authorization, eligibility or completion.

- **FR-028** (negative tests): Before implementation is accepted, tests MUST cover: no email for client, unknown and non-permitted addresses; response parity (enumeration); the delivery cap and the rate limits; GET not consuming the link; reuse, expiry and supersession; `redirectTo` tampering; no audit row and no send when audit fails; no link, email, token or provider text in logs, UI or browser bundles (extends FR-015 and SC-005).

- **FR-029** (approved copy, S36-R6): For the staff invalid/expired reset-link state and generic reset-request confirmation only, the application output and the Arabic and English localization catalog values MUST equal the following UTF-8 strings byte-for-byte (including shadda, Arabic comma, and ASCII apostrophe). These strings resolve the exact-copy question only for these two staff recovery states. Client manual-link invalid/expired copy remains the existing approved `auth.invalid_link` catalog string from `origin/main`, with its instruction to request a new link from a coach or workspace; it is not replaced by the staff message.

| State | Locale | Exact approved string |
|---|---|---|
| Staff invalid/expired reset link | AR | "اللينك ده مش شغال أو صلاحيته انتهت. اطلب لينك جديد عشان تقدر تغيّر كلمة السر." |
| Staff invalid/expired reset link | EN | "This password reset link is invalid or has expired. Request a new link to continue." |
| Generic reset-request confirmation | AR | "لو الإيميل ده مسجّل عندنا، هتوصلك رسالة فيها لينك تغيير كلمة السر." |
| Generic reset-request confirmation | EN | "If an account exists for this email address, you'll receive password reset instructions." |

### Approved recovery copy (COPY-F4-R6 resolved; S39-PO-4, S39-PO-5)

This is the final approved AR/EN table for the F4 recovery copy. The same table is maintained in [copy-proposal.md](copy-proposal.md). The five keys with the S39-PO-5 term switch are marked; all other keys keep their existing wording. English is unchanged by S39-PO-5.

| Key | English (EN) | العربية (AR) | Authority |
|---|---|---|---|
| `auth.staffResetTitle` | Reset your password | تغيير كلمة السر | S39-PO-4 (EN) / S39-PO-5 (AR) |
| `auth.staffResetHelp` | Enter your staff account email address and we’ll send a reset link if the account is eligible. | اكتب الإيميل بتاع حساب الموظف، وهنبعتلك لينك تغيير كلمة السر لو الحساب ده مؤهل. | S39-PO-4 (EN) / S39-PO-5 (AR) |
| `auth.email` | Email | البريد الإلكتروني | Existing approved `origin/main` |
| `auth.requestReset` | Send reset link | ابعت لينك تغيير كلمة السر | S39-PO-4 (EN) / S39-PO-5 (AR) |
| `auth.sendingReset` | Sending… | بنبعت… | S39-PO-4 (EN) / S39-PO-5 (AR) |
| `auth.staffResetConfirm` | If an account exists for this email address, you'll receive password reset instructions. | لو الإيميل ده مسجّل عندنا، هتوصلك رسالة فيها لينك تغيير كلمة السر. | FR-029 (S36-R6); exact bytes |
| `auth.invalid_link` | This link is invalid or expired. Ask your coach or workspace for a new link. | هذا الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من مدرّبك أو إدارة مساحة العمل. | Existing approved `origin/main` |
| `auth.staffInvalidLink` | This password reset link is invalid or has expired. Request a new link to continue. | اللينك ده مش شغال أو صلاحيته انتهت. اطلب لينك جديد عشان تقدر تغيّر كلمة السر. | FR-029 (S36-R6); exact bytes |
| `auth.invalidEmail` | Enter a valid email address. | اكتب إيميل صحيح. | S39-PO-4 (EN) / S39-PO-5 (AR) |
| `auth.staffResetLimited` | If an account exists for this email address, you'll receive password reset instructions. | لو الإيميل ده مسجّل عندنا، هتوصلك رسالة فيها لينك تغيير كلمة السر. | FR-029 generic confirmation reuse |
| `auth.staffResetUnavailable` | If an account exists for this email address, you'll receive password reset instructions. | لو الإيميل ده مسجّل عندنا، هتوصلك رسالة فيها لينك تغيير كلمة السر. | FR-029 generic confirmation reuse |
| `auth.continue` | Continue | متابعة | Existing approved `origin/main` |
| `auth.choosePasswordTitle` | Choose a new password | اختار كلمة سر جديدة | S39-PO-4 (EN) / S39-PO-5 (AR) |
| `auth.newPassword` | New password | كلمة السر الجديدة | S39-PO-5 term switch; catalog task T052 |
| `auth.confirmPassword` | Confirm password | تأكيد كلمة السر | S39-PO-5 term switch; catalog task T052 |
| `auth.weak_password` | Choose a stronger password. | اختر كلمة سر أقوى. | S39-PO-5 term switch; catalog task T052 |
| `auth.mismatch` | The passwords do not match. | كلمتا السر غير متطابقتين. | S39-PO-5 term switch; catalog task T052 |
| `auth.setPassword` | Set password | حفظ كلمة السر | S39-PO-5 term switch; catalog task T052 |
| `auth.savingPassword` | Saving… | بنحفظ… | S39-PO-4 (EN) / S39-PO-5 (AR) |
| `auth.resetSuccessLogin` | Your password has been changed. Sign in with your new password. | اتغيّرت كلمة السر بتاعتك. سجّل دخول بكلمة السر الجديدة. | S39-PO-4 (EN) / S39-PO-5 (AR) |
| `auth.resetLoginNext` | Your recovery session has ended. Continue to sign in. | الجلسة بتاعت استعادة كلمة السر انتهت. كمّل لتسجيل الدخول. | S39-PO-4 (EN) / S39-PO-5 (AR) |
| `auth.resetNotChanged` | Your password wasn’t changed. Request a new reset link and try again. | كلمة السر بتاعتك ما اتغيّرتش. اطلب لينك جديد وحاول تاني. | S39-PO-4 (EN) / S39-PO-5 (AR) |
| `auth.resetCheckLogin` | We couldn’t confirm whether your password changed. Try signing in with your new password. If it doesn’t work, request a new reset link. | مقدرناش نتأكد لو كلمة السر بتاعتك اتغيّرت ولا لأ. جرّب تسجّل دخول بكلمة السر الجديدة. لو ما نفعش، اطلب لينك جديد لتغيير كلمة السر. | S39-PO-4 (EN) / S39-PO-5 (AR) |
| `auth.unavailable` | The service is unavailable. Please try again. | الخدمة غير متاحة الآن. يرجى المحاولة مرة أخرى. | Existing approved `origin/main` |
| `auth.staffResetEmailSubject` | Reset your LIFTER password | غيّر كلمة السر بتاعتك في LIFTER | S39-PO-4 (EN) / S39-PO-5 (AR) |
| `auth.staffResetEmailBody` | Use the link below to reset your LIFTER password. The link expires in 60 minutes and can be used once. If you didn’t request this email, you can ignore it. | استخدم اللينك اللي تحت عشان تغيّر كلمة السر بتاعتك في LIFTER. صلاحية اللينك بتنتهي بعد 60 دقيقة، وتقدر تستخدمه مرة واحدة بس. لو ما طلبتش الرسالة دي، تقدر تتجاهلها. | S39-PO-4 (EN) / S39-PO-5 (AR) |

- **FR-030** (Auth provider boundary; NF-1/NF-2; S36-PO-2 F4 line; S35-PO-3 F4 limits): For every staff recovery path, a direct public Auth API call MUST NOT bypass eligibility, the five-per-account rolling-hour limit, the PO-decided global cap, request audit, completion audit or session revocation. The controls are:
  - **Control A - public `/recover` with the anon key (NF-1): mechanism selected (PDN-F4-7-14 = B), not yet verified.** The local `[auth.hook.send_email]` hook is the sender in local testing (FR-019). A direct request for an ineligible/non-permitted address sends nothing; five-per-account and ten-global-per-hour limits hold across direct and mixed app-route requests; exactly one request audit is written before any permitted send; no route double-counts; unknown addresses are included; and a refused request does not replace an already delivered link. Policy refusal and application-caught audit failure are mapped generically. Unavailable transport and timeout outcomes are recorded separately; no-send and no SMTP fallback are mandatory, and generic parity is not claimed unless the mapper executes. Evidence (S37 experiment on Stack D, `research.md` R10): E1 CONFIRMED that direct anon-key `/recover` delivered mail without an app audit. The hook itself was not tested. Control A remains UNVERIFIED until G6, T049b and T049c pass locally. Tests: T049b, T049c. Implementation: T050b. Hosted work is deferred under FR-020 and S38-PO-3.
  - **Control B - password change on `auth.users` (NF-2): database-enforced, independent of the caller.** Mechanism decided: PDN-F4-7-15 = A (S37-PO-8 item 3). A `BEFORE UPDATE OF encrypted_password` guard refuses a staff change unless FR-025(a),(b) hold: the intent is open for the same user and initiating recovery session; trusted request context proves the session binding; verification age is within 900 seconds; and `password_changed_at` is null and set atomically. An account-level open intent alone is insufficient. If the pinned local Auth stack cannot expose trusted context, T050a is blocked. The same guard applies to app and direct `updateUser`; clients remain unaffected. Local only; hosted deployment is separately gated by FR-020. Tests: T049a, T049d. Implementation: T050a.
  - **Control C - session revocation.** After a permitted staff password change, every other pre-existing account session is ended, including password-authenticated sessions; the initiating recovery session is ended by FR-026. The existing PO rule is PDN-F4-7-07 and FR-025(b). The local Auth stack must refuse other sessions' access tokens, and the Data API must refuse replay of a pre-reset access token against a protected resource. T050a first checks GoTrue's native revocation; explicit session deletion is added only for a proven gap. The outcome is required either way. Test: T049e.
  - **Control D - recovery authentication and age (ND-F4-3 access-token controls, password path).** Recovery authentication is the JWT `amr` evidence that the merged F4 test already reads (`tests/integration/auth-recovery.test.ts`, lines 332 to 355): after `verifyOtp` with type `recovery`, the latest `amr` entry has method `otp` and a timestamp, and that verification is accepted only within 900 seconds. `public.staff_password_reset_begin()` reads `auth.jwt()->'amr'`, refuses a session without that entry, and stores the verification time as `recovery_verified_at`. The guard (control B) refuses any staff password change more than 900 seconds after `recovery_verified_at`, so the change must happen within 900 seconds of recovery verification, not merely within 900 seconds of the intent start. There is no fallback to session age alone. If the value cannot be relied on, control D is not accepted and the implementation remains blocked for technical resolution. The application offers staff only password sign-in (T014), so a recovery verification entry is expected only from the recovery verify path; T049b tests that a password sign-in session is refused. S37 E2 did not exercise control D: its recovery verification returned `otp_expired`, so the update session came from password sign-in, and gate G4 stays open. General session-lifetime enforcement for other Auth and PostgREST calls remains the open ND-F4-3 blocker in docs/13. Test: T049b. Gate: G4 re-proves the value on the local stack (plan.md).
  - Existing link protections, the client manual-link flow, the redirect rules of FR-023 and the 900-second recovery window are unchanged. A successful staff reset revokes all other sessions (control C).
  - No hosted Auth change is made or authorized here. Control B is a local migration. PDN-F4-7-15 = A: the guard reaches the hosted database only at the FR-020 gate, under its own PO approval (T047). The send-hook config is local-only under S38-PO-3; hosted work remains at the FR-020 gate. Local candidates, limits and feasibility gates G1 to G6 are in plan.md.
  Acceptance: RED tests T049a to T049e are written before implementation; controls B, C and D are implemented in T050a and proven on the local stack; control A is implemented in T050b after gate G6 passes. SC-015 is not met until all of them pass.

- **FR-031** (Arabic password-term standardisation, S39-PO-5): In exactly five Arabic catalog keys - `auth.newPassword`, `auth.confirmPassword`, `auth.setPassword`, `auth.weak_password` and `auth.mismatch` - the Arabic term MUST be "كلمة السر" (dual "كلمتا السر") instead of "كلمة المرور", "كلمة مرور" or "كلمتا المرور". The approved values, byte-exact, are: `auth.newPassword` = "كلمة السر الجديدة"; `auth.confirmPassword` = "تأكيد كلمة السر"; `auth.setPassword` = "حفظ كلمة السر"; `auth.weak_password` = "اختر كلمة سر أقوى."; `auth.mismatch` = "كلمتا السر غير متطابقتين.". No other wording, key, locale or string changes. Other keys that contain the old term (`auth.password`, `auth.invalid_credentials`, `auth.recoveryTitle`, `auth.recoveryLink`, `clientSignup.password`) are unchanged. The English values are unchanged. The catalog change is task T052 and is not made by this specification-only PR.
  Impacted screens/tests (grep of `origin/main` over `lib/i18n`, `app`, `components`, `tests`):
  - `app/auth/recovery/RecoveryForm.tsx`: labels `auth.newPassword` and `auth.confirmPassword`; submit label `auth.setPassword`; renders `m['auth.' + result.status]` for `auth.weak_password` and `auth.mismatch`.
  - `app/auth/recovery/page.tsx`: page heading `auth.setPassword`.
  - `lib/i18n/messages/ar.ts` and `lib/i18n/messages/en.ts`: the catalog values (Arabic changes; English unchanged).
  - `tests/unit/auth-actions.test.ts`: `auth.weak_password` catalog existence and the `mismatch`/`weak_password` status paths.
  - Indirect coverage only, no exact copy assertion: `tests/unit/messages.test.ts` (catalog parity/non-empty), `tests/e2e/auth.spec.ts` (loads `/auth/recovery` in AR and EN with axe), and `tests/integration/client-accounts-verification.md` (documents the `auth.weak_password` result).
  - `components/` contains no read of the five keys.

### Key Entities

- **Session**: a signed, server-verifiable proof of a signed-in identity, held by the browser.
- **Actor**: the server-derived view of who is acting: identity, staff role (or none) and active workspace memberships.
- **Recovery link issuance**: a record that an actor issued a recovery link for a target account in a workspace at a time; used for audit and rate limiting. Holds no secret.
- **Recovery link**: a single-use, expiring, hashed-at-rest secret that lets one account set a new password.

## Success Criteria *(mandatory)*

- **SC-001**: 100% of protected routes deny anonymous and tampered-session requests in tests.
- **SC-002**: 0 role/workspace escalations from forged browser inputs across all fixture identities.
- **SC-003**: Recovery-link generation outcomes match FR-006/FR-007 for every fixture role × own/foreign workspace combination.
- **SC-004**: Every successful generation yields exactly one audit event; refused or failed attempts yield none that claim a link was issued.
- **SC-005**: 0 occurrences of links, tokens, passwords or the privileged credential in browser bundles, server logs or audit details produced by tests.
- **SC-006**: A used, expired or superseded link succeeds 0 times.
- **SC-007**: A client given a link can set a new password and reach their signed-in area in under 2 minutes.
- **SC-008** (ND-F4-7): Every syntactically valid self-service reset request (fixture client, unknown, non-permitted staff and permitted staff) returns the same confirmation text and status code, verified by tests that compare the responses (FR-018).
- **SC-009** (ND-F4-7): 0 emails in tests to non-permitted addresses, and 0 emails beyond 2 per hour (FR-019, FR-024).
- **SC-010** (ND-F4-7): A self-service link succeeds 0 times after its first use, after 60 minutes, or after a newer self-service reset for the same account, executed on the local Supabase stack (FR-021).
- **SC-011** (ND-F4-7): General rollout stays blocked in docs/13 until external SMTP is validated and approved by the PO. 0 hosted Auth or SMTP changes are made without separate PO approval (FR-020).
- **SC-014** (FR-029): For both specified states, the Arabic and English rendered application messages and their localization catalog values match the four approved UTF-8 strings byte-for-byte. The comparison test detects any byte change, including the Arabic shadda, Arabic comma and ASCII apostrophe.
- **SC-015** (FR-030): Direct anon-key /recover and recovery-token updateUser negative tests cannot bypass eligibility, the 5-per-account rolling-hour limit, the global application cap, request/completion audit or session enforcement. Existing client manual-link completion still works; successful staff resets revoke all other pre-existing account sessions while ending the initiating recovery session. Tests run against local Auth only.
- **SC-016** (FR-031): The Arabic catalog values for the five term-switched keys equal the FR-031 strings byte-for-byte, and their English values and those of all other pre-existing catalog keys remain byte-identical to `origin/main`. The only catalog changes permitted are the approved recovery-key additions required by FR-027 (the 13 approved rows, including the FR-029 reuse values) and the five-key Arabic term switch required by FR-031; no unapproved key is added, removed or changed. Verified by a catalog byte comparison test.
- **SC-012** (ND-F4-7): 0 occurrences of emails, links, tokens, provider error text or passwords in logs, UI responses, audit details or browser bundles produced by tests (FR-022, FR-025, FR-028; extends SC-005).
- **SC-013** (ND-F4-7, S38-PO-5): In local testing, the reset flow completes within 2 minutes; for real users, the UX target is successful reset within 5 minutes from opening the recovery link (FR-022, FR-026). The e2e test measures from link opening through successful reset and asserts the 2-minute testing target.

## ND-F4-7 Security Notes (threat model; proposal, not verified)

Implementation of ND-F4-7 needs a security review before any code is accepted. The Sol Medium critique has executed and is dispositioned under S38-R4. Every threat below maps to a requirement and a test; no status is VERIFIED.

| # | Threat | Requirement | Test (planned, see tasks T034 to T041) |
|---|---|---|---|
| S1 | Account enumeration by response text, provider error ("Email address not authorized" reveals team membership), status, timing or rate-limit message | FR-018, FR-019, FR-024 | Response-parity unit and e2e tests (SC-008); provider-error mapping unit test; timing check per plan (tolerance undecided) |
| S2 | Token leakage through logs, the Referer header, analytics, email scanners that GET the link, or browser bundles | FR-011, FR-022, FR-028 | GET and HEAD do not consume the token, including scanner prefetch (T037a); app-owned link shape (T044a); `Referrer-Policy` header via `next.config.ts` (T045); log-scrub unit test; `scripts/check-client-secrets.mjs` (SC-012) |
| S3 | Rate abuse and quota exhaustion: the built-in limit (2 per hour) is per project, so one requester can starve every other test address | FR-019, FR-024 | Delivery-cap test; global application cap test (SC-009). Residual risk: the provider cap itself can be exhausted. CAPTCHA (Supabase documents it as the strongest bot control) is a hosted configuration and is out of scope, deferred with hosted rollout under FR-020. |
| S4 | Open redirect through `redirectTo` or `next` in the reset link | FR-023 | Tampered `redirectTo` and `next` unit tests; redirect allow-list is hosted and gated (FR-020) |
| S5 | A client receives a staff reset or a staff reset is used for a client | FR-016 | Negative tests for client identities (no email; generic response) |
| S6 | A password changes without an audit row (including when the completion append fails after `updateUser`), or an audit row contains PII | FR-025 | Intent-first test (no `updateUser` when the started row fails); finish-failure test (intent stays open and is reconciled, T049d); database guard refuses a staff password change without an open intent (FR-030 control B, T049a); fail-closed send test; audit-detail scrub test (ids only) |
| S7 | Link reuse, expiry or supersession not enforced by the provider | FR-021 | SC-010 executed on the local stack. UNVERIFIED until run. If the provider does not enforce supersession, the task fails and is escalated, not worked around. |
| S8 | Session after reset: a reset creates a normal Supabase session, and its lifetime is not enforced | FR-026 | No new test. The open ND-F4-3 session-lifetime blocker (docs/13 ND-F4-3) applies unchanged. This section states the interaction and proposes nothing. |
| S9 | Misconfigured hosted Auth (email template not using `token_hash`, redirect allow-list too wide, SMTP not set) | FR-020, FR-023 | Hosted configuration is out of scope and gated on separate PO approval; the rollout checklist in docs/13 (T046 to T047) |
| S10 | Compromised email account gives account takeover | Existing: FR-021 (single use, 60 minutes); PO-approved scope | Accepted residual risk for PO review; not mitigated by this feature |

## Clarifications

### PO decision register (verbatim from `s28-po-decisions-verbatim.md`)

- **SK-004-01** (S31-PO-2, ledger line 175; D-19 approval status vs T030): "Confirm D-19 approved". Option text: "D-19 becomes the scope authority; T030 closes; #52's D-19 item can be resolved."
- **SK-004-02** (S31-PO-2, ledger line 176; ND-F4-1 which Trainers may generate client recovery links): "All workspace Trainers". Option text: "Any Trainer can issue links for any client in the workspace. Broadest; same work as above." ("same work" = "Needs a new spec cycle, RLS, tests and security review.")
- **SK-004-03** (S31-PO-2, ledger line 177; ND-F4-2 link delivery beyond copy): "Copy only (Recommended)". Option text: "Current narrow flow; nothing is sent automatically."
- **SK-004-06** (S31-PO-2, ledger line 178; ND-F4-6 PO manual recovery links for staff targets): "Clients only (Recommended)". Option text: "Current design; staff recover through normal sign-in recovery."
- **SK-004-04** (S31-PO-3, ledger line 182; ND-F4-4 production recovery-link limits): "Maximum 10 password-recovery links per issuing staff account per rolling hour, and 3 per client per rolling 24 hours across all issuers."

### S35-PO-1 decision register (PO words verbatim, 2026-11-06)

Source: `C:/Users/NEW LAP/.lifter/runs/s35-haiku-ledger2/s35-po-1.verbatim.txt` (line 3 and line 9). Architect notes are in `C:/Users/NEW LAP/.lifter/runs/s35-haiku-ledger2/notes.txt` and are labelled "Architect note (not PO words)" wherever used.

- **ND-F4-3 and ND-F4-5** (S35-PO-1, line 3): "ND-F4-3=A (defer, track security blocker), ND-F4-5=A."
- **ND-F4-7** (S35-PO-1, line 9): "ND-F4-7: Implement staff email password recovery now via Supabase Auth; built-in email temporarily for permitted test addresses only (2/hour). External SMTP required before general rollout."

Architect note (not PO words): ND-F4-3=A is the S35 decision 8 option (a) and confirms the deferral recorded in `docs/13-production-readiness.md:34`; the session-lifetime blocker stays Open, Pre-Production. ND-F4-5=A is option (a) of ND-F4-5 below. ND-F4-7 is new F4 behaviour: it needs a full Spec Kit cycle and a security review, and its implementation waits for the Sol Medium critique and PO approval.

S36-R6 answers the exact Arabic-copy item only for the FR-029 invalid/expired-link and generic-confirmation states. Other F4 copy remains PO-DECISION-NEEDED. Record discrepancy RD-1, reconciled (Architect note S35-R6, not PO words): `docs/13-production-readiness.md:34` labels the session-lifetime deferral "PO decision: B", which is the original deferral option (its "fix in a later feature" text). S35-PO-1 "ND-F4-3=A (defer, track security blocker)" selected option (a), "confirm B". Both labels mean the same thing: the deferral stands and the session-lifetime blocker stays Open, Pre-Production. No discrepancy remains. The docs/13 label text is not edited in this round because it is a PO-decision record.

### Architect ruling S35-R5 (CodeRabbit round 2, not PO words)

- **T1 (plan.md:101, HIGH)**: the password update and completion audit are not atomic. FR-025 specifies intent-first two-phase auditing only for the application path; a direct Auth API update can bypass it. NF-2 remains HIGH pending an effective provider-boundary control (FR-030, PDN-F4-7-13). T039 covers the app-path intent and finish-failure cases; T049 covers direct Auth API denial.
- **T2 (plan.md:102, HIGH)**: the default recovery email verifies on GET, which link scanners trigger. Resolved in FR-022: the link goes to the app page with `token_hash`; GET and HEAD never consume; verification is on the POST after Continue. Tests: T037a (scanner prefetch) and T040 (second use). Local template: T044a.
- **T3 (spec.md:137)**: FR-019 had no end point for the built-in-email restriction. Resolved: FR-019 is scoped to the test phase (before the FR-020 gate); post-gate delivery is the PO-approved SMTP configuration. S38-PO-3 defers hosted integration; local test behavior is specified above.
- **T4 (tasks.md:168)**: a page component cannot set a response header, and `Referrer-Policy` is not set on `/auth/recovery` today. Verified: `next.config.ts` sets it only for `/register/:token` and `middleware.ts` only for the register and branding trees. Resolved: T045 sets it in `next.config.ts` for `/auth/recovery`.
- **Nitpick T040 (review body)**: the test must cover real link expiry, not only the configuration value. Resolved: T040 adds an expiry case using the same technique as the merged F4 tests (`recovery_sent_at` backdated past 60 minutes, then verified).
- **Nitpick T041 (review body)**: the flow stopped after delivery. Resolved: T041 covers reset-to-signed-in. The SC-013 time target is not asserted because PDN-F4-7-09 is open.

### Source-gap record (historical, superseded by S35-PO-1 for the deferral)

- **ND-F4-3 session-lifetime enforcement** was recorded as deferred in `docs/13-production-readiness.md:34` ("PO decision: B; fix in a later feature."). The S35-PO-1 record above now confirms the deferral (ND-F4-3=A). Enforcement remains out of scope for F4 and has no task.

### S36-PO-2 decision register (F4 line, verbatim; 2026-11-06)

Source: `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-2.verbatim.txt`, line 5 (byte-exact PO words):

> F4: Successful password reset requires durable audit intent/reconciliation. Block direct Auth API bypass of eligibility, rate limits, audit and session revocation.

Binding limits (S35-PO-3, F4 paragraph, `C:/Users/NEW LAP/.lifter/runs/s35-ledger3/s35-po-3.verbatim.txt`, line 7, byte-exact excerpt):

> Local testing only, permitted test emails controlled by PO, no hosted Auth changes. ... Preserve existing security blockers and link protections.

Architect mapping (architect words, not PO words; `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-architect-rulings-2.md`, line 4):

- PDN-F4-7-12 is answered as durable audit intent recorded before the password change, with reconciliation after it. No silent unaudited reset. Options A, B and C are replaced (FR-025).
- PDN-F4-7-13 is answered as: bypass blocking is a release blocker for ND-F4-7, and the ND-F4-7 implementation must include the control (FR-030).
- If a required control is impossible without a hosted Auth change, it is raised as a CONFLICT with S35-PO-3 and stays blocked. Three such items were raised below: PDN-F4-7-14 and -15 (both now answered by S37-PO-8) and the conditional -16 (not yet raised).


### Open items

S39-PO-4 option 2 and S39-PO-5 option 1 approve the full recovery copy in [copy-proposal.md](copy-proposal.md), including the Egyptian Arabic redraft of the 13 former proposal rows; COPY-F4-R6 is resolved and no copy decision remains open. The five-key term switch is recorded as FR-031. PDN-F4-7-01, -02, -03, -05, -09 and -12 are answered in the S38 register below. PDN-F4-7-17 is closed by S38-PO-3; -04 and -16 were technical, -06 is replaced by the concrete copy proposal, and -10/-11 are hosted-deferred under FR-020. No open ambiguity remains in the specification; local technical feasibility gates G1-G6 and session-binding evidence remain implementation blockers, not product decisions. Other pre-existing sessions are revoked under existing FR-025(b)/FR-030 control C and PDN-F4-7-07.

## ND-F4-7 PO-DECISION-NEEDED register (not decided; no default is encoded)

Each item lists the question, the options, the implications, the architect's recommendation and what it blocks. Until the PO answers, the matching requirement or task stays open.

- **PDN-F4-7-01 - Permitted test-address list (FR-019). ANSWERED A (S38-PO-5).** The PO-approved local test list is enforced by the hook. It blocks delivery outside the list; the exact test identities remain controlled by the PO. This decision does not authorize hosted changes.

- **PDN-F4-7-02 - Eligible staff roles (FR-016). ANSWERED A (S38-PO-5).** PO, WO, Trainer and Sales may use staff self-service recovery. It blocks no additional role decision; implementation remains gated by tests.

- **PDN-F4-7-03 - Global application rate-limit value (FR-024). ANSWERED B (S38-PO-5).** Ten global requests per rolling hour; the separate delivery cap remains two emails per hour.

- **PDN-F4-7-05 - Audit of refused and unknown-address requests (FR-025). ANSWERED A (S38-PO-5).** Audit accepted eligible-staff requests and completions only; refused and unknown-address probes do not add audit events.

- **PDN-F4-7-07 - Other sessions after a successful reset (FR-030).** **Decided (PO, S35-PO-3 F4 paragraph):** revoke other sessions after a successful reset and enforce recovery access-token controls. This supersedes the earlier open options A/B; no PO decision remains. Test coverage is T049a to T049e and T050a (FR-030 controls B to D); control A is T049b, T049c and T050b.

- **PDN-F4-7-08 - Reserved.** No question; the number is kept so that IDs stay stable.
- **PDN-F4-7-09 - Time target for SC-013. ANSWERED A plus real-user target (S38-PO-5).** Local test target: 2 minutes. Real-user UX target: 5 minutes from opening the recovery link to successful reset. SC-013 defines the measured endpoints.

- **PDN-F4-7-12 - Completion outcome after successful password change (FR-025(c),(h)). ANSWERED (S38-PO-5; S38-R7).** End the recovery session and send the user to normal login without auto-login. If closing-audit append fails after a known-successful change, still show success-then-login and require reconciliation. The ambiguous update outcome stays open for reconciliation. Other pre-existing sessions are governed by FR-025(b), FR-030 control C and PDN-F4-7-07.

- **PDN-F4-7-13 - Release control for direct Auth API bypass (NF-1, NF-2). ANSWERED as "block" (S36-PO-2 F4 line; architect mapping).** Direct anon-key `/recover` calls and direct `updateUser` calls MUST NOT bypass eligibility, the five-per-account rolling-hour limit, the global cap, audit or session revocation (FR-030). Bypass blocking remains a release blocker for ND-F4-7 and for any send beyond the local test phase. PDN-F4-7-14 is answered; implementation gates are now T033 plus the corresponding RED tests and feasibility gates: T050a requires G1-G5 and T049a, the control-D cases of T049b, T049d and T049e; T050b requires G6 and T049b/T049c for control A. The control remains unverified until its acceptance evidence passes; no general rollout or out-of-test sending is permitted until the release gates, including FR-020, pass. These test-phase prerequisites are tracked by T043-T045 and T050a/T050b in tasks.md. The architect does not treat former option B below (risk acceptance) as an answer to "block" unless the PO records it explicitly in writing.
  - History (former options): A. make ND-F4-3 session-lifetime enforcement and a provider-side send gate release blockers; B. accept the residual risk in writing for the test phase; C. pause ND-F4-7 until a provider-side control is designed in a new spec cycle. Former recommendation: A.
- **PDN-F4-7-14 - Mechanism for public `/recover` (FR-030 control A, NF-1). ANSWERED: B (S37-PO-8 item 2, 2026-11-08).** Question, unchanged: which local mechanism blocks or gates the anon-key `/recover` route while keeping the built-in sender? PO answer: B. The option text as presented states that B "blocks the bypass by design" and "needs your written waiver of the 'built-in email' wording for the test phase" (`C:/Users/NEW LAP/.lifter/runs/s37-po/s37-po-1.verbatim.txt`, S37-PO-8 lines 36 to 39). Answer B is recorded as that waiver, for the test phase only. Conditions: (1) the waiver ends at the FR-020 gate, and general rollout keeps its own gate; (2) the config block is local-only under S38-PO-3; (3) gate G6 must pass before T050b relies on the hook. Options as originally written, kept for history:
  - A. A local ingress or proxy in front of the local Auth service that denies anon-key `/auth/v1/recover` and lets only the LIFTER server route reach the recovery endpoint. The app enforces eligibility, the account limit, the global cap and request audit before the call. Implication: local-only; keeps the built-in sender and template (FR-019, T044a); changes the local test topology. Feasibility NOT verified: the repo does not configure the local gateway, and the spike (T050b) must prove it on the pinned Supabase CLI.
  - B. A local `[auth.hook.send_email]` hook that acts as the sender. It enforces eligibility, limits and audit, and returns success without sending on refusal, so the response stays generic. Implication: it replaces the built-in sender, which conflicts with FR-019 and the S35-PO-1 words "built-in email temporarily"; allowed mail would be delivered to the local Inbucket SMTP. Hook errors must never reach the caller (response parity, FR-018).
  - C. Residual risk accepted in writing for the test phase (permitted test addresses only, provider cap 2 per hour), as in the former PDN-F4-7-13 option B. Implication: the PO accepts the bypass of app-level limits and audit; the public route stays open; general rollout stays blocked.
  - Recommendation (history, before the S37-PO-8 answer): spike option A first, because it raises no conflict and stays local. If A cannot be proven, the architect recommends option B with an explicit PO waiver of the built-in-sender wording for the local test phase, because B is the only option that blocks the bypass by construction. Option C only if the PO records it explicitly. The architect does not choose for the PO.
  - Remaining blocks after the answer: T050b (until G6 passes, and until S38-PO-3 authorizes the local config block); the enabled-route cases of T049b and T049c stay RED until T050b; any staff send path beyond the local test stays blocked by FR-020.
- **PDN-F4-7-15 - Migration-installed guard trigger on `auth.users` (FR-030 control B, FR-025 (b)). ANSWERED: A (S37-PO-8 item 3, 2026-11-08).** PO answer A. The option text as presented reads: "a guard trigger on password changes, local-only during the test phase, and on the hosted database only at the release gate. As a result, staff password changes outside the self-service flow are refused, with no emergency override" (`C:/Users/NEW LAP/.lifter/runs/s37-po/s37-po-1.verbatim.txt`, S37-PO-8 lines 36 to 39). Conditions: local-only in the test phase; hosted only at the FR-020 gate with its own approval (T047). Question, unchanged: is a LIFTER migration that installs a `BEFORE UPDATE` trigger on `auth.users` within the local-only limit of S35-PO-3? Precedent in this repo: `signup_auth_claim_sync` is already a trigger on `auth.users` (`supabase/migrations/20261031121000_client_accounts_model.sql`, line 183). Once such a migration reaches the hosted database, it changes hosted password-change behaviour.
  - A. Accept as local-only for the test phase. The hosted deployment waits for the FR-020 release gate and its own PO approval. Implication: control B is proven locally first; hosted behaviour changes only at release.
  - B. No trigger; control B is replaced by an application-only check. Implication: a direct `updateUser` stays possible, so NF-2 stays HIGH.
  - C. Defer control B to a later spec cycle. Implication: ND-F4-7 password completion stays blocked.
  - Recommendation: A. Consequence to confirm with the PO: once control B exists, a staff password change made outside the self-service flow (for example by an admin or in the hosted dashboard) is refused. No break-glass path is part of this feature.
  - Remaining blocks after the answer: T050a, until T033, gates G1 to G5 and the answered role choice are satisfied.



Record discrepancy RD-1: reconciled by Architect note S35-R6 (see the "Record discrepancy" paragraph in the S35-PO-1 register). No open discrepancy.

## NEEDS DECISION (owner sub-decisions; not invented here)

- **ND-F4-1 — Trainer permission.** Which Trainers may generate links: all Trainers of the workspace, only Trainers assigned to the client (assignment arrives in P4), or only Trainers granted a new per-person permission by the PO? **Decided (PO, S31-PO-2 SK-004-02):** "All workspace Trainers". Not implemented: Trainers stay denied until task T032 (FR-006) ships through a new Spec Kit cycle.
- **ND-F4-2 — Delivery to the client.** How the staff member passes the link: copy to clipboard only, or also a share action (device share sheet, Telegram once P6 exists)? **Decided (PO, S31-PO-2 SK-004-03):** "Copy only (Recommended)". Already satisfied: the link is shown once with a copy action only (`components/auth/RecoveryLinkDialog.tsx:40`; no share action exists in `components/auth`, `app` or `lib/auth`).
- **ND-F4-3 — Link expiry.** **Decided (PO, 2026-10-29):** recovery links expire after 60 minutes in all environments, are single-use, and issuing a replacement invalidates earlier unused links for the same account and purpose. The recovery-session TTL is 15 minutes in all environments and is independent: a link verified before expiry starts a fresh 15-minute session. Password recovery never changes client approval status. Session-lifetime enforcement is deferred per `docs/13-production-readiness.md:34`. S35-PO-1 "ND-F4-3=A (defer, track security blocker)" confirms the deferral; the session-lifetime blocker stays Open, Pre-Production (docs/13 ND-F4-3). Record discrepancy RD-1 is reconciled by Architect note S35-R6 (see Clarifications); the "B" and "A" labels denote the same deferral.
- **ND-F4-4 — Rate-limit values.** Maximum generations per actor and per target within a time window. **Decided (PO, S31-PO-3 SK-004-04):** maximum 10 password-recovery links per issuing staff account per rolling hour, and 3 per client per rolling 24 hours across all issuers. The merged implementation still uses the earlier placeholders (20 per actor and 3 per target per hour); aligning the configuration and tests is task T031 (FR-010) and is not yet implemented.
- **ND-F4-5 — Client-target sequencing.** Client accounts and client profiles are created in P1. Options: (a) F4 ships the full mechanism with client targeting enabled when P1 adds client accounts (recommended); (b) F4 adds a minimal client-account record early; (c) move generation to P1. Until decided, F4 implements (a): the generation path exists and is tested, and the client-target lookup denies every target until client accounts exist.
  - **Decided (PO, S35-PO-1 line 3): "ND-F4-5=A."** Architect note (not PO words): A = option (a). F4 ships the full mechanism, and client targeting is enabled when P1 adds client accounts. Until P1, the lookup still denies every target as described above.
- **ND-F4-6 — Staff recovery.** BRD lines 40/104/130 give the PO manual reset links without limiting them to clients. **Decided (PO, S31-PO-2 SK-004-06):** "Clients only (Recommended)"; staff recover through normal sign-in recovery. This matches the current design (staff targets are denied).
  - Architect note (not PO words): staff self-service ("normal sign-in") recovery depends on ND-F4-7 (self-service email reset). Staff targets for manual links remain denied per SK-004-06. ND-F4-7 is now decided by S35-PO-1 and specified in User Story 5 and FR-016 to FR-028; it is not built, and its rollout is blocked on external SMTP (FR-020).
- **ND-F4-7 — Self-service email reset timing.** BRD line 130 requires self-service email reset. With no external SMTP (owner decision), it is sequenced, not removed (D-07). **Decided (PO, S35-PO-1 line 9):** "ND-F4-7: Implement staff email password recovery now via Supabase Auth; built-in email temporarily for permitted test addresses only (2/hour). External SMTP required before general rollout." Specified below (User Story 5, FR-016 to FR-030, SC-008 to SC-015, Security Notes, PO-DECISION-NEEDED register). Not built: the Sol Medium critique has run and is dispositioned in S38-R4. Remaining implementation entry depends on T033, local feasibility and PO approval of the proposed copy. Rollout waits for external SMTP (FR-020).

## Assumptions

- The owner decisions of 2026-10-27 extend BRD line 104 (PO manual reset links) to WOs and authorized Trainers. They are recorded as decision-register entry D-19, approved by the PO (S31-PO-2 SK-004-01); D-19 is the scope authority.
- Password rules (minimum length/strength) use the auth provider's configurable minimum. A stricter rule would be a later decision; none is stated in the sources.
- Account lockout beyond the auth provider's built-in sign-in rate limiting is not required by the sources; no IP blocking is added. This assumption stays in force for ND-F4-7 per the existing assumption (per-IP limiting would revise it).
- Client sign-in uses the same flow once client accounts exist (P1). F4 tests use staff fixtures and an auth-only fixture for the client target.
- Workspace-specific branding on the sign-in page is out of scope (branding is P1).

## S38 round 6 decision register and rulings (verbatim source extracts)

### PO words (byte-exact; not architect paraphrase)

**S38-PO-1 ? Email Hook/Resend line**

> - Email Hook/Resend: Defer integration until we obtain our domain. If unrelated, explain before acting.

**S38-PO-3 ? whole message**

> Stop overengineering LIFTER. No production, no real clients. Proceed with local-only T050b; no hosted changes. Defer Resend until domain acquisition. Prioritize finishing and merging features, not hypothetical scenarios. Keep mandatory security/CI/merge gates. Escalate only genuine blockers requiring PO decisions. Focus on shipping LIFTER.

**S38-PO-5 ? whole message**

> merge approved 
> S36-01=A, S36-02=A, PDN-01=A, PDN-02=A, PDN-03=B, PDN-05=A, PDN-12=A, PDN-09=A. For PDN-12, clarify whether "stays signed in" preserves an existing session or triggers auto-login; follow OWASP's normal-login recommendation after reset, and flag any conflict before implementation. For PDN-09, retain the 2-minute testing target, but set real-user UX target to 5 minutes from opening the recovery link to successful reset. No additional assumptions or product decisions.

**S38-PO-5 architect mapping note for option texts (architect words, not PO words)**

> (Architect mapping, NOT PO words: "merge approved" answers the architect's question "Do you approve merging #30 at exactly 592c1e1e05fd5589ad19e1087b0c92c667ca04b9?" — approval valid only for that exact head with gate-check a-h passing live. Options as presented: S36-01=A existing F12 client assignment; S36-02=A configured submission deadline passes without an accepted submission; PDN-F4-7-01=A PO-approved local test list enforced by the hook; -02=A all four staff roles; -03=B 10 global requests/hour with at most 2 deliveries/hour; -05=A audit accepted requests only; -12=A see S38-R7; -09=A 2-minute target for testing, plus PO-set real-user UX target 5 minutes from opening the recovery link to successful reset.)

### Architect rulings (quoted; not PO words)

**S38-R2**

> S38-R2 (2026-11-08, architect): PDN-F4-7-17 closed by S38-PO-3 ("Proceed with local-only T050b; no hosted changes."). DeepSeek evidence runs/s38-ds-supabase-link (no hosted link visible; spot-verified by architect).

**S38-R4**

> S38-R4 (2026-11-08, architect): Sol Medium critique of #65 at 549c6466 (runs/s38-sol-f4-critique, PO-approved S37-PO-1 Q3) executed: NOT READY, CRITICAL 0 / HIGH 6 / MEDIUM 3 / LOW 1. This satisfies the critique-execution part of C-R4-1. Disposition: findings 1-7, 9, 10 are technical spec fixes for F4 round 6 (no PO decision); finding 4 is remediated technically (session-bound intent), not accepted as an exception; finding 8 PDN pruning accepted: PDN-04, -06 (wording already in FR-029), -10, -11, -16 removed or deferred as technical/hosted per S38-PO-3; genuine product PDNs -01, -02, -03, -05, -12, -09 (timing) go to the PO as one batch; F4 copy strings will be drafted concretely in round 6 for one approval.

**S38-R7**

> S38-R7 (2026-11-09, architect, CONFLICT FLAG per S38-PO-5): PDN-F4-7-12 option A text ("known-success password change ends signed in") conflicts with the PO instruction to follow OWASP (Forgot Password Cheat Sheet: after reset the user logs in through the usual mechanism; no automatic login). In the Supabase recovery flow the recovery link itself creates a session, so "stays signed in" = auto-login via the recovery session, not preservation of a prior session. Encoding per S38-PO-5: after a successful reset the recovery session is ended and the user is sent to the normal login; a closing-audit failure after a known-successful change still shows success-then-login, with mandatory reconciliation. Whether OTHER pre-existing sessions of that account are also ended is NOT decided by any PO record found so far: F4 round 6 must check spec 004 for an existing rule; if none, raise one MCQ (no assumption).
