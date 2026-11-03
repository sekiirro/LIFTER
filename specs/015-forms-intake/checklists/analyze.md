# F15 Spec Kit Analyze

**Date:** 2026-11-03
**Analysed commit:** `4fe273f1c23f1bf638669e6b56770bfa5271e129`
**Method:** Static Spec Kit analysis; no test suite executed. Tests were checked in source. Constitution v1.4.0 reviewed.

## Entry check

- Numbered FRs, measurable SCs and Given/When/Then scenarios: PASS — 39 FRs, 22 SCs, seven user-story scenario groups (`spec.md:206-448` and User Scenarios section).
- Clarifications/PO register: PARTIAL — binding decisions and sources are recorded, but “No open ambiguities” is not stated, and sex labels/Terms AR/EN copy remain explicitly pending PO approval (`plan.md:106`, `spec.md` S14 copy notes).
- Plan/tasks coverage: PARTIAL — plan and task IDs T001-T049 exist; all 39 FRs map to tasks in the coverage index. T049 lacks an inline FR tag; a one-line output patch tags it FR-022. No checkbox changed.
- Analyze checklist: FAIL at base — existing checklist was dated 2026-10-30 and did not analyze the current head. This refresh follows the current spec/plan/tasks. It still has an open HIGH finding, so the entry gate remains FAIL.

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | Task traceability | HIGH | `tasks.md` T049; task coverage index `:109-147` | T049 reconciles SQL/TypeScript capability parity but has no inline FR tag and is absent from the coverage index. It aligns with FR-022's approved capability parity requirement and plan source at `plan.md:74-76`. | Route the single FR-022 tag via `015-proposed-edits.patch`; no task checkbox or behavior text changed. |
| A2 | PO clarification | MEDIUM | `plan.md:106`; `spec.md` S14 stable inventory B06 and Terms Card | Sex-label and Terms AR/EN wording remain DRAFT/pending. S28-PO-2 explicitly approved only the listed post-batch F15 key `forms.staffQuestionOptional`; it does not resolve these earlier copy items. | PO to approve exact existing copy or direct revisions. Raised as `SK-015-01`; publication/rendering that copy remains blocked. |
| A3 | Ambiguity statement | MEDIUM | `spec.md` decision sections; `plan.md:104-110` | PO decisions and explicit technical gates are distributed; no exact “No open ambiguities” statement is present. | Clarify the decision register after SK-015-01 is resolved; do not represent the open copy gate as settled. |
| A4 | External readiness | MEDIUM | `plan.md:107-108`; FR-012/019/033; SC-014/015/020 | Backup/PITR retention feasibility and authoritative P4 facts remain explicit production gates. Their local/synthetic tests do not prove hosted recovery-copy deletion or real-data classification readiness. | Keep blocked for real data until the listed evidence exists. |
| A5 | Terminology / scope | LOW | `spec.md: FR-032`; plan OPEN items | FR-032 retains future attachment storage as excluded pending separate scope, while SC-019/020 mention attachments “wherever attachments exist.” This is conditional but can be read as an MVP attachment requirement. | Keep the explicit no-MVP-storage scope and interpret those SC clauses conditionally; ask PO only if intended scope differs. |

## Coverage and consistency

- FR-to-task coverage: 39/39 = 100% in the coverage index. Task-to-FR inline tag review: T049 is the one unmapped task; all other task bodies are tagged or explicitly identify non-feature evidence/dependencies.
- Static FR/SC verification: see `traceability.md` (file and asserting test name for each row, or a specific PARTIAL/NOT-FOUND gap). No suite was executed; non-execution is not a finding.
- Inventory: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md`, existing `checklists/requirements.md`, existing `checklists/analyze.md`, `reports/`, and new `traceability.md`.
- Constitution I-IX: no direct textual conflict identified. Data isolation, least privilege, versioning, privacy, accessible bilingual UI and reliability gates are explicit; external runtime/readiness evidence remains outside this static pass.
- No task checkbox changed. No application code or tests were changed or run.

## Verdict

**FAIL** — 0 CRITICAL, 1 HIGH, 3 MEDIUM, 1 LOW. The high finding is the uncategorized T049 task; PO copy approval and production gates remain open. Test-suite execution status is intentionally not used to grade static traceability.

## History

- **2026-10-30 base review:** consistency pass reported no CRITICAL/HIGH, 39/39 FR task coverage, and no implementation/DB/Docker/Supabase verification. It listed remaining draft-copy approvals. Superseded for current-head traceability by this review; history retained.