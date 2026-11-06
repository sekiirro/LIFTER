# Spec Kit Analyze - F4 Authentication & Manual Recovery Links

- Date: 2026-11-06, re-run after the S35-R3 edits (after the last change to spec/plan/tasks in this documentation change)
- Base: `origin/main` `7e2d0149b0370e4389b462130508352bbd69daa2`
- Method: static cross-artifact review of `spec.md`, `plan.md`, `tasks.md`, `traceability.md`, `docs/04-changes-and-questions.md:25` and `docs/13-production-readiness.md:32-34`. No tests or CI jobs were run.

## Inventory and entry check

- Present: `spec.md` (FR-001..015, SC-001..007, Given/When/Then scenarios), `plan.md`, `tasks.md` (T001..T032), `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `checklists/requirements.md`.
- Missing at base: Analyze, traceability, Clarifications section. Added by this change.
- Clarifications: spec.md `## Clarifications` records S31-PO-2 SK-004-01, SK-004-06 and S31-PO-3 SK-004-04, quoted from the ledger. SK-004-02 and SK-004-03 were added in round 2 (S35-R2). Open items are stated explicitly (ND-F4-5, ND-F4-7).
- Plan/tasks: T030, T031 and T032 carry FR tags; traceability maps FR-001..015 to tasks.

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | Decision to implementation | MEDIUM | `tasks.md` T031; `data-model.md:34`; `research.md:57` | Decided limits (10 per staff per hour, 3 per client per 24 hours) differ from the merged placeholders (20 / 3 / 1 hour). Not implemented; data-model and research still describe placeholders. | Run the T031 Spec Kit cycle; update data-model and research with it. |
| A2 | Source gap | MEDIUM | `spec.md` ND-F4-3; `docs/13-production-readiness.md:34` | Session-lifetime enforcement deferral ("PO decision: B") is not in the PO ledger. Recorded as a docs/13 citation only. | PO confirms the source (report PO-DECISION-NEEDED). |
| A3 | Decision to implementation | MEDIUM | `spec.md` ND-F4-1, ND-F4-2; `tasks.md` T032 | SK-004-02 ("All workspace Trainers") and SK-004-03 ("Copy only") are now recorded verbatim in the spec register. SK-004-03 is already satisfied (`components/auth/RecoveryLinkDialog.tsx:40`). SK-004-02 is not implemented; Trainers stay denied until T032. | Run the T032 Spec Kit cycle on a new branch. |
| A4 | Task closure | LOW | `tasks.md` T030 | T030 stays unchecked: PR merge, CI and CodeRabbit gates are not met by the documentation change alone. | Tick after merge with gates evidenced. |
| A5 | Evidence breadth | LOW | `traceability.md` | Rows are MAPPED from task text. FR-001 is PARTIAL and FR-002/FR-003 UNVERIFIED: `tests/e2e/auth.spec.ts` asserts no sign-in, generic-error or sign-out behaviour. | Add app-level sign-in/sign-out tests in a later Spec Kit cycle; refresh remaining rows with exact test names. |

## Coverage and constitution

FR-to-task mapping is 15/15 (100%). No task checkbox changed. S35-R3 re-check: docs/13 AI-03 now also requires T032's app-layer permission change and tests (matches T032's two-wall scope); spec.md ND-F4-6 keeps the SK-004-06 quote and option text byte-identical and adds a labelled architect note that staff self-service recovery depends on open ND-F4-7 (no new decision, no new requirement). Constitution III (least privilege) and VII (privacy) are unaffected: no behaviour, schema or test changed.

## Verdict

**PASS** - 0 CRITICAL, 0 HIGH, 3 MEDIUM, 2 LOW.
