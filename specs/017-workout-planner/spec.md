# Feature Specification: F17 Workout Templates & Workout Planner

**Feature Branch**: `speckit-017-workout-planner-s42`
**Status**: Updated spec-only draft (S44, 2026-11-10). Encodes binding PO decisions A1–A4 from `C:/Users/NEW LAP/.lifter/runs/s42-po/f17-f18-po-decisions-source.md` on top of `origin/main` `d0c5d1ac7ec8adb13ad12712f85cf9702a97a414`. **No implementation, migration, code, test, workflow or runtime change is authorized by this draft.** The numbered MCQs in §8.5 and S44-MCQ-F17-1 are resolved; there are no open product ambiguities in the current F17 spec scope.
**Phase**: Specify → Clarify → Plan → Tasks → Analyze (draft). P3 on `docs/03-roadmap.md:25`.
**Companion artifacts**: `plan.md`, `data-model.md`, `contracts/`, `tasks.md`, `traceability.md`, `checklists/analyze.md`, `research/po-decision-matrix.md`, `research/conflicts.md`, `research/section-b-assessment.md`.

## 1. Purpose and scope

F17 owns workout plan content, workout template content and governance, template assignment execution, workout volume, and workout exports. It consumes, and does not redefine:

- **F19 Shared Plan Core** (pending F19 PR, not merged): stable Plan ID, private draft, immutable published revisions, `Ready & Publish` as delivery, subscription binding by delivery, activation, productivity units, client projection. Cited as "pending F19 PR" everywhere; never as a main fact.
- **F16 catalogs** (merged): exercise identities and versions, the exact eight library fields, effective resolution, alternatives, `ExerciseSnapshotV2`, live Video.
- **F13/F12** (merged): subscription entitlement and expiry. **P4** owns client access enforcement and the expiry surface.

This draft adds no client-facing planner surface; client plan viewing is P4/Plan Core.

## 2. Source authority

Priority, highest first:

1. **PO binding decisions** — `runs/s42-po/f17-f18-po-decisions-source.md` Section A (A1–A4 F17-specific; A6 shared context; A7 environment/delegation). Section B is explicitly _not_ decisions.
2. **F19 PO decisions** S42-PO-2..6 in `runs/s42-po/s42-po-1.verbatim.txt`, and the in-progress F19 spec at `C:/Users/NEW LAP/Desktop/LFTR-s42-f19/specs/019-plan-core/` (pending F19 PR).
3. **`origin/main`**: Constitution 1.10.0, `docs/04-changes-and-questions.md` S20-14..S20-16 (D17-1..D17-9), `specs/016-exercise-food-catalogs/`, `lib/auth/capabilities.ts`, `specs/013-freeze-renewal-refunds/`.
4. **Historic references only** — `origin/sk-017`, `origin/017-workout-planner`, `origin/017-t037-templates`. Valid wording may be reused; superseded assumptions and code may not.

PO words are quoted byte-exact. Architect mappings and inferred requirements are marked as such and are never presented as PO decisions. See `research/po-decision-matrix.md`.

## 3. User scenarios and acceptance scenarios

Every A1–A4 rule has a Given/When/Then scenario. Scenario ids are stable and referenced by `research/po-decision-matrix.md`.

### US1 — Add exercises with the right defaults (Priority: P1, PO A1)

A Trainer, Workspace Owner (WO) or Platform Owner (PO) with current `coaching_work` builds or extends a workout draft. Adding a _fresh_ exercise copies current F16 library defaults into ordinary editable plan fields; loading a template or a published plan preserves what the source actually contains.

**Independent Test**: synthetic library + template + plan fixtures; assert copied values, blank absent defaults, non-re-defaulting after load, and the 1 RIR vs 0 RIR example.

1. **A1-1 (fresh add, blank plan)** — **Given** a blank `Create New Plan` draft and an exercise whose current F16 defaults are Rest 90 s, RIR 1, Reps 8–12, **When** the trainer adds that exercise, **Then** the new plan entry's ordinary editable Rest, RIR and Reps fields contain 90 s, 1 and 8–12, and no separate "default" field set is created.
2. **A1-2 (absent default)** — **Given** the exercise has no Default Rest Time, **When** it is added, **Then** the plan entry's Rest field is blank and remains editable; nothing is guessed or inherited from a platform-wide default.
3. **A1-3 (add-time copy, no live link)** - **Given** an exercise added to a draft with its effective source catalog version, applicable workspace override version/source workspace (for global exercises), and non-video values captured, **When** either source is later edited and the draft is saved/reloaded, **Then** the entry retains its captured values unless the trainer edits the entry; publication freezes the entry current edited values with the original version pins. Video remains live.
4. **A1-4 (insert after load)** — **Given** a draft that was loaded from a template or another plan, **When** the trainer inserts a fresh exercise from the library, **Then** that new entry receives the current library defaults, while every exercise that came from the source keeps its loaded values.
5. **A1-5 (no re-defaulting)** — **Given** a draft containing an already-copied exercise, **When** any reload, autosave, reorder, duplicate-day or re-publish-validation pass runs, **Then** that entry's prescription values are not reset to library defaults.
6. **A1-6 (load preserves source values)** — **Given** a template entry with 0 RIR and a library Default RIR of 1, **When** the template is loaded into a new draft, **Then** the draft entry keeps 0 RIR, the source's entry-level prescriptions, set types/load values, exercise/day notes and alternatives; current library defaults are not substituted.
7. **A1-7 (independent destination)** — **Given** a draft loaded from a template or plan, **When** the trainer edits the destination, **Then** the destination is independently editable and later edits to the source template or source plan do not alter it.
8. **A1-8 (zero initial set rows)** — **Given** F16 has no set-count field and a fresh exercise is added, **When** the draft entry is created, **Then** it has zero set rows until staff add them; the plan is not publish-ready until Plan Core readiness is satisfied. (S42-PO-8; architect mapping (S42 matrix): F17-MCQ-1=C.)
9. **A1-9 (entry prescriptions survive zero sets)** — **Given** a new exercise entry with copied Rest/RIR/Reps/Notes/Alternatives and zero set rows, **When** it is saved and reloaded after the library defaults change, **Then** the entry retains its copied or edited values, and adding a set does not reread the library defaults (architect technical fix S43-R9 Sol-3).

### US2 — Global and workspace workout templates and PO assignment (Priority: P1, PO A2)

Only the PO manages Global Workout Templates. Workspaces start with none. The PO distributes by an explicit manual `Global Templates → Assign` operation, and assigned templates become independent workspace-owned copies.

**Independent Test**: fixtures for workspaces Kendo (intentionally assigned 3 of 10), Alpha (assigned 10), Beta (never assigned), Gamma (own templates only); run All/Specific/All-Except combinations and retries.

1. **A2-1 (PO-only global)** — **Given** a Trainer or WO, **When** they attempt to create, edit, retire or assign a Global Workout Template, **Then** the action is denied generically; only the PO may do it.
2. **A2-2 (new workspace starts empty)** — **Given** a newly created workspace, **When** it is opened for the first time, **Then** it contains zero global templates, no seeding has run, and no job or trigger creates copies.
3. **A2-3 (no sync on global create)** — **Given** existing workspaces and a newly created global template, **When** the global template is saved, **Then** no workspace receives a copy automatically.
4. **A2-4 (assign steps)** — **Given** the PO opens `Global Templates → Assign`, **When** they choose Step 1, **Then** the offered modes are All Templates, Specific Templates and All Templates Exclude (select all except chosen ones); Step 2 offers All Workspaces or Specific Workspaces.
5. **A2-5 (All skips ever-assigned)** — **Given** Kendo was intentionally assigned 3 templates and Alpha 10, **When** the PO runs All Workspaces, **Then** both Kendo and Alpha are skipped entirely; Kendo is not topped up with the remaining 7.
6. **A2-6 (All is one-time per workspace)** — **Given** a workspace that has ever received a global-template assignment, **When** All Workspaces runs again, **Then** that workspace is skipped again; only never-assigned workspaces receive the selected templates.
7. **A2-7 (All applies to current workspaces only)** — **Given** an All Workspaces run at time T, **When** a new workspace is created at T+1 or a new global template is added at T+2, **Then** neither receives anything without a new manual operation.
8. **A2-8 (Specific returns deliberately)** — **Given** a Specific Workspaces run targets multiple workspaces, at least one of which already holds every selected template, **When** the PO submits an assignment that creates one or more copies overall, **Then** the batch commits, reports skipped (workspace, template) pairs, returns per-workspace `no_copies` for each targeted workspace receiving none, and does not duplicate or overwrite existing copies; if no target receives any copy, reject before writes (S44-PO-2; architect mapping (S44-R2); S42-PO-8 total zero-copy rule).
9. **A2-9 (copies are independent and branded)** — **Given** an assigned global template, **When** the copy lands in workspace `Kendo`, **Then** it is an independent workspace-owned, workspace-branded copy (e.g. `Kendo Templates`); workspace owners/trainers may modify it and create new templates/splits, and no edit propagates back to the global library or another workspace.
10. **A2-10 (PO cross-workspace rights)** — **Given** any workspace, **When** the PO views, edits or copies its templates, **Then** the PO is authorized; a promotion to global creates a **separate copy** and retains the original workspace template.
11. **A2-11 (no silent overwrite/top-up/live link)** — **Given** an existing workspace copy, **When** any later assignment, global edit or global version change occurs, **Then** there is no silent overwrite, no implicit top-up and no live link to the global template.
12. **A2-12 (promotion and unresolved exercises)** — **Given** the PO promotes a workspace template, **When** the global copy is created, **Then** promotion creates a separate copy and retains the source; unresolved exercise references are flagged RED and loading the template is blocked until those references are fixed. (S42-PO-8; architect mapping (S42 matrix): F17-MCQ-5.)
13. **A2-13 (fresh global authoring versus promotion)** — **Given** a PO freshly authors a global template, **When** an exercise is selected, **Then** only global exercises may be referenced; **Given** a promoted template retains a workspace-private reference, **When** it is unresolved, **Then** it is flagged RED and loading remains blocked until fixed (architect technical fix S43-R9 Sol-4).

### US3 — Draft, publish and volume (Priority: P1, PO A3)

Staff autosave continuously; `Save as Draft` is optional reassurance, and `Ready & Publish` alone can publish the latest valid changes. Published revisions are immutable; volume counts working sets with fixed muscle credit.

**Independent Test**: publish a never-drafted plan directly; publish with and without a current subscription; volume table cases.

1. **A3-1 (no draft prerequisite)** — **Given** a staff member editing a valid plan that was never explicitly saved as a draft, **When** they use `Ready & Publish`, **Then** the latest valid changes are published.
2. **A3-2 (autosave ongoing)** — **Given** an open draft, **When** the trainer edits, **Then** autosave persists to the private draft without creating a new Plan ID or a published revision.
3. **A3-3 (Save as Draft optional)** — **Given** a valid draft, **When** the trainer chooses `Save as Draft`, **Then** the draft is persisted/confirmed as an optional reassurance action and the action is not required before publishing.
4. **A3-4 (stable ID, private draft, immutable revision)** — **Given** an existing plan, **When** it is published and later edited and republished, **Then** the Plan ID is unchanged, the draft stays private and each publication appends one immutable revision under the pending F19 contract.
5. **A3-5 (publish gates)** — **Given** a plan for a client without a current subscription, or a client whose intake is not submitted, **When** `Ready & Publish` is attempted, **Then** it is refused and neither a published revision nor a delivery is created.
6. **A3-6 (volume credit)** — **Given** a session with 3 working sets of an exercise whose primary muscle is Chest and secondary muscles are Triceps and Front Delts, plus 2 warm-up sets, **When** volume is reported, **Then** Chest receives 3.0, Triceps 1.5 and Front Delts 1.5 for that session, and warm-up sets add 0.
7. **A3-7 (per session and program-day weeks)** — **Given** a day-indexed plan with item-free rest days, **When** volume is reported, **Then** totals use consecutive program-day blocks: days 1?7, 8?14, and so on; rest days remain in those blocks and contribute zero volume; the final partial block is a week, with no calendar start required.
8. **A3-8 (approval gate)** — **Given** a client who is not approved, **When** staff attempt to create or edit a plan draft, **Then** the action is refused per the approved-client rule; after approval, drafting and the A3-1 direct publish flow become available.
9. **A3-9 (rest-day item rejection)** — **Given** a plan document with an exercise item on a session day, **When** staff try to move it to a rest day, **Then** validation rejects the operation with `invalid_document`, writes nothing, and leaves the item on its source day. **Given** a rest day, **When** staff try to add an exercise item to it, **Then** validation rejects the operation with `invalid_document` and writes nothing; rest days contain no exercise items.

### US4 — PDF, Excel and Copy AI Prompt (Priority: P2, PO A4)

Staff export a selected published revision as PDF or Excel with complete usable training instructions, or copy a generated prompt for a separate AI tool.

**Independent Test**: export revision N while N+1 exists; diff field coverage in AR/EN; assert audit on success and denial; injection strings; prompt content assertions.

1. **A4-1 (PDF + Excel retained)** — **Given** a published revision, **When** the authorized actor selects PDF or Excel, **Then** the export is produced for that selected revision.
2. **A4-2 (complete usable instructions)** — **Given** an export, **When** it is inspected, **Then** it contains days/rest days, exercise names, ordered warm-up/working sets, reps/ranges, prescribed load with units/modes, rest, RIR, notes, trainer-selected alternatives and applicable exercise/alternative video links, so it can be used for training without the platform UI (video links still need internet).
3. **A4-3 (alternatives in PDF)** — **Given** coach-entered alternatives, **When** the PDF is exported, **Then** those alternatives appear.
4. **A4-4 (Copy Prompt is a third option)** — **Given** a published revision, **When** the actor chooses `Copy AI Prompt`, **Then** a professional, copyable prompt is generated containing the complete authorized plan content, relevant exercise/alternative details and video URLs, and asking the AI to format exercise names and approved alternatives as clickable hyperlinks when possible.
5. **A4-5 (prompt prohibitions)** — **Given** the generated prompt, **When** it is inspected, **Then** it does not ask the AI to invent or replace exercises, alter programming values, or generate alternatives; no such instruction exists anywhere in the prompt.
6. **A4-6 (security/audit/integrity)** — **Given** any export or export attempt, **When** it succeeds or is denied, **Then** the operation is audited without plan content or PII, only authorized published revisions can be selected, historical snapshot values are used, and every coach-authored spreadsheet cell is written as text with formula injection neutralized.
7. **A4-7 (deferred/excluded)** — **Given** the export surface, **When** it is inspected, **Then** no Hevy integration exists and no AI-generated alternatives are offered (PRD-12; PO A4).

### US5 — Authorization, isolation and idempotency (cross-cutting, P1)

1. **A5-1** — **Given** a Trainer/WO/PO with current `coaching_work` in the plan's workspace, **When** they edit any client plan in that workspace (including another trainer's), **Then** the edit is authorized; Sales is denied.
2. **A5-2** — **Given** a foreign-workspace, Sales, client or unaffiliated actor, **When** they attempt any plan, template, assignment or export action, **Then** access is denied without revealing existence, counts or error distinctions.
3. **A5-3** — **Given** a network retry with the same operation key and identical arguments, **When** the retry arrives, **Then** the original result is returned and no second plan, revision, delivery, template copy or assignment row is created; changed arguments under the same key conflict.
4. **A5-4** — **Given** two staff members who edited the same plan since the previous revision, **When** a new revision is published, **Then** its immutable contributor set lists both with action codes and timestamps, and contains no plan content; a later trainer deletion changes neither the revision nor the contributor set.

## 4. Edge cases

- Rest-day-only weeks and sessions with zero exercises (valid draft; a session with zero exercises is blocked at `Ready & Publish`; the empty-plan rule itself is Plan Core readiness).
- Rep ranges vs single values; per-set kg/lb; Bodyweight, Added Weight and Assisted modes; decimal load values.
- An exercise, alternative or video target removed or merged after selection: published non-video values stay frozen; Video follows the current authorized library value; the draft shows an unavailable indicator rather than substituting.
- A workspace with only self-created templates remains eligible for All Workspaces; zero-copy Assign is rejected per S42-PO-8.
- An assignment run that would create zero copies is rejected before writes (S42-PO-8).
- Re-assigning any source version of a template already held skips and reports that workspace/template pair (S43-PO-1).
- Promotion may retain private references; unresolved exercise refs are RED and block load until fixed (S42-PO-8).
- Duplicate publish/assign submit, concurrent assignment by two PO tabs, PO retry after an unknown result.
- A workspace or global template retired while drafts reference it: existing copies and published plans remain valid.
- Client deactivated or subscription expired while a draft exists: draft preserved; `Ready & Publish` refused per pending F19/F13.
- Document above the accepted size cap: rejected with a clear message; cap is provisional (SC-014).

## 5. Functional requirements

### Plan content

- **FR-001 — Plan identity and subscription binding (F19 delegation).** A workout plan root carries `workspace_id` and `client_id`; it is bound to a subscription only by a delivery row. Stable Plan ID, private mutable autosaved draft, immutable published revisions, delivery, activation and productivity units follow the **pending F19 PR** (its `specs/019-plan-core/spec.md` F19-FR-001..014). F17 MUST NOT create a second plan root, draft, revision, delivery or activation writer. (F19-FR-002; pending PR — not a main fact.)
- **FR-002 — Workout document content.** The plan document MUST support: ordered days (session or rest) with day notes; ordered exercise items with stable ids on session days only and entry-level Reps (single value or inclusive range), Rest, RIR, Notes, and up to three unique catalog-based trainer-selected Alternatives; ordered set rows typed `warmup` or `working` with load as a tagged union `bodyweight` (no value/unit) | `added_weight` (positive exact decimal + `kg`/`lb`) | `assisted` (positive exact decimal + `kg`/`lb`) (D17-7=A). Adding an item to a rest day or moving one there MUST be rejected with `invalid_document` and no writes; a rejected move leaves the item on its source day. Rest/RIR/Reps/Notes/Alternatives live on the exercise entry independently of set rows (S43-R9 Sol-3). (PO S20-15, S20-16; F16 FR-003; S44-PO-11; architect mapping (S44-R10).)
- **FR-003: Exercise reference and F16 V2 resolution.** An exercise reference MUST identify its source (`global` or `workspace_private`), stable identity, source workspace when applicable, and immutable source-catalog version. A workspace-private ref uses its own workspace-private version and has no override. A global ref may also pin the applicable override version and source workspace; consumers MUST distinguish that source workspace from the destination and MUST NOT resolve a foreign override as destination-local. It MUST NOT use a `variation` reference; legacy variation semantics are deleted at the F16 cutover (F16 FR-031, F16 FR-038). Effective resolution of the eight library fields follows F16 FR-026, including canonical-only resolution when authoring a new Global Workout Template. A promoted template may retain workspace-private references and captured authorized values; unresolved or foreign references are flagged RED and block loading. On add, capture/pin source versions and copy effective non-video values into the editable entry. Draft save/reload preserves pins and values, but plan-entry values remain editable; later catalog/override edits do not change them. Publication freezes the entry's current trainer-edited non-video values with the original add-time pins and does not reread library data. Video is never stored and is resolved live from the current authorized library value on every authorized read/export (F16 FR-020, F16 FR-027, F16 SC-009, F16 SC-011; S44-PO-2; architect mapping (S44-R2)).
- **FR-004 — Add-time library defaults (PO A1).** When a fresh exercise is added from the library, the plan's ordinary editable prescription fields MUST be populated with the current F16 library defaults that exist — Default Rest Time, Default RIR, Default Reps. A default that is absent leaves the matching field blank. Values are copied at add time and are never live-linked to library defaults. No second set of separate "default" fields is created. (PO A1; F16 FR-027, F16 FR-037, F16 SC-011.)
- **FR-005 — Add-time copy scope (PO A1).** The add-time copy applies to a blank `Create New Plan` flow and to a new exercise inserted after loading a template or another plan. It MUST NOT re-default exercises that were already copied, loaded or edited. (PO A1.)
- **FR-006 — Loading preserves source content (PO A1).** Loading/copying an immutable workout template or a published client plan MUST preserve the source's actual edited workout contents, entry-level prescriptions, set types/load values, exercise/day notes, alternatives and other relevant parameters; library defaults MUST NOT be substituted. The destination is independently editable and later source edits cannot alter it. (PO A1.)
- **FR-007 — No invented catalog fields (PO A1; S42-PO-8).** F16's approved eight exercise fields are respected. F17 MUST NOT require or invent a catalog set-count field. A fresh exercise entry starts with zero set rows until staff add them. (S42-PO-8; architect mapping (S42 matrix): F17-MCQ-1=C.)

### Templates and assignment

- **FR-008 — Template ownership and versioning.** Global Workout Templates are created and managed only by the PO. Workspace workout templates are created, versioned, edited and retired by authorized workspace owners/trainers with current `coaching_work` in the owning workspace. A template has one stable identity and append-only immutable versions; retire is non-destructive and only prevents new selection; existing copies and plans are unaffected. Templates contain no client-specific data and use the workout document schema minus client fields. (PO A2; D17-3.)
- **FR-009 — No automatic distribution.** Every new workspace starts with no global templates distributed to it. There is no seeding, no automatic sync/distribution on workspace creation, and no distribution when a global template is added or versioned. Only an explicit PO `Global Templates → Assign` operation creates workspace copies. (PO A2.)
- **FR-010 — Assignment operation.** Only the PO may assign. Step 1 offers All Templates, Specific Templates, or All Templates Exclude (select all except chosen ones). Step 2 offers All Workspaces or Specific Workspaces. Each selected template contributes its **current immutable version at the start of the run**; a version created concurrently does not join that run, and a retired template is not selectable for a new assignment (its existing copies remain valid). All Workspaces is a one-time distribution to workspaces that have never received a global-template assignment/library: it skips a workspace that has ever received an assignment — including an intentional partial assignment — and does not fill its missing templates. It affects existing workspaces at the time of the manual operation, not future workspaces. Specific Workspaces permits intentionally returning to previously assigned workspaces, without duplicating existing templates or overwriting customizations. Assigned templates become independent, workspace-owned, workspace-branded copies; no edit propagates back; no silent reassignment overwrite, implicit top-up or live-linked copy. In a committed batch with one or more copies overall, each targeted workspace receiving none has a `no_copies` receipt. (S44-PO-2; architect mapping (S44-R2).)
- **FR-011 — Assignment state and retries.** Durable assignment state MUST distinguish (a) never assigned, (b) intentionally partially assigned, and (c) a workspace with only self-created templates and no global assignment. Per the literal A2 wording, case (c) has never received a global-template assignment and is therefore eligible for All Workspaces. Assignment MUST be idempotent under retry and concurrency: one operation key produces one run, one copy per (workspace, template identity), and no duplicate or overwritten copy; an exact replay returns the original receipt after current authorization is rechecked, and changed arguments under the same key conflict. A confirmed Assign that resolves to zero copies overall is rejected before a batch or workspace marker is written; per-workspace `no_copies` is committed when another target receives a copy. (S44-PO-2; architect mapping (S44-R2); S42-PO-8 total zero-copy rejection remains.) (PO A2.)
- **FR-012 — PO cross-workspace governance and promotion.** The PO retains full visibility and management rights across workspaces: view, edit and copy any workspace's templates. Promoting an eligible workspace template into the global collection creates a separate copy and retains the original. Private client data MUST NOT be moved into global copies. Workspace-private exercise references may remain in a promoted copy; unresolved references are RED and block plan loading until fixed. (S42-PO-8; architect mapping (S42 matrix): F17-MCQ-5.) Copying a workspace template into a **different workspace** is not authorized or specified by A2 and MUST NOT be implemented without an explicit PO decision. (PO A2.)
- **FR-013 — Load template into a draft.** Loading selects one explicit visible template version, copies its content into the draft, remaps document ids to new stable ids without parameter loss, and leaves the template unchanged. A workspace MUST only load its own copies and templates it is authorized to read; a Global Workout Template is PO-managed and is not directly loadable by a workspace unless a copy exists there. Workspace staff have no global-template read surface, because the Constitution denies any capability not explicitly granted (Constitution III) and A2 grants no such read. (PO A2; D17-3; FR-006.)
- **FR-014 — Copy an existing plan.** Copying an authorized existing plan uses its latest published revision and copies actual planner-entry values, not library defaults; ownership, authorship, audit history, client/subscription association, delivery, activation and Video are not copied. (Pending F19 PR F19-FR-008; PO A1.)

### Draft, publish and volume

- **FR-015 — Autosave, Save as Draft, Ready & Publish.** Planning and drafts are allowed only for an approved client (D17-5=A). `Save as Draft` is not a prerequisite for publishing; autosave is ongoing and `Save as Draft` is an optional explicit reassurance action. Staff may finish in one sitting and use the single `Ready & Publish` action directly with their latest valid changes. Stable Plan ID, private draft and immutable published revision follow pending F19. `Ready & Publish` additionally requires submitted client intake (D17-5=A) and a current subscription: without a current subscription it is refused and creates neither a published revision nor a delivery (pending F19 SC-003, S42-PO-4 F19-MCQ-12 = "C: Block publishing"). A published-but-undelivered state MUST NOT exist. (PO A3; D17-5=A; pending F19 PR.)
- **FR-016 — Volume.** Volume counts working sets only. Each primary muscle receives 1.0 per working set, each secondary muscle 0.5 per working set, and warm-up sets count 0. Volume is reported per session and per week. (PO A3; D17-1=A.) Weeks are consecutive 7-program-day blocks: days 1–7, 8–14, and so on. Rest days remain in each block and the final partial block is a week. No calendar start date is required. (S43-PO-5 (2026-11-10): F17: Week 1 = program days 1–7, including rest days; no calendar start required.)
  architect mapping (S43-R6): Week 1 is program days 1–7 including rest days; each next week is the next 7 program days; the final partial block is a week.

### Exports

- **FR-017 — Export scope and security.** Staff exports produce PDF and Excel for published revisions only, from authorized data, with explicit authorized revision selection. Every export and every export denial emits an audit event containing actor, workspace, plan and revision identity and format, with no content, notes, client data or PII filenames. Drafts are not exportable. Spreadsheet output MUST write every coach-authored cell as a string and neutralise formula injection (leading `=`, `+`, `-`, `@`). Client export and overdue/expiry restriction belong to P4. (PO A4; D17-8=A; F13 FR-028.)
- **FR-018 — Export content completeness.** PDF and Excel MUST contain complete usable training instructions: days and rest days, exercise names, ordered warm-up/working sets, reps/ranges, prescribed load with units/modes, rest, RIR, plan/day/exercise notes, trainer-selected alternatives, and applicable exercise/alternative video links resolved live from the authorized library. The exported plan must be usable for training without accessing the platform UI; online video links still need internet. PDF includes coach-entered alternatives. Export labels use the UI language, authored text is preserved, and exercise names are English. (S42-PO-8; architect mapping (S42 matrix).) (PO A4; F16 SC-009.)
- **FR-019 — Copy AI Prompt.** Alongside PDF and Excel, `Copy AI Prompt` MUST generate a professional, copyable prompt containing the complete authorized plan content, including plan-level notes, all relevant exercise/alternative details and video URLs, asking a separate AI tool to format exercise names and approved alternatives as clickable hyperlinks to those URLs when possible. Coach-original notes are included per item and in the copied prompt; they never appear in totals rows. The prompt MUST NOT ask the AI to invent or replace exercises, alter programming values, or generate alternatives. Export-authorized staff may use the action (S42-PO-8; architect mapping (S42 matrix): F17-MCQ-6=A). Action and confirmation strings use the exact S43-PO-1 labels per UI language; the exact EN/AR templates are in contracts/copy-ai-prompt.md and approved in copy-ai-prompt-approved.md; substitute {{PLAN_CONTENT}} only. Coach-original notes remain per item in the copied prompt and never appear in totals rows. (PO A4.)
  > - MCQ-2: "Copy AI Prompt" / "Copied." — "نسخ برومبت الذكاء الاصطناعي" / "تم النسخ."

### Cross-cutting

- **FR-020 — Authorization matrix.** Plan edit actions require current `coaching_work` in the plan's workspace; a Trainer, Workspace Owner or PO with that authorization may edit any client plan in the workspace, including one associated with another trainer; Sales may not. Workspace-template actions require current `coaching_work` in the owning workspace. Global-template create/manage and assignment are PO-only. Exports require an authorized actor and a published revision. Clients have no F17 surface. No role receives cross-workspace plan access. Workspace staff receive no cross-workspace template access. The PO-only authority to view and edit workspace templates across workspaces, and to promote an eligible workspace template into the global collection as a separate copy, is preserved (FR-012; S42-PO-8, architect mapping in the F17 decision matrix). Copying a workspace template into a different workspace is not authorized or specified by A2. These PO-only actions do not grant workspace staff cross-workspace access. Denials are generic and do not reveal existence, counts or distinctions. (PO A2, A6; pending F19 F19-FR-009; `lib/auth/capabilities.ts:22,36,43`.)
- **FR-021 — Idempotency, concurrency and audit.** Every mutating operation authorizes first, then accepts an opaque operation key, then applies compare-and-swap on the expected draft/template version. Exact replay returns the original committed result after current authorization is rechecked; changed arguments under the same key conflict. Concurrent operations cannot overwrite a newer draft, append duplicate revisions, duplicate template copies or duplicate assignment rows. Each successful mutation emits one audit event without plan content or PII. (Pending F19 F19-FR-010; F16 `app_private.operation_keys` pattern; PO A2.)
- **FR-022 — Schema versioning and size cap.** Plan and template documents carry a `schema_version` validated against a registry of immutable parsers; unknown versions fail closed; new versions are added by forward migration before use; retained versions remain renderable. A provisional document byte cap of 512 KB is carried only as an unvalidated historical figure and MUST be re-benchmarked before it becomes a requirement (SC-014); no final cap is fixed by this draft. (Historic F17 FR-014; Section B8.)
- **FR-023 — Exercise picker.** Exercises are added through F16's bounded, indexed AR/EN search with an explicit exercise selection; the picker excludes other workspaces' private exercises, never runs unbounded queries, and resolves fields through F16 FR-026. (F16 FR-004, F16 FR-026, F16 FR-030.)
- **FR-024: Bilingual, accessible UI.** All F17 screens use the Design System, Arabic-first RTL and English LTR, keyboard-accessible reorder/move controls (move up/down/to-day), loading/empty/error states, and the Frontend Design Gate evidence. Trainer-authored content is displayed as authored, never machine-translated. Any user-visible string not already approved byte-exact by the PO requires PO approval; existing approved strings are preserved byte-for-byte. (Constitution VIII; PO A2/A3/A4 and S43-PO-1.)
- **FR-025 — Cross-feature boundaries.** Client plan content is blocked at subscription expiry by F13/P4, and the expiry surface is P4/F13, not F17. Clients see published plans, not templates. F17 defines no delivery, activation, productivity, client portal, notification or subscription rule. F19-FR-007/015 and F13-FR-040/041 govern unlimited eligible publications and one point per new client; F13-FR-037 governs continuous subscription. Returning clients never count as new (S43-PO-5 item 7; architect mapping (S43-R8)); F17 does not fork those rules. (F13 FR-028; pending F19 F19-FR-011; F16 US6 note in §9.)
- **FR-026 — Out of scope.** Excluded: Hevy (deferred), AI-generated alternatives (out of scope), web set/rep logging and timers, bulk plan assignment, nutrition (F18), catalogs (F16), delivery/activation/client portal (pending F19/P4), check-ins and Telegram. (PRD-12; PO A4; `docs/03-roadmap.md:25-26`.)
- **FR-027 — Contributor attribution.** Every successful draft save and publication attributes the acting staff member. Each published revision exposes an immutable contributor set of the staff ids, action codes and timestamps of all staff who contributed since the previous revision; the set carries no plan content or PII. Historical attribution survives access revocation and trainer deletion. (PRD-06; historic F17 FR-004b; A6; pending F19 F19-FR-012.)

## 6. Key entities

Logical only; see `data-model.md`. WorkoutPlan (root = workspace + client; subscription only via delivery), WorkoutPlanDraft content, WorkoutPlanRevision content + `ExerciseSnapshotV2` values + contributor set, WorkoutTemplate (scope global or workspace) + immutable WorkoutTemplateVersion, TemplateAssignmentRun + TemplateAssignmentItem, WorkspaceTemplateDistributionState, WorkspaceTemplateCopy (provenance to origin global template/version, never live-linked), and the three F16 defaults on exercise entries. No duplicate Plan Core lifecycle/delivery table is defined.

## 7. Success criteria

- **SC-001 — Add-time defaults (A1).** In 100% of fresh additions, existing F16 defaults (Rest, RIR, Reps) appear in the ordinary editable fields; absent defaults leave blanks; a later library change alters zero existing entries; a fresh add after loading uses current defaults; loaded entries retain source values including the 0 RIR vs 1 RIR example.
- **SC-002 — No automatic distribution (A2).** A newly created workspace contains zero global templates; creating or versioning a global template creates zero copies; only an explicit PO Assign changes counts.
- **SC-003 — All Workspaces is one-time (A2).** With 10 global templates and workspaces Kendo (3 assigned), Alpha (10) and Beta (never assigned), one All Workspaces run leaves Kendo and Alpha byte-identical and gives Beta all 10; a repeat run changes nothing; a workspace created afterwards receives nothing; a global template added afterwards is received by nobody.
- **SC-004 — Specific Workspaces and partial state (A2).** Targeting a previously assigned workspace skips and reports each already-held template identity regardless of source version, creates only missing selected identities (0 duplicates, 0 overwrites of customized copies) and records the operation as intentional. In a batch creating at least one copy overall, each targeted workspace receiving none has `no_copies` in its receipt; reject before writes only when the total batch would create zero copies. A never-assigned workspace and an intentionally partial workspace are distinguishable in durable state 100% of the time.
- **SC-005 — Copy independence and promotion (A2).** In 100% of tested edits, a workspace copy edit changes neither the global template nor another workspace's copy; PO promotion creates a second independent copy and retains the original.
- **SC-006 — Publish without draft save (A3).** A plan never explicitly saved as a draft publishes in one `Ready & Publish`; Plan ID is unchanged across republish; each publish appends exactly one revision; with no current subscription or no submitted intake, zero revisions and zero deliveries are written; an unapproved client cannot create or edit a plan.
- **SC-007 — Volume arithmetic (A3).** Table-driven cases produce exact totals: primary muscle 1.0 and secondary 0.5 per working set, warm-up 0, with correct per-session and per-week sums, including rest-day-only and empty-session cases. Per-week assertions use program-day blocks 1?7, 8?14, and so on, include rest days in boundaries, and include a final partial block; no calendar date is required.
- **SC-008 — Export completeness and security (A4).** For every published revision, PDF and Excel contain 100% of the FR-018 field list; version N is exported while N+1 exists and matches N exactly; all successes and denials are audited with no content/PII; cells beginning `=`, `+`, `-`, `@` are stored as text and never execute as formulas.
- **SC-009 — Copy Prompt fidelity (A4).** The generated prompt contains 100% of the authorized content, all exercise/alternative details and resolved video URLs, includes a hyperlink-formatting request, and contains zero instructions to invent/replace exercises, alter values or generate alternatives. The Copy AI Prompt action label and Copied confirmation match the byte-exact S43-PO-1 MCQ-2 strings for the selected UI language; EN/AR goldens compare prompt bytes with contracts/copy-ai-prompt.md after {{PLAN_CONTENT}} substitution for both locales; the payload substitution is the only permitted difference.
- **SC-010 — Authorization and idempotency.** Foreign-workspace, Sales, client, unaffiliated and revoked-membership attempts are denied generically; 100 retries of create/save/publish/assign with one operation key create no duplicates; concurrent writes cannot overwrite a newer draft or duplicate an assignment.
- **SC-011: Snapshot and live Video (F16).** Global and applicable override versions/non-video values are captured when an exercise is added; private exercises pin their workspace-private version. Later library edits change zero existing draft entries; trainer edits to entry values are included at publication with the original source pins. Muscle membership is read from the pinned immutable source version. The next authorized read/export resolves current Video; no Video URL is stored in the plan revision.
- **SC-012 — Document integrity.** 1,000 randomized reorder/move/duplicate operations produce zero parameter corruption; ids are preserved for unchanged items and remapped for duplicates; reps and all three load variants round-trip exactly. Every attempted add or move to a rest day is rejected with `invalid_document` and leaves the document byte-identical to its pre-operation state; a rejected cross-day move leaves the item on its source day.
- **SC-013 — Bilingual, accessible, approved copy only.** AR/EN, light/dark, mobile/desktop, keyboard reorder and axe checks pass; no user-visible string is rendered that is not PO-approved byte-exact.
- **SC-014 — Performance (provisional, not a requirement).** The historical Worker CPU p95 ≤ 8 ms / max < 10 ms, DB/API p95 ≤ 300 ms and 512 KB figures are retained **only** as unvalidated provisional targets for a future benchmark; they MUST NOT be treated as accepted limits, and no new number may be invented. (Section B8.)
- **SC-015 — Contributor attribution.** After two staff edit a plan and one publishes, exactly one new revision exposes both staff with action codes and timestamps, no content/PII; trainer deletion leaves the contributor set and revision count unchanged.

## 8. Clarifications

S43-PO-4 (2026-11-10): 1. One continuous subscription per client. Upgrade/Renewal modify the existing subscription, never create overlapping subscriptions.
architect mapping (S43-R1): F13-FR-037 enforces one continuous subscription per client; F19 delivery binds to it, and renewal/upgrade update it in place.

S43-PO-4 (2026-11-10): 5. Trainer points: Award production points for NEW clients only, once per client. Upgrades, renewals, and additional published plans NEVER generate extra points.
architect mapping (S43-R1): One production unit per new client, once; upgrade, renewal, and additional publications award none. The Override unit is the client first. Returning clients never count as new (S43-PO-5 item 7; architect mapping (S43-R8); F13-FR-040/041).

S43-PO-4 (2026-11-10): 6. Plans: Both new and existing eligible clients can receive unlimited plan revisions/publications, subject to normal permissions. Upgrade/Renewal never require new plans. Do NOT tie publishing to additional trainer points.
architect mapping (S43-R1): Both new and existing eligible clients may receive unlimited plan revisions/publications under normal permissions; upgrade/renewal require no new plan; publishing never awards additional points.

### 8.1 Session 2026-11-10 (S42) — binding PO decisions, byte-exact

Source: `C:/Users/NEW LAP/.lifter/runs/s42-po/f17-f18-po-decisions-source.md`, Section A. The source snapshot SHA-256 recorded by the architect in S42-PO-7 is `7a6f5eca9c45f6fecdd20705ef701864f2a4ac526e93985dd3804957cb525dac` (architect mapping, not PO words). Section A is binding; Section B is not.

A1 (lines 25–31):

> **When the trainer adds a fresh exercise from the library to any plan draft**, populate the plan's **ordinary editable prescription fields** with whatever current F16 library defaults exist for that exercise (not a second set of separate default fields). If a default is absent, leave that corresponding field blank for the trainer to complete. Values are copied **at add time**, never live-linked back to library defaults.

> Applies both to a blank `Create New Plan` workflow and to a **new exercise inserted after loading** a template or another plan. It does **not** re-default already-copied exercises.

> **When loading/copying an immutable workout template or a published client plan**, preserve the source's actual edited workout contents, set prescription values, exercise/day notes, alternatives and other relevant parameters; **do not substitute library defaults**. A new destination plan is independently editable, and later source edits cannot alter it.

architect mapping (S43-R9 Sol-3): The cited PO phrase remains unchanged. Entry-level Rest/RIR/Reps/Notes/Alternatives are stored on the plan exercise item independently of set rows; set rows carry type/load. Copying preserves both the entry prescriptions and the set rows.

<!-- prettier-ignore -->
> Example: Library DB Bench Press may have a default of 1 RIR, while a particular template has 0 RIR; importing that template preserves its **0 RIR**. Adding a *new* DB Bench Press item later uses the current library default.

> **Do not invent a default number-of-sets or warm-up/working-set field in F16**: the final F16 approved eight exercise fields must be respected. Surface any remaining plan-entry initialization ambiguity as an MCQ instead of extending the catalog silently.

A2 (lines 33–42):

> **Only Platform Owner (PO)** can create/manage the canonical **Global Workout Templates**.

> **Every new workspace starts with no global templates distributed to it.** This replaces the earlier proposed opt-in seeding during workspace creation. There is **no automatic sync/distribution** when a workspace is created or a global template is added.

> The PO later uses `Global Templates → Assign`. Step 1 offers **All Templates**, **Specific Templates**, or **All Templates Exclude** (select all except chosen ones). Step 2 offers **All Workspaces** or **Specific Workspaces**.

<!-- prettier-ignore -->
> **All Workspaces is a one-time distribution to workspaces that have *never received a global-template assignment/library*.** If workspace Kendo previously received 3 templates intentionally and Alpha received 10, running All Workspaces **skips both**. It does **not** fill Kendo's remaining missing templates. It affects existing workspaces at the time of the manual operation; not future workspaces.

> **Specific Workspaces** permits intentionally returning to previously assigned workspaces and assigning selected templates, without duplicating existing ones or overwriting customizations. The implementation must distinguish intentional partial assignment from an uninitialized workspace.

> Assigned global templates become **independent, workspace-owned, workspace-branded copies** (e.g., `Kendo Templates`). Authorized workspace owners/trainers can modify their copies and create entirely new templates/splits; no edit propagates back to the global library or other workspaces.

> PO retains **full visibility and management rights across workspaces**: view, edit and copy any workspace's templates; copy/promote an eligible workspace template into PO's global collection as a **separate copy**, retaining the original. Avoid moving private client data or workspace-private references into global copies.

> No silent reassignment overwrite, no implicit top-up and no live-linked workspace copies.

A3 (lines 44–48):

> **Save as Draft is not a prerequisite** for publishing. Autosave is ongoing; `Save as Draft` is an optional explicit reassurance action. Staff may finish in one sitting and use the single `Ready & Publish` action directly with their latest valid changes.

> Preserve stable Plan ID, private draft and immutable published revision principles from F19.

> **Workout volume calculation approved:** count working sets only, each primary muscle gets **1.0** per working set, each secondary muscle gets **0.5**, warm-up sets count **0**; report per session and per week.

A4 (lines 50–55):

> Keep **PDF and Excel exports**, with **complete usable training instructions**: days/rest days, exercise names, ordered warm-up/working sets, reps/ranges, prescribed load and units/modes, rest, RIR, notes, trainer-selected alternatives and applicable exercise/alternative video links. The exported plan must be usable for training **without accessing the platform UI** (online video links still naturally need internet access).

> Add a **third option**: `Copy Prompt for AI`. Generate a professional, copyable prompt containing the **complete authorized plan content**, all relevant exercise/alternative details and video URLs, asking a separate AI tool to format exercise names and approved alternatives as clickable hyperlinks to those URLs when possible. The prompt must **not** ask AI to invent/replace exercises, alter programming values, or generate alternatives.

architect mapping (S43-R1): The Copy AI Prompt label supersedes the historical `Copy Prompt for AI` label.

> PDF should include coach-entered alternatives as well. **Hevy integration remains deferred**; **AI-generated alternatives remain out of scope**.

> Preserve export security, authorized revision selection, historical snapshot integrity, audit and spreadsheet formula-injection protection.

### 8.2 Contextual approved decisions (not F17 PO decisions)

- **F19 S42-PO-2..6** (`runs/s42-po/s42-po-1.verbatim.txt`): Ready & Publish is delivery for a client with a current subscription; publish without a current subscription is refused ("C: Block publishing"); renewal extends the existing subscription; no additional new-client unit; PO Override for eligible initial subscriptions only; editor roles Trainer/WO/PO; copy source = latest published revision or immutable template version. These are consumed by reference from the pending F19 PR, not duplicated here.
- **A6 shared context**: unlimited separate plans; all delivered plans visible; first workout and nutrition deliveries independent; any authorized Trainer/WO/PO may edit plans in the workspace; trainer deletion preserves plans/revisions/audit; client content blocked at expiry. F17 consumes these through F19/F13/P4.
- **A7 environment**: LIFTER is not production-deployed; local Docker/Supabase with synthetic data only; historic `OWNER=` labels are not authoritative. This draft therefore contains no agent/model names and no production-data migration design.

### 8.3 Architect mappings kept separate from PO words

- "All Workspaces" eligibility for a workspace that only has self-created templates is read from the literal words "never received a global-template assignment/library" and is therefore encoded as FR-011 case (c). This is an architect literal reading of PO text, not a new PO decision; S42-PO-8 separately decides zero-copy Assign: reject it.
- The default copy scope (Rest/RIR/Reps only) follows F16's statement that defaults consist exactly of those three fields (`specs/016-exercise-food-catalogs/spec.md:154`); S42-PO-8 decides that editable Notes/Alternatives are copied on add (F17-MCQ-2=B).
- Reusing any historic F17 code, table name or task id is out of scope. Historic evidence is reference only.

### 8.4 Resolved ambiguities (record)

- Plan root no longer binds `subscription_id`; binding is by delivery (pending F19 F19-FR-002). Old `FR-001` text superseded.
- `variation` / `ExerciseSnapshotV1` replaced by F16 V2 effective resolution and `ExerciseSnapshotV2`; Video live.
- Global-template reads are no longer "every workspace via `can_read_global_coaching_content()`"; distribution is explicit PO assignment of independent copies. That helper is historic F16 plan wording and is not an F17 requirement.
- Exports are no longer PDF/Excel only; `Copy AI Prompt` is a third option.
- Volume 0.5 secondary credit is direct PO (A3); the old "approved fraction" placeholder is closed.
- "Each exercise carries editable warm-up/working sets ... defaults" in old FR-005 is closed by F16's eight fields and PO A1; set-row initialization is resolved as zero rows on add, not a catalog field.

### 8.5 Clarifications / PO-decision register

**Resolved MCQs**

- F17-MCQ-1 — S42-PO-8: “New exercises start with zero working/warm-up sets.” architect mapping (S42 matrix): option C, zero set rows until staff add them.
- F17-MCQ-2 — S42-PO-8: “copy editable Notes/Alternatives.” architect mapping (S42 matrix): option B, copy those fields on add.
- F17-MCQ-3 — S42-PO-8: “reject zero-copy Assign.” architect mapping (S42 matrix): option C, reject before writes.
- F17-MCQ-4 resolved — S43-PO-1 (2026-11-10) PO words:

> - MCQ-1: Skip existing global templates; no duplicates or overwrites. Report skipped items.

architect mapping (S43-R1): Skip any target that already holds a copy, regardless of source version; never duplicate, overwrite, or update it; report each skipped workspace/template pair.

- F17-MCQ-5 — S42-PO-8: “Preserve workspace-private exercises. Allow Global template promotion; flag unresolved exercises RED and block plan loading until fixed.” architect mapping (S42 matrix): promotion is allowed; unresolved references are RED and block loading.
- F17-MCQ-6 — S42-PO-8: “Copy Prompt: PO/WO/Trainer.” architect mapping (S42 matrix): actors authorized to export may use the prompt.
- F17-MCQ-7 resolved — S43-PO-1 (2026-11-10) PO words:

> - MCQ-2: "Copy AI Prompt" / "Copied." — "نسخ برومبت الذكاء الاصطناعي" / "تم النسخ."

architect mapping (S43-R1): Exact action/confirmation strings per UI language.

S43-PO-5 (2026-11-10): F17: Week 1 = program days 1–7, including rest days; no calendar start required.

architect mapping (S43-R6): Program-day blocks need no calendar start date.

- F17-MCQ-8 — S42-PO-8: “Exports: UI-language labels, original text preserved, exercise names English.” architect mapping (S42 matrix): use UI-language labels, preserve authored text, exercise names English.
- F17-MCQ-9 resolved — S43-PO-1 (2026-11-10) PO words:

> - MCQ-5: Consecutive 7-calendar-day weeks from program start, including rest days.

architect mapping (S43-R6): Program days 1?7, 8?14, etc.; rest days included; final partial block is a week; no calendar start is required.

### 8.6 PO-decision register

S43-PO-5 (2026-11-10): F17: Week 1 = program days 1–7, including rest days; no calendar start required.

architect mapping (S43-R6): Week 1 is program days 1–7 including rest days; blocks are 1–7, 8–14, and so on; the final partial block is a week. No calendar start date is required.

S43-PO-5 (2026-11-10): Approve all four EN/AR AI prompt drafts, removing “certified coach” and using “كابتن” consistently in Arabic. Coach-original notes appear per item and in copied prompts, never totals.

architect mapping (S43-R6): Approved EN/AR prompt bodies are copied byte-exact into feature-local contracts; substitute {{PLAN_CONTENT}} only. Coach-original notes stay per item and never in totals rows.

S44-PO-2 (2026-11-10): S44-MCQ-1="A: Yes, per-workspace (Recommended)"
architect mapping (S44-R2): In a Specific Workspaces Assign that creates at least one copy overall, a targeted workspace receiving none returns per-workspace `no_copies` and the batch commits; reject before writes only when total copies = 0 (S42-PO-8 zero-copy rejection unchanged).

S44-PO-2 (2026-11-10): S44-MCQ-2="A: When added (Recommended)"
architect mapping (S44-R2): At add, pin the effective source version(s) and copy non-video values into the editable entry; publication freezes the entry values as currently edited, with those original pins. Later catalog/override edits do not alter the draft or snapshot.

S44-MCQ-1 and S44-MCQ-2 are resolved by S44-PO-2 as mapped by S44-R2. All earlier F17 PO decisions remain resolved. S44-MCQ-F17-1 is resolved by S44-PO-11 as mapped by S44-R10: rest days contain no exercise items; adding or moving an item to one is rejected with no writes, and a rejected move keeps the item on its source day. No open ambiguities remain in the current F17 spec scope.

### 8.7 Resolved decision — rest-day exercise items

**S44-MCQ-F17-1 · Feature:** F17 Workout Planner · **Where:** `contracts/workout-plan-document.md` §1 and §2; `spec.md` A3-7 and A3-9 and FR-002.

**S44-PO-11 (2026-11-10): A: Reject the move (Recommended)**

architect mapping (S44-R10): F17: moving (or adding) an exercise item onto a rest day is rejected with no writes; the item stays on its source day; rest days never hold exercise items.

The move/add rejection uses the existing generic `invalid_document` error. A failed operation makes no document write; a rejected move leaves the item on its source day.

### 8.8 Gate statement

S43-MCQ-A/C, S44-MCQ-1/2, and S44-MCQ-F17-1 are resolved by the cited PO decisions and architect mappings. No open MCQs remain in this feature scope. All unrelated spec corrections in this fix are within settled scope.

## 9. Cross-feature supersessions and notes

| Source                                                                                  | Relationship                                                                          | Resolution                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specs/017-workout-planner/spec.md` on `origin/sk-017` FR-001 / Key Entities (:75, :98) | Old plan root carried `subscription_id`                                               | Superseded: root = workspace + client; subscription bound only by delivery (pending F19 F19-FR-002).                                                                                                                              |
| same FR-005 (:83)                                                                       | "editable warm-up/working sets ... defaults"                                          | Superseded by F16 eight fields + PO A1; set-row initialization = zero rows (S42-PO-8).                                                                                                                                            |
| same FR-006 (:84) and FR-012 (:90)                                                      | Global templates readable by every workspace via `can_read_global_coaching_content()` | Superseded by PO A2: no automatic distribution; PO-only manual Assign; independent copies. The helper is not an F17 requirement.                                                                                                  |
| same FR-003 (:78)                                                                       | `variation` reference and `ExerciseSnapshotV1`                                        | Superseded by F16 FR-003/FR-026/FR-027 and `ExerciseSnapshotV2`; Video live.                                                                                                                                                      |
| same FR-011 (:89)                                                                       | PDF + Excel only                                                                      | Extended by PO A4: PDF + Excel + `Copy AI Prompt`; audit/formula-injection rules retained.                                                                                                                                        |
| same FR-007 (:85)                                                                       | Publish requires submitted intake (D17-5=A)                                           | Retained. Adds pending F19 current-subscription gate (S42-PO-4), no published-but-undelivered state.                                                                                                                              |
| same SC-005 (:106)                                                                      | Worker CPU 8/10 ms, 512 KB, 350 MB                                                    | Provisional only; re-benchmark (SC-014); no invented numbers.                                                                                                                                                                     |
| `docs/03-roadmap.md:64-65`                                                              | Reserved F17/F18 migration ranges `20261107*`, `20261108*`                            | Treated as obsolete; this draft reserves no migration version. Allocation happens at implementation against the highest version across all refs.                                                                                  |
| `specs/016-exercise-food-catalogs/spec.md:74` (US6 "client viewing a global template")  | Says a client views a global template                                                 | Cross-feature note, not an F17 rule: clients see published plans, not templates (PO A2). F16's US6 is a video-resolution scenario and its "global template" wording is ambiguous against A2; F16 is left unchanged by this draft. |
| `specs/013-freeze-renewal-refunds/spec.md:146,170,211`                                  | Expiry/P4 boundaries                                                                  | Consumed unchanged: F17 defines no exemption; P4 blocks plan content at expiry.                                                                                                                                                   |
| `specs/016-exercise-food-catalogs/spec.md:141`                                          | Global-template authoring resolves canonical-only                                     | Adopted: FR-003.                                                                                                                                                                                                                  |

Full analysis with file:line evidence: `research/conflicts.md`.

## 10. Out of scope

Nutrition (F18); catalogs (F16); Plan Core delivery/activation/productivity/client projection (pending F19/P4); client plan viewing, client export, expiry/overdue enforcement and notices (P4/F13); check-ins and mobile logging (P5); Telegram (P6); Hevy (deferred); AI-generated alternatives (excluded); bulk plan assignment, bulk client actions, web set/rep logging and timers (PRD-12).

## 11. Constitution check

- **I Strict workspace isolation**: every tenant entity carries `workspace_id` with composite keys; two walls; foreign-workspace negative tests in SC-010. PASS (design intent; implementation unproven).
- **II Immutable financial truth**: n/a (no money). PASS.
- **III PO governance and least privilege**: global templates and assignment PO-only; role matrix explicit; unlisted rights denied. PASS.
- **IV Approved scope only**: traced to PRD-04/12 and D17-1..D17-9 plus PO A1–A4; Excluded list explicit; historic assumptions not imported. PASS.
- **V Versioned, non-retroactive content**: immutable template and plan revisions; `ExerciseSnapshotV2`; live Video only. PASS.
- **VI Human-governed people decisions**: n/a (no people decisions in F17). PASS.
- **VII Privacy and health-data protection**: no plan content in logs/audit; exports audited; synthetic data only. PASS.
- **VIII Bilingual, accessible UI**: AR/EN, RTL, keyboard, Design Gate; no unapproved strings (MCQ-7/8). PASS with copy gate open.
- **IX Reliable, idempotent operations**: operation keys, CAS, idempotent assignment. PASS (design intent).
- **Workflow gate**: The original nine F17 MCQs, S44-MCQ-1/2, and S44-MCQ-F17-1 are resolved by cited PO words or architect mappings. No open ambiguities remain in the current F17 spec scope. Analyze is dated after the last spec/plan/tasks edit and must show zero open CRITICAL/HIGH findings. See `checklists/analyze.md`.

## 12. Draft boundary

This artifact set is documentation only. It creates no schema, migration, endpoint, UI, test or workflow. No migration version is reserved. Any historic branch code is reference only and is not cherry-picked. Implementation requires: PO answers to the MCQs that block the touched scope, a completed plan/tasks review, and a current Analyze with zero open CRITICAL/HIGH findings.
