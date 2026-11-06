# F16 decision register

This register preserves prior records and points to later decisions. An entry marked superseded remains in the historical record; it is not deleted or silently rewritten.

## Supersession history

| Record | Historical decision | Status | Superseding authority |
| --- | --- | --- | --- |
| S35-PO-1 | F16 manual distribution decision; retain original S35 record verbatim in its source location. | **Superseded**; history retained. | S35-PO-3 F16 REDESIGN paragraph, quoted in `spec.md` Clarifications. |
| S35-PO-2 | F16 manual distribution decision; retain original S35 record verbatim in its source location. | **Superseded**; history retained. | S35-PO-3 F16 REDESIGN paragraph, quoted in `spec.md` Clarifications. |
| PR #64, commit `c4543a1`, “independent workspace copies” | Independent workspace catalog copies. | **Superseded**; do not edit its branch or delete its record. | S35-PO-3 F16 REDESIGN paragraph; one global catalog with per-workspace overrides. |
| S35-PO-3 | One shared global exercise catalog with workspace-specific editable overrides and client-workspace video resolution. | **Current binding decision** for the stated scope. | Original source: `C:/Users/NEW LAP/.lifter/runs/s35-ledger3/s35-po-3.verbatim.txt`. |
| S36-PO-2 (F16 paragraph) | Answers F16-MCQ-1, -3, -4, -5 and -6; F16-MCQ-2 and -7 become moot; no client transfers between workspaces. F16-MCQ-8 and -10 are re-framed in round 3 as -F and -G; -9 stays open; -A to -E, -H and -I are added in round 3 (see the round-3 section at the end). | **Current binding decision** for the answered items. | Verbatim paragraph in `## S36-PO-2 F16 answers` below; source `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-2.verbatim.txt`. |

## F16 MCQ status after S36-PO-2

Items F16-MCQ-1 through -7 are answered or moot as recorded in `## S36-PO-2 F16 answers`. Their original question, options, implications and recommendation text is kept unchanged as history. Round 3 (critique response): F16-MCQ-8 is re-framed as **F16-MCQ-F**, and F16-MCQ-10 as **F16-MCQ-G**; F16-MCQ-9 stays open and is not marked answered; new items F16-MCQ-A, -B, -C, -D, -E, -H and -I are **PO-DECISION-NEEDED** (see `## Round 3 PO-DECISION-NEEDED items`). Recommendations are advisory only; none is a decision. Requirements, defaults, contracts and test expectations must not choose an unanswered option.

### F16-MCQ-1 — New-workspace video mapping creation — ANSWERED (S36-PO-2)

- **Status (S36-PO-2):** answered, option (a): new workspaces resolve virtually to the global video with no mapping row.

- **Question:** What does “automatically get their own video mapping” mean when a workspace is created?
- **Options:** (a) Resolve virtually to the global video until the workspace edits, with no mapping row; (b) create a workspace mapping row at workspace creation, initialized from the global video; (c) create a workspace mapping row on first view, initialized from the global video.
- **Implications:** (a) avoids stored rows but means “own mapping” is virtual; (b) is explicit and requires workspace provisioning work and a defined initial-row value; (c) defers writes to reads and requires race/idempotency behavior.
- **Recommendation:** (b), because it most directly implements automatic per-workspace mapping; this is not a decision.
- **Blocked:** Exact creation timing, initial value, write path, provisioning failure handling, row-count semantics and corresponding tests.

### F16-MCQ-2 — Relationship to “no seeded catalog content” — MOOT (S36-PO-2)

- **Status (S36-PO-2):** moot. No automatic mapping rows exist, so FR-019 is unchanged and no mapping-as-content exception is needed.

- **Question:** Does an automatically created video mapping count as seeded catalog content under FR-019?
- **Options:** (a) No; a mapping row is configuration, not catalog content; (b) yes; use virtual fallback with no row until an explicit edit.
- **Implications:** (a) requires a narrowly defined exception to FR-019 and mapping provisioning; (b) keeps FR-019 literal and cannot also require a persisted mapping at workspace creation.
- **Recommendation:** (a), consistent with distinguishing metadata from exercise content; this is not a decision.
- **Blocked:** Reconciliation of FR-019, provisioning/data-model language, and tests for new workspaces.

### F16-MCQ-3 — Non-video override values in published plans — ANSWERED (S36-PO-2)

- **Status (S36-PO-2):** answered. Published plans freeze exercise names and instructions at publication; video is resolved live. The architect mapping labels this as option (c), but the register text of option (c) (“snapshot names but resolve instructions live”) does not match the PO words. The binding requirement is the PO words; the option label is flagged for architect confirmation in `## S36-PO-2 F16 answers`.

- **Question:** How do overridden names and instructions appear in already-published plans?
- **Options:** (a) Snapshot all displayed override values at publication; (b) resolve them live like video; (c) snapshot names but resolve instructions live.
- **Implications:** (a) preserves historical presentation but requires snapshot fields; (b) reflects edits in existing plans and changes historical presentation; (c) mixes snapshot and live resolution and requires separate versioning rules.
- **Recommendation:** (a), aligned with preserving historical plans; this is not a decision.
- **Blocked:** Snapshot contract, historical-plan rendering rules, override version retention and acceptance tests for post-publication edits.

### F16-MCQ-4 — Alternatives override semantics — ANSWERED (S36-PO-2)

- **Status (S36-PO-2):** answered, option (c): a workspace alternatives override replaces the global list and may reference workspace-private exercises. Client-view presentation of such references is open as F16-MCQ-10.

- **Question:** How does a workspace alternatives override relate to canonical global alternatives?
- **Options:** (a) Replace the global list; (b) add to the global list; (c) replace the global list and permit references to workspace-private exercises.
- **Implications:** (a) suppresses canonical alternatives in that workspace; (b) requires merge/order/deduplication semantics; (c) also requires private exercise references and privacy-safe lifecycle behavior.
- **Recommendation:** (a), because it keeps the workspace override self-contained; this is not a decision.
- **Blocked:** Override storage shape, list resolution, validation, editor behavior and alternative-list tests.

### F16-MCQ-5 — PO authority over canonical original — ANSWERED (S36-PO-2)

- **Status (S36-PO-2):** answered, option (a): canonical global exercises are edited only in the explicit global admin scope; PO edits made in a personal workspace write only that workspace's override.

- **Question:** Can the PO still edit the canonical global original through an explicitly global-scope action, while edits made in the PO's personal workspace affect only that workspace override?
- **Options:** (a) Yes; global-scope canonical edits remain available, while personal-workspace edits write only that workspace override; (b) no; canonical content is frozen after creation.
- **Implications:** (a) retains the existing PO-only global governance path and requires scope-explicit routing; (b) removes canonical edit capability and changes existing version/governance behavior.
- **Recommendation:** Ask the PO to explicitly confirm whether the existing global edit path survives this redesign; do not infer continued authority from the historical task or earlier requirements. This is not a selected option.
- **Blocked:** Whether the global canonical edit path remains available, scope selection/routing, and tests proving personal-workspace edits cannot mutate canonical content.

### F16-MCQ-6 — Video after removing a workspace override — ANSWERED (S36-PO-2)

- **Status (S36-PO-2):** answered, option (a): removing a workspace video restores the global video fallback.

- **Question:** What video resolves after a workspace video override is removed?
- **Options:** (a) Fall back to the global video; (b) return no video.
- **Implications:** (a) maintains an available fallback and requires removal to mean “clear override”; (b) treats removal as an intentional suppression and requires a distinct empty result.
- **Recommendation:** (a), consistent with the global fallback rule; this is not a decision.
- **Blocked:** Remove semantics, resolver state model, client-view result and removal tests.

### F16-MCQ-7 — Workspace chosen for video when scopes disagree — MOOT (S36-PO-2)

- **Status (S36-PO-2):** moot. S36-PO-2 states that no client transfers between workspaces; a departing client registers a new account elsewhere. The client workspace therefore equals the plan workspace, and video resolution uses the client workspace. Requirement recorded as FR-022.

- **Question:** Which workspace determines exercise video resolution when plan, client and template workspaces differ?
- **Options:** (a) The plan's owning workspace; (b) the client's current workspace.
- **Implications:** (a) anchors video to plan ownership and may differ from the current client workspace; (b) follows current client tenancy and may change which override an existing plan view displays.
- **Recommendation:** (b), consistent with S35-PO-3's explicit “CLIENT workspace” wording; this is not a decision.
- **Blocked:** Resolver input/source of truth, plan/client join, authorization check and cross-workspace negative tests.

### PO-DECISION-NEEDED F16-MCQ-8 — Localization requirements for workspace name overrides (re-framed as F16-MCQ-F in round 3; original text retained below)

- **Status (S36-PO-2):** not answered by S36-PO-2. Remains PO-DECISION-NEEDED.

- **Question:** Must a workspace name override provide both Arabic and English values, or may it override one language while inheriting the other canonical value?
- **Options:** (a) Require both localized values whenever name is overridden; (b) allow either/both localized values and inherit a missing language from the canonical global version.
- **Implications:** (a) keeps each workspace override self-contained but requires both translations for every name edit; (b) reduces entry burden but means one displayed exercise name can combine canonical and workspace-versioned values.
- **Recommendation:** (b), because it allows partial localization without changing the global record; this is not a decision.
- **Blocked:** Override payload validation, AR/EN editor requirements, fallback/read precedence and bilingual acceptance tests.

### PO-DECISION-NEEDED F16-MCQ-9 — Client video for workspace-private Trainer exercises (open; kept open in round 3, not marked answered)

- **Status (S36-PO-2):** not answered by S36-PO-2. S36-PO-2 says published plans’ videos update live and that workspace alternatives may include private exercises; neither statement chooses whether a private exercise’s video is resolved or omitted in the client view. Remains PO-DECISION-NEEDED.

- **Question:** When a valid published client plan references a Trainer-created workspace-private exercise, should the client-plan projection resolve that exercise's video for the plan's own workspace, or omit its video?
- **Options:** (a) Resolve the current video through the same client/plan-authorized projection, scoped to the persisted plan/client workspace; (b) omit the workspace-private exercise video from the client view while preserving the otherwise-authorized plan.
- **Implications:** (a) lets the assigned client see workspace-specific exercise media and requires a narrowly scoped path for workspace-private rows; (b) keeps client video projection limited to global identities but leaves the assigned plan without that exercise's media. Neither option grants direct catalog/table/search access or cross-workspace visibility.
- **Recommendation:** (a), because the client already has authorized access to the published plan in that workspace; this is advisory and does not select an answer.
- **Blocked:** Whether private exercise media is resolved or omitted for clients, the client projection's eligible identity scope, and corresponding positive/negative plan-view tests. A valid plan must not be denied solely because it references a workspace-private exercise.

### PO-DECISION-NEEDED F16-MCQ-10 — Client-plan presentation of workspace-private alternatives (re-framed as F16-MCQ-G in round 3; original text retained below)

- **Status (S36-PO-2):** new question. The S36-PO-2 answer to F16-MCQ-4 (option c) lets a workspace alternatives override reference workspace-private exercises. S36-PO-2 does not say how a client's plan view presents such an alternative.
- **Question:** When a valid published client plan shows an exercise whose alternatives include a workspace-private exercise, should the client view show that alternative, or omit it while keeping the otherwise-authorized plan?
- **Options:** (a) Omit alternatives that reference workspace-private exercises from the client view; the plan stays viewable. (b) Show them through the same narrow client/plan projection as F16-MCQ-9 option (a), limited to the persisted plan/client workspace.
- **Implications:** (a) keeps private exercise identities out of client views and needs a generic omission state; (b) exposes a private exercise's name and media to the assigned client and needs the same narrow projection path as F16-MCQ-9. Neither option grants catalog, table or search access.
- **Recommendation:** (a), because it keeps private identities out of client views; this is advisory and not a decision.
- **Blocked:** Client-view alternative projection, its omission or display state, and positive/negative plan-view tests. A valid plan must not be denied solely because it references a workspace-private alternative.

## S36-PO-2 F16 answers

PO source: `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-2.verbatim.txt`, F16 paragraph, quoted byte-for-byte as UTF-8:

> F16: New workspaces use global video fallback; no automatic mapping rows. Published plans freeze exercise names/instructions, but videos update live. Workspace alternatives replace global ones and may include private exercises. PO edits canonical exercises only in global admin; personal-workspace edits stay local. Removing a workspace video restores global fallback. No client transfers between workspaces; departing clients register new accounts elsewhere. Preserve history.

Architect mapping (`C:/Users/NEW LAP/.lifter/runs/s36-po/s36-architect-rulings-2.md`) is recorded here as architect words applied to the verbatim paragraph, not as independent PO decisions:

| MCQ | Status | Recorded answer | Applied in |
| --- | --- | --- | --- |
| F16-MCQ-1 | Answered, option (a) | New workspaces use the global video fallback; no automatic mapping rows. | FR-014, SC-012, spec US2 scenario 5, data-model `exercise_overrides` |
| F16-MCQ-2 | Moot | No mapping rows exist, so FR-019 (no seeded content) is unchanged. | FR-019 untouched |
| F16-MCQ-3 | Answered (label flagged) | Published plans freeze exercise names and instructions at publication; video is resolved live. | FR-020, SC-011, spec US6 |
| F16-MCQ-4 | Answered, option (c) | A workspace alternatives override replaces the global list and may reference workspace-private exercises. | FR-003, data-model `exercise_overrides` |
| F16-MCQ-5 | Answered, option (a) | Canonical global exercises are edited only in the explicit global admin scope; personal-workspace PO edits write only that workspace override. | FR-002, FR-014, FR-018, SC-001, SC-008 |
| F16-MCQ-6 | Answered, option (a) | Removing a workspace video restores the global video fallback. | FR-014, contracts override remove/clear |
| F16-MCQ-7 | Moot | No client transfers between workspaces (below); client workspace equals plan workspace. | FR-022 |
| F16-MCQ-8 (now F16-MCQ-F) | Open | — | FR-003, FR-026, T037, T040, T044, T056 |
| F16-MCQ-9 | Open (kept open in round 3) | — | FR-014, FR-024, T045, T050, T058 |
| F16-MCQ-10 (now F16-MCQ-G) | Open | — | FR-025, FR-027, T048, T058 |

**Label note for architect (F16-MCQ-3):** the architect mapping labels the answer as option (c). The register text of option (c) reads “snapshot names but resolve instructions live”, which contradicts the PO words (names and instructions frozen; videos live) and matches no option exactly. This record binds the PO words. The architect is asked to confirm the label; no implementation may depend on the label alone.

**Requirement recorded (history preserved):** no client transfers between workspaces. A departing client registers a new account elsewhere. This answers the question that F16-MCQ-7 asked; the original MCQ-7 text above is retained unchanged. Recorded as FR-022 in `spec.md`.

**Independent critique (blocker):** Sonnet 5.5 critiques are authorized for F16 by S36-PO-2. The constitution (Sol Medium mandate, S30-PO-8 Q15) conflicts with that substitution. The conflict is reported to the PO. Until the PO resolves it, implementation is blocked and feature acceptance records the conflict.

## Round 3 PO-DECISION-NEEDED items

Source of the list: independent critique `C:/Users/NEW LAP/.lifter/runs/s36-sonnet-f16-critique/critique.md` (F6, F11, F12, F21 and consolidated MCQs), plus items added by the round-3 review (F16-MCQ-I, FYI-1 to FYI-3). Each item lists the question, options (2 to 4) with implications, an advisory recommendation that is **not a decision**, and what is blocked. No option is selected in this record. Task IDs refer to `tasks.md`.

### PO-DECISION-NEEDED F16-MCQ-A — How an overridden field is reset

- **Feature / where found:** 016 · `spec.md` FR-003 (line 101) and FR-014 (line 112); `data-model.md` line 23; `contracts/catalog-api.md` planned row "Workspace override remove/clear" (line 28); critique F6.
- **Question:** How does a workspace return one overridden field (for example its video) to the canonical value while keeping its other overrides?
- **Options:** (a) per-field reset: name, description, instructions, video and alternatives can each be cleared independently; the override row stays. (b) Only video can be cleared individually; any other field is reset only by removing the whole override. (c) Whole-override removal only.
- **Implications:** (a) finest control; needs a per-field "inherit" representation (null) and a per-field remove contract. (b) simpler UI, but a trainer cannot revert only a name. (c) removing a bad video also removes a good name, which conflicts with the S36-PO-2 video-removal rule in spirit.
- **Advisory recommendation (not a decision):** (a).
- **Blocked:** T046 (null semantics), T047 (remove/clear contract), T040 (reset UI), T037 (reset assertions).

### PO-DECISION-NEEDED F16-MCQ-B — Empty alternatives list

- **Feature / where found:** 016 · `spec.md` FR-025 (line 125); `data-model.md` line 24; `plan.md` line 36; critique F6.
- **Question:** May a workspace save an empty alternatives list to suppress the canonical alternatives?
- **Options:** (a) Yes: an empty list means no alternatives (replace semantics). (b) No: an empty list is rejected; the only way back to canonical is a reset (see F16-MCQ-A).
- **Implications:** (a) follows the literal word "replace" but lets a trainer hide all alternatives silently. (b) prevents accidental suppression and depends on a reset path.
- **Advisory recommendation (not a decision):** (a).
- **Blocked:** T048 (validation), T047 (empty-list write), T040 (empty state), T037 (alternatives assertions).

### PO-DECISION-NEEDED F16-MCQ-C — Legacy variation `note` text

- **Feature / where found:** 016 · `data-model.md` line 26; `plan.md` line 71; `tasks.md` T062; main `supabase/migrations/20261106112000_catalog_variation_operations.sql` (note, at most 2000 characters, lines 49-52, 75).
- **Question:** What happens to existing variation notes, which the five-field override allowlist does not contain?
- **Options:** (a) Keep legacy tables read-only as history; notes are not shown in the redesigned UI. (b) Migrate each note into that workspace's override `instructions`. (c) Migrate each note into the override `description`. (d) Inventory first: if the deployed database holds no variation rows the question is moot; otherwise choose (a), (b) or (c).
- **Implications:** (a) no database data loss, but trainers lose a visible note. (b) and (c) reclassify internal free text as client-visible content. (d) needs an inventory of the deployed database, which this repository cannot show.
- **Advisory recommendation (not a decision):** (d) first; otherwise (a).
- **Blocked:** T062 (note backfill); T047 (note payload); the data steps of T053.

### PO-DECISION-NEEDED F16-MCQ-D — Re-registration of a departing client

- **Feature / where found:** 016 · `spec.md` FR-022 (line 121) and edge case (line 93); main `supabase/migrations/20261031121000_client_accounts_model.sql` lines 68-69 (`email_normalized` and `phone_e164` are globally unique); D-08 in `docs/01-traceability.md` line 19; critique F11.
- **Question:** The S36-PO-2 words say departing clients register new accounts in another workspace. Global e-mail and phone uniqueness (D-08) and preserved history prevent reuse of the same identifiers. How should re-registration work?
- **Options:** (a) Use a different e-mail and phone (D-08 unchanged); departing clients are told so. (b) Release the departed record's identifiers (anonymize or tombstone) so they can register again; history keeps a pseudonymous record. (c) PO-mediated manual re-registration. (d) Per-workspace unique identifiers, which requires a D-08 amendment.
- **Implications:** (a) cheapest, no schema change. (b) and (d) change D-08, the F11/F12 uniqueness rules and privacy. (c) adds manual PO work.
- **Advisory recommendation (not a decision):** (a) for F16; escalate (b) as a separate F11/F12 decision if identical identifiers are wanted.
- **Blocked:** Nothing in F16 (FR-022 is narrowed). Cross-feature F11/F12 only.

### PO-DECISION-NEEDED F16-MCQ-E — PO write reach on overrides

- **Feature / where found:** 016 · `spec.md` FR-030 (line 130) and FR-014 (line 112); `contracts/catalog-api.md` planned rows (lines 27 and 29); main `supabase/migrations/20261027120000_tenancy.sql` lines 65-75 (`has_workspace_access` returns true for the platform owner in every workspace); critique F12.
- **Question:** In which workspaces may the PO write workspace overrides and workspace-private exercises?
- **Options:** (a) Any workspace (the current legacy variation behaviour; useful for support). (b) Only workspaces where the PO holds an active membership. (c) Only a designated personal workspace, which needs a definition and a flag.
- **Implications:** (a) matches existing precedent but lets the PO edit trainers' client-facing text. (b) needs membership rules for the PO. (c) needs a concept that does not exist (verified: no personal-workspace concept on main).
- **Advisory recommendation (not a decision):** (a), to match precedent.
- **Blocked:** T047 (PO authorization text), T055 (parity rows for PO), T037 (routing assertions), T040 (routing UI).

### PO-DECISION-NEEDED F16-MCQ-F — Localization of workspace overrides (re-framed from F16-MCQ-8)

- **Feature / where found:** 016 · `spec.md` FR-003 (line 101), FR-026 (line 126), FR-023 (line 123); `data-model.md` line 19 (canonical description shape); critique F21.
- **Question:** For overridden name, description and instructions, must both AR and EN be given, or may one language be overridden while the other is inherited from canonical?
- **Options:** (a) Require both AR and EN whenever a field is overridden. (b) Allow either or both and inherit the missing language from canonical. (c) Use (b) for name only and (a) for description and instructions.
- **Implications:** (a) self-contained overrides, but every edit needs two translations. (b) partial localization, so one displayed name can mix canonical and workspace text; a plan freeze must then record the per-language source. (c) two validation rules.
- **Advisory recommendation (not a decision):** (b), with the per-language source recorded so the freeze is deterministic.
- **Blocked:** T044 (description shape), T046 (name column), T049 (language selection), T056 (name-language freeze), T040 (editor), T037 (name assertions).

### PO-DECISION-NEEDED F16-MCQ-G — Override alternatives: seeded into the plan, or live (re-framed from F16-MCQ-10)

- **Feature / where found:** 016 · `spec.md` FR-025 (line 125) and FR-027 (line 127); `contracts/catalog-api.md` client-view paragraph (line 119); `plan.md` line 36; critique F21.
- **Question:** Are an exercise's workspace alternatives copied into a plan when the exercise is added (seeded and frozen), or re-resolved from the override at each client view (live)? If live, may workspace-private targets be shown?
- **Options:** (a) Seeded: copied into the plan at add-to-plan; the client sees only the plan's own alternative references; private targets then follow F16-MCQ-9. (b) Live: the client view re-resolves alternatives from the workspace override at each view, which needs a client alternatives projection and a rule for private references.
- **Implications:** (a) matches the existing "adding an exercise populates the defaults" rule (`spec.md` line 125; F17 FR-005) and folds the MCQ-10 question into MCQ-9. (b) needs a new client projection and a private-reference rule.
- **Advisory recommendation (not a decision):** (a).
- **Blocked:** FR-027 (V2 alternatives freeze); T048 (count bound and seeded or live behaviour); T050 and T058 (client alternatives scope); T059 (F17 integration).

### PO-DECISION-NEEDED F16-MCQ-H — Description: frozen or live in a published plan

- **Feature / where found:** 016 · `spec.md` FR-027 (line 127) and FR-023 (line 123); `plan.md` line 85; `data-model.md` line 46; critique F21.
- **Question:** Is the description (canonical or workspace) frozen at publication with names and instructions, or live like video?
- **Options:** (a) Frozen with instructions at publication. (b) Live, resolved at each view. (c) Frozen only where it is shown to clients.
- **Implications:** (a) matches the S36-PO-2 freeze for names and instructions by analogy, but the PO words do not mention description. (b) changes how historical plans read. (c) needs a presentation rule that is not defined.
- **Advisory recommendation (not a decision):** (a).
- **Blocked:** T044 (description freeze), T056 (description field in V2), the FR-027 V2 shape.

### PO-DECISION-NEEDED F16-MCQ-I — Workspace-name search and override storage budget (added in round-3 review)

- **Feature / where found:** 016 · `spec.md` FR-035 (line 135) and FR-015; `plan.md` line 38; `data-model.md` line 54; critique F19. Not in the critique's MCQ list; added because F19 cannot be specified without it.
- **Question (1):** Which names does a workspace library search match: canonical names only, workspace names only, or both (returning the effective name)? **Question (2):** Is a per-workspace override storage or write-rate budget required, and with which numbers?
- **Options (1):** (a) canonical names only. (b) canonical and workspace names; results show the effective name. (c) effective name only (the name the workspace user sees).
- **Options (2):** (a) a D16-10-style per-workspace budget with numbers set by the PO. (b) no separate budget; database size is monitored against the 70% exit trigger.
- **Implications:** (1)(a) is simple, but a trainer may not find an exercise renamed in their workspace. (1)(b) matches what users see and needs an effective-name index. (1)(c) hides canonical names after an override. (2)(a) needs numbers the PO has not supplied. (2)(b) relies on monitoring only.
- **Advisory recommendation (not a decision):** (1)(b); (2)(b) until the PO sets numbers.
- **Blocked:** T064 (search semantics and storage budget). The length bound in FR-035 is not blocked.

### F16-MCQ-9 (kept open) — client video for workspace-private exercises

- Original text is in the F16-MCQ-9 section above; it is **not** marked answered. The S36-PO-2 words ("videos update live") point toward option (a), so a one-line PO confirmation would close it. The advisory recommendation stays advisory.
- **Blocked:** T045 (client visibility), T050 and T058 (private-video assertions), FR-024.

### FYI-1 — `video: null, source 'none'` is a spec-added default (not a PO question)

- FR-014 returns explicit absence when neither a workspace nor a canonical video is configured. The PO did not describe this state. The risk is low; it is reported for awareness only.

### FYI-2 — Video host list: `docs.google.com` (architect confirmation, not a PO question unless the architect escalates)

- D16-3 says "HTTPS YouTube/Google Drive only". The current validators on main (`supabase/migrations/20261106105000_catalog_video_resolution.sql`, `app_private.catalog_video_url_allowed`) and PR #43 (`lib/catalog/video-variation.ts`) also accept `docs.google.com`. FR-014 states the D16-3 host list. Task T061 aligns the validators once the architect confirms the list. Escalate to the PO only if Google Docs links are wanted.

### FYI-3 — Merged-source media (architect confirmation)

- FR-028 resolves the plan's own referenced identity for video, never the merge survivor. It derives from FR-010 and FR-011 (plan references and media availability stay unchanged). The critique offered a courtesy note to the PO if the architect wants this reviewed; the architect decides.
