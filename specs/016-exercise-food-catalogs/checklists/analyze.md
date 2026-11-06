# Analyze — F16 exercise and food catalogs

## S35-PO-2 round 2 - F16 provisional decisions 1-7 - Analyze 2026-11-06

- Date: 2026-11-06, run after the last edit to spec.md, plan.md, tasks.md, data-model.md and contracts/catalog-api.md in this round (CodeRabbit round-1 fixes included). No code, test, schema or migration changed; no migration created.
- Source: S35-PO-2 (spec.md Clarifications, session 2026-11-06, verbatim). Architect notes are labelled "Architect note (not PO words)".
- Entry check (Spec Kit gate section 1), for `specs/016-exercise-food-catalogs/`: spec.md has numbered FRs, measurable SCs and Given/When/Then scenarios for US6 (11 scenarios): PASS. Clarifications: session S35-PO-2 with a decision register and an explicit open list (MCQ-F16-7 UI part, MCQ-F16-8 to MCQ-F16-18): PASS, no "no open ambiguities" claim. plan.md S35 section and tasks.md T910 to T922: PASS. This checklist is dated after the last change: PASS.
- Scope gate: a round-2 change does not add any task that is implemented in this round. Implementation tasks T911 to T921 remain unticked and blocked as tagged.

Coverage (planned, not yet verified):

| FR | Tasks | SC / scenario |
| --- | --- | --- |
| FR-022 | T910, T912, T916, T917 | SC-007, SC-009 / US6-3 |
| FR-023 | T910, T911, T917, T918, T920 (blocked), T921 (blocked) | SC-007, SC-011 / US6-3, US6-4, US6-10 |
| FR-024 (a, b) | T912, T917 | SC-009 / US6-1, US6-2, US6-11 |
| FR-024 (c) alternatives | blocked by MCQ-F16-8 (T912 assertion, T917) | SC-009 / US6-11 |
| FR-025 | T912, T916, T917 | SC-006 / US6-7 |
| FR-026 | T911, T913, T917 | SC-008 / US6-5 |
| FR-027 | T914, T917 | SC-008 / US6-6 |
| FR-028 | T914, T915, T917 | SC-009 / US6-8 |
| FR-029 | T910, T913, T917, T918, T919 | SC-008, SC-010 / US6-1, US6-9 |
| FR-030 | T911, T912, T917 | SC-002 (existing), SC-007 / US6 edge cases |
| FR-031 | reserved (decision 6 is a register item; no task) | none |
| FR-032 | T911, T917, T918 | SC-011 / US6-10 |
| SC-006 | T916 | US6-7 |
| SC-010 | T913, T919 | US6-9 |
| SC-011 | T911 | US6-10 |

Findings (0 open CRITICAL, 0 open HIGH):

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| A2-1 | MEDIUM | Decision 6 ("planners use workspace exercises only, never global directly") conflicts with approved text: `main` spec FR-010, FR-012, FR-020, `docs/04-changes-and-questions.md` S20-07, `docs/01-traceability.md` AT-WRK-02; and with F17 branch FR-003, FR-003a, FR-006 (global references and global templates). Register only; FR-031 reserved. | PO-DECISION-NEEDED MCQ-F16-13 and MCQ-F16-14. Blocks F17/F18 changes only; no F16 task depends on it. Not encoded as a requirement. |
| A2-2 | MEDIUM | FR-024(c) alternative target form and FR-024(b) media-link storage are open. | MCQ-F16-8 and MCQ-F16-16. Blocks the alternative assertion in T912 and the write path in T917. No guess encoded. |
| A2-3 | MEDIUM | Send audit event: name provisional, `workspace_id` for multi-target sends undefined, zero-copy send event undefined. | MCQ-F16-11. Blocks T919 and T917. Recommendation recorded (NULL, PO-only visibility). |
| A2-4 | MEDIUM | "All" delivery within the 50-exercise cap (MCQ-F16-12) and UI placement and bilingual copy (MCQ-F16-7 UI part). | Blocks T920 and T921 (blocked placeholders). T911 limit tests are not blocked. |
| A2-5 | MEDIUM | Workspace Restore: `main` FR-011 and US4 authorize workspace Restore; PR #43 S31-PO-1 Q3 does not. The round-1 FR-027 claim "remains unauthorized" was unsupported on `main` and is removed. | MCQ-F16-17. Governs the open CodeRabbit thread on spec.md FR-027. Resolving it needs a PO decision. Not implemented in F16. |
| A2-6 | LOW | Superseded source redirect (MCQ-F16-9); invalid-relation reporting (MCQ-F16-10). | Blocks outcome-shape details in T911 and T917. |
| A2-7 | LOW | Existence of planner or plan-snapshot data in any environment (MCQ-F16-18). F17 and F18 are not implemented per `docs/10-feature-tracker.md`. | PO question; the historical-plan rule (FR-028) is unchanged. |
| A2-8 | LOW | Decision 6 for global foods (MCQ-F16-15). | PO question; foods are not in S35-PO-1 or S35-PO-2 scope words. |
| A2-9 | LOW | Round-1 CodeRabbit thread 1 (skip-path ledger write): text fixed in contract, data model, SC-008 and T913; test not yet executed. | Evidence required at implementation (T913). Not ticked. |

Verdict: **PASS** for the round-2 specification scope, with 0 open CRITICAL or HIGH findings. Implementation is not authorized: T917, T918, T919, T920 and T921 remain blocked by MCQ-F16-7 (UI part), MCQ-F16-8, -9, -10, -11, -12, -16 and -17 as tagged in tasks.md, plus #43 on `main` (T914, T917). The Sol Medium critique approval and a separate implementation approval are still required (`notes.txt`, item 5).

### Impact on PR #43 (origin/016-catalog-ui @ e3e322f6, read-only; decisions 1 to 7)

No file of #43 is edited in this round. The table lists what changes in #43's scope after #43 merges, and what the decisions require from #43 for the send feature.

| Decision | #43 item | Effect |
| --- | --- | --- |
| 1 explicit targets | T037 Exercise Library list (workspace scope) | No change. The send target picker lives in the blocked PO send surface (T920) only. |
| 2 full copy (data, media links, variations, alternatives) | T023 variation UI (still open); T038/T044 exercise detail | Copies appear in workspace detail and search with their own identity and copied media link. The detail's source-provenance display is unspecified; no change until the PO asks. |
| 2 (cont.) | `catalog_exercise_detail` (`supabase/migrations/20261107030000_catalog_workspace_exercise_remove.sql` line 126; `20261106125000_catalog_exercise_detail.sql` line 116) | Global detail resolves through `catalog_resolve_exercise_selection`. Copies use workspace identities, so no change is required for the copy path; it confirms that the global resolver is in #43 (decision 6). |
| 3 one audit per send | #43 audit action allowlist in `supabase/migrations/20261106100000_catalog_operation_keys.sql` lines 135 to 138 (same file on `main`; per-entity names `catalog.exercise_*`, `catalog.workspace_exercise_*`, `catalog.food_*`) | The send adds one action (`catalog.exercise_sent`) and one detail key (`send_outcomes`). T919 extends the allowlist with a new forward-only migration, never by editing the pushed file, and keeps #43's names unchanged. |
| 4 active sources only | #43 Exercise Detail Remove (PO global Remove, workspace Remove); redirect to survivor in detail | The send selection must exclude Removed and superseded globals. The UI shows `rejected_inactive_source` in the send result (blocked T920). #43 itself needs no change. |
| 5 PO-only sending | #43 T041 governance placement, T039 PO edit | No change. Send is a new PO-only control (blocked T920). |
| 6 planners use workspace exercises only | #43 contract row `catalog_resolve_exercise_selection` ("for new selection") on `origin/016-catalog-ui` contracts/catalog-api.md line 59 | No change to #43 in this round. If decision 6 is confirmed (MCQ-F16-13/14), the row's "for new selection" wording and its planner use need revision in the F16 contract on merge. |
| 6 (cont.) | #43 spec FR-011 / US4 workspace Restore ("not authorized") | Conflicts with `main` FR-011 (see A2-5). On #43 merge, `main` text changes; the send does not use Restore. |
| 7 limits | #43 search page size 50 | Consistent. No change. The send limit is a separate server rule (FR-032). |
| UI placement (MCQ-F16-7) | `tests/unit/catalog-approved-copy.test.ts` (186 locked rows); `ui-handoff.md` surfaces table | Unchanged. Send-surface copy would be new DRAFT keys (T920), not edits to the 186 approved rows. |

## S35-PO-1 manual exercise distribution - Spec Kit update 2026-11-06 (round 1, historical)

- Date: 2026-11-06, re-run after the final edit to spec.md, plan.md, tasks.md, data-model.md and contracts/catalog-api.md in this change (final re-check after the merge-conflict follow-up commit).
- Scope: specification only (S35-PO-1 F16). No code, test, schema or migration changed.
- Spec: User Story 6 with 9 Given/When/Then scenarios; FR-022 to FR-030; SC-006 to SC-010. Every FR is measurable through at least one SC or scenario.
- Clarify: session 2026-11-06 quotes S35-PO-1 byte-exact and carries the supersession ledger. Open ambiguities are stated, not assumed away: MCQ-F16-1 to MCQ-F16-7.
- Plan: section "S35-PO-1 manual exercise distribution" plus data-model.md and contracts/catalog-api.md additions. Existing conventions cited: FR-016 order, shared operation-key ledger, audit allowlist (FR-013), two-wall authorization, deny-by-default (FR-017), forward-only migrations.
- Tasks: T910 to T922, RED first, each tagged with FR IDs; no task ticked; no migration created.

Coverage (planned, not yet verified):

| FR     | Tasks                              | SC / scenario                       |
| ------ | ---------------------------------- | ----------------------------------- |
| FR-022 | T910, T912, T917                   | SC-007, SC-009 / US6-3              |
| FR-023 | T910, T911, T917, T918, T920, T921 | SC-007 / US6-3, US6-4               |
| FR-024 | T912, T917                         | SC-009 / US6-1, US6-2               |
| FR-025 | T912, T916, T917                   | SC-006 / US6-7                      |
| FR-026 | T911, T913, T917                   | SC-008 / US6-5                      |
| FR-027 | T914, T917                         | SC-008 / US6-6                      |
| FR-028 | T914, T915, T917                   | SC-009 / US6-8                      |
| FR-029 | T910, T913, T917, T918, T919       | SC-008, SC-010 / US6-9              |
| FR-030 | T911, T912, T917                   | SC-002 (existing), SC-007           |

Findings (0 open CRITICAL, 0 open HIGH):

| ID  | Severity | Finding                                                                                                                                                                                                                                  | Disposition                                                                                                                  |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A-1 | MEDIUM   | Seven PO-DECISION-NEEDED items (MCQ-F16-1 to MCQ-F16-7). T911, T917, T919, T920, T921 are tagged BLOCKED; T910 and T912 to T916 are not blocked by them except where the plan notes.                                                      | Tracked in report.md and spec Clarifications; no guess encoded.                                                              |
| A-2 | MEDIUM   | T914 and T917 depend on PR #43 (workspace Remove RPC and lifecycle revision, #43 T042/T043).                                                                                                                                             | Documented in plan.md; no implementation before #43 is on main or the architect names the base.                              |
| A-3 | LOW      | No earlier auto-copy requirement carrying an ID exists in specs/016 on origin/main or origin/016-catalog-ui; the supersession ledger is therefore generic.                                                                                | Gap recorded for the architect (non-blocking).                                                                               |
| A-4 | LOW      | Merge-conflict risk with #43 on spec.md, plan.md, tasks.md.                                                                                                                                                                              | Insertions placed away from #43 hunks; `git merge-tree` of this branch with origin/016-catalog-ui reported no conflicts after the follow-up commit.                            |
| A-5 | LOW      | The audit action name and the RPC name are provisional.                                                                                                                                                                                  | Marked provisional in contracts; resolved by MCQ-F16-3.                                                                      |

Verdict: **PASS** for the specification update; implementation remains gated by A-1 and A-2.

### Impact on PR #43, round 1 (historical; superseded by the round-2 table above)

| #43 item                                                           | Effect                                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T043 `catalog_remove_workspace_exercise`, T042 lifecycle revision  | Prerequisite for fresh resend (FR-027); no change needed. Workspace Restore stays unauthorized (#43 FR-011/US4 text), consistent with FR-027.                                                                                 |
| T037 Exercise Library list and empty state ("invites manual Add")  | Workspace-scope lists will also show copies; the empty-state copy may need a mention of PO sending. Copy is PO-owned; not changed by this spec (MCQ-F16-7).                                                                   |
| T038, T044 Exercise Detail and Remove                              | A copy's detail uses the same workspace detail and Remove; whether source provenance is shown is unspecified. No change required unless the PO asks.                                                                          |
| T023 variation UI (still open)                                     | Variations bind to a global exercise id; a copy has a new id, so variation carry-over is MCQ-F16-2 and planner selection is MCQ-F16-6. Keep T023 as is until answered.                                                        |
| T041 governance placement, T039 PO edit                            | No change: copies are not global rows; global edit stays PO-only.                                                                                                                                                             |
| T033/T036 and ui-handoff.md surfaces table                         | A PO send surface (T920/T921) would add a screen and matrix cells; not part of #43.                                                                                                                                           |
| `tests/unit/catalog-approved-copy.test.ts` (186 locked rows)       | Unchanged; send-surface copy would be new DRAFT keys.                                                                                                                                                                         |
| spec.md FR-002/FR-011/US4 text                                     | #43 rewrites these lines; this update does not edit them, so text merges cleanly, but FR-023/FR-027 rely on #43's wording that workspace Restore is unauthorized.                                                             |

## Prior analysis (kept)

- Date: 2026-11-04
- Scope: S33-PO-4 taxonomy/search integration test pagination or unique synthetic filter (T900).
- Spec: Existing catalog search and taxonomy requirements and authorization scenarios remain unchanged. S33 clarification disallows search semantic, visibility, limit, or data changes.
- Plan: The test will locate its expected synthetic result independent of the global first page, using an exact filter or explicitly bounded pagination.
- Tasks: T900 is tagged FR-015 and FR-016a. No test assertion is weakened and no catalog content is added.
- Findings: 0 open CRITICAL, 0 open HIGH.
- Gate: PASS for the stated S33 test-only scope.

## Post-verification S33 re-analysis — 2026-11-04

T900 has been marked complete only after its focused integration test passed on the committed code head. Traceability records commit `dfa6fe6` and the executed test. S33 scope remains test-only; 0 open CRITICAL/HIGH findings.
