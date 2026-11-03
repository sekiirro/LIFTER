# Spec Kit Analyze ? F14 Production Registration Hero

- Date: 2026-11-03
- Analyzed implementation commit: `da56320af3cc8bba73a2e4f09258b7339a8a9504` (`origin/014-hero-impl`).
- Spec/plan/task inputs: proposed changes in `014-hero-proposed-edits.patch`; this documentation commit is static review only.
- Scope: Hero under F14. F14b-specific source/test evidence is excluded.
- Method: read-only cross-artifact analysis; `.claude/skills/speckit-analyze/SKILL.md`; no tests run.

## Entry check (Hero scope)

| Check | Status | Evidence |
|---|---|---|
| Numbered Hero FRs, measurable SCs, Given/When/Then scenarios | PASS (proposed) | `spec.md` FR-026..030, SC-018..022 and Hero acceptance scenarios in patch. |
| Clarifications and explicit no-open-ambiguities | PASS (proposed) | New `## Clarifications` cites S20/S21/S23/S27/S28/S29; F15 prefill owner is explicit. |
| Plan and tagged task IDs | PASS (proposed) | `plan.md`, `hero-implementation-plan.md`; T052..05 have FR tags in `tasks.md`. |
| Dated Analyze after proposed spec/plan/tasks; zero open CRITICAL/HIGH | PASS (this report) | 0 CRITICAL/HIGH findings. |

## Inventory

`spec.md`, `plan.md`, `tasks.md`, `hero-implementation-plan.md`, research, data model, quickstart, contracts, implementation reports, and `checklists/requirements.md` exist at the implementation base. `checklists/analyze.md` and `traceability.md` are review additions from this lane; refreshed for Hero scope. The Hero requirements and planning edits are proposed in a separate patch and are not committed to existing files.

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | Acceptance evidence | MEDIUM | FR-028 / SC-020; `traceability.md` | The current branch lacks the approved signup fields, DOB-derived age, F15 handoff implementation, and asserting regression tests. | Keep T053 open; implement and add exact-head assertions in the authorized implementation lane. |
| A2 | Acceptance evidence | MEDIUM | FR-029 / SC-021; `traceability.md` | The current named Hero tests assert the material shell and contrast but do not establish Glisse/refraction behavior or the performance constraint. | Keep T052/T04 open until the approved Glisse treatment and its evidence are verified. |
| A3 | Acceptance evidence | LOW | FR-026 / SC-018 | Existing tests assert layout and screenshots, but do not directly compare all design details with the approved prototype. | Preserve prototype `97debaf` as visual source and attach updated screenshots for review. |

## Coverage and constitution

All 5 Hero FRs and 5 Hero SCs map to at least one Hero task (10/10 = 100%). New task items remain unchecked. The cited source decisions are quoted in FRs and scenarios. No constitution v1.4.0 conflict identified in the Hero scope; privacy, signup ownership, accessibility, theme tokens and existing merge gates remain intact.

## Metrics and verdict

- Hero FRs: 5; SCs: 5; Hero tasks: 5.
- Requirement/task coverage: 100% (10/10).
- Findings: 0 CRITICAL, 0 HIGH, 2 MEDIUM, 1 LOW.
- Traceability: 3 VERIFIED, 4 PARTIAL, 3 NOT-FOUND, 0 DEFERRED (10 Hero FR/SC rows).
- Verdict: **PASS WITH OPEN MEDIUM FINDINGS** for the documentation scope. Implementation acceptance remains open for the identified evidence gaps.
- No tests were executed. Static tests found in source are not represented as run or passed here.

## History

- Round 2 at `da56320af3cc8bba73a2e4f09258b7339a8a9504`: architect accepted findings A1-A6. The previous report incorrectly claimed F14b lacked a spec directory/artifacts; that claim is withdrawn. F14b tests belong to its branch and are excluded from this Hero traceability.
