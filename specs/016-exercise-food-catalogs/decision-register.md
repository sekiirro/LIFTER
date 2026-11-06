# F16 decision register

This register preserves prior records and points to later decisions. An entry marked superseded remains in the historical record; it is not deleted or silently rewritten.

## Supersession history

| Record | Historical decision | Status | Superseding authority |
| --- | --- | --- | --- |
| S35-PO-1 | F16 manual distribution decision; retain original S35 record verbatim in its source location. | **Superseded**; history retained. | S35-PO-3 F16 REDESIGN paragraph, quoted in `spec.md` Clarifications. |
| S35-PO-2 | F16 manual distribution decision; retain original S35 record verbatim in its source location. | **Superseded**; history retained. | S35-PO-3 F16 REDESIGN paragraph, quoted in `spec.md` Clarifications. |
| PR #64, commit `c4543a1`, “independent workspace copies” | Independent workspace catalog copies. | **Superseded**; do not edit its branch or delete its record. | S35-PO-3 F16 REDESIGN paragraph; one global catalog with per-workspace overrides. |
| S35-PO-3 | One shared global exercise catalog with workspace-specific editable overrides and client-workspace video resolution. | **Current binding decision** for the stated scope. | Original source: `C:/Users/NEW LAP/.lifter/runs/s35-ledger3/s35-po-3.verbatim.txt`. |

## Open PO decisions — do not encode recommendations as requirements

Every item below is **PO-DECISION-NEEDED**. Recommendations are advisory only; no answer is selected. Until PO decides, requirements, defaults, contracts and test expectations must not choose an option.

### PO-DECISION-NEEDED F16-MCQ-1 — New-workspace video mapping creation

- **Question:** What does “automatically get their own video mapping” mean when a workspace is created?
- **Options:** (a) Resolve virtually to the global video until the workspace edits, with no mapping row; (b) create a workspace mapping row at workspace creation, initialized from the global video; (c) create a workspace mapping row on first view, initialized from the global video.
- **Implications:** (a) avoids stored rows but means “own mapping” is virtual; (b) is explicit and requires workspace provisioning work and a defined initial-row value; (c) defers writes to reads and requires race/idempotency behavior.
- **Recommendation:** (b), because it most directly implements automatic per-workspace mapping; this is not a decision.
- **Blocked:** Exact creation timing, initial value, write path, provisioning failure handling, row-count semantics and corresponding tests.

### PO-DECISION-NEEDED F16-MCQ-2 — Relationship to “no seeded catalog content”

- **Question:** Does an automatically created video mapping count as seeded catalog content under FR-019?
- **Options:** (a) No; a mapping row is configuration, not catalog content; (b) yes; use virtual fallback with no row until an explicit edit.
- **Implications:** (a) requires a narrowly defined exception to FR-019 and mapping provisioning; (b) keeps FR-019 literal and cannot also require a persisted mapping at workspace creation.
- **Recommendation:** (a), consistent with distinguishing metadata from exercise content; this is not a decision.
- **Blocked:** Reconciliation of FR-019, provisioning/data-model language, and tests for new workspaces.

### PO-DECISION-NEEDED F16-MCQ-3 — Non-video override values in published plans

- **Question:** How do overridden names and instructions appear in already-published plans?
- **Options:** (a) Snapshot all displayed override values at publication; (b) resolve them live like video; (c) snapshot names but resolve instructions live.
- **Implications:** (a) preserves historical presentation but requires snapshot fields; (b) reflects edits in existing plans and changes historical presentation; (c) mixes snapshot and live resolution and requires separate versioning rules.
- **Recommendation:** (a), aligned with preserving historical plans; this is not a decision.
- **Blocked:** Snapshot contract, historical-plan rendering rules, override version retention and acceptance tests for post-publication edits.

### PO-DECISION-NEEDED F16-MCQ-4 — Alternatives override semantics

- **Question:** How does a workspace alternatives override relate to canonical global alternatives?
- **Options:** (a) Replace the global list; (b) add to the global list; (c) replace the global list and permit references to workspace-private exercises.
- **Implications:** (a) suppresses canonical alternatives in that workspace; (b) requires merge/order/deduplication semantics; (c) also requires private exercise references and privacy-safe lifecycle behavior.
- **Recommendation:** (a), because it keeps the workspace override self-contained; this is not a decision.
- **Blocked:** Override storage shape, list resolution, validation, editor behavior and alternative-list tests.

### PO-DECISION-NEEDED F16-MCQ-5 — PO authority over canonical original

- **Question:** Can the PO still edit the canonical global original through an explicitly global-scope action, while edits made in the PO's personal workspace affect only that workspace override?
- **Options:** (a) Yes; global-scope canonical edits remain available, while personal-workspace edits write only that workspace override; (b) no; canonical content is frozen after creation.
- **Implications:** (a) retains the existing PO-only global governance path and requires scope-explicit routing; (b) removes canonical edit capability and changes existing version/governance behavior.
- **Recommendation:** (a), consistent with the existing approved PO-only canonical governance requirements; this is not a decision.
- **Blocked:** Whether the global canonical edit path remains available, scope selection/routing, and tests proving personal-workspace edits cannot mutate canonical content.

### PO-DECISION-NEEDED F16-MCQ-6 — Video after removing a workspace override

- **Question:** What video resolves after a workspace video override is removed?
- **Options:** (a) Fall back to the global video; (b) return no video.
- **Implications:** (a) maintains an available fallback and requires removal to mean “clear override”; (b) treats removal as an intentional suppression and requires a distinct empty result.
- **Recommendation:** (a), consistent with the global fallback rule; this is not a decision.
- **Blocked:** Remove semantics, resolver state model, client-view result and removal tests.

### PO-DECISION-NEEDED F16-MCQ-7 — Workspace chosen for video when scopes disagree

- **Question:** Which workspace determines exercise video resolution when plan, client and template workspaces differ?
- **Options:** (a) The plan's owning workspace; (b) the client's current workspace.
- **Implications:** (a) anchors video to plan ownership and may differ from the current client workspace; (b) follows current client tenancy and may change which override an existing plan view displays.
- **Recommendation:** (b), consistent with S35-PO-3's explicit “CLIENT workspace” wording; this is not a decision.
- **Blocked:** Resolver input/source of truth, plan/client join, authorization check and cross-workspace negative tests.

### PO-DECISION-NEEDED F16-MCQ-8 — Localization requirements for workspace name overrides

- **Question:** Must a workspace name override provide both Arabic and English values, or may it override one language while inheriting the other canonical value?
- **Options:** (a) Require both localized values whenever name is overridden; (b) allow either/both localized values and inherit a missing language from the canonical global version.
- **Implications:** (a) keeps each workspace override self-contained but requires both translations for every name edit; (b) reduces entry burden but means one displayed exercise name can combine canonical and workspace-versioned values.
- **Recommendation:** (b), because it allows partial localization without changing the global record; this is not a decision.
- **Blocked:** Override payload validation, AR/EN editor requirements, fallback/read precedence and bilingual acceptance tests.
