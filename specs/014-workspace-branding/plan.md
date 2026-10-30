# Implementation Plan: F14 — Workspace branding

**Branch**: `014-workspace-branding` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Final PO decisions in [spec](spec.md), accepted focused r2 critique [record](research/spec-debate-r2-scope.md), and read-only proxy credential critique [record](research/proxy-credential-critique.md). The r1/r2 debate records remain historical; retention is superseded by PO 2026-10-29 F14-5. This plan and its tasks are planning artifacts only.

## Summary

Deliver workspace branding drafts, private preview and immutable audited publication for PO/WO; expose only published identity through F10 registration and the authorized staff surface, with a P4-gated Client Portal brand contract/placeholder. Keep tenant isolation at both authorization walls and forced RLS. Process logo/banner images through private staging, authoritative PNG/WebP structural validation and metadata stripping, immutable content-addressed storage, then revision-checked attachment. Serve registration assets only through an F10-validating image proxy. Retain only the current published version long-term; preserve audit permanently and collect prior snapshots/assets after they become unreferenced.

Implementation follows final PO decisions recorded in the spec. Proxy/validator acceptance is gated on pinned stack-B proof of request-context and operation enforcement; Production is gated on hosted-infrastructure compatibility proof and backup/capacity evidence. Stack-B provisioning/start was PO-approved and completed by the separate stack lane; F14 does not provision or start it.

## Technical Context

**Language/Version**: TypeScript/Next.js App Router and PostgreSQL/Supabase, following current repository versions.
**Primary Dependencies**: Existing Supabase clients and authorization utilities; `authorize()` plus database `has_workspace_access()`; existing design tokens, `deriveBrand`, `BrandScope`, i18n, and UI components. No new dependency is presumed.
**Storage**: Supabase Postgres with forced RLS; private Supabase Storage staging and validated buckets.
**Testing**: Unit and contract tests first; Storage-enabled required CI lane with readiness checks and zero skips on the root profile; DB/Storage integration and direct API policy tests run locally on stack B. Frontend Design Gate render/accessibility matrix.
**Target Platform**: Next.js on Cloudflare Workers; Supabase local stack B for DB/Storage implementation verification.
**Project Type**: Web application with server routes/actions, Postgres policies/functions, Storage, and responsive bilingual UI.
**Performance Goals**: Complete worst-case PNG/WebP validation, full structural walk, metadata stripping and hashing inside the Workers Free request CPU/memory budget; separate logo/banner limits follow measured worst-case benchmarks. No speculative latency target is added.
**Constraints**: No client-visible signed URLs; private/no-store token responses; F10 validity including consumption on every image request without grace extension; hashed opaque render handles bound to link and published version; restricted externally pre-issued proxy/validator JWTs with no project signing key on Workers; per-request authorized workspace/version resolution; no shared actor/workspace cache; no cross-workspace deduplication; no CTA/links/pricing/contact in banner; no SVG/JPEG; preserve semantic tokens and existing D-18 contrast requirements.
**Scale/Scope**: One draft per workspace, one long-term current published version, two asset roles (logo/banner), active upload staging, registration and staff surfaces, Client Portal brand contract and nonfunctional preview only. Capacity is modeled before production use.

## Constitution Check

| Principle / gate | Plan check |
|---|---|
| I. Strict Workspace Isolation | Pass with implementation gate: both `authorize()` and `has_workspace_access()`/forced RLS; workspace-qualified entities, Storage paths and direct API denial tests. |
| II. Immutable Financial Truth | Pass: branding changes presentation only; no pricing, payment, commission, subscription or ledger writes. |
| III. Governance & Least Privilege | Pass: `manage_branding` is PO platform-wide and WO own workspace only; Sales/Trainer denied; public images use restricted identities with no service-role fallback. |
| IV. Approved Scope Only | Pass: final PO decisions define image-only banner, proxy-only delivery, current-version retention and a nonfunctional P4 portal preview. No marketing/P2/P4 feature creep. |
| V. Versioned, Non-Retroactive Content | Pass: immutable current publish snapshots; prior snapshots are collectible when unreferenced; permanent audit is independent. |
| VI. Human-Governed People Decisions | Pass/not implicated: branding does not automate people decisions. |
| VII. Privacy & Health-Data Protection | Pass with security gate: no token/bytes/authored text/URL in audit; private buckets; per-request token validation; generic failures; no shared token cache. |
| VIII. Bilingual, Accessible, Design-System UI | Conditional: DESIGN.md and Frontend Design Gate govern all UI; existing tokens/semantic colors only; Arabic-first RTL and English LTR, light/dark, mobile/desktop, accessibility and state evidence required. Banner aspect/height awaits PO design decision. |
| IX. Reliable, Idempotent Operations | Pass with verification gate: draft CAS, serialized atomic publish/audit, durable uploads and reconciliation, bounded reference-safe GC, idempotent unchanged publish. |

**Gate result**: No known constitutional violation. Implementation is blocked on the explicit PO decisions and the pinned stack-B request-context/operation proof; review this table again after data-model/contracts and at implementation review.

## Architecture and sequencing

### Security units T047 / T045 / T046 — approved caps and architect implementation details

Session 12 security units use forward-only migrations `20261102120000`, `20261102121000`, and `20261102122000`, after the F12-owned `20261101*` range. Owners are explicitly `postgres`, per the architect's run decision; functions use empty search paths, qualified application references and narrow execution grants. No capability, workspace-access or shared audit function is changed.

**PO-approved (F14-1 render-handle caps, session 13):** render handles expire after at most **5 minutes** and never after the live F10 effective deadline, with **8 active handles/link** and **30 issuances/link per rolling 5 minutes**. Architect implementation details remain: handles contain 32 random bytes (canonical 43-character base64url); link-row locking serializes issuance; exhaustion preserves the ordinary valid F10 name response without issuing another handle; expired records younger than the rate window remain as issuance history; issuance removes at most 30 expired/old rows for its link; and an operator-only cleanup function removes 1–500 old expired rows per call (default 100) for abandoned links.

Only private read-side publication/version and asset-binding tables needed for these units are added. They have workspace FKs/composite relationships, forced RLS, no API table grants and no owner/draft/publish/promotion mutation API. Future T008/T021/T049/T050 must integrate actual writers, immutable snapshots, validation receipts and GC claims; this run's synthetic fixtures populate the read side as postgres. No production publication is fabricated.

Credentials start disabled, store only SHA-256 of a canonical random credential ID, and are managed by database-operator-only functions. External tooling under `scripts/branding/` returns an expiring restricted bearer in memory for a trusted operator secret-store consumer; it has no printing/persistence/deploy side effect. Workers only read pre-issued `BRANDING_PROXY_JWT` / `BRANDING_VALIDATOR_JWT` bindings. Rotation is register disabled → mint externally → enable → deploy → disable predecessor; emergency disable appends an immutable feature-owned event. Registry and JWT expiries are independently checked, including role and ID binding. This supplies no validator promotion authority before T049.

The resolver and Storage predicate independently evaluate live credential, F10 token, hash-only render handle, workspace, current publication, slot and exact object. The Storage predicate also requires the server-defined authenticated-download operation, GET and exact authenticated route. Image calls perform no `opened_at` or grace writes. Authorization is at the database statement snapshot: a later committed consume/disable/publication invalidates subsequent statements; already-authorized in-flight bytes cannot be recalled. T048 must buffer/recheck before emitting bytes. Hosted compatibility and all existing release gates remain pending.

### Authorization and persistence

- Every operation resolves signed actor and explicit workspace scope. The application `authorize()` wall and DB `has_workspace_access()`/capability wall both enforce PO-global or WO-own scope; deny by default. Forced RLS covers branding rows. Sales and Trainer have no access.
- Keep one workspace draft with compare-and-set revision, immutable current publication snapshot and an atomic current pointer plus detached permanent audit event. Stale edits/publishes fail explicitly. Unchanged publication is a no-op. Historical restore/rollback is not required.
- Use the current F11 `app_private.audit_row_change()` body as the base and preserve every mapping. Add a constrained F14 event for publication only. Audit is permanent and independent of asset cleanup.

### Upload and Storage

1. Accept upload to a private staging bucket and persist durable upload state.
2. Validate authoritatively on the server: PNG/WebP structural walk; validate magic, all chunk/container boundaries, PNG CRC/WebP RIFF sizes, dimension metadata and structural complexity; reject truncation, trailing data, animation, SVG/JPEG. Strip metadata using the precise allowed PNG/WebP structures in FR-009.
3. Hash validated output bytes and store immutable content-addressed objects in the private validated bucket. No cross-workspace deduplication and no overwrite.
4. Attach only after checking the submitted draft revision. Reconcile interruptions and failed/stale attachment. Bounded retryable cleanup must recheck references to the current publication, drafts and active uploads before removing an object. On successful replacement, the prior published snapshot/assets become GC-eligible as soon as those references no longer exist.
- Owner staging, draft attachment and publication use the verified user JWT with `manage_branding`, workspace scope and upload-operation checks. Only `branding_validator` may promote validated output, and it must issue validator-only receipts; browser-supplied validation claims are never trusted.
- Use restricted `NOLOGIN NOBYPASSRLS` roles `branding_proxy` and `branding_validator`, with only required schema/table/function privileges and no privileged memberships. Workers receive externally pre-issued expiring JWTs for those identities; project JWT signing material never enters Workers. A private credential-ID registry supports enable/disable rotation and audit. The existing Worker service-role key used by the PO-approved D-19 manual recovery route is not removed by this design; the restricted identities limit the unauthenticated public image route's authority.
- Extend `registration_link_open(token)` to create a cryptographically unguessable bounded-lifetime opaque render handle whose hash is stored bound to the link, workspace and exact published version. Bound handle issuance by per-link active-handle and issuance-rate limits, and expire/delete handles after their short render window; exact caps are resolved before implementation, not invented here. The extension does not change F10 open semantics beyond the returned render context. Image calls never set `opened_at` and never extend grace. `registration_brand_asset_resolve(token, render_handle, slot)` is executable only by `branding_proxy`; it validates the canonical token, handle, slot, binding, current F10 predicate including consumption/deadline, and returns only derived metadata for the immutable object.
- A private hashed credential registry validates the signed credential ID on every privileged operation. Rotation enables the replacement, deploys it, then disables the old ID; emergency disable immediately affects RPC and Storage policy decisions. Audit issuance/revocation, validation transitions, privileged cleanup and bounded access outcomes using credential/request IDs only. Never log bearer tokens, render handles, token hashes, request headers, URLs or image bytes.
- `branding_proxy_object_read` grants SELECT only to `branding_proxy` for the exact validated-bucket download operation and only when `app_private.branding_storage_read_allowed(...)` independently repeats credential, render-handle, link/version/slot/path and live F10 checks. It grants no list, signing, transform, write or delete. Storage operation helpers and header/transaction context propagation must be verified on the pinned local stack-B version; do not infer them from upstream behavior.
- **Hard acceptance gate**: prove that verified bearer authority and request/operation context reach the Storage RLS policy, that missing/spoofed context fails closed, and that the exact download operation is distinguishable from list/sign/transform calls on pinned local stack B. This proof must pass before proxy or validator units are accepted. If stack B cannot prove it, stop and return to the architect; no service-role fallback is permitted for public images. Hosted-infrastructure compatibility must also be proven before Production.
- All new definer functions use `SECURITY DEFINER SET search_path=''`, fully qualified references and no dynamic SQL. Explicitly name owners and grants. Revoke EXECUTE from `PUBLIC`, `anon`, `authenticated`, and `service_role` by default; regrant only the role/function combinations listed in [branding workflow contract](contracts/branding-workflow.md). Prefer a restricted no-login owner and explicit RLS predicates over postgres-owned omnipotent definers.
- GC/reconciliation uses audited cron for destructive cleanup. A transactional deletion claim marks an object deleting; every operation that creates a draft/version/upload reference must reject or serialize against that state. Finalize deletion only after checking references and deleting Storage bytes; metadata deletion alone is not object cleanup. Retry safely and never remove a referenced asset.
- Each image must pass role-specific limits for ingress bytes, output bytes, dimensions, pixels and structural complexity, derived from worst-case CPU/memory benchmarks. No numeric values or validator library are invented ahead of that evidence.
- The proxy constructs only required Storage headers, never forwards client headers wholesale, buffers only within approved bounds, rechecks validity before emitting bytes and returns sniffed MIME, `nosniff`, `private, no-store`, and `no-referrer`. Never redirect to upstream URLs, expose client-visible Storage URLs or accept arbitrary asset/version selectors. A render handle is bound to the exact published version; after publication advances, an old handle fails generically or triggers a fresh authorized render, never serving bytes from a deleted version. Already displayed pixels may remain.

### Version audit and migration coordination

Extend the full latest F11 `audit_row_change()` body read from `origin/011-client-accounts` (`supabase/migrations/20261031122000_client_accounts_signup.sql`) so all current F11 mappings remain. F14 is based on main while F11 is separate; migration timestamp ordering/rebase risk must be resolved by the architect after integration planning. The F14 implementation branch must not guess a timestamp or drop the F11 additions.

### Stack-B integration

DB and Storage work runs locally only on stack B: project `lifter-stack-b`, ports `25420–25429`, selected with `LIFTER_SUPABASE_STACK=b`. PO approved provisioning/start and the separate stack lane reports it provisioned and isolation-proven. The infra branch is based on F11 (`440f0b2`), while F14 is based on main; do not merge it wholesale. **AD-F14-2 fixes U00's exact port scope** from `infra-second-stack` head `d49880010e70ac03c4a264fc19610dfc443d7c55`: only `scripts/local-stack.mjs`, `supabase-stack-b/supabase/config.toml`, `.env.stack-b.example`, the `.gitignore` hunk, `tests/unit/second-local-stack.test.ts`, `tests/integration/local-docker.ts`, and only the stack-selector hunk of `tests/integration/harness.ts`. F14 does not need F11's provisioner. Stack B profile enables `storage-api` and Mailpit (ports 25420–25429). Required CI jobs use the root Supabase profile, which mirrors Stack B except for stack identity and ports; readiness checks and zero skips include F11 pending-client Storage denials plus F14 bucket/path/direct-API tests. Coordinate F11 runner restoration assumptions with F11 owners.

### User interfaces

- All UI changes follow [DESIGN.md](../../DESIGN.md) and the [Frontend Design Gate](../../docs/09-frontend-design-gate.md), now merged to main. Existing tokens and `deriveBrand`/`BrandScope` remain authoritative. Keep semantic success/warning/error tokens unchanged.
- Registration uses DG-F14-1 Premium Centered Card. Hero Banner is image-only with required bilingual alt text and locale fallback; uploader confirms identity content only; no pricing, contact, CTA, links or text fields. Controls never overlap imagery. Final aspect/height values follow a Frontend Design Gate prototype.
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
app/(dashboard)/branding/             # editor, preview, publish actions
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
| Token-validating proxy | Recheck F10 state including consumption for every image request and bind bytes to the currently published version. | Per-request token validation and current-version binding are required by final PO decisions. |
| Required Storage CI lane and stack B | Stack A is locked by F11; F14 needs isolated DB and Storage policy verification. | Running against A violates lock/isolation; silently skipped Storage tests would not verify security. |
| Durable upload states plus reference-aware GC | Recover partial operations without deleting current/draft/active-upload references; prior publication is collectible when unreferenced. | Best-effort cleanup risks asset loss or permanent orphan accumulation. |

## Architect decisions (2026-10-29)

- **AD-F14-1 (formerly PA-F14-7) — F11/F14 migration order, decided by architect 2026-10-29**: F14 migrations are timestamped after every F11 migration, including any F11 review-fix migration. Once F11 is on main, rebuild the F14 `audit_row_change()` extension from F11's final merged body. F14 DB units that touch audit wait until that body is available.
- **AD-F14-2 — Stack-B integration path, decided by architect 2026-10-29**: U00 ports only `scripts/local-stack.mjs`, `supabase-stack-b/supabase/config.toml`, `.env.stack-b.example`, the `.gitignore` hunk, `tests/unit/second-local-stack.test.ts`, `tests/integration/local-docker.ts`, and the stack-selector hunk of `tests/integration/harness.ts` from `infra-second-stack` at `d49880010e70ac03c4a264fc19610dfc443d7c55`. F14 does not need F11's provisioner. Stack B includes `storage-api` and Mailpit. T003 remains as a bounded ownership/check task for this exact port, not an open integration decision.

## Related findings, not F14 scope

`readServerEnv()` currently requires `SUPABASE_SERVICE_ROLE_KEY` even for session clients. A separate least-privilege hygiene follow-up is proposed to the PO. F14 must not add new code paths that depend on that requirement. The existing Worker already holds the service-role key for the PO-approved D-19 manual recovery link (authenticated, capability-scoped staff route); restricted F14 identities narrow authority for the public unauthenticated image route but do not remove that key from the Worker.

## Final PO decisions — effects in the plan (2026-10-29)

- **PA-F14-1 — Decided (F14-1)**: Hero Banner is image-only with AR/EN alt text and locale fallback, no text overlay; required confirmation in UI and validation flows.
- **PA-F14-2 — Decided (F14-2)**: Final aspect/height dimensions are selected only after the Frontend Design Gate prototype; retain as a design gate, not a guessed numeric value.
- **PA-F14-3 — Decided (F14-3)**: Logo and Banner have separate ingress/output/dimension/pixel/complexity limits; values follow worst-case Workers CPU/memory benchmarking.
- **PA-F14-4 — Decided (F14-4)**: Use restricted `branding_proxy` and `branding_validator` identities with expiring/revocable credentials, F10 checks, render handles and Storage RLS. Prove pinned Stack B locally and hosted infrastructure before Production. No service-role fallback for public images.
- **PA-F14-5 — Decided (F14-5, CUSTOM)**: Retain only the latest published branding version long-term. Remove historical 10-version rollback. Temporarily protect current references, drafts and active uploads; collect prior snapshots/assets with race-safe reference-aware GC. Audit remains permanent and detached from deletable versions/assets.
- **PA-F14-6 — Decided (F14-6)**: Correct ND-F14-7 to proxy-only; obsolete signed-URL alternative is removed from active requirements/contracts.
- **PA-F14-7 — Decided (F14-7)**: Before Production, verify Storage/egress capacity against the 70% exit trigger and prove actual backup/restore.
- **PA-F14-8 — Decided (F14-8)**: Define Client Portal branding data/tokens and nonfunctional preview only; no P4 implementation.

## Remaining architect items and PO conflicts

- **Architect items**: AD-F14-1 migration/audit ordering remains an implementation sequencing constraint; hosted compatibility proof and pinned Stack-B header/operation proof are acceptance gates, not design alternatives. AD-F14-2's port list is decided and bounded as stated above.
- **Genuine PO conflicts**: None identified after applying final F14-1..8. Numeric upload caps and banner aspect/height are intentionally evidence/design-derived gates specified by the PO, not unresolved choices to invent here.
