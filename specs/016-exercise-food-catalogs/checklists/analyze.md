# Analyze — F16 exercise and food catalogs

## S35-PO-1 manual exercise distribution - Spec Kit update 2026-11-06

- Date: 2026-11-06 (run after the last edit to spec.md, plan.md, tasks.md, data-model.md and contracts/catalog-api.md in this change).
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
| A-4 | LOW      | Merge-conflict risk with #43 on spec.md, plan.md, tasks.md.                                                                                                                                                                              | Insertions placed away from #43 hunks; the owner resolves any residual conflict after #43 merges.                            |
| A-5 | LOW      | The audit action name and the RPC name are provisional.                                                                                                                                                                                  | Marked provisional in contracts; resolved by MCQ-F16-3.                                                                      |

Verdict: **PASS** for the specification update; implementation remains gated by A-1 and A-2.

### Impact on PR #43 (origin/016-catalog-ui @ e3e322f6, read-only)

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
