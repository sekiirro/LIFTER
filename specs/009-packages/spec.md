# Feature Specification: Packages & Package Versions (P1-F9)

**Feature Branch**: `009-packages`
**Created**: 2026-10-27  
**Last Updated**: 2026-11-04  
**Status**: Clarified S31 amendment — approved market/type/currency rules recorded; open PO decisions block parts of implementation.
**Input**: P1-F9, approved architect/reviewer design supplied for this run. Sources: [BRD](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md) lines 30, 40–41, 53–54, 102, 196, 317; [decision register](../../docs/04-changes-and-questions.md) D-09/D-10, D-11, D-13, D-17; [Constitution v1.4.0](../../.specify/memory/constitution.md) I–III, V, VII–IX. Later decisions supersede historical BRD installment/refund wording. S31 sources: S31-PO-4 and S31-PO-5 (S31-Q4), quoted verbatim in `## Clarifications` below and repeated in the PO decision register; those in-repository sections are the resolvable record, so no machine-local path is required.

## Clarifications

### Session 2026-11-04

The following PO decisions are recorded verbatim. The S31-PO-5 decision supersedes only the
authorship part of S31-PO-4 SK-009-01; its market/type/currency and no-conversion rules stand.

- S31-PO-4 SK-009-01: "Workspace Owners can create unlimited distinct packages by market (Egypt/international) and type (year-round/promotional). Egypt packages: EGP only. International packages: EGP, USD, SAR. No assumed currency conversion."
- S31-PO-5 (S31-Q4, supersedes the authorship part of the above): "S31-Q4: Approve Option B. Platform Owner exclusively creates, names, prices, and controls multiple independent packages per workspace, including year-round and promotional offers. Egypt packages use EGP only; international packages allow EGP/USD/SAR. Workspace Owners cannot create or price packages. Update PO register/specs, delegate implementation, and preserve all review and merge gates." (Option B text: "Keep F9's PO-only authorship; add the market (Egypt/international) and type (year-round/promotional) fields and the currency rule (Egypt = EGP; international = EGP/USD/SAR). Smaller change.")
- S31-PO-4 SK-009-04: "Keep both denied (Recommended)" — option text: "Least privilege; current behaviour." (Sales and Trainer commission visibility stays denied.)

Resolved interpretations from those records: Platform Owner (PO) exclusively creates, names,
prices and controls packages; Workspace Owners (WO), Sales and Trainers cannot create or price;
"unlimited distinct packages" means there is no package-count cap or quota; allowed currencies are
market-conditional (Egypt = EGP only; International = EGP/USD/SAR); no currency conversion is
assumed; and Sales/Trainer commission visibility remains denied. Market/type are package attributes
and are readable by the PO and by any role already permitted to read the owning package record under
FR-008; this grants no new audience. Any other open point is listed under the PO decision register
below; no unlisted ambiguity is treated as resolved.

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

### User Story 5 - Manage independent market and offer-type packages (Priority: P1)

The PO can manage multiple independent packages in one workspace, each explicitly classified as
Egypt or International and Year-round or Promotional. Packages do not compete for a single
workspace slot or a package-count quota.

**Why this priority**: The S31 decision adds the commercial dimensions required for distinct
packages while preserving PO-only governance and immutable terms.

**Independent Test**: With two existing packages in one workspace, have the PO create and publish
another distinct package under the approved market/type rules; verify all three remain independent
and no count limit is encountered.

**Acceptance Scenarios**:

1. **Given** a workspace already containing distinct packages, **When** the PO creates another package with a distinct canonical code and approved market/type attributes, **Then** it becomes another independent package identity in that workspace without replacing or merging an existing package.
2. **Given** any number of existing packages in a workspace, **When** the PO creates one more distinct package, **Then** no package-count quota, cap or workspace package slot rejects it.
3. **Given** a WO, Sales or Trainer, **When** they attempt to create, name or price a package in their own workspace, **Then** the request is denied before any package, offer, version or audit row is created.

### User Story 6 - Publish and display prices in an approved currency (Priority: P1)

The PO publishes a price only in a currency permitted by the package's market. Every authorized
reader sees the stored amount with its own currency; no amount is converted or combined with an
amount in another currency.

**Why this priority**: The approved currency matrix and no-conversion rule are financial-truth
requirements and must be enforced at publication; downstream propagation is covered only when
SK-009-09 is answered.

**Independent Test**: Exercise the full Egypt/International currency matrix and publish/read two
packages in different currencies in one workspace; verify accepted/rejected publications, exact
own-currency display and absence of conversion or cross-currency totals.

**Acceptance Scenarios**:

1. **Given** an Egypt package, **When** the PO publishes EGP terms, **Then** publication succeeds and the version stores and displays that amount only in EGP.
2. **Given** an Egypt package, **When** the PO attempts to publish USD or SAR terms, **Then** publication is rejected and no version, pointer change or publication event is created.
3. **Given** an International package, **When** the PO publishes EGP, USD or SAR terms, **Then** each permitted publication succeeds in its own currency and no derived or converted amount is stored or shown.
4. **Given** one workspace has packages shown in different currencies, **When** an authorized user reviews them, **Then** each amount appears with its own currency and the interface exposes no cross-currency total.
5. **Given** an existing published package version, **When** the S31 rules are introduced, **Then** its identity and stored financial terms remain unchanged; later terms are published as a new immutable version.

### Edge Cases

- Empty, whitespace-only or over-120-character labels; malformed slug; missing commission (zero is explicit and valid), negative price/rate, excessive rate, fractional days and unsafe numeric conversion are rejected.
- Currency must have three uppercase ASCII letters and, after the S31 rule, must also be permitted by market: Egypt accepts only EGP; International accepts EGP, USD or SAR. Other format-valid currencies are rejected for both markets.
- An International package priced in EGP remains an International package; stored currency MUST NOT be used to infer or rewrite market.
- Packages in one workspace may carry different currencies. They remain separate monetary values; no converted amount, exchange rate or cross-currency total is derived.
- Existing rows have no approved market/type classification. No legacy default, currency-based inference or silent backfill is permitted before SK-009-05 is resolved.
- The entity that owns market/type, whether either value is mutable, and what `Promotional` changes remain NEEDS PO under SK-009-06 and SK-009-07; implementation MUST NOT guess them.
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
- **FR-015**: Every package MUST have exactly one market attribute with value `Egypt` or `International`, authored and controlled by the PO on the entity selected by SK-009-06, and readable under the existing FR-008 package-read scope. The attribute value MUST NOT be inferred from a stored currency. **[NEEDS PO: SK-009-05 and SK-009-06 — legacy-row classification, owning entity and mutability are not decided.]**
- **FR-016**: Every package MUST have exactly one type attribute with value `Year-round` or `Promotional`, authored and controlled by the PO on the entity selected by SK-009-06, and readable under the existing FR-008 package-read scope. The type value itself MUST NOT imply unapproved date, visibility or availability behavior. **[NEEDS PO: SK-009-06 and SK-009-07 — owning entity, mutability and promotional behavior are not decided.]**
- **FR-017**: A published package version's currency MUST be EGP when its package market is Egypt. When its package market is International, its currency MUST be EGP, USD or SAR. The database and application validation walls MUST reject every other market/currency combination before any version, pointer or event is created (S31-PO-4 SK-009-01; S31-PO-5).
- **FR-018**: A price MUST be stored, displayed, snapshotted and used only in its own currency. The platform MUST NOT derive or perform currency conversion, MUST NOT store an assumed exchange rate, and MUST NOT calculate a total across currencies (S31-PO-4 SK-009-01; Constitution II).
- **FR-019**: The PO MUST be able to create unlimited distinct packages per workspace. No package-count cap, quota or single-package-per-workspace limit may be introduced. Each distinct package MUST retain an independent identity, current-version pointer and immutable version sequence (S31-PO-4 SK-009-01; S31-PO-5).
- **FR-020**: Platform Owner exclusively MUST create, name, price and control packages, including market/type attributes and availability. Workspace Owners, Sales and Trainers MUST NOT create, name or price packages in any workspace, including their own workspace. FR-001, FR-007 and FR-012 remain unchanged and continue to enforce this rule (S31-PO-5).
- **FR-021**: Introducing market, type and market-conditional currency rules MUST preserve every existing published package version's identifier and its stored price_minor, currency, commission and duration terms unchanged, as defined by SC-011, and MUST NOT update, delete, truncate or silently backfill package-version terms. A changed priced term MUST remain a new immutable version under FR-005 and FR-006 (Constitution II/V).

### Key Entities

- **Package**: platform-level canonical code and immutable creation attribution. Multiple canonical packages may coexist in one workspace; there is no package-count quota.
- **Package offer**: a workspace's sellable package/duration identity, availability and current published version. The final owner and mutability of the S31 market/type attributes are **[NEEDS PO: SK-009-06]**.
- **Package version**: immutable numbered terms: authored bilingual names, price in its own currency, commission, duration snapshot and publication attribution. Market/type are not added to historical version terms unless the PO explicitly approves that snapshot model under SK-009-06.
- **Market**: approved attribute value `Egypt` or `International`; it controls the permitted currency set but is never inferred from a stored currency.
- **Package type**: approved attribute value `Year-round` or `Promotional`; every behavior beyond the attribute value itself is **[NEEDS PO: SK-009-07]**, so no date, visibility or availability behavior is assumed.
- **Audit event**: append-only record of one actual creation, publication or availability change.

## Success Criteria _(mandatory)_

- **SC-001**: 100% of role/workspace fixture cases match the read and mutation rules; zero foreign-workspace or unauthorized commission values are returned.
- **SC-002**: Across simultaneous first and later distinct publications, zero duplicate offers/version numbers occur and successful versions are consecutively numbered; identical-to-current replays add zero versions/events; reverting to older terms appends N+1 and advances current.
- **SC-003**: Every attempted update/delete/truncate of published history is refused in the all-role guard tests; old terms remain byte-for-byte unchanged after a new publication or availability change.
- **SC-004**: Each successful actual change yields exactly one matching audit event and every rejected or identical-to-current replayed request yields zero new change events; reverting to older terms yields one publication event; zero PII fields occur in package audit details.
- **SC-005**: PO can complete create → publish → enable in both AR and EN; all required states are exercised, keyboard operation succeeds and automated accessibility checks find zero violations in tested markup.
- **SC-006**: All preset/custom boundary cases, required values and supported-currency minor-unit formatting fixtures pass without precision loss or invented catalog data.
- **SC-007**: 100% of newly created workspace packages carry exactly one approved market value and one approved type value; 100% of same-workspace distinct package fixtures coexist independently; 0 package-count cap/quota failures occur.
- **SC-008**: Across the complete Egypt/International × EGP/USD/SAR matrix, 100% of permitted combinations publish successfully and 100% of prohibited combinations fail before any version, pointer or event mutation; the Egypt+EGP and International+EGP/USD/SAR cases are each covered.
- **SC-009**: 100% of displayed and stored package amounts retain their own currency and exact minor-unit value; 0 converted/derived amounts, assumed exchange rates or cross-currency totals are produced on package surfaces. Downstream registration/subscription/installment/commission/payment/refund behavior is covered only after SK-009-09 is answered.
- **SC-010**: Across the full role × own/foreign workspace matrix, 100% of valid PO create/name/price/control attempts succeed and 100% of WO/Sales/Trainer create/name/price attempts are denied; Sales/Trainer commission remains absent from every supported read path.
- **SC-011**: After the forward schema change, 100% of pre-existing package-version identifiers and stored price/currency/commission/duration terms remain unchanged, and 0 historical version rows are updated, deleted, truncated or inferred into a market/type classification.
- **SC-012**: 100% of market/type display strings come byte-for-byte from a PO-approved Arabic/English record; 0 unreviewed or machine-translated market/type copy ships in UI, errors or fixtures.

## PO decision register and NEEDS DECISION

### Closed by S31

- **ND-F9-1 — Allowed currencies: CLOSED** by S31-PO-4 SK-009-01 and S31-PO-5: Egypt packages use EGP only; International packages allow EGP/USD/SAR; no assumed conversion. A generic three-letter format check is no longer sufficient.
- **ND-F9-4 — Sales/Trainer commission visibility: CLOSED** by S31-PO-4 SK-009-04: both remain denied. WO visibility remains as approved in BRD 41.
- **Package authorship conflict: CLOSED** by S31-PO-5 / S31-Q4: PO only. WO cannot create or price packages. FR-001, FR-007 and FR-012 are unchanged.
- **Package count: CLOSED** by S31-PO-4 SK-009-01 and S31-PO-5: "unlimited distinct packages" means no package-count cap or quota.

### Open — implementation blockers

- **ND-F9-6 / SK-009-05 — Existing-row classification**: no approved mapping or legacy state for existing offers/versions; no currency-based inference or default is permitted.
- **ND-F9-7 / SK-009-06 — Market/type ownership and mutability**: workspace offer, canonical package or version snapshot, and whether values may change are undecided.
- **ND-F9-8 / SK-009-07 — Promotional behavior**: classification/display, date window, visibility and availability semantics are undecided.
- **ND-F9-9 / SK-009-08 — Arabic/English labels**: exact approved market/type copy is unavailable.
- **ND-F9-10 / SK-009-09 — Downstream currency relationship**: same-currency propagation through registration/installments/subscriptions/commission/refunds is not yet explicitly approved for S31.
### Existing open items retained

- **ND-F9-2 — Custom-duration bounds**: only ≥1 day is enforced as business policy; storage integer limits remain technical constraints.
- **ND-F9-3 — Actual catalog**: tiers, allowed duration combinations, names, prices and commission rates (BRD 317) are **NEEDS SOURCE CONFIRMATION**. PO enters data; no YBS defaults or seed catalog.
- **ND-F9-5 — PO navigation placement**: carries F2 ND-5; link only from signed-in landing for now.

The S31 open items are explicit blockers for the affected migration, UI and downstream-contract work;
they are not resolved by this specification. Existing [production readiness](../../docs/07-production-readiness.md) gates remain open; this feature authorizes no deployment or cloud migration.

## Assumptions

- Existing auth, tenancy, audit and Design System from `origin/main` are reused. This run writes artifacts only; Claude's independent implementation review remains required.
- The shipped F9 implementation is PR #9 merge `b565d4c` (implementation tip `b359985`). The S31 delta is a new forward migration and never edits `20261029120000_packages.sql` or existing package-version terms.
- The approved market/type enum values and market-conditional currency set are fixed. Their exact owning entity, mutability, legacy-row representation and promotional behavior remain NEEDS PO; implementation MUST NOT choose defaults.
- Currency remains an immutable published-term concern in the shipped model. The final propagation contract through F10/F12 is conditional on SK-009-09; no conversion is approved under any option.
- Fixed publish signature has no request key. Exact full-term equality with the offer's CURRENT version is the database replay identity. Replay returns current without insert, pointer change or event. All other payloads, including older non-current terms, append N+1 and move current with one publication event. No new idempotency-key parameter/table is invented.
- Initial unavailability and fixed duration representation are conservative implementation interpretations, not catalog policy. No automatic offer enablement is implied by publication.
- Staff may read unavailable offers/history within their workspaces; future sellable selection filters `available` and uses `current_version_id`. F10/F12 implement token issuance, purchase snapshots and subscriptions, not F9.
- Price entry is in explicitly labeled minor units. Under the S31 rule only EGP, USD and SAR may enter a package version; currency-aware display follows their minor-unit metadata without guessing an exponent.
- No registration links, subscriptions, installment schedules, earned-commission calculations, ledger/payment/refund flows, clients, exports or catalog seeding are implemented here. D-13/D-17 are preserved as downstream contracts, not broadened into F9 work.

## Constitution Check

I: active membership, two walls, composite tenant relations and negative tests. II/V: exact money and immutable version snapshots. III/IV: PO governance, deny-by-default commission, explicit unresolved catalog policy. VI: no automated people decisions. VII: append-only business-only audit and no logging. VIII: Design System AR/EN and required states. IX: atomic locks and database replay handling. Platform/workflow: one forward migration during implementation, local-only validation, no deployment, independent reviewer gates. No constitutional exception requested.
