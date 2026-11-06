# F16 decision register

This register preserves prior records and points to later decisions. An entry marked superseded remains in the historical record; it is not deleted or silently rewritten.

## Supersession history

| Record | Historical decision | Status | Superseding authority |
| --- | --- | --- | --- |
| S35-PO-1 | F16 manual distribution decision; retain original S35 record verbatim in its source location. | **Superseded**; history retained. | S35-PO-3 F16 REDESIGN paragraph, quoted in `spec.md` Clarifications. |
| S35-PO-2 | F16 manual distribution decision; retain original S35 record verbatim in its source location. | **Superseded**; history retained. | S35-PO-3 F16 REDESIGN paragraph, quoted in `spec.md` Clarifications. |
| PR #64, commit `c4543a1`, “independent workspace copies” | Independent workspace catalog copies. | **Superseded**; do not edit its branch or delete its record. | S35-PO-3 F16 REDESIGN paragraph; one global catalog with per-workspace overrides. |
| S35-PO-3 | One shared global exercise catalog with workspace-specific editable overrides and client-workspace video resolution. | **Current binding decision** for the stated scope. | Original source: `C:/Users/NEW LAP/.lifter/runs/s35-ledger3/s35-po-3.verbatim.txt`. |
| S36-PO-2 (F16 paragraph) | Answers F16-MCQ-1, -3, -4, -5 and -6; F16-MCQ-2 and -7 become moot; no client transfers between workspaces. F16-MCQ-8, -9 and new -10 stay open. | **Current binding decision** for the answered items. | Verbatim paragraph in `## S36-PO-2 F16 answers` below; source `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-2.verbatim.txt`. |

## F16 MCQ status after S36-PO-2

Items F16-MCQ-1 through -7 are answered or moot as recorded in `## S36-PO-2 F16 answers`. Their original question, options, implications and recommendation text is kept unchanged as history. Items F16-MCQ-8, -9 and -10 remain **PO-DECISION-NEEDED**. Recommendations are advisory only; none is a decision. Requirements, defaults, contracts and test expectations must not choose an unanswered option.

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

### PO-DECISION-NEEDED F16-MCQ-8 — Localization requirements for workspace name overrides

- **Status (S36-PO-2):** not answered by S36-PO-2. Remains PO-DECISION-NEEDED.

- **Question:** Must a workspace name override provide both Arabic and English values, or may it override one language while inheriting the other canonical value?
- **Options:** (a) Require both localized values whenever name is overridden; (b) allow either/both localized values and inherit a missing language from the canonical global version.
- **Implications:** (a) keeps each workspace override self-contained but requires both translations for every name edit; (b) reduces entry burden but means one displayed exercise name can combine canonical and workspace-versioned values.
- **Recommendation:** (b), because it allows partial localization without changing the global record; this is not a decision.
- **Blocked:** Override payload validation, AR/EN editor requirements, fallback/read precedence and bilingual acceptance tests.

### PO-DECISION-NEEDED F16-MCQ-9 — Client video for workspace-private Trainer exercises

- **Status (S36-PO-2):** not answered by S36-PO-2. S36-PO-2 says published plans’ videos update live and that workspace alternatives may include private exercises; neither statement chooses whether a private exercise’s video is resolved or omitted in the client view. Remains PO-DECISION-NEEDED.

- **Question:** When a valid published client plan references a Trainer-created workspace-private exercise, should the client-plan projection resolve that exercise's video for the plan's own workspace, or omit its video?
- **Options:** (a) Resolve the current video through the same client/plan-authorized projection, scoped to the persisted plan/client workspace; (b) omit the workspace-private exercise video from the client view while preserving the otherwise-authorized plan.
- **Implications:** (a) lets the assigned client see workspace-specific exercise media and requires a narrowly scoped path for workspace-private rows; (b) keeps client video projection limited to global identities but leaves the assigned plan without that exercise's media. Neither option grants direct catalog/table/search access or cross-workspace visibility.
- **Recommendation:** (a), because the client already has authorized access to the published plan in that workspace; this is advisory and does not select an answer.
- **Blocked:** Whether private exercise media is resolved or omitted for clients, the client projection's eligible identity scope, and corresponding positive/negative plan-view tests. A valid plan must not be denied solely because it references a workspace-private exercise.

### PO-DECISION-NEEDED F16-MCQ-10 — Client-plan presentation of workspace-private alternatives

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
| F16-MCQ-8 | Open | — | FR-003, T037, T038, T040 |
| F16-MCQ-9 | Open | — | FR-014, T039, contracts client-plan read |
| F16-MCQ-10 | Open (new) | — | Contracts client-plan read, T039 |

**Label note for architect (F16-MCQ-3):** the architect mapping labels the answer as option (c). The register text of option (c) reads “snapshot names but resolve instructions live”, which contradicts the PO words (names and instructions frozen; videos live) and matches no option exactly. This record binds the PO words. The architect is asked to confirm the label; no implementation may depend on the label alone.

**Requirement recorded (history preserved):** no client transfers between workspaces. A departing client registers a new account elsewhere. This answers the question that F16-MCQ-7 asked; the original MCQ-7 text above is retained unchanged. Recorded as FR-022 in `spec.md`.

**Independent critique (blocker):** Sonnet 5.5 critiques are authorized for F16 by S36-PO-2. The constitution (Sol Medium mandate, S30-PO-8 Q15) conflicts with that substitution. The conflict is reported to the PO. Until the PO resolves it, implementation is blocked and feature acceptance records the conflict.
