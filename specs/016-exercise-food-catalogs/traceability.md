# F16 Traceability

**Analysed implementation commit:** `493a345` (prior S31 implementation `1de15a6`)
**Method:** Static inspection plus focused unit, Stack C integration, and Playwright/axe execution on `493a345`.

Status is scoped to implementation and executed evidence through `493a345`; prior implementation evidence is cited by `1de15a6`.

| Requirement | Task(s) | Test(s) | Evidence | Status |
|---|---|---|---|---|
| FR-001 | T006, T007, T018, T076–T078 | `tests/unit/catalog-schemas.test.ts::exports taxonomy constants with approved counts`; `tests/integration/catalog-exercise-operations.test.ts::allows only PO and appends immutable versions with expected-version CAS` | Test sources; task evidence S26/S27 | VERIFIED |
| FR-002 | T018, T021, T076–T083 | `tests/unit/exercise-detail-page.test.tsx::shows the current version, lifecycle, exact defaults, and authorized variation`; `...::exposes workspace Remove to platform_owner for an explicitly selected workspace`; `...::exposes workspace Remove to workspace_owner for an explicitly selected workspace`; `tests/e2e/exercise-library-production.spec.ts::workspace Remove confirmation and removed state` | `493a345`; focused unit 37/37; Playwright/axe 16/16; no Merge/Restore controls | VERIFIED |
| FR-003 | T020, T023 | `tests/integration/catalog-variation-operations.test.ts` (workspace-scoped variation operations); `tests/unit/catalog-video-variation.test.tsx::accepts 1,500 multi-code-unit emoji within the note code-point limit`; `...::rejects a note over the shared Unicode code-point limit`; `...::applies the code-point limit after trimming surrounding whitespace`; `...::does not apply a UTF-16 code-unit limit to the note input`; `tests/unit/catalog-variation-actions.test.ts::returns invalid for a malformed %s without throwing`; `...::returns invalid for malformed workspace load arguments (%s)` | Existing task evidence; commits `fabd1ec` and `4edf959`, focused unit tests passed; variation-note code-point correction commit `f6bccf4` (RED 3/8 failed on `cbb6883`, GREEN 8/8 passed, `.length` mutant killed at test lines 93/111, restored with `git diff --exit-code`); `tests/unit/catalog-variation-workspace-gate.test.tsx::does not search exercises when workspace loading returns %j`; `tests/unit/catalog-variation-workspace-gate.test.tsx::shows localized library-load copy when exercise search fails (%s)`; commits `2d6b261` and `2a6924b` (RED/GREEN and executed load-error mutant; final formatted tree focused tests passed) | VERIFIED |
| FR-004 | T008, T019, T022, T082 | `tests/integration/catalog-workspace-exercise-operations.test.ts`; `tests/integration/catalog-workspace-exercise-lifecycle.test.ts::allows PO explicit scope and own-workspace WO/Trainer; denies foreign scope, Sales, Client and revoked membership` | `1de15a6`; focused Stack C integration 10/10 on `493a345` | VERIFIED |
| FR-005 | T009, T024 | `tests/unit/catalog-schemas.test.ts::requires non-null product, preparation and weighing state`; `tests/integration/catalog-foods.test.ts::accepts valid g and ml versions with optional fiber and matching positive servings` | Test sources; T009 evidence in `tasks.md` | VERIFIED |
| FR-006 | T025–T030 | `tests/integration/catalog-food-operations.test.ts`; `tests/unit/catalog-food-actions.test.ts`; `tests/unit/food-create-flow.test.tsx::locks near-match confirmation and cancellation while save is pending`; `tests/unit/catalog-food-editor.test.tsx::clears alternative errors when a row is removed`; `tests/unit/catalog-po-copy.test.ts::pins the result-neutral food save error exactly in English and Arabic` | Existing task evidence; RED/GREEN and executed alternative-error mutant, commits `5ff4883` / `46ddf58`; exact-copy GREEN and executed mutant, commit `03eb9e8`; approved-copy fixture contract, `f6801b6` | VERIFIED |
| FR-007 | T009, T024, T025 | `tests/unit/catalog-food-validation.test.ts::warns on kcal discrepancy beyond threshold`; `tests/integration/catalog-foods.test.ts::requires a valid basis, at least one localized name and all required identity/nutrition values` | Test sources; T024 evidence in `tasks.md` | VERIFIED |
| FR-008 | T003, T025–T027, T030 | `tests/unit/catalog-normalize.test.ts::produces identical keys only when every dimension matches`; `tests/integration/catalog-food-duplicates.test.ts::uses language, normalized name, basis, product, preparation, and weighing state in exact identity`; `...::warns for same-identity near matches only at >=90% and within the kcal tolerance`; `tests/unit/food-create-flow.test.tsx::locks near-match confirmation and cancellation while save is pending` | Existing task evidence; commits `c220fa4` and `100ddd5`, focused UI unit tests passed | VERIFIED |
| FR-009 | T026, T028 | `tests/integration/catalog-food-operations.test.ts` (creator/PO authorization); `tests/unit/catalog-food-actions.test.ts` | Test sources; T026/T028 task evidence | VERIFIED |
| FR-010 | T021, T027 | `tests/integration/catalog-food-lifecycle.test.ts::merges only to active terminal foods, flattens aliases, preserves versions/servings, and replays once`; `tests/integration/catalog-exercise-lifecycle.test.ts` | Test sources; task evidence | VERIFIED |
| FR-011 | T007, T021, T027, T080–T083 | `tests/integration/catalog-workspace-exercise-lifecycle.test.ts::rejects stale revisions and preserves tenant identity, content, replay and audit`; `...::does not confuse identical exercise ids across workspace tenants`; `tests/unit/exercise-detail-page.test.tsx` role/detail assertions; `tests/e2e/exercise-library-production.spec.ts::workspace Remove confirmation and removed state` | PO decisions S30-PO-9/S31-PO-1 Q3; `1de15a6` implementation; `493a345` tests; axe 0 across 8 rendered combinations | VERIFIED |
| FR-012 | T004, T013, T015, T076–T081 | `tests/integration/catalog-exercise-detail.test.ts::uses the same non-disclosing denial for null, unknown, and unauthorized identities`; `tests/integration/catalog-workspace-exercise-lifecycle.test.ts::returns detail with the current revision only in the explicitly authorized workspace`; role-gated page unit tests | Focused integration 10/10 and focused unit 37/37 on `493a345` | VERIFIED |
| FR-013 | T007, T011–T015 | `tests/integration/catalog-projections.test.ts::global_food_provenance_masking_non_po`; `...::global_food_provenance_po_governance_read`; `tests/integration/catalog-operation-keys.test.ts::keeps the F16 audit mapping two-segment, allowlisted and globally unscoped` | Named asserting test sources; task evidence | VERIFIED |
| FR-014 | T016, T020, T023 | `tests/integration/catalog-video-resolution.test.ts::returns only an authorized selected workspace video and denies foreign or revoked access`; `tests/integration/catalog-variation-operations.test.ts` | Test sources; task evidence | VERIFIED |
| FR-015 | T003, T014 | `tests/unit/catalog-normalize.test.ts` (NFC, Arabic folds and locale-independent case); `tests/integration/catalog-search.test.ts::matches the TypeScript Arabic/English normalization rules in SQL`; `...::applies exercise filters, stable cursor ordering, and a page size capped at 50` | Test sources; task evidence | VERIFIED |
| FR-016 | T011, T018–T021, T025–T027, T082 | `tests/integration/catalog-workspace-exercise-lifecycle.test.ts::rejects stale revisions and preserves tenant identity, content, replay and audit` | `1de15a6`; 4 mutation checks killed/restored per accepted S31 review; focused Stack C integration 10/10 on `493a345` | VERIFIED |
| FR-016a | T006 | `tests/integration/catalog-schema.test.ts` (versioned taxonomy schema); `tests/unit/catalog-schemas.test.ts::exports taxonomy constants with approved counts` | Test sources; T006 evidence | VERIFIED |
| FR-017 | T004, T012, T013, T015, T082 | `tests/integration/catalog-workspace-exercise-lifecycle.test.ts::allows PO explicit scope and own-workspace WO/Trainer; denies foreign scope, Sales, Client and revoked membership`; `tests/integration/catalog-exercise-detail.test.ts::uses the same non-disclosing denial for null, unknown, and unauthorized identities` | Focused Stack C integration 10/10 on `493a345` | VERIFIED |
| FR-018 | T017, T022–T023, T028–T033, T036, T079–T083 | `tests/e2e/exercise-library-production.spec.ts::workspace Remove confirmation and removed state`; `tests/unit/exercise-detail-page.test.tsx` role gating | `493a345`; 16/16 Playwright cells, screenshots include dialog and removed state, axe zero | VERIFIED |
| FR-019 | T006 | `tests/integration/catalog-schema.test.ts` (empty catalog seed migration/source assertion) | T006 evidence in `tasks.md` | VERIFIED |
| FR-020 | T031 | `tests/unit/catalog-snapshot.test.ts::exercise builder produces golden output byte-for-byte`; `...::raw food builder produces golden output byte-for-byte`; `...::later catalog edits do not change an existing snapshot`; `...::never includes a video URL or workspace variation from input` | Test source; T031 task evidence | VERIFIED |
| FR-021 | T030, T034 | `tests/integration/catalog-food-limits.test.ts`; `tests/integration/catalog-food-duplicates.test.ts::uses the composite near-duplicate GIN path at benchmark volume` | Test sources; `benchmark-s25.md` local benchmark evidence | VERIFIED |
| SC-001 | T007, T018–T021, T027 | `tests/integration/catalog-identities.test.ts`; `tests/integration/catalog-exercise-operations.test.ts::allows only PO and appends immutable versions with expected-version CAS`; food/exercise lifecycle tests | Test sources; cited task evidence | VERIFIED |
| SC-002 | T005, T008, T013, T015–T016, T019–T020 | `tests/integration/catalog-workspace.test.ts::scopes workspace search and counts, keeps global results workspace-free, and denies foreign scope generically`; `tests/integration/catalog-video-resolution.test.ts::returns only an authorized selected workspace video and denies foreign or revoked access` | Test sources; task evidence | VERIFIED |
| SC-003 | T024, T028–T029 | `tests/unit/catalog-food-validation.test.ts`; `tests/unit/catalog-food-actions.test.ts`; `tests/e2e/catalog-ui.spec.ts` | Functional add/search/duplicate assertions exist; no timed interaction assertion or timing evidence identified | PARTIAL |
| SC-004 | T003, T014 | `tests/unit/catalog-normalize.test.ts` (all listed fold classes); `tests/integration/catalog-search.test.ts::matches the TypeScript Arabic/English normalization rules in SQL` | Test sources; task evidence | VERIFIED |
| SC-005 | T034 | `tests/integration/catalog-food-duplicates.test.ts::uses the composite near-duplicate GIN path at benchmark volume` | `benchmark-s25.md` records local database metrics and index plans; Worker CPU and hosted API p95 are explicitly open in `release-gate-s25.md` | PARTIAL |

No PO-deferred requirement was identified; therefore no row is marked DEFERRED. “Verified” here means an asserting test is present in the analysed tree and evidence is documented; this review did not execute that test.

## S32 lib15 remediation evidence

| Finding | FR | Task | Test | Evidence |
|---|---|---|---|---|
| zdo-5 multi-equipment version preservation | FR-001, FR-002 | T078 | tests/unit/exercise-library-actions.test.ts::preserves every equipment code when creating a new version from a multi-equipment exercise; tests/unit/exercise-detail-page.test.tsx::passes all existing equipment codes into the new version editor | Fix commit 1a84ed8; focused suite 89/89. |
| zdo_A server-action shape validation; zdo_J success-only revalidation | FR-001, FR-002, FR-011 | T078, T083 | tests/unit/exercise-library-actions.test.ts::returns invalid for malformed save and remove payloads without throwing or calling an RPC; ::revalidates library and edited detail paths only after successful exercise mutations | Fix commit 1a84ed8; focused suite 89/89. |
| zdo_P in-dialog Remove failure; zdo_U pending live-region class | FR-002, FR-011, FR-018 | T083 | tests/unit/exercise-detail-remove.test.tsx::keeps the dialog open and shows the removal failure inside it so the user can retry; ::maps the pending live region to a visually-hidden CSS-module class | Fix commit 1a84ed8; focused suite 89/89. PO-7 copy uses states.error.description. |
| zdo_b code-point name limit | FR-001 | T078 | tests/unit/catalog-exercise-editor.test.tsx::does not impose a UTF-16 maxLength on supplementary-plane name characters | Fix commit 1a84ed8; focused suite 89/89. |
| zdo_x explicit workspace removal scope | FR-011 | T083 | tests/unit/catalog-server.test.ts::requires an explicit non-empty workspace for PO workspace exercise removal | Fix commit 1a84ed8; focused suite 89/89. |
| zdo_7 client URL validation parity | FR-003 | T023 | tests/unit/catalog-video-variation.test.tsx::rejects allowed-host URLs with a query or fragment immediately after the host | Fix commit 1a84ed8; focused suite 89/89; no SQL changed. |
| zdpAE copy approval metadata | FR-018 | T083 | tests/unit/catalog-approved-copy.test.ts::marks all 18 S27 post-batch library/detail keys as DRAFT in both message catalogs | Fix commit 1a84ed8; focused suite 89/89; localized copy values unchanged. |
| Launcher environment contract | FR-018 | T083 | tests/unit/f16-playwright-launcher.test.ts::maps Supabase CLI env aliases and APP_ORIGIN before starting Playwright | Fix commit 1a84ed8; focused suite 89/89. |

## S33 lib16 review remediation evidence

| Review finding | FR | Task | Test / analysis | Evidence |
|---|---|---|---|---|
| zk76- exercise edit must honor changed draft equipment while retaining matching stored multi-code selection | FR-001 | T084 | `tests/unit/exercise-library-actions.test.ts::uses the edited equipment selection when it differs from stored equipment codes`; existing `...::preserves every equipment code when creating a new version from a multi-equipment exercise` | Commit `6da1574`; RED showed stored `barbell,cable` replacing draft `dumbbell`; focused unit/component suites GREEN 29/29. |
| zk77L FoodEditor native UTF-16 `maxLength` conflicts with code-point validation | FR-018 | T085 | `tests/unit/catalog-food-editor.test.tsx::lets code-point validation govern emoji names without a UTF-16 input limit` | Commit `5e51afa`; RED observed `maxLength=120`; 120 supplementary-plane emoji accepted by code-point validation; focused unit/component suites GREEN 29/29. |
| zk77R workspace exercise Restore clause conflicts with S31/API contract | FR-002, FR-011 | T086 | `checklists/analyze.md::S33 lib16 remediation re-analysis` | Documentation commit `106157c`; analysis PASS with 0 CRITICAL/HIGH; aligned to S31-PO-1 Q3 and `contracts/catalog-api.md`; no behavior or UI Restore added. |
| zk77b PO editor handoff contradicted current control assertions and Remove placement | FR-002, FR-011, FR-018 | T086 | `tests/e2e/catalog-ui.spec.ts` assertions around lines 205–214; `tests/unit/exercise-detail-remove.test.tsx`; `tests/e2e/exercise-library-production.spec.ts` | Handoff row and Remove location corrected. No local e2e run per S33 lane constraints; hosted CI evidence required on final head. |

## Main-side S33 traceability record — preserved verbatim

# S33 traceability — S33-PO-4

| FR | Task | Test | Evidence |
|---|---|---|---|
| FR-015, FR-016a | T900 | `tests/integration/catalog-server.test.ts::searches exercises created through the session wall by stored taxonomy payload keys` | Commit `dfa6fe6`; focused integration run on current head: 5 files / 41 tests passed. |

## S36 round 3 skeleton (planned; no ticks until RED then GREEN is recorded)

Planned tests are named for the tests to be written. Nothing in this table is verified. Evidence is added only after the test runs green on the assigned stack.

| FR | Task | Planned test (not yet written) | Evidence |
|---|---|---|---|
| FR-001, FR-002, FR-003, FR-004, FR-014, FR-018, FR-030 | T037 | contract tests for shared identity, exact eight-field allowlist and value formats, English-required/Arabic-optional Global and Workspace names, one optional Description in any language, at most three unique Alternatives, PO-only Global edits, local isolation, automatic Global appearance, defaults copied at addition, and pre-F16 exercise data deleted at cutover with no Instructions-to-Notes merge (S40-PO-5, S40-PO-8); legacy Notes deleted with their rows (S40-R15) | none |
| FR-003, FR-014, FR-016 | T046, T047 | override identity, composite keys, CAS, idempotency, one audit event | none |
| FR-025 | T048 | alternatives child rows: composite targets, exactly-one-target CHECK, active-at-write | none |
| FR-023 | T043 | canonical video: current-version read, validator, allowlist key | none |
| FR-024 | T045 | private exercise video in version content | none |
| FR-026 | T049 | effective-resolution contract with per-field source, including the `workspace_private` branch (S40-R12) | none |
| FR-027 | T056 | `ExerciseSnapshotV2` fixtures; copied default, trainer edit, changed library default before publication, then publish/read; planner-entry non-video values retained and current authorized Video returned on subsequent view | none |
| FR-028 | T050 | plan-view resolution without an active identity; merged source uses its own media | none |
| FR-029, FR-034 | T050, T051 | internal resolver: EXECUTE grants, composite match, whole-call generic denial, cache key | none |
| FR-031 | T054, T055 | legacy write revoked from client roles; parity fixture move | none |
| FR-013 | T057 | audit allowlist with changed-field codes for exactly the eight fields — `name`, `description`, `notes`, `video`, `alternatives`, `default_rest_time`, `default_rir`, `default_reps`; no `instructions` code | none |
| FR-022 | T060 | F12 guard rejects `workspace_id` changes | none |
| FR-014 | T061 | host list parity across SQL and TypeScript validators; `docs.google.com` rejected | none |
| FR-031 | T062, T063 | all pre-F16 exercise data (legacy rows with their version history and videos; pre-F16 canonical and workspace-private identities, versions and videos) deleted at cutover, none carried over (S40-PO-7, S40-PO-8); dummy `docs.google.com` values deleted; no Instructions-to-Notes merge (S40-PO-5); legacy Notes deleted with their rows (S40-R15) | none |
| FR-035 | T064 | override search normalization and bounds | none |
| SC-005 | T065 | library list and batch resolve benchmark on a 10k fixture | none |
| SC-013 | T037, T047 | Rest/RIR/Reps boundary and format validation | none |
| SC-016 | T037, T062, T063 | pre-F16 exercise data, version history and videos deleted (S40-PO-7, S40-PO-8); no mock plan snapshot references deleted data (S40-PO-8); no Instructions merged into Notes (S40-PO-5); no Instructions library field; legacy Notes deleted with their rows (S40-R15) | none |
| FR-027, FR-029 | T058 | client projection includes the frozen trainer exercise Notes of a workspace override and of a workspace-private exercise; no visibility flag or new copy (S40-PO-8, PDN-S40-F16-06 = B) | none |
| FR-003, FR-018, FR-023, FR-024, FR-025 | T074, T075 | Global and workspace-private eight-field version completion: Notes, Defaults, Description, Name and Alternatives storage, validators and allowlists (positive and negative per field, data-model.md coverage table) | none |
| FR-026 | T037, T047 | null = inherit for the seven optional fields; reset writes null; Alternatives empty list distinct from inherit | none |
| FR-025 | T048 | published-plan reads return frozen alternatives after a target is removed or merged; library reads skip it | none |
| FR-032 | T052 | ordering check on newly authored migrations only; published files exempt; remote conflict check (b); pre-deployment ordering gate (c) against applied versions (S40-R13) | none |
| FR-034 | T051 | warmed-cache sequence (Video change, override removal, Global change, revoked membership) | none |
| FR-029 | T051 | direct-call denial for `anon`, `authenticated`, `service_role`; positive staff effective-resolution test | none |

## S35 PR #43 explicit workspace denial remediation

| Finding | FR | Task | Test | Evidence |
|---|---|---|---|---|
| PRRT_kwDOVYgYQ860WRSj — explicit unavailable Add Exercise workspace must use generic 404, preserving explicit workspace scope | FR-001, FR-002, FR-016 | T078 | `tests/unit/exercise-library-new-page.test.tsx::denies workspace_owner when an explicit workspace is unavailable`; `::denies trainer when an explicit workspace is unavailable`; `::uses the explicitly requested available authoring workspace`; `::keeps the existing default when the workspace parameter is absent`; `::keeps the existing default when the workspace parameter is empty` | Implementation commit `45f70a8b867714f3d3d3b6de88abd8cfd2c22cfa`; RED: 2 failing/6 passing before fix; GREEN focused suite: 9/9 on that commit. Final-head gates recorded in the S35 run report. |

## S35 PR #43 Exercise Detail selector finding

| Finding | FR | Task | Test | Evidence |
|---|---|---|---|---|
| PRRT_kwDOVYgYQ860XFbn — remove the PO “None” choice from explicit workspace scope so a visible choice cannot submit a request that returns 404 | FR-002, FR-011, FR-012 | T077 | `tests/unit/exercise-detail-page.test.tsx::shows the empty workspace choice only for platform-owner global detail`; `tests/e2e/exercise-library-production.spec.ts` AR/EN × light/dark × 360/1024 detail matrix with keyboard and axe | Commit `995f659ab83cbe217e0165e344770d4df2f1e24e`; focused route suites 27/27; Stack C Playwright 24/24, axe clean. Screenshots under `%TEMP%\lifter-s32-f16-lib15` (eight detail captures). |

## S35 screenshot-matrix correction

The S35 detail-selector E2E evidence in the preceding row uses the mandated 390px mobile and 1440px desktop widths. The matrix now captures both global detail and workspace detail; workspace detail asserts the empty option is absent before taking the screenshot.

| Finding | FR | Task | Test | Evidence |
|---|---|---|---|---|
| Workspace Detail selector rendering and responsive matrix | FR-002, FR-011, FR-012 | T077 | `tests/e2e/exercise-library-production.spec.ts::${locale} ${theme} ${viewport.name}: production library and manual Add`; asserts workspace detail has no `option[value=""]` and captures `detail-workspace.png` | Test commit `9a9a929edf4fe60f79fa8e1e34d685c833e9b72c`; Stack C Playwright 24/24; eight screenshots: AR/EN × light/dark × 390/1440, with axe clean. |


## S37 PR #43 T901 migration rename traceability

| Requirement | Task | Test | Evidence | Status |
|---|---|---|---|---|
| FR-011 | T901 | GitHub PR #43 validate, integration, and storage pull_request checks executed on final head; run IDs recorded in the S37 run report. | Rename commit 9c572fab72d97ba9bce48f52a5c466d9e414e6f7; blob identity proof: 20261108100000 = c6d3ff7c20cde9ee0f2436dd67592b3d70c97569, 20261108100100 = 1d45cd8cddde0bb182242949b872f8d96f6afdc4 (worktree hash-object equals HEAD tree blob); PO authority: S36-PO-4 item 6 and S37-PO-6 Option D; Stack C excluded and untouched. | DONE |

Disclosure: the rename commit message trailers contain literal \n text rather than intended line breaks; history was not rewritten.

## S38 catalog hardening traceability

| Requirement | Task | Test | Evidence | Status |
|---|---|---|---|---|
| FR-011, FR-016, FR-018 | T087 | `tests/unit/exercise-detail-remove.test.tsx::clears the failure alert when the dialog is closed and reopened`; `tests/unit/exercise-editor-alternatives.test.tsx::uses stable exercise ids as keys for duplicate alternative names`; `tests/unit/exercise-library-actions.test.ts::returns invalid for malformed exercise/workspace ids without calling an RPC`; `tests/unit/catalog-food-actions.test.ts::rejects a malformed workspace id before database calls`; `tests/unit/catalog-variation-actions.test.ts::returns invalid for malformed workspace/exercise ids`; `tests/unit/catalog-server.test.ts::returns invalid for malformed id, targetId or workspaceId in mutate without calling RPC` | Commit `69709cd4`; S38-R3 architect ruling; focused unit suites executed RED then GREEN; typecheck, lint, prettier --check, check:secrets pass. | VERIFIED |

## S45 T068 legacy inventory

| Requirement | Task | Test | Evidence | Status |
|---|---|---|---|---|
| FR-031, FR-003 | T068 | `tests/unit/t068-legacy-inventory.test.ts::emits counts only when fake rows contain notes, URLs, or payload text` | Base tool commit `9ebdbf7e88c2a7fe8eee6e4deb02528d8d05ad57`; workspace-count assertion was RED then GREEN (1/1) in the S45 T068 follow-up; counts-only Stack A replay report at `specs/016-exercise-food-catalogs/evidence/t068-stack-a-inventory-2026-11-10.json`. | VERIFIED |

## S45 T037 contract tests

| Requirement | Task | Test | Evidence | Status |
|---|---|---|---|---|
| FR-001, FR-002, FR-003, FR-004, FR-014, FR-018, FR-030, FR-036, FR-037, FR-038, SC-001, SC-006, SC-013, SC-016 | T037 | `tests/integration/catalog-exercise-t037-contract.test.ts::T037 Global and workspace-private write contracts`; `::Name field contract`; `::Description field contract`; `::Notes field contract`; `::Video field contract`; `::Alternatives field contract`; `::Default Rest Time field contract`; `::Default RIR field contract`; `::Default Reps field contract`; `::T037 contract distinctions` | T037 contract-test commit (`HEAD`); Stack A RED before expected-failure conversion: 17 failing, 25 passing; post-conversion focused Stack A run: 31 passing, 23 expected failures. Expected failures are tagged for T043/T047/T048/T074/T075. | CONTRACTS RECORDED |

## S45 T043 canonical exercise Video

| Requirement | Task | Test | Evidence | Status |
|---|---|---|---|---|
| FR-023, FR-014 | T043 | `tests/integration/catalog-exercise-t037-contract.test.ts::Video field contract`; `::T043 appends canonical video changes as immutable versions and audits video`; `tests/integration/catalog-exercise-operations.test.ts`; `tests/integration/catalog-video-resolution.test.ts` | Initial RED/GREEN and focused suites are recorded in the S45 T043 lane report. Architect remediation commit (full SHA in `C:/Users/NEW LAP/.lifter/runs/s45-luna-f16-t043d/report.md`): Stack A contract 45 passed / 28 expected failures; operations 3 passed; resolver 5 passed; units 38 passed; typecheck and lint passed. Both required mutations were killed: host-check removal made the Vimeo rejection fail; replacing the current-version read with null made canonical version append fail. Stack A was reset after each mutation and after restoration. | VERIFIED |
