# Spec Kit Analyze — F18 Nutrition Templates & Nutrition Planner

**Analysis date**: 2026-11-10T02:11Z (S42 spec-only draft; this analysis runs after the final edit pass on spec.md, plan.md, tasks.md, data-model.md, the three contracts and the three research files; any later change requires re-running it).
**Inputs**: spec.md, plan.md, data-model.md, tasks.md, traceability.md, contracts/nutrition-document.md, contracts/nutrition-api.md, contracts/template-assignment.md, research/po-decision-matrix.md, research/conflicts.md, research/section-b-assessment.md.
**Scope**: spec-only. No code, SQL, migration, fixture, test or workflow change.

## Verdict

**0 open CRITICAL, 0 open HIGH.** Six PO decisions are open (F18-MCQ-1..6) and are recorded with options, implications, recommendation and blocked work. They block **implementation entry**, not the coherence of this draft.

**"No open ambiguities" is NOT claimed.** Implementation must not start until each MCQ is answered and the F19 Plan Core contract is merged; at that point Analyze must be re-run.

## Counts verified against the artifacts

| Item | Count | Verification |
| --- | ---: | --- |
| Functional requirements | 22 (F18-FR-001..022) | every ID defined in spec.md and present in the tasks coverage and traceability |
| Success criteria | 11 (F18-SC-001..011) | every ID defined, mapped to tasks and traceability |
| Tasks | 27 (T001..T027) | every ID defined; every coverage reference resolves; no unknown task id |
| Open PO questions | 6 (F18-MCQ-1..6) | each defined once with 2–4 options, implications, recommendation and blocked work |
| Conflicts/verifications | 17 (F18-C-01..C-17) | every referenced C-id exists in research/conflicts.md |
| Ticked tasks | 0 | tasks.md contains no completed task |
| Tests executed | 0 | spec-only branch; no test file exists |
| Broken relative links | 0 | link sweep across all 12 files |

## Findings

| Severity | Open | Findings |
| --- | ---: | --- |
| CRITICAL | 0 | None. The lifecycle is delegated to F19 with no second publish/delivery path; authorization, tenant keys and direct-DML denial are explicit. |
| HIGH | 0 | None. The exact-decimal algorithm, snapshot rebuild, selection model and template isolation each have a falsifiable acceptance criterion and a negative/concurrency row. |
| MEDIUM | 6 | F18-MCQ-1 export layout; F18-MCQ-2 prompt selection; F18-MCQ-3 display tie mode; F18-MCQ-4 prompt actor; F18-MCQ-5 prompt text/language; F18-MCQ-6 newer global version on re-assignment. Each is a PO choice, is not guessed anywhere, and blocks only its named work. |
| LOW | 2 | (a) The implementation may cache selected totals if it uses the stated cache key; the plan allows this but does not require it — a performance-time choice, not a spec gap. (b) The exact YouTube/Google Drive host allowlist is implementation-level and contract-tested; the PO wording is "YouTube or Google Drive" and this draft does not narrow or widen it. |

## Consistency checks performed

1. **Requirement ↔ task ↔ traceability**: all 22 FRs and 11 SCs appear in the tasks coverage table and in traceability; every task id used in coverage is defined; no orphan task id. F18-FR-022 is intentionally unmapped (excluded scope) and says so.
2. **Authority**: every PO quotation in spec.md was compared byte-for-byte with `f17-f18-po-decisions-source.md` lines 35–42, 59–62, 68–74, 78–79 and `s42-po-1.verbatim.txt` lines 7, 9, 20, 35, 36 (programmatic equality, 23/23 exact). Architect mappings are labelled and never presented as PO words.
3. **Register gaps**: S27-PO-2 is cited from branch evidence and recorded as a docs/04 gap; S24-PO-3 is not on main and is recorded as a gap, with the stable-id rule encoded as INFERRED, not as a direct PO record. `docs/04` is not edited.
4. **Assignment**: no pre-decision of F18-MCQ-6 remains. The same-source-version skip is stated as decided (A2 "without duplicating existing ones"); the different-version row is explicitly unasserted in the spec, data-model, contract and tests.
5. **Selection**: ids-only rows, self-only RPC, generic failures, current-revision check, carry-forward by stable ids, clear-to-default, no revision mutation, no stored derived totals. No path recalcs the staff editor.
6. **Snapshot**: one entry per (food version, serving unit); basis token is documented as a transport key, not a serving row id; fixed-scale decimal strings; exact version; no float round-trip.
7. **Totals**: exact intermediates; one stored half-even 4-dp rounding; aggregates from exact values; display separated and non-persistent; tie mode held open.
8. **Historical export**: a non-current revision export returns the coach original only, because "current permitted selection" exists only for the current revision; no new label copy is required.
9. **Template load**: creation-time/empty-draft only; destructive load into existing content is refused as unapproved scope; load deep-copies with new ids.
10. **Audit**: one event per operation; Assign is one batch event covering its created copies; allowlist and forbidden-field list are explicit; log-scrub is a criterion.
11. **Authorization**: existing `is_platform_owner` / `has_workspace_access(...,'coaching_work')` checks (verified `supabase/migrations/20261027120000_tenancy.sql:48-80`); no new capability; Sales denied; clients self-only; PO-without-membership covered.
12. **No unapproved copy**: no F18 planner/template/export string is introduced; prompt copy, prompt actor and export layout are MCQs.
13. **Status consistency**: spec.md, plan.md, tasks.md and traceability all say "spec-only, implementation blocked by F18-MCQ-1..6 and pending F19"; no artefact claims a merged dependency.
14. **Historic inputs**: no old identifier is treated as current; no task tick is inherited; no code is copied.

## Spec Kit entry check (recorded for the architect)

| Gate item | Draft | Implementation |
| --- | --- | --- |
| Numbered FRs / measurable SCs / Given-When-Then | PASS | PASS |
| Clarifications recorded | PASS (PO quotes + MCQs) | FAIL until MCQ-1..6 answered |
| plan.md and FR-tagged tasks cover the scope | PASS | PASS |
| analyze dated after last edit, 0 CRITICAL/HIGH | PASS | must be re-run after MCQ answers / any edit |
| Implementation entry | **FAIL by design** | blocked: F18-MCQ-1..6 and F19 merge |

## Required next actions

1. PO answers F18-MCQ-1..6 (batch).
2. F19 merges; confirm the revision composite key, delivery binding and (if provided) contributor attribution.
3. Answer-driven edits to spec/plan/contracts/tasks, then re-run this Analyze with a new date.
4. Only then: tasks → implementation, RED-first, evidence per task.
