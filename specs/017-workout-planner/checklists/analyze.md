# F17 Spec Kit Analyze

**Date:** 2026-11-03  
**Analysed commit:** `fd84fbaa334b9bfb77038fe17cd4996e6533f90f`  
**Method:** Static Spec Kit analysis only; no tests executed. Constitution reviewed at `.specify/memory/constitution.md` (v1.4.0).

## Entry check

- Numbered FRs, measurable SCs, Given/When/Then scenarios: PASS (`spec.md:14-106`; FR-001 through FR-016 including 001a/004a/004b; SC-001 through SC-005).
- Clarification/PO register and explicit no-open-ambiguities statement: PARTIAL. Decision basis (D17 decisions, S20 Message B) is cited in FR text and plan, but there is no `## Clarifications` session or consolidated register explicitly stating “no open ambiguities”.
- Plan covers scope and task IDs exist: PASS (`plan.md`, `tasks.md`, T001-T047). Strict task tag gate: FAIL; task bodies do not carry FR identifiers; a trailing coverage index maps 13 FRs and five SCs to tasks. FR-015 is explicitly excluded by spec.
- Current analyze and requirements checklist: FAIL at base (both absent); this analysis and requirements checklist are now created. Analyze date is after latest spec/plan/tasks changes. Open CRITICAL/HIGH findings remain.

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | Coverage / traceability | HIGH | tasks.md: task bodies; coverage index at lines 99-123 | Task bodies are not tagged with FR IDs. Coverage is available only through the final index, which omits FR-015 by stated scope and does not identify which test proves each mapping. | Add FR tags to the implementation lane’s task bodies and preserve the index; route changes as a patch. |
| A2 | Cross-feature contract | HIGH | spec.md:44-45, 75-77, 85; SC-004; plan.md Dependencies | F17 delivery/activation delegates to Plan Core PC-FR-004/005, but `specs/019-plan-core/` is absent on this branch. Thus the acceptance contract cannot be checked here. The mandated review of 019 separately records its missing SC/scenarios. | Keep dependent behavior blocked until the canonical Plan Core contract is available and traceable; do not invent F17 acceptance semantics. |
| A3 | Clarification | MEDIUM | spec.md: Requirements/Assumptions; plan.md Deferred implementation detail | No explicit statement that all product ambiguities are closed. S20 decisions are cited, while two PR #26 review items (workspace-template `coaching_work` scope and no-op autosave readiness) remain implementation-required and must stay consistent with spec/tests. | Clarify status in the owning lane; these existing technical rulings do not authorize new product behavior. |
| A4 | Evidence | MEDIUM | SC-002, SC-004, SC-005; tasks T011-T047 | Database/RLS, first-pair activation, and performance gates remain unverified; T043 benchmark is unchecked. | Keep acceptance criteria gated; static review does not establish runtime or benchmark completion. |
| A5 | Duplication / scope | LOW | FR-001/001a/002/007; Plan Core references | Several lifecycle requirements repeat delegation to PC-FR-001..007. Duplication may drift when the canonical contract arrives. | Retain the explicit ownership boundary and cross-link the canonical contract after it is available. |

## Coverage summary

- Requirements inventoried: 20 FR identifiers (FR-001, FR-001a, FR-002..FR-016 plus FR-004a/004b); five SCs.
- FRs with at least one task in the coverage index: 19/20; FR-015 is explicitly excluded, so in-scope FR coverage is 18/19 (95%). FR-013 has no coverage-index row.
- Tasks: T001-T047 (47). Task-to-FR tagging in individual task descriptions: 0/47; coverage-index references name 42/47 tasks. T008, T010, T030, T046 and T047 are not mapped by the index. FR-013 is also absent from the index.
- Plan artifacts: spec, plan, debate, tasks and two evidence docs present; no research/data-model/contracts/quickstart files listed as required by the plan template for this feature. `checklists/analyze.md` and `checklists/requirements.md` added in this lane.
- Constitution: no direct conflict found in the static plan/spec review. Scope includes workspace isolation, least privilege, immutable versions, privacy, accessible bilingual UI, concurrency and idempotency; DB gates are not runtime-verified.
- No product PO decision raised; current gaps are cross-feature contract/evidence and implementation traceability.

## Verdict

**FAIL** — 0 CRITICAL, 2 HIGH, 3 MEDIUM, 1 LOW. High findings block a clean Spec Kit entry gate; no implementation work was performed.