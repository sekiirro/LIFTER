# Feature Specification: F14 — Workspace branding

**Feature Branch**: `014-workspace-branding`
**Created**: 2026-10-28
**Status**: Draft; specification only; ND-F14-1..7 and DG-F14-1..3 remain open for Product Owner decisions. No implementation or planning approval.

**Input**: BRD-02 workspace branding, BRD-04.2, PRD-01/02, DR-01, D-18, DESIGN.md, F10/F11 contracts, and the architect/critic debate record (architect v1 decisions override v0 where they differ). Architect decisions below are pending PO spec approval; the open decision register is not approval.

## Source references

- [BRD/PRD and DR-01](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md): BRD-02, BRD-04.2, PRD-01, PRD-02, DR-01.
- [Decision register](../../docs/04-changes-and-questions.md): D-18; [DESIGN.md](../../DESIGN.md), especially §§2, 10–12.
- [Design System specification](../002-design-system/spec.md): `BrandScope`, `deriveBrand`, contrast behavior, bilingual accessible interface requirements.
- [F10 specification](../010-registration-links/spec.md) and [registration surface contract](../010-registration-links/contracts/registration-links-surface.md): token-validated public open projection, generic invalid response, response privacy and F11 handoff.
- F11 specification, read from `origin/011-client-accounts` at this base: `specs/011-client-accounts/spec.md`. F11 owns signup and its strict signup-validity policy; F14 does not change that policy.
- [Constitution](../../.specify/memory/constitution.md), Principles I, III, IV, V, VII, VIII and IX.
- [Spec debate r1](research/spec-debate-r1.md) records the architect v0 draft, the Sol Medium critique, and the architect response r1.
- The [Frontend Design Gate](../../docs/09-frontend-design-gate.md) (added by branch `docs-workflow-governance`, pending merge to main) applies to every UI change, together with DESIGN.md. Any UI choice left unresolved there remains a design gap for PO decision.

## User Scenarios & Testing

### User Story 1 — Edit and save a workspace identity draft (Priority: P1)

As an authorized Workspace Owner, I can edit the identity fields that the PO approves for this feature and save a private draft for my workspace. The Platform Owner can perform this action platform-wide only if the capability is approved. Sales and Trainer have no branding-management authority under the proposed policy.

**Why this priority**: BRD-02 assigns workspace branding management to the Workspace Owner; the draft is the source for preview and publication.

**Independent Test**: An authorized owner changes permitted draft fields and saves; a separate workspace cannot read or change that draft, and an unauthorized role receives a generic denial.

**Acceptance Scenarios**:

1. **Given** a signed-in actor with approved branding capability and workspace scope, **When** they save valid draft fields, **Then** the draft is saved for that workspace and reports its new revision.
2. **Given** a draft with revision N, **When** an editor submits changes based on revision N after another edit has advanced it, **Then** the stale edit is rejected with explicit stale-edit feedback and does not overwrite the newer draft.
3. **Given** an actor without the approved capability or workspace membership, **When** they request a draft read or write, **Then** access is denied without disclosing another workspace's branding or existence.
4. **Given** an upload that violates the approved format, structure, dimensions, animation, or post-stripping size limit, **When** it is submitted, **Then** it is rejected, the prior logo remains intact, and no unreferenced asset is retained.

### User Story 2 — Preview a draft before publication (Priority: P1)

As an authorized editor, I can preview the draft in the approved branding surface and locale/theme contexts before it affects visitors.

**Why this priority**: BRD-02 requires preview and publish; review before publication protects the live registration experience from accidental changes.

**Independent Test**: Save a draft, preview it, then open a valid registration link separately and confirm the live view still uses the currently published identity.

**Acceptance Scenarios**:

1. **Given** a saved draft and authorized editor, **When** the editor opens preview, **Then** the preview uses that draft and sample, non-token data and is inaccessible to unauthorized actors.
2. **Given** a changed draft, **When** its preview is rendered, **Then** it remains private and does not change the published identity returned to a registration visitor.
3. **Given** the preview has a contrast adjustment, **When** the editor reviews the preview, **Then** the source brand color is retained and any adjustment is explained to the editor. The explanation and presentation layout remain subject to DG-F14-1..3.

### User Story 3 — Publish an approved identity (Priority: P1)

As an authorized editor, I can publish a reviewed draft so the approved public identity changes as one coherent version.

**Why this priority**: Publication is the controlled transition between private edits and public registration identity.

**Independent Test**: Publish a changed draft, open a valid registration link, and confirm it shows that published identity while the saved version remains available in history.

**Acceptance Scenarios**:

1. **Given** an authorized editor submits an unchanged draft for publication, **When** publication is processed, **Then** it is an idempotent no-op and creates no duplicate published version or publication audit event.
2. **Given** a changed draft and the current revision, **When** publication succeeds, **Then** one immutable version becomes current and one corresponding `branding.published` audit event is committed with it.
3. **Given** two publication requests race for the same workspace, **When** both are processed, **Then** they are serialized; each successful changed publication has one coherent version, current pointer and audit event, and an audit failure leaves no partial publication.
4. **Given** a publication based on a stale draft revision, **When** it is submitted, **Then** it fails with explicit stale-publish feedback and leaves the current published version unchanged.
5. **Given** a previously rendered registration form, **When** a new version is published, **Then** that already rendered form retains its identity until reload; publication does not reset its inputs, alter signup authorization, or change the link's package/workspace terms snapshot.

### User Story 4 — Revert by preparing and publishing an earlier identity (Priority: P2)

As an authorized editor, I can select an earlier version and use it to prepare a draft, review it, then publish through the same publication flow.

**Why this priority**: Reversion supports recovery while preserving the immutable record of what was previously published. This user flow is an architect recommendation pending PO decision P5.

**Independent Test**: Load an older version into the draft, confirm the currently published version does not change, then publish and verify the new current version preserves the earlier identity while history remains intact.

**Acceptance Scenarios**:

1. **Given** an authorized editor chooses an older version, **When** the revert action is applied, **Then** that version's fields are loaded into the draft for review and the current published version is unchanged.
2. **Given** a reverted draft is reviewed, **When** it is published, **Then** a new immutable version is created; the historical version is not mutated or deleted.

### User Story 5 — See only published identity on a valid registration link (Priority: P1)

As a registration visitor with a valid F10 token, I see the latest published identity allowed by PO decision P2. A draft or unpublished edit is never public.

**Why this priority**: BRD-04.2 and PRD-02 authorize a branded registration form, not a public workspace directory or marketing surface; F10 supplies the token-validated open path.

**Independent Test**: Open a valid synthetic token before and after publication and compare the public projection; separately open invalid tokens and verify the unchanged generic invalid result.

**Acceptance Scenarios**:

1. **Given** a valid token, **When** its registration page is opened, **Then** the existing F10 token-validated public projection includes only the latest published identity fields; it exposes no workspace selector, draft, version history, or anonymous table access.
2. **Given** an unpublished draft edit, **When** the valid token is opened, **Then** only the previously published identity is returned.
3. **Given** an unknown, malformed, expired, or consumed token, **When** the registration page is opened, **Then** the response remains byte-identical to F10's generic invalid response, shows no workspace identity or branding, and reveals no invalidity cause.
4. **Given** a valid token and later publication, **When** a new request opens the registration page, **Then** it resolves the current published pointer for that request; a page already rendered retains its prior identity until reload.
5. **Given** any registration, preview, or asset response, including an error, **When** it is returned, **Then** it is private and not stored by a browser, shared cache, or CDN; token-bearing responses are not shared-cacheable.

## Edge Cases

- Two editors save against the same draft revision: only the compare-and-set winner updates it; the other receives stale-edit feedback.
- Two publish requests race, an audit operation fails, or a publish response is retried: serialization, all-or-nothing publication, and unchanged-draft idempotency apply.
- Cross-workspace draft/version/asset identifiers are supplied, or a caller guesses an asset hash: access is denied; hashes do not authorize reads and assets are not deduplicated across workspaces.
- A logo has bad magic bytes, invalid structure/CRC or RIFF size, truncation, trailing bytes, unsupported type, excess pixel count, animation, or exceeds 64 KiB after metadata stripping: reject it and preserve the previous logo.
- A valid image renders in a browser with a decoder defect: residual browser-decoder risk is recorded for PO visibility under ND-F14-7; images are displayed only as images, never inline SVG/HTML.
- A locale's display name is absent: the architect-proposed fallback to the other locale's text applies only if PO approves ND-F14-3; until then bilingual obligations are unresolved.
- No version has been published: the public view uses the no-branding default proposed in the architect response (workspace name, emerald-derived tokens, no logo), subject to PO approval of the related content and rollout decisions.
- A logo processing or persistence step fails: the previous logo is preserved and no asset remains without a draft reference.
- A valid F10 open is in grace while F11 signup is past strict expiry: F14 preserves each existing contract; it does not resolve or alter ND-F11-4a.

## Requirements

### Functional Requirements

- **FR-001**: Draft operations MUST require a signed actor, approved capability, actual workspace membership and explicit workspace scope. Both application authorization and database authorization MUST enforce the policy; the UI is not an authorization boundary.
- **FR-002**: Draft, version and asset data MUST be isolated by workspace. Asset identity MUST include both workspace and content hash; composite relationships MUST prevent cross-workspace references. Hashes MUST NOT authorize reads and assets MUST NOT be deduplicated across workspaces.
- **FR-003**: The public identity read MUST extend only the existing F10 token-validated open projection with published identity fields. It MUST expose no workspace selector, draft/history reader or anonymous table access. Invalid token output MUST remain byte-identical to F10's generic invalid output.
- **FR-004**: Draft edits MUST carry a revision and use compare-and-set behavior. Stale edits MUST be rejected with explicit feedback and MUST NOT overwrite a newer revision.
- **FR-005**: A changed publication MUST create an immutable snapshot, update the current published reference, and record its publication audit event as one atomic operation. Publication MUST be serialized per workspace, and an audit failure MUST roll back publication. Unchanged-draft publication MUST be a no-op. Version numbers MUST be unique within a workspace.
- **FR-006**: Revert MUST preserve history. Pending the PO decision in ND-F14-5, the architect-proposed behavior is to load an older version into the draft for review and then publish through the ordinary path.
- **FR-007**: The proposed single editable brand color MUST be a valid `#RRGGBB` value. The UI MUST reuse `deriveBrand` and `BrandScope`, retain the source color, explain any derived contrast adjustment, and MUST NOT override semantic tokens. D-18 WCAG 2.2 AA requirements apply in both light and dark modes.
- **FR-008**: Pending PO decisions P2 and P3, the architect-proposed editable identity fields are brand color, Arabic and English display names, and logo only; no welcome line or hero/banner is assumed. The architect-proposed missing-locale fallback is the other locale's text. These are proposed defaults, not approved policy.
- **FR-009**: Logo upload policy MUST accept PNG and WebP only. Validation MUST inspect magic bytes and walk the full structure, verify PNG chunk CRCs and WebP RIFF sizes, and reject malformed, truncated or trailing data. Dimensions MUST be read from IHDR, VP8X, VP8 or VP8L and limited to at most 1024×1024 pixels. Animation MUST be rejected (including APNG `acTL` and WebP `ANIM`). Metadata stripping MUST keep only PNG IHDR/PLTE/IDAT/IEND/tRNS chunks or WebP VP8/VP8L/VP8X without metadata flags/ALPH chunks. The stripped image MUST be no larger than 64 KiB, and its hash MUST be computed from the stripped bytes. A rejected upload MUST preserve the previous logo. JPEG and SVG are not accepted.
- **FR-010**: Logos MUST be rendered only through an image element, never inline SVG or HTML, and responses MUST use sniffed content type and `X-Content-Type-Options: nosniff`. The browser-decoder residual risk is documented for the PO under ND-F14-7.
- **FR-011**: Registration, preview and asset responses MUST use `private, no-store`, including error responses. Token responses MUST NOT be shared/CDN cached. The current published reference MUST be resolved fresh per request.
- **FR-012**: Publication MUST NOT change signup authorization, reset already-entered registration form values, or change the F10/F11 package/workspace snapshot or validity rules. A rendered form keeps its identity until reload.
- **FR-013**: When no published customization exists, the architect-proposed default is workspace name, emerald-derived tokens and no logo. This default remains subject to applicable PO decisions.
- **FR-014**: Branding audit MUST produce exactly one `branding.published` event per successful changed publication, containing only version id, version number, source version id and changed field names. Audit MUST exclude image bytes, authored text, tokens and URLs. Failed publication MUST roll back its audit and state changes together.
- **FR-015**: UI MUST be Arabic-first RTL and English LTR, responsive, accessible, and use existing Design System tokens and components. Editor, preview and registration page MUST satisfy the Frontend Design Gate linked in the source references and DESIGN.md. The three unresolved design choices are tracked as DG-F14-1..3 and MUST NOT be invented by this specification.
- **FR-016**: Branding changes MUST remain presentational. They MUST NOT change finance, permissions, security boundaries, signup behavior, or workspace authorization.
- **FR-017**: No implementation plan or task breakdown is approved by this specification. The storage choice, role capability and content/surface decisions remain blocked on the PO decisions recorded below.

### Architect Decisions (pending PO spec approval)

The following are technical decisions from `branding-claude-response-r1.md`, recorded for PO review. They are not implementation authorization and do not close ND-F14 items.

1. Every staff database operation will verify signed actor, capability, membership and workspace within the privileged database operation; use explicit workspace predicates and schema-qualified names; set an empty search path; revoke default execution and grant narrowly. If `manage_branding` is approved, the application capability matrix and database capability function must change together.
2. Drafts and versions reference assets within the same workspace. The current published reference is workspace-bound. No hash-based authorization or cross-workspace deduplication.
3. Public reads extend the F10 token-validated projection with published identity only. No separate public workspace selector, draft/history read, anonymous table grant or hash-addressed public asset path.
4. Image processing uses the bounded PNG/WebP structural validation and metadata stripping in FR-009 instead of full decode/re-encode; the architect's rationale is Cloudflare Workers Free CPU budget and avoiding a new image dependency. The residual risk of a browser image-decoder bug remains visible for PO acceptance under ND-F14-7.
5. Sensitive responses are `private, no-store`; public pointer resolution is fresh per request.
6. Existing `deriveBrand` and `BrandScope` are reused; source color remains intact, contrast adjustments are explained, and semantic tokens are not overridden.
7. Draft revisions use compare-and-set; publication is serialized per workspace; snapshot, current pointer and audit commit together; unchanged publication is a no-op; version number is unique per workspace.
8. A rendered registration form keeps its current identity until reload. Publication does not reset inputs or change signup authorization/snapshots. The proposed no-branding default and locale fallback are recorded in FR-008/013 pending the PO decisions.
9. Extend the latest `audit_row_change()` behavior without removing any existing mapping. Exactly one publication audit event is required; audit failure aborts publication; no bytes, authored text, tokens or URLs are recorded.
10. Uploads are staged within the draft transaction so a failed draft cannot leave unreferenced asset bytes. History retention is not chosen pending P6.
11. Welcome text remains out of assumed scope until P2; registration identity only; no navigation is invented.

## Key Entities

- **Workspace branding draft**: The editable, revisioned identity for one workspace; has an editor and update time; private until publication.
- **Branding version**: An immutable snapshot of an identity that has been published, with workspace-scoped version number, publication actor/time and optional source version for a revert.
- **Branding asset**: A workspace-owned, validated and metadata-stripped logo image identified within that workspace by its content hash and media type.
- **Current published reference**: The workspace-scoped reference to the latest published version; it does not grant public access by itself.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In authorization scenarios, all authorized actors can act only within approved workspace scope; unauthorized roles and foreign-workspace attempts disclose zero foreign branding fields.
- **SC-002**: In concurrency scenarios, no stale draft overwrites a newer revision; each successful changed publication has one current version and one publication audit event; failed audit leaves zero partial publication.
- **SC-003**: Valid registration opens show 100% of permitted identity fields from the latest published version and 0 draft fields; invalid opens show 0 workspace identity fields and retain F10's generic invalid response.
- **SC-004**: 100% of the specified unsupported or malformed image cases are rejected, the previous logo is unchanged, and no rejected upload is left referenced or orphaned.
- **SC-005**: No publication changes form input state, signup authorization, or registration-link terms/validity; an already rendered page changes identity only after reload.
- **SC-006**: Brand-derived presentation meets D-18 WCAG 2.2 AA contrast targets in light and dark modes while semantic tokens remain unchanged; any derived adjustment is explained in the editor.
- **SC-007**: Registration, preview and asset responses, including errors, are private and non-stored; no token response is served from a shared cache.

## Assumptions and Dependencies

- F10 remains the sole public token-open path. F11 remains the signup owner and retains its own strict signup validity rules. F14 does not alter either contract.
- D-18, DESIGN.md and the implemented Design System define color and contrast behavior. Existing `deriveBrand` and `BrandScope` are the intended shared mechanism.
- BRD-02 gives the Workspace Owner workspace-scoped branding authority. Any new `manage_branding` capability and Platform Owner role scope still require PO approval under ND-F14-1.
- The final editable content, public rollout surface, revert UX, history retention and logo storage require PO decisions ND-F14-2..7.
- Acceptance scenarios and success criteria are future verification obligations, not claims of implementation or test completion.

## Out of Scope

- Public marketing, landing, FAQ, price, contact, checkout, support CTA or sales-funnel pages; BRD-04.2 restricts the public experience to the registration form.
- Hero/banner imagery, welcome text, custom fonts, per-mode brand colors, or other identity fields unless the PO adds them through ND-F14-2.
- Branding the staff application shell in this increment; that scope remains open under ND-F14-4.
- Client portal theming beyond shared brand tokens (P4), F13 freeze/renewal/refunds, F12 financial/approval behavior, and any changes to signup authorization or registration-link snapshots.
- PO approval workflow for each publication; BRD-02 says Workspace Owner publication does not require Platform Owner approval, subject to the open capability decision.
- Implementation artifacts: migrations, application code, tests, plan.md and tasks.md. Plan/tasks wait until PO decisions are resolved.

## Constitution Check

- **I — Strict Workspace Isolation**: Required. Drafts, versions and assets are workspace-bound; all reads/writes verify actual membership and scope at both authorization walls; foreign-workspace denials are acceptance criteria.
- **II — Immutable Financial Truth**: Branding is presentation-only and cannot modify prices, commissions, payments, snapshots or ledger facts.
- **III — Governance & Least Privilege**: No new capability is effective until ND-F14-1 is approved. Proposed access is Workspace Owner for own workspace and Platform Owner platform-wide; Sales/Trainer denied.
- **IV — Approved Scope Only**: Public scope is limited to token-validated registration identity. Unresolved content, capability, rollout, storage and design choices are explicit; no recommendation is represented as approved.
- **V — Versioned, Non-Retroactive Content**: Published identity versions are immutable; a revert produces a new publication and preserves history.
- **VI — Human-Governed People Decisions**: Not implicated; branding does not make or automate people decisions.
- **VII — Privacy & Health-Data Protection**: No token, asset bytes, authored text or URL in audit; no public workspace enumeration; private no-store responses and no token cache.
- **VIII — Bilingual, Accessible, Design-System UI**: Arabic-first RTL/English LTR, existing tokens and contrast guard, accessible responsive UI, DESIGN.md and mandatory Frontend Design Gate. Unresolved layout and explanation choices remain DG-F14 items.
- **IX — Reliable, Idempotent Operations**: Revision CAS, serialized publication, idempotent unchanged publish, atomic snapshot/reference/audit and rollback on audit failure.

This is a requirements specification only. No migration, implementation, test result, plan or task approval is claimed.

## PO Decision Register

Every item below is **OPEN (PO)**. A conservative default is shown for discussion only and is explicitly **NOT approved**. An architect recommendation or technical decision does not approve policy. No plan/tasks should be written until these decisions are recorded by the PO.

| Decision | Status | Question for PO | Conservative default for discussion — NOT approved |
|---|---|---|---|
| **ND-F14-1** | **OPEN (PO)** | Approve `manage_branding` capability for Workspace Owner in own workspace and Platform Owner platform-wide, with no Sales/Trainer grant? | Keep branding management unavailable until the capability is approved. This is not approval to deny BRD-02 Workspace Owner authority permanently. |
| **ND-F14-2** | **OPEN (PO)** | Which registration identity content is permitted: color + AR/EN display names + logo only; also a short welcome line; or a hero/banner? | Limit public identity to color, AR/EN display names and logo; no welcome line or banner. This is the architect recommendation, not approval. |
| **ND-F14-3** | **OPEN (PO)** | Must both AR and EN display names be supplied, or may a missing locale fall back to the other locale? | Require both names until the bilingual obligation is approved. The architect's proposed fallback to the other locale is recorded in FR-008 but is not approved. |
| **ND-F14-4** | **OPEN (PO)** | Does publication affect only the registration page, or also the workspace staff app shell in this increment? | Registration page only. This is the architect recommendation, not approval. |
| **ND-F14-5** | **OPEN (PO)** | Does revert load an older version into a draft for review before publication, or immediately republish it? | Load into the draft, require review, then publish through the normal flow. This is the architect recommendation, not approval. |
| **ND-F14-6** | **OPEN (PO)** | Keep all published versions, or retain only the latest N versions? | Preserve all versions until the PO sets a retention bound; no deletion policy is approved. This is a conservative holding position, not approval of permanent retention. |
| **ND-F14-7** | **OPEN (PO)** | Choose logo storage: B′ — stripped PNG/WebP up to 64 KiB in Postgres and embedded in the token-validated response; A — private Supabase Storage with token-validating proxy; or C — defer logo. Also decide whether to accept the residual browser image-decoder risk described in FR-009/010. | Defer logo support (C) until storage and residual-risk decisions are approved. Architect recommendation is B′; this is not approval. |

## Open Design Gaps

These are **OPEN (PO design decision)** and must follow the Frontend Design Gate STOP rule. Do not invent or finalize these in implementation or design artifacts until decided.

- **DG-F14-1 — OPEN (PO design decision)**: Branded registration-page layout and logo placement/size. The surface follows DESIGN.md and the Frontend Design Gate; layout choices remain for PO review.
- **DG-F14-2 — OPEN (PO design decision)**: Workspace editor and preview layout. The editor/preview must use the existing Design System; no new layout pattern is selected here.
- **DG-F14-3 — OPEN (PO design decision)**: How the editor explains contrast adjustments while preserving the authored source color. Existing `deriveBrand`/`BrandScope` behavior remains the reference; no explanatory copy or interaction is approved here.
