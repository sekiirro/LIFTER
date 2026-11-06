# Spec Kit Analyze - F4 Authentication & Manual Recovery Links

- Date: 2026-11-06 (after the last change to spec/plan/tasks in this documentation change)
- Base: `origin/main` `7e2d0149b0370e4389b462130508352bbd69daa2`
- Method: static cross-artifact review of `spec.md`, `plan.md`, `tasks.md`, `traceability.md`, `docs/04-changes-and-questions.md:25` and `docs/13-production-readiness.md:32-34`. No tests or CI jobs were run.

## Inventory and entry check

- Present: `spec.md` (FR-001..015, SC-001..007, Given/When/Then scenarios), `plan.md`, `tasks.md` (T001..T031), `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `checklists/requirements.md`.
- Missing at base: Analyze, traceability, Clarifications section. Added by this change.
- Clarifications: spec.md `## Clarifications` records S31-PO-2 SK-004-01, SK-004-06 and S31-PO-3 SK-004-04, quoted from the ledger. Open items are stated explicitly (ND-F4-5, ND-F4-7).
- Plan/tasks: T030 and the new T031 carry FR tags; traceability maps FR-001..015 to tasks.

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | Decision to implementation | MEDIUM | `tasks.md` T031; `data-model.md:34`; `research.md:57` | Decided limits (10 per staff per hour, 3 per client per 24 hours) differ from the merged placeholders (20 / 3 / 1 hour). Not implemented; data-model and research still describe placeholders. | Run the T031 Spec Kit cycle; update data-model and research with it. |
| A2 | Source gap | MEDIUM | `spec.md` ND-F4-3; `docs/13-production-readiness.md:34` | Session-lifetime enforcement deferral ("PO decision: B") is not in the PO ledger. Recorded as a docs/13 citation only. | PO confirms the source (report PO-DECISION-NEEDED). |
| A3 | Ledger not reconciled | MEDIUM | `spec.md` ND-F4-1, ND-F4-2; `plan.md:13` | The ledger also holds answers SK-004-02 and SK-004-03 for ND-F4-1/2; they are outside this change's scope and the spec still shows deny-by-default interim behaviour. SK-004-02 requires a new Spec Kit cycle. | Separate change after PO/architect scoping. |
| A4 | Task closure | LOW | `tasks.md` T030 | T030 stays unchecked: PR merge, CI and CodeRabbit gates are not met by the documentation change alone. | Tick after merge with gates evidenced. |
| A5 | Evidence breadth | LOW | `traceability.md` | Rows are MAPPED from task text; test names were not re-checked. | Refresh with exact test names in a later pass. |

## Coverage and constitution

FR-to-task mapping is 15/15 (100%). No task checkbox changed. Constitution III (least privilege) and VII (privacy) are unaffected: no behaviour, schema or test changed.

## Verdict

**PASS** - 0 CRITICAL, 0 HIGH, 3 MEDIUM, 2 LOW.
