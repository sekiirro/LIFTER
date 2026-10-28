# Feature Specification: F14 — Workspace branding

**Feature Branch**: `014-workspace-branding`
**Created**: 2026-10-28
**Status**: PO decisions recorded 2026-10-28; specification only; no implementation or planning approval.

**Input**: BRD-02 workspace branding, BRD-04.2, PRD-01/02, DR-01, D-18, DESIGN.md, F10/F11 contracts, and the architect/critic debate record (architect v1 decisions override v0 where they differ). Architect technical decisions below are subordinate to the PO decisions recorded in the decision register.

## Source references

- [BRD/PRD and DR-01](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md): BRD-02, BRD-04.2, PRD-01, PRD-02, DR-01.
- [Decision register](../../docs/04-changes-and-questions.md): D-18; [DESIGN.md](../../DESIGN.md), especially §§2, 10–12.
- [Design System specification](../002-design-system/spec.md): `BrandScope`, `deriveBrand`, contrast behavior, bilingual accessible interface requirements.
- [F10 specification](../010-registration-links/spec.md) and [registration surface contract](../010-registration-links/contracts/registration-links-surface.md): token-validated public open projection, generic invalid response, response privacy and F11 handoff.
- F11 specification, read from `origin/011-client-accounts` at this base: `specs/011-client-accounts/spec.md`. F11 owns signup and its strict signup-validity policy; F14 does not change that policy.
- [Constitution](../../.specify/memory/constitution.md), Principles I, III, IV, V, VII, VIII and IX.
- [Spec debate r1](research/spec-debate-r1.md) records the architect v0 draft, the Sol Medium critique, and the architect response r1.
- [Spec debate r2](research/spec-debate-r2-scope.md) records the PO-approved focused Storage, banner and cross-surface critique and the architect response.
- The [Frontend Design Gate](../../docs/09-frontend-design-gate.md) (added by branch `docs-workflow-governance`, pending merge to main) applies to every UI change, together with DESIGN.md. The approved UI choices are recorded in DG-F14-1..3.

## User Scenarios & Testing

### User Story 1 — Edit and save a workspace identity draft (Priority: P1)

As an authorized PO or WO, I can manage workspace branding: PO platform-wide and WO for their own workspace using `manage_branding`. Sales and Trainer have no branding-management authority.

**Why this priority**: BRD-02 assigns workspace branding management to the Workspace Owner; the draft is the source for preview and publication.

**Independent Test**: An authorized owner changes permitted draft fields and saves; a separate workspace cannot read or change that draft, and an unauthorized role receives a generic denial.

**Acceptance Scenarios**:

1. **Given** a signed-in actor with approved branding capability and workspace scope, **When** they save valid draft fields, **Then** the draft is saved for that workspace and reports its new revision.
2. **Given** a draft with revision N, **When** an editor submits changes based on revision N after another edit has advanced it, **Then** the stale edit is rejected with explicit stale-edit feedback and does not overwrite the newer draft.
3. **Given** an actor without the approved capability or workspace membership, **When** they request a draft read or write, **Then** access is denied without disclosing another workspace's branding or existence.
4. **Given** an upload that violates the approved format, structure, dimensions, animation, or plan-approved ingress/output limits, **When** it is submitted, **Then** it is rejected, the prior asset remains intact, its durable upload state is reconciled, and cleanup never deletes a referenced object.

### User Story 2 — Preview a draft before publication (Priority: P1)

As an authorized editor, I can preview the draft in the approved branding surface and locale/theme contexts before it affects visitors.

**Why this priority**: BRD-02 requires preview and publish; review before publication protects the live registration experience from accidental changes.

**Independent Test**: Save a draft, preview it, then open a valid registration link separately and confirm the live view still uses the currently published identity.

**Acceptance Scenarios**:

1. **Given** a saved draft and authorized editor, **When** the editor opens preview, **Then** the preview uses that draft and sample, non-token data and is inaccessible to unauthorized actors.
2. **Given** a changed draft, **When** its preview is rendered, **Then** it remains private and does not change the published identity returned to a registration visitor.
3. **Given** the preview has a contrast adjustment, **When** the editor reviews the preview, **Then** the source brand color is retained and any adjustment is explained to the editor. The explanation and presentation layout follow DG-F14-1..3.

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

**Why this priority**: Reversion supports recovery while preserving the immutable record of what was previously published. This user flow follows the PO decision in ND-F14-5.

**Independent Test**: Load an older version into the draft, confirm the currently published version does not change, then publish and verify the new current version preserves the earlier identity while history remains intact.

**Acceptance Scenarios**:

1. **Given** an authorized editor chooses an older version, **When** the revert action is applied, **Then** that version's fields are loaded into the draft for review and the current published version is unchanged.
2. **Given** a reverted draft is reviewed, **When** it is published, **Then** a new immutable version is created; the historical version is not mutated or deleted.

### User Story 5 — See only published identity on a valid registration link (Priority: P1)

As a registration visitor with a valid F10 token, I see the latest published identity . A draft or unpublished edit is never public.

**Why this priority**: BRD-04.2 and PRD-02 authorize a branded registration form, not a public workspace directory or marketing surface; F10 supplies the token-validated open path.

**Independent Test**: Open a valid synthetic token before and after publication and compare the public projection; separately open invalid tokens and verify the unchanged generic invalid result.

**Acceptance Scenarios**:

1. **Given** a valid token, **When** its registration page is opened, **Then** the existing F10 token-validated public projection includes only the latest published identity fields; it exposes no workspace selector, draft, version history, or anonymous table access. Any image request goes through the token-validating image proxy and can return only assets referenced by the authorized published version rendered for that token.
2. **Given** an unpublished draft edit, **When** the valid token is opened, **Then** only the previously published identity is returned.
3. **Given** an unknown, malformed, expired, or consumed token, **When** the registration page is opened, **Then** the response remains byte-identical to F10's generic invalid response, shows no workspace identity or branding, and reveals no invalidity cause.
4. **Given** a valid token and later publication, **When** a new request opens the registration page, **Then** it resolves the current published pointer for that request; a page already rendered retains its prior identity until reload.
5. **Given** any registration, preview, or image-proxy request, **When** it is processed, **Then** the server resolves the authorized workspace and published version for that request, applies F10 open validity including consumption without extending grace, and returns only an asset bound to that rendered version. Failures are generic; responses, including errors, are private/no-store. No client-visible Storage signed URL or arbitrary asset/history selector is exposed. Already displayed pixels may remain.
6. **Given** publication changes after a registration page has rendered but before its image request, **When** the image proxy is requested, **Then** it serves only the published version authorized for that rendered page context or returns a generic failure; the caller cannot choose a historical version or asset.

## Edge Cases

- Two editors save against the same draft revision: only the compare-and-set winner updates it; the other receives stale-edit feedback.
- Two publish requests race, an audit operation fails, or a publish response is retried: serialization, all-or-nothing publication, and unchanged-draft idempotency apply.
- Cross-workspace draft/version/asset identifiers are supplied, or a caller guesses an asset hash: access is denied; hashes do not authorize reads and assets are not deduplicated across workspaces.
- A staged upload is interrupted, validation fails, or revision-checked attachment fails: its durable state permits reconciliation; bounded cleanup retries and never removes an object referenced by the current publication, draft, a restorable version or active upload.
- A logo or banner has bad magic bytes, invalid structure/CRC or RIFF size, truncation, trailing bytes, unsupported type, animation, excess structural complexity or exceeds the plan-approved ingress/output, dimension or pixel limits: reject it and preserve the previous asset.
- A valid image renders in a browser with a decoder defect: residual browser-decoder risk is recorded for PO visibility under ND-F14-7; images are displayed only as images, never inline SVG/HTML.
- A registration asset request arrives after token consumption or outside F10's current open-validity window: deny it generically without extending grace; already displayed pixels may remain.
- Anonymous listing/direct object reads, cross-workspace Storage paths, published-object mutation, or an unscoped credential request are attempted: deny them.
- A workspace switch occurs while a preview request is in flight, or no workspace scope is selected: discard the late response and use neutral defaults until the new authorized scope is resolved.
- A banner would place form controls over imagery, or text over imagery without a guaranteed-contrast scrim from existing tokens: fail the surface design requirement. Exact banner aspect/height bounds remain for PO decision at plan time.
- A second locale name or banner alt text is absent: use the supplied required locale's value as fallback, consistent with ND-F14-3.
- No version has been published: the public view uses the decided default (workspace name, emerald-derived tokens, no logo or Hero Banner).
- A logo/banner processing, upload or persistence step fails: the previous asset is preserved; durable state enables reconciliation; reference-safe cleanup never deletes a referenced object.
- A valid F10 open is in grace while F11 signup is past strict expiry: F14 preserves each existing contract; it does not resolve or alter ND-F11-4a.

## Requirements

### Functional Requirements

- **FR-001**: Draft operations MUST require a signed actor, approved capability, actual workspace membership and explicit workspace scope. Both application authorization and database authorization MUST enforce the policy; the UI is not an authorization boundary.
- **FR-002**: Draft, version and asset data MUST be isolated by workspace. Asset identity MUST include both workspace and content hash; composite relationships MUST prevent cross-workspace references. Hashes MUST NOT authorize reads and assets MUST NOT be deduplicated across workspaces.
- **FR-003**: The public identity read MUST extend only the existing F10 token-validated open projection with published identity fields. It MUST expose no workspace selector, draft/history reader or anonymous table access. Invalid token output MUST remain byte-identical to F10's generic invalid output. Registration images MUST be delivered only by a token-validating proxy; client-visible Storage signed URLs and arbitrary asset/history selectors are prohibited.
- **FR-004**: Draft edits MUST carry a revision and use compare-and-set behavior. Stale edits MUST be rejected with explicit feedback and MUST NOT overwrite a newer revision.
- **FR-005**: A changed publication MUST create an immutable snapshot, update the current published reference, and record its publication audit event as one atomic operation. Publication MUST be serialized per workspace, and an audit failure MUST roll back publication. Unchanged-draft publication MUST be a no-op. Version numbers MUST be unique within a workspace.
- **FR-006**: Revert MUST preserve history. A restorable historical version is loaded into Draft for review, then published explicitly through the ordinary flow.
- **FR-007**: The single editable brand color MUST be a valid `#RRGGBB` value. The UI MUST reuse `deriveBrand` and `BrandScope`, retain the source color, explain any derived contrast adjustment, and MUST NOT override semantic tokens. D-18 WCAG 2.2 AA requirements apply in both light and dark modes.
- **FR-008**: Published branding applies to Registration and Staff Dashboard, and Client Portal when it exists (P4); F14 provides the published brand data/tokens. Registration identity includes workspace logo, names, colors, and a customizable Hero Banner. One language name is required; a second is optional and falls back to the provided name. BRD-04.2 prohibits CTA, links, pricing, or contact content in the banner. **Architect decision — PO may confirm at plan approval**: treat Hero Banner as image-only, with required bilingual alt text (one language required; the other falls back as in ND-F14-3) and no banner text fields. The uploader MUST confirm that the image contains identity content only, without pricing, contact details, CTA or links. Use the PO-decided Premium Centered Card; form controls MUST never overlap imagery. Responsive aspect/height bounds, crop preview and missing-image fallback are required; exact aspect/height values remain a PO design item for plan approval under the Frontend Design Gate.
- **FR-009**: Logo and Hero Banner uploads MUST use private Supabase staging and validated buckets. Uploads MUST proceed from private staging through authoritative server-side PNG/WebP structural validation and metadata stripping to an immutable content-addressed object in the validated bucket, then attach to the draft only if its revision still matches. Track durable upload states and reconcile interrupted uploads and failed attachments. Cleanup MUST be bounded, retryable and reference-checked; it MUST NOT delete any referenced object. Validation MUST inspect magic bytes and walk the full structure, verify PNG chunk CRCs and WebP RIFF sizes, and reject malformed, truncated or trailing data. Dimensions MUST be read from IHDR, VP8X, VP8 or VP8L; separate logo/banner ingress-byte, output-byte, dimension, pixel and structural-complexity limits are chosen at plan approval. Animation MUST be rejected (including APNG `acTL` and WebP `ANIM`). Metadata stripping MUST keep only PNG IHDR/PLTE/IDAT/IEND/tRNS chunks or WebP VP8/VP8L/VP8X without metadata flags/ALPH chunks. The content hash MUST be computed from stripped bytes. JPEG and SVG are not accepted.
- **FR-010**: Logos and Hero Banners MUST be rendered only through an image element, never inline SVG or HTML, and responses MUST use sniffed content type and `X-Content-Type-Options: nosniff`. Registration image delivery MUST use a token-validating proxy only; each request re-applies F10 open validity, including consumption, without changing or extending grace. Access MUST be bound to the authorized published version rendered for that token. Proxy failures MUST be generic. Already displayed pixels may remain.
- **FR-011**: Registration, preview and image-proxy responses MUST use `private, no-store`, including errors. Token responses MUST NOT be shared/CDN cached. For each new registration-page render, resolve the current published pointer server-side. For each image-proxy request, re-resolve authorization and F10 token validity and bind delivery to the published version authorized for that rendered page context; do not accept a client-selected asset/version/history identifier. No shared actor/workspace cache is permitted. No client-visible Storage signed URL may be issued.
- **FR-012**: Publication MUST NOT change signup authorization, reset already-entered registration form values, or change the F10/F11 package/workspace snapshot or validity rules. A rendered form keeps its identity until reload.
- **FR-013**: When no published customization exists, use workspace name, emerald-derived tokens, and no logo or Hero Banner.
- **FR-014**: Branding audit MUST produce exactly one `branding.published` event per successful changed publication, containing only version id, version number, source version id and changed field names. Audit MUST exclude image bytes, authored text, tokens and URLs. Failed publication MUST roll back its audit and state changes together.
- **FR-015**: UI MUST be Arabic-first RTL and English LTR, responsive, accessible, and use existing Design System tokens and components. Editor and live preview MUST cover Registration, Staff Dashboard, and a Client Portal preview placeholder when it exists (P4); F14 defines the portal's published brand data/token contract without inventing portal features. On workspace switch, late preview responses MUST be discarded; without an authorized scope, use neutral defaults. Contrast MUST be verified on each surface's real backgrounds and states. `deriveBrand` covers neutral surfaces; banner overlays MUST keep text off imagery or use a guaranteed-contrast scrim from existing tokens. Semantic tokens MUST remain unchanged. The approved design choices are recorded as DG-F14-1..3; exact banner aspect/height remains a plan-time design item.
- **FR-016**: Branding changes MUST remain presentational. They MUST NOT change finance, permissions, security boundaries, signup behavior, or workspace authorization.
- **FR-017**: F14 implementation MUST include a required Storage-enabled CI lane with readiness checks and zero permitted skips. Run F11 pending-client Storage denials alongside F14 bucket/path policy checks, including direct API attempts; use isolated fixtures and update F11 isolated-runner stack-restoration assumptions. No skipped Storage tests are permitted. Hosted compatibility/Storage verification remains a production blocker. This spec does not authorize CI, application, Storage or production changes.
- **FR-018**: Bucket-qualified `storage.objects` policies MUST enforce workspace-prefixed paths and independently verified capability/scope. Anonymous listing/direct reads, cross-workspace access and mutation of published objects MUST be denied. Any server credential exception MUST be narrowly scoped, audited and documented as a plan item for architect review, since architecture confines service-role use to audited cron.

### Architect Decisions (technical constraints)

The following technical decisions from [spec debate r1](research/spec-debate-r1.md) and [the focused r2 response](research/spec-debate-r2-scope.md) apply with the PO decisions below. R2 findings were all accepted. The banner behavior is explicitly an architect decision for PO confirmation at plan approval, and neither the response nor this spec authorizes implementation.

1. Every staff database operation will verify signed actor, capability, membership and workspace within the privileged database operation; use explicit workspace predicates and schema-qualified names; set an empty search path; revoke default execution and grant narrowly. The approved `manage_branding` capability must be implemented in both application and database capability checks.
2. Drafts and versions reference assets within the same workspace. The current published reference is workspace-bound. No hash-based authorization or cross-workspace deduplication.
3. Public reads extend the F10 token-validated projection with published identity only. No separate public workspace selector, draft/history read, anonymous table grant or hash-addressed public asset path.
4. Image processing uses the bounded PNG/WebP structural validation and metadata stripping in FR-009 instead of full decode/re-encode; the architect's rationale is Cloudflare Workers Free CPU budget and avoiding a new image dependency. The residual risk of a browser image-decoder bug remains visible for PO acceptance under ND-F14-7; retain the architect image-safety decision.
5. Sensitive responses are `private, no-store`; public pointer resolution is fresh per request.
6. Existing `deriveBrand` and `BrandScope` are reused; source color remains intact, contrast adjustments are explained, and semantic tokens are not overridden.
7. Draft revisions use compare-and-set; publication is serialized per workspace; snapshot, current pointer and audit commit together; unchanged publication is a no-op; version number is unique per workspace.
8. A rendered registration form keeps its current identity until reload. Publication does not reset inputs or change signup authorization/snapshots. The decided no-branding default and locale fallback are recorded in FR-008/013.
9. Extend the latest `audit_row_change()` behavior without removing any existing mapping. Exactly one publication audit event is required; audit failure aborts publication; no bytes, authored text, tokens or URLs are recorded.
10. Storage uploads use the r2 lifecycle: private staging, authoritative server validation, immutable content-addressed object in the validated bucket, then revision-checked attachment. Durable states, reconciliation and reference-safe bounded cleanup replace the prior bytea assumption that upload occurs inside the draft transaction. Retain the PO-decided 10 restorable versions; older asset cleanup is a plan item.
11. Registration identity stays within ND-F14-2. The Hero Banner is image-only, has required bilingual alt text with the ND-F14-3 locale fallback, and has no banner text fields — **Architect decision — PO may confirm at plan approval**. The uploader confirms the image has identity content only. Aspect/height values remain a plan-time design item; no portal feature or navigation is invented.

### Focused r2 decisions (accepted; see [spec debate r2](research/spec-debate-r2-scope.md))

1. Replace upload-in-draft-transaction assumptions with private staging, authoritative server validation, immutable content-addressed validated object, and revision-checked draft attachment. Keep durable upload states, reconciliation for interrupted uploads/failed attachments, and reference-safe bounded cleanup.
2. Deliver public images only through a token-validating image proxy. Reapply F10 open validity, including consumption, without extending grace; bind the request to the authorized published version rendered for the token; expose no arbitrary asset/history selectors or client-visible signed URLs; return generic failures. Already displayed pixels may remain.
3. Use private buckets and bucket-qualified `storage.objects` policies with workspace-prefixed paths and independent capability/scope checks. Deny anonymous listing/direct reads, cross-workspace access and published-object mutation. Any narrowly scoped, audited server credential exception must be documented for architect review in the plan.
4. Select separate logo/banner ingress-byte, output-byte, dimension, pixel and structural-complexity limits at plan approval. Validate authoritatively server-side before attachment and benchmark worst-case PNG/WebP walking, stripping and hashing within Workers CPU budget; keep the structural-validation approach.
5. Use the image-only Hero Banner and alt-text behavior in decision 11, subject to PO confirmation at plan approval. Keep exact responsive aspect/height values as an open plan-time design item; crop preview, missing-image fallback and no image/form overlap follow the PO-decided Premium Centered Card.
6. Protect assets referenced by current publication, draft, the 10 restorable versions and active uploads. Use retryable reference-checked garbage collection; model two assets/version, draft/staging, workspace count and no-store egress against verified Free-tier allowances and the 70% exit trigger; prove Storage backup/restore and retain audit independently.
7. Require a Storage-enabled CI lane with readiness checks and zero skips; run F11 pending-client Storage denials alongside F14 bucket/path policy tests, including direct API attempts. Use isolated fixtures and update F11 isolated-runner stack-restoration assumptions.
8. Resolve authorized workspace and published version server-side per request with no shared actor/workspace cache. Discard late workspace-switch responses and use neutral defaults with no scope. Verify contrast on real surface backgrounds/states; keep banner text off imagery or use a guaranteed-contrast scrim from existing tokens; preserve semantic tokens. Define the P4 Client Portal data/token contract and preview placeholder without adding portal features.

## Plan Items — required before plan approval

The r2 critique and response are recorded in [spec debate r2](research/spec-debate-r2-scope.md). These items are requirements for the later plan and do not authorize implementation or create `plan.md`/`tasks.md`.

- **PI-F14-1 — Upload bounds**: Propose and obtain approval for separate logo/banner ingress bytes, output bytes, width/height, pixel and structural-complexity limits; benchmark worst-case structural walk, stripping and hashing within the Workers CPU budget.
- **PI-F14-2 — Storage authorization and credentials**: Specify bucket-qualified path policies and independent capability/scope checks. Document and obtain architect review of any narrowly scoped, audited server credential exception against the architecture's audited-cron-only service-role constraint.
- **PI-F14-3 — Image proxy contract**: Detail token validation on each image request, F10 open validity/consumption/grace behavior, binding to the authorized rendered published version, generic failures, cache headers, and absence of signed URLs or arbitrary selectors.
- **PI-F14-4 — Upload lifecycle and cleanup**: Define durable upload states, interruption/failed-attachment reconciliation, reference-safe retryable cleanup, and protection of current publication, draft, 10 restorable versions and active uploads.
- **PI-F14-5 — Capacity and recovery**: Model up to two assets/version, draft/staging volume, workspace count and no-store egress against verified Free-tier allowances and the 70% exit trigger. Demonstrate Storage backup/restore; preserve audit history independently.
- **PI-F14-6 — Required Storage CI**: Provide a Storage-enabled CI lane with readiness checks and zero permitted skips. Include F11 pending-client Storage denials and F14 bucket/path policy checks with direct API attempts, isolated fixtures, and corrected F11 isolated-runner stack-restoration assumptions.
- **PI-F14-7 — Banner presentation**: The image-only banner and alt-text rule is an architect decision for PO confirmation at plan approval. Obtain the PO's exact aspect/height limits and specify crop preview, missing-image fallback, and a layout where form controls do not overlap imagery. Preserve the PO-approved Premium Centered Card.
- **PI-F14-8 — Cross-surface branding**: Define per-request authorized workspace/version resolution and no shared actor/workspace cache; late-switch response discard and neutral no-scope behavior; surface-specific contrast checks and banner overlay rule. Define only the Client Portal brand data/token contract and preview placeholder, with no invented portal functionality.

## Key Entities

- **Workspace branding draft**: The editable, revisioned identity for one workspace; has an editor and update time; private until publication.
- **Branding version**: An immutable snapshot of an identity that has been published, with workspace-scoped version number, publication actor/time and optional source version for a revert.
- **Branding asset**: A workspace-owned, validated and metadata-stripped logo or Hero Banner image identified within that workspace by its content hash and media type.
- **Branding upload**: A durably tracked asset transfer through private staging, authoritative validation, validated-object storage and revision-checked attachment; interrupted or unattached states are reconcilable.
- **Current published reference**: The workspace-scoped reference to the latest published version; it does not grant public access by itself.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In authorization scenarios, all authorized actors can act only within approved workspace scope; unauthorized roles and foreign-workspace attempts disclose zero foreign branding fields.
- **SC-002**: In concurrency scenarios, no stale draft overwrites a newer revision; each successful changed publication has one current version and one publication audit event; failed audit leaves zero partial publication.
- **SC-003**: Valid registration opens show 100% of permitted identity fields from the latest published version and 0 draft fields; invalid opens show 0 workspace identity fields and retain F10's generic invalid response.
- **SC-004**: 100% of the specified unsupported or malformed image cases are rejected and the previous asset remains unchanged; every interrupted/failed upload is reconcilable, bounded cleanup removes no referenced object, and no client-visible signed URL is issued.
- **SC-005**: No publication changes form input state, signup authorization, or registration-link terms/validity; an already rendered page changes identity only after reload.
- **SC-006**: Brand-derived presentation meets D-18 WCAG 2.2 AA contrast targets in light and dark modes while semantic tokens remain unchanged; any derived adjustment is explained in the editor.
- **SC-007**: Registration, preview and asset responses, including errors, are private and non-stored; no token response is served from a shared cache.
- **SC-008**: Every registration image request rechecks F10 open validity, including consumption, without extending grace; it serves only an asset in the authorized published version rendered for that token, or returns a generic failure. No arbitrary asset/history selector is accepted.
- **SC-009**: Anonymous listing/direct reads, cross-workspace Storage access and published-object mutation are denied by bucket-qualified workspace-path policies plus independent capability/scope checks, including direct API attempts.
- **SC-010**: A required Storage-enabled CI lane runs with readiness checks and zero skipped Storage cases, including F11 pending-client denials and F14 bucket/path policy cases. Storage backup/restore evidence and the capacity model against verified Free-tier allowances and the 70% exit trigger are available before production approval.
- **SC-011**: For each authorized surface, brand contrast is verified on real backgrounds/states; banner text remains off imagery or uses a guaranteed-contrast existing-token scrim, and semantic tokens are unchanged. Workspace switches discard late responses and no-scope views use neutral defaults.

## Assumptions and Dependencies

- F10 remains the sole public token-open path. F11 remains the signup owner and retains its own strict signup validity rules. F14 does not alter either contract.
- D-18, DESIGN.md and the implemented Design System define color and contrast behavior. Existing `deriveBrand` and `BrandScope` are the intended shared mechanism.
- BRD-02 gives the Workspace Owner workspace-scoped branding authority. ND-F14-1 approves `manage_branding` for PO platform-wide and WO in their own workspace; Sales and Trainer have no grant.
- The decided editable content, public rollout surface, revert UX, history retention and asset storage are specified under ND-F14-2..7. Banner image-only behavior is an architect decision pending PO confirmation at plan approval; no banner text is assumed.
- Acceptance scenarios and success criteria are future verification obligations, not claims of implementation or test completion.

## Out of Scope

- Public marketing, landing, FAQ, price, contact, checkout, support CTA or sales-funnel pages; BRD-04.2 restricts the public experience to the registration form.
- Marketing content, including CTA, links, pricing, and contact details, in the registration banner.
- Client Portal functionality beyond published brand data/tokens (P4), F13 freeze/renewal/refunds, F12 financial/approval behavior, and changes to signup authorization or registration-link snapshots.
- PO approval workflow for each publication; BRD-02 says Workspace Owner publication does not require Platform Owner approval, under the approved `manage_branding` capability.
- Implementation artifacts: migrations, application code, tests, plan.md and tasks.md. This delta records the focused critique and accepted architect response; the listed Storage, CI, capacity, banner and cross-surface items must be resolved through planning before implementation.

## Constitution Check

- **I — Strict Workspace Isolation**: Required. Drafts, versions and assets are workspace-bound; all reads/writes verify actual membership and scope at both authorization walls; foreign-workspace denials are acceptance criteria.
- **II — Immutable Financial Truth**: Branding is presentation-only and cannot modify prices, commissions, payments, snapshots or ledger facts.
- **III — Governance & Least Privilege**: ND-F14-1 approves `manage_branding` for PO platform-wide and WO within their own workspace; Sales and Trainer are denied.
- **IV — Approved Scope Only**: Public scope is limited to token-validated registration identity. The content, capability, rollout, and design decisions are approved. Local/CI Storage enablement is approved. Hosted Storage verification remains a production blocker. The accepted r2 architect response specifies proxy-only asset delivery; the existing ND-F14-7 decision-register wording remains unchanged. Separate per-asset limits remain plan items for PO confirmation.
- **V — Versioned, Non-Retroactive Content**: Published identity versions are immutable; a revert produces a new publication and preserves history.
- **VI — Human-Governed People Decisions**: Not implicated; branding does not make or automate people decisions.
- **VII — Privacy & Health-Data Protection**: No token, asset bytes, authored text or URL in audit; no public workspace enumeration; private buckets, per-request token validation, private/no-store proxy responses and no shared actor/workspace cache.
- **VIII — Bilingual, Accessible, Design-System UI**: Arabic-first RTL/English LTR, existing tokens and contrast guard, accessible responsive UI, DESIGN.md and mandatory Frontend Design Gate. DG-F14-1..3 specify approved layouts and color explanation; banner aspect/height remains a plan-time design item.
- **IX — Reliable, Idempotent Operations**: Revision CAS, serialized publication, idempotent unchanged publish, atomic snapshot/reference/audit and rollback on audit failure. Upload states are durable and reconcilable; cleanup is retryable and reference-safe.

This is a requirements specification only. No migration, implementation, test result, plan or task approval is claimed.

## PO Decision Register — Decided (PO, 2026-10-28)

| Decision | Status | Decision |
|---|---|---|
| **ND-F14-1** | **Decided (PO, 2026-10-28)** | PO manages all workspace branding platform-wide. WO manages their own workspace. Approve `manage_branding` for those scopes; Sales and Trainer have none. |
| **ND-F14-2** | **Decided (PO, 2026-10-28)** | Registration shows workspace logo, names, colors, and a customizable Hero Banner; it is not a marketing landing page. BRD-04.2 binds: no CTA, links, pricing, or contact in the banner. Banner is an image plus, only if supported by this spec, plain identity text. |
| **ND-F14-3** | **Decided (PO, 2026-10-28)** | One language name is required; a second is optional and falls back to the provided name. |
| **ND-F14-4** | **Decided (PO, 2026-10-28)** | Published branding applies to Registration and Staff Dashboard, and Client Portal when it exists (P4). F14 provides published brand data/tokens. |
| **ND-F14-5** | **Decided (PO, 2026-10-28)** | Restoring a historical version loads it to Draft; explicit Publish is required. |
| **ND-F14-6** | **Decided (PO, 2026-10-28)** | Keep the last 10 published versions restorable; preserve audit history permanently. Whether stored assets for older versions are deleted is a plan item. |
| **ND-F14-7** | **Decided (PO, 2026-10-28)** | Use Supabase Storage for logos and Hero Banners with workspace isolation, secure access, file validation, and appropriate limits. This supersedes architect B′. Keep PNG/WebP structural validation, metadata stripping, animation rejection, and no SVG. Keep token-gated public reads and `private, no-store`. F14 MUST enable and test Supabase Storage in local development and CI and verify storage security and workspace isolation as implementation work. Hosted compatibility/Storage verification remains a production blocker. **Open plan items requiring PO confirmation at plan approval:** per-asset size/pixel limits and signed-URL versus proxy delivery under the token gate. No production changes without PO approval. |

## Design Decisions — Decided (PO, 2026-10-28)

- **DG-F14-1 — Decided (PO, 2026-10-28)**: Premium Centered Card containing Hero, Logo, and Registration Form.
- **DG-F14-2 — Decided (PO, 2026-10-28)**: Split Editor + Live Preview on desktop, tabs on mobile; preview Registration, Staff Dashboard, and Client Portal surfaces.
- **DG-F14-3 — Decided (PO, 2026-10-28)**: Show inline original-versus-adjusted brand color comparison with an accessibility explanation.

**Plan gate:** The PO-approved focused Sol Medium critique was completed against `c575cfa35b8a22b2f1870692f91846558f332e5e`; all 8 findings were accepted and the architect response is recorded in [spec debate r2](research/spec-debate-r2-scope.md). Resolve the listed plan items before implementation planning is approved.
