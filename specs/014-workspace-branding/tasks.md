# Tasks: F14 — Workspace branding

**Input**: [spec](spec.md), [plan](plan.md), [research](research.md), [data model](data-model.md), [contracts](contracts/), [quickstart](quickstart.md)

**Prerequisites**: PO approves the applicable PA-F14 items; architect resolves stack-B integration, Storage-enabled profile and F11/F14 migration ordering. The current plan/tasks change has no implementation, tests, Docker, Supabase, or database work.

**Execution rule**: Implementation units are review-sized and tests-first. For every unit, write/adjust tests, run the narrow test and record RED before changing implementation; then implement only owned files, run the narrow test to GREEN, and run the required applicable gates. DB/Storage tasks are restricted to stack B after provision/start approval. Never silently skip Storage checks. Q-M checks and the broader verification recipe are in [quickstart](quickstart.md).

## Unit execution matrix

| Unit | Scope / owned paths | DB | Storage | Stack / entry condition |
|---|---|---|---|---|
| U00 — Integration prerequisites | F14-owned stack integration files: `.env.stack-b.example`, `.gitignore`, `scripts/local-stack.mjs`, `supabase-stack-b/supabase/config.toml`, `tests/unit/second-local-stack.test.ts`, and agreed changes to `tests/integration/harness.ts`; F14 handoff note in `specs/014-workspace-branding/quickstart.md` | No DB calls | Profile must enable `storage-api` and dependencies | F14-based integration line; `lifter-stack-b`, ports 25420–25429, explicit `LIFTER_SUPABASE_STACK=b`; PO approval and infrastructure owner readiness. No wholesale merge of F11 feature files or branch. |
| U01 — Authorization and schema | `supabase/migrations/<approved timestamp>_workspace_branding.sql`; `lib/branding/authorization.ts`; `tests/unit/branding-authorization.test.ts`; `tests/integration/branding-rls.test.ts` | Yes: policies/functions only on B | No Storage calls in this unit | B; after migration timestamp coordination with F11 and schema review. |
| U02 — Draft and version domain | `lib/branding/validation.ts`, `lib/branding/repository.ts`, `lib/branding/service.ts`; matching unit/contract tests | Yes on B for repository/integration | No | B; authorization/schema unit green. |
| U03 — Upload validation/state | `lib/branding/image-validation.ts`, `lib/branding/upload-state.ts`; `tests/unit/branding-image-validation.test.ts`, `tests/unit/branding-upload-state.test.ts` | No DB for pure validator tests; durable-state contract tests require B | Yes for service contract; private staging and validated buckets | B, Storage-enabled. Numeric limits and benchmark method approved; isolate fixtures. |
| U04 — Storage policies, durable attach and cleanup | migration Storage policies; `lib/branding/storage.ts`, `lib/branding/reconciliation.ts`; Storage integration/contract tests | Yes: policy and reference queries on B | Yes, direct API attempts | B, Storage ready, no skips. U01/U03 green. |
| U05 — Publication and permanent audit | `lib/branding/publish.ts`; F14 migration audit extension; `tests/integration/branding-publish.test.ts`, `tests/integration/branding-audit.test.ts` | Yes on B | Reads validated object references; no direct object mutation | B. Must extend full current F11 `audit_row_change()` body; timestamp/rebase decision resolved. |
| U06 — Public projection and image proxy | `app/register/[token]/page.tsx`, `app/api/branding/[token]/[role]/route.ts`, `lib/branding/public-read.ts`; unit/contract/integration tests | Yes on B for token/publication projection | Yes through private bucket from server; never issue signed URL | B, Storage enabled. F10 open validity contract and consumed-token cases included. |
| U07 — Registration and staff UI | `components/branding/RegistrationBrand.tsx`, `components/branding/BrandScopeProvider.tsx`, relevant registration/staff route files, i18n messages, UI tests/screenshots | No direct DB; authorized server projection only | Image proxy only | No local DB for component tests; use approved app fixture. Frontend Design Gate approval/evidence required. |
| U08 — Editor, preview and history | `app/(dashboard)/branding/*`, `components/branding/BrandEditor.tsx`, `BrandPreview.tsx`, `BrandHistory.tsx`, i18n, UI tests | No direct DB in component layer; actions persist through U02/U05 services on B | Upload UI talks to U03/U04, Storage enabled for full flow | B for action/upload journey; UI render tests may be DB-free. Frontend Design Gate required. |
| U09 — Storage CI, recovery and capacity release gate | F14-owned `.github/workflows/ci.yml`, `tests/integration/branding-storage-verification.md`, and approved capacity/recovery evidence artifact; F11-owned denial/runner changes are a named external dependency | Yes, integration on B | Yes; backup/restore proof and readiness lane | B; Storage-enabled required lane, zero skips. F11 pending-client denial coverage and restoration updates are coordinated with F11 owners, not edited in F14-owned files. |
| U10 — Client Portal brand contract | `lib/branding/portal-contract.ts`, unit/contract tests, preview placeholder component if P4 exists | No direct DB; existing authorized published projection only | No direct Storage access | Only when P4 exists; otherwise deliver data/token contract and nonfunctional placeholder in F14 editor preview, no portal feature. |

## Phase 1: Integration prerequisites

**Purpose**: Establish the approved isolated verification path before database or Storage work.

- [ ] T001 [U00] Record PO approval for stack-B provisioning/start and the approved Storage-enabled start profile in the feature handoff. **Owner files**: `specs/014-workspace-branding/quickstart.md` (implementation branch updates only). **DB: none; Storage: profile required but no calls; Stack: B only after explicit approval.**
- [ ] T002 [U00] Add failing stack-selection/loopback/port/project and readiness contract cases first; run config-only tests and record RED without opening a DB connection. **Owner files**: `tests/unit/second-local-stack.test.ts`. **DB: no connection; Storage: readiness contract only; Stack: B configuration.**
- [ ] T003 [U00] Architect/infrastructure owner reviews `infra-second-stack` ancestry, then ports only approved stack-B infrastructure on an F14/main-based integration line. Keep ownership to `.env.stack-b.example`, `.gitignore`, `scripts/local-stack.mjs`, `supabase-stack-b/supabase/config.toml`, `tests/unit/second-local-stack.test.ts`, and agreed `tests/integration/harness.ts` edits; explicitly exclude F11 feature files and migration payload. Run configuration tests GREEN. **DB: no connection; Storage: readiness probe only after approval; Stack: B configuration only.**
- [ ] T004 [U00] Coordinate F11 runner restoration assumptions and required pending-client Storage denials with F11 owners; do not edit F11-owned files as part of F14. **Owner files**: `specs/014-workspace-branding/quickstart.md` handoff/evidence requirements only; F11 owners retain ownership of their runner/test files. **DB: B only in future lane; Storage: enabled; Stack: B.**

## Phase 2: Authorization and data foundation (blocks user stories)

**Purpose**: Establish capability, workspace isolation and versioned entities before feature flows.

### Tests first — RED

- [ ] T005 [P] [U01] Add unit denial matrix for PO platform scope, WO own scope, WO foreign scope, Sales, Trainer, missing actor, and missing workspace; run and record RED. **Owner files**: `tests/unit/branding-authorization.test.ts`. **DB: none; Storage: none; Stack: none.**
- [ ] T006 [P] [U01] Add DB policy contract tests for both authorization walls, forced RLS, workspace-qualified draft/version/asset relations, and direct cross-workspace probes; run on isolated B and record RED. **Owner files**: `tests/integration/branding-rls.test.ts`. **DB: B; Storage: no object calls yet; Stack: B.**
- [ ] T007 [U02] Add failing unit/contract tests for field normalization, required locale/fallback, color validation, draft CAS, unique per-workspace versions and restore-to-draft semantics. **Owner files**: `tests/unit/branding-validation.test.ts`, `tests/unit/branding-service.test.ts`, `tests/contract/branding-workflow.contract.test.ts`. **DB: none for unit/contract; B for repository contract; Storage: none.**

### Implementation — GREEN

- [ ] T008 [U01] Implement capability and explicit-scope checks; persist required schema with forced RLS, workspace-scoped relationships, and the two independent walls. Run narrow tests GREEN. **Owner files**: `lib/branding/authorization.ts`, `supabase/migrations/<approved timestamp>_workspace_branding.sql`. **DB: B; Storage: no object calls; Stack: B.**
- [ ] T009 [U02] Implement draft/version validation and repository/service CAS; enforce one required name locale and fallback, `#RRGGBB`, no semantic-token edits, uniqueness and ten-restorable-version window. Run narrow tests GREEN. **Owner files**: `lib/branding/validation.ts`, `lib/branding/repository.ts`, `lib/branding/service.ts`. **DB: B for persistence; Storage: none; Stack: B.**
- [ ] T010 [U01/U02] Verify the complete app+DB role/workspace matrix, forced RLS and stale-edit races on isolated B, including denied direct DB/API paths. **Owner files**: `tests/integration/branding-rls.test.ts`, `tests/integration/branding-draft.test.ts`. **DB: B; Storage: none; Stack: B.**

## Phase 3: Secure asset pipeline (US1, P1)

### Tests first — RED

- [ ] T011 [P] [U03] Add hostile fixture tests for PNG/WebP magic, full structure, CRC/RIFF bounds, truncation/trailing data, dimensions/complexity, animation, metadata removal, hash of stripped bytes, and all rejected formats; record RED. **Owner files**: `tests/unit/branding-image-validation.test.ts`. **DB: none; Storage: none; Stack: none.**
- [ ] T012 [P] [U03] Add upload state/reconciliation tests for interruption at every stage, stale attachment, retries and active-upload references; record RED. **Owner files**: `tests/unit/branding-upload-state.test.ts`. **DB: none; Storage: mock only; Stack: none.**
- [ ] T013 [U04] Add Storage contract tests for private bucket assumptions, bucket-qualified workspace path policies, anon list/direct-read denial, cross-workspace denial and published-object immutability, including direct API attempts; run with readiness and record RED. **Owner files**: `tests/integration/branding-storage-policy.test.ts`. **DB: B; Storage: enabled and directly exercised; Stack: B.**

### Implementation — GREEN

- [ ] T014 [U03] Implement authoritative PNG/WebP structural validation, metadata stripping, animation rejection and output hashing using only the PO-approved role-specific caps; benchmark worst-case PNG/WebP walk/strip/hash against Workers Free CPU and record results. **Owner files**: `lib/branding/image-validation.ts`. **DB: none; Storage: none; Stack: none.**
- [ ] T015 [U03/U04] Implement durable upload state transitions and idempotent reconciliation for interrupted upload, validation and failed/stale attachment. **Owner files**: `lib/branding/upload-state.ts`, `lib/branding/reconciliation.ts`. **DB: B for durable state; Storage: enabled; Stack: B.**
- [ ] T016 [U04] Configure private staging/validated buckets and bucket-qualified `storage.objects` policies enforcing workspace-prefixed paths and independent scope/capability; deny anon listing/direct reads, cross-workspace access and published-object mutation. **Owner files**: `supabase/migrations/<approved timestamp>_workspace_branding.sql`, `lib/branding/storage.ts`. **DB: B; Storage: enabled; Stack: B.**
- [ ] T017 [U04] Implement immutable content-addressed validated writes and revision-checked attachment. Add bounded retryable GC that rechecks current publication, draft, ten restorable versions and active upload references before deletion; run policy and lifecycle tests GREEN. **Owner files**: `lib/branding/storage.ts`, `lib/branding/reconciliation.ts`, `tests/integration/branding-storage-policy.test.ts`, `tests/integration/branding-upload.test.ts`. **DB: B; Storage: enabled; Stack: B.**
- [ ] T018 [U03/U04] Verify direct Storage API attempts and interruption/retry cleanup on B, with isolated fixtures and no permitted skip. **Owner files**: `tests/integration/branding-storage-policy.test.ts`, `tests/integration/branding-upload.test.ts`. **DB: B; Storage: enabled; Stack: B.**

## Phase 4: Preview, publish and restore (US2–US4, P1/P2)

### Tests first — RED

- [ ] T019 [P] [U05] Add failing tests for serialized publication, stale publish, unchanged-draft no-op, rollback on audit failure, immutable snapshots and exactly one changed-publication event. **Owner files**: `tests/integration/branding-publish.test.ts`. **DB: B; Storage: validated references only; Stack: B.**
- [ ] T020 [P] [U05] Add audit compatibility test asserting all latest F11 `audit_row_change()` mappings remain and F14 event excludes bytes, authored text, tokens and URLs; record RED. **Owner files**: `tests/integration/branding-audit.test.ts`. **DB: B; Storage: none; Stack: B.**
- [ ] T021 [P] [U02] Add failing restore tests proving historical version copies to draft, current publication stays unchanged, and only explicit publish creates a new version. **Owner files**: `tests/integration/branding-restore.test.ts`. **DB: B; Storage: references only; Stack: B.**

### Implementation — GREEN

- [ ] T022 [U05] After architect resolves F11/F14 migration ordering, extend the complete latest F11 audit function without dropping mappings; add the F14 publication event and permanent retention. **Owner files**: `supabase/migrations/<architect-approved timestamp>_workspace_branding_audit.sql`, `lib/branding/publish.ts`. **DB: B; Storage: none; Stack: B.**
- [ ] T023 [U05] Implement atomic serialized changed publish, current pointer update, audit event, no-op unchanged publish and rollback on audit failure. **Owner files**: `lib/branding/publish.ts`, `tests/integration/branding-publish.test.ts`, `tests/integration/branding-audit.test.ts`. **DB: B; Storage: reads validated refs only; Stack: B.**
- [ ] T024 [U02/U05] Implement restore-to-draft and verify new publish preserves immutable historical versions and last-ten restore eligibility. **Owner files**: `lib/branding/service.ts`, `tests/integration/branding-restore.test.ts`. **DB: B; Storage: reads references only; Stack: B.**

## Phase 5: Public projection and token-validating proxy (US5, P1)

### Tests first — RED

- [ ] T025 [P] [U06] Add contract tests for F10 generic invalid response, valid published-only projection, consumed/expired token behavior, no-store headers, no signed URL, and no workspace/draft/history selector; record RED. **Owner files**: `tests/contract/branding-public.contract.test.ts`, `tests/unit/branding-public-read.test.ts`. **DB: no DB for pure contract; B for projection; Storage: none.**
- [ ] T026 [P] [U06] Add failing proxy tests for validity recheck on every image request, grace not extended, rendered-version binding, generic failure, MIME sniffing/nosniff and arbitrary asset/version selector rejection. **Owner files**: `tests/unit/branding-proxy.test.ts`, `tests/integration/branding-proxy.test.ts`. **DB: B; Storage: enabled/private object read; Stack: B.**

### Implementation — GREEN

- [ ] T027 [U06] Extend the server-side F10 open projection with only published identity and resolve authorized workspace/version per request; preserve byte-identical generic invalid output and form/package snapshot behavior. **Owner files**: `lib/branding/public-read.ts`, `app/register/[token]/page.tsx`. **DB: B for integration; Storage: none; Stack: B.**
- [ ] T028 [U06] Implement token-validating image proxy only; reapply F10 validity including consumption without extending grace, bind to authorized rendered version, allow only referenced logo/banner, generic failures, private/no-store, sniffed MIME and nosniff. **Owner files**: `app/api/branding/[token]/[role]/route.ts`, `lib/branding/public-read.ts`. **DB: B; Storage: enabled; Stack: B.**
- [ ] T029 [U06] Verify invalid, consumed, expired, publication-race and cross-workspace cases; prove no shared token cache and no client-visible signed URLs. **Owner files**: `tests/integration/branding-proxy.test.ts`, `tests/integration/branding-public.test.ts`. **DB: B; Storage: enabled; Stack: B.**

## Phase 6: Authorized surfaces and editor UI (US1–US5, P1; restore P2)

### Tests first — RED

- [ ] T030 [P] [U07] Add failing component/e2e assertions for Premium Centered Card, banner/form non-overlap, only published identity, invalid-token neutral state, semantic-token preservation and image proxy usage. **Owner files**: `tests/unit/branding-registration-ui.test.tsx`, `tests/e2e/branding-registration.spec.ts`. **DB: none for component; e2e uses approved fixture only; Storage: proxy fixture only.**
- [ ] T031 [P] [U08] Add failing component tests for split editor/desktop live preview, mobile tabs, all three preview surfaces, original/adjusted color explanation, draft isolation, stale revision feedback and restore-not-publish behavior. **Owner files**: `tests/unit/branding-editor-ui.test.tsx`, `tests/e2e/branding-editor.spec.ts`. **DB: none for component; B for persisted journey; Storage: enabled for upload journey.**

### Implementation — GREEN

- [ ] T032 [U07] Implement registration and staff published-brand surfaces using existing token system, `deriveBrand` and `BrandScope`; keep semantic status tokens unchanged and resolve scope/version per request. **Owner files**: `components/branding/RegistrationBrand.tsx`, `components/branding/BrandScopeProvider.tsx`, existing registration/staff surface files. **DB: server projection only on B; Storage: image proxy only.**
- [ ] T033 [U08] Implement editor, private preview and history/restore UI following DG-F14-1..3 and approved banner decisions. Use bilingual messages, no invented banner text fields, and actions backed by U02/U05. **Owner files**: `app/(dashboard)/branding/*`, `components/branding/BrandEditor.tsx`, `BrandPreview.tsx`, `BrandHistory.tsx`, `lib/i18n/messages/*`. **DB: B for saved flows; Storage: enabled for upload flow; Stack: B.**
- [ ] T034 [U07/U08] Implement workspace-switch cancellation/late-response discard, neutral no-scope defaults and surface-specific contrast behavior; banner text stays off imagery or uses guaranteed-contrast existing-token scrim. **Owner files**: `components/branding/BrandScopeProvider.tsx`, `components/branding/BrandPreview.tsx`, relevant component tests. **DB: none for UI states; Storage: none.**
- [ ] T035 [U07/U08] Complete Frontend Design Gate evidence and review: AR RTL / EN LTR × light / dark × 390 / 1440 px (tablet if layout changes), real surface backgrounds/states, keyboard/focus, names/roles, touch targets, reduced motion, axe, screenshots reviewed against DESIGN.md; run `npm run size`. **Owner files**: UI-owned files and test/evidence notes only. **DB: none for render tests; Storage: proxy fixture only.**

## Phase 7: Required Storage CI, capacity and release evidence

### Tests first — RED

- [ ] T036 [P] [U09] Add CI contract/readiness tests that fail when Storage is missing, not ready, skipped, or stack selector/ports/project mismatch; prove required status behavior. **Owner files**: `.github/workflows/ci.yml`, `tests/integration/branding-storage-verification.md`, workflow validation tests. **DB: none for config checks; Storage: readiness required; Stack: B.**
- [ ] T037 [P] [U09] Coordinate the F11 owner change that adds pending-client Storage denials and updates isolated-runner restoration assumptions; verify the F14 lane contract fails (RED) when the required F11 job/report is absent. **Owner files**: F14 owns `.github/workflows/ci.yml` and `tests/integration/branding-storage-verification.md`; F11 owners own their pending-client tests and runner files. **DB: B; Storage: enabled; Stack: B.**

### Implementation and release evidence — GREEN

- [ ] T038 [U09] Configure required Storage-enabled CI lane with readiness gate, direct API bucket/path tests, isolated fixtures, zero allowed skips, and F11 denial coverage. **Owner files**: `.github/workflows/ci.yml`, agreed runner/config paths. **DB: B; Storage: enabled; Stack: B.**
- [ ] T039 [U09] Run capacity model for two assets/version, draft/staging, workspace count and no-store egress against verified Free-tier limits and 70% exit trigger; benchmark CPU worst case and record source/evidence. **Owner files**: `specs/014-workspace-branding/quickstart.md`, approved evidence artifact path. **DB: none; Storage: estimates; Stack: none.**
- [ ] T040 [U09] Demonstrate Storage backup/restore and independently verify audit retention; retain results as production-blocker evidence. **Owner files**: approved recovery evidence artifact only. **DB: B for linked metadata/audit checks; Storage: enabled and restored; Stack: B.**
- [ ] T041 [U09] Run the complete Q-M01..Q-M20 matrix from quickstart on isolated stack B, confirm zero skipped Storage checks, state restoration, and collect CI run IDs/evidence. **Owner files**: `tests/integration/branding-storage-verification.md`, test result artifacts. **DB: B; Storage: enabled; Stack: B.**

## Phase 8: Conditional P4 contract and final integration

- [ ] T042 [U10] If P4 exists, add the brand data/token contract test first (RED), then implement only its authorized published-brand adapter and preview placeholder; otherwise keep the F14 editor preview placeholder and do not add portal behavior. **Owner files**: `lib/branding/portal-contract.ts`, associated contract tests and placeholder component only. **DB: none beyond authorized projection; Storage: none; Stack: none unless integration fixture needs B.**
- [ ] T043 [U00/U09] Reconcile final F11 changes and migration order; rerun required stack-B Storage lane with no skips, UI gate, format/lint and `git diff --check`; collect run IDs and evidence before production approval. **Owner files**: feature-owned integration and evidence files. **DB: B; Storage: enabled; Stack: B.**

## Dependencies and execution order

- U00 is a hard prerequisite for every DB/Storage task. No F14 implementation may borrow stack A or use an unapproved stack-B start.
- U01 precedes U02/U04/U05/U06. U03 pure validation can start after PO caps/benchmark method are approved; U04 follows U01 and U03. U05 waits for architect migration ordering and complete F11 audit body integration.
- U06 depends on F10 token/open contracts, U01 authorization, U05 current publication and U04 validated assets. It must not issue a signed URL.
- U07/U08 can build isolated components after design approvals, but full journeys depend on U02/U03/U04/U05/U06. The Frontend Design Gate is mandatory before UI acceptance.
- U09 readiness and CI configuration may be prepared only after stack-B profile approval; DB/Storage lane runs after U00 and relevant features. Capacity/recovery proof blocks production approval.
- U10 has no independent portal feature scope and remains conditional on P4.

## Verification stop conditions

- Missing PO limit, banner, credential, integration, or capacity decision: stop dependent implementation tasks; do not fill the gap by assumption.
- Missing Storage readiness or any skipped Storage denial: required lane fails; do not report green.
- Failed RLS/Storage direct API denial, token validity, audit atomicity, data cleanup, accessibility/contrast, or migration preservation check: block release and keep evidence.
- No production launch until hosted Storage compatibility/verification and backup/restore gate in the F14 specification are satisfied.
