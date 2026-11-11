# F17 Implementation Tasks

**Planning only — no task is authorized.** This is an updated spec-only draft (S43, 2026-11-10). Every task is a 30–60 minute unit that starts with its negative or contract test, captures RED, makes the smallest change, captures GREEN, and runs its listed mutation checks before being marked complete. No task may start until the Analyze gate is current, the PO answers the MCQs that block its scope, and (for DB work) a stack and migration version are allocated by the architect.

**Ownership is by skill and risk only — no agent or model names.** `[DB/SECURITY]` = schema, RLS, SECURITY DEFINER, concurrency, idempotency, privilege work (high risk). `[APP/API]` = server endpoints/RPC callers and validation wiring. `[PURE-TS]` = deterministic functions, schemas, registries. `[UI]` = Design System screens, i18n, accessibility. `[EXPORT]` = PDF/Excel/prompt rendering. `[TEST]` = cross-cutting evidence. `[RISK: HIGH]` marks security/concurrency work requiring independent review and mutation evidence.

**Dependency classes**: `[INDEPENDENT]` (no merged dependency), `[NEEDS-F16]`, `[NEEDS-PLAN-CORE]` (pending F19 PR must be merged), `[NEEDS-F13]`, `[NEEDS-STACK]`, `[BLOCKED-MCQ-n]`.

## Phase 0 — contracts and pure functions

- [x] **T001 (50m) — Freeze the F17 role/permission matrix fixture.** `[PURE-TS][INDEPENDENT]` (FR-020; SC-010). Table-driven matrix for PO, WO, Trainer, Sales, client, foreign workspace, revoked membership across plan, template, assignment, export and volume. RED: at least one row mismatches the spec matrix. GREEN: all rows agree with `spec.md` FR-020. Mutation: flip one role's expectation and prove the test fails.
- [ ] **T002 (50m) — Workout document schema v1 validator.** `[PURE-TS][NEEDS-F16]` (FR-002, FR-003; SC-012). Days/items/sets, ids, entry-level reps value/range and rest/RIR bounds, set type/load modes, three-alternative cap, reference shape without `variation`, and no items on rest days. Acceptance tests: valid session item passes; a rest-day item and an attempted add/move to a rest day fail with `invalid_document`; rejected operations make no write, and a rejected move leaves its item on the source day. RED: invalid payloads rejected. GREEN: valid fixtures accepted. Mutation: remove one bound, target or rest-day-item check and prove its test fails.
- [x] **T003 (50m) — Id continuity and duplicate remap.** `[PURE-TS][INDEPENDENT]` (FR-002; SC-012). Preserve unchanged ids; duplicate exercise remaps item+sets; duplicate day remaps day+items+sets; field-for-field equality; no collisions. RED before implementation. Mutation: skip one descendant level and prove collision test fails.
- [ ] **T004 (50m) — Add-time default copy.** `[PURE-TS][NEEDS-F16]` (FR-004, FR-005; SC-001). Copy only Default Rest Time, Default RIR, Default Reps into entry-level prescription fields; absent → blank; no live link; applies after load; never re-defaults. A new entry has zero set rows. RED: live-link/re-default/blank-substitution cases fail. GREEN: A1-1..A1-5 pass. Mutation: reintroduce a live read and prove the test fails. Editable Notes/Alternatives are copied on add (S42-PO-8).
- [x] **T053 (30m) — Zero-set prescription persistence.** `[PURE-TS][INDEPENDENT]` (FR-004, FR-005; SC-001). Save/reload an entry with zero sets, change library defaults, reload again, and assert Rest/RIR/Reps/Notes/Alternatives remain the copied and edited entry values. Adding a set uses entry values and performs no library reread. RED first; mutation: delete entry-level prescription fields and prove the test fails.
- [ ] **T005 (50m) — Load/copy preserves source values.** `[PURE-TS][NEEDS-F16]` (FR-006, FR-013, FR-014; SC-001, SC-005). Template and published-plan copy preserve entry-level prescriptions, set type/load values, notes and alternatives; 0 RIR vs 1 RIR example; destination independence. RED: default substitution and shared-reference cases fail. Mutation: substitute a library default and prove failure.
- [x] **T006 (50m) — Volume pure function.** `[PURE-TS][INDEPENDENT]` (FR-016; SC-007). Working sets only, primary 1.0, secondary 0.5, warm-up 0, per session and per week. RED before implementation. Mutation: include warm-ups or change the secondary weight and prove cases fail. **Week grouping uses program-day blocks 1–7, 8–14, etc.; rest days are included, the final partial block counts as a week, and no calendar date is needed (S43-PO-5; architect mapping (S43-R6)).**
- [ ] **T007 (45m) — Export field-coverage model and formula guard.** `[PURE-TS][INDEPENDENT]` (FR-017, FR-018; SC-008). Field list from FR-018, including document-level notes; all coach-authored cells strings; `=`,`+`,`-`,`@` and leading-space variants neutralised. RED: formula string passes. Mutation: remove one leading-character check and prove failure.
- [ ] **T008 (45m) — AI prompt builder constraints.** `[PURE-TS][INDEPENDENT]` (FR-019; SC-009). Prompt carries complete content including document-level notes + URLs + hyperlink request; contains no invent/replace/alter/generate instruction. RED: prohibited-instruction fixture passes. Mutation: inject a prohibited sentence and prove the assertion fails. Action/confirmation strings and exact EN/AR prompt bodies are approved. Compare generated bytes with contracts/copy-ai-prompt.md after {{PLAN_CONTENT}} substitution.
- [ ] **T009 (50m) — Assignment state machine (pure model).** `[PURE-TS][INDEPENDENT]` (FR-010, FR-011; SC-003, SC-004). Inputs: template selection mode, target mode, workspace state (never/partial/own-only), existing copies. Outputs per workspace: assigned/skipped/`no_copies` plus created set; allow a committed `no_copies` receipt for a targeted workspace when another target receives a copy; reject the entire operation before writes only when total copies = 0. RED: Kendo/Alpha/Beta/Gamma matrix mismatches, mixed `no_copies`/assigned batch and zero-total rejection. Mutation: top-up a partial workspace and prove failure. S44-PO-2 (architect mapping S44-R2); any held source version is skipped and reported (S43-PO-1).
- [ ] **T010 (45m) — Schema registry fail-closed.** `[PURE-TS][INDEPENDENT]` (FR-022). Registered immutable parsers; unknown version fails generically; retained versions render. RED: unregistered version accepted. Mutation: delete fail-closed branch and prove failure.
- [ ] **T011 (50m) — F16 effective-resolution adapter.** `[PURE-TS][NEEDS-F16]` (FR-003, FR-012; SC-005, SC-011). Resolve the eight fields per F16 FR-026; global refs pin the global version and any applicable override version with its source workspace; private refs pin their workspace-private identity/version without an override. Fresh global authoring is canonical-only, while promoted global templates may retain source-workspace private references marked RED when unresolved and blocked from loading. Capture add-time source pins and effective non-video entry values; edits to catalog sources do not affect the draft, while trainer edits to entry values remain editable and are frozen at publication. Resolve muscle membership from the pinned immutable source version; Video remains live. RED: foreign private refs load, an override resolves as destination-local, a RED promoted ref loads, an add-time pin is removed, or later entry edits are omitted at publication. Mutation: exercise those failures and prove assertions fail.

## Phase 1 — schema, privilege, isolation

- [ ] **T012 (60m) — Migration: workout plan content.** `[DB/SECURITY][RISK: HIGH][NEEDS-STACK][NEEDS-PLAN-CORE]` (FR-001, FR-002, FR-003; SC-006). Workout content attached to F19 draft/revision rows or a companion keyed to them; no duplicate root/draft/revision/delivery table. RED: assert constraints/keys. GREEN: clean apply. Mutation: drop a composite FK and prove the assertion fails.
- [ ] **T013 (60m) — Migration: template identities and versions.** `[DB/SECURITY][RISK: HIGH][NEEDS-STACK]` (FR-008, FR-013; SC-005). Global + workspace identities, immutable versions, `(template_id, version)` uniqueness, current-version CAS pointer, provenance columns. RED first. Mutation: remove uniqueness/CAS and prove failure.
- [ ] **T014 (60m) — Migration: assignment runs, items and distribution state.** `[DB/SECURITY][RISK: HIGH][NEEDS-STACK]` (FR-010, FR-011; SC-003, SC-004). Run/item/copy ledgers and per-workspace flag with uniqueness keys from `data-model.md` §5. RED first. Mutation: remove copy uniqueness and prove duplicate-on-retry failure.
- [ ] **T015 (45m) — Migration: schema version and size checks.** `[DB/SECURITY][RISK: HIGH][NEEDS-STACK]` (FR-022). Registry-compatible version check and provisional cap check. RED: unknown/oversized rejected. Mutation: drop each check and prove its test fails.
- [ ] **T016 (60m) — RLS policies for F17 tables.** `[DB/SECURITY][RISK: HIGH][NEEDS-STACK]` (FR-020; SC-010). Workspace isolation; PO-only global and assignment; Sales/client denial; foreign indistinguishable. RED: negative matrix before policy change. Mutation: remove each predicate and prove its row fails.
- [ ] **T017 (50m) — Definer grants and direct-DML denial.** `[DB/SECURITY][RISK: HIGH][NEEDS-STACK]` (FR-020). `search_path = ''`, qualified names, narrow EXECUTE, no base-table DML for client roles. RED first. Mutation: grant direct DML or widen EXECUTE and prove denial tests fail.

## Phase 2 — plan lifecycle integration

- [ ] **T018 (50m) — Create plan (blank / template / existing plan).** `[APP/API][NEEDS-STACK][NEEDS-PLAN-CORE]` (FR-001, FR-014; SC-006). F19 creation lock + operation key. RED: duplicate submit creates a second root. Mutation: remove lock/ledger check and prove failure.
- [ ] **T019 (50m) — Autosave and Save as Draft with CAS.** `[APP/API][NEEDS-STACK][NEEDS-PLAN-CORE]` (FR-002, FR-015; SC-006, SC-012). Private draft, ongoing autosave, stale revision conflict, no-op autosave never clears readiness. Acceptance test: adding or moving an item to a rest day is rejected with `invalid_document` before persistence; the draft is unchanged and a rejected move leaves the item on its source day. RED first. Mutation: remove the revision or rest-day validation check and prove conflict/rejection failure.
- [ ] **T020 (50m) — Ready & Publish gates.** `[APP/API][RISK: HIGH][NEEDS-STACK][NEEDS-PLAN-CORE][NEEDS-F13]` (FR-015; SC-006). Intake + current subscription gates, explicit revision selection, refusal writes zero revision/delivery, publish without prior Save as Draft. RED first. Mutation: remove a gate and prove the refusal test fails.
- [ ] **T021 (50m) — Immutable revisions and newest-first listing.** `[DB/SECURITY][RISK: HIGH][NEEDS-STACK][NEEDS-PLAN-CORE]` (FR-001, FR-015). Trigger + grants prevent mutation; no auto-archive. RED first. Mutation: remove the trigger/grant and prove failure.
- [ ] **T022 (50m) — Contributor set per published revision.** `[APP/API][NEEDS-STACK][NEEDS-PLAN-CORE]` (FR-027; SC-015). Each successful save/publish attributes the acting staff member; a published revision exposes an immutable contributor set (staff ids, action codes, timestamps only) since the previous revision. RED first. Mutation: remove attribution or widen the payload and prove failure.

## Phase 3 — templates and assignment

- [ ] **T023 (50m) — Template CRUD/version/retire RPCs.** `[APP/API][RISK: HIGH][NEEDS-STACK]` (FR-008, FR-013). PO-only global; workspace-scoped staff; append-only versions; expected-version CAS; non-destructive retire. RED first. Mutation: remove PO guard or CAS and prove failure.
- [ ] **T024 (50m) — Global template governance and provenance masking.** `[DB/SECURITY][RISK: HIGH][NEEDS-STACK]` (FR-008, FR-012; SC-005). Non-PO projections omit provenance; global content has no client data. Fresh global authoring rejects private refs; a promoted template may retain them, with unresolved refs flagged RED and loading blocked. RED first. Mutation: allow fresh private authoring or load an unresolved promoted ref and prove its test fails.
- [ ] **T025 (60m) — Assign run RPC (All / Specific / All-Except × All / Specific Workspaces).** `[APP/API][RISK: HIGH][NEEDS-STACK]` (FR-010, FR-011; SC-003, SC-004). Per-workspace lock, eligibility read + flag write in one transaction, new identity plus immutable version 1 per copy, per-item outcomes; skip and report any held template identity across all source versions. For an accepted All Workspaces run, record `skipped_already_assigned` for each excluded workspace alongside assignment-target outcomes. Record `no_copies` for a targeted workspace receiving none when at least one copy is created overall; reject before writes only when total copies = 0. RED first: mixed per-workspace receipt and zero-total rejection. Mutation: remove the lock or flag check and prove double-distribution/top-up failure. **S44-PO-2 (architect mapping S44-R2); S42-PO-8 total zero-copy rejection remains.**
- [ ] **T026 (50m) — Assignment retry, replay and key-conflict.** `[APP/API][RISK: HIGH][NEEDS-STACK]` (FR-011, FR-021; SC-010). Replay returns the receipt after reauthorization; changed args conflict; crash/unknown-result recovery. RED first. Mutation: remove key binding and prove duplicate-receipt failure.
- [ ] **T027 (50m) — Newer global version into an existing copy.** `[APP/API][RISK: HIGH][NEEDS-STACK]` (FR-010, FR-011; SC-004). Implement only the PO-approved rule. **Resolved by S43-PO-1**: skip and report each existing workspace/template copy regardless of source version.
- [ ] **T028 (50m) — Promotion to global.** `[APP/API][RISK: HIGH][NEEDS-STACK]` (FR-012; SC-005). Separate copy, original retained, no client data, unresolved references are flagged RED and block loading until fixed. RED first. Mutation: promote by moving/replacing the source and prove failure. **Resolved by S42-PO-8**: promotion allowed; unresolved refs RED and loading blocked.
- [ ] **T029 (50m) — Load template into draft.** `[APP/API][NEEDS-STACK][NEEDS-F16]` (FR-013, FR-006; SC-001). One explicit version, full id remap, no template mutation, authorization in the owning workspace. RED first. Mutation: remove remap or version pin and prove failure.
- [ ] **T030 (45m) — Copy published plan.** `[APP/API][NEEDS-STACK][NEEDS-PLAN-CORE]` (FR-014). Latest published revision values; no ownership/history/subscription/delivery/video copy. RED first. Mutation: copy a delivery/activation fact and prove failure.

## Phase 4 — exercise integration

- [ ] **T031 (50m) — Add exercise RPC.** `[APP/API][RISK: HIGH][NEEDS-STACK][NEEDS-F16]` (FR-003, FR-004, FR-023; SC-001, SC-011). Bounded search selection; pin source-specific immutable version metadata and, for global refs, applicable override version plus its source workspace; copy effective non-video values at add, workspace exclusion, three-default copy, resolution via F16. RED first: later catalog/override edits leave draft pins/values unchanged; editable name and description survive draft save/reload and are included at publication; muscle taxonomy resolves from the pinned immutable version; Video resolves current. Mutation: remove workspace exclusion, source pins, save/reload preservation, publication of current entry values or pinned-version muscle resolution and prove failure. **Set rows and Notes/Alternatives are decided: zero set rows; copy editable Notes/Alternatives.** Mock-based and RED work may proceed against merged F16 contracts; live integration and publication acceptance require the implemented F16 effective resolver, `ExerciseSnapshotV2` support, and live Video resolver.
- [ ] **T032 (50m) — Exercise picker UI.** `[UI][NEEDS-F16]` (FR-023, FR-024). Bounded AR/EN search, filters, explicit version, defaults preview. RED first. Mutation: remove bounded assertion or version selector and prove failure.
- [ ] **T033 (45m) — Default copy/override UI.** `[UI][NEEDS-F16]` (FR-004, FR-005; SC-001). Show copied values as ordinary editable fields; no platform defaults screen; no re-default on load. RED first. Mutation: add a platform-defaults control or re-default path and prove failure.
- [ ] **T034 (45m) — Alternatives UI and unavailable indicator.** `[UI][NEEDS-F16]` (FR-002, FR-003; SC-011). Select up to three, edit per plan, show unavailable on removed/merged, never substitute. RED first. Mutation: drop the indicator or substitute a target and prove failure.
- [ ] **T035 (45m) — Live Video resolution wiring.** `[APP/API][NEEDS-STACK][NEEDS-F16]` (FR-003; SC-011). Resolve on each authorized read/export; never persist; no republish on change. RED first. Mutation: store a URL in the revision and prove failure.

## Phase 5 — volume and exports

- [ ] **T036 (45m) — Volume UI.** `[UI][INDEPENDENT]` (FR-016; SC-007). Per session and per week from the pure function. RED first. Mutation: include warm-ups or drop secondary credit and prove failure. Week grouping uses 7-program-day blocks (days 1–7, 8–14, etc.); rest days included and final partial block counted. No calendar start is required (S43-PO-5; architect mapping (S43-R6)).
- [ ] **T037 (50m) — PDF print route and RTL CSS.** `[EXPORT][INDEPENDENT]` (FR-017, FR-018; SC-008). Selected revision only; full FR-018 field set; RTL print. RED first. Mutation: remove a field or RTL assertion and prove failure. **Resolved by S42-PO-8**: UI-language labels, authored text preserved, exercise names English.
- [ ] **T038 (50m) — ExcelJS workbook.** `[EXPORT][INDEPENDENT]` (FR-017, FR-018; SC-008). Same payload; all coach cells strings; injection guard. RED first. Mutation: allow one formula cell and prove failure.
- [ ] **T039 (50m) — Export audit and published-only enforcement.** `[APP/API][RISK: HIGH][NEEDS-STACK]` (FR-017; SC-008). Success and denial events; no content/PII; drafts and foreign revisions denied. RED first. Mutation: add content/PII to audit or allow a draft and prove failure.
- [ ] **T040 (50m) — Copy Prompt generation and copy action.** `[APP/API][RISK: HIGH][NEEDS-STACK]` (FR-019; SC-009). Authorized published payload; hyperlink instruction; prohibitions enforced. RED first. Mutation: add a prohibited instruction and prove failure. **Actor rule is resolved: export-authorized staff. Prompt body EN/AR matches the approved byte-exact locale contract.**
- [ ] **T041 (45m) — Export goldens AR/EN.** `[TEST][INDEPENDENT]` (FR-018, FR-024; SC-008, SC-013). Revision N while N+1 exists; AR/EN layout checks plus exact locale prompt byte equality after the single {{PLAN_CONTENT}} substitution. RED first. Mutation: change one prompt byte or cell and prove golden mismatch. **Labels use UI language, authored text is preserved, exercise names English; layout specifics outside this rule remain governed by the approved requirements.**

## Phase 6 — UI

- [ ] **T042 (50m) — Draft/publish UI and conflict handling.** `[UI][NEEDS-PLAN-CORE]` (FR-015; SC-006). Autosave indicator, optional Save as Draft, single Ready & Publish, conflict display, no-op autosave preserves readiness. RED first. Mutation: clear readiness on a no-op or hide the conflict and prove failure.
- [ ] **T043 (50m) — Plan builder UI.** `[UI][INDEPENDENT]` (FR-002, FR-024; SC-012). Sessions/rest days, items, sets, notes, alternatives; reorder, cross-day move, duplicate; keyboard move controls. Acceptance tests: adding or moving an item to a rest day is rejected with `invalid_document` and no write; a rejected move leaves the item on its source day; rest days cannot display or retain items. RED first. Mutation: remove a keyboard alternative, id preservation or rest-day rejection and prove failure.
- [ ] **T044 (50m) — Template manager and assignment UI.** `[UI][INDEPENDENT]` (FR-008, FR-010, FR-011; SC-004). List global/own/assigned, load, create/edit, PO assignment wizard with Step 1/Step 2 and skip explanations. RED first. Mutation: remove scope gating or a state distinction and prove failure.
- [ ] **T045 (45m) — AR/EN Playwright and axe matrix.** `[TEST][INDEPENDENT]` (FR-024; SC-013). AR RTL and EN, light/dark, mobile/desktop, keyboard, axe, all required states. RED first. Mutation: remove one accessible name or RTL assertion and prove failure.
- [ ] **T046 (45m) — Assignment state visibility tests.** `[TEST][INDEPENDENT]` (FR-011; SC-004). Never-assigned, intentionally partial and own-templates-only are distinguishable in the PO view and in run receipts. RED first. Mutation: collapse two states and prove failure.

## Phase 7 — security, performance, release

- [ ] **T047 (60m) — Full negative matrix.** `[DB/SECURITY][RISK: HIGH][NEEDS-STACK]` (FR-020; SC-010). Foreign-workspace app + RLS, direct DML denial, Sales/client/unaffiliated/revoked denial, PO-only global/assignment, replay vs conflict, indistinguishable denials. RED first. Mutation: remove each guard and prove its row fails.
- [ ] **T048 (45m) — 1,000-operation property test.** `[TEST][INDEPENDENT]` (FR-002; SC-012). Reorder/move/duplicate with zero parameter corruption; generated add/move attempts targeting rest days are rejected with `invalid_document`, leave the document unchanged, and preserve the source item after a rejected move. RED first. Mutation: corrupt one generated parameter or allow one rest-day item and prove detection.
- [ ] **T049 (50m) — Concurrency and retry suite.** `[TEST][RISK: HIGH][NEEDS-STACK]` (FR-021; SC-010). 100 retries of create/save/publish/assign; concurrent runs; unknown result after commit; no duplicates or overwrites. RED first. Mutation: remove a uniqueness guard and prove duplicate detection.
- [ ] **T050 (60m) — Performance benchmark and size-cap decision.** `[DB/SECURITY][RISK: HIGH][NEEDS-STACK]` (FR-022; SC-014). Re-benchmark a 7-day/40-exercise plan and the maximum accepted document; choose the final cap from evidence. RED first. Mutation: remove each measured assertion and prove the gate fails. No historical number is accepted without a fresh measurement.
- [ ] **T051 (50m) — Migration validation and release gate.** `[DB/SECURITY][RISK: HIGH][NEEDS-STACK]` (FR-022; SC-014). Unique versions above the highest across all refs, fresh + upgrade paths, audit atomicity, zero direct DML, all mutation evidence recorded. RED first. Mutation: remove each security-critical assertion in turn and prove the gate fails.
- [ ] **T052 (45m) — Frontend Design Gate evidence and handoff.** `[UI][INDEPENDENT]` (FR-024; SC-013). Rendered AR/EN × light/dark × mobile/desktop screenshots, all states, accessibility evidence. RED first. Mutation: remove one role-gated control or accessible name and prove the suite fails.

## Dependency order

T001–T011 (contracts/pure) may start on merged F16 contracts only where noted. T012–T017 need a stack and the pending F19 PR merged before plan-lifecycle work. T018–T022 depend on F19. T023–T030 implement templates/assignment. T031–T035 integrate F16. T036–T041 implement volume and exports. T042–T046 build UI on stable APIs. T047–T052 are release gates; T050 runs before production, not during this documentation task.

## Parallel waves (disjoint files)

- Wave A (pure schemas/validation): T002, T005, T007, T010.
- Wave B (pure helpers/models): T001, T003, T004, T006, T008, T009, T011.
- Wave C (exports/UI on mocked projections): T037, T038, T041, T043, T044, T045, T046, T048, T052.
- Wave D (DB foundations, serialized): T012 → T013 → T014 → T015 → T016 → T017.

Shared fixtures are appended, never overwritten, under concurrency.

## Traceability

| Requirement | Tasks                                    |
| ----------- | ---------------------------------------- |
| FR-001      | T012, T018, T021, T030                   |
| FR-002      | T002, T003, T012, T019, T034, T043, T048 |
| FR-003      | T002, T011, T012, T031, T034, T035       |
| FR-004      | T004, T031, T033, T053                   |
| FR-005      | T004, T033                               |
| FR-006      | T005, T029                               |
| FR-007      | T004, T031 (zero set rows decided)       |
| FR-008      | T013, T023, T024, T044                   |
| FR-009      | T014, T025, T044                         |
| FR-010      | T009, T014, T025, T027, T044             |
| FR-011      | T009, T014, T025, T026, T027, T046       |
| FR-012      | T011, T024, T028                         |
| FR-013      | T005, T013, T023, T029                   |
| FR-014      | T005, T018, T030                         |
| FR-015      | T019, T020, T021, T042                   |
| FR-016      | T006, T036                               |
| FR-017      | T007, T037, T038, T039                   |
| FR-018      | T007, T037, T038, T041                   |
| FR-019      | T008, T040                               |
| FR-020      | T001, T016, T017, T024, T047             |
| FR-021      | T014, T019, T026, T049                   |
| FR-022      | T010, T015, T050, T051                   |
| FR-023      | T031, T032                               |
| FR-024      | T032, T042, T043, T044, T045, T052       |
| FR-025      | T020, T039, T047                         |
| FR-026      | Excluded by spec; no tasks               |
| FR-027      | T019, T020, T022                         |

| Criterion | Tasks                                    |
| --------- | ---------------------------------------- |
| SC-001    | T004, T005, T029, T031, T033             |
| SC-002    | T013, T025, T044                         |
| SC-003    | T009, T014, T025, T046                   |
| SC-004    | T009, T014, T025, T046                   |
| SC-005    | T005, T011, T013, T024, T028             |
| SC-006    | T012, T018, T019, T020, T021, T042       |
| SC-007    | T006, T036                               |
| SC-008    | T007, T037, T038, T039, T041             |
| SC-009    | T008, T040                               |
| SC-010    | T001, T014, T016, T017, T026, T047, T049 |
| SC-011    | T005, T011, T031, T034, T035             |
| SC-012    | T002, T003, T019, T043, T048             |
| SC-013    | T041, T045, T052                         |
| SC-014    | T050, T051                               |
| SC-015    | T022                                     |

## Coverage gaps

- FR-026 is an exclusion statement; no tasks by design.
- Every other FR and SC maps to at least one task.
- S43-MCQ-A/C are resolved by S43-PO-5 (architect mapping (S43-R6)); tasks remain unticked until their tests execute and pass.
