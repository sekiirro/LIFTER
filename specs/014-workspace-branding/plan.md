# Implementation Plan: F14 — Workspace branding

**Branch**: `014-workspace-branding` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Approved specification plus accepted focused r2 critique [record](research/spec-debate-r2-scope.md). This plan and its tasks are planning artifacts only; approval items below remain open.

## Summary

Deliver workspace branding drafts, private preview, immutable audited publication and restore-to-draft for PO/WO; expose only published identity through F10 registration and the authorized staff surface, and through a P4-gated Client Portal token contract. Keep tenant isolation at both authorization walls and forced RLS. Process logo/banner images through private staging, authoritative PNG/WebP structural validation and metadata stripping, immutable content-addressed storage, then revision-checked attachment. Serve registration assets only through an F10-validating image proxy. Preserve the accepted r2 architecture, UI decisions, ten-version restore window, permanent audit, and all open PO decisions in [spec.md](spec.md).

Implementation is contingent on PO approval of this plan's `PA-F14-*` items, the Storage-enabled stack-B profile, and architect resolution of stack/migration integration. This change does not provision or run any stack.

## Technical Context

**Language/Version**: TypeScript/Next.js App Router and PostgreSQL/Supabase, following current repository versions.
**Primary Dependencies**: Existing Supabase clients and authorization utilities; `authorize()` plus database `has_workspace_access()`; existing design tokens, `deriveBrand`, `BrandScope`, i18n, and UI components. No new dependency is presumed.
**Storage**: Supabase Postgres with forced RLS; private Supabase Storage staging and validated buckets.
**Testing**: Unit and contract tests first; Storage-enabled required CI lane with readiness checks and zero skips; DB/Storage integration and direct API policy tests only on stack B. Frontend Design Gate render/accessibility matrix.
**Target Platform**: Next.js on Cloudflare Workers; Supabase local stack B for DB/Storage implementation verification.
**Project Type**: Web application with server routes/actions, Postgres policies/functions, Storage, and responsive bilingual UI.
**Performance Goals**: Complete worst-case PNG/WebP validation, full structural walk, metadata stripping and hashing inside the Workers Free request CPU budget; numeric resource/CPU acceptance criteria are PA-F14 items. No speculative latency target is added.
**Constraints**: No client-visible signed URLs; private/no-store token responses; F10 validity including consumption on every image request without grace extension; per-request authorized workspace/version resolution; no shared actor/workspace cache; no cross-workspace deduplication; no CTA/links/pricing/contact in banner; no SVG/JPEG; preserve semantic tokens and existing D-18 contrast requirements.
**Scale/Scope**: One draft per workspace, immutable versions with last ten restorable, two asset roles (logo/banner), active upload staging, registration and staff surfaces, Client Portal brand contract only when P4 exists. Capacity is modeled before production use.

## Constitution Check

| Principle / gate | Plan check |
|---|---|
| I. Strict Workspace Isolation | Pass with implementation gate: both `authorize()` and `has_workspace_access()`/forced RLS; workspace-qualified entities, Storage paths and direct API denial tests. |
| II. Immutable Financial Truth | Pass: branding changes presentation only; no pricing, payment, commission, subscription or ledger writes. |
| III. Governance & Least Privilege | Pass: `manage_branding` is PO platform-wide and WO own workspace only; Sales/Trainer denied; any privileged Storage exception is still a PO decision. |
| IV. Approved Scope Only | Conditional: scope follows F14; image-only banner is architect decision pending PO confirmation; open PA items block implementation approval. No marketing/P2/P4 feature creep. |
| V. Versioned, Non-Retroactive Content | Pass: immutable publish snapshots; restore copies to draft and requires explicit new publication. |
| VI. Human-Governed People Decisions | Pass/not implicated: branding does not automate people decisions. |
| VII. Privacy & Health-Data Protection | Pass with security gate: no token/bytes/authored text/URL in audit; private buckets; per-request token validation; generic failures; no shared token cache. |
| VIII. Bilingual, Accessible, Design-System UI | Conditional: DESIGN.md and Frontend Design Gate govern all UI; existing tokens/semantic colors only; Arabic-first RTL and English LTR, light/dark, mobile/desktop, accessibility and state evidence required. Banner aspect/height awaits PO design decision. |
| IX. Reliable, Idempotent Operations | Pass with verification gate: draft CAS, serialized atomic publish/audit, durable uploads and reconciliation, bounded reference-safe GC, idempotent unchanged publish. |

**Gate result**: No known constitutional violation. Implementation is blocked on the explicit PO and architecture dependencies in this plan; review this table again after data-model/contracts and at implementation review.

## Architecture and sequencing

### Authorization and persistence

- Every operation resolves signed actor and explicit workspace scope. The application `authorize()` wall and DB `has_workspace_access()`/capability wall both enforce PO-global or WO-own scope; deny by default. Forced RLS covers branding rows. Sales and Trainer have no access.
- Keep one workspace draft with compare-and-set revision, immutable publication versions and an atomic current pointer plus audit event. Stale edits/publishes fail explicitly. Unchanged publication is a no-op. Restore to draft; explicit publish creates a new version.
- Use the current F11 `app_private.audit_row_change()` body as the base and preserve every mapping. Add a constrained F14 event for publication only. Audit is permanent and independent of asset cleanup.

### Upload and Storage

1. Accept upload to a private staging bucket and persist durable upload state.
2. Validate authoritatively on the server: PNG/WebP structural walk; validate magic, all chunk/container boundaries, PNG CRC/WebP RIFF sizes, dimension metadata and structural complexity; reject truncation, trailing data, animation, SVG/JPEG. Strip metadata using the precise allowed PNG/WebP structures in FR-009.
3. Hash validated output bytes and store immutable content-addressed objects in the private validated bucket. No cross-workspace deduplication and no overwrite.
4. Attach only after checking the submitted draft revision. Reconcile interruptions and failed/stale attachment. Bounded retryable cleanup must recheck references to current publication, draft, ten restorable versions, and active uploads before removing an object.
- Storage policies are bucket-qualified, constrain workspace-prefixed paths, and independently check capability/scope. Anonymous listing/direct reads, cross-workspace reads and published-object mutation are denied. Test direct API attempts.
- Each image must pass limits specific to role: ingress bytes, output bytes, dimensions, pixels and structural complexity. No numeric values or validator library is selected until PO approves limits and a worst-case CPU benchmark method.
- Public image delivery uses only the token-validating proxy; reapply F10 open validity including consumption on each request without grace extension; bind to the authorized published version for that rendered token context; return generic failures and private/no-store headers. Never expose client-visible signed URLs or arbitrary asset/history selectors.
- Any server Storage credential exception remains undecided. Baseline architecture confines service-role to audited cron. Any exception needs explicit narrow scope, audit and architect review.

### Version audit and migration coordination

Extend the full latest F11 `audit_row_change()` body read from `origin/011-client-accounts` (`supabase/migrations/20261031122000_client_accounts_signup.sql`) so all current F11 mappings remain. F14 is based on main while F11 is separate; migration timestamp ordering/rebase risk must be resolved by the architect after integration planning. The F14 implementation branch must not guess a timestamp or drop the F11 additions.

### Stack-B integration

DB and Storage tests run only on stack B: project `lifter-stack-b`, ports `25420–25429`, selected with `LIFTER_SUPABASE_STACK=b`. The second-stack guide was read from `infra-second-stack`; that branch is based on F11 commit `440f0b2`, not F14's main-based line. Proposed path: infrastructure owner reviews the branch diff, then ports only the approved stack-B configuration as a patch/cherry-pick onto an integration branch based on F14/main. Do not merge the F11-based branch wholesale. Architect must confirm the exact path and conflict handling. Stack B must enable `storage-api` and documented dependencies in its start profile; current standard stack defaults do not establish that profile. Provisioning/start waits for PO approval. The required CI lane uses this Storage-enabled profile, readiness checks and zero permitted skips, and includes F11 pending-client Storage denial tests plus F14 bucket/path/direct-API tests. Update F11 isolated runner stack-restoration assumptions in coordination with F11 owners.

### User interfaces

- All UI changes follow [DESIGN.md](../../DESIGN.md) and the [Frontend Design Gate](../../docs/09-frontend-design-gate.md) (added by branch `docs-workflow-governance`, pending merge to main). Existing tokens and `deriveBrand`/`BrandScope` remain authoritative. Keep semantic success/warning/error tokens unchanged.
- Registration uses DG-F14-1 Premium Centered Card. Hero Banner is image-only with required bilingual alt text and fallback as in ND-F14-3, architect decision pending PO confirmation; uploader confirms identity content only; no pricing, contact, CTA, links or text fields. Controls never overlap imagery. Aspect/height, crop presentation and missing-image fallback must use approved design decisions.
- Editor is DG-F14-2 desktop split editor/live preview and mobile tabs, previewing Registration, Staff Dashboard and Client Portal placeholder. DG-F14-3 inline original/adjusted color explanation.
- Contrast is checked for each surface's real backgrounds and states. `deriveBrand` covers neutral surfaces only; banner text remains off image or uses guaranteed-contrast scrim from existing tokens. Resolve workspace/version per request, discard late switch responses, use neutral defaults with no scope. Client Portal is brand data/token contract only, conditional on P4.
- Frontend Design Gate evidence is a later UI implementation gate: AR-RTL/EN-LTR × light/dark × 390/1440px, tablet if layout changes, interaction/state/accessibility coverage, screenshots reviewed against DESIGN.md. No UI is implemented or rendered in this planning change.

## Project Structure

### Planning artifacts

```text
specs/014-workspace-branding/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── branding-workflow.md
│   ├── public-branding.md
│   └── ci-and-ui.md
└── tasks.md
```

### Anticipated implementation ownership

Exact paths must be reconciled against the approved F14 spec and F11 integration during each unit; the following are ownership boundaries, not changes in this planning unit.

```text
supabase/migrations/                 # F14 schema, forced RLS, helpers, audit extension, Storage policies
lib/branding/                         # validation, entities, upload state, service and public projection
app/(dashboard)/branding/             # editor, preview, history, actions
app/register/[token]/                 # published identity integration; proxy route under app/api/branding/
components/branding/                  # editor panels and surface previews
lib/i18n/messages/                    # bilingual labels and copy
tests/unit/                           # validation, tokens, state and concurrency contracts
tests/integration/                    # DB/Storage policies, publication, audit and upload flows; stack B only
tests/e2e/                            # gated UI/design/accessibility journey verification
.github/workflows/                    # required Storage readiness/security lane
tests/integration/                    # F11 runner assumptions coordinated with F11 owners
```

**Structure Decision**: Extend the existing Next.js monorepo and its established `app/`, `lib/`, `components/`, `supabase/`, and `tests/` layout. No new project or dependency is presumed.

## Complexity Tracking

No constitution exception is requested. The necessary additional complexity is bounded to the scope's security and reliability constraints and tracked here for review:

| Added concern | Why required | Simpler option rejected because |
|---|---|---|
| Two-stage private image storage plus validation/reconciliation | Prevent untrusted or partially processed bytes from becoming attachable/public; ensure interrupted operations recover safely. | Direct-to-public or attach-before-validate violates r2 private buckets, validation, immutability and reference-safety. |
| Token-validating proxy | Recheck F10 state including consumption for every image request and bind bytes to rendered published version. | Signed/public URLs permit bypass of per-request F10 validity and violate accepted r2. |
| Required Storage CI lane and stack B | Stack A is locked by F11; F14 needs isolated DB and Storage policy verification. | Running against A violates lock/isolation; silently skipped Storage tests would not verify security. |
| Durable upload states plus reference-aware GC | Recover partial operations without deleting current/draft/restorable/active references. | Best-effort cleanup risks asset loss or permanent orphan accumulation. |

## Plan-approval items for the PO

Each item remains open. Recommendations are for PO consideration only and do not approve or implement an option.

### PA-F14-1 — Hero Banner content model (architect decision pending PO confirmation)

- **A. Image-only banner, bilingual alt text (recommended)** — confirm architect decision; one locale required and other falls back. Restricts user-authored banner content and aligns with accessibility and BRD-04.2.
- **B. Image plus plain identity text** — preserves the broader ND-F14-2 wording; requires additional copy rules, contrast and layout decisions, with greater risk of prohibited CTA/pricing/contact content.
- **C. Image only without requiring bilingual alt text** — simpler entry but weakens accessible image identity and contradicts the architect response.

### PA-F14-2 — Banner aspect and height limits (design decision)

- **A. Approve values after Frontend Design Gate prototype across Registration/editor/mobile (recommended)** — supports crop behavior, card layout and form non-overlap; requires design review before implementation.
- **B. Approve separate responsive aspect/height ranges for desktop and mobile** — more art direction, more crop states and test burden.
- **C. No banner or defer banner UI** — reduces design uncertainty but narrows the PO-decided registration branding scope. Do not silently substitute this option.

### PA-F14-3 — Separate upload limits and CPU benchmark method

- **A. Approve role-specific ingress/output bytes, dimensions, pixels and structural-complexity caps after worst-case PNG/WebP walk/strip/hash benchmark in Workers Free (recommended)** — evidence-based safety/resource balance; requires fixtures and CPU measurements.
- **B. Use one shared conservative limit for logo and banner** — simpler policy and lower capacity variance; may reject reasonable banner assets or underuse logo budget.
- **C. Defer uploads until capacity and CPU measurements are available** — safest operationally, but postpones logo/banner delivery.

### PA-F14-4 — Server-side Storage credential exception

- **A. No F14 exception; retain service-role for audited cron only (recommended)** — lowest privilege; public proxy and owner operations use user-scoped authorization.
- **B. Approve one narrowly scoped server credential for a named operation after architect review** — may support a privileged server-only Storage operation; requires explicit operation, credential scope, audit fields, rotation and tests before acceptance.
- **C. Defer affected operation until its credential model is resolved** — avoids premature privilege but can delay upload/reconciliation.

### PA-F14-5 — Asset retention and reference-safe cleanup

- **A. Preserve assets referenced by current publication, draft, ten restorable versions and active uploads; collect only unreferenced assets with bounded retryable GC (recommended)** — satisfies accepted r2 and ND-F14-6; capacity model must include the retained set.
- **B. Retain all historical objects indefinitely** — simplest deletion semantics and maximum recovery; growing Storage/cost exposure.
- **C. Retain fewer than ten versions' assets** — reduces storage but contradicts ten restorable versions unless the PO changes ND-F14-6 through spec review.

### PA-F14-6 — Stack-B integration and Storage profile

- **A. Architect/infrastructure owner reviews and ports only stack-B configuration onto an F14/main-based integration branch; enable Storage API and dependencies; no wholesale F11 branch merge (recommended)** — avoids importing F11 feature ancestry while preserving isolation; requires owner work and CI resource review.
- **B. Rebase the infra branch onto F14/main before integration** — produces a single-line history but requires resolving/reviewing F11 deltas and migration compatibility.
- **C. Defer DB/Storage implementation until a separately provisioned and approved stack-B integration base exists** — lowest integration risk, slower delivery.

### PA-F14-7 — F11/F14 audit migration ordering

- **A. After F11 lands, architect resolves timestamp ordering and rebases/retimestamps the not-yet-applied F14 migration from the complete latest F11 audit function (recommended)** — preserves all mappings and ensures deterministic migration order; requires integration coordination.
- **B. Coordinate an explicit migration timestamp reservation before F11 lands** — can reduce retimestamping but depends on both streams and merge sequence.
- **C. Defer the F14 audit migration until F11 integration is settled** — safest sequencing, but blocks end-to-end publish implementation.

### PA-F14-8 — Public asset delivery and stale ND-F14-7 wording

- **A. Follow accepted r2 proxy-only decision and update the stale signed-URL-versus-proxy phrase through a PO-approved spec correction (recommended)** — per-request F10 check, render-bound asset, no client-visible URL. Keep existing ND wording unchanged until PO approves correction.
- **B. Reopen the spec decision register to compare proxy with signed URL** — would conflict with the accepted r2 architecture and require a new explicit PO/architect decision; adds bypass/caching risk.
- **C. Defer public images until delivery wording is reconciled** — avoids inconsistent implementation, but banner/logo will not render publicly.

### PA-F14-9 — Capacity, backup/restore and production gate

- **A. Verify current Supabase Free allowances, measure planned asset/egress model against the 70% exit trigger, and prove Storage backup/restore before production (recommended)** — keeps the $0 initial architecture evidence-based; requires environment-specific verification and restore rehearsal.
- **B. Adopt a PO-approved paid tier before launch** — reduces Free-tier pressure but adds recurring spend and still needs backup proof.
- **C. Launch without Storage backup/restore proof** — faster but leaves branding assets unrecoverable; not recommended and does not satisfy the production gate.

### PA-F14-10 — Client Portal dependency

- **A. Define only the published-brand data/token contract and preview placeholder; implement the surface when P4 exists (recommended)** — preserves ND-F14-4 while avoiding invented portal features.
- **B. Wait for P4 before defining any portal contract** — avoids speculative contracts but will require F14 follow-up.
- **C. Implement a portal shell as part of F14** — expands scope and is not supported by the current approved requirements.
