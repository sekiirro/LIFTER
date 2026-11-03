# F15 Spec Kit Analyze

**Date:** 2026-11-03 (S30 refresh after S30-PO-1 Q2 resolution)
**Analysed implementation commit:** `4fe273f1c23f1bf638669e6b56770bfa5271e129`; accepted patch applied on `sk-015-r3`.
**Method:** Static Spec Kit analysis; no suite executed. Source tests inspected. Constitution v1.4.0 reviewed.

## Inventory and entry check

- `spec.md`: 39 numbered FRs, 22 measurable SCs, seven Given/When/Then scenario groups; present.
- Clarifications / PO register: `spec.md` records SK-015-01 resolved by S30-PO-1 Q2 with pinned source commit `5084916469414ca743afe980e31c69cf593587fe`; it states no open ambiguity remains for that item. Other readiness gates remain open. **PASS.**
- `plan.md`, `tasks.md`: present; 39/39 FRs in coverage index. T049 now carries `[FR-022]` as accepted. No task checkbox changed.
- `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `checklists/requirements.md`, `checklists/analyze.md`: present.
- Traceability: 61 FR/SC rows; 29 VERIFIED, 31 PARTIAL, 1 NOT-FOUND. Architect independently confirmed all 76 named test citations resolve on the cited branch. Static verification only.
- Analyze is dated after the accepted task edit. There are no open CRITICAL/HIGH findings; the product clarification entry gate passes for the resolved copy item.

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | PO clarification | MEDIUM | `plan.md:106`; `spec.md` S14 stable inventory B06 and Terms Card | Sex-label and Terms AR/EN wording were draft pending PO approval. | Resolved by S30-PO-1 Q2, recorded in Clarifications with the approved source commit. |
| A2 | Ambiguity statement | MEDIUM | `spec.md` decision sections; `plan.md:104-110` | Prior to this refresh, no explicit ?No open ambiguities? statement was recorded and SK-015-01 remained open. | Resolved: SK-015-01 is recorded; remaining readiness items are explicitly distinguished from unresolved product ambiguity. |
| A3 | External readiness | MEDIUM | `plan.md:107-108`; FR-012/019/033; SC-014/015/020 | Local/synthetic evidence does not prove hosted backup/PITR retention feasibility or authoritative P4 facts. | Keep real-data readiness blocked until required evidence exists. |
| A4 | Terminology / scope | LOW | `spec.md` FR-032; plan OPEN items | Future attachment storage is excluded, while SC-019/020 say ?wherever attachments exist?; conditional wording could be read as MVP scope. | Retain explicit no-MVP-storage scope; escalate only if intended scope differs. |

## Coverage and constitution

FR-to-task coverage is 39/39 (100%). T049 is now tagged to FR-022; other tasks are tagged or identify evidence/dependencies. Constitution principles I?IX reviewed; no direct textual conflict found. External readiness gaps remain gates, not exceptions. No task checkbox or requirement meaning changed.

## Static traceability

See `traceability.md`: 29 VERIFIED, 31 PARTIAL, 1 NOT-FOUND. An asserting test was statically located for each VERIFIED row; no test suite was run. Suite non-execution is not a finding.

## Verdict

**PASS WITH OPEN MEDIUM FINDINGS** ? 0 CRITICAL, 0 HIGH, 2 MEDIUM, 1 LOW. SK-015-01 is resolved; the remaining MEDIUM findings are external readiness gates.

## History

- **Round 6 (2026-11-03):** SK-015-01 resolved by S30-PO-1 Q2 and recorded in `spec.md` Clarifications; A1 and the SK-015-01 portion of A2 closed. A3 and A4 remain open. Static review only; no tests run.

- **Round 3 (2026-11-03):** T049 lacked an inline FR tag; that HIGH finding is resolved by the accepted `[FR-022]` patch. Prior review identified the remaining copy question, distributed ambiguity record, external readiness gates and conditional attachment terminology. No checkbox was changed in this round.
