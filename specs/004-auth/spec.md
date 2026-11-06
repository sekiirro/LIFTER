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

## Clarifications

### PO decision register (verbatim from `s28-po-decisions-verbatim.md`)

- **SK-004-01** (S31-PO-2, ledger line 175; D-19 approval status vs T030): "Confirm D-19 approved". Option text: "D-19 becomes the scope authority; T030 closes; #52's D-19 item can be resolved."
- **SK-004-02** (S31-PO-2, ledger line 176; ND-F4-1 which Trainers may generate client recovery links): "All workspace Trainers". Option text: "Any Trainer can issue links for any client in the workspace. Broadest; same work as above." ("same work" = "Needs a new spec cycle, RLS, tests and security review.")
- **SK-004-03** (S31-PO-2, ledger line 177; ND-F4-2 link delivery beyond copy): "Copy only (Recommended)". Option text: "Current narrow flow; nothing is sent automatically."
- **SK-004-06** (S31-PO-2, ledger line 178; ND-F4-6 PO manual recovery links for staff targets): "Clients only (Recommended)". Option text: "Current design; staff recover through normal sign-in recovery."
- **SK-004-04** (S31-PO-3, ledger line 182; ND-F4-4 production recovery-link limits): "Maximum 10 password-recovery links per issuing staff account per rolling hour, and 3 per client per rolling 24 hours across all issuers."

### Source-gap record (not a ledger decision)

- **ND-F4-3 session-lifetime enforcement** is recorded as deferred in `docs/13-production-readiness.md:34` ("PO decision: B; fix in a later feature."). That text is not in the PO decisions ledger lines 165-190 read for this change, so it is not treated as a ledger decision. Enforcement is out of scope for F4 and has no task. See PO-DECISION-NEEDED in this PR's report to confirm the source.

### Open items

ND-F4-5 and ND-F4-7 remain open (unanswered). Interim behaviour for those is unchanged. Open ND items are listed in the next section; this register does not state that there are no open ambiguities.

## NEEDS DECISION (owner sub-decisions; not invented here)

- **ND-F4-1 — Trainer permission.** Which Trainers may generate links: all Trainers of the workspace, only Trainers assigned to the client (assignment arrives in P4), or only Trainers granted a new per-person permission by the PO? **Decided (PO, S31-PO-2 SK-004-02):** "All workspace Trainers". Not implemented: Trainers stay denied until task T032 (FR-006) ships through a new Spec Kit cycle.
- **ND-F4-2 — Delivery to the client.** How the staff member passes the link: copy to clipboard only, or also a share action (device share sheet, Telegram once P6 exists)? **Decided (PO, S31-PO-2 SK-004-03):** "Copy only (Recommended)". Already satisfied: the link is shown once with a copy action only (`components/auth/RecoveryLinkDialog.tsx:40`; no share action exists in `components/auth`, `app` or `lib/auth`).
- **ND-F4-3 — Link expiry.** **Decided (PO, 2026-10-29):** recovery links expire after 60 minutes in all environments, are single-use, and issuing a replacement invalidates earlier unused links for the same account and purpose. The recovery-session TTL is 15 minutes in all environments and is independent: a link verified before expiry starts a fresh 15-minute session. Password recovery never changes client approval status. Session-lifetime enforcement is deferred per `docs/13-production-readiness.md:34` (not a ledger decision; see Clarifications).
- **ND-F4-4 — Rate-limit values.** Maximum generations per actor and per target within a time window. **Decided (PO, S31-PO-3 SK-004-04):** maximum 10 password-recovery links per issuing staff account per rolling hour, and 3 per client per rolling 24 hours across all issuers. The merged implementation still uses the earlier placeholders (20 per actor and 3 per target per hour); aligning the configuration and tests is task T031 (FR-010) and is not yet implemented.
- **ND-F4-5 — Client-target sequencing.** Client accounts and client profiles are created in P1. Options: (a) F4 ships the full mechanism with client targeting enabled when P1 adds client accounts (recommended); (b) F4 adds a minimal client-account record early; (c) move generation to P1. Until decided, F4 implements (a): the generation path exists and is tested, and the client-target lookup denies every target until client accounts exist.
- **ND-F4-6 — Staff recovery.** BRD lines 40/104/130 give the PO manual reset links without limiting them to clients. **Decided (PO, S31-PO-2 SK-004-06):** "Clients only (Recommended)"; staff recover through normal sign-in recovery. This matches the current design (staff targets are denied).
- **ND-F4-7 — Self-service email reset timing.** BRD line 130 requires self-service email reset. With no external SMTP (owner decision), it is sequenced, not removed (D-07). When is SMTP introduced? Not built until decided.

## Assumptions

- The owner decisions of 2026-10-27 extend BRD line 104 (PO manual reset links) to WOs and authorized Trainers. They are recorded as decision-register entry D-19, approved by the PO (S31-PO-2 SK-004-01); D-19 is the scope authority.
- Password rules (minimum length/strength) use the auth provider's configurable minimum. A stricter rule would be a later decision; none is stated in the sources.
- Account lockout beyond the auth provider's built-in sign-in rate limiting is not required by the sources; no IP blocking is added.
- Client sign-in uses the same flow once client accounts exist (P1). F4 tests use staff fixtures and an auth-only fixture for the client target.
- Workspace-specific branding on the sign-in page is out of scope (branding is P1).
