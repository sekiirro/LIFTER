# Feature Specification: Registration Links (P1-F10)

**Feature Branch**: `010-registration-links`

**Created**: 2026-10-27

**Status**: Draft artifacts; binding architect design transcribed. Implementation and Claude audit pending.

**Input**: User-supplied binding architect/reviewer design. Sources: [BRD/PRD](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md) BRD-04.1/04.2, PRD-02 required/acceptance, PRD-07 line 196 and journeys A/E; [architecture](../../docs/02-architecture.md) Registration tokens and Subscriptions/Installments; [decisions](../../docs/04-changes-and-questions.md) D-08/D-09/D-11/D-12/D-17/D-19; [Constitution v1.1.0](../../.specify/memory/constitution.md). D-12/D-17 supersede the historical three-month 50/50 rule, including PRD line 198.

## User Scenarios & Testing

Actors: Platform Owner (PO), Workspace Owner (WO), Sales, Trainer, client/auth-only identity and anonymous visitor. Own workspace means active authorized membership; PO can operate across real workspaces without a membership.

### User Story 1 — Issue a link with approved terms (Priority: P1)

Staff select an accessible workspace and available package offer. Issuance captures its current approved version and immutable terms. PO/WO/Sales can optionally specify exact installment amounts and day offsets. The raw link is shown once for copying.

**Why this priority**: Paid clients need workspace/package-bound registration without public sales or mutable historical terms (BRD-04.1, PRD-07, D-09/D-12/D-17).

**Independent Test**: With synthetic available offers in A/B, exercise every role with/without a schedule against both workspaces, inspect snapshots and audit, and close the show-once dialog.

**Acceptance Scenarios**:

1. **Given** PO/WO/Sales/Trainer authorized in A, **When** issuing without a schedule, **Then** one link captures A's available offer's current terms, expires exactly 24 hours after creation and represents one full payment without installment rows.
2. **Given** PO/WO/Sales in A, **When** positive amounts sum exactly to the captured price and contiguous sequence/day ordering is valid, **Then** link and schedule commit together. Trainer supplying any non-null schedule is denied at both authorization walls.
3. **Given** terms superseded between load and issue or a disabled offer, **When** authorized issuance binds the displayed package_version_id, **Then** stale_terms occurs with no partial link, schedule or audit event and translated refresh/reload guidance. Unknown/foreign versions and unauthorized callers receive only not_permitted; authorized malformed schedules receive invalid_input (R10-1).
4. **Given** a successful issue, **When** the dialog appears, **Then** only this response provides the raw URL; Copy is available, Share is absent, and close/workspace change clears it. Recent links never recover it.
5. **Given** concurrent issuances or package publication/availability changes, **When** transactions complete, **Then** each successful link has a unique hash and one coherent version snapshot, approved at its serialized issuance point. The actor rate limit cannot be exceeded by a race.

### User Story 2 — Open a private registration link (Priority: P1)

An anonymous or signed-in recipient opens `/register/<token>`. A valid response displays the workspace name and a minimal translated validity message. An unusable link displays one generic invalid message.

**Why this priority**: PRD-02 requires a new start before expiry and grace for a previously opened form; opening must never create or consume an account.

**Independent Test**: Synthetic token fixtures and an injected clock cover first open, repeats, expiry, grace and consumption; AR/EN public routes and response headers are checked separately.

**Acceptance Scenarios**:

1. **Given** an unconsumed link before expiry, **When** first opened, **Then** it is valid and `opened_at` is set once; a repeated or concurrent open preserves that first value and emits no additional opened event.
2. **Given** a first open strictly before expiry, **When** now is strictly before the later of expiry and first-open plus 30 minutes, **Then** the link remains valid. Grace never shortens the original 24 hours or extends on reload.
3. **Given** unknown, expired-never-opened, past-grace or consumed input, **When** opened, **Then** responses have identical invalid shape and wording, no workspace name, and no existence detail. At the effective deadline itself the link is invalid.
4. **Given** a brand-new open at/after expiry, **When** attempted, **Then** it is refused without setting `opened_at`. Shared IP addresses never cause blocking.
5. **Given** valid or invalid rendering, **When** inspecting response/payloads, **Then** `Referrer-Policy: no-referrer` is present, no price/package/commission data is returned, and there is no marketing, checkout, contact CTA, fake Continue action or F11 placeholder copy.

### User Story 3 — Review issued links safely (Priority: P2)

Staff review recent links within their workspaces, with status and approved terms. PO/WO can additionally read commission snapshots. Raw secrets and hashes remain unavailable to every staff read surface.

**Why this priority**: Isolation and commission secrecy must survive the convenience of staff administration (Constitution I/III/VII; F9 pattern).

**Independent Test**: All role × own/foreign reads, explicit/wildcard/embedded secret/commission requests, revoked membership and anonymous reads; AR/EN staff screen with exact money and accessible states.

**Acceptance Scenarios**:

1. **Given** link-generation capability in A, **When** selecting A, **Then** staff see its recent links and statuses, while B remains absent. Anonymous `/registration-links` redirects to sign-in; non-staff cannot load staff data.
2. **Given** Sales/Trainer, **When** reading UI, base columns, joins, safe view, commission reader or audit paths, **Then** no commission or hash is exposed. PO/WO can read commission only with workspace authorization; neither can read hashes through staff APIs.
3. **Given** workspace switching, pending/error/empty states, keyboard use and both locales/themes, **When** using the screen, **Then** stale results and show-once secrets are cleared, fields are labeled, focus is managed and exact amounts remain exact.

## Requirements

### Functional Requirements

- **FR-001**: Reuse `generate_registration_link` for all four staff roles and `configure_installment_schedule` only for PO/WO/Sales, with verified actor, app `authorize()` and independent DB checks. No capability/matrix change; deny anonymous/non-staff/revoked/foreign scope, with platform-wide PO access.
- **FR-002**: Issuance MUST accept the displayed package_version_id and bind a tenant link to that exact version only while its derived offer is available and current under lock (R10-1), through composite workspace/version relations; snapshot price, currency, duration days/months and commission. Later publication or disablement MUST NOT rewrite or invalidate existing link terms.
- **FR-003**: Every link MUST use a 32-byte cryptographically random base64url token, globally unique SHA-256 hash only in storage, immutable creator/time and fixed `expires_at = created_at + 24 hours`. Raw token/URL MUST be returned once, never stored, logged, cached or recovered from listing.
- **FR-004**: Optional immutable schedule rows MUST be inserted in the link's transaction: contiguous sequence 1..n, positive bigint minor-unit amounts, nonnegative integer day offsets strictly increasing, exact total equal to captured price. NULL schedule means no rows and one full payment. No first-offset-zero requirement or invented business upper bound; no historical 50/50 rule.
- **FR-005**: Links and schedules MUST reject DELETE/TRUNCATE for all roles and changes to immutable fields. Only NULL-to-value `opened_at` and `consumed_at` transitions are permitted under guards; repeats cannot replace/reset either timestamp. F10 exposes no consumption or direct mutation path.
- **FR-006**: Issuance MUST enforce an atomic per-actor rolling limit using one SQL placeholder-values function; ND-F10-3 remains a production blocker. Use `stale_terms` only for authorized unavailable/superseded terms (translated refresh/reload guidance); use generic `not_permitted` / `invalid_input` / `unavailable` for other failures without token/provider/existence details. Failed writes roll back all effects.
- **FR-007**: Anonymous/authenticated open MUST hash raw input in SQL, refuse consumed links, set first open only before expiry, and accept strictly before expiry OR strictly before first-open + 30 minutes when first-open was before expiry. Unknown/expired/consumed return the same invalid response; no IP blocking or table reads for anonymous callers.
- **FR-008**: A shared pure time function with injected clock MUST implement `valid_until = max(expires_at, opened_at + 30 minutes)` only when `opened_at < expires_at`; consumed always invalid, strict deadline comparisons. Table-driven unit and SQL parity tests MUST cover boundaries.
- **FR-009**: Public `/register/[token]` MUST be explicitly public in middleware, Arabic-first/English and Design-System accessible. Valid shows only workspace display name plus minimal validity message; invalid one generic message. No public financial/package data, branding implementation, form/account creation, marketing or F11 placeholder. Set no-referrer and never log token-bearing paths.
- **FR-010**: Staff link/schedule reads MUST require generation capability in scope, omit token_hash and commission, and preserve exact minor units as strings. PO/WO commission is available only through a gated reader with the same role/scope checks as F9. Anonymous has only the narrow open RPC.
- **FR-011**: Each issued link MUST atomically emit exactly one `registration_link.issued` event with `{package_version_id, offer_id, installment_count, price_minor: text, currency}`; each first open exactly one `registration_link.opened` with `{}`. No token/hash/commission/PII in these details, no child-row duplicate events; preserve every latest legacy audit mapping.
- **FR-012**: Staff `/registration-links` MUST provide accessible-workspace selection, available/current offers from `package_versions_safe`, optional schedule editor only for PO/WO/Sales, live exact-sum validation, show-once Copy-only delivery and recent valid/opened/expired/consumed statuses. Price visible by interim ND-F10-5 default; commission absent for Sales/Trainer. Use AR/EN, dark/light, responsive keyboard controls and loading/empty/error/retry states.
- **FR-013**: Document F11 atomic signup consumption contract only: guarded valid/unconsumed UPDATE RETURNING in the account-creation transaction; failure rolls back without consumption; concurrent signup admits at most one account. Duplicate email/phone handling is F11 under D-08, not an F10 implementation.
- **FR-014**: Ship the specified integration, unit, e2e, RLS-catalog and matrix-parity verification, including deliberate mutations of sum enforcement, Trainer denial, generic invalid responses and set-once guard. Final verification is executed by Codex and independently audited by Claude; Codex cannot approve its own implementation.

### Key Entities

- **Registration link**: tenant/version-bound hashed credential with fixed lifetime, immutable financial terms and first-open/consumption markers.
- **Registration link installment**: immutable ordered amount and relative day-offset snapshot; no row means full payment.
- **Approved offer/version**: F9 source of immutable terms; only available/current can be issued.
- **Audit event**: issued or first-open change evidence with an explicit safe detail allow-list.

### Edge Cases

Strict equality at expiry/grace is invalid; opening early must not shorten expiry. A post-expiry repeated open within grace is allowed only with a pre-expiry first-open marker. Simultaneous opens serialize. Synthetic consumed fixtures override otherwise-valid time. Bigint above 2^53, aggregate overflow, fractional/unsafe numbers, gaps/duplicate seq, equal/reversed offsets, empty array vs NULL, foreign child/version, duplicate hash, audit failure, lost delivery response and stale offer selection are specified in the model/contract. No revocation behavior is implied.

## Success Criteria

- **SC-001**: 100% of role × scope × schedule fixtures match both authorization walls, with zero foreign data or unauthorized commission/hash reads.
- **SC-002**: Every successful issuance has exactly one immutable current-version snapshot, correct 24-hour lifetime and exact schedule total; concurrent requests have zero partial records or duplicate hashes.
- **SC-003**: All time-table and SQL parity cases agree; every invalid cause yields identical public payloads; repeated/concurrent opens change first-open time and emit an event at most once.
- **SC-004**: Issued/opened audit counts and allow-listed fields match exactly; all secret/log checks have zero raw tokens, hashes or token-bearing paths in captured logs.
- **SC-005**: AR/EN public invalid and staff journeys pass tested axe checks and keyboard/state review; public responses include no-referrer, and anonymous staff requests require login.
- **SC-006**: Each required mutation produces a failing meaningful test, restored implementation passes, and Claude audits Codex's recorded final-phase evidence.

## NEEDS DECISION — remain OPEN

- **ND-F10-1**: Staff revocation/cancellation. No source defines it; no revoke control, column or endpoint is added.
- **ND-F10-2**: Maximum installment count, maximum offset and whether first offset must be zero. Enforce only stated rules plus storage limits.
- **ND-F10-3**: Issuance rate-limit count/window. Explicit local/dev placeholders only, centralized in one SQL function; production blocker until PO approval.
- **ND-F10-4**: Public content beyond workspace name before branding. Plan chooses validity messages only for this increment; no action/form stub. This does not settle future content/branding policy.
- **ND-F10-5**: Sales/Trainer price visibility on staff screen. Interim binding default: yes; price is separate from commission. PO confirmation remains required.
- Carry **ND-F9-1** allowed currencies (format only), **ND-F9-2** custom-duration bounds (existing technical limits), **ND-F9-3** actual catalog/terms (NEEDS SOURCE CONFIRMATION, no seeds), **ND-F9-4** Sales/Trainer commission visibility (denied), **ND-F9-5** final navigation (existing landing pattern only).

Existing [production gates](../../docs/07-production-readiness.md), including B4 and recovery decisions, remain open. ND-F4 expiry/limits do not replace F10's fixed 24 hours or its own rate decision. Local work/PRs remain permitted; no deployment/cloud migration is authorized.

## Assumptions and Constitution Check

I/III: two walls, unchanged capabilities, scoped safe reads and composite FKs. II/V: immutable exact-money snapshots; no payment recording or earned-commission calculation. IV: only issued/open contract; F11, branding, revocation, sales and financial workflows excluded. VI: no people decisions. VII: hashes/secrets confined, safe audit/no logs. VIII: AR/EN Design System and states. IX: locked transactions, set-once markers and pure tested clock. Single forward migration is future work only.

Workflow: user explicitly authorizes transcription of Claude's binding plan by Codex. Codex also runs the final verification phase, with independent Claude audit/approval still mandatory under the Constitution. This run is artifact writing, not implementation or self-approval. Technical ambiguities and source precedence are recorded in [research.md](research.md); no unresolved policy is silently approved.
