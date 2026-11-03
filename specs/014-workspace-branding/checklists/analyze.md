## Specification Analysis Report — F14 workspace branding, Hero and F14b

**Date:** 2026-11-03  
**Analysed commit:** `da56320af3cc8bba73a2e4f09258b7339a8a9504`  
**Scope:** Static review of F14 spec/plan/tasks, the Hero implementation plan and code/test sources. Also reviewed F14b code on `origin/014b-branding-uploads` at `630c3dbfa3e5422e7793de2cf65165e586301eef`. No tests were run.

### Entry check — mandatory Spec Kit gate

| Check | Result | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs, Given/When/Then scenarios | PASS | `spec.md` FR-001–FR-018, SC-001–SC-011 and Given/When/Then scenarios for Stories 1, 2, 3 and 5. |
| Clarifications / PO decision register; explicit no-open-ambiguities statement | PARTIAL | F14 final PO decision record and `plan.md` “Genuine PO conflicts: None”; no `## Clarifications` session or exact “No open ambiguities” statement. S27/S28 decisions postdate this spec and are not reconciled into it. |
| Plan covers touched scope; task ID tagged with FR IDs | FAIL | `plan.md` and `hero-implementation-plan.md` cover F14/Hero. T001–T051 have no FR tags. The F14b bullets in `tasks.md` have no task IDs. No Hero implementation task ID was identified. |
| Dated analyze checklist after spec/plan/tasks, zero open CRITICAL/HIGH | FAIL | No `checklists/analyze.md` existed at this head; only `checklists/requirements.md` was present. |
| Spec Kit prerequisites | PASS | Local `.specify/feature.json` points to `specs/014-workspace-branding`; prerequisite script resolves spec, plan and tasks. The pointer is ignored machine-local state. |

### Inventory

Present: `spec.md`, `plan.md`, `tasks.md`, `research.md`, `data-model.md`, `quickstart.md`, three contracts, `hero-implementation-plan.md`, implementation reports, and `checklists/requirements.md`. Missing at this head: `checklists/analyze.md`, `traceability.md`. `hero-implementation-plan.md` has no linked task ID. Branch `origin/014b-branding-uploads` has no F14 spec directory, spec, plan or tasks; its code is assessed separately in the F14b worktree addendum.

### Findings

| ID | Category | Severity | Location | Summary | Recommendation |
|---|---|---|---|---|---|
| A1 | Checklist | HIGH | `checklists/analyze.md` | Required analysis checklist is absent. | Add a dated analysis and keep its high/critical count at zero before implementation work. |
| A2 | Coverage | HIGH | `tasks.md` T001–T051; F14b subsection; `hero-implementation-plan.md` | Existing F14 tasks lack FR tags; F14b work has no task IDs; Hero work has no task ID. | Add evidence-backed FR tags to existing F14 tasks and task IDs for Hero/F14b through the owning planning workflow. A F14 task-tag-only diff is supplied separately. |
| A3 | Requirement traceability | HIGH | `hero-implementation-plan.md` “Published art and luminance”; S27-PO-1 | Selected Light/Dark/Follow Device theme behavior and dark print behavior are approved but not stated as an FR. Existing FR-007/015 cover contrast and design-system use generally. | Record PO decision on adding explicit FR wording; proposed text is quoted in `po-decisions.md`. |
| A4 | Requirement traceability / consistency | HIGH | `spec.md` FR-016; S28-PO-4 | FR-016 says branding must not change signup behavior, while the later approved Hero work restores signup fields and age calculation. The F14 spec has no explicit FR for the approved field contract or F15 Intake reuse. | Ask PO whether to add a scoped signup-field FR/exception or keep the contract wholly in F15 and document a Hero dependency; quoted text/options are in `po-decisions.md`. |
| A5 | Requirement traceability | HIGH | `hero-implementation-plan.md`; S28-PO-5 / S29-PO-1 | Approved Glisse implementation, tests and updated screenshots have no F14 FR. | Record whether the approved Glisse scope should be a dedicated FR or a task-level implementation under existing UI requirements; proposed quote is in `po-decisions.md`. |
| A6 | Requirement traceability | HIGH | `tasks.md` F14b subsection; S20-22 | Seven approved F14b interaction/copy behaviors are in the PO register but are not explicit FR text. | Record whether to add one or more FRs using the verbatim approved text; all seven are itemized in `po-decisions.md`. |
| A7 | Clarification | MEDIUM | `spec.md` PO record and `plan.md` final decisions | There is no exact statement “No open ambiguities.” S28 decisions introduced later Hero scope not represented in the F14 decision register. | Reconcile the later PO records through the requirements workflow and state the open-ambiguity status explicitly. |
| A8 | Scenario structure | LOW | `spec.md` User Stories | Story numbering skips Story 4. | Confirm whether numbering is intentionally preserved from earlier drafts or renumber for continuity; no behavior is inferred. |

### Coverage and constitution

- Requirement-to-task coverage inferred from task descriptions: 18/18 FRs (100%); explicit FR-tag coverage: 0/18 (0%).
- T001–T051 all have a plausible functional or release-gate mapping by description; explicit task tags are absent.
- Constitution v1.3.0 at this analyzed branch: no direct technical conflict found in the F14 scope; workspace isolation, immutable versions, restricted access, UI and release evidence are represented. S28 signup and Hero design additions postdate this branch’s spec and need explicit traceability.
- No material duplicated FRs identified. F14b PO scope is a documented deferral under FR-009; the actual interaction details remain untraced.

### Metrics and verdict

- FRs: 18; SCs: 11; task IDs: 51.
- Findings: 0 CRITICAL, 6 HIGH, 1 MEDIUM, 1 LOW.
- **Verdict: FAIL — no new implementation work should be started from this gate.** The Spec Kit entry check fails on task tags and missing dated analysis, with approved Hero/F14b behaviors lacking FR-level traceability.
- Static verification only; no test suite was run. See `traceability.md` for FR/SC-to-test evidence and statuses.

### PO decision items

See `C:/Users/NEW LAP/.lifter/runs/s29-luna-sk-a2/po-decisions.md`: `SK-014-01`–`SK-014-03` cover Hero theme, signup fields and Glisse; `SK-014B-01`–`SK-014B-07` cover the seven F14b decisions. These propose only quoted PO wording; no requirement text was added to `spec.md`.
