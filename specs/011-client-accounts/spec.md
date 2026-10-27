# Feature Specification: F11 — Client accounts + signup

**Feature Branch**: `011-client-accounts`

**Created**: 2026-10-28

**Status**: Draft; PO decisions remain open. Specify artifacts only, not implementation approval.

**Input**: User description: F11 — Client accounts + signup. A prospective client who opens a valid F10 registration link (`/register/[token]`) can create a LIFTER client account. Signup creates the Supabase Auth user and the client record and consumes the registration link (sets `consumed_at` once) **inside the same transaction**. Invalid, expired, consumed or otherwise invalid links return only the generic invalid response. Email and phone are globally unique across accounts; duplicates return D-08's generic duplicate message without field/account/workspace disclosure. Bind the client to the issued workspace/offer/version snapshot. Apply app `authorize()` and DB RLS (`has_workspace_access()`), with audit via `audit_row_change()` extended from its latest body in `supabase/migrations/20261030120000_registration_links.sql`. Supply the client dependency for F4 recovery (ND-F4-5), without resolving that decision. Exclude F12 subscriptions/approval/ledger/commission/payments, F13 freeze/renewal/refunds and SMTP/email verification (D-19). Public content beyond the signup form remains ND-F10-4.

Sources: [Constitution v1.1.0](../../.specify/memory/constitution.md); [roadmap](../../docs/03-roadmap.md), P1 Commercial core row (there is no separate literal F11 entry at this base); [decisions](../../docs/04-changes-and-questions.md), D-08/D-16/D-19/D-20; [architecture](../../docs/02-architecture.md), Multi-tenancy, Registration tokens and Privacy; [F10 spec](../010-registration-links/spec.md), FR-002/007/008/013; [F10 contract](../010-registration-links/contracts/registration-links-surface.md), public payload and F11 handoff; [BRD/PRD](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md), BRD-04.1–4, PRD-02, PRD-07 and Journey A. Approved decisions supersede older SMTP and account-collision wording.

## User Scenarios & Testing *(mandatory)*

Actors: prospective client holding a link, anonymous visitor, existing signed-in client/staff identity, and staff already authorized for client recovery. Link possession authorizes only bounded signup, never general workspace access or staff membership.

### User Story 1 - Create one account from the issued link (Priority: P1)

As a prospective client, I can submit the signup form from a valid link and receive one account bound to the issued workspace and terms.

**Why this priority**: Completes signup in Journey A and provides F4's missing client identity without implementing F12 approval or finance.

**Independent Test**: Use a synthetic valid link and unique identity; verify the account, snapshot association, consumed link and audit evidence, then inject failure into each persistence boundary.

**Acceptance Scenarios**:

1. **Given** a valid unconsumed link and valid unique signup data, **When** signup succeeds, **Then** exactly one Auth identity, one client and one set-once consumption commit together, bound to the issued workspace/offer/version snapshot (FR-001/003/004/005/010).
2. **Given** validation, Auth creation, client creation, consumption, deferred commit or audit failure, **When** the attempt completes, **Then** no partial identity/client/consumption or successful-signup audit evidence remains; a previously unconsumed link remains unconsumed (FR-003/010/011).
3. **Given** an issued link whose offer later changes version or availability, **When** otherwise-valid signup succeeds, **Then** original terms remain bound and are not replaced or rejected merely because current terms changed (FR-005).
4. **Given** simultaneous submissions on one valid link, **When** both finish, **Then** at most one succeeds and the loser receives generic invalid after consumption, with no orphan account (FR-003/004).

### User Story 2 - Fail safely without disclosing identities (Priority: P1)

As a prospective client, I receive consistent responses for unusable links and identity collisions; failed submissions do not spend a valid signup opportunity.

**Why this priority**: D-08 and F10 protect identity and workspace privacy, including under races/retries.

**Independent Test**: Exercise invalid-link classes, exact time boundaries, duplicate email only, phone only, both fields and simultaneous cross-workspace collisions with synthetic data.

**Acceptance Scenarios**:

1. **Given** an unknown, malformed, expired, past-grace, consumed or otherwise invalid link, **When** opening/submitting it, **Then** generic invalid reveals no cause, workspace, account or duplicate result and creates nothing (FR-002/006).
2. **Given** a valid link and existing email, phone or both, **When** submitting, **Then** every collision displays exactly D-08's English message, "This email is already registered. Contact support.", or equivalent Arabic translation, with no field-specific code or account/workspace confirmation; no account is created and the link stays unconsumed (FR-006/007).
3. **Given** different valid links and concurrent submissions sharing a unique identity field, **When** committed, **Then** only one account may own that field; losing attempts roll back and return the same generic duplicate result (FR-003/007).
4. **Given** a form opened before expiry and submit near the effective deadline, **When** guarded consumption checks authoritative time, **Then** stale page validity cannot authorize signup; equality with the deadline is invalid under inherited F10 semantics, subject to ND-F11-4 confirmation (FR-004).

### User Story 3 - Keep clients isolated and recoverable (Priority: P1)

As a client or authorized staff member, I can rely on account isolation and existing recovery controls.

**Why this priority**: Signup must not widen tenant access, staff permissions or recovery-secret exposure.

**Independent Test**: Use clients/staff in A/B, revoked memberships, anonymous and direct data access; verify both walls and exercise F4's client-target lookup with a newly created account.

**Acceptance Scenarios**:

1. **Given** anonymous or foreign-workspace callers, **When** reading/writing tables directly, forging workspace/offer/version or bypassing the app, **Then** independent authorization denies unauthorized access without foreign data/existence disclosure (FR-005/008/009).
2. **Given** a new client in A, **When** requesting B's resources or staff capabilities, **Then** access is denied; no staff membership or dual-role identity was created (FR-008/009).
3. **Given** a new client in A, **When** F4 recovery targets it, **Then** existing capability/scope checks admit only already-authorized own-workspace/platform actors and deny foreign/revoked/anonymous actors, preserving audit and show-once secret handling; ND-F4-5 and other F4 questions remain open (FR-012).

### User Story 4 - Complete a private bilingual form (Priority: P2)

As a prospective client, I can use Arabic or English, keyboard or mobile, without leaking the link.

**Why this priority**: Signup must preserve the approved Design System and F10 public-route privacy.

**Independent Test**: Review AR RTL/EN LTR, themes, mobile layout, labels, focus and pending/error/success feedback; capture headers, redirects, public payloads and logs for valid/invalid cases.

**Acceptance Scenarios**:

1. **Given** either locale/theme, **When** navigating by keyboard or correcting input, **Then** labels, focus, validation and pending feedback are accessible and translated without secret exposure (FR-011/013).
2. **Given** any registration/signup response, including errors, **When** inspected, **Then** no-referrer/no-store apply and logs, analytics, metadata and redirects contain no token/hash, credential or client PII (FR-009/011/014).
3. **Given** committed signup, **When** completion feedback appears, **Then** it neither implies approval/payment/activation nor redirects with the token; destination, session transition and interim state remain ND-F11-6 (FR-014/015).

### Edge Cases

- Concurrent double signup, replay and lost-success-response retry: at most one account per link; consumed links return generic invalid even when the successful response was lost. No credential/account recovery from a consumed token.
- Expiry versus submit, including lock waits: authoritative time at guarded consumption determines validity, not browser time or a prevalidated page. Exact expiry/grace boundary is invalid; reload never resets first-open time. ND-F11-4 records confirmation without changing F10.
- Duplicate email versus phone versus both, same/foreign workspace and concurrent different-link attempts: identical D-08 response, no merge/transfer/verification code or partial signup. An invalid link cannot become an identity-enumeration surface.
- Stale offer version or later disablement: honor the still-valid issued snapshot. Broken/missing/foreign snapshot relations cannot be silently replaced; abort without consumption/disclosure.
- Anonymous table/RPC bypass, forged scope, existing signed-in staff/client and revoked memberships: signup never grants broad anonymous access or converts/merges existing identities. Signed-in visitor UX is ND-F11-8.
- Failure after Auth creation, audit failure, deferred rejection, network interruption/retry: atomic effects, no orphan Auth user, no success before commit and no second consumption.
- Malformed passwords/email/phone: no consumption; exact policy remains ND-F11-1/2/3. Architecture names normalized email and E.164 phone but does not settle country/input transformations or all collision semantics.
- Token-bearing access/error logs, telemetry, login-next redirects, referrers/caches: scrub every capture point; no-referrer/no-store on invalid/errors too; no third-party content receives token-bearing referrers.
- Shared IP clients: no signup blocking solely for shared IP; ND-F11-5 signup attempts are distinct from ND-F10-3 issuance limits.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Provide email/password client signup through a valid F10 `/register/[token]`, using Supabase Auth and one workspace-specific client record. Field/password/input policy remains ND-F11-1/2/3. Introduce no SMTP or email-verification gate.
- **FR-002**: Opening MUST NOT create/consume an account. Unknown, malformed, expired, past-grace, consumed and otherwise invalid links MUST use inherited F10 generic invalid shape/wording with no cause, workspace or identity details; preserve normal HTTP 200 invalid-link business rendering. Infrastructure failures map safely to generic invalid without provider details or false success.
- **FR-003**: Auth user creation, client creation and valid-link consumption MUST commit **inside the same transaction**, together with successful-change audit evidence. Sequential remote calls with compensating deletion do not satisfy this. Every validation/uniqueness/write/deferred/audit failure rolls back all signup effects; report success only after confirmed commit.
- **FR-004**: Consumption MUST coordinate on the link row with guarded UPDATE RETURNING, require `consumed_at IS NULL`, check authoritative time at guarded consumption and permit only one NULL-to-value transition. Preserve shared F10 validity: strictly before expiry OR strictly before first-open +30 minutes only when first-open was strictly before expiry; consumed always invalid, reload never extends. ND-F11-4 requests signup-applicability confirmation, not an alternate grace policy. Concurrency/retry admits at most one account per link.
- **FR-005**: Derive client workspace, offer, version and terms only from the issued immutable snapshot and same-workspace relations. Reject caller overrides. New publication/disablement MUST NOT rewrite/invalidate issued terms. Preserve association for F12 without creating subscription, approval, payment or commission effects.
- **FR-006**: Every email/phone/both collision within/across workspaces MUST have identical D-08 outward payload/message: "This email is already registered. Contact support." (equivalent Arabic translation). No colliding-field code, account confirmation or workspace disclosure, verification-code flow, merge or transfer. Invalid links MUST NOT reveal duplicate diagnostics.
- **FR-007**: Enforce email and phone uniqueness globally across accounts at the database boundary, including concurrent different-link attempts, rather than prechecks alone. Preserve D-16 separate staff/client emails and no dual-role accounts. Duplicate failures leave no new Auth/client record and no consumption. Normalization/account-state/other-identity details remain ND-F11-2/9; do not narrow approved global uniqueness.
- **FR-008**: Every tenant client row MUST have `workspace_id` and composite same-workspace relations. App `authorize()` and independent DB RLS via `has_workspace_access()` MUST deny unauthorized access on every new protected surface. No staff role/membership or foreign access is granted. Keep the capability matrix unchanged and require foreign-workspace negative coverage for every new tenant table/surface.
- **FR-009**: Public signup MUST authorize only the bounded link operation, never general anonymous client/identity/link/snapshot reads/writes. Direct database access MUST independently reject forged/unauthorized scope. Browser privilege or broad service-role bypass cannot substitute for the two walls. Technical planning must reconcile public admission with existing staff-oriented helpers without adding staff capabilities or weakening RLS.
- **FR-010**: Provide append-only, tenant-scoped non-PII audit evidence correlating successful client creation and link consumption. Extend `app_private.audit_row_change()` from its **latest complete body** in `supabase/migrations/20261030120000_registration_links.sql` in a future forward-only migration; preserve workspace, staff-role, membership, recovery, package, offer, registration-link and job mappings. Failed transactions leave no successful events and replay cannot duplicate them. No secrets or foreign colliding account details in audit. Event vocabulary, public actor attribution and attempt evidence remain ND-F11-10; retention remains ND-F11-7.
- **FR-011**: Input/provider/constraint failures MUST have safe translated feedback without credentials, tokens/hashes, raw provider errors, PII or foreign details. Ordinary input failures preserve the link for correction; pending/error/success must not claim completion before commit. D-08 per-token attempt limiting is required; count/window/exhaustion behavior remain ND-F11-5. Shared IP alone MUST NOT block signup.
- **FR-012**: Supply a stable Auth-user/client/workspace association to F4's existing client-target recovery lookup, preserving capability/scope checks, audit and secret handling. Demonstrate newly created own-workspace targets and denied foreign/revoked/anonymous targets. This supplies the dependency without resolving ND-F4-5 or any other F4 item.
- **FR-013**: Use the existing Design System: Arabic-first RTL/English LTR, dark/light, responsive keyboard-accessible form, labels, errors and pending feedback. Do not add unapproved intake/health/profile collection. Exact collected fields/requiredness and password constraints remain ND-F11-1/3.
- **FR-014**: Every public registration/signup response MUST retain `Referrer-Policy: no-referrer` and `Cache-Control: no-store`; never shared/server-cache secrets or signup results. Raw tokens/hashes, token-bearing paths, passwords and client PII MUST never enter logs, analytics, exception dumps, metadata or redirect/login-next URLs. Host access capture must omit/redact token paths. Add no public package/financial/commission disclosure; ND-F10-4 stays open beyond the form.
- **FR-015**: Successful signup MUST create only the account and issued-link association/consumption/audit effects, with generic completion feedback. No registration approval, subscription activation, financial events or plan access. Destination/session/interim state remain ND-F11-6; do not invent a product state machine.

### Key Entities *(include if feature involves data)*

- **Auth identity**: stable Supabase Auth user identity and protected email/password credentials; no dual staff/client role and no password copies in client/audit records.
- **Client account**: one workspace-scoped account linked to Auth, globally unique email/phone and the issued snapshot; additional profile fields and state semantics await PO decisions.
- **Registration link**: existing F10 hashed, expiring, single-use credential with immutable snapshot, first-open and set-once consumed markers; raw token is not stored.
- **Issued offer/version snapshot**: historical workspace/offer/version/terms binding retained for F12; current catalog changes do not replace it.
- **Audit event**: append-only safe successful-change evidence with workspace/target correlation; public actor and denied-attempt details remain open.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every successful synthetic signup yields exactly one client identity/account bound to issued terms and spends exactly one link; zero partial signups survive injected failures at every persistence boundary.
- **SC-002**: Concurrent same-link, replay and lost-response cases yield at most one signup per link and zero orphan accounts; concurrent different-link email/phone collisions each leave at most one owner of the unique field.
- **SC-003**: All invalid-link classes yield the same generic invalid outcome; all email-only/phone-only/combined collisions on valid links yield identical D-08 outcomes, zero field/workspace disclosure and zero consumed losing links.
- **SC-004**: Every time-boundary case agrees with the inherited validity table, including equality, pre-expiry first-open, repeat-open and delayed submissions; no expired opportunity creates an account. Signup-grace confirmation remains ND-F11-4.
- **SC-005**: Anonymous/client/staff by own/foreign/revoked-scope cases yield zero unauthorized reads/writes or staff grants; recovery allows only its existing authorized targets.
- **SC-006**: Every committed signup has safe audit evidence, with zero false success events on failed/replayed attempts. Captured logs/redirects/public payloads have zero credentials, token/hash echoes or unauthorized identity details; every public response has the required privacy/cache headers.
- **SC-007**: AR/EN mobile/desktop signup, invalid, duplicate and correction journeys pass keyboard/accessibility review with understandable completion/error feedback and zero unapproved public/financial actions. Field-dependent and post-signup-state acceptance remains pending PO decisions.

## Assumptions

- F10 issuance/open behavior and immutable snapshots are dependencies. Its 24-hour lifetime and first-open 30-minute grace are source facts; ND-F11-4 records signup consumption applicability without approving any changed grace rule.
- D-19 supersedes older SMTP wording. Email/password is approved; SMTP, email verification and email-reset rollout are excluded. No new policy defaults are chosen.
- Same-transaction Auth/client/link creation is mandatory. Technical planning must demonstrate feasibility under Supabase Auth and the two walls; inability is a blocker, not permission to weaken atomicity or add a cloud/service-role shortcut.
- Roadmap P1/Journey A include later approval/intake/finance; this unit stops at account creation. BRD Telegram collection does not settle the entire field contract (ND-F11-3).
- ND-F4/F5/F8/F9/F10 items and production gates, including retention/B4, remain unchanged. No real client data or deployment is authorized.

## Out of Scope

- F12 subscriptions, approval/rejection, ledger, commission and payments; F13 freeze, renewal and refunds.
- SMTP/email verification/self-service email-reset rollout; changes to F4 recovery policies, expiry, delivery, permissions or rates.
- Public content beyond the form (ND-F10-4), marketing, checkout, support CTA or sales funnel; no branding-policy decision.
- Intake/health-data collection, trainer assignment, plan delivery/access, Telegram linking, merging/transfer, closure/deletion implementation or retention schedules.
- Dependencies, capability-matrix changes, committed-migration edits, seeds/catalog changes, cloud-linked commands, deployment and PR creation. Implementation requires later plan/tasks/analyze and independent review.

## Open decisions

All items are **open, awaiting PO**. These are questions only: no option or new policy default is selected.

- **ND-F11-1 — Password policy**: Which minimum/maximum length, accepted characters and other rules apply, and how are they presented bilingually?
- **ND-F11-2 — Email/phone normalization and input format**: [NEEDS CLARIFICATION: Which email normalization and phone input/country/normalization rules establish canonical uniqueness, including equivalent phone representations?] Architecture specifies normalized email/E.164 storage; input transformations/collision details remain unconfirmed.
- **ND-F11-3 — Collected signup fields**: [NEEDS CLARIFICATION: Which fields are collected at signup, which are required, and is the BRD Telegram username required or optional at this stage?] Email/password and globally unique email/phone are binding; additional profile/image/consent fields are not invented.
- **ND-F11-4 — Consumption grace**: Does signup consume using exactly F10's inherited 24-hour/first-open 30-minute predicate, including authoritative time after lock waits? Preserve the F10 contract pending confirmation; no alternate extension or proof-of-start policy is approved.
- **ND-F11-5 — Signup attempt/rate limits**: What per-token count/window, additional non-IP scopes, parallel counting, reset behavior and generic exhaustion response apply, including duplicate retries? D-08 requires per-token limiting; do not assume F10 issuance values or block shared IPs.
- **ND-F11-6 — Post-signup state/session**: [NEEDS CLARIFICATION: What client-facing destination, session transition and interim account state follow signup before F12 approval exists?] Do not imply approval, activation or payment.
- **ND-F11-7 — PII retention/closure linkage**: What signup/profile/attempt evidence is retained, for how long, and how does pseudonymization/release of email/phone link to still-open ND-F5-1/B4? No retention period or closure implementation is selected.
- **ND-F11-8 — Already authenticated visitor**: How should signed-in staff or clients encounter another signup link (separate-session prompt, sign-out flow or another approved UX), without conversion, merge, dual roles or token-bearing redirects?
- **ND-F11-9 — Uniqueness across identities/account states**: How do staff phone collisions and inactive/pseudonymized identities participate in global uniqueness, and when are identifiers released? Do not narrow D-08, change D-16 or resolve closure retention by assumption.
- **ND-F11-10 — Audit vocabulary/actor/attempt evidence**: What event names, minimal safe allow-listed details and actor representation apply to client creation, consumption and duplicate/denied attempts? No impersonation, PII or colliding-field/foreign-account details; preserve existing conventions.

### Recorded clarification questions (skill step 8c; no interactive wait)

The three markers above are Q1–Q3. Options below are unselected questions for PO review, not recommendations. Other policy questions remain numbered ND items without additional markers.

| Question | Context | Option A | Option B | Option C | Custom |
| --- | --- | --- | --- | --- | --- |
| Q1 / ND-F11-2 | FR-007 canonical uniqueness | Require international phone input; define email normalization | Accept national input with explicit country; define transformations | PO supplies complete normalization contract | Supply rules and collision examples |
| Q2 / ND-F11-3 | FR-013 field contract | Identity/authentication fields only; defer others | Add source-mentioned Telegram username with explicit requiredness | PO supplies full field/requiredness list | Supply fields, validation and purpose |
| Q3 / ND-F11-6 | FR-015 excludes approval | Completion page; specify session behavior | Interim client view; specify session behavior | Sign-in destination; specify session behavior | Supply destination/session/state contract |

**Answers**: Not supplied; all remain open under the unit instruction to record and continue.

## Constitution Check

I/III: tenant relations, global identity privacy, two walls, unchanged staff capabilities and identity separation; narrow public admission grants no membership. II/V: immutable issued terms and no finance/approval/activation. IV/VI: approved scope, no invented policy or people decisions. VII: secret-safe non-PII audit and open retention. VIII: bilingual accessible existing Design System. IX: transactional signup, authoritative validity and concurrency safety.

Workflow: the user explicitly authorizes Codex U0 specify artifacts, commit and push. This is not implementation, self-approval or technical-plan approval; independent Claude review and later Spec Kit phases remain required. Acceptance criteria are future verification obligations, not claims of passing application tests.
