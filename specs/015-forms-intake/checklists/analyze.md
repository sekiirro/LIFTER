# F15 Spec Kit Analyze

**Date:** 2026-11-03 (S30 refresh after accepted T049 task patch)
**Analysed implementation commit:** `4fe273f1c23f1bf638669e6b56770bfa5271e129`; accepted patch applied on `sk-015-r3`.
**Method:** Static Spec Kit analysis; no suite executed. Source tests inspected. Constitution v1.4.0 reviewed.

## Inventory and entry check

- `spec.md`: 39 numbered FRs, 22 measurable SCs, seven Given/When/Then scenario groups; present.
- Clarifications / PO register: decisions and sources recorded; exact ?No open ambiguities? statement absent. Sex-label and Terms AR/EN copy remain pending PO (`plan.md:106`; S14 copy notes). **PARTIAL.**
- `plan.md`, `tasks.md`: present; 39/39 FRs in coverage index. T049 now carries `[FR-022]` as accepted. No task checkbox changed.
- `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `checklists/requirements.md`, `checklists/analyze.md`: present.
- Traceability: 61 FR/SC rows; 29 VERIFIED, 31 PARTIAL, 1 NOT-FOUND. Architect independently confirmed all 76 named test citations resolve on the cited branch. Static verification only.
- Analyze is dated after the accepted task edit. There are no open CRITICAL/HIGH findings; the open copy ambiguity means the product clarification entry gate remains incomplete.

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | PO clarification | MEDIUM | `plan.md:106`; `spec.md` S14 stable inventory B06 and Terms Card | Sex-label and Terms AR/EN wording remain DRAFT. S28-PO-2 approved only `forms.staffQuestionOptional`, not these strings. | Keep `SK-015-01` with the PO; block finalizing the copy. |
| A2 | Ambiguity statement | MEDIUM | `spec.md` decision sections; `plan.md:104-110` | No explicit ?No open ambiguities? statement; PO decisions and technical gates are distributed, and SK-015-01 remains open. | Do not claim no ambiguity until the PO item is resolved and recorded. |
| A3 | External readiness | MEDIUM | `plan.md:107-108`; FR-012/019/033; SC-014/015/020 | Local/synthetic evidence does not prove hosted backup/PITR retention feasibility or authoritative P4 facts. | Keep real-data readiness blocked until required evidence exists. |
| A4 | Terminology / scope | LOW | `spec.md` FR-032; plan OPEN items | Future attachment storage is excluded, while SC-019/020 say ?wherever attachments exist?; conditional wording could be read as MVP scope. | Retain explicit no-MVP-storage scope; escalate only if intended scope differs. |

## Coverage and constitution

FR-to-task coverage is 39/39 (100%). T049 is now tagged to FR-022; other tasks are tagged or identify evidence/dependencies. Constitution principles I?IX reviewed; no direct textual conflict found. External readiness gaps remain gates, not exceptions. No task checkbox or requirement meaning changed.

## Static traceability

See `traceability.md`: 29 VERIFIED, 31 PARTIAL, 1 NOT-FOUND. An asserting test was statically located for each VERIFIED row; no test suite was run. Suite non-execution is not a finding.

## Verdict

**PASS WITH OPEN MEDIUM FINDINGS** ? 0 CRITICAL, 0 HIGH, 3 MEDIUM, 1 LOW. The Analyze threshold is clear; the mandatory product-clarification gate remains incomplete because SK-015-01 is with the PO.

## History

- **Round 3 (2026-11-03):** T049 lacked an inline FR tag; that HIGH finding is resolved by the accepted `[FR-022]` patch. Prior review identified the remaining copy question, distributed ambiguity record, external readiness gates and conditional attachment terminology. No checkbox was changed in this round.
