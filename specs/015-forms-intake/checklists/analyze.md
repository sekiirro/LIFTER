# F15 Spec Kit Analyze

**Date:** 2026-11-03  
**Analysed commit:** `84cc3bbafcbf97cd7acea0fbde5224313ef36ac3`  
**Method:** Static Spec Kit cross-artifact review; no tests executed. Constitution v1.4.0 was reviewed as normative authority.

## Entry check

- Spec has numbered FRs (39) and measurable SCs (22): PASS (`specs/015-forms-intake/spec.md:206-448`). Acceptance scenarios are present for the seven user stories: PASS (spec user stories section).
- Clarifications/decision source: PASS; final PO decisions, D1-D4, Q1-Q5, S25-PO-8 and later copy approval are recorded in spec and/or cited PO records. No open product ambiguity is asserted for settled copy.
- Plan covers scope: PASS (`plan.md`). Tasks cover 39/39 FRs by explicit references/coverage index; 54 unique task IDs including T001-T054: PASS (`tasks.md`).
- Analyze dated after latest spec/plan/tasks change and 0 open CRITICAL/HIGH: FAIL. This refresh postdates latest branch changes, but analysis identifies high/medium gaps below.

## Findings

| ID | Category | Severity | Location | Finding | Disposition |
|---|---|---|---|---|---|
| A1 | Gate/evidence | HIGH | tasks.md: checked T001-T054; traceability.md | Existing checkboxes and historical task evidence claim completion, but this lane did not execute tests on analysed HEAD; current-head execution evidence cannot be certified here. | Preserve task states; traceability marks claims PARTIAL where static assertion mapping is incomplete. Architect/implementing lane to confirm executed test evidence before relying on checked boxes. |
| A2 | Ambiguity | MEDIUM | plan.md: OPEN Items, Draft copy approval | Plan still says sex labels and Terms AR/EN wording await approval. S28-PO-2 approved all new DRAFT strings in F15 as currently written; the exact current labels/Terms strings are covered by that scope. | Proposed closure is output-only patch; quote S28-PO-2, no plan committed. |
| A3 | Underspecification / external gate | MEDIUM | plan.md: OPEN Items, retention; FR-012; SC-014/020 | 30-day all-recoverable-copy legal/technical feasibility and backup/PITR evidence remains a production gate. It is explicit, not resolved by code/spec artifacts. | Retain gate; no product decision requested. |
| A4 | External dependency | MEDIUM | plan.md: OPEN Items, P4; FR-017/018/019; SC-007/015 | Authoritative first-pair delivery and responsible-Trainer coverage block real-data alert classification/scheduler; synthetic work can proceed. | Retain gate; no product decision requested. |
| A5 | Constitution / task evidence | LOW | plan.md: Constitution Check; tasks.md | Plan records all nine constitution principles as design-only checks; no runtime verification is claimed. Static analysis found no direct contradiction, but runtime evidence remains external to this pass. | Keep explicit design-only status. |

## Coverage and consistency

- Functional requirement coverage: 39/39 = 100% have task references in the tasks coverage index.
- Task-to-requirement mapping: 53 of 54 unique tasks carry FR IDs; T022 and T021 are carry-forward follow-up tasks without direct FR tags. They point to implementation/evidence details but are orphaned under strict FR-tag analysis.
- Success criteria: 22 numbered SCs exist; plan/task matrices reference the core SCs. Static test assertion mapping is incomplete; see traceability.md. No scenario or criterion was invented.
- Inventory present: spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md, tasks.md, checklists/analyze.md, checklists/requirements.md, reports/.
- No checked task was changed. No implementation code or tests were run.

## Verdict

**FAIL** — 1 HIGH, 3 MEDIUM, 1 LOW. Main blocker is current-head test execution evidence under the mandatory task checkbox rule. The approval wording inconsistency is addressed only by a proposed patch; retention/P4 remain explicit non-product release gates.

## History

- 2026-10-30 base review: requirements/plan/task consistency pass; 39/39 FR coverage; no C/H findings; no code, DB, Docker, Supabase verification claimed. Replaced by this current-head review for live verdict.
