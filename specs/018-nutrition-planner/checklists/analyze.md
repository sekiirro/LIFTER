# F18 Spec Kit Analyze

**Date:** 2026-11-03  
**Analysed commit:** `066636358f7256e10426efae2290112f15a62e14`  
**Method:** Static cross-artifact analysis; no tests run. Constitution v1.4.0 reviewed.

## Entry check

- Numbered FRs, measurable SCs, user stories with G/W/T scenarios: PASS (`spec.md:22-111`; 16 FR identifiers, six SCs).
- Clarifications/PO register: PARTIAL. PO decisions are quoted/cited in the spec and plan; an explicit “no open ambiguities” statement is absent.
- Plan and task IDs: PASS. FR/SC coverage index exists. Inline task tags are partial, not comprehensive.
- Dated analyze/checklist: FAIL at base; this analysis and requirements checklist are new and dated after spec/plan/tasks. C/H findings remain open.

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | Cross-feature contract | HIGH | spec.md:83, 106-111; tasks.md: input; plan.md Dependencies | Shared lifecycle and activation references `../019-plan-core/spec.md`, absent from this branch. PC-FR/SC/acceptance cannot be validated locally. | Keep shared lifecycle work gated on the canonical Plan Core contract; do not duplicate or infer it. |
| A2 | Coverage | HIGH | tasks.md: FR/SC coverage index and task bodies | Task-to-FR coverage exists in an index, but only some task bodies explicitly name FR/SC; no inline tag coverage for all T001-T025. This prevents straightforward task-level auditing. | Tag task descriptions to their current mappings in a routed proposal. |
| A3 | Clarification | MEDIUM | spec.md: decision citations; plan.md | No explicit statement that “no open ambiguities” remains. S20/S24/S27 rulings are cited, but they are distributed. | Add a clarification/session statement only after architect confirms all cited product decisions are reconciled. |
| A4 | Acceptance evidence | MEDIUM | SC-001..SC-006; T006-T025 | SQL parity, authorization/RLS, selection, current-version export and benchmark gates are not demonstrated by static unit tests; most DB tasks remain unchecked. | Keep status PARTIAL/NOT-FOUND until their named tests and evidence are available. |
| A5 | Technical requirement | MEDIUM | FR-003, SC-006 | SC-006 explicitly says the maximum-byte envelope is shared/engineering-owned, but depends on unavailable Plan Core cap. No cap value can be reviewed in this checkout. | Track as cross-feature dependency, not a new product decision. |
| A6 | Task coverage | LOW | tasks.md: coverage index | Requirement mappings in the index are more complete than inline task tags; any task omitted by the index is hard to detect without a refreshed mapping. | Reconcile during task-tag repair. |

## Coverage and consistency

- 16 FR identifiers (FR-001, FR-001b, FR-002..010, FR-010a/010b, FR-011..013), 6 SCs.
- Coverage index maps all 16 FR IDs and six SCs; FR-011 is explicitly excluded by scope, and the other 15 in-scope FRs have task mappings. No requirement text changed.
- Artifact inventory: spec, plan, debate, tasks, five evidence/review docs; no checklists/analyze.md, checklists/requirements.md, traceability.md, research, data-model, contracts or quickstart at base. New checklists and traceability now supplied.
- Constitution alignment: no direct conflict identified. Privacy, tenant isolation, exact calculations, immutable versions, accessible bilingual UI and reliable operations are specified; runtime checks remain pending.
- No PO decision raised; unresolved references are engineering/traceability dependencies.

## Verdict

**FAIL** — 0 CRITICAL, 2 HIGH, 3 MEDIUM, 1 LOW. Plan Core contract and task-level traceability block a clean entry gate. No implementation work was performed.