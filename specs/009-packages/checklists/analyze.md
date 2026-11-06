# Spec Kit Analyze - F9 Packages S35 (S33-PO-6 + S34-PO-1 + S34-PO-2 + S34-PO-6 + S35-PO-1)

- Date: 2026-11-06 (Africa/Cairo), after the round-9 edits applying the PR #53 review-thread fixes (SC-019 per-workspace wording; FR-031/data-model aligned to the unqualified S33-04 FX rule; T048 coder-rule carve-out; new T064a; T074/T069 dependency-cycle fix; FX-rounding recorded as PO-DECISION-NEEDED) on top of the round-8 edits applying S35-PO-1 F9=A (PD-S34-NEW-02 resolved) to spec, contract, plan, tasks, data model, research, quickstart, requirements checklist and traceability.
- Scope: `specs/009-packages/**` specification/documentation delta only. No tests, SQL, migrations, application code, stack, build, CI or UI render was run or added.
- Method: static cross-artifact analysis of numbered FRs, measurable SCs, Given/When/Then scenarios, verbatim PO clarifications, supersession notes, plan, model, contracts, task dependencies and traceability.

## Entry check

| Gate | Result | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs and Given/When/Then scenarios | PASS | `spec.md` FR-001..FR-033, SC-001..SC-023 and acceptance scenarios cover the settled behavior, including the S34-PO-6 category identity (FR-019, FR-028, SC-019, SC-020). |
| Clarifications and explicit ambiguity status | PASS | `spec.md` records S34-PO-6 verbatim with the architect note (PD-S34-NEW-01=A) and records S35-PO-1 verbatim ("F9=A (Egypt/International)") resolving PD-S34-NEW-02 as option A. It states that no ambiguity remains in the settled decisions. |
| Plan and FR-tagged tasks | PASS | `plan.md`; `tasks.md` T042-T045, T055, T064, T064a, T065-T071 tagged to FR/SC. No task remains blocked by PD-S34-NEW-02 (resolved by S35-PO-1 F9=A); T065 still awaits its separate teardown security review (T070); T064a implements the read-only preflight covered by T064 RED tests. |
| Analyze after spec/plan/tasks edits; no open CRITICAL/HIGH | PASS | Dated after the last such edit. 0 CRITICAL, 0 HIGH. |

## Findings

**No open CRITICAL or HIGH findings.** The following items are explicitly blocked or gated; none is encoded as a guessed requirement.

| ID | Category | Severity | Location | Assessment |
|---|---|---|---|---|
| A1 | Unapproved interface copy | BLOCKED-COPY | `spec.md` FR-013, FR-032/033; `tasks.md` T061/T069 | Only the four S34-PO-2 English/Arabic label pairs are approved. Dashboard, Installments, empty, error, help and other copy remains blocked. |
| A2 | Canonical market literal | RESOLVED (S35-PO-1 F9=A) | `spec.md` Clarifications and register; `contracts/packages-surface.md` currency table; `data-model.md`; `tasks.md` T042/T043/T044/T055/T065/T066; `traceability.md` | Resolved as option A: title-case `Egypt`/`International` are both the wire value and the stored value; no mapping layer; the lowercase `egypt`/`international` tokens are retired everywhere in specs/009-packages. Verbatim PO quotes in the register (e.g. S31-PO-4/S31-PO-5) keep their original bytes and are historical records, not literals. Display labels and machine literal are now identical; type values are not part of the decision. |
| A3 | C5 teardown mechanism and security gate | REQUIRED FUTURE REVIEW | `spec.md` FR-028; `data-model.md` C5; `tasks.md` T065/T070 | The mechanism for removing mock rows protected by FR-006 immutability and restrictive references is intentionally unspecified; no guard exception is authorized. Until a separately reviewed design exists, a mock with attached offers/versions makes the preflight refuse. T070 reviews the implemented path before acceptance and does not gate implementation. |
| A4 | FX provider security gate | REQUIRED FUTURE REVIEW | `tasks.md` T059/T062 | Provider verification, minimized egress and independent security review remain future work. |
| A5 | Existing retained decisions | BLOCKED | `spec.md` PO-decision register; `traceability.md` | ND-F9-2/3/5 remain as recorded. |
| A6 | Design implication of S34-PO-6 | INFO (not a new decision) | `data-model.md` S34-PO-6 delta | The package row becomes workspace-scoped (gains `workspace_id`, unique `(workspace_id, market, type)`); the baseline platform-owned shape is superseded by a forward migration only. Retention/uniqueness of `code`, exact signatures and RLS predicates are T042 design and are reviewed there. |

## Coverage and consistency

- S34-PO-6 is recorded verbatim in the spec register; data model, contract, plan, research, quickstart, requirements checklist, tasks and traceability all use the package-row-is-category model. Publication takes `package_id` and derives the market from the stored row; market/type are initialization-only and immutable; versions hold commercial terms; offers may not pair with a package row of another workspace.
- S35-PO-1 is recorded verbatim in the spec register ("F9=A (Egypt/International)") with the architect note (not PO words) that option A makes the title-case tokens the wire and stored value. Every artifact now uses `Egypt`/`International` as the sole market literal; the lowercase tokens survive only inside verbatim historical PO quotes (spec.md register), which are byte-exact records and not literals.
- Stale pending/blocked wording for PD-S34-NEW-01 and PD-S34-NEW-02 was removed from every artifact; remaining references describe both as resolved.
- The stale plan sentence that awaited English-label approval was replaced (S34-PO-2 approves the four labels). Machine-local PO source paths were removed from the spec; decisions are cited by ID and quoted verbatim.
- S33-PO-6 recommendations, C1-C5, LABELS and S34-PO-2 are unchanged. S32-R1 all-origin-reference uniqueness and "never edit a pushed migration" remain explicit.
- The merge from `origin/main` preserved main's S33-PO-4 test-hygiene record (T900, ticked on its own evidence) in tasks, plan, traceability and the historical analyses below.
- No future task is marked complete; no implementation or test evidence is claimed for the S34/S35 tasks.

## Frontend Design Gate review

- This round changes specification and decision records only; no rendered UI, component, token or visual behavior changed. Future dashboard/Installments UI remains subject to T061/T069 and the Frontend Design Gate; all copy beyond the four approved label pairs remains BLOCKED-COPY.

## Verdict

**PASS - 0 CRITICAL, 0 HIGH.** PD-S34-NEW-01 is resolved (S34-PO-6, option A) and consistently applied. PD-S34-NEW-02 is resolved (S35-PO-1, option A: `Egypt`/`International` as wire and stored value) and consistently applied. This Analyze covers specification consistency only; it does not authorize implementation or claim tests passed.

## Historical analyses (merged from main)

## Analyze — S33-PO-4 (2026-11-04)

- Scope: package acceptance test fixture precondition and failure diagnostics (T900).
- Spec: numbered FRs, measurable SCs, and Given/When/Then scenarios exist for the touched empty-state behavior.
- Clarification: S33-PO-4 is cited; the work changes only tests and diagnostics. No open ambiguities remain in this test-only scope.
- Plan/task: plan covers the scope; T900 is tagged FR-013 and FR-014.
- Findings: 0 open CRITICAL, 0 open HIGH. No product behavior, permissions, copy, or UI is changed.

## Post-verification S33 re-analysis — 2026-11-04

T900 has been marked complete only after its Playwright acceptance test passed on the committed code head. Traceability records commit `45d17ff` and the executed test. S33 scope remains test-only; 0 open CRITICAL/HIGH findings.


## Round-7 re-analysis - 2026-11-06 (after round-7 edits)

- Static cross-artifact pass over spec, plan, tasks, data model, research and traceability after the round-7 edits. No tests, SQL, builds or stacks were run.
- Checked: C5 refusal now covers the existing `packages_no_delete` guard (data-model, T070 scope; no exception or mechanism introduced); plan `publish_package_version` row aligned with S34-PO-6; R13 carries the FR-026/FR-031 reporting-FX exception quoted from the spec; T072-T074 added for FR-025/FR-031/FR-032 behavior already in the spec and mapped in tasks and traceability, with UI copy still BLOCKED-COPY.
- Result: 0 CRITICAL, 0 HIGH. Open gates unchanged: PD-S34-NEW-02, BLOCKED-COPY, C5 teardown security review (T070), FX provider review (T059/T062).

## Round-8 re-analysis - 2026-11-06 (after S35-PO-1 edits)

- Static cross-artifact pass over spec, plan, tasks, data model, contract, research, quickstart, checklists and traceability after applying S35-PO-1 F9=A. No tests, SQL, builds or stacks were run.
- Checked: S35-PO-1 recorded verbatim in the Clarifications register with the architect note (option A = title-case `Egypt`/`International` as both wire value and stored value); contract currency table tokens are now the normative literals (no mapping layer); data model `market` storage, read projections, initialization and RPC signatures all use `Egypt`/`International`; tasks T042/T043/T044/T055/T065/T066 no longer carry the PD-S34-NEW-02 block (text only; nothing ticked); traceability rows updated; Arabic labels and all other decisions untouched; verbatim historical PO quotes left byte-exact.
- Result: 0 CRITICAL, 0 HIGH. Open gates: BLOCKED-COPY, C5 teardown security review (T070), FX provider review (T059/T062). PD-S34-NEW-02 is closed.

## Round-9 re-analysis - 2026-11-06 (after round-9 review-fix edits)

- Static cross-artifact pass over spec, plan, tasks, data model, contract, research, quickstart, checklists and traceability after the round-9 edits (below). No tests, SQL, builds or stacks were run.
- Checked: SC-019 now states exactly four empty category package rows **per workspace** (matches FR-019/FR-028/SC-020 and S34-PO-6 identity; no semantic change). FR-031 and data-model.md no longer carry the unapproved same-day gloss; both state the strictly unqualified S33-04 rule ("previous published business-day rate"), and T058 names a distinguishing fixture (different rates published on the previous business day and on the transaction day). The T048 documentation edit to `specs/009-packages/quickstart.md` §5 is now explicitly authorized by the coder rules (the single `specs/` exception), resolving the T048/coder-rule conflict without weakening coverage. New task **T064a** implements the read-only synthetic-only/dependency preflight its T064 RED tests cover (with zero writes); T065 now depends on T064 **and T064a**; the C5 dependency-order paragraph, the tasks Analyze mapping and traceability rows were updated to match. T074 no longer waits on the rendered T069 gate; it follows its RED tests and required copy approval, and the rendered T069 gate for the Installments section runs after the section exists (no dependency cycle). The FX rounding rule is **not approved anywhere** (S32-PO-4/S33-PO-6/S34/S35 are silent); no rounding mode is encoded — a `PO-DECISION-NEEDED` blocker is recorded in `spec.md` "Remaining blockers" and `traceability.md` (FR-026), and quickstart §5 points to it. Wiring: `plan.md`, `traceability.md`, this checklist and `tasks.md` agree.
- CodeRabbit findings handled: SC-019 wording (fixed), T048 vs coder-rule conflict (fixed), FX date-selection clarification (fixed by aligning to the recorded unqualified S33-04 rule; any same-day preference or rounding mode would be a new PO decision), FX rounding rule (**not decidable — recorded as PO-DECISION-NEEDED/decision blocker; thread left open**), missing preflight implementation step (fixed via T064a), T074/T069 dependency cycle (fixed).
- Result: 0 CRITICAL, 0 HIGH. Open gates: BLOCKED-COPY, C5 teardown security review (T070), FX provider review (T059/T062), **FX rounding rule PO-DECISION-NEEDED** (blocks reporting-conversion implementation). PD-S34-NEW-02 remains closed.