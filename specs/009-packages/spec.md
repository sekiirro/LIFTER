# Feature Specification: Packages & Package Versions (P1-F9)

**Feature Branch**: `009-packages`
**Created**: 2026-10-27  
**Last Updated**: 2026-11-08
**Status**: S33-PO-6, S34-PO-1, S34-PO-2, S34-PO-6 (PD-S34-NEW-01=A, package row is the category), S35-PO-1 (PD-S34-NEW-02=A, canonical market literal `Egypt`/`International` as wire and stored value), S36-PO-2 and S36-PO-3 F9 decisions are recorded. The prior FX-rounding, FX business-day/publication and optional promotion-bound ambiguities are resolved; no open ambiguity remains in those scopes. S43 tier structure and label-authority questions remain open below. UI copy beyond the four approved Arabic/English market/type label pairs remains BLOCKED-COPY.
**Input**: P1-F9, approved architect/reviewer design supplied for this run. Sources (PO records are cited by decision ID and quoted verbatim in this document, not by machine-local path): [BRD](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md) lines 30, 40–41, 53–54, 102, 196, 317; [decision register](../../docs/04-changes-and-questions.md) D-09/D-10, D-11, D-13, D-17; [Constitution v1.4.0](../../.specify/memory/constitution.md) I–III, V, VII–IX. Later decisions supersede historical BRD installment/refund wording. S31 sources: S31-PO-4 and S31-PO-5 (S31-Q4). S32 source: S32-PO-4, quoted verbatim in `## Clarifications` below and in the PO decision register.

## Clarifications

### Session 2026-11-05 — S33-PO-6 and S34-PO-1 (binding)

Decision sources (quoted verbatim in this document by ID; the underlying PO records are held outside the repository and are not required to review this spec): S31-PO-4, S31-PO-5, S32-PO-4, S33-PO-6, S34-PO-1 with architect supersession notes, S34-PO-2, S34-PO-6, and the S33 MCQ transcript.

S34-PO-1 states verbatim:

> **C1=A:** Package market/type immutable.
>
> **C2=A:** PO exclusively controls workspace-specific names, prices, and commissions.
>
> **C3=C:** Egypt/International × Year-Round/Promotional; both markets may operate simultaneously; promotions only during approved periods.
>
> **C4=B:** Dashboard shows actual monthly collections and package-specific commissions, with installment details. Preserve separate accounting/settlement records.
>
> **C5=D:** All existing packages are MOCK DATA. LIFTER has no real clients and is not production-ready. After verifying synthetic-only status and dependencies, safely delete obsolete mock packages and initialize the four-category system. PO will manually configure real packages. Never fabricate prices or commissions.
>
> **LABELS=D:** Exact Arabic labels: «مصر» / «دولي» / «وقت العـروض» / «طول السنـة». English UI labels require separate approval.

S33-PO-6 F9 decision states verbatim:

> "**F9: Approve all S33-01–12 decisions exactly as established in our previous discussion, with these critical clarifications:**"
>
> "Four fixed package slots per workspace (Egypt/International × Year-Round/Promotional), with one active pair at a time."
>
> "Independent workspace pricing, naming and package-specific commission rates."
>
> "Immutable market/type; versioned commercial terms and preserved historical client records."
>
> "Revenue dashboard shows actual monthly payments and platform commission per payment, not total contracted amounts."
>
> "Installment clients are labeled, with a dedicated Installments section showing due dates, paid and remaining amounts."
>
> "Preserve all approved FX, promotion, registration-link and financial rules."
>
> "**Never invent product decisions. Escalate unresolved rules as MCQs.**"

Architect mapping: «مصر» = Egypt; «دولي» = International; «طول السنـة» = Year-Round; «وقت العـروض» = Promotional. Copy these strings exactly, including tatweel (ـ). English market/type labels were pending PO approval at the time of S34-PO-1 and are approved as specified in the S34-PO-2 session below; do not invent labels beyond those four.

S33-PO-6 selected the recommended option for every S33-01..12, with its written clarifications governing: S33-01 row-by-row PO mapping of defaults/classifications; S33-02 soft-retire future real packages from new sales while retaining history; S33-03 transaction timestamp as Africa/Cairo calendar date; S33-04 previous published business-day rate; S33-05 Africa/Cairo start-inclusive/end-exclusive; S33-06 expiry stops new links only, issued links retain snapshots; S33-07 append commercial-term versions while prior assignments retain snapshots; S33-08 Frankfurter after documented verification; S33-09 rate-pending, idempotent retry, exclude from converted totals until fetched; S33-10 EGP→EGP rate exactly 1 and converted commission visible to PO/WO only; S33-11 immutable version snapshot holds market/type; S33-12 settlement events remain separate accounting records, display governed by C4.

Architect supersession notes (not PO words), S34-PO-1, state verbatim:

> "C1=A supersedes S32-PO-4 SK-009-06 \"change ... market ... and type\" and S33-07 append-on-change for market/type (commercial terms stay versioned per S33-PO-6). C2=A confirms S31-PO-5 and fixes the meaning of S33-PO-6 \"Independent workspace pricing, naming and package-specific commission rates\" = per-workspace values set only by the PO. C3=C defines S33-PO-6 \"one active pair at a time\" as: four slots, both markets may operate at the same time, promotional slots only during approved periods. C4=B: dashboard = actual monthly collections + package-specific commission + installment details; separate accounting/settlement records kept (S33-12 settlement model retained internally). C5=D supersedes S32-PO-4 SK-009-05 \"audit ... safely migrate\" and S33-01/S33-02 mapping/soft-retire FOR EXISTING (mock) packages only: verify synthetic-only + dependencies, then delete and initialise four empty categories; no fabricated prices/commissions; S33-02 soft-retire semantics for future real packages are unchanged unless the PO says otherwise."

LABELS=D answered SK-009-08 for Arabic only at the time; S34-PO-2 below supersedes the pending status for the four English labels. The Arabic labels contain tatweel (ـ) exactly as written: «وقت العـروض», «طول السنـة».

### Session 2026-11-05 — S34-PO-2 (binding)

Source: S34-PO-2 (PO record held outside the repository; quoted verbatim below).

> "LIFTER S34 — PO approves English labels: Egypt, International, Promotional, Year-Round."

Approved English market/type labels and exact Arabic mappings:

| English       | Exact approved Arabic | Meaning              |
| ------------- | --------------------- | -------------------- |
| Egypt         | «مصر»                 | Egypt market         |
| International | «دولي»                | International market |
| Promotional   | «وقت العـروض»         | Promotional type     |
| Year-Round    | «طول السنـة»          | Year-Round type      |

Copy the Arabic strings exactly, including tatweel (ـ). S34-PO-2 resolves BLOCKED-COPY only for these four English labels. All other dashboard, Installments, empty, error, and help UI copy remains BLOCKED-COPY. No English copy is inferred beyond these exact labels.

### Session 2026-11-06 — S34-PO-6 (binding; PD-S34-NEW-01 resolved)

S34-PO-6 states verbatim (PO message): "S34-06=A, S34-05=B, PD-S34-NEW-01=A."

Architect note recording option A's meaning: "PD-S34-NEW-01=A: the package row is the category; unique (workspace_id, market, type) on the canonical package identity; versions hold commercial terms."

Only the PD-S34-NEW-01 part of this message concerns F9; S34-06 and S34-05 concern a different feature and are not applied here. The decision settles category persistence identity as follows:

- The **package row is the category**. There is no separate category entity.
- The canonical package identity carries `workspace_id`, immutable market and immutable type, and is unique on `(workspace_id, market, type)`. Each workspace therefore has at most one package row per market/type pair, and exactly four after C5 initialization (FR-019, FR-028).
- **Versions hold commercial terms** (names, price, currency, commission rate). Versions snapshot the offer's fixed duration (no versioned duration change; FR-002, FR-005). Commercial edits append immutable versions (FR-021, FR-029); they never change the package row's market/type.
- The market/currency matrix is evaluated against the market stored on the package row, never against a market supplied with a publication request.

This supersedes the baseline "platform-owned package, no `workspace_id`" shape for the S34 model only; the baseline migration is never edited. A forward migration defines the physical change under T042.

### Session 2026-11-06 — S35-PO-1 (binding; PD-S34-NEW-02 resolved)

S35-PO-1 (PO message, 2026-11-06) states verbatim, in its F9 portion:

> "F9=A (Egypt/International)"

Architect note (not PO words): option A = title-case `Egypt` / `International` as both the wire value and the stored value.

PD-S34-NEW-02 is resolved as option A. The canonical market machine literal is exactly `Egypt` / `International`: the wire value and the stored `market` value are the same title-case tokens, with no wire-to-storage mapping layer. The contract table in `contracts/packages-surface.md`, the normative requirements, the data model, and every validator/RPC/schema/test expectation use the same `Egypt` / `International` literals. The four approved display labels (S34-PO-2) are unchanged; the machine literal and the display label are now identical. The lowercase `egypt`/`international` tokens are retired everywhere in specs/009-packages. The type values (`Year-round`/`Promotional`) are not part of this decision.

Decision summary: C1 supersedes S32-PO-4 SK-009-06 market/type mutability and S33-07 only for market/type; commercial terms remain versioned. C2 confirms S31-PO-5: only PO controls workspace-specific naming/pricing/commission; WO cannot. C3 defines the four category slots, both markets simultaneously operable, and promotions only during approved periods. C4 governs dashboard display and preserves S33-12 separate accounting/settlement records. C5 supersedes SK-009-05 and S33-01/S33-02 for existing mock packages only; S33-02 soft-retire still applies to future real packages. C5 requires synthetic-only and dependency preflight; refuse/escalate for non-synthetic or required financial/audit dependencies. LABELS resolves SK-009-08 for the exact four Arabic labels; S34-PO-2 approves only the four mapped English labels. All other UI copy remains blocked.

All C1–C5, LABELS, S33-01..12, the four English labels in S34-PO-2, PD-S34-NEW-01 (S34-PO-6, option A) and PD-S34-NEW-02 (S35-PO-1, option A: title-case `Egypt`/`International` as the wire and stored value) are resolved. No ambiguity remains in those decisions. Copy beyond the four approved Arabic/English label pairs is BLOCKED-COPY, not a behavioral ambiguity.

### Session 2026-11-08 — S36-PO-2 / S36-PO-3 F9 decisions (binding)

S36-PO-2 states the Governance/FX sentence verbatim:

> FX: retain precise line conversions, round aggregate half-up; preserve existing payment rules.

S36-PO-3 section 2 states the F9 bullet verbatim:

> - **F9:** Use ECB/TARGET calendar and latest prior valid Frankfurter rate; verify currency coverage. Missing promo start = creation; missing end = indefinite.

These decisions close the previously recorded FX-rounding, FX calendar/publication and optional promotion-bound questions:

- Reporting conversion is line-exact: each transaction line uses its immutable rate snapshot without per-line minor-unit rounding. Each reported EGP aggregate sums those exact line conversions and is rounded half-up exactly once to EGP minor units (100 minor units per EGP). Existing payment rules and original transaction/settlement values remain unchanged.
- The transaction timestamp maps to its Africa/Cairo calendar date. ECB/TARGET defines business days; the selected rate is the latest prior valid Frankfurter publication strictly before that transaction date. If a preceding business day has no valid publication, selection continues to the latest earlier valid publication. If no valid prior publication exists, the existing idempotent pending/retry rule applies and the item remains excluded from converted totals until fetched.
- Frankfurter coverage is verified for every supported currency (`EGP`, `USD`, `SAR`). A currency without verified coverage is recorded as a blocker; no rate, provider or fallback is assumed.
- A Promotional category with no start is available from its creation instant; a category with no end is available indefinitely. Any supplied start/end bound remains Africa/Cairo start-inclusive/end-exclusive.

No further product ambiguity remains in the resolved FX rounding, calendar/publication, currency-verification or optional promotion-bound scopes.

### Session 2026-11-09 — S39-R8 and S39-R9 (architect rulings, not PO decisions)

Architect rulings on PR #53 review findings PD-F9-CR-01 and PD-F9-CR-02 are recorded verbatim below. They are architect words, not PO words; no PO approval is claimed for them.

> S39-R8 (#53 PD-F9-CR-01, not a PO question): duration is offer identity, already decided in FR-002 ("workspace, package and duration identity MUST remain fixed"), FR-005 (publication snapshots its duration) and spec.md:262. spec.md:84 "duration terms" is an editorial inconsistency: reword to say versions snapshot the offer's fixed duration (no versioned duration change). No retirement/lifecycle question arises: a different duration is a different offer, and availability changes only through existing PO operations (FR-002); no automatic retirement is added (S38-PO-3).

> S39-R9 (#53 PD-F9-CR-02, not a PO question): the Spec Kit gate section 3 (S29-PO-2) requires the implementer to record evidence in specs/<feature>/traceability.md. Amend tasks.md:10 so the implementer may edit traceability.md and verification evidence files within the task's scope; all other specs/ files stay off-limits to implementers.

Applied: `spec.md:84` now states that versions snapshot the offer's fixed duration (no versioned duration change). `tasks.md:10` permits implementer edits to `traceability.md` and verification evidence files within task scope; all other `specs/` files remain off-limits. No other requirement changed.

### Session 2026-11-04

The following PO decisions are recorded verbatim. The S31-PO-5 decision supersedes only the
authorship part of S31-PO-4 SK-009-01; its market/type/currency and no-conversion rules stand.

- S31-PO-4 SK-009-01: "Workspace Owners can create unlimited distinct packages by market (Egypt/international) and type (year-round/promotional). Egypt packages: EGP only. International packages: EGP, USD, SAR. No assumed currency conversion."
- S31-PO-5 (S31-Q4, supersedes the authorship part of the above): "S31-Q4: Approve Option B. Platform Owner exclusively creates, names, prices, and controls multiple independent packages per workspace, including year-round and promotional offers. Egypt packages use EGP only; international packages allow EGP/USD/SAR. Workspace Owners cannot create or price packages. Update PO register/specs, delegate implementation, and preserve all review and merge gates." (Option B text: "Keep F9's PO-only authorship; add the market (Egypt/international) and type (year-round/promotional) fields and the currency rule (Egypt = EGP; international = EGP/USD/SAR). Smaller change.")
- S31-PO-4 SK-009-04: "Keep both denied (Recommended)" — option text: "Least privilege; current behaviour." (Sales and Trainer commission visibility stays denied.)

Resolved interpretations from those records: Platform Owner (PO) exclusively creates, names,
prices and controls packages; Workspace Owners (WO), Sales and Trainers cannot create or price.
The S31 phrase "unlimited distinct packages" originally meant no package-count cap/quota, but that
package-count interpretation is superseded by FR-019's exactly four fixed category slots per
workspace. Allowed currencies are market-conditional (Egypt = EGP only; International =
EGP/USD/SAR); no currency conversion is assumed; and Sales/Trainer commission visibility remains
denied. Market/type are package attributes
and are readable by the PO and by any role already permitted to read the owning package record under
FR-008; this grants no new audience. Any other open point is listed under the PO decision register
below; no unlisted ambiguity is treated as resolved.

### Session 2026-11-04 - S32-PO-4 (binding)

S32-PO-4 (PO record held outside the repository; quoted verbatim) states:

> "SK-009-05: Audit existing packages and safely migrate them without guessing classifications. Default packages must remain editable.
> SK-009-06: Full package management per workspace: create, edit, delete, rename, change prices, market (Egypt/International), and type (Year-round/Promotional). Platform Owner has full control.
> SK-009-07: Promotional packages support optional start/end dates, automatic expiration, or manual deactivation.
> SK-009-09: Preserve original transaction currencies. Display all revenue and commissions in EGP using historical FX rates fetched automatically via API (Frankfurter or verified equivalent). Snapshot exchange rates per transaction date; never recalculate historical values. Handle API failures safely and distinguish reported revenue from actual settlement.
> Implement through Spec Kit, preserve historical financial records, and follow existing approval gates. Do not reopen approved decisions."

Historical note: at the time of S32-PO-4, its MCQs and SK-009-08 remained open. S33-PO-6 and S34-PO-1 later resolved those product decisions as recorded in the 2026-11-05 Clarifications session above. S31-PO-5 remains binding: only the PO creates, names, prices and controls packages; WO cannot. Egypt is EGP only; International is EGP/USD/SAR; Sales and Trainer cannot see commissions (SK-009-04). Reporting conversion does not change original transaction or settlement currency. Every edit to published commercial terms produces a new immutable version; market/type remain fixed under C1.

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

### User Story 5 - Manage the four fixed market/type categories (Priority: P1)

Each workspace has exactly four package categories: Egypt or International crossed with Year-round or Promotional. The PO manages workspace-specific commercial terms for each category; market/type never changes. Both markets may operate at the same time, and Promotional categories operate only in approved periods.

**Why this priority**: C1–C3 settle immutable category identity, simultaneous markets and approved promotional periods while preserving PO-only commercial governance.

**Independent Test**: Initialize an empty workspace and verify exactly four categories exist; activate both markets, publish allowed commercial terms as PO, and verify a WO cannot configure terms.

**Acceptance Scenarios**:

1. **Given** an initialized workspace, **When** its categories are enumerated, **Then** exactly one each of Egypt/Year-round, Egypt/Promotional, International/Year-round and International/Promotional exists.
2. **Given** an International and an Egypt category, **When** the PO operates both in parallel, **Then** each retains its own status and currency rules without excluding the other market.
3. **Given** a WO, Sales or Trainer, **When** they attempt to create a category or configure its name, price or commission, **Then** the request is denied before mutation.

### User Story 6 - Publish and display prices in an approved currency (Priority: P1)

The PO publishes a price only in a currency permitted by the package's immutable market. Package
prices remain in their authored currency; transaction-date EGP conversion is only for separate
collection/commission reporting under FR-026/FR-031.

**Why this priority**: The approved currency matrix and package-price currency preservation are
financial-truth requirements. Reporting conversion follows the settled S33-PO-6 contract.

**Independent Test**: Exercise the full Egypt/International currency matrix and verify package
prices stay in own currency while collection reporting uses only the approved immutable FX snapshot.

**Acceptance Scenarios**:

1. **Given** an Egypt package, **When** the PO publishes EGP terms, **Then** publication succeeds and the version stores and displays that amount only in EGP.
2. **Given** an Egypt package, **When** the PO attempts to publish USD or SAR terms, **Then** publication is rejected and no version, pointer change or publication event is created.
3. **Given** an International package, **When** the PO publishes EGP, USD or SAR terms, **Then** each permitted publication succeeds in its own currency and package price is never converted.
4. **Given** one workspace has packages shown in different currencies, **When** an authorized user reviews them, **Then** each package price appears with its own currency and no package-price cross-currency total is shown.
5. **Given** an existing published package version, **When** the S31 rules are introduced, **Then** its identity and stored financial terms remain unchanged; later terms are published as a new immutable version.

### Edge Cases

- Empty, whitespace-only or over-120-character labels; malformed slug; missing commission (zero is explicit and valid), negative price/rate, excessive rate, fractional days and unsafe numeric conversion are rejected.
- Currency must have three uppercase ASCII letters and, after the S31 rule, must also be permitted by market: Egypt accepts only EGP; International accepts EGP, USD or SAR. Other format-valid currencies are rejected for both markets.
- An International package priced in EGP remains an International package; stored currency MUST NOT be used to infer or rewrite market.
- Package prices remain separate monetary values; the only approved conversion is per-transaction reporting FX to EGP, with no package-price or mixed-currency total.
- Existing package rows are mocks under C5; no row-by-row category mapping is performed. Delete only after the synthetic-only/dependency preflight in FR-028.
- Market/type are immutable under C1 and S33-11. Promotional boundaries and issued-link effects follow FR-030; these are settled rather than NEEDS PO.
- Custom 90 days and preset 3 months share the same offer key. Its duration representation is fixed at first creation; a conflicting representation is rejected rather than silently editing the offer.
- A lost response followed by a retry identical to current returns the current version id. Any other payload, including older non-current terms, appends N+1 and moves current with one publication event.
- A simultaneous first publish and availability change serialize safely. Publishing never silently re-enables an existing offer.
- A cross-workspace version pointer or offer relation is rejected even when submitted through a privileged SQL test connection.
- Audit failure rolls back the entire mutation. No-op requests, current-pointer maintenance and failed mutations do not create extra business events.
- Service-role and postgres DML cannot update/delete/truncate versions while guards are installed. Administrative DDL bypass is outside the application threat boundary and is tested by deliberate mutation checks.

## Requirements _(mandatory)_

#### S32 package lifecycle and reporting scenarios

1. **Given** existing mock package records, **When** a future removal preflight runs, **Then** it verifies synthetic-only status, enumerates all dependencies, and refuses/escalates without writes if any non-synthetic data or required financial/audit dependency exists; only a clean preflight permits safe mock removal and empty four-category initialization (C5).
2. **Given** a PO-managed category with published commercial versions or downstream client/assignment snapshots, **When** the PO edits its name, price or commission, **Then** a new immutable commercial version is appended and prior versions and snapshots remain unchanged; market/type cannot be edited (C1, C2).
3. **Given** a future real package referenced by historical records, **When** the PO retires it, **Then** it is hidden from new sales while history and issued-link snapshots remain available (S33-PO-6 S33-02/06).
4. **Given** a Promotional package, **When** its optional approved start/end bounds are evaluated, **Then** a missing start makes it available from creation, a missing end makes it indefinite, and every supplied bound uses Africa/Cairo start-inclusive/end-exclusive boundaries; expiry prevents new links without changing already-issued snapshots (S33-PO-6 S33-05/06; S36-PO-3 F9).
5. **Given** a transaction in its original currency, **When** a report is produced, **Then** the original amount/currency and actual settlement remain available, each reporting line is converted exactly using its immutable rate snapshot without per-line minor-unit rounding, and each reported EGP aggregate sums the exact line conversions before one half-up rounding to EGP minor units.
6. **Given** the FX provider is unavailable or returns unusable data, **When** a transaction or report needs a rate, **Then** no fabricated rate or rewritten history is produced and the unresolved failure policy is applied.
7. **Given** an FX API request, **When** the server fetches a rate, **Then** the request contains no client identity, contact, transaction, workspace or other client data.
8. **Given** a transaction whose Africa/Cairo date follows an ECB/TARGET weekend or holiday, **When** FX reporting selects a rate, **Then** it uses the latest prior valid Frankfurter publication strictly before that transaction date, including an earlier valid publication when the preceding business day has none; if no valid prior publication exists, the rate remains pending and the item is excluded from converted totals.

## Functional Requirements

- **FR-001**: Only PO may create a globally unique canonical lowercase-slug package code. Code and creation attribution MUST remain historically recoverable. Existing mock deletion follows the C5 preflight in FR-028; future real-package retirement follows FR-023 and preserves referenced history. Labels MUST NOT identify canonical package codes (BRD 53; S32-PO-4; C5).
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
- **FR-013**: UI MUST use the Design System, Arabic-first RTL and English LTR, existing dark/light themes, responsive keyboard-accessible controls and loading/empty/error states. Prices MUST format exactly from minor units with currency; authored labels MUST never be machine-translated. In this scope, use the four English/Arabic market/type label pairs approved by LABELS and S34-PO-2; dashboard/Installments/empty/error/help copy beyond those labels remains BLOCKED-COPY (Constitution VIII; LABELS).
- **FR-014**: Required verification MUST include role × own/foreign workspace matrices for every RPC/read path, anonymous/non-staff/revoked denial, commission hiding, all-role immutability guards, concurrent publication, duration boundaries, exact audit events without PII, composite-relation rejection, validation/money units, AR/EN route and axe checks, and RLS-catalog/matrix parity (Constitution I; quality gates).
- **FR-015**: Each initialized category MUST have exactly one immutable market value (`Egypt` or `International`; canonical machine literal per S35-PO-1 F9=A), readable under existing FR-008 scope. Each workspace has one category per market/type pair; C5 removal and initialization are governed by FR-028. Market is never inferred from price/currency. (C1, C3, C5; S33-11)
- **FR-016**: Each initialized category MUST have exactly one immutable type value `Year-round` or `Promotional`, readable under existing FR-008 scope. Promotional availability follows FR-030. Type is included in the immutable market/type snapshot required by S33-11. (C1, C3)
- **FR-017**: A published package version's currency MUST be EGP when its package market is Egypt. When its package market is International, its currency MUST be EGP, USD or SAR. The database and application validation walls MUST reject every other market/currency combination before any version, pointer or event is created (S31-PO-4 SK-009-01; S31-PO-5).
- **FR-018**: Package prices MUST remain in their authored currency; the platform MUST NOT convert package prices or calculate cross-currency totals. The only conversion is the S32-PO-4/S33-PO-6 transaction-date FX snapshot to EGP for separate collection/commission reporting, preserving original transaction and settlement amounts. EGP→EGP rate is exactly 1; no assumed rate is allowed. (S31-PO-4, S32-PO-4, S33-PO-6)
- **FR-019**: Each workspace MUST have exactly four category slots: Egypt × Year-round, Egypt × Promotional, International × Year-round, International × Promotional. Both markets may operate simultaneously. Each category is the workspace-scoped package row, unique on `(workspace_id, market, type)` (S34-PO-6). Category identity is immutable; PO-authored commercial terms live on versions and are workspace-specific and versioned. This fixed category model supersedes the prior unlimited-category scope. (C1–C3)
- **FR-020**: Platform Owner exclusively MUST create, name, price and control packages, including market/type attributes and availability. Workspace Owners, Sales and Trainers MUST NOT create, name or price packages in any workspace, including their own workspace. FR-001, FR-007 and FR-012 remain unchanged and continue to enforce this rule (S31-PO-5).
- **FR-021**: Commercial-term edits (workspace-specific name, price, commission and other approved commercial terms) MUST append an immutable version; prior versions and client/assignment snapshots MUST remain unchanged. Market/type are immutable category attributes and cannot be edited as commercial terms. (C1, C2; S33-PO-6)
- **FR-022**: Before any mock-package removal, the target-stack inventory MUST verify synthetic-only status and enumerate all package dependencies; no market/type mapping/classification is performed for existing mocks. (C5; supersedes SK-009-05 and S33-01 for existing mocks)
- **FR-023**: A future real package reference MUST retain its history when retired; retirement hides it from new sales, while prior client, assignment, link and financial snapshots remain unchanged. (S33-PO-6 S33-02/06)
- **FR-024**: Promotional categories support optional approved start/end bounds. A missing start means available from the category's creation instant; a missing end means indefinite. Where a bound exists, Africa/Cairo start-inclusive/end-exclusive boundaries apply; expiry stops new links, and issued links keep their snapshots. (S32-PO-4; S33-PO-6 S33-05/06; S36-PO-3 F9)
- **FR-025**: Dashboard monthly collection reporting MUST use actual collections and show package-specific commission and installment detail; settlement events remain separate accounting records. (C4; S33-12)
- **FR-026**: FX reporting MUST map the transaction timestamp to its Africa/Cairo calendar date, use the ECB/TARGET business-day calendar, and select the latest prior valid Frankfurter publication strictly before that date; if the preceding business day has no valid publication, selection continues to the latest earlier valid publication, and if no valid prior publication exists the existing idempotent rate-pending/retry rule applies with the item excluded from converted totals until fetched. Each reporting line MUST be converted exactly from its immutable rate snapshot without per-line minor-unit rounding; each reported EGP aggregate MUST sum those exact line conversions and be rounded half-up exactly once to EGP minor units (100 minor units per EGP). Frankfurter coverage MUST be verified for every supported currency (`EGP`, `USD`, `SAR`); an uncovered currency is recorded as a blocker and no rate, provider or fallback may be assumed. EGP→EGP uses exactly 1. Original transaction currency, actual settlement and existing payment rules remain unchanged. (S33-PO-6 S33-03/04/08/09/10; S36-PO-2/S36-PO-3)
- **FR-027**: Provider requests MUST exclude client identity/contact, transaction, workspace and other client data. (S32-PO-4; synthetic-only development policy)
- **FR-028**: Before removing existing mock packages, the future implementation MUST verify synthetic-only status and enumerate every target-stack dependency, including foreign keys, registration links, subscriptions, payments, audit rows, and all other package references. Unknown dependency state, any non-synthetic data, or any required financial/audit dependency MUST refuse and escalate before writes. After a complete clean preflight, it may safely delete only obsolete mock packages and initialize exactly four empty categories per workspace with no names, prices, commissions, or fabricated commercial values. Required client, financial and audit history MUST be preserved; partial deletion/initialization MUST NOT be accepted. The C5 cleanup path MUST be explicit and limited to the verified mock target set; it MUST NOT disable or weaken general immutability, audit, RLS or restrictive-reference protections, nor cascade into protected dependencies. The PO configures real packages manually. Category identity follows S34-PO-6: each initialized category is one workspace-scoped package row unique on `(workspace_id, market, type)`; the canonical market literal used for initialization is `Egypt`/`International` per S35-PO-1 F9=A. The concrete mechanism that removes mock package rows without weakening FR-006 immutability, restrictive references, audit or RLS is not specified here; no guard exception is authorized, and the mechanism requires a separate security design and review (T064b, pre-implementation) before T065 implements any deletion; T070 is the post-implementation acceptance review of the implemented deletion path and is not a prerequisite to implementation. (C5)
- **FR-029**: Only the PO may control workspace-specific package names, prices, and package-specific commissions. A WO MUST NOT create, rename, price, or set commissions. Each commercial edit MUST create a new immutable version; prior client/assignment snapshots remain unchanged. (C1, C2; S33-PO-6)
- **FR-030**: Promotional categories/packages MUST be sellable only during their approved availability interval, evaluated in Africa/Cairo. A missing start means the interval begins at the category's creation instant; a missing end means the interval is indefinite. Any supplied start/end bounds remain start-inclusive/end-exclusive. Expiry MUST stop new registration links only; issued links retain their snapshots. (S33-PO-6 S33-05/06; S36-PO-3 F9)
- **FR-031**: The dashboard MUST show actual monthly collections and package-specific commissions with installment-level detail. Settlement/accounting events remain separate records. Converted commission is visible to PO/WO only; Sales/Trainer remain denied. FX reporting follows FR-026: Africa/Cairo transaction date, ECB/TARGET business-day selection of the latest prior valid Frankfurter publication, verified coverage for every supported currency, exact per-line conversion, one half-up rounding of each reported aggregate to EGP minor units, exact 1 for EGP→EGP, and idempotent rate-pending retries excluded from converted totals until fetched. Existing payment rules remain unchanged. (C4; S33-PO-6 S33-03/04/08/09/10/12; S36-PO-2/S36-PO-3)
- **FR-032**: Installment clients MUST be identified as installment clients, and the dashboard MUST provide an Installments section with due dates, paid amounts, and remaining amounts. This specifies data/behavior only; UI copy beyond the four approved English/Arabic market/type label pairs is BLOCKED-COPY. (C4)
- **FR-033**: Market/type labels MUST use exactly the approved pairs Egypt/«مصر», International/«دولي», Promotional/«وقت العـروض», and Year-Round/«طول السنـة», with Arabic strings copied exactly including tatweel. No additional English market/type labels or translations may be introduced beyond these four approved labels. All other UI copy remains BLOCKED-COPY. (LABELS; S34-PO-2)
- **FR-034**: The package model MUST represent the fixed immutable platform tier ranks Silver, Gold, and Platinum, ordered Silver < Gold < Platinum, independently of package price, duration, market/type, and localized display labels. Where the rank is attached and how offers are structured across category rows remain PO-DECISION-NEEDED under S43-F9-MCQ-2; no rank placement is specified until that decision. (S43-PO-6; architect mapping (S43-R7, reconsidered by S43-R9))
- **FR-035**: The package model MUST preserve the PO-approved default tier names in English and Arabic and allow workspace renaming without changing the fixed rank concept. The actor allowed to edit names remains PO-DECISION-NEEDED under S43-F9-MCQ-3. (S43-PO-6/7; architect mapping (S43-R7/R8))
- **FR-036**: Upgrade eligibility MUST compare the fixed rank concept and duration according to S43-PO-5 item 2 and S43-PO-6. Its data placement and offer structure remain blocked by S43-F9-MCQ-2; price rules remain as specified by the existing F13 requirements. (S43-PO-5 item 2, S43-PO-6; architect mapping (S43-R7, reconsidered by S43-R9))

#### S34 acceptance scenarios

1. **Given** a workspace with initialized categories, **When** the category set is read, **Then** exactly one of each market × type pair exists, both markets may be active together, and the category identity is immutable.
2. **Given** a promotional category outside its approved period, **When** a new link is requested, **Then** no link is created; after expiry existing issued links retain their snapshots.
3. **Given** a PO changes a workspace-specific name, price or commission, **When** the change is published, **Then** the new commercial version is immutable and prior client/assignment snapshots remain unchanged; a WO attempt is denied.
4. **Given** a month with synthetic collection, commission and installment fixtures, **When** PO/WO views the dashboard, **Then** actual monthly collections, package-specific commission, due/paid/remaining details and separate settlement records are visible; Sales/Trainer cannot retrieve commission.
5. **Given** an FX rate is pending, **When** converted totals are rendered, **Then** the pending transaction is excluded until an idempotent retry obtains a verified rate; EGP→EGP uses exactly 1.
6. **Given** a C5 preflight finds non-synthetic data, a required financial/audit dependency, or unknown dependency state, **When** removal is requested, **Then** it refuses/escalates with zero writes. **Given** a complete clean synthetic-only inventory, **When** removal completes, **Then** only obsolete mocks are safely deleted, required history is preserved, and exactly four empty categories are initialized without commercial values; partial completion is not accepted.
7. **Given** any market/type UI surface, **When** labels render, **Then** they use only the approved pairs Egypt/«مصر», International/«دولي», Promotional/«وقت العـروض», Year-Round/«طول السنـة»; all other UI copy remains BLOCKED-COPY.
8. **Given** packages are compared for upgrade eligibility, **When** rank and duration are evaluated, **Then** the fixed tier rank concept is Silver < Gold < Platinum and the approved duration/price rules apply; the offer structure and rank placement remain blocked by S43-F9-MCQ-2.
9. **Given** a workspace renames a tier in one locale, **When** its display name changes, **Then** the fixed rank concept remains unchanged; actor authorization remains blocked by S43-F9-MCQ-3.

### Key Entities

- **Package category**: one of four immutable market × type identities per workspace, represented by the workspace-scoped package row itself (S34-PO-6; no separate category entity), unique on `(workspace_id, market, type)`. Commercial values live on versions and are workspace-specific; initialization supplies no real commercial values.
- **Package offer**: the logical workspace sellable package/duration identity, availability and current published version of one category package row; it references that row by `package_id` and MUST NOT pair a package row with a different workspace.
- **Package version**: immutable numbered commercial terms; edits append a version and preserve client/assignment snapshots. Market/type remain immutable category attributes (C1; S33-11).
- **Market**: approved attribute with display labels Egypt and International (S34-PO-2 and S35-PO-1 F9=A; the canonical machine literal is exactly `Egypt`/`International`, the same title-case tokens as the wire and stored value); it controls the permitted currency set but is never inferred from a stored currency.
- **Package type**: approved value `Year-round` or `Promotional`; Promotional availability follows the Africa/Cairo half-open period and issued-link rules in FR-030.
- **Audit event**: append-only record of one actual creation, publication or availability change.

## Success Criteria _(mandatory)_

- **SC-001**: 100% of role/workspace fixture cases match the read and mutation rules; zero foreign-workspace or unauthorized commission values are returned.
- **SC-002**: Across simultaneous first and later distinct publications, zero duplicate offers/version numbers occur and successful versions are consecutively numbered; identical-to-current replays add zero versions/events; reverting to older terms appends N+1 and advances current.
- **SC-003**: Every attempted update/delete/truncate of published history is refused in the all-role guard tests; prior versions keep their identifier and stored price, currency, commission and duration terms unchanged after a new publication or availability change.
- **SC-004**: Each successful actual change yields exactly one matching audit event and every rejected or identical-to-current replayed request yields zero new change events; reverting to older terms yields one publication event; zero PII fields occur in package audit details.
- **SC-005**: PO can complete create → publish → enable in both AR and EN; all required states are exercised, keyboard operation succeeds and automated accessibility checks find zero violations in tested markup.
- **SC-006**: All preset/custom boundary cases, required values and supported-currency minor-unit formatting fixtures pass without precision loss or invented catalog data.
- **SC-007**: 100% of workspaces have exactly four market/type category pairs and both markets are independently operable; no extra category identity is created.
- **SC-008**: Across the complete Egypt/International × EGP/USD/SAR matrix, 100% of permitted combinations publish successfully and 100% of prohibited combinations fail before any version, pointer or event mutation; the Egypt+EGP and International+EGP/USD/SAR cases are each covered.
- **SC-009**: 100% of package prices retain their authored currency; 0 converted package prices, assumed rates or cross-currency totals are produced. Reporting-only transaction FX follows FR-031 and preserves actual settlement.
- **SC-010**: Across the full role × own/foreign workspace matrix, 100% of valid PO create/name/price/control attempts succeed and 100% of WO/Sales/Trainer create/name/price attempts are denied; Sales/Trainer commission remains absent from every supported read path.
- **SC-011**: For commercial-term edits, 100% of prior versions and client/assignment snapshots remain unchanged. Existing mock-package disposition follows the C5 preflight in FR-028 and never deletes required financial/audit history.
- **SC-012**: 100% of category labels match the four approved Arabic/English pairs exactly, including Arabic tatweel; all other UI copy remains blocked.

- **SC-013**: C5 target-stack preflight accounts for 100% of package rows and package references; any non-synthetic or unsafe dependency fixture refuses with zero writes.
- **SC-014**: 100% of PO commercial edits append a version and leave prior versions, client records, and assignment snapshots unchanged; WO mutation attempts are denied.
- **SC-015**: Promotional tests pass for missing-start availability from creation, missing-end indefinite availability, and every supplied Africa/Cairo inclusive-start/exclusive-end instant; expiry prevents new links and changes zero issued-link snapshots.
- **SC-016**: For every synthetic monthly fixture, dashboard collection totals reconcile to actual collection source rows and package-specific commission totals reconcile to the applicable commission calculation or commission source rows; commission is not assumed equal to gross collections. Installment due/paid/remaining detail matches its source, and settlement records remain separately queryable.
- **SC-017**: FX fixtures use the Africa/Cairo transaction date, ECB/TARGET business days and the latest prior valid Frankfurter publication, including weekend, holiday and missing-publication fallbacks; every line remains exact, each reported aggregate is rounded half-up once to EGP minor units, EGP→EGP is 1, and pending rates are excluded until idempotent retry succeeds.
- **SC-018**: Captured provider requests contain no client identity/contact, transaction, workspace, or other client data; Frankfurter use is gated on recorded verification checks.

- **SC-019**: In target-stack preflight tests, 100% of non-synthetic, required financial/audit, and unknown dependency cases refuse with zero writes; a complete clean synthetic-only case safely deletes obsolete mock packages while preserving required history. It initializes exactly four empty category package rows per workspace (one per `(workspace_id, market, type)`) with zero fabricated names/prices/commissions; the market literal used is `Egypt`/`International` per S35-PO-1 F9=A.
- **SC-020**: Every workspace has exactly four market/type pairs; 100% of market/type mutation attempts fail; PO commercial edits append versions; WO attempts are denied; 100% of prior client/assignment snapshots remain unchanged.
- **SC-021**: Promotion tests cover missing-start availability from creation, missing-end indefinite availability and exact Africa/Cairo start-inclusive/end-exclusive boundaries for supplied bounds; expiry blocks all new links after an approved end and changes zero already-issued link snapshots.
- **SC-022**: Dashboard fixtures reconcile monthly collections to actual collection source rows and package-specific commissions to applicable commission calculations or commission source rows, show installment details, preserve separate settlement rows, exclude pending FX from converted totals, use exact per-line conversion with one half-up aggregate rounding to EGP minor units, use 1 for EGP→EGP, and deny commission to all Sales/Trainer fixtures.
- **SC-023**: 100% of category label output matches the four approved English/Arabic pairs exactly, including Arabic tatweel; zero unapproved market/type labels or unapproved installment/report UI copy is shipped.
- **SC-024**: The tier model preserves exactly the fixed Silver < Gold < Platinum rank concept; no storage placement or category assignment is asserted before S43-F9-MCQ-2 is answered.
- **SC-025**: Tier display defaults match the PO-approved EN/AR names byte-exactly; renaming does not change the fixed rank concept. Edit authorization remains blocked by S43-F9-MCQ-3.
- **SC-026**: Upgrade eligibility fixtures use the approved rank/duration and F13 price rules after S43-F9-MCQ-2 resolves offer structure and rank placement; this dependent scope remains blocked.

## Clarifications / PO-decision register - S43-PO-6/7 package-tier amendment (2026-11-10)

### S43-PO-6 tier hierarchy

S43-PO-6 (2026-11-10): Fixed tier hierarchy: Silver < Gold < Platinum. Workspaces can rename tiers, but their underlying rank never changes.

**architect mapping (S43-R7, reconsidered by S43-R9):** Preserve the immutable platform rank concept and its fixed values/order, but defer which offer/category entity stores the rank until the tier-structure decision. Workspace-specific localized display names may be edited without changing rank.

### S43-PO-7 Arabic default tier names

S43-PO-7 (2026-11-10): Arabic tier names are سيلفر، جولد، بلاتينيوم.

**architect mapping (S43-R8):** The Arabic defaults correspond in order to Silver, Gold, and Platinum; copy the PO source bytes exactly. English defaults Silver, Gold, and Platinum are approved by S43-PO-6.

### PO-DECISION-NEEDED

- **S43-F9-MCQ-2 - tier structure and rank placement (replaces prior MCQ-2):** where: specs/009-packages/spec.md:327-329 (FR-034..036), :340-341 (scenarios 8-9), data-model.md:230-232, contracts/packages-surface.md:165-167. Question: what offer structure should carry the fixed tier hierarchy? Options: (A) multiple ranked offers per category (recommended); (B) one fixed tier per category; (C) replace the four-category model. Implications: A permits Silver/Gold/Platinum offers inside each market/type category and requires rank at the offer level; B preserves one offer per category and makes the category's tier singular; C changes category identity and initialization, with broader package setup and consumer impacts. Recommendation: A, because it preserves the four market/type categories while allowing multiple tier offers in each. Blocked: final offer/rank placement, affected F9 data/API/initializer requirements and dependent F13 rank-based upgrade implementation/tests. Prior S43-F9-MCQ-2 text is superseded, not rewritten.
- **S43-F9-MCQ-3 - tier-label authority:** where: specs/009-packages/spec.md:328 (FR-035) and :313 (FR-020), contracts/packages-surface.md:165-167. Question: who may edit workspace-localized tier names? Options: (A) PO only; (B) WO only; (C) PO globally and WO in that WO's workspace (Sol recommendation). Implications: A gives centralized global control; B limits changes to workspace owners; C enables global defaults plus workspace-local renames, requiring scoped mutation/audit rules. Recommendation: C. Blocked: mutation permissions, audit actor policy and role-authorization acceptance tests. This MCQ is distinct from rank/offer placement.
- **S43-F18-MCQ-1 - historical nutrition exports:** where: specs/018-nutrition-planner/contracts/nutrition-api.md:93 and specs/018-nutrition-planner/research/po-decision-matrix.md:49 (Sol-9 finding). Question: when exporting a historical nutrition revision after its selection has been removed or invalidated, what should the export show? Options: (A) that revision's last valid client selection (Sol recommendation); (B) coach original only; (C) require an explicit authorized export choice. Implications: A requires retaining/reconstructing revision-scoped selection; B loses the selected state from the historical export; C adds an export-time choice and authorization path. Recommendation: A, preserving the historical delivered revision. Blocked: F18 historical export representation and its acceptance fixtures. This question is recorded here for the shared PR; no F18 files are changed in this lane.
- **S43-F13-MCQ-12 - post-lapse upgrade anchor:** where: specs/013-freeze-renewal-refunds/spec.md:461, 470, 652 and T042. Question: after an expired renewal restarts service today, what date anchors a later equal/longer upgrade? Options: (A) the restarted paid-period start (Sol recommendation); (B) the lifetime first activation date. Implications: A preserves the restarted purchase period; B can count elapsed time before the restarted period. Recommendation: A. Blocked: post-lapse upgrade start-date rule and acceptance fixtures for this case.
- **S43-F13-MCQ-13 - cross-currency upgrade:** where: specs/009-packages/spec.md:312, 321, 328 and specs/013-freeze-renewal-refunds/spec.md:461, T042. Question: may an upgrade credit one currency against a package priced in another? Options: (A) same-currency upgrades only (Sol recommendation); (B) permit cross-currency upgrades using a PO-approved conversion policy. Implications: A refuses mixed-currency upgrade pairs without writes; B needs an authoritative conversion source, date/rate, rounding, audit and revenue treatment. Recommendation: A, because existing package currencies do not define conversion for upgrade credit. Blocked: cross-currency upgrade eligibility, conversion policy and dependent financial fixtures.

## PO decision register

### Resolved

- S31-PO-4 / S31-PO-5: currency matrix, no assumed conversion, PO-only authorship, and Sales/Trainer commission denial remain binding.
- S32-PO-4: lifecycle, promotion, original-currency and historical FX scope remains binding except where superseded below.
- S33-PO-6 S33-01..12: recommended options are settled, with written clarifications governing.
- S34-PO-1 C1–C5 and LABELS: resolved above. C1 supersedes S32-PO-4 SK-009-06 market/type mutability and S33-07 for market/type only. C2 confirms PO-only control. C3 defines four logical slots and simultaneous markets. C4 governs dashboard display and preserves settlement records. C5 supersedes SK-009-05 and S33-01/S33-02 for existing mock packages only; S33-02 soft-retirement remains for future real packages. LABELS resolves the Arabic strings; S34-PO-2 approves their English mappings.
- S34-PO-6 (verbatim: "S34-06=A, S34-05=B, PD-S34-NEW-01=A."; architect note: "PD-S34-NEW-01=A: the package row is the category; unique (workspace_id, market, type) on the canonical package identity; versions hold commercial terms."): PD-S34-NEW-01 is resolved as option A. Only that part applies to F9.
- S35-PO-1 (verbatim, F9 portion: "F9=A (Egypt/International)"; architect note (not PO words): option A = title-case `Egypt` / `International` as both the wire value and the stored value): PD-S34-NEW-02 is resolved as option A. The canonical market machine literal is exactly `Egypt` / `International`; the wire value and the stored value are identical, with no mapping layer. Display labels and machine literal are the same tokens; type values are not part of the decision.
- S36-PO-2 (Governance/FX sentence, verbatim):

  > FX: retain precise line conversions, round aggregate half-up; preserve existing payment rules.

- S36-PO-3 (section 2 F9 bullet, verbatim):

  > - **F9:** Use ECB/TARGET calendar and latest prior valid Frankfurter rate; verify currency coverage. Missing promo start = creation; missing end = indefinite.

  These decisions resolve the former FX-rounding blocker and the optional promotion-bound ambiguity. FR-026/FR-031 now require exact per-line conversion, one half-up rounding of each reported aggregate to EGP minor units, ECB/TARGET business-day selection of the latest prior valid Frankfurter publication, existing pending/retry behavior when none exists, verified coverage for every supported currency, and unchanged payment rules. FR-024/FR-030 now define missing start as availability from creation and missing end as indefinite.

- No open product ambiguities remain from S33-01..12, C1–C5, LABELS, PD-S34-NEW-01, PD-S34-NEW-02 or the S36-PO-2/S36-PO-3 F9 scopes.

### Remaining blockers

- **BLOCKED-COPY**: dashboard, Installments, empty/error/help and other UI copy beyond the four approved English/Arabic market/type label pairs. Requirements may define data and behavior without inventing that copy.
- ND-F9-2 custom-duration bounds, ND-F9-3 real catalog values and ND-F9-5 PO navigation placement remain as previously recorded.
- The prior FX-rounding, FX business-day/publication and optional promotion-bound PO-DECISION-NEEDED items are closed by S36-PO-2/S36-PO-3. FR-026/FR-031 and T058/T059/T060/T068/T072/T073 are not blocked by rounding; their remaining task dependencies and independent review gates still apply. Frankfurter coverage for every supported currency remains a required verification (T075), not an assumption; any uncovered currency must be recorded as a blocker when discovered.
- Existing production-readiness gates remain open; no deployment or cloud migration is authorized.

## Assumptions

- Existing auth, tenancy, audit and Design System from `origin/main` are reused. This run writes artifacts only; Claude's independent implementation review remains required.
- The shipped F9 implementation is PR #9 merge `b565d4c` (implementation tip `b359985`). The S31 delta is a new forward migration and never edits `20261029120000_packages.sql` or existing package-version terms.
- The approved market/type enum values and market-conditional currency set are fixed. S32-PO-4 approves PO editing and promotional date/expiry capabilities; market/type are immutable, commercial terms are versioned, and C5 removal follows FR-022/FR-028.
- Currency remains an immutable published-term concern in the shipped model. S32-PO-4 approves separate EGP reporting conversion with immutable historical rates while preserving original transaction/settlement currencies. S36-PO-2/S36-PO-3 settle exact line conversion, aggregate-only half-up rounding to EGP minor units, ECB/TARGET/latest-prior-publication selection and the pending fallback. Dashboard display follows C4; settlement records and existing payment rules remain unchanged.
- Promotional availability uses open-ended defaults where a bound is absent: no start means available from creation and no end means indefinite. Supplied bounds remain Africa/Cairo start-inclusive/end-exclusive.
- Fixed publish signature has no request key. Exact full-term equality with the offer's CURRENT version is the database replay identity. Replay returns current without insert, pointer change or event. All other payloads, including older non-current terms, append N+1 and move current with one publication event. No new idempotency-key parameter/table is invented.
- Initial unavailability and fixed duration representation are conservative implementation interpretations, not catalog policy. No automatic offer enablement is implied by publication.
- Staff may read unavailable offers/history within their workspaces; future sellable selection filters `available` and uses `current_version_id`. F10/F12 implement token issuance, purchase snapshots and subscriptions, not F9.
- Price entry is in explicitly labeled minor units. Under the S31 rule only EGP, USD and SAR may enter a package version; currency-aware display follows their minor-unit metadata without guessing an exponent.
- This is a requirements-only artifact delta: no registration links, subscriptions, installment schedules, payment/ledger/refund implementation, clients or exports are implemented. Dashboard installment reporting is specified by FR-031/032; no financial values are seeded. D-13/D-17 remain downstream contracts.

## Constitution Check

I: active membership, two walls, composite tenant relations and negative tests. II/V: exact money and immutable version snapshots. III/IV: PO governance, deny-by-default commission, explicit unresolved catalog policy. VI: no automated people decisions. VII: append-only business-only audit and no logging. VIII: Design System AR/EN and required states. IX: atomic locks and database replay handling. Platform/workflow: one forward migration during implementation, local-only validation, no deployment, independent reviewer gates. No constitutional exception requested.

## Clarifications

### Session 2026-11-04 — S33-PO-4

PO source: S33-PO-4, “Fix stack drift, flaky tests, billing-related CI blockers, and PR/issue backlog organization.” S33 changes only the package acceptance test's empty-state fixture precondition and failure diagnostics. It does not change package behavior, copy, authorization, or UI. No open ambiguities remain within this test-only scope.

## S43 PO 5-7 exact source blocks - S43-R9 reference

These PO source blocks were copied programmatically. Older quotations above are retained; the controlling PO text appears here without edits. Architect mappings remain labelled separately.

### s43-po-5 - PO words copied byte-exact

```text
Final PO decisions — update F13/F17/F18/F19:

1. One continuous subscription per client.
2. Upgrade: higher tier (even shorter duration) or same tier with longer duration. Credit FULL previously paid amount, never prorate. Equal price = free; lower price = not an upgrade. Example: EGP 750 → 1,400; charge 650.
3. Renewal: extend current expiry by full purchased duration; expired renewals start today. Record full renewal revenue.
4. Frozen subscriptions must be unfrozen before upgrade/renewal. Freezing extends expiry by frozen days.
5. Pre-activation upgrades allowed.
6. Refund covers the full package, not just upgrade difference.
7. Returning clients never count as new clients. Trainer points awarded once per new client, never per plan, upgrade, or renewal. Unlimited plan publishing.
8. Renewal then Upgrade: upgrade the original package while preserving separately paid renewal duration.
9. Higher-tier, shorter-duration upgrade starts on upgrade date, using full previously paid credit.
10. Expired subscriptions cannot upgrade; renew into the desired package instead.
11. Manual subscription edits: Platform Owner only, no revenue.

Approve all four EN/AR AI prompt drafts, removing “certified coach” and using “كابتن” consistently in Arabic. Coach-original notes appear per item and in copied prompts, never totals.

F17: Week 1 = program days 1–7, including rest days; no calendar start required.

Reconcile conflicts without inventing rules; flag any remaining ambiguity. Complete the approved Sol Medium debate, then finalize, commit and push under existing governance gates.
```

### s43-po-6 - PO words copied byte-exact

```text
Fixed tier hierarchy: Silver < Gold < Platinum. Workspaces can rename tiers, but their underlying rank never changes.
* Higher-tier upgrades with equal/longer duration count from the original subscription start. Shorter-duration upgrades start on the upgrade date.
* Pre-activation upgrades are allowed; duration starts upon activation.
* Refunds cover the full selected package payment, including upgrade charges, but don’t automatically refund separate renewals.
* After renewal then upgrade, credit only the original package’s full payment. Preserve separately purchased renewal duration and payments.
* Never prorate upgrade credit. Record only additional payments as new revenue.
```

### s43-po-7 - PO words copied byte-exact

```text
Arabic tier names are سيلفر، جولد، بلاتينيوم.
```
