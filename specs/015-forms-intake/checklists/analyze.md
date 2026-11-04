# F15 Spec Kit Analyze — S33 h13

**Date:** 2026-11-04 (after S33-PO-3 and CodeRabbit remediation task updates to `spec.md`, `plan.md`, and `tasks.md`)
**Final evidence refresh:** 2026-11-04 21:29 Africa/Cairo, after verified T061–T070 task evidence was recorded.
**Review-thread scope refresh:** 2026-11-04 21:39 Africa/Cairo, after adding tasks T071–T077 for additional unresolved F15 review findings.
**Entry review refresh:** 2026-11-04 22:25 Africa/Cairo, after adding T078/T079 for S33-PO-3 copy inventory and the existing FR-025 job-diagnostic safety regression.
**PO-record consistency refresh:** 2026-11-04 21:54 Africa/Cairo, after correcting FR-039 and the data model to cite S30-PO-1 Q2 approval and documenting fresh-checkout junction setup.
**PO-status reconciliation refresh:** 2026-11-04 22:11 Africa/Cairo, after reconciling the remaining Terms/sex-label status statements in spec.md, plan.md, and checklists/requirements.md with S30-PO-1 Q2; S31-R2/S32-PO-8 still govern remaining English translations.
**Evidence refresh:** 2026-11-04 22:14 Africa/Cairo, after passing the T071–T077 targeted unit and Stack D integration checks and recording their commit/test evidence in traceability.md.
**Final evidence refresh:** 2026-11-04 22:45 Africa/Cairo, after the A-owned T078/T079 Stack D/unit checks and traceability/task closure.
**S34 round-2 entry refresh:** 2026-11-05, after adding T080–T095 to `plan.md` and `tasks.md` and before implementation.
**Status:** Entry review for S33-PO-3 Arabic T03/N07 copy and in-scope CodeRabbit fixes.

## Entry check

- [x] `spec.md` has numbered FRs, measurable SCs, and Given/When/Then scenarios for this F15 intake scope. The touched requirements trace to FR-026/036/037 and existing SC coverage.
- [x] Clarifications cite S32-PO-5, S32-PO-8, and S33-PO-3. **No open ambiguities remain for T061–T063.** Arabic T03 is Western digits exactly `2`, `3`, `4`, `5`, `6`; Arabic N07 uses `الوجبة رقم {number}` dynamically. English T03/N07 stays unchanged; unrelated EN rows remain pending PO review.
- [x] `plan.md` covers the exact Arabic strings, N07 substitution, Bidi digit-order verification, axe, screenshots, and viewport/theme matrix.
- [x] `tasks.md` adds T061–T063 tagged with FR-026/036/037, T064–T070 tagged with their existing F15 FRs, and T071–T079 for additional in-scope review fixes; T078/T079 remain open until evidence is recorded on the final stacked heads.
- [x] This Analyze follows the updated specification, plan and tasks, dated 2026-11-04.

## Scope analysis

- T061 records the approved Arabic strings from S33-PO-3 and removes the superseded pending-copy statement.
- T062 changes Arabic copy and fixtures only. English T03/N07 strings, layout, tokens, and shared UI behavior remain unchanged.
- T063 checks actual rendered Arabic labels and dynamic interpolation at 390px and 1024px in light and dark modes. Bidi behavior is checked using the existing component; no new visual behavior or dependency is introduced.
- T064–T077 fix code/test/documentation defects within the already approved F15 scope. Assignment, audience, client progression, correction authorization, and retirement behavior follow existing FRs; the tasks add no new user policy or copy. Database-dependent acceptance remains subject to Stack D tests.
- No new color, token, component, interaction, typography rule, or design pattern is needed. The existing UI and design system remain authoritative.
- T076 reconciles existing PO-approved status and repairs evidence separators; it changes no copy bytes or product decisions. The approval source is S30-PO-1 Q2 in the PO record. T077 documents the existing Stack D layout without changing behavior.

## Findings

- **CRITICAL:** 0
- **HIGH:** 0
- **MEDIUM / deferred:** None for the approved T061–T070 scope. Correction-note sizing and post-relationship-end client-late notification policy are not specified; these remain PO decisions in the run report and are excluded from implementation.

## Result

**PASS for T061–T079 within the boundaries above.** T078/T079 are revalidated here for the A-owned stack before acceptance. Re-run Analyze after any further change to `spec.md`, `plan.md`, or `tasks.md` before implementation.

**Scope extension — T078/T079:** T078 updates only the copy inventory to cite the already approved S33-PO-3 strings; T079 enforces the existing FR-025 rule that raw provider errors never enter `jobs.last_error` or dead-letter audit. These add no new user-visible copy, behavior, permissions, data retention, or product policy. T079's allow-list is derived from literal `jobs_fail` call sites in this repository; all caller-provided values remain synthetic. Entry review PASS for this extension: scope exists in FR-025 and the existing S33-PO-3 clarification; plan/tasks map the work; no design/UI decisions are involved; 0 CRITICAL / 0 HIGH findings; no open ambiguity for these authorized fixes.

## Review-thread scope revalidation

- Tasks T061–T077 are checked only after their cited unit, integration, rendered accessibility, or documentation evidence passed on the current split heads; B-owned T062/T063 evidence is on the stacked B head. Additional live findings outside this refreshed scope are triaged in the S33 run report.
- No implementation requirement or product decision changed during the scope refresh. The existing PO-decision gaps remain excluded and are reported separately.
- Findings remain **0 CRITICAL / 0 HIGH**; no open ambiguity blocks the approved work.

## S34 round-2 entry check

- [x] `spec.md` retains numbered FRs, measurable SCs, and Given/When/Then scenarios for all touched behavior. T080–T095 map only to existing FR-002/003/004/006/007/008/013/017/019/020/024/025/026/036/037/038/039; no requirement text or PO decision was changed.
- [x] Clarifications remain the binding PO records cited by F15, including S28 PO records and the S30/S31/S32/S33 F15 decisions. **No open ambiguities remain for T080–T095.** The four product questions retained from S33 remain excluded and are reported as PO decisions; this statement is limited to the implementation tasks below.
- [x] `plan.md` now covers the S34 remediation scope, forward-only database rule, RED-first tests, mutation evidence, screenshot matrix, and decision boundary.
- [x] `tasks.md` assigns T080–T095 and FR IDs to every S34 remediation unit. Checkboxes remain open until the cited current-head tests pass.
- [x] This Analyze follows the 2026-11-05 plan/task updates.

### S34 scope analysis

- T080–T083 repair existing signup, validation, correction, and alert contracts; any SQL change is forward-only and Stack D is the only permitted database stack.
- T084–T089 repair documentation, test isolation, test baselines, persisted draft title mapping, submitted-draft status handling, and a synthetic fixture source reference. They add no new product rule or copy.
- T090–T094 repair existing B-owned correction, signup error, history-label, Bidi rendering, and copy-reference behavior. They add no new styling, component, copy, permission, or workflow decision.
- T095 corrects rendered evidence for existing copy. It captures the actual required viewports and records exactly those files; no interface layout or visual treatment is changed.
- No design-system gap is required. Existing tokens, typography, direction handling, components, and approved copy remain authoritative. No dependency, workflow, or CI change is in scope.
- **CRITICAL findings: 0. HIGH findings: 0.** PO-only product decisions remain excluded; none blocks T080–T095.

**Result: PASS for entry into T080–T095.** Re-run Analyze after any subsequent change to `spec.md`, `plan.md`, or `tasks.md` before acceptance.
