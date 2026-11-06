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
4. **Given** the new password meets the password rules, **When** it is set, **Then** a `staff_password_reset.completion_started` row is written before the password changes, the user is signed in, the old password no longer works, and exactly one `staff_password_reset.completed` audit event exists for that intent (FR-025). If the started row cannot be written, the password does not change.
5. **Given** a link that was already used, is more than 60 minutes old, or was superseded by a newer self-service reset for the same account, **When** it is opened, **Then** the invalid-link state is shown and no session is created.
6. **Given** a request exceeds the application-level rate limit for the target or the global cap, **When** it is made, **Then** no email is sent, the response is still the generic confirmation, and whether the refused request is audited follows PDN-F4-7-05 (not yet decided).
7. **Given** the built-in limit of 2 emails per hour is already used, **When** another permitted staff request is made, **Then** no email is sent, the response is the generic confirmation, and the attempt is not reported as a delivery failure.
8. **Given** a client identity, **When** it requests a reset, **Then** no email is sent, the response is the generic confirmation, and the client uses the manual-link flow of User Story 3.
9. **Given** the external SMTP gate in FR-020 is not recorded as passed, **When** general rollout to staff outside the permitted test list is considered, **Then** rollout is refused.
10. **Given** a reset request or completion attempt, **When** it is sent directly to the public Auth API with an anon key or recovery access token, **Then** the local provider boundary enforces eligibility, the five-per-account rolling-hour limit, request/completion audit ordering and the recovery-session enforcement in FR-030, and denies any bypass; successful reset revokes other sessions.
11. **Given** the invalid/expired reset-link state or generic reset-request confirmation, **When** the application renders AR or EN, **Then** output and the corresponding localization catalog value equal the matching FR-029 string byte-for-byte.


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
- **FR-018** (no account enumeration): For every syntactically valid address (staff, client, unknown or non-permitted), the server MUST return the same confirmation text, layout and result status. It MUST NOT expose provider errors (including "Email address not authorized"), delivery status, rate-limit status or any account role. The response timing MUST NOT reveal whether an account exists. The timing mechanism and its tolerance are an architect decision recorded in plan.md, subject to the security review.
- **FR-019** (delivery scope): Until the FR-020 gate is passed (the test phase), delivery MUST use Supabase Auth's built-in email only, and only to addresses permitted for test delivery. During the test phase it MUST NOT send more than 2 emails per hour (PO S35-PO-1 "built-in email temporarily for permitted test addresses only (2/hour)"). When the provider refuses the address or the cap is reached, no email is sent and the response remains as in FR-018. The permitted-address list and its maintainer are PDN-F4-7-01. After the FR-020 gate is passed, the built-in-email, permitted-address and 2-per-hour restrictions of this requirement end, and delivery follows the PO-approved external SMTP configuration (PDN-F4-7-10, PDN-F4-7-11); the application-level limits of FR-024 continue to apply. (S35-R5 scope clarification: the end point is the architect's reading of the PO words "temporarily" and "External SMTP required before general rollout", to be confirmed by the PO under PDN-F4-7-11.)
- **FR-020** (rollout gate): General rollout of self-service reset (any staff address outside the permitted test list, or any real-staff production use) MUST be blocked until an external SMTP provider is configured and validated and the PO approves that configuration (PO S35-PO-1: "External SMTP required before general rollout."). Hosted Supabase Auth and SMTP configuration is out of scope for this specification and needs separate explicit PO approval. The gate is recorded as a pre-production item in docs/13. The provider rate limit is reset from its default after custom SMTP is configured (Supabase documents a 30 messages/hour default with custom SMTP) and is set by PO approval.
- **FR-021** (link lifecycle): A self-service reset link MUST be single-use, MUST expire 60 minutes after issue (ND-F4-3 link expiry, decided 2026-10-29; `supabase/config.toml` `otp_expiry = 3600`), and MUST be superseded by a newer self-service reset for the same account (ND-F4-3 replacement rule). LIFTER MUST NOT store the token or link in readable form (FR-012; Constitution VII). Whether the provider enforces single use and supersession for email links is UNVERIFIED until SC-010 is executed on the local stack.
- **FR-022** (link handling, S35-R5): Opening the reset URL MUST NOT consume the token. A GET or HEAD request to the reset URL, including a prefetch by a mail or link scanner, MUST NOT call the verification step, MUST NOT create a session and MUST leave the token usable. Verification happens only on the POST that the explicit "Continue" step submits (the existing FR-013 step, `verifyRecovery`). The reset email MUST link to the app page `/auth/recovery` with `token_hash` and `type=recovery`, the shape `buildRecoveryUrl` already uses for manual links (`lib/auth/recovery-link.ts`). It MUST NOT use the provider's verification URL (`ConfirmationURL`), which verifies on GET. The local email template that produces this link is task T044a; the hosted template is gated by FR-020 and PDN-F4-7-11. Whether the provider's verify endpoint consumes a token on GET is UNVERIFIED and is not relied on; the app path is tested by T037a. The recovery page MUST send `Referrer-Policy: no-referrer` as a response header, set in `next.config.ts` (the pattern already used for `/register/:token`), not in the page component. The token MUST NOT appear in logs, audit details, error reports or analytics (FR-011).
- **FR-023** (redirect integrity): The `redirectTo` for reset emails MUST be built on the server from the fixed path `/auth/recovery` and `APP_ORIGIN` only. No request value (form, query, header or `next`) may change it. The Supabase redirect allow-list MUST list only that URL; that configuration is hosted and gated by FR-020. A tampered `redirectTo` or `next` MUST be ignored or refused.
- **FR-024** (rate limiting): Self-service requests MUST be rate-limited at the application layer per target and globally, so one requester cannot exhaust the shared provider quota. The per-target key MUST be a normalized, hashed email that is not stored or logged in readable form. The limit MUST apply to unknown and non-staff addresses too, so the limit cannot reveal existence. The per-account limit is 5 requests per rolling hour. Any global limit and keying details remain PDN-F4-7-03 and PDN-F4-7-04. A refused request sends no email. The application limit alone does not constrain direct calls to GoTrue /recover; FR-030 applies eligibility, the account limit, the global cap and audit requirements at the provider boundary.
- **FR-025** (audit, S35-R5 two-phase completion): Each self-service reset request accepted for delivery to an eligible staff account MUST produce exactly one append-only `staff_password_reset.requested` event before the send. If the audit record cannot be written, no email is sent (fail closed, as in F4 FR-009). The actor is null for an anonymous request. On the application path, completion of a self-service password change is recorded in two phases. This ordering does not make the Auth API operation atomic and does not prevent a direct GoTrue updateUser call from bypassing the application audit; the provider-boundary control in FR-030 is required before the guarantee can cover all paths. The earlier "same unit of work" wording cannot hold across the Auth service and the LIFTER database, so it is replaced by this ordering:
  - (a) After the recovery-session and password checks pass, and immediately before `auth.updateUser`, the server MUST append `staff_password_reset.completion_started` and obtain its intent id. If that append fails, `updateUser` MUST NOT be called and the response is a failure state (copy under PDN-F4-7-06).
  - (b) If `updateUser` succeeds, the server MUST append exactly one `staff_password_reset.completed` event that references the intent id, and only then redirect. The user-visible response when this append fails after the password has changed is PDN-F4-7-12 (open; no default encoded).
  - (c) If `updateUser` returns an error that leaves the password unchanged, the server MUST append `staff_password_reset.completion_aborted` for the intent id.
  - (d) If the append in (b) or (c) fails, or the process stops after `updateUser` and before that append, the intent stays open. Reconciliation (a database function, which never reads or writes a password) appends `staff_password_reset.completion_reconciled` for each open intent older than `RECOVERY_SESSION_MAX_AGE_SECONDS` (900 s, so no request that could still complete it is in flight). It never reconciles an intent that already has a closing row (`completed`, `completion_aborted` or `completion_reconciled`).
  The application-path completion rule applies to recovery sessions of staff identities, the only identities that receive self-service links (FR-016). The client manual-link completion is unchanged by this feature. Actions are namespaced and follow the `recovery_link.generated` pattern of F4 FR-009 and the append-only store of F5 FR-001. For a completion event the actor is the staff account holder whose recovery session is used. Details MUST contain ids only (F5 FR-004): no email, token, link or password. Audit rows are written only by database code (F5 FR-002). Durable reconciliation of an interrupted two-step operation follows the existing branding upload pattern (`reconciliation_pending` then `reconciliation_complete`, `lib/branding/upload-state.ts`). Auditing of refused and unknown-address attempts is PDN-F4-7-05.
- **FR-026** (session after reset): After a successful set-password through a self-service link, the user is signed in (FR-013). The recovery session window is 15 minutes (`RECOVERY_SESSION_MAX_AGE_SECONDS = 900`, ND-F4-3). Session-lifetime enforcement stays the open ND-F4-3 blocker and is not addressed here (see Security Notes).
- **FR-027** (copy, language and accessibility): Every new string (request form, confirmation, rate-limited and unavailable states, reset email subject and body, staff invalid-link wording) MUST exist in Arabic (RTL, default) and English (LTR), keyboard accessible, with labels and loading states (FR-014). The four approved strings in FR-029 are final and byte-exact for only the two named states. Every other new F4 string remains BLOCKED-COPY under PDN-F4-7-06. No other copy is invented in this specification.

- **FR-028** (negative tests): Before implementation is accepted, tests MUST cover: no email for client, unknown and non-permitted addresses; response parity (enumeration); the delivery cap and the rate limits; GET not consuming the link; reuse, expiry and supersession; `redirectTo` tampering; no audit row and no send when audit fails; no link, email, token or provider text in logs, UI or browser bundles (extends FR-015 and SC-005).

- **FR-029** (approved copy, S36-R6): For the invalid/expired reset-link state and generic reset-request confirmation only, the application output and the Arabic and English localization catalog values MUST equal the following UTF-8 strings byte-for-byte (including shadda, Arabic comma, and ASCII apostrophe). These strings resolve the exact-copy question only for these two states.

| State | Locale | Exact approved string |
|---|---|---|
| Invalid/expired reset link | AR | "اللينك ده مش شغال أو صلاحيته انتهت. اطلب لينك جديد عشان تقدر تغيّر كلمة السر." |
| Invalid/expired reset link | EN | "This password reset link is invalid or has expired. Request a new link to continue." |
| Generic reset-request confirmation | AR | "لو الإيميل ده مسجّل عندنا، هتوصلك رسالة فيها لينك تغيير كلمة السر." |
| Generic reset-request confirmation | EN | "If an account exists for this email address, you'll receive password reset instructions." |

- **FR-030** (Auth provider boundary; NF-1/NF-2): The local Auth boundary MUST enforce the same staff eligibility, 5-requests-per-account-per-rolling-hour limit, PO-decided global application limit, request audit and completion-audit ordering for every staff recovery path. A direct public anon-key /recover call MUST NOT bypass eligibility, the per-account cap, the global cap or request audit; if the boundary cannot enforce those controls on a public route, it MUST deny that route and permit only the controlled app-server route to reach the existing Auth recovery flow. A direct recovery-token updateUser call for a staff identity MUST NOT change a password or bypass completion audit; the controlled app-server completion path MUST enforce the recovery-session access-token expiry in ND-F4-3. The boundary MUST preserve existing link protections and the client manual-link completion flow, and a successful self-service reset MUST revoke all other sessions while enforcing the access-token controls in S35-PO-3. This control is local-only in this feature cycle; no hosted Auth change is authorized. Local implementation candidates and their limits are recorded in plan.md. Acceptance requires direct-API negative tests in T049 and the local control implementation in T050.

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
- **SC-015** (FR-030): Direct anon-key /recover and recovery-token updateUser negative tests cannot bypass eligibility, the 5-per-account rolling-hour limit, the global application cap, request/completion audit or session enforcement. Existing client manual-link completion still works; successful staff resets revoke other sessions. Tests run against local Auth only.
- **SC-012** (ND-F4-7): 0 occurrences of emails, links, tokens, provider error text or passwords in logs, UI responses, audit details or browser bundles produced by tests (FR-022, FR-025, FR-028; extends SC-005).
- **SC-013** (ND-F4-7): A permitted test staff account completes request, email, new password and signed-in area. The time target is PDN-F4-7-09.

## ND-F4-7 Security Notes (threat model; proposal, not verified)

Implementation of ND-F4-7 needs a security review and the Sol Medium critique before any code is accepted. Every threat below maps to a requirement and a test; no status is VERIFIED.

| # | Threat | Requirement | Test (planned, see tasks T034 to T041) |
|---|---|---|---|
| S1 | Account enumeration by response text, provider error ("Email address not authorized" reveals team membership), status, timing or rate-limit message | FR-018, FR-019, FR-024 | Response-parity unit and e2e tests (SC-008); provider-error mapping unit test; timing check per plan (tolerance undecided) |
| S2 | Token leakage through logs, the Referer header, analytics, email scanners that GET the link, or browser bundles | FR-011, FR-022, FR-028 | GET and HEAD do not consume the token, including scanner prefetch (T037a); app-owned link shape (T044a); `Referrer-Policy` header via `next.config.ts` (T045); log-scrub unit test; `scripts/check-client-secrets.mjs` (SC-012) |
| S3 | Rate abuse and quota exhaustion: the built-in limit (2 per hour) is per project, so one requester can starve every other test address | FR-019, FR-024 | Delivery-cap test; global application cap test (SC-009). Residual risk: the provider cap itself can be exhausted. CAPTCHA (Supabase documents it as the strongest bot control) is a hosted configuration and is out of scope, pending PO approval (see PDN-F4-7-11). |
| S4 | Open redirect through `redirectTo` or `next` in the reset link | FR-023 | Tampered `redirectTo` and `next` unit tests; redirect allow-list is hosted and gated (FR-020) |
| S5 | A client receives a staff reset or a staff reset is used for a client | FR-016 | Negative tests for client identities (no email; generic response) |
| S6 | A password changes without an audit row (including when the completion append fails after `updateUser`), or an audit row contains PII | FR-025 | Intent-first test (no `updateUser` when the started row fails); finish-failure test (intent stays open and is reconciled, T039); fail-closed send test; audit-detail scrub test (ids only) |
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
- **T3 (spec.md:137)**: FR-019 had no end point for the built-in-email restriction. Resolved: FR-019 is scoped to the test phase (before the FR-020 gate); post-gate delivery is the PO-approved SMTP configuration. The PO has not yet confirmed that reading (PDN-F4-7-11).
- **T4 (tasks.md:168)**: a page component cannot set a response header, and `Referrer-Policy` is not set on `/auth/recovery` today. Verified: `next.config.ts` sets it only for `/register/:token` and `middleware.ts` only for the register and branding trees. Resolved: T045 sets it in `next.config.ts` for `/auth/recovery`.
- **Nitpick T040 (review body)**: the test must cover real link expiry, not only the configuration value. Resolved: T040 adds an expiry case using the same technique as the merged F4 tests (`recovery_sent_at` backdated past 60 minutes, then verified).
- **Nitpick T041 (review body)**: the flow stopped after delivery. Resolved: T041 covers reset-to-signed-in. The SC-013 time target is not asserted because PDN-F4-7-09 is open.

### Source-gap record (historical, superseded by S35-PO-1 for the deferral)

- **ND-F4-3 session-lifetime enforcement** was recorded as deferred in `docs/13-production-readiness.md:34` ("PO decision: B; fix in a later feature."). The S35-PO-1 record above now confirms the deferral (ND-F4-3=A). Enforcement remains out of scope for F4 and has no task.

### Open items

ND-F4-5 and ND-F4-7 are decided by S35-PO-1 (see S35-PO-1 register above). Open ambiguities that remain: ND-F4-7 PO-DECISION-NEEDED items PDN-F4-7-01 to PDN-F4-7-13. Record discrepancy RD-1 is reconciled by the Architect note S35-R6 (no discrepancy remains). S36-R6 approves only the four FR-029 strings for the invalid/expired-link and generic-confirmation states; other F4 strings remain PO-DECISION-NEEDED under PDN-F4-7-06. This register does not state that there are no open ambiguities.

## ND-F4-7 PO-DECISION-NEEDED register (not decided; no default is encoded)

Each item lists the question, the options, the implications, the architect's recommendation and what it blocks. Until the PO answers, the matching requirement or task stays open.

- **PDN-F4-7-01 - Permitted test-address list (FR-019).** Who maintains the list, and where does it live?
  - A. Supabase organisation Team tab only (provider-enforced, as the built-in SMTP already does). Implication: no second source of truth, but changes are hosted org changes that need PO approval.
  - B. App-side allow-list in repository config. Implication: a second list that can drift from the provider's.
  - C. PO-maintained list recorded in `docs/04-changes-and-questions.md`, enforced through the Team tab. Implication: same enforcement as A, with an audit trail in the register.
  - Recommendation: C. Blocked: the delivery path (T044); general rollout is already blocked by FR-020.
- **PDN-F4-7-02 - Eligible staff roles (FR-016).** Which staff roles may use self-service email reset?
  - A. PO, WO, Trainer and Sales. Implication: matches ND-F4-6 ("staff recover through normal sign-in recovery") and Constitution III (one staff identity).
  - B. PO and WO only. Implication: narrower; Trainers and Sales keep no self-service path.
  - C. PO, WO and Trainer (Sales excluded). Implication: no source in the register supports excluding Sales.
  - Recommendation: A. Blocked: the role rows of T034 and the eligibility check (T043). ND-F4-1 (Trainer manual links) does not define staff eligibility.
- **PDN-F4-7-03 - Global application rate-limit value (FR-024).** The per-account rolling-hour cap is fixed at five by the NF-1/NF-2 provider-boundary requirement. The remaining question is the global application cap per window.
  - A. 2 requests per rolling hour globally (aligned with the provider's 2/hour cap). Implication: conservative; only the first two requests of an hour can send email during the test phase.
  - B. 10 per rolling hour globally. Implication: the provider's 2/hour cap remains the effective delivery limit.
  - C. PO sets the global value. Implication: none until given.
  - Recommendation: A for the test phase. CAPTCHA (threat S3) is a hosted configuration and is a separate PO decision (see PDN-F4-7-11). Blocked: T038 and the global-limit constant.

- **PDN-F4-7-04 - Target key and storage (FR-024).** How is the per-target limit keyed?
  - A. Normalized email, hashed, in an expiring rate-limit table with no plaintext. Implication: no existence oracle; no IP stored.
  - B. Provider-side limit only. Implication: cannot enforce the per-target rule of FR-024.
  - C. Per-IP limiting. Implication: revises the Assumption "no IP blocking is added" (spec Assumptions); requires a separate decision.
  - Recommendation: A. Blocked: T038 and the migration in T044.
- **PDN-F4-7-05 - Audit of refused and unknown-address requests (FR-025).**
  - A. Audit only accepted eligible-staff requests and completions. Implication: consistent with FR-025; an unknown address has no identity to record.
  - B. Also audit refused attempts as an event with no target. Implication: one record per probe; retention is open (B4 / ND-F5-1).
  - C. Audit completions only. Implication: requests leave no trace.
  - Recommendation: A. Blocked: the refused-request branch of T039 (scenario 6).
- **PDN-F4-7-06 - Copy approval (FR-027; BLOCKED-COPY).** All new F4 strings remain BLOCKED-COPY except the four byte-exact FR-029 strings for invalid/expired reset link and generic reset-request confirmation, approved under S36-R6. Still unresolved: request-form labels and actions; malformed-email validation; rate-limited and unavailable states; reset-email subject and body in Arabic and English; completion failure, aborted and reconciliation states; and every other F4 screen or email string without approved copy. The existing client-oriented invalid-link text ("This link is invalid or expired. Ask your coach or workspace for a new link.") does not answer any other F4 copy question.
  - A. Reuse the existing invalid-link text. Implication: staff are told to ask a coach or workspace.
  - B. Staff-specific wording that directs staff to request a new reset email from the sign-in page (exact string to be supplied by the PO). Implication: a new approved string is needed.
  - C. Neutral wording without a coach or workspace reference. Implication: a new approved string is needed.
  - Recommendation: B. Blocked: all UI and email tasks (T042, T043, T045). No string is approved in this specification.
- **PDN-F4-7-07 - Other sessions after a successful reset (FR-030).** **Decided (PO, S35-PO-3 F4 paragraph):** revoke other sessions after a successful reset and enforce recovery access-token controls. This supersedes the earlier open options A/B; no PO decision remains. Test coverage is T049/T050.

- **PDN-F4-7-08 - Reserved.** No question; the number is kept so that IDs stay stable.
- **PDN-F4-7-09 - Time target for SC-013.**
  - A. Under 2 minutes, as in SC-007. Implication: aligned with the client target.
  - B. Under 5 minutes. Implication: looser target.
  - C. No time target. Implication: SC-013 is not measurable.
  - Recommendation: A. Blocked: SC-013 only.
- **PDN-F4-7-10 - External SMTP provider (FR-020).** docs/02 line 18 says the provider is "chosen in P0"; no provider is chosen in the sources. Supabase's documented custom-SMTP options include Resend, AWS SES, Postmark, Twilio SendGrid, ZeptoMail and Brevo.
  - A. PO chooses a provider from that list and approves the configuration. Implication: needed before any general rollout.
  - B. Defer the choice. Implication: general rollout stays blocked.
  - Recommendation: the PO chooses; the architect does not choose a provider. Blocked: general rollout only; no code task.
- **PDN-F4-7-11 - Hosted Auth change approval (FR-020, FR-023).** Covers the redirect allow-list, the reset email template (must use `token_hash`), the provider rate limit, CAPTCHA and the sender.
  - A. One reviewed change set with exact values, approved by the PO before any hosted change. Implication: one approval step.
  - B. Approval per item. Implication: more steps, same outcome.
  - C. Defer all to rollout. Implication: the SMTP gate cannot be prepared.
  - Recommendation: A. Blocked: T047 only; hosted changes are out of scope for this cycle.

- **PDN-F4-7-12 - Response when the completion record fails after the password changed (FR-025 (b), S35-R5).** The completion row is appended after `auth.updateUser` succeeds. If that append fails, the password has already changed. Which response does the user see? The pre-update intent protects the application path only; a direct Auth API call can bypass it until FR-030 has an effective provider-boundary control.
  - A. Complete sign-in and redirect as normal; reconciliation closes the audit gap later. Implication: the user is not told a change failed when it did not; the gap is visible in the audit store until reconciliation.
  - B. Show a failure state and do not sign in. Implication: the new password already works, so the user is misled and may repeat the reset.
  - C. Show a neutral "try again" state. Implication: as B, plus a second reset may be needed.
  - Recommendation: A. On the application path the started row precedes updateUser; this does not prevent direct Auth API bypass and does not establish a provider-wide no-change-without-audit guarantee (FR-030, PDN-F4-7-13). Blocked: the completion response branch of T045 and the FR-025 (b) response; no other task.
- **PDN-F4-7-13 - Release control for direct Auth API bypass (NF-1, NF-2).** Feature: ND-F4-7. Where: FR-019, FR-024, FR-025, FR-030; ND-F4-3 in docs/13; NF-1/NF-2. Question: may staff self-service reset proceed to any send or completion path before a provider-side control prevents direct anon-key /recover and direct updateUser calls from bypassing eligibility, the 5-per-account rolling-hour limit and audit?
  - A. Make ND-F4-3 session-lifetime enforcement and a provider-side send gate (Auth Send Email hook or equivalent, to be designed) release blockers for ND-F4-7, and keep the test phase limited to the permitted test list. Implication: the test phase still exposes the bypass for permitted test addresses; general rollout is blocked until the control exists.
  - B. Accept the residual risk in writing for the test phase (permitted test addresses only, provider cap 2/hour). Implication: bypass of app-level audit and limits accepted by the PO; recorded as a risk acceptance.
  - C. Pause ND-F4-7 implementation until a provider-side control is designed in a new spec cycle. Implication: no self-service reset for staff until then; the PO's "implement now" decision is delayed.
  - Recommendation: A. Architect note: B is acceptable only if the PO records it explicitly.
  - Blocked: all ND-F4-7 implementation tasks (T043 to T046), and FR-025/FR-030 completion/send paths until a control is selected and specified. This decision is not made in this round.

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
- **ND-F4-7 — Self-service email reset timing.** BRD line 130 requires self-service email reset. With no external SMTP (owner decision), it is sequenced, not removed (D-07). **Decided (PO, S35-PO-1 line 9):** "ND-F4-7: Implement staff email password recovery now via Supabase Auth; built-in email temporarily for permitted test addresses only (2/hour). External SMTP required before general rollout." Specified below (User Story 5, FR-016 to FR-030, SC-008 to SC-015, Security Notes, PO-DECISION-NEEDED register). Not built: implementation waits for the Sol Medium critique (not yet invoked) and PO approval of the open items. Rollout waits for external SMTP (FR-020).

## Assumptions

- The owner decisions of 2026-10-27 extend BRD line 104 (PO manual reset links) to WOs and authorized Trainers. They are recorded as decision-register entry D-19, approved by the PO (S31-PO-2 SK-004-01); D-19 is the scope authority.
- Password rules (minimum length/strength) use the auth provider's configurable minimum. A stricter rule would be a later decision; none is stated in the sources.
- Account lockout beyond the auth provider's built-in sign-in rate limiting is not required by the sources; no IP blocking is added. This assumption stays in force for ND-F4-7 until PDN-F4-7-04 is decided (per-IP limiting would revise it).
- Client sign-in uses the same flow once client accounts exist (P1). F4 tests use staff fixtures and an auth-only fixture for the client target.
- Workspace-specific branding on the sign-in page is out of scope (branding is P1).
