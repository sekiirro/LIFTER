# F16 decision register

This register preserves prior records and points to later decisions. An entry marked superseded remains in the historical record; it is not deleted or silently rewritten.

## Supersession history

| Record                                                   | Historical decision                                                                                                                                                                                                                                                | Status                                                                                                                       | Superseding authority                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| S35-PO-1                                                 | F16 manual distribution decision; retain original S35 record verbatim in its source location.                                                                                                                                                                      | **Superseded**; history retained.                                                                                            | S35-PO-3 F16 REDESIGN paragraph, quoted in `spec.md` Clarifications.                                                         |
| S35-PO-2                                                 | F16 manual distribution decision; retain original S35 record verbatim in its source location.                                                                                                                                                                      | **Superseded**; history retained.                                                                                            | S35-PO-3 F16 REDESIGN paragraph, quoted in `spec.md` Clarifications.                                                         |
| PR #64, commit `c4543a1`, “independent workspace copies” | Independent workspace catalog copies.                                                                                                                                                                                                                              | **Superseded**; do not edit its branch or delete its record.                                                                 | S35-PO-3 F16 REDESIGN paragraph; one global catalog with per-workspace overrides.                                            |
| S35-PO-3                                                 | One shared global exercise catalog with workspace-specific editable overrides and client-workspace video resolution.                                                                                                                                               | **Current binding decision** for the stated scope.                                                                           | Original source: `C:/Users/NEW LAP/.lifter/runs/s35-ledger3/s35-po-3.verbatim.txt`.                                          |
| S36-PO-2 (F16 paragraph)                                 | Answers F16-MCQ-1, -3, -4, -5 and -6; F16-MCQ-2 and -7 become moot; no client transfers between workspaces. F16-MCQ-8 and -10 are re-framed in round 3 as -F and -G; -9 stays open; -A to -E, -H and -I are added in round 3 (see the round-3 section at the end). | **Current binding decision** for the answered items.                                                                         | Verbatim paragraph in `## S36-PO-2 F16 answers` below; source `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-2.verbatim.txt`.  |
| S36-PO-3 (F16 bullet, round 4)                           | Architect mapping of the F16 bullet: answers F16-MCQ-A, -B, -C, -E, -F, -G, -H, -I (both parts), -9 and -D (see `## S36-PO-3 F16 answers (round 4)`); adds F16-MCQ-J (answered by S36-PO-5).                                                                       | **Current binding PO bullet**. The per-item answers are architect words applied to the bullet, not independent PO decisions. | Verbatim bullet in `## S36-PO-3 F16 answers (round 4)`; source `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-3.verbatim.txt`. |

## F16 MCQ status after S36-PO-2

Items F16-MCQ-1 through -7 are answered or moot as recorded in `## S36-PO-2 F16 answers`. Their original question, options, implications and recommendation text is kept unchanged as history. Round 3 (critique response): F16-MCQ-8 is re-framed as **F16-MCQ-F**, and F16-MCQ-10 as **F16-MCQ-G**; F16-MCQ-9 stays open and is not marked answered; new items F16-MCQ-A, -B, -C, -D, -E, -H and -I are **PO-DECISION-NEEDED** (see `## Round 3 PO-DECISION-NEEDED items`). Recommendations are advisory only; none is a decision. Requirements, defaults, contracts and test expectations must not choose an unanswered option.

Round 4 (S36-PO-3) answers are recorded below. S37 (S36-PO-5) answers F16-MCQ-J/K/L. S37-PO-1 Q2 and S37-PO-10 close F16-MCQ-O, -P, -Q, -F-R and -G-R; F16-MCQ-D-R is specified in F11/F12 and outside F16 scope. Historical question text remains for traceability.

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

- **Status (S36-PO-2):** answered, option (c): a workspace alternatives override replaces the global list and may reference workspace-private exercises. Client-view presentation of such references is open as F16-MCQ-10 (re-framed as F16-MCQ-G in round 3).

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

### F16-MCQ-9 — Client video for workspace-private Trainer exercises — ANSWERED (S36-PO-3, round 4)

- **Status (S36-PO-3, round 4):** answered, option (a): a workspace-private exercise video is visible to clients only through an authorized plan projection, scoped to the persisted plan/client workspace. No direct catalog, table or search access. The original text below is unchanged.

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

| MCQ                        | Status                      | Recorded answer                                                                                                                                | Applied in                                                           |
| -------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| F16-MCQ-1                  | Answered, option (a)        | New workspaces use the global video fallback; no automatic mapping rows.                                                                       | FR-014, SC-012, spec US2 scenario 5, data-model `exercise_overrides` |
| F16-MCQ-2                  | Moot                        | No mapping rows exist, so FR-019 (no seeded content) is unchanged.                                                                             | FR-019 untouched                                                     |
| F16-MCQ-3                  | Answered (label flagged)    | Published plans freeze exercise names and instructions at publication; video is resolved live.                                                 | FR-020, SC-011, spec US6                                             |
| F16-MCQ-4                  | Answered, option (c)        | A workspace alternatives override replaces the global list and may reference workspace-private exercises.                                      | FR-003, data-model `exercise_overrides`                              |
| F16-MCQ-5                  | Answered, option (a)        | Canonical global exercises are edited only in the explicit global admin scope; personal-workspace PO edits write only that workspace override. | FR-002, FR-014, FR-018, SC-001, SC-008                               |
| F16-MCQ-6                  | Answered, option (a)        | Removing a workspace video restores the global video fallback.                                                                                 | FR-014, contracts override remove/clear                              |
| F16-MCQ-7                  | Moot                        | No client transfers between workspaces (below); client workspace equals plan workspace.                                                        | FR-022                                                               |
| F16-MCQ-8 (now F16-MCQ-F)  | Open                        | —                                                                                                                                              | FR-003, FR-026, T037, T040, T044, T056                               |
| F16-MCQ-9                  | Open (kept open in round 3) | —                                                                                                                                              | FR-014, FR-024, T045, T050, T058                                     |
| F16-MCQ-10 (now F16-MCQ-G) | Open                        | —                                                                                                                                              | FR-025, FR-027, T048, T058                                           |

**Label note for architect (F16-MCQ-3):** the architect mapping labels the answer as option (c). The register text of option (c) reads “snapshot names but resolve instructions live”, which contradicts the PO words (names and instructions frozen; videos live) and matches no option exactly. This record binds the PO words. The architect is asked to confirm the label; no implementation may depend on the label alone.

**Requirement recorded (history preserved):** no client transfers between workspaces. A departing client registers a new account elsewhere. This answers the question that F16-MCQ-7 asked; the original MCQ-7 text above is retained unchanged. Recorded as FR-022 in `spec.md`.

**Independent critique (blocker):** Sonnet 5.5 critiques are authorized for F16 by S36-PO-2. The constitution (Sol Medium mandate, S30-PO-8 Q15) conflicts with that substitution. The conflict is reported to the PO. Until the PO resolves it, implementation is blocked and feature acceptance records the conflict.

## S36-PO-3 F16 answers (round 4)

PO source: `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-3.verbatim.txt`, section 2 (Product Decisions), F16 bullet, quoted byte-for-byte as UTF-8 (the bullet line is unchanged):

> - **F16:** One logical library per workspace inheriting Global exercises. Independent workspace edits to names, videos, instructions and notes, with per-field reset to Global. Empty alternatives allowed. Preserve existing notes; audit legacy data before migration. PO may edit any workspace override. English names required; Arabic optional. Published plans freeze alternatives/descriptions; videos remain live. Search global + workspace names; display effective workspace names. No additional storage quota; retain 70% monitoring. Workspace-private videos visible to clients only through authorized plans. Client Delete releases email/phone for fresh registration elsewhere while retaining required history; audit current implementation.

Architect mapping: `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-architect-rulings-3.md`, the F16 lines only (the product mapping and the F16 OPEN line that yields F16-MCQ-J). The architect routing lines of that file are not F16 and are not applied here. The per-item answers below are architect words applied to the verbatim bullet, as instructed. They are not independent PO decisions.

| MCQ         | Status (S36-PO-3)                                                 | Recorded answer                                                                                                                                                                                                         | Applied in                                                                                                       |
| ----------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| F16-MCQ-A   | Answered, option (a)                                              | Per-field reset. Each allowlisted field (name, description, instructions, video, alternatives, notes) returns to the canonical value independently; the override row stays for its other fields.                        | FR-003, FR-014; data-model `exercise_override_versions`; contracts "Override remove/clear" row; T046, T047, T040 |
| F16-MCQ-B   | Answered, option (a)                                              | An empty alternatives list is allowed and means no alternatives (replace semantics). Alternatives override writes stay BLOCKED by F16-MCQ-J.                                                                            | FR-025; data-model `exercise_override_alternatives`; T048, T047, T040                                            |
| F16-MCQ-C   | Answered in part: preserve existing notes, audit before migration | Existing notes are preserved; legacy rows stay readable and immutable; a legacy-data audit (T068) runs BEFORE any migration task. `notes` is an overridable field. Note copy residual: see below.                       | FR-003, FR-031; data-model legacy `note` row; plan migration step 1; T068, T062, T063                            |
| F16-MCQ-D   | Answered in the PO words (cross-feature)                          | Account deletion frees email/phone for fresh registration in another workspace with no data transfer (S37-PO-10). F11/F12 specifies and implements the behavior in a separate PR; F16 implements nothing.               | FR-022; F11/F12 pointer                                                                                          |
| F16-MCQ-E   | Answered, option (a)                                              | The PO may edit any workspace override. Canonical edits stay in the explicit global admin scope (F16-MCQ-5).                                                                                                            | FR-014, FR-030; contracts planned rows; T037, T040, T047, T055                                                   |
| F16-MCQ-F   | Answered for the name field only                                  | English name required; Arabic name optional. Description and instructions are a residual: see below.                                                                                                                    | FR-003, FR-026; T046, T049, T056                                                                                 |
| F16-MCQ-G   | Answered: frozen at publication                                   | Override alternatives are frozen with the published plan at publication (FR-027), not re-resolved live. Count bound residual: see below.                                                                                | FR-025, FR-027; data-model `ExerciseSnapshotV2` row; T048, T050, T056, T058                                      |
| F16-MCQ-H   | Answered for Description; Video clarified by S37-PO-1 Q2          | The Description is frozen at publication. Video stays live and follows the authorized library value.                                                                                                                    | FR-023, FR-027; T044, T056                                                                                       |
| F16-MCQ-I   | Answered, (1)(b) and (2)(b)                                       | Workspace search matches canonical and workspace names and shows the effective workspace name. No extra storage quota; database size is monitored against the 70% exit trigger.                                         | FR-035; plan Search paragraph; T064                                                                              |
| F16-MCQ-9   | Answered, option (a)                                              | A workspace-private exercise video is visible to clients only through an authorized plan projection, scoped to the persisted plan/client workspace. No direct catalog, table or search access.                          | FR-014, FR-024, FR-029; contracts client-view paragraph; T045, T050, T058                                        |
| F16-MCQ-J   | ANSWERED by S36-PO-5                                              | Exactly eight fields are editable locally, with Global PO-only.                                                                                                                                                         | FR-003; T037, T040, T046-T050, T056-T058, T064                                                                   |
| F16-MCQ-K   | ANSWERED by S36-PO-5 line 6                                       | The eight named fields, all locally editable. This is the question in CodeRabbit thread 861BYOr.                                                                                                                        | FR-003; T037, T040, T047                                                                                         |
| F16-MCQ-L   | ANSWERED by S36-PO-5 line 7                                       | Keep existing Notes; remove Instructions, preserving unique data into Notes. This is the question in CodeRabbit thread tN4f.                                                                                            | FR-003, FR-031; T037, T047, T062                                                                                 |
| F16-MCQ-Q   | ANSWERED by S37-PO-10                                             | English name required and Arabic optional for both canonical Global and Workspace names; this supersedes the S20 Arabic-required rule for F16.                                                                          | FR-001; F16-MCQ-F                                                                                                |
| F16-MCQ-P   | ANSWERED by S37-PO-10                                             | `docs.google.com` is not an allowed host; delete dummy values at cutover, with no legacy support path. “No video lost” excludes these dummy links.                                                                      | FR-014, FR-031; T061-T063                                                                                        |
| F16-MCQ-O   | ANSWERED by S37-PO-1 Q2 = A                                       | Video stays live in published plans and follows the current authorized library value; other published values remain frozen.                                                                                             | FR-014, FR-020, FR-027; SC-009                                                                                   |
| F16-MCQ-F-R | ANSWERED by S37-PO-10                                             | One optional Description value in any language; there is no AR/EN pair.                                                                                                                                                 | FR-003, FR-026; T044, T049, T056                                                                                 |
| F16-MCQ-G-R | ANSWERED by S37-PO-10                                             | At most three Alternatives per exercise; target identities must be unique.                                                                                                                                              | FR-025; T048                                                                                                     |
| A55         | RESOLVED as a technical detail                                    | Metadata outside the exact eight library fields remains available from the immutable version already referenced by the plan; this preserves historical values without adding fields to the redesigned Exercise Library. | FR-027; data-model `ExerciseSnapshotV2`; T056, T059                                                              |

### Residuals and label notes (round 4)

- **F16-MCQ-F-R — ANSWERED by S37-PO-10:** one optional Description value in any language; no paired Arabic/English fields. Instructions remains removed as a field.
- **F16-MCQ-G-R — ANSWERED by S37-PO-10:** maximum three Alternatives per exercise; duplicate target identities are rejected. Alternatives remain frozen at publication per the earlier decision.
- **F16-MCQ-C-R (legacy note copy) — ANSWERED by S36-PO-5:** retain existing Notes; remove Instructions and preserve its unique data into Notes. T068 still precedes any migration and supplies audit evidence; no separate PO choice remains.
- **F16-MCQ-D-R — OUT OF F16 SCOPE:** account deletion frees email/phone for fresh registration in another workspace with no data transfer (S37-PO-10). F11/F12 specifies this behavior in a separate PR by that lane; no F16 task or open item remains.

### F16-MCQ-J — editable-field list (ANSWERED by S36-PO-5)

- **Feature / where found:** 016 · `spec.md` FR-003 and Key Entities (`ExerciseOverride`); `data-model.md` `exercise_overrides` and `exercise_override_versions` rows; `contracts/catalog-api.md` planned override rows; the S36-PO-3 bullet above; the S35-PO-3 paragraph in `spec.md` Clarifications (2026-11-06).
- **Question:** S36-PO-3 lists the independent editable fields as names, videos, instructions and notes. S35-PO-3 listed name, description, instructions, video and alternatives. Is the S36-PO-3 list additive to the S35-PO-3 list, or does it replace it?
- **Options:** (a) Additive: the allowlist is name, description, instructions, video, alternatives and notes (six fields). (b) Replacing: the allowlist is name, instructions, video and notes (four fields); description and alternatives overrides are withdrawn and the S35-PO-3 wording for them is superseded.
- **Implications:** (a) keeps every S35-PO-3 capability and adds notes; description and alternatives writes then need the freeze rules of F16-MCQ-G and -H. (b) removes the alternatives child rows (FR-025, SC-016) and the description override from the design and needs spec, data-model, contract and test rework. The S35-PO-3 record stays as history.
- **Advisory recommendation (not a decision):** (a), additive, with notes added.
- **Blocked:** description and alternatives override writes and their validation (T037, T047, T048), the description and alternatives columns and resolution (T046, T049, T056), the editor fields (T040), the client alternatives scope (T050, T058), the description and alternatives codes of the audit allowlist (T057), and description search columns (T064). Name, instructions, video and notes writes are not blocked by J.

### Historical F16-MCQ-Q question (ANSWERED by S37-PO-10)

- **Feature / where found:** 016; spec.md FR-001 and FR-003; S20 Message B section 1; S36-PO-3 section 2 F16 line 21; architect mapping F16-MCQ-F in s36-architect-rulings-3.md.
- **Question:** Does the S36-PO-3 wording that English names are required and Arabic is optional apply to canonical Global exercise creation, or only to workspace name customization addressed by F16-MCQ-F? S20 has an existing Global rule requiring Arabic and English names.
- **Options:** (a) Apply the S36-PO-3 language rule only to workspace name customization; retain the S20 requirement for canonical Global exercises. (b) Apply English-required/Arabic-optional to canonical Global exercises too, superseding the earlier S20 rule for F16.
- **Implications:** (a) keeps existing canonical validation and allows workspace names to be English-only. (b) permits canonical exercises without Arabic and changes Global create/edit validation and associated acceptance evidence.
- **Decision:** English name required and Arabic optional for Global and Workspace names. S37-PO-10 supersedes the S20 Arabic-required rule for F16. A7 independently blocks implementation.

### Historical F16-MCQ-P question (ANSWERED by S37-PO-10)

- **Feature / where found:** 016 · `plan.md` migration step 3; `spec.md` FR-031 (video carry-over), FR-014 (host list) and FYI-2; `tasks.md` T061, T062(a), T054 cutover and T063.
- **Question:** FR-031 and T063 require every active legacy variation video to carry over into the workspace override with no video lost at cutover. FYI-2 may remove `docs.google.com` from the host list (FR-014). Legacy rows on that host would then conflict with the new URL rule. How are those rows preserved?
- **Options:** (a) Keep `docs.google.com` in the host list and amend FR-014 and T061; no row needs special handling. (b) Remove the host and carry those videos over unchanged as legacy values, although the new write path would reject the same value. (c) Remove the host and clear those videos at cutover, recording each affected workspace for PO notice; this loses data and conflicts with T063 unless T063 is amended. (d) Remove the host and keep those legacy videos only as read-only history that the resolver never returns.
- **Implications:** (a) keeps FR-031 and T063 unchanged and widens the host list. (b) keeps the data but leaves a value the new rule rejects reachable through the resolver. (c) is the only option that loses data. (d) keeps the data without resolving it, so a workspace video reverts to the global fallback.
- **Decision:** `docs.google.com` is disallowed; delete dummy values at cutover and provide no legacy support path. “No video lost” excludes these dummy values. F16-MCQ-P is closed by S37-PO-10.

### A55 — V1 metadata outside the redesigned library (RESOLVED as a technical detail)

The eight-field list in S36-PO-5 excludes primary/secondary muscle and equipment as Exercise Library fields. Retain those historical values through the exact immutable version reference already carried by the plan snapshot. Optional Default Rest Time, Default RIR and Default Reps are among the eight fields and are copied into editable planner entries at exercise addition. No product behavior is undecided here; no extra V2 field is required for this F16 spec.

## Round 3 PO-DECISION-NEEDED items

Source of the list: independent critique `C:/Users/NEW LAP/.lifter/runs/s36-sonnet-f16-critique/critique.md` (F6, F11, F12, F21 and consolidated MCQs), plus items added by the round-3 review (F16-MCQ-I, FYI-1 to FYI-3). Each item lists the question, options (2 to 4) with implications, an advisory recommendation that is **not a decision**, and what is blocked. No option is selected in this record. Task IDs refer to `tasks.md`.

### F16-MCQ-A — How an overridden field is reset — ANSWERED (S36-PO-3, round 4)

- **Status (S36-PO-3, round 4):** answered, option (a), per-field reset. Each allowlisted field returns to the canonical value independently and the override row stays. See `## S36-PO-3 F16 answers (round 4)`. The original text below is unchanged.

- **Feature / where found:** 016 · `spec.md` FR-003 (line 101) and FR-014 (line 112); `data-model.md` line 23; `contracts/catalog-api.md` planned row "Workspace override remove/clear" (line 28); critique F6.
- **Question:** How does a workspace return one overridden field (for example its video) to the canonical value while keeping its other overrides?
- **Options:** (a) per-field reset: name, description, instructions, video and alternatives can each be cleared independently; the override row stays. (b) Only video can be cleared individually; any other field is reset only by removing the whole override. (c) Whole-override removal only.
- **Implications:** (a) finest control; needs a per-field "inherit" representation (null) and a per-field remove contract. (b) simpler UI, but a trainer cannot revert only a name. (c) removing a bad video also removes a good name, which conflicts with the S36-PO-2 video-removal rule in spirit.
- **Advisory recommendation (not a decision):** (a).
- **Blocked:** T046 (null semantics), T047 (remove/clear contract), T040 (reset UI), T037 (reset assertions).

### F16-MCQ-B — Empty alternatives list — ANSWERED (S36-PO-3, round 4)

- **Status (S36-PO-3, round 4):** answered, option (a): an empty alternatives list is allowed and means no alternatives. Alternatives override writes remain BLOCKED by F16-MCQ-J.

- **Feature / where found:** 016 · `spec.md` FR-025 (line 125); `data-model.md` line 24; `plan.md` line 36; critique F6.
- **Question:** May a workspace save an empty alternatives list to suppress the canonical alternatives?
- **Options:** (a) Yes: an empty list means no alternatives (replace semantics). (b) No: an empty list is rejected; the only way back to canonical is a reset (see F16-MCQ-A).
- **Implications:** (a) follows the literal word "replace" but lets a trainer hide all alternatives silently. (b) prevents accidental suppression and depends on a reset path.
- **Advisory recommendation (not a decision):** (a).
- **Blocked:** T048 (validation), T047 (empty-list write), T040 (empty state), T037 (alternatives assertions).

### F16-MCQ-C — Legacy variation `note` text — ANSWERED IN PART (S36-PO-3, round 4)

- **Status (S36-PO-3, round 4):** answered: preserve existing notes and audit legacy data before any migration (option (d), inventory first). Legacy rows stay readable and immutable pending the audit. Existing Notes remain; unique Instructions content is preserved into Notes as S36-PO-5 directs. T068 precedes any migration.

- **Feature / where found:** 016 · `data-model.md` line 26; `plan.md` line 71; `tasks.md` T062; main `supabase/migrations/20261106112000_catalog_variation_operations.sql` (note, at most 2000 characters, lines 49-52, 75).
- **Question:** What happens to existing variation notes, which the five-field override allowlist does not contain?
- **Options:** (a) Keep legacy tables read-only as history; notes are not shown in the redesigned UI. (b) Migrate each note into that workspace's override `instructions`. (c) Migrate each note into the override `description`. (d) Inventory first: if the deployed database holds no variation rows the question is moot; otherwise choose (a), (b) or (c).
- **Implications:** (a) no database data loss, but trainers lose a visible note. (b) and (c) reclassify internal free text as client-visible content. (d) needs an inventory of the deployed database, which this repository cannot show.
- **Advisory recommendation (not a decision):** (d) first; otherwise (a).
- **Blocked:** T062 (note backfill); T047 (note payload); the data steps of T053.

### F16-MCQ-D — Re-registration of a departing client — ANSWERED IN THE PO WORDS (S36-PO-3, round 4; cross-feature)

- **Status (S36-PO-3, clarified by S37-PO-10):** account deletion frees email/phone for fresh registration in another workspace with no data transfer. Detailed behavior belongs to F11/F12 in a separate PR; F16 implements nothing and has no open item for this behavior.

- **Feature / where found:** 016 · `spec.md` FR-022 (line 121) and edge case (line 93); main `supabase/migrations/20261031121000_client_accounts_model.sql` lines 68-69 (`email_normalized` and `phone_e164` are globally unique); D-08 in `docs/01-traceability.md` line 19; critique F11.
- **Question:** The S36-PO-2 words say departing clients register new accounts in another workspace. Global e-mail and phone uniqueness (D-08) and preserved history prevent reuse of the same identifiers. How should re-registration work?
- **Options:** (a) Use a different e-mail and phone (D-08 unchanged); departing clients are told so. (b) Release the departed record's identifiers (anonymize or tombstone) so they can register again; history keeps a pseudonymous record. (c) PO-mediated manual re-registration. (d) Per-workspace unique identifiers, which requires a D-08 amendment.
- **Implications:** (a) cheapest, no schema change. (b) and (d) change D-08, the F11/F12 uniqueness rules and privacy. (c) adds manual PO work.
- **Advisory recommendation (not a decision):** (a) for F16; escalate (b) as a separate F11/F12 decision if identical identifiers are wanted.
- **Blocked:** Nothing in F16 (FR-022 is narrowed). Cross-feature F11/F12 only.

### F16-MCQ-E — PO write reach on overrides — ANSWERED (S36-PO-3, round 4)

- **Status (S36-PO-3, round 4):** answered, option (a): the PO may edit any workspace override. Canonical global edits stay in the explicit global admin scope (F16-MCQ-5).

- **Feature / where found:** 016 · `spec.md` FR-030 (line 130) and FR-014 (line 112); `contracts/catalog-api.md` planned rows (lines 27 and 29); main `supabase/migrations/20261027120000_tenancy.sql` lines 65-75 (`has_workspace_access` returns true for the platform owner in every workspace); critique F12.
- **Question:** In which workspaces may the PO write workspace overrides and workspace-private exercises?
- **Options:** (a) Any workspace (the current legacy variation behaviour; useful for support). (b) Only workspaces where the PO holds an active membership. (c) Only a designated personal workspace, which needs a definition and a flag.
- **Implications:** (a) matches existing precedent but lets the PO edit trainers' client-facing text. (b) needs membership rules for the PO. (c) needs a concept that does not exist (verified: no personal-workspace concept on main).
- **Advisory recommendation (not a decision):** (a), to match precedent.
- **Blocked:** T047 (PO authorization text), T055 (parity rows for PO), T037 (routing assertions), T040 (routing UI).

### F16-MCQ-F — Localization of workspace overrides (re-framed from F16-MCQ-8) — ANSWERED FOR NAME; RESIDUAL FOR DESCRIPTION AND INSTRUCTIONS (S36-PO-3, round 4)

- **Status (S36-PO-3, clarified by S37-PO-10):** English name required and Arabic optional for both Global and Workspace names. One optional Description value in any language; no paired AR/EN fields. Instructions is removed as a field.

- **Feature / where found:** 016 · `spec.md` FR-003 (line 101), FR-026 (line 126), FR-023 (line 123); `data-model.md` line 19 (canonical description shape); critique F21.
- **Question:** For overridden name, description and instructions, must both AR and EN be given, or may one language be overridden while the other is inherited from canonical?
- **Options:** (a) Require both AR and EN whenever a field is overridden. (b) Allow either or both and inherit the missing language from canonical. (c) Use (b) for name only and (a) for description and instructions.
- **Implications:** (a) self-contained overrides, but every edit needs two translations. (b) partial localization, so one displayed name can mix canonical and workspace text; a plan freeze must then record the per-language source. (c) two validation rules.
- **Advisory recommendation (not a decision):** (b), with the per-language source recorded so the freeze is deterministic.
- **Blocked:** T044 (description shape), T046 (name column), T049 (language selection), T056 (name-language freeze), T040 (editor), T037 (name assertions).

### F16-MCQ-G — Override alternatives: seeded into the plan, or live (re-framed from F16-MCQ-10) — ANSWERED: FROZEN AT PUBLICATION (S36-PO-3, round 4; label and count residual)

- **Status (S36-PO-3, clarified by S37-PO-10):** override alternatives are frozen with the published plan at publication. At most three unique target identities are allowed per exercise; alternatives override writes were unblocked by S36-PO-5.

- **Feature / where found:** 016 · `spec.md` FR-025 (line 125) and FR-027 (line 127); `contracts/catalog-api.md` client-view paragraph (line 119); `plan.md` line 36; critique F21.
- **Question:** Are an exercise's workspace alternatives copied into a plan when the exercise is added (seeded and frozen), or re-resolved from the override at each client view (live)? If live, may workspace-private targets be shown?
- **Options:** (a) Seeded: copied into the plan at add-to-plan; the client sees only the plan's own alternative references; private targets then follow F16-MCQ-9. (b) Live: the client view re-resolves alternatives from the workspace override at each view, which needs a client alternatives projection and a rule for private references.
- **Implications:** (a) matches the existing "adding an exercise populates the defaults" rule (`spec.md` line 125; F17 FR-005) and folds the MCQ-10 question into MCQ-9. (b) needs a new client projection and a private-reference rule.
- **Advisory recommendation (not a decision):** (a).
- **Blocked:** FR-027 (V2 alternatives freeze); T048 (count bound and seeded or live behaviour); T050 and T058 (client alternatives scope); T059 (F17 integration).

### F16-MCQ-H - Description frozen; published Video timing pending F16-MCQ-O

- **Status (S36-PO-3, round 4; Video clarified by S37-PO-1 Q2):** Description is frozen with the published plan at publication. Video stays live and follows the authorized library value. Description override writes were later unblocked by S36-PO-5.

- **Feature / where found:** 016 · `spec.md` FR-027 (line 127) and FR-023 (line 123); `plan.md` line 85; `data-model.md` line 46; critique F21.
- **Question:** Is the description (canonical or workspace) frozen at publication with names and instructions, or live like video?
- **Options:** (a) Frozen with instructions at publication. (b) Live, resolved at each view. (c) Frozen only where it is shown to clients.
- **Implications:** (a) matches the S36-PO-2 freeze for names and instructions by analogy, but the PO words do not mention description. (b) changes how historical plans read. (c) needs a presentation rule that is not defined.
- **Advisory recommendation (not a decision):** (a).
- **Blocked:** T044 (description freeze), T056 (description field in V2), the FR-027 V2 shape.

### F16-MCQ-I — Workspace-name search and override storage budget (added in round-3 review) — ANSWERED (S36-PO-3, round 4)

- **Status (S36-PO-3, round 4):** answered: (1)(b), search matches canonical and workspace names and shows the effective workspace name; (2)(b), no separate storage budget (no extra quota), database size monitored against the 70% exit trigger.

- **Feature / where found:** 016 · `spec.md` FR-035 (line 135) and FR-015; `plan.md` line 38; `data-model.md` line 54; critique F19. Not in the critique's MCQ list; added because F19 cannot be specified without it.
- **Question (1):** Which names does a workspace library search match: canonical names only, workspace names only, or both (returning the effective name)? **Question (2):** Is a per-workspace override storage or write-rate budget required, and with which numbers?
- **Options (1):** (a) canonical names only. (b) canonical and workspace names; results show the effective name. (c) effective name only (the name the workspace user sees).
- **Options (2):** (a) a D16-10-style per-workspace budget with numbers set by the PO. (b) no separate budget; database size is monitored against the 70% exit trigger.
- **Implications:** (1)(a) is simple, but a trainer may not find an exercise renamed in their workspace. (1)(b) matches what users see and needs an effective-name index. (1)(c) hides canonical names after an override. (2)(a) needs numbers the PO has not supplied. (2)(b) relies on monitoring only.
- **Advisory recommendation (not a decision):** (1)(b); (2)(b) until the PO sets numbers.
- **Blocked:** T064 (search semantics and storage budget). The length bound in FR-035 is not blocked.

### F16-MCQ-9 (round 3: kept open; answered in round 4 by S36-PO-3) — client video for workspace-private exercises

- Original text is in the F16-MCQ-9 section above; it is **not** marked answered. The S36-PO-2 words ("videos update live") point toward option (a), so a one-line PO confirmation would close it. The advisory recommendation stays advisory.
- **Blocked:** T045 (client visibility), T050 and T058 (private-video assertions), FR-024.

### FYI-1 — `video: null, source 'none'` is a spec-added default (not a PO question)

- FR-014 returns explicit absence when neither a workspace nor a canonical video is configured. The PO did not describe this state. The risk is low; it is reported for awareness only.

### FYI-2 — Video host list: `docs.google.com` (architect confirmation, not a PO question unless the architect escalates)

- D16-3 says "HTTPS YouTube/Google Drive only". The current validators on main (`supabase/migrations/20261106105000_catalog_video_resolution.sql`, `app_private.catalog_video_url_allowed`) and PR #43 (`lib/catalog/video-variation.ts`) also accept `docs.google.com`. FR-014 states the D16-3 host list. Task T061 aligns the validators once the architect confirms the list. Escalate to the PO only if Google Docs links are wanted.

### FYI-3 — Merged-source media (architect confirmation)

- FR-028 resolves the plan's own referenced identity for video, never the merge survivor. It derives from FR-010 and FR-011 (plan references and media availability stay unchanged). The critique offered a courtesy note to the PO if the architect wants this reviewed; the architect decides.

## S37-PO-5 F16 answers (round 5)

Source quotations: `C:/Users/NEW LAP/.lifter/runs/s37-luna-f16-r5/report.md` (verbatim S36-PO-5 block and earlier F16 source lines). S36-PO-5 is final and supersedes conflicting earlier S36 wording.

| Item                                                               | Status                         | Binding meaning                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Earlier F16-MCQ-J (workspace field set)                            | ANSWERED by S36-PO-5 lines 4-6 | Exactly eight fields are editable locally: Name, Description, Notes, Video, Alternatives, Default Rest Time, Default RIR, Default Reps. All authorized WO/Trainers may edit all eight. New global exercises appear automatically without overwriting local customizations. |
| F16-MCQ-K (CodeRabbit thread 861BYOr; answered by S36-PO-5 line 6) | ANSWERED by S36-PO-5 line 6    | All eight fields are workspace-editable. Legacy `docs.google.com` host handling is separately closed by F16-MCQ-P / S37-PO-10. References: FR-003; T037, T040, T047. |
| F16-MCQ-L (CodeRabbit thread tN4f; answered by S36-PO-5 line 7)    | ANSWERED by S36-PO-5 line 7    | Keep existing Notes; remove Instructions and preserve unique data into Notes. V1 taxonomy metadata outside the eight-field library is retained through the exact immutable version reference already carried by the plan; A55 is resolved as a technical detail.           |
| F16-MCQ-O — Video in published-plan frozen values                  | ANSWERED by S37-PO-1 Q2 = A    | Video stays live and follows the library (S36-PO-2); published non-video values remain frozen.                                                                                                                                                                             |

## S37-PO-1 Q2 and S37-PO-10 (round 6; byte-exact PO words)

S37-PO-1 Q2: Q2 "F16: S36-PO-5 says 'Published plans retain frozen values' inside the Defaults sentence, while S36-PO-2 said exercise videos update live in published plans. Is Video frozen in published plans?" = "A: Video stays live (Recommended)" — option text: "Frozen values = name/description/notes/alternatives/defaults; video URL follows the library (S36-PO-2)."

S37-PO-10: S37-PO-10 (2026-11-08, PO message verbatim, answering F16-MCQ-Q, -P, -F-R, -G-R, -D-R; F16-MCQ-O was answered by S37-PO-1 Q2 = A, video stays live):
PO final: English name required, Arabic optional (Global/Workspace). One optional Description, any language. Max 3 unique Alternatives. Remove dummy docs.google.com links; no legacy support. Account deletion frees email/phone for fresh registration in another workspace, no data transfer. Record in F11/F12. Decisions closed; proceed through gates, no merge without approval.

## S49-PO-3 F16 decisions (2026-11-12; byte-exact)

Source: `C:/Users/NEW LAP/.lifter/runs/s49-po/s49-po-3.verbatim.txt`; SHA256: `193ed59b59c6d77bb641ac2fc22ce85bd157c1271db322f3a5c613567dfec550`.

Verbatim PO record follows; S49-R9 is the separate architect mapping.

#86 decisions:
MCQ-1 = A
MCQ-2 = A
Use server-side search, pagination, debouncing, and preserve selected alternatives.
Enforce 2,000 characters consistently for Notes and stored Video text references only, not actual video files. Audit existing data and never silently truncate.
Commit the CodeRabbit fixes and rerun all required gates on the new exact SHA.
Implementation mapping: architect ruling S49-R9 (not PO words). S49-R11 governs merge sequencing and greens.
