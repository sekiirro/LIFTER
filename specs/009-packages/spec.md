# Feature Specification: Packages & Package Versions (P1-F9)

**Feature Branch**: `009-packages`
**Created**: 2026-10-27
**Status**: Draft — binding architect design transcribed; implementation and independent review pending.
**Input**: P1-F9, approved architect/reviewer design supplied for this run. Sources: [BRD](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md) lines 30, 40–41, 53–54, 102, 196, 317; [decision register](../../docs/04-changes-and-questions.md) D-09/D-10, D-11, D-13, D-17; [Constitution v1.1.0](../../.specify/memory/constitution.md) I–III, V, VII–IX. Later decisions supersede historical BRD installment/refund wording.

## User Scenarios & Testing _(mandatory)_

Actors: **Platform Owner (PO)**, **Workspace Owner (WO)**, **Sales**, **Trainer**, **Client/auth-only identity**, **Anonymous visitor**. Staff scope always means active membership; the PO has platform-wide scope.

### User Story 1 - Create a canonical package and publish approved terms (Priority: P1)

The PO creates a stable package identity, selects a workspace and duration, authors Arabic and English labels, and publishes its paid price, currency and commission rate. Labels can change in a new version without changing the package's identity.

**Why this priority**: Registration must select PO-approved paid terms; catalog values come from PO data, never historical YBS defaults (BRD 30/40/53–54/102/317; D-11).

**Independent Test**: Start with an empty catalog; as PO create an identity and publish two distinct versions in workspace A. Verify the same package code and duration identify one offer, with consecutive versions and the second as current.

**Acceptance Scenarios**:

1. **Given** an empty catalog, **When** the PO creates a lowercase slug code, **Then** one canonical package exists; replaying the same code returns its identity without another creation event.
2. **Given** a canonical package, **When** the PO publishes all required terms for one workspace and duration, **Then** version 1 exists and is current on a new, initially unavailable offer. No price, currency, rate or label is supplied automatically.
3. **Given** an existing offer, **When** the PO changes its labels, price, currency or commission and publishes, **Then** the next version becomes current and prior versions remain unchanged.
4. **Given** preset months 1/3/6/8/12, **When** published, **Then** the corresponding duration is 30/90/180/240/360 days. Preset 2 or 4 months, mismatched preset days, and custom 0 days are rejected. Custom positive whole days are accepted within storage limits.
5. **Given** simultaneous distinct publications for the same offer, **When** both complete, **Then** both receive distinct consecutive version numbers, without duplicate offers or lost versions.
6. **Given** terms identical to the current version, **When** submitted again, **Then** the current version id is returned without insert, pointer change or event. Publishing older non-current terms instead appends N+1 and makes it current, allowing reverts.

### User Story 2 - Control what each workspace may sell (Priority: P1)

The PO reviews workspace offers and explicitly enables or disables their availability, confirming the change. Published history remains available for authorized historical reads.

**Why this priority**: The PO decides which packages a workspace may sell (BRD 40/53/102).

**Independent Test**: With a published offer fixture, toggle availability in workspace A, cancel a second toggle, and inspect the audit. Workspace B must not change.

**Acceptance Scenarios**:

1. **Given** an unavailable offer, **When** the PO confirms enabling it, **Then** it becomes available with exactly one availability event; repeating the same requested state produces no further event.
2. **Given** an available offer, **When** the PO disables it, **Then** it is excluded from future sellable selection, while its current pointer and all historical terms remain unchanged.
3. **Given** the confirmation dialog, **When** cancelled, **Then** no mutation occurs. A failed request shows a generic error and does not display an unconfirmed state as saved.
4. **Given** a WO, Sales or Trainer, **When** they try to change availability or publish terms in any workspace, **Then** the request is denied, even for their own workspace.

### User Story 3 - Read only authorized package information (Priority: P1)

Staff who may generate registration links can read offers and published terms for their active workspaces. PO and WO can see the commission rate. Sales and Trainers cannot retrieve it through any supported path.

**Why this priority**: Strict isolation and deny-by-default visibility (BRD 41/46; D-09/D-10; Constitution I/III). Link creation itself is F10.

**Independent Test**: Exercise every read surface as each role in workspace A and against B, then revoke a membership. Attempt explicit, wildcard, embedded and commission-specific reads.

**Acceptance Scenarios**:

1. **Given** WO/Sales/Trainer membership in A only, **When** they read offers or versions, **Then** A's rows are readable and B's rows are absent; direct foreign-target requests reveal no existence details.
2. **Given** a Sales or Trainer identity, **When** commission is requested directly, through joins or through the privileged read surface, **Then** no commission value is returned. WO sees it only in an active workspace; PO sees it across workspaces.
3. **Given** a canonical package offered only in B, **When** A-only staff read packages, **Then** that package is absent. PO can also read packages with no offers.
4. **Given** revoked membership, an auth-only identity, a client or an anonymous caller, **When** they use a staff read path, **Then** unauthorized rows and commission values are unavailable. An offer's unavailability does not grant access or erase historical visibility.

### User Story 4 - Manage packages in an accessible bilingual PO screen (Priority: P2)

The PO opens `/packages` from the signed-in landing, selects a workspace, creates a package code, publishes terms and reviews offers. Arabic is the default; English and the existing theme preference remain supported.

**Why this priority**: Constitution VIII; this is the management surface for US1/US2, with final PO navigation placement still undecided.

**Independent Test**: Run the full management journey in AR and EN using fixtures; verify anonymous redirection, non-PO denial, keyboard interaction, states and accessible markup.

**Acceptance Scenarios**:

1. **Given** a PO session, **When** `/packages` opens, **Then** it shows a workspace selector, offers table (code, duration, current version, formatted price and currency, commission, availability), create-code control and publish form with preset buttons or custom days.
2. **Given** missing workspaces or no packages/offers, pending work or a load/save failure, **When** rendered, **Then** the appropriate empty/loading/error state appears with translated labels and safe retry behavior.
3. **Given** AR or EN, **When** using the form and confirmation dialog, **Then** direction, labels, errors, money formatting and keyboard focus work in that language; authored package labels remain exactly authored.
4. **Given** an anonymous visitor, **When** `/packages` is requested, **Then** sign-in is required. A signed-in non-PO receives server-side 404/denial and no package-management data; hiding a link alone is insufficient.

### Edge Cases

- Empty, whitespace-only or over-120-character labels; malformed slug; missing commission (zero is explicit and valid), negative price/rate, excessive rate, fractional days and unsafe numeric conversion are rejected.
- Currency must have three uppercase ASCII letters. Format validation does not approve a currency list or assume two minor-unit decimals for every currency.
- Custom 90 days and preset 3 months share the same offer key. Its duration representation is fixed at first creation; a conflicting representation is rejected rather than silently editing the offer.
- A lost response followed by a retry identical to current returns the current version id. Any other payload, including older non-current terms, appends N+1 and moves current with one publication event.
- A simultaneous first publish and availability change serialize safely. Publishing never silently re-enables an existing offer.
- A cross-workspace version pointer or offer relation is rejected even when submitted through a privileged SQL test connection.
- Audit failure rolls back the entire mutation. No-op requests, current-pointer maintenance and failed mutations do not create extra business events.
- Service-role and postgres DML cannot update/delete/truncate versions while guards are installed. Administrative DDL bypass is outside the application threat boundary and is tested by deliberate mutation checks.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Only PO may create a globally unique canonical lowercase-slug package code. Code and creation attribution MUST remain immutable; packages MUST never be deleted. Labels MUST NOT identify packages (BRD 53).
- **FR-002**: Each workspace/package/duration-days combination MUST have exactly one offer. Offers MUST be created by publication only; their workspace, package and duration identity MUST remain fixed. Only availability and current version may change, through PO operations (BRD 40/53).
- **FR-003**: Durations MUST be preset 1/3/6/8/12 thirty-day months or explicit custom whole days ≥1. No calendar-month arithmetic or invented business upper bound is allowed (D-11; ND-F9-2).
- **FR-004**: Every published version MUST require authored AR/EN names of 1..120 characters excluding blank-only values, positive integer minor-unit price with uppercase three-letter currency, and explicitly supplied commission of 0..10000 basis points. No financial/catalog defaults or seed data (BRD 54/317; Constitution II/IV).
- **FR-005**: Publication MUST atomically number versions from 1 per offer, snapshot its duration and author/time, and set the current version. Concurrent distinct publications MUST be consecutive; identical-term retries MUST be handled in the database without duplicated effects (Constitution IX).
- **FR-006**: Every published version MUST reject update, delete and truncate for every role, including PO, service_role and postgres under installed guards. All changes to terms MUST be new versions; F10/F12 will reference version identities and purchase snapshots without retroactive changes (Constitution II/V; BRD 196; D-13/D-17).
- **FR-007**: Only PO may change offer availability, after confirmation in the UI. New offers start unavailable as a conservative technical state; repeated requests for the same state MUST be no-ops. Disabling MUST preserve history and prevent future sellable selection (BRD 53).
- **FR-008**: Reads MUST be isolated to active staff workspaces with registration-link capability, with PO access across the platform. Canonical packages are readable by non-PO staff only if an offer exists in an accessible workspace. Anonymous and non-staff identities MUST have no staff reads (Constitution I/III; D-09).
- **FR-009**: Commission rates MUST be readable only by PO or WO in scope. Sales/Trainer reads MUST omit them and explicit attempts MUST fail closed, including joins and alternate read paths (BRD 41; ND-F9-4).
- **FR-010**: Every mutation MUST verify the server-derived actor and existing pricing capability and independently enforce database authorization under the user's signed identity. Denials, malformed targets and failures MUST return generic results with no existence disclosure or console logging (Constitution I/III/VII).
- **FR-011**: Creation, publication and actual availability changes MUST each produce exactly one atomic append-only audit event containing only the specified business fields and actor/target/scope attribution. No PII or authored labels enter audit details; failed/no-op actions produce no new change event (Constitution VII).
- **FR-012**: `/packages` MUST be PO-only server-side, redirect anonymous users to login, and initially link only from the PO signed-in landing pending ND-F9-5. It MUST expose workspace selection, offer review, canonical-code creation, publication and confirmed availability controls (BRD 102).
- **FR-013**: UI MUST use the Design System, Arabic-first RTL and English LTR, existing dark/light themes, responsive keyboard-accessible controls and loading/empty/error states. Prices MUST format exactly from minor units with currency; authored labels MUST never be machine-translated (Constitution VIII).
- **FR-014**: Required verification MUST include role × own/foreign workspace matrices for every RPC/read path, anonymous/non-staff/revoked denial, commission hiding, all-role immutability guards, concurrent publication, duration boundaries, exact audit events without PII, composite-relation rejection, validation/money units, AR/EN route and axe checks, and RLS-catalog/matrix parity (Constitution I; quality gates).

### Key Entities

- **Package**: platform-level canonical code and immutable creation attribution.
- **Package offer**: a workspace's sellable package/duration identity, availability and current published version.
- **Package version**: immutable numbered terms: authored bilingual names, price/currency, commission, duration snapshot and publication attribution.
- **Audit event**: append-only record of one actual creation, publication or availability change.

## Success Criteria _(mandatory)_

- **SC-001**: 100% of role/workspace fixture cases match the read and mutation rules; zero foreign-workspace or unauthorized commission values are returned.
- **SC-002**: Across simultaneous first and later distinct publications, zero duplicate offers/version numbers occur and successful versions are consecutively numbered; identical-to-current replays add zero versions/events; reverting to older terms appends N+1 and advances current.
- **SC-003**: Every attempted update/delete/truncate of published history is refused in the all-role guard tests; old terms remain byte-for-byte unchanged after a new publication or availability change.
- **SC-004**: Each successful actual change yields exactly one matching audit event and every rejected or identical-to-current replayed request yields zero new change events; reverting to older terms yields one publication event; zero PII fields occur in package audit details.
- **SC-005**: PO can complete create → publish → enable in both AR and EN; all required states are exercised, keyboard operation succeeds and automated accessibility checks find zero violations in tested markup.
- **SC-006**: All preset/custom boundary cases, required values and supported-currency minor-unit formatting fixtures pass without precision loss or invented catalog data.

## NEEDS DECISION (mark; do not resolve)

- **ND-F9-1 — Allowed currencies**: single platform currency versus workspace configuration/another approved set. Enforce format only; no default currency or allow-list is invented.
- **ND-F9-2 — Custom-duration bounds**: only ≥1 day is enforced as business policy; storage integer limits remain technical constraints.
- **ND-F9-3 — Actual catalog**: tiers, allowed duration combinations, names, prices and commission rates (BRD 317) are **NEEDS SOURCE CONFIRMATION**. PO enters data; no YBS defaults or seed catalog.
- **ND-F9-4 — Sales/Trainer commission visibility**: denied meanwhile. WO visibility comes from BRD 41.
- **ND-F9-5 — PO navigation placement**: carries F2 ND-5; link only from signed-in landing for now.

These data/policy decisions do not block local development. Existing [production readiness](../../docs/07-production-readiness.md) gates remain open; this feature authorizes no deployment or cloud migration.

## Clarifications

### Session 2026-11-03 — compliance reconciliation

- **Decision register:** `docs/04-changes-and-questions.md` D-09/D-10, D-11, D-13, and D-17; `NEEDS DECISION` ND-F9-1..5 above.
- **Result:** ND-F9-1..5 remain open as written. This clarification does not resolve or narrow them. They do not block local development; they remain decision gates for the affected product policy/catalog and production uses. No other ambiguity was identified in the merged F9 scope.
- **Evidence limit:** Static source/test inspection only; no tests were executed in this lane.

## Assumptions

- Existing auth, tenancy, audit and Design System from `origin/main` are reused. This run writes artifacts only; Claude's independent implementation review remains required.
- Fixed publish signature has no request key. Exact full-term equality with the offer's CURRENT version is the database replay identity. Replay returns current without insert, pointer change or event. All other payloads, including older non-current terms, append N+1 and move current with one publication event. No new idempotency-key parameter/table is invented.
- Initial unavailability and fixed duration representation are conservative implementation interpretations, not catalog policy. No automatic offer enablement is implied by publication.
- Staff may read unavailable offers/history within their workspaces; future sellable selection filters `available` and uses `current_version_id`. F10/F12 implement token issuance, purchase snapshots and subscriptions, not F9.
- Price entry is in explicitly labeled minor units. Currency-aware display follows currency minor-unit metadata; unknown format-valid codes fall back to an exact minor-unit display with the code instead of guessing an exponent.
- No registration links, subscriptions, installment schedules, earned-commission calculations, ledger/payment/refund flows, clients, exports or catalog seeding are implemented here. D-13/D-17 are preserved as downstream contracts, not broadened into F9 work.

## Constitution Check

I: active membership, two walls, composite tenant relations and negative tests. II/V: exact money and immutable version snapshots. III/IV: PO governance, deny-by-default commission, explicit unresolved catalog policy. VI: no automated people decisions. VII: append-only business-only audit and no logging. VIII: Design System AR/EN and required states. IX: atomic locks and database replay handling. Platform/workflow: one forward migration during implementation, local-only validation, no deployment, independent reviewer gates. No constitutional exception requested.
