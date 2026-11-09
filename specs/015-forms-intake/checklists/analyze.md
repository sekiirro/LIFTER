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
**S34 T080 clarification refresh:** 2026-11-05, after specifying NFKC/lowercase followed by the S32-PO-7 character-set check; before implementation.
**S34 T086 decision-boundary refresh:** 2026-11-05, after identifying the persisted Arabic-title fallback as a user-visible product choice and excluding it pending PO decision.
**Status:** Historical S33 entry review; current S35 entry revalidation is recorded below.

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
- [x] Clarifications remain the binding PO records cited by F15, including S28 PO records and the S30/S31/S32/S33 F15 decisions. **No open ambiguities remain for the independent implementation tasks T080–T085 and T087–T095:** T080 follows the specified NFKC/lowercase normalization then applies S32-PO-7's 3–30 character English letter/digit/underscore/period set; leading/trailing whitespace and Unicode format characters remain invalid rather than trimmed. T086 and the four earlier product questions remain explicitly excluded and are reported as PO decisions.
- [x] `plan.md` now covers the S34 remediation scope, forward-only database rule, RED-first tests, mutation evidence, screenshot matrix, and decision boundary.
- [x] `tasks.md` assigns T080–T095 and FR IDs to every S34 remediation unit. Checkboxes remain open until the cited current-head tests pass.
- [x] This Analyze follows the 2026-11-05 plan/task updates.

### S34 scope analysis

- T080–T083 repair existing signup, validation, correction, and alert contracts; T080 applies the existing NFKC/lowercase rule before its S32-PO-7 character-set check and rejects whitespace/Unicode format characters. Any SQL change is forward-only and Stack D is the only permitted database stack.
- T084–T085 and T087–T089 repair documentation, test isolation, test baselines, submitted-draft status handling, and portable S34 PO source citations. T086 was blocked at round-2 entry; S34-PO-5=B now resolves the English-title requirement and existing approved forms.required error key.
- T090 covers correction-history GET authorization and current-snapshot filtering only; T082 separately covers correction-write revision validation. T091–T094 repair existing signup error, history-label, Bidi rendering, and copy-reference behavior. They add no new styling, component, copy, permission, or workflow decision.
- T095 corrects rendered evidence for existing copy. It captures the actual required viewports and records exactly those files; no interface layout or visual treatment is changed.
- No design-system gap is required. Existing tokens, typography, direction handling, components, and approved copy remain authoritative. No dependency, workflow, or CI change is in scope.
- **CRITICAL findings: 0. HIGH findings: 0.** S34-PO-5 resolves T086; remaining PO-only product decisions are excluded from implementation.

**S34 T090 scope and evidence refresh:** 2026-11-05 01:49 Africa/Cairo, after narrowing T090 in `plan.md` and `tasks.md` to the tested correction-history GET route. T082 remains the owner of correction-write revision validation. `tests/unit/forms-submission-routes.test.ts` passes 9/9; no product behavior or requirement changed. **CRITICAL findings: 0. HIGH findings: 0. No open ambiguities for this scope.**

**Result: PASS for entry into T080–T095.** Re-run Analyze after any subsequent change to `spec.md`, `plan.md`, or `tasks.md` before acceptance.

## S34 round-3 entry review — 2026-11-05 03:03 Africa/Cairo

This review follows the S34-PO-2..6 and PD-S34-NEW-01 clarifications added to `spec.md`, the S34 task registrations in `tasks.md`, and the plan extension. It was refreshed at 2026-11-05 03:03 Africa/Cairo after adding T102 and the no-ff restack constraints. No task is marked complete by this analysis.

- [x] `spec.md` retains numbered FRs and measurable SCs; SC-023..SC-026 and Given/When/Then cases cover correction-note bounds, relationship-ended client-late alerts, required English draft title, and exact approved EN copy.
- [x] Clarifications cite S34-PO-4 through S34-PO-6, PD-S34-NEW-01 and S32-PO-8 Q6 in the PO decision register, plus the repository intake review fixture. **No open ambiguities remain for S34-PO-2 through S34-PO-6 or PD-S34-NEW-01.** S34-PO-4 is merge sequencing only.
- [x] `plan.md` covers T096–T102, the no-ff restack, sole allowed historical migration edit, forward-only migrations, Stack D, RED-first tests, and the approved existing message key for T086.
- [x] `tasks.md` assigns T086 and T096–T102 to existing FRs; completion is gated on test evidence for the current head.
- [x] This Analyze review is dated after the spec, plan, and task changes above.

### Scope and findings

- T086 uses the S34-PO-5=B required-English-title decision. Existing approved key `forms.required` is present in `tests/fixtures/forms/approved-f15-copy.json` (`Required` / the existing Arabic value); reuse that key verbatim for inline title validation. No new copy or UI pattern is approved.
- T096 changes only exact PO-approved intake strings and statuses; B06 stays S32-PO-5 as-is. T097 enforces both correction-note bounds before RPC and in a new migration. T098 cancels client-late alerts immediately after the approved lifecycle states and removes related rows within the existing purge lifecycle. T100 applies the one-time exact migration edit and verifies clean replay on Stack D.
- The UI scope adds no component, layout, tokens, colors, fonts, motion, or dependency. Existing form error presentation, bilingual message system, and DESIGN.md govern. The Design System overrides advisory skill conflicts; any missing component or error-state pattern is a stop-and-report design gap.
- **CRITICAL findings: 0. HIGH findings: 0.** No new ambiguity or design gap blocks entry; task-level evidence remains pending.

**Result: PASS for T086 and T096–T100 entry.** Re-run Analyze after any later change to the spec, plan, or tasks before accepting implementation.

**S34 T097 verification refresh:** 2026-11-05 04:16 Africa/Cairo; the correction bounds passed focused unit tests 15/15 and Stack D integration 2/2 on commit 1ed864e. No requirement text changed; Critical: 0; High: 0.

**S34 T098 verification refresh:** 2026-11-05 04:21 Africa/Cairo; lifecycle tests passed 11/11 on commit 1b52aeb after clean Stack D replay; Critical: 0; High: 0.

**S34 PO source-mapping refresh:** 2026-11-05 04:24 Africa/Cairo; S34-01=B is cited as S34-PO-4, which also records the no-destination-guard sequencing decision. Entry criteria remain PASS; Critical: 0; High: 0; no open ambiguity in approved S34 scope.


**S34 T089 documentation portability refresh — 2026-11-05 06:39 Africa/Cairo:** Replaced developer-local S34 PO paths in the S34 plan/Analyze and current PO clarification citations with stable decision IDs and repository fixture references. `tests/unit/forms-s14-decision-fixture.test.ts` passes 6/6; it rejects a synthetic absolute path and checks the plan/Analyze PO citations. Corrected T086 analysis to reflect S34-PO-5=B and reuse the existing `forms.required` key. **CRITICAL: 0. HIGH: 0. No open ambiguities remain for authorized scope.**

**S34 T089 acceptance evidence refresh — 2026-11-05 06:40 Africa/Cairo:** T089 is checked only after the focused regression passed on `0adb43a`; the traceability row maps FR-026/036/037 to that test and commit. The updated task completion record adds no requirement or ambiguity. **CRITICAL: 0. HIGH: 0.**



**S35 existing-PR entry revalidation — 2026-11-06:** Added T101-T114 for verified CI/CodeRabbit remediation within existing FR-004/006/008/013/017/018/024/025/026/036/037/038/039 scope. `spec.md` already contains the required numbered FRs, measurable SCs and Given/When/Then acceptance coverage. Existing PO clarifications explicitly govern approved copy, answer snapshots, name validation and client-late timing. **No open ambiguities remain for T101-T103, T105-T114. T104 remains explicitly blocked because the current F15 schema has no authoritative client-to-Trainer assignment relation.** No requirement or user-facing default was inferred. The existing design system covers the narrow T112 pending-submit interaction; no visual token, layout, copy, animation or dependency change is planned. **CRITICAL: 0. HIGH: 0.** Entry PASS for independent tasks; T104 excluded pending PO direction.


**S35 T109/T111 documentation refresh - 2026-11-06:** The Stack D quickstart now derives repository, stack and provisioner paths from the current checkout. The earlier S33 Analyze status is explicitly historical; the S30 quotation and S31 migration source label are repaired without changing their recorded findings. These are documentation-only corrections inside the existing F15 verification scope. **CRITICAL: 0. HIGH: 0. No new ambiguity.**

**S35 T107 acceptance refresh - 2026-11-06 04:27 Africa/Cairo:** `tests/unit/forms-scheduler-cleanup-contract.test.ts` passed 1/1 on current A head `a1782ba` after T107's owned-ID cleanup. `tasks.md` and `traceability.md` now record the passing evidence. This checkbox update adds no requirement; **CRITICAL: 0. HIGH: 0. No open ambiguity.**

**S35 A remediation acceptance refresh — 2026-11-06:** Recorded T102, T103, T105, T106, T108, T109, T110 and T111 completion only after their cited targeted/Stack D checks or documentation checks passed. No requirement or PO decision changed. T104 remains blocked under PD-S35-01; the separate PD-S34-R3-01 N11 English-copy question remains open. Existing FR/SC/GWT coverage remains applicable. **CRITICAL: 0. HIGH: 0. No new ambiguity for completed tasks.**
**S35 T101 Vite/Vitest startup refresh — 2026-11-06:** Hosted CI showed that runner-loader selection alone did not fix the source-map crash. Vitest 5.1.0 includes the cached-source UTF-8 fix for Vite 8.3.5; the exact `npm run test:integration -- tests/integration/password-policy-parity.test.ts` command passed 58/58 on Stack D and StartedAt was unchanged. This is an existing CI remediation, with no workflow or product behavior change. **CRITICAL: 0. HIGH: 0.**
## S35 F15 round-5 existing-PR entry revalidation — 2026-11-06

`spec.md` contains numbered FRs, measurable SCs, and Given/When/Then coverage for FR-004/006/008/013/024/025/026/036/037/038/039. Clarifications state no open ambiguities for the scoped review remediations. `plan.md` covers those existing signup, validation, lifecycle, test, and documentation scopes. `tasks.md` assigns T115-T129 and tags each with existing FR IDs; duplicate T102 was corrected by assigning the open restack task T129. No requirement or user-facing default is added. PD-S35-01/T104 and PD-S34-R3-01/N11 copy remain excluded and blocked. **CRITICAL: 0. HIGH: 0.** Entry PASS for independent existing-PR fixes.

## S36 T136 CI remediation analysis - 2026-11-06

The existing drift guard maps the localized starter-label migration on B first and falls back on A to `20261108230018_f15_default_provisioning_configuration.sql`, the latest migration on A that defines `app_private.ensure_default_onboarding_form`. The ordered mapping is test-harness-only within FR-024/025; no product behavior, policy, SQL migration, or security assertion changes. **CRITICAL: 0. HIGH: 0. No open ambiguities for this task.**


## S36 N11 and ALERTS clarification analysis - 2026-11-06

N11 EN copy is approved byte-exact by S35-PO-3; the existing Arabic band values remain approved and unchanged. T137 has numbered FR-040, measurable SC-027, Given/When/Then coverage, plan/task linkage, exact PO source and boundaries. ALERTS FR-017/018/035 and the related scenario/success criterion replace the obsolete +24h/+48h client-late stages with the approved immediate and day-five/day-seven schedule. Open ambiguities are explicitly recorded as MCQ S36-01/T104 (authoritative Trainer relation) and MCQ S36-02 (late-intake event); no implementation or product assumption is authorized until PO answers. Analysis scope is specification/copy-only for alerts. **CRITICAL: 0. HIGH: 0. No other ambiguities are assumed closed; the two MCQs remain open.**


## S36 final Spec Kit analysis refresh - 2026-11-06

Revalidated after the final spec/plan/task edits: F15 has numbered FR-017/018/035/040, measurable SC-022/027, Given/When/Then scenarios for immediate and staged alerts and every N11 score/band boundary, a clarification session citing the byte-exact S35-PO-3 N11 and ALERTS paragraphs, T136/T137/T138 task links, and an up-to-date plan. The T104 Trainer source and late-intake event remain explicit PO-decision MCQs, so no-open-ambiguities applies only to T136/T137 and the specification-only requirements recorded by S35-PO-3 / S36-R7. No alert code/migration was changed. **CRITICAL: 0. HIGH: 0. No other open ambiguities for this authorized scope.**


## S36 spec analysis rerun after final amendments - 2026-11-06

Re-read `spec.md`, `plan.md`, and `tasks.md` after the last S36 edits. Numbered FR-017/018/035/040, measurable SC-022/026/027, Given/When/Then coverage, separate N11 and ALERTS clarification sections with byte-exact source paragraphs, T136-T138 task links and plan coverage all pass. MCQ S36-01/T104 and S36-02 remain explicitly open and block only the Trainer relation and late-event implementation choices. No alert code/migration changed. For the independent T136/T137 work and authorized spec-only ALERTS record, CRITICAL: 0; HIGH: 0; no other ambiguities remain.

## S39 F15 round-7 Spec Kit analysis — 2026-11-09

Revalidated `spec.md`, `plan.md`, and `tasks.md` after encoding the S38-PO-5 decisions. The PO line is quoted byte-exact in the ALERTS clarification; S36-01=A identifies the existing F12 client assignment as the responsible-Trainer source, and S36-02=A defines late intake as the configured client-submission deadline passing without an accepted submission. FR-017/018/035 and the Given/When/Then late-intake scenario express that scope; plan.md and T104/T138 link the work to existing FRs. T104 is unblocked for implementation of the approved routing and trigger, subject to RED-first tests. T138 records the already-approved specification change and does not authorize alert implementation or migration by itself. **No open ambiguities remain for S36-01/A, S36-02/A, T104 and T138. CRITICAL: 0. HIGH: 0.**

Entry check: PASS for the T104/T138 scope. `spec.md` has numbered FRs, measurable success criteria, and Given/When/Then scenarios; Clarifications cite S38-PO-5 and explicitly close both decisions; `plan.md` covers the approved source and deadline; `tasks.md` assigns T104/T138 to FR-017/018/035; this dated Analyze follows all three updated artifacts. No implementation evidence is claimed here.


## S39 F15 round-8 Spec Kit analysis ? 2026-11-09

Revalidated spec.md, plan.md, and tasks.md after recording S39-PO-8 / PDN-S39-F15-01. The spec retains numbered FR-017/018/035, measurable success criteria and Given/When/Then coverage for client-late timing and owner notices. S38-PO-5 remains quoted byte-exact; S36-01=A is retained only as the future F11/F12 source rule, and S36-02=A defines the configured submission deadline passing without an accepted submission. The PO-approved deferral means F15 has no client-to-Trainer assignment/routing or client-late Trainer alert; T104 is deferred to the separate F11/F12 specification work. T138 records the approved trigger, immediate owner notices and unchanged D-03 Trainer-late workflow without implementing alert code or migrations. Tests that assert client-late Trainer alerting are to be removed or explicitly skipped with the PO decision cited; tests for D-03 Trainer-late behavior remain in scope and unchanged. **No open ambiguities remain for this authorized round-8 scope. CRITICAL: 0. HIGH: 0.** Entry PASS for T138's specification-only scope and the approved removal/skip-with-reason of client-late Trainer alert assertions; T104 implementation remains deferred. This Analyze follows the latest spec.md, plan.md, and tasks.md edits.


## S39 F15 round-8 final scope analysis ? 2026-11-09

Re-read spec.md, plan.md, and tasks.md after aligning the client-late success criterion, plan summary, and F15 handoff documentation with S39-PO-8. Numbered FR-017/018/035 and measurable SC-022 now state the approved S36-02 configured-deadline trigger and immediate authorized-owner notices. Given/When/Then coverage retains the configured deadline semantics and lifecycle suppression. S38-PO-5 remains quoted byte-exact. S36-01=A is recorded only as the future authoritative source rule for F11/F12. PDN-S39-F15-01 is resolved: F15 has no client-to-Trainer assignment/routing or client-late Trainer alert; T104 is deferred, while T138 is specification-only for the approved late trigger and owner notices. The client-late Trainer integration scenario is explicitly skipped with the PO rationale; the unit test asserts only owner schedule timing; D-03 Trainer-late coverage remains unchanged. **No open ambiguities remain for this authorized scope. CRITICAL: 0. HIGH: 0.** Entry PASS for T138 and the approved test/document updates; no Trainer implementation is included. This analysis follows the latest spec.md, plan.md, and tasks.md.

## S40 F15 round-10 entry analysis — 2026-11-09

Re-read `spec.md`, `plan.md`, and `tasks.md` for existing PR #57 CI/migration-order remediation. The numbered FRs and measurable SCs for builder validation, assignment/forms persistence, signup validation, privacy, and deployment verification remain present with Given/When/Then acceptance coverage. S40-PO-1 is quoted byte-exact in the run report and explicitly selects the safe rename; the parenthesized implementation mapping is architect wording. PO records cited by the feature govern the intended F15 behavior. No user-visible behavior, permission, retention, or default is introduced by filename renaming. T139 maps the reconciliation and verification to existing F15 FRs and the plan covers forward-only migration, Stack D, mutation evidence, and escalation of a genuine conflict. No open ambiguities remain for the authorized migration-order correction; if direct body comparison reveals a genuine F15/main policy conflict, that item is excluded pending a numbered PO MCQ. No UI, frontend-design gate, workflow change, or migration-rule waiver is in scope. **CRITICAL: 0. HIGH: 0.** Entry PASS for T139 implementation; its checkbox remains open until current-head tests and traceability evidence pass.



## S40 F15 round-11 entry and migration analysis - 2026-11-09 (refreshed)

Re-read the feature spec, plan, and task map after recording exact PO option lines, four prefix exception filenames, and the revised S40-PO-4 mapping. Entry check passes for numbered FRs/measurable SCs/Given-When-Then coverage across FR-004/006/008/024/025/038/039; Clarifications cite S40-PO-1/-2/-4 and close the approved sequencing; plan covers prefix/rename/reconcile and Stack D; T139 and existing T115/T117 map code/test repairs to those FRs. No new behavior or user-facing choice is introduced. Dependency proof is in the round-11 run directory: 05000 references 04000 answer tables/policies; 04000 references 03000 form assignments; 03000 references 02000 terms policy table. No other earlier #57 migration is in that closure. The only main/#57 object overlaps are app_private.signup_auth_identity_column and public.client_signup; helper behavior matches, and signup must combine main username-unavailable outcomes with approved F15 normalized username and three-component-name rules while preserving SECURITY DEFINER/search_path/owner/revoke/grants. Stack D exposed an existing missing SQL helper dependency in the latest builder validator (T117), and a stale mutation matcher in the signup regression (T115). Repair only those approved existing FR contracts; keep every RLS/security assertion. CRITICAL: 0. HIGH: 0. No open ambiguities remain for approved scope; a genuine behavior conflict remains escalated. This Analyze follows current spec/plan/tasks and precedes implementation of the T115/T117 repairs.

## S40 round-11 final analysis refresh — 2026-11-09

Revalidated `spec.md`, `plan.md`, and `tasks.md` after current-head evidence was recorded for T115, T117, and T139. The four-file dependency closure and original-version prefix match `prefix-closure.md`; all remaining migration blobs/order were preserved, and the unique forward migration reconciles the two proven overlaps. The clean Stack D replay, 72/72 requested integrations, SECURITY DEFINER/RLS mutation restore (`RESTORE_DIFF_EXIT=0`), and local gates are evidenced in the S40 round-11 verification and run report. No behavior decision was added; a genuine behavior conflict remains an escalation condition. **CRITICAL: 0. HIGH: 0. No open ambiguities remain for the approved migration-order, signup-reconciliation, and validator scope.**

## S40 hosted integration follow-up analysis — 2026-11-09

Reviewed the exact-head hosted integration failures. The F15 generic duplicate string was a draft under S16 Q4=A; the approved D-08 bilingual message remains authoritative, so only the stale F15 fixture and duplicate-response test expectation are corrected. The F15 alert scheduler test is updated to discover the unchanged source under both original and safely-renamed migration clocks. No runtime behavior, workflow, or policy changes. Focused Stack D tests pass 80/80. **CRITICAL: 0. HIGH: 0. No open ambiguities for this test-fixture/harness repair.**

## S40 round-12 CodeRabbit remediation analysis — 2026-11-09

Re-read spec, quickstart, traceability and the architecture D-08 section after the exact-head CodeRabbit review on 12e4be50. No new requirement, permission, copy, default or retention rule is introduced. Quickstart Q-V12/Q-V15 are aligned to the existing client-late trigger in `contracts/retention-and-alerts.md` (configured deadline passing without an accepted submission; immediate authorized PO+WO notices; client-to-Trainer routing and client-late Trainer alert deferred under PDN-S39-F15-01); D-03 Trainer-late rules are unchanged. The alerts route normalizes the `before` cursor to ISO 8601 with the existing 400 `invalid` contract; the new unit test covers it. The configure-policy mutation check now propagates the RPC result and adds an unmutated baseline. **CRITICAL: 0. HIGH: 0. No open ambiguities for this CodeRabbit remediation scope.**

## S40 F15 round-13 entry analysis — 2026-11-09

Re-read spec.md, plan.md and tasks.md for T140, the four existing-PR fixes explicitly approved by architect ruling S40-R17 under the already-decided F15 contract. FR-007/008/013/017/018/021/024/035 provide numbered requirements and measurable success criteria; answer-size and charLimit bounds are stated in FR-007, correction authorization/snapshot behavior in FR-013/021/024, and immediate client-late owner notifications/no client-late Trainer routing in FR-017/018/035. Existing Given/When/Then scenarios cover client-late scheduling/lifecycle, validation and correction. Clarifications record PDN-S39-F15-01 and state no open ambiguities for the approved behavior; T140 maps all affected requirements. The plan specifies forward-only migrations, direct-RPC tests, Stack D and mutation evidence. Local media-codec prerequisites are documentation only. No UI, policy, scope, copy, permission, retention, or default decision is introduced. **CRITICAL: 0. HIGH: 0. No open ambiguities remain for T140.** Entry PASS before implementation.

## S40 F15 round-13 Analyze refresh — 2026-11-09

T140's implementation trace includes the alert inbox stage allow-list and integration function-drift source mapping, both required consumers of the approved immediate owner-stage evaluator. The updated Plan/Tasks still map to existing FR-007/008/013/017/018/021/024/035 and no product decision or user-facing scope was added. **CRITICAL: 0. HIGH: 0. No open ambiguities remain.** Revalidated before implementation continues.

## S40 F15 round-13 clean-replay analysis refresh — 2026-11-09

The required clean Stack D replay exposed that the pushed evaluator referenced public.form_submissions, while the current schema stores submissions in app_private.form_submissions. T140's forward evaluator replacement now uses the actual relation; this preserves the existing accepted-submission suppression behavior and is required for clean replay. The change remains within FR-017/018/035 and the immediate-owner alert decision. No new product decision. **CRITICAL: 0. HIGH: 0. No open ambiguities.**

## S40 F15 round-13 authorization analysis refresh — 2026-11-09

T140 retains FR-018's existing enqueue-time authorization rule for immediate client-late owners. The forward evaluator serializes workspace-owner membership revocations before selecting current recipients; its direct concurrency integration regression verifies a revoked owner is excluded while the platform owner receives the immediate alert. Existing D-03 Trainer-late behavior remains covered unchanged. This is authorization parity with the approved contract, not a new role or permission. **CRITICAL: 0. HIGH: 0. No open ambiguities.**
