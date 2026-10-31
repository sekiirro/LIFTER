# Feature Specification: F14 — Workspace branding

**Feature Branch**: `014-workspace-branding`
**Created**: 2026-10-28
**Status**: Final PO decisions recorded 2026-10-29; planning artifacts updated; no implementation.

**Input**: BRD-02 workspace branding, BRD-04.2, PRD-01/02, DR-01, D-18, DESIGN.md, F10/F11 contracts, architect/critic debate records, and final PO decisions dated 2026-10-29. The final PO decision record below governs where it supersedes earlier debate/spec wording.

## Source references

- [BRD/PRD and DR-01](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md): BRD-02, BRD-04.2, PRD-01, PRD-02, DR-01.
- [Decision register](../../docs/04-changes-and-questions.md): D-18; [DESIGN.md](../../DESIGN.md), especially §§2, 10–12.
- [Design System specification](../002-design-system/spec.md): `BrandScope`, `deriveBrand`, contrast behavior, bilingual accessible interface requirements.
- [F10 specification](../010-registration-links/spec.md) and [registration surface contract](../010-registration-links/contracts/registration-links-surface.md): token-validated public open projection, generic invalid response, response privacy and F11 handoff.
- F11 specification, read from `origin/011-client-accounts` at this base: `specs/011-client-accounts/spec.md`. F11 owns signup and its strict signup-validity policy; F14 does not change that policy.
- [Constitution](../../.specify/memory/constitution.md), Principles I, III, IV, V, VII, VIII and IX.
- [Spec debate r1](research/spec-debate-r1.md) records the architect v0 draft, the Sol Medium critique, and the architect response r1.
- [Spec debate r2](research/spec-debate-r2-scope.md) records the PO-approved focused Storage, banner and cross-surface critique and the architect response.
- The [Frontend Design Gate](../../docs/09-frontend-design-gate.md) applies to every UI change, together with DESIGN.md. Governance docs including the gate are merged to main. The approved UI choices are recorded in DG-F14-1..3.

## User Scenarios & Testing

### User Story 1 — Edit and save a workspace identity draft (Priority: P1)

As an authorized PO or WO, I can manage workspace branding: PO platform-wide and WO for their own workspace using `manage_branding`. Sales and Trainer have no branding-management authority.

**Why this priority**: BRD-02 assigns workspace branding management to the Workspace Owner; the draft is the source for preview and publication.

**Independent Test**: An authorized owner changes permitted draft fields and saves; a separate workspace cannot read or change that draft, and an unauthorized role receives a generic denial.

**Acceptance Scenarios**:

1. **Given** a signed-in actor with approved branding capability and workspace scope, **When** they save valid draft fields, **Then** the draft is saved for that workspace and reports its new revision.
2. **Given** a draft with revision N, **When** an editor submits changes based on revision N after another edit has advanced it, **Then** the stale edit is rejected with explicit stale-edit feedback and does not overwrite the newer draft.
3. **Given** an actor without the approved capability or workspace membership, **When** they request a draft read or write, **Then** access is denied without disclosing another workspace's branding or existence.
4. **Given** an upload that violates the approved format, structure, dimensions, animation, or benchmark-derived role-specific limits, **When** it is submitted, **Then** it is rejected, the prior asset remains intact, its durable upload state is reconciled, and cleanup never deletes a referenced object.

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

**Independent Test**: Publish a changed draft, open a valid registration link, and confirm it shows the current published identity. Confirm the previous publication is eligible for collection once unreferenced while its audit event remains.

**Acceptance Scenarios**:

1. **Given** an authorized editor submits an unchanged draft for publication, **When** publication is processed, **Then** it is an idempotent no-op and creates no duplicate published version or publication audit event.
2. **Given** a changed draft and the current revision, **When** publication succeeds, **Then** one immutable version becomes current and one corresponding `branding.published` audit event is committed with it.
3. **Given** two publication requests race for the same workspace, **When** both are processed, **Then** they are serialized; each successful changed publication has one coherent version, current pointer and audit event, and an audit failure leaves no partial publication.
4. **Given** a publication based on a stale draft revision, **When** it is submitted, **Then** it fails with explicit stale-publish feedback and leaves the current published version unchanged.
5. **Given** a changed publication replaces the current version, **When** the publish commits, **Then** the previous published version and its assets are eligible for garbage collection once no current, draft, or active-upload reference remains; the permanent audit record remains independently and contains no deleted bytes, URLs, or foreign-key dependency on collected versions/assets.
6. **Given** a registration page was rendered against the previous publication, **When** an image request races with publication or collection, **Then** its old handle fails generically; the page must reload to receive the new identity and a handle for the current publication. It never serves bytes from a deleted version.

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
6. **Given** publication changes after a registration page has rendered but before its image request, **When** the image proxy is requested, **Then** a render handle bound to the now-previous version fails generically; the page must reload for a coherent new identity and image. The proxy never serves deleted bytes, and the caller cannot choose a historical version or asset.

## Edge Cases

- Two editors save against the same draft revision: only the compare-and-set winner updates it; the other receives stale-edit feedback.
- Two publish requests race, an audit operation fails, or a publish response is retried: serialization, all-or-nothing publication, and unchanged-draft idempotency apply.
- Cross-workspace draft/version/asset identifiers are supplied, or a caller guesses an asset hash: access is denied; hashes do not authorize reads and assets are not deduplicated across workspaces.
- A staged upload is interrupted, validation fails, or revision-checked attachment fails: its durable state permits reconciliation; bounded cleanup retries and never removes an object referenced by the current publication, draft or active upload.
- A changed publish replaces the prior current version: its snapshot/assets become GC-eligible once unreferenced; a stale render handle fails generically and the page must reload for the new publication. Permanent audit rows remain without references to deleted bytes, URLs, version rows or asset rows.
- A logo or banner has bad magic bytes, invalid structure/CRC or RIFF size, truncation, trailing bytes, unsupported type, animation, excess structural complexity or exceeds the benchmark-derived ingress/output, dimension or pixel limits: reject it and preserve the previous asset.
- A valid image renders in a browser with a decoder defect: residual browser-decoder risk remains a release-review concern; images are displayed only as images, never inline SVG/HTML.
- A registration asset request arrives after token consumption or outside F10's current open-validity window: deny it generically without extending grace; already displayed pixels may remain.
- Anonymous listing/direct object reads, cross-workspace Storage paths, published-object mutation, or an unscoped credential request are attempted: deny them.
- A workspace switch occurs while a preview request is in flight, or no workspace scope is selected: discard the late response and use neutral defaults until the new authorized scope is resolved.
- A banner would place form controls over imagery, or text over imagery without a guaranteed-contrast scrim from existing tokens: fail the surface design requirement. Final banner aspect/height bounds follow the Frontend Design Gate prototype.
- A second locale name or banner alt text is absent: use the supplied required locale's value as fallback, consistent with ND-F14-3.
- No version has been published: the public view uses the decided default (workspace name, emerald-derived tokens, no logo or Hero Banner).
- A logo/banner processing, upload or persistence step fails: the previous asset is preserved; durable state enables reconciliation; reference-safe cleanup never deletes a referenced object.
- A valid F10 open is in grace while F11 signup is past strict expiry: F14 preserves each existing contract; it does not resolve or alter ND-F11-4a.

## Requirements

### Functional Requirements

- **FR-001**: Draft operations MUST require a signed actor, the approved capability and explicit scope to the requested workspace. Workspace access MUST allow a Platform Owner with the capability globally, or an actor with the capability and active membership in the requested workspace. Draft reads use `app_private.has_workspace_access(workspace_id, 'manage_branding')`: a signed actor with the capability is allowed when they are a Platform Owner or an active workspace member. This is the Platform Owner global-access exception and is consistent with save and publish. Both application authorization and database authorization MUST enforce the policy; the UI is not an authorization boundary. Platform Owner access does not depend on workspace membership.
- **FR-002**: Draft, version and asset data MUST be isolated by workspace. Asset identity MUST include both workspace and content hash; composite relationships MUST prevent cross-workspace references. Hashes MUST NOT authorize reads and assets MUST NOT be deduplicated across workspaces.
- **FR-003**: The public identity read MUST extend only the existing F10 token-validated open projection with published identity fields. It MUST expose no workspace selector, draft/history reader or anonymous table access. Invalid token output MUST remain byte-identical to F10's generic invalid output. Registration images MUST be delivered only by a token-validating proxy; client-visible Storage signed URLs and arbitrary asset/history selectors are prohibited.
- **FR-004**: Draft edits MUST carry a revision and use compare-and-set behavior. Stale edits MUST be rejected with explicit feedback and MUST NOT overwrite a newer revision.
- **FR-005**: A changed publication MUST create an immutable snapshot, update the current published reference, and record its publication audit event as one atomic operation. Publication MUST be serialized per workspace, and an audit failure MUST roll back publication. Unchanged-draft publication MUST be a no-op. Version numbers MUST be unique within a workspace.
- **FR-006**: Only the current published branding version MUST be retained long-term. On successful publish, the previous published snapshot and its assets become eligible for reference-aware garbage collection once they are no longer referenced by the current publication, a draft, or an active upload. GC MUST use transactional deletion claims respected by every reference-creating operation and MUST NOT delete referenced objects. No historical restore/rollback capability is required.
- **FR-007**: The single editable brand color MUST be a valid `#RRGGBB` value. The UI MUST reuse `deriveBrand` and `BrandScope`, retain the source color, explain any derived contrast adjustment, and MUST NOT override semantic tokens. D-18 WCAG 2.2 AA requirements apply in both light and dark modes.
- **FR-008**: Published branding applies to Registration and Staff Dashboard, and Client Portal when it exists (P4); F14 provides the published brand data/tokens. Registration identity includes workspace logo, names, colors, and a customizable Hero Banner. One language name is required; a second is optional and falls back to the provided name. BRD-04.2 prohibits CTA, links, pricing, or contact content in the banner. **Architect decision — PO confirmed 2026-10-29**: Hero Banner is image-only, with required bilingual alt text (one language required; the other falls back as in ND-F14-3) and no banner text fields. The uploader MUST confirm that the image contains identity content only, without pricing, contact details, CTA or links. Use the PO-decided Premium Centered Card; form controls MUST never overlap imagery. Responsive aspect/height bounds, crop preview and missing-image fallback are required; exact aspect/height values are decided only after the Frontend Design Gate prototype.
- **FR-009 (PARTIALLY COMPLETE)**: Logo and Hero Banner uploads MUST use private Supabase staging and validated buckets. Uploads MUST proceed from private staging through authoritative server-side PNG/WebP structural validation and metadata stripping to an immutable content-addressed object in the validated bucket, then attach to the draft only if its revision still matches. Track durable upload states and reconcile interrupted uploads and failed attachments. Cleanup MUST be bounded, retryable and reference-checked; it MUST NOT delete any referenced object. Validation MUST inspect magic bytes and walk the full structure, verify PNG chunk CRCs and WebP RIFF sizes, and reject malformed, truncated or trailing data. Dimensions MUST be read from IHDR, VP8X, VP8 or VP8L; separate logo/banner ingress-byte, output-byte, dimension, pixel and structural-complexity limits MUST be derived from worst-case Workers CPU/memory benchmarks. Animation MUST be rejected (including APNG `acTL` and WebP `ANIM`). Metadata stripping MUST keep only PNG IHDR/PLTE/IDAT/IEND/tRNS chunks or WebP VP8/VP8L/VP8X without metadata flags/ALPH chunks. The content hash MUST be computed from stripped bytes. JPEG and SVG are not accepted. **Completed in F14:** private staging, server validation, metadata stripping, validated writes, draft attachment, garbage collection, and the alt-text publish guard. **Pending in F14b:** owner-facing logo and Hero Banner upload controls and banner alt-text editor fields. The PO approved this deferral; F14b starts immediately after F14 merges, in parallel with F13/F15.
- **FR-010**: Logos and Hero Banners MUST be rendered only through an image element, never inline SVG or HTML, and responses MUST use sniffed content type and `X-Content-Type-Options: nosniff`. Registration image delivery MUST use a token-validating proxy only, with no service-role fallback; each request re-applies F10 open validity, including consumption, without changing or extending grace. Access MUST be bound to the currently authorized published version rendered for that token. If publication advances before image fetch, the old handle MUST fail generically; the page reloads to obtain a coherent current identity and render handle. Deleted-version bytes MUST never be served. Proxy failures MUST be generic. Already displayed pixels may remain.
- **FR-011**: Registration, preview and image-proxy responses MUST use `private, no-store`, including errors. Token responses MUST NOT be shared/CDN cached. For each new registration-page render, resolve the current published pointer server-side. For each image-proxy request, re-resolve authorization and F10 token validity and bind delivery to the published version authorized for that rendered page context; do not accept a client-selected asset/version/history identifier. No shared actor/workspace cache is permitted. No client-visible Storage signed URL may be issued.
- **FR-012**: Publication MUST NOT change signup authorization, reset already-entered registration form values, or change the F10/F11 package/workspace snapshot or validity rules. A rendered form keeps its identity until reload.
- **FR-013**: When no published customization exists, use workspace name, emerald-derived tokens, and no logo or Hero Banner.
- **FR-014**: Branding audit MUST produce exactly one `branding.published` event per successful changed publication, containing detached publication/version sequence metadata and changed field names only. Audit rows MUST be permanent and independent of version/asset retention; they MUST NOT have foreign-key dependencies on deletable version or asset rows and MUST exclude image bytes, object identifiers, authored text, tokens and URLs. Failed publication MUST roll back its audit and state changes together.
- **FR-015**: UI MUST be Arabic-first RTL and English LTR, responsive, accessible, and use existing Design System tokens and components. Editor and live preview MUST cover Registration, Staff Dashboard, and a Client Portal preview placeholder when it exists (P4); F14 defines the portal's published brand data/token contract without inventing portal features. On workspace switch, late preview responses MUST be discarded; without an authorized scope, use neutral defaults. Contrast MUST be verified on each surface's real backgrounds and states. `deriveBrand` covers neutral surfaces; banner overlays MUST keep text off imagery or use a guaranteed-contrast scrim from existing tokens. Semantic tokens MUST remain unchanged. The approved design choices are recorded as DG-F14-1..3; exact banner aspect/height remains a plan-time design item.
- **FR-016**: Branding changes MUST remain presentational. They MUST NOT change finance, permissions, security boundaries, signup behavior, or workspace authorization.
- **FR-017**: F14 implementation MUST include a required Storage-enabled CI lane with readiness checks and zero permitted skips. Run F11 pending-client Storage denials alongside F14 bucket/path policy checks, including direct API attempts; use isolated fixtures and update F11 isolated-runner stack-restoration assumptions. No skipped Storage tests are permitted. Hosted-infrastructure proof is required before Production. This spec does not authorize CI, application, Storage or production changes.
- **FR-018**: Bucket-qualified `storage.objects` policies MUST enforce workspace-prefixed paths and independently verified capability/scope. Anonymous listing/direct reads, cross-workspace access and mutation of published objects MUST be denied. Public image delivery MUST NOT fall back to service-role; any other server credential exception MUST be narrowly scoped, audited and documented for architect review, because service-role authority bypasses RLS broadly and the existing Worker also holds a service-role key for the PO-approved D-19 authenticated, capability-scoped manual recovery route.

### Architect Decisions (technical constraints)

The following technical decisions from [spec debate r1](research/spec-debate-r1.md) and [the focused r2 response](research/spec-debate-r2-scope.md) apply with final PO decisions below. R2 findings were all accepted. The banner is image-only as confirmed by the PO; its final aspect/height follows the Frontend Design Gate prototype. This spec does not authorize implementation.

1. Every staff database operation will verify signed actor, capability, membership and workspace within the privileged database operation; use explicit workspace predicates and schema-qualified names; set an empty search path; revoke default execution and grant narrowly. The approved `manage_branding` capability must be implemented in both application and database capability checks.
2. Drafts and versions reference assets within the same workspace. The current published reference is workspace-bound. No hash-based authorization or cross-workspace deduplication.
3. Public reads extend the F10 token-validated projection with published identity only. No separate public workspace selector, draft/history read, anonymous table grant or hash-addressed public asset path.
4. Image processing uses the bounded PNG/WebP structural validation and metadata stripping in FR-009 instead of full decode/re-encode; the architect's rationale is Cloudflare Workers Free CPU budget and avoiding a new image dependency. Residual browser image-decoder risk remains visible for production review.
5. Sensitive responses are `private, no-store`; public pointer resolution is fresh per request.
6. Existing `deriveBrand` and `BrandScope` are reused; source color remains intact, contrast adjustments are explained, and semantic tokens are not overridden.
7. Draft revisions use compare-and-set; publication is serialized per workspace; snapshot, current pointer and audit commit together; unchanged publication is a no-op; version number is unique per workspace.
8. A rendered registration form keeps its current identity until reload. Publication does not reset inputs or change signup authorization/snapshots. The decided no-branding default and locale fallback are recorded in FR-008/013.
9. Extend the latest `audit_row_change()` behavior without removing any existing mapping. Exactly one publication audit event is required; audit failure aborts publication; no bytes, authored text, tokens or URLs are recorded.
10. Storage uploads use the r2 lifecycle: private staging, authoritative server validation, immutable content-addressed object in the validated bucket, then revision-checked attachment. Durable states, reconciliation and reference-safe bounded cleanup replace the prior bytea assumption that upload occurs inside the draft transaction. Only the latest published version is retained long-term; previous versions/assets become GC-eligible when unreferenced. (The r1/r2 debate records are historical; this retention point is superseded by PO 2026-10-29 F14-5.)
11. Registration identity stays within ND-F14-2. The Hero Banner is image-only, has required bilingual alt text with the ND-F14-3 locale fallback, and has no banner text fields — architect decision confirmed by PO 2026-10-29 F14-1. The uploader confirms the image has identity content only. Aspect/height values are decided only after the Frontend Design Gate prototype; no portal feature or navigation is invented.

### Focused r2 decisions reconciled with final PO decisions (see [spec debate r2](research/spec-debate-r2-scope.md))

1. Replace upload-in-draft-transaction assumptions with private staging, authoritative server validation, immutable content-addressed validated object, and revision-checked draft attachment. Keep durable upload states, reconciliation for interrupted uploads/failed attachments, and reference-safe bounded cleanup.
2. Deliver public images only through a token-validating image proxy. Reapply F10 open validity, including consumption, without extending grace; bind the request to the authorized published version rendered for the token; expose no arbitrary asset/history selectors or client-visible signed URLs; return generic failures. Already displayed pixels may remain.
3. Use private buckets and bucket-qualified `storage.objects` policies with workspace-prefixed paths and independent capability/scope checks. Deny anonymous listing/direct reads, cross-workspace access and published-object mutation. Any narrowly scoped, audited server credential exception must be documented for architect review in the plan.
4. Set separate logo/banner ingress-byte, output-byte, dimension, pixel and structural-complexity limits from worst-case Workers CPU/memory benchmarks. Validate authoritatively server-side before attachment; keep the structural-validation approach.
5. Use the PO-confirmed image-only Hero Banner and alt-text behavior in decision 11. Keep exact responsive aspect/height values for the Frontend Design Gate prototype; crop preview, missing-image fallback and no image/form overlap follow the PO-decided Premium Centered Card.
6. Protect assets referenced by current publication, drafts and active uploads. Use race-safe reference-checked garbage collection with transactional deletion claims. Only the latest publication is retained long-term; previous snapshots/assets become eligible once unreferenced. Audit remains permanent and detached from deletable versions/assets. Model up to two current assets/workspace, draft/staging, workspace count and no-store egress against verified Storage allowances and the 70% exit trigger; prove Storage backup/restore.
7. Require a Storage-enabled CI lane with readiness checks and zero skips; run F11 pending-client Storage denials alongside F14 bucket/path policy tests, including direct API attempts. Use isolated fixtures and update F11 isolated-runner stack-restoration assumptions.
8. Resolve authorized workspace and published version server-side per request with no shared actor/workspace cache. Discard late workspace-switch responses and use neutral defaults with no scope. Verify contrast on real surface backgrounds/states; keep banner text off imagery or use a guaranteed-contrast scrim from existing tokens; preserve semantic tokens. Define the P4 Client Portal data/token contract and preview placeholder without adding portal features.

## Technical plan requirements

The focused critique and architect response are recorded in [spec debate r2](research/spec-debate-r2-scope.md). These requirements are carried in the current plan and tasks; they do not authorize implementation.

- **PI-F14-1 — Upload bounds**: Derive separate logo/banner ingress bytes, output bytes, width/height, pixel and structural-complexity limits from worst-case structural walk, stripping and hashing measurements within Workers CPU/memory budgets.
- **PI-F14-2 — Storage authorization and credentials**: Specify bucket-qualified path policies and independent capability/scope checks. No service-role fallback is permitted for public images; restricted identities, local Stack B proof, hosted-infrastructure proof before Production, and audit/rotation evidence are required.
- **PI-F14-3 — Image proxy contract**: Detail token validation on each image request, F10 open validity/consumption/grace behavior, binding to the authorized rendered published version, generic failures, cache headers, and absence of signed URLs or arbitrary selectors.
- **PI-F14-4 — Upload lifecycle and cleanup**: Define durable upload states, interruption/failed-attachment reconciliation, reference-safe retryable cleanup, and temporary protection of current publication, drafts and active uploads. The previous publication becomes eligible for GC once unreferenced.
- **PI-F14-5 — Capacity and recovery**: Model up to two current assets per workspace, draft/staging volume, workspace count and no-store egress against verified Storage allowances and the 70% exit trigger. Demonstrate Storage backup/restore; preserve audit history independently.
- **PI-F14-6 — Required Storage CI**: Provide a Storage-enabled CI lane with readiness checks and zero permitted skips. Include F11 pending-client Storage denials and F14 bucket/path policy checks with direct API attempts, isolated fixtures, and corrected F11 isolated-runner stack-restoration assumptions.
- **PI-F14-7 — Banner presentation**: Image-only banner and bilingual alt-text behavior are decided. Obtain exact aspect/height limits only after the Frontend Design Gate prototype; specify crop preview, missing-image fallback, and a layout where form controls do not overlap imagery. Preserve the PO-approved Premium Centered Card.
- **PI-F14-8 — Cross-surface branding**: Define per-request authorized workspace/version resolution and no shared actor/workspace cache; late-switch response discard and neutral no-scope behavior; surface-specific contrast checks and banner overlay rule. Define only the Client Portal brand data/token contract and preview placeholder, with no invented portal functionality.

## Key Entities

- **Workspace branding draft**: The editable, revisioned identity for one workspace; has an editor and update time; private until publication.
- **Branding version**: An immutable snapshot of the current identity publication, with workspace-scoped sequence number and publication actor/time. Only the latest publication is retained long-term.
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
- **SC-008**: Every registration image request rechecks F10 open validity, including consumption, without extending grace; it serves only an asset in the currently authorized published version rendered for that token, or returns a generic failure. A stale handle never serves deleted-version bytes; the page reloads to obtain the current identity. No arbitrary asset/history selector is accepted.
- **SC-009**: Anonymous listing/direct reads, cross-workspace Storage access and published-object mutation are denied by bucket-qualified workspace-path policies plus independent capability/scope checks, including direct API attempts.
- **SC-010**: A required Storage-enabled CI lane runs with readiness checks and zero skipped Storage cases, including F11 pending-client denials and F14 bucket/path policy cases. Storage backup/restore evidence and the capacity model against verified Storage allowances and the 70% exit trigger are available before production approval; hosted-infrastructure proof and no service-role fallback for public images are explicit release gates.
- **SC-011**: For each authorized surface, brand contrast is verified on real backgrounds/states; banner text remains off imagery or uses a guaranteed-contrast existing-token scrim, and semantic tokens are unchanged. Workspace switches discard late responses and no-scope views use neutral defaults.

## Assumptions and Dependencies

- F10 remains the sole public token-open path. F11 remains the signup owner and retains its own strict signup validity rules. F14 does not alter either contract.
- D-18, DESIGN.md and the implemented Design System define color and contrast behavior. Existing `deriveBrand` and `BrandScope` are the intended shared mechanism.
- BRD-02 gives the Workspace Owner workspace-scoped branding authority. ND-F14-1 approves `manage_branding` for PO platform-wide and WO in their own workspace; Sales and Trainer have no grant.
- The decided editable content, public rollout surface, current-only publication retention and asset storage are specified in the final PO decision record. Historical restore/rollback is out of scope. Banner image-only behavior is PO-confirmed; no banner text is assumed.
- Acceptance scenarios and success criteria are future verification obligations, not claims of implementation or test completion.

## Out of Scope

- Public marketing, landing, FAQ, price, contact, checkout, support CTA or sales-funnel pages; BRD-04.2 restricts the public experience to the registration form.
- Marketing content, including CTA, links, pricing, and contact details, in the registration banner.
- Client Portal functionality beyond published brand data/tokens (P4), F13 freeze/renewal/refunds, F12 financial/approval behavior, and changes to signup authorization or registration-link snapshots.
- PO approval workflow for each publication; BRD-02 says Workspace Owner publication does not require Platform Owner approval, under the approved `manage_branding` capability.
- Implementation artifacts: migrations, application code and tests. This specification and its planning artifacts record approved requirements and future verification obligations; no implementation is included here.

## Constitution Check

- **I — Strict Workspace Isolation**: Required. Drafts, versions and assets are workspace-bound; all reads/writes verify actual membership and scope at both authorization walls; foreign-workspace denials are acceptance criteria.
- **II — Immutable Financial Truth**: Branding is presentation-only and cannot modify prices, commissions, payments, snapshots or ledger facts.
- **III — Governance & Least Privilege**: ND-F14-1 approves `manage_branding` for PO platform-wide and WO within their own workspace; Sales and Trainer are denied.
- **IV — Approved Scope Only**: Public scope is limited to token-validated registration identity. Final PO decisions define content, capability, rollout, retention and design gates. Local/CI Storage enablement is approved. Hosted-infrastructure proof remains a production blocker. F14-6 corrects ND-F14-7 to proxy-only and removes the obsolete signed-URL alternative. Role-specific upload limits follow CPU/memory benchmark evidence.
- **V — Versioned, Non-Retroactive Content**: Each publication is an immutable snapshot; a new publish replaces the prior current snapshot. Permanent audit history is independent of snapshot and asset retention.
- **VI — Human-Governed People Decisions**: Not implicated; branding does not make or automate people decisions.
- **VII — Privacy & Health-Data Protection**: No token, asset bytes, authored text or URL in audit; no public workspace enumeration; private buckets, per-request token validation, private/no-store proxy responses and no shared actor/workspace cache.
- **VIII — Bilingual, Accessible, Design-System UI**: Arabic-first RTL/English LTR, existing tokens and contrast guard, accessible responsive UI, DESIGN.md and mandatory Frontend Design Gate. DG-F14-1..3 specify approved layouts and color explanation; banner aspect/height remains a plan-time design item.
- **IX — Reliable, Idempotent Operations**: Revision CAS, serialized publication, idempotent unchanged publish, atomic snapshot/reference/audit and rollback on audit failure. Upload states are durable and reconcilable; cleanup is retryable and reference-safe.

This is a requirements specification only. No migration, implementation, test result, plan or task approval is claimed.

## PO Decision Record — F14 FINAL (PO, 2026-10-29)

The following decisions are recorded verbatim from the final PO decision source and supersede earlier F14 decision-register wording where inconsistent.

- F14-1: Image-only Hero Banner, AR/EN Alt Text with locale fallback; no text overlays.
- F14-2: Final banner dimensions only after Frontend Design Gate prototype review.
- F14-3: Separate Logo/Banner upload limits determined by worst-case Workers CPU/memory benchmarks.
- F14-4: Restricted `branding_proxy` / `branding_validator` identities with expiring/revocable credentials, F10 link checks, render handles and Storage RLS. Prove locally on Stack B and on hosted infrastructure before Production; no service-role fallback for public images.
- F14-5 (CUSTOM): Retain ONLY the latest published branding version long-term. Remove historical 10-version rollback requirements. Temporarily protect current references, Drafts and active Uploads; use race-safe, reference-aware garbage collection. Preserve audit history.
- F14-6: Correct ND-F14-7 to Proxy-only; remove obsolete Signed URL alternative.
- F14-7: Verify Storage/Egress capacity, 70% exit trigger and actual Backup/Restore before Production.
- F14-8: Client Portal branding contract, tokens and nonfunctional preview only; no P4 implementation.
- **F14-1 (render-handle caps, PO session 13, 2026-10-29):** “F14-1=A: Render handles: 5-min expiry, 8 active/link, 30 per rolling 5 min.” This is distinct from F14-1 above (Hero Banner).

**ND-F14-7 (corrected per F14-6)**: Use private Supabase Storage for branding assets with workspace isolation, structural validation, metadata stripping, animation rejection, no SVG, and token-validating proxy-only public delivery. Each image request re-applies F10 validity including consumption without extending grace. No client-visible Storage URL or arbitrary asset/version selector is exposed. Stack B and hosted-infrastructure proof are required gates; no service-role fallback for public images.

Earlier ND-F14-1..6 wording is historical and superseded by the final decision record above wherever inconsistent. The stable design decisions DG-F14-1..3 remain approved.

## Design Decisions — Decided (PO, 2026-10-28)

- **DG-F14-1 — Decided (PO, 2026-10-28)**: Premium Centered Card containing Hero, Logo, and Registration Form.
- **DG-F14-2 — Decided (PO, 2026-10-28)**: Split Editor + Live Preview on desktop, tabs on mobile; preview Registration, Staff Dashboard, and Client Portal surfaces.
- **DG-F14-3 — Decided (PO, 2026-10-28)**: Show inline original-versus-adjusted brand color comparison with an accessibility explanation.

**Plan gate:** The PO-approved focused Sol Medium critique was completed against `c575cfa35b8a22b2f1870692f91846558f332e5e`; all 8 findings were accepted and the architect response is recorded in [spec debate r2](research/spec-debate-r2-scope.md). Final PO decisions are recorded above; r1/r2 debate records remain historical, with retention superseded by PO 2026-10-29 F14-5.
