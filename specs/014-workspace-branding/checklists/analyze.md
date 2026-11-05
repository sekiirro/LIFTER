# Spec Kit Analyze — F14 Production Registration Hero (S30 Glisse option 1a / 1b)

- Date: 2026-11-03 (Round 5, after the executed evidence)
- Analyzed base: `abda24cb9ef585c6edfe22d2e82f6c8318b4b250` (`014-hero-glisse`, S29 reviewed ACCEPTED-PARTIAL) plus the S30 working-tree implementation of S30-PO-2 (option 1a) and S30-PO-6 (90% tint), committed as `1ba237432e22377d4ad74e2d49aa8b69aebe2dc1`.
- Inputs: `spec.md` (FR-026..FR-030, SC-018..SC-022, Hero acceptance scenarios, `## Clarifications`), `plan.md` (Hero scope mapping), `tasks.md` (T052..T056), `hero-implementation-plan.md`, `traceability.md`, `.specify/memory/constitution.md` v1.4.0.
- Scope: T052 only — the Hero-scoped dense dark-form field surface and the dark-theme form/CTA tint (FR-027 theme resolution, FR-029 approved Glisse treatment; SC-019, SC-021). FR-028 (signup fields) and FR-030 (preferences pill) are owned by other tasks/lanes and are not touched here.
- Method: read-only cross-artifact review per `.claude/skills/speckit-analyze/SKILL.md`; `.specify/extensions.yml` is absent, so no extension hooks apply; no tests were executed for this Analyze; the running work started before this Analyze is revalidated below (S29-PO-3 Q5).

## Entry check (T052 scope)

| Check | Status | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs, Given/When/Then scenarios | PASS | `specs/014-workspace-branding/spec.md` — FR-026..FR-030, SC-018..SC-022, "Hero acceptance scenarios (S20-S29 PO decisions)" items 1-5. |
| Clarifications recorded and explicit "no open ambiguities" | PASS | `specs/014-workspace-branding/spec.md` — `## Clarifications`: "No open product ambiguities remain for this Hero scope", plus the S30-PO-2 / S30-PO-6 verbatim citations for the dense-form surface and the 90% tint. |
| Plan covers the touched scope | PASS | `specs/014-workspace-branding/plan.md` — "Hero scope mapping (S20-S29 PO decisions; S29-PO-3 Q7)" and the S30-PO-2/S30-PO-6 sentence; `specs/014-workspace-branding/hero-implementation-plan.md` — "Spec and PO traceability" plus the S30 dense-form paragraph. |
| Task ID with FR tags | PASS | `specs/014-workspace-branding/tasks.md` — `T052 [FR-026, FR-027, FR-029]` (S30 branch scope: FR-027, FR-029). T055/T056 remain the separate evidence/reconciliation tasks. |
| Analyze dated after the last spec/plan/tasks change, 0 open CRITICAL/HIGH | PASS | This file is dated 2026-11-03, after the 2026-11-03 edits to `spec.md`, `plan.md`, `hero-implementation-plan.md` and `tasks.md`; findings below contain no CRITICAL or HIGH entry. |
| Traceability register | PASS | `specs/014-workspace-branding/traceability.md` — FR -> Task -> Test -> Evidence rows for this scope. |

## Revalidation of running work (S29-PO-3 Q5)

The S30 implementation started before this Analyze (previous 1a session; uncommitted CSS and unit-test changes). It is revalidated against this Analyze before acceptance:

| Check | Status | Evidence |
|---|---|---|
| Scope confined to the approved S30 option 1a | PASS | Working tree touches only `components/branding/registration-hero.module.css` and `tests/unit/registration-hero.test.ts`; no shared glass recipe, `components/ui/glass`, `vendor/glisse`, `lib/design/*`, token file or `DESIGN.md` edit. |
| No new token, no hard-coded colour | PASS | `tests/unit/registration-hero.test.ts::introduces no new custom property` and `::tints the dense form region with the existing card token`. |
| No threshold weakened | PASS | The 3:1 focus-ring / button-boundary thresholds in `tests/e2e/registration-hero-glisse.spec.ts` are unchanged; the tint strength was raised to the PO-approved value instead of lowering any check. |
| Product decisions cited, not invented | PASS | Dark-field surface = S30-PO-2 option 1a; tint strength = S30-PO-6 (90% of `--color-card`). No behavior, copy, breakpoint or token was decided here. |
| Reduced-capability and print behavior preserved | PASS | `tests/unit/registration-hero.test.ts::keeps the reduced-capability fallbacks on the existing surfaces`; `::keeps the print reset for the Glisse blur`. |

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | Acceptance evidence | MEDIUM | FR-029 / SC-021; `tasks.md` T055 | T055 still requires the hosted CI, CodeRabbit and performance evidence for the actual implementation head; this lane produces local contrast/axe/screenshot evidence only. | Keep T055 open; do not infer its evidence from this lane. |
| A2 | Scope boundary | MEDIUM | FR-028 / SC-020; `tasks.md` T053, T056 | The signup-field restoration (FR-028) and the final FR-to-test reconciliation (T056) belong to other tasks/lanes and are not part of the T052 dense-form change. | Keep T053/T056 open with their owning lane; T052 must not close them. |
| A3 | Acceptance evidence | LOW | FR-026 / SC-018; prototype `97debaf` | No pixel-level comparison against the approved prototype is executed in this lane; the recorded assertions are token, contrast, theme, layout and axe checks. | Keep the prototype as the visual reference for the PO review of the regenerated screenshots. |

## Coverage and constitution

T052 maps to FR-026, FR-027 and FR-029, and to SC-018, SC-019 and SC-021; every touched requirement keeps at least one task mapping (100% of the 6 Hero FR/SC rows that this change can affect). The change introduces no schema, permission, retention, copy or performance requirement, so no Constitution v1.4.0 principle is engaged. The S30-PO-2/S30-PO-6 decisions are recorded in the spec Clarifications and the plan, and every implementation value is traceable to an existing token.

## Metrics and verdict

- Hero requirements: 5 FRs, 5 SCs; Hero tasks: 5 (T052..T056); T052 in scope for this lane.
- Coverage: 100% of the T052-tagged requirements have a task mapping.
- Findings: 0 CRITICAL, 0 HIGH, 2 MEDIUM, 1 LOW.
- Ambiguities/duplications identified: 0 / 0.
- Verdict: **PASS** for the Spec Kit entry gate and for the revalidation of the running T052 work. T052 may be ticked only after its asserting tests execute and pass on the final head, with the evidence cited in `traceability.md`.
- No tests were executed as part of this static analysis.

## Next actions

T052 implementation and assertions are complete on code head `1ba2374`: unit 32/32, dev matrix 54/54, production matrix 54/54, 32/32 screenshots with axe 0, and both required mutations killed and restored with `git diff --exit-code` clean. T052 stays unchecked until the PO visual review of the regenerated screenshot matrix against prototype `97debaf` closes the remaining FR-026 gap (A3); `T055` (hosted CI / CodeRabbit / performance evidence) and `T056` (final requirement reconciliation) remain open with their owners.

## History

### Round 7 — S32 Hero r20 (2026-11-04)

**Scope reviewed:** S32-PO-2 Q2 banner/card precedence; S32-PO-2 Q3 taken/reserved username status, field mapping and focus; S32-PO-8 Q7 username format across client, service, RPC and database. Sources are recorded in `spec.md` Clarifications and the S32 plan subsection.

#### Entry gate revalidation

| Check | Status | Evidence |
|---|---|---|
| Numbered requirements, measurable success criteria and Given/When/Then scenarios | PASS | `spec.md` FR-008, FR-028, SC-023/024 and Hero scenarios 6–8. |
| Clarifications and explicit ambiguity status | PASS | `spec.md` `## Clarifications` cites all three PO sources and explicitly says no behavior or validation ambiguity remains; exact EN/AR strings remain pending PO copy approval. |
| Plan and task IDs tagged with FRs | PASS | `plan.md` S32 signup/banner section; `tasks.md` T057–T060 tagged FR-028 / FR-008. |
| Fresh Analyze after spec/plan/tasks changes; 0 open CRITICAL/HIGH | PASS | This Round 7 is dated 2026-11-04 and follows the r20 artifact edits; findings below contain 0 CRITICAL and 0 HIGH. |

The initial entry check was recorded as FAIL in the r20 report because the prior documents did not cover this scope. After updating artifacts and this Analyze, the entry gate is revalidated PASS. No implementation started before this revalidation.

#### Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| R20-A1 | Copy approval | MEDIUM | `spec.md` FR-028; `lib/i18n/messages/en.ts`, `lib/i18n/messages/ar.ts` | The required username-specific unavailable message and format-error message need exact EN/AR wording; PO has not approved the example. | Draft strings in the run report only. Do not add localization keys or render the new copy until approved; continue validation and server work that does not depend on wording. |
| R20-A2 | Existing data prerequisite | MEDIUM | `public.clients.username_normalized`; migration T058 | A check constraint can reject existing usernames outside the new format. | Before migration work, run the required Stack B count-only query. A nonzero count blocks the constraint and requires a PO decision. |
| R20-A3 | Signup transaction mapping | MEDIUM | `lib/client-accounts/service.ts`; `public.client_signup` | The app currently forwards `duplicate` without field attribution; the RPC collapses reserved names to `invalid` and unique username collisions to `duplicate`. | Preserve generic failure and audit behavior while introducing one username-only internal status for both taken/reserved; map it to public `invalid_input` with only `username`. Add regression and Stack B integration tests. |
| R20-A4 | Username normalization | LOW | `lib/forms/signup-policy.ts`; `app/register/[token]/schema.ts`; `lib/client-accounts/validation.ts`; migration `20261104001000_f15_signup_profile.sql` | Current NFKC normalization can accept non-ASCII compatibility characters, and current validation only checks non-empty/reserved. The existing pushed migration has a broader NFKC/lower check and is immutable. | Validate the authored input against the PO's ASCII rule in new code and a new forward migration; leave `20261104001000` untouched. Keep database storage lowercase normalization consistent with case-insensitive matching. |
| R20-A5 | Protected artifacts | LOW | `AGENTS.md`; `app/(dev)/showcase/rest/` | User-owned untracked paths are present. | Exclude both from staging and commit. |

#### Decision and coverage review

- No change to the glass card/artwork rendering is needed for S32-PO-2 Q2; the requirement clarifies interpretation only.
- The unavailable status must not identify which source (reserved or already claimed) caused it. The server result should be one username-specific outcome; public result carries `invalid_input` and `username` only.
- The format rule applies to the raw username characters before NFKC can broaden the accepted alphabet. Normalize accepted values to lowercase using the existing storage convention.
- Proposed `T057`–`T060` cover all touched FRs. The migration path is gated on a zero Stack B violating-row count and unique version scans across all origin refs before commit and push.
- Exact localized strings remain the only unresolved PO copy decision. It does not invalidate the technical acceptance scenarios, but blocks rendering that new copy.
- This analysis is static; no tests or database queries were run as part of Analyze.

#### Metrics and verdict

- Touched requirements: FR-008 and FR-028; touched success criteria: SC-023/SC-024 plus existing SC-020.
- New task mapping: T057–T060.
- Findings: 0 CRITICAL, 0 HIGH, 3 MEDIUM, 2 LOW.
- Open behavior/validation ambiguities: 0. Localized copy approval remains open and is recorded separately.
- Verdict: **PASS** for Spec Kit entry to the approved technical work. T058 constraint work remains conditional on Stack B count = 0; T059 rendered-message work remains conditional on PO copy approval.

- Round 1 at `da56320af3cc8bba73a2e4f09258b7339a8a9504`: architect accepted findings A1-A6 for the Hero scope on the registration implementation lane.
- Round 2 at `e0a012f98e2d7c4a76b89037b7517a525ba1934b`: accepted static traceability/decision citations for the F14 Hero scope.
- Round 3 at `75aa62a6495bd9b2675b6e2f993eb283fdb8611b`: accepted FR-026..030 / SC-018..022 and T052..T056 committed to `spec.md`, `plan.md`, `tasks.md`, `hero-implementation-plan.md`.
- Round 4 at this file (2026-11-03, `014-hero-glisse`): accepted Hero coverage applied to this branch, S30-PO-2/S30-PO-6 recorded in the Clarifications and plans, and the running T052 work revalidated per S29-PO-3 Q5. Coverage remains complete with 0 CRITICAL/HIGH findings.
- Round 5 at this file (2026-11-03, after the executed evidence was recorded): the T052 assertions executed and passed on code head `1ba2374` (unit 32/32; dev matrix 54 expected / 0 unexpected; production matrix 54 expected / 0 unexpected; 32 screenshots with axe 0; mutation (i) and (ii) killed and restored with a clean `git diff --exit-code`). FR-027, FR-029, SC-019 and SC-021 are VERIFIED; FR-026 and SC-018 stay PARTIAL on the named prototype-review gap (A3), so T052 remains unchecked. No CRITICAL/HIGH finding was introduced.

## Round 6 revalidation (2026-11-04)

The task checkbox update records S32-PO-1 approval of the r18 visual review and the already-passing assertion evidence; no spec, plan, or requirement wording changed. No open ambiguity remains for the focus correction or T052 record. The separate S32 PO-decision items in CodeRabbit threads 4463105165 and 4463105170 remain explicitly unresolved and are not changed here. Findings: 0 CRITICAL, 0 HIGH. Verdict: **PASS** for Spec Kit entry and revalidation; T052 and T053 evidence is cited in `traceability.md`.

### Round 8 — S32 Hero r20 final gate revalidation (2026-11-04)

**Scope reviewed:** task completion evidence and final verification for the S32-PO-2 Q2/Q3 and S32-PO-8 Q7 implementation. No requirement wording changed in this round.

| Check | Result | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs, and Given/When/Then scenarios | PASS | `spec.md` FR-008/FR-028, SC-023/SC-024 and scenarios 6–8. |
| Clarifications and explicit ambiguity status | PASS | `spec.md` cites the three PO decisions; behavior/rule scope is explicit; exact EN/AR strings remain explicitly pending PO copy approval. |
| Plan and FR-tagged task IDs | PASS | `plan.md`; `tasks.md` T057–T060. T057/T060 are checked with r20 evidence; T058/T059 remain open where gated work is incomplete. |
| Analyze after the latest spec/plan/tasks edit; open CRITICAL/HIGH findings | PASS | Round 8 timestamp follows the task status update; 0 open CRITICAL/HIGH findings. |

#### Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| R20-R8-A1 | MEDIUM | Stack B has 21 existing username values outside the approved rule; a check constraint would reject them. | PO decision required; constraint blocked. |
| R20-R8-A2 | MEDIUM | Exact username-unavailable and format-error EN/AR copy is not approved. | Copy approval required; no draft is rendered. |
| R20-R8-A3 | MEDIUM | Stack B migration history requires an unrelated missing version and then 22 earlier migrations with `--include-all`. | Integration blocked; do not repair or apply. |
| R20-R8-A4 | LOW | Existing DOB keyboard-order E2E assertion fails identically on pre-r20 `d5efa39` and r20; r20 does not change the name→DOB DOM order or DOB behavior. | Pre-existing, outside the approved username change; threshold/test retained. |
| R20-R8-A5 | LOW | Protected untracked `AGENTS.md` and `app/(dev)/showcase/rest/` remain in the worktree. | Excluded from staging. |

**Verdict:** PASS for Spec Kit entry and revalidation. No open CRITICAL/HIGH findings. T057 and T060 are verified; T058 and T059 are intentionally open pending their recorded data/copy gates. The exact PO-approved T052 wording remains unchanged.

## Round 9 — S33 r21 (2026-11-04)

### Scope and entry check

Revalidated after the S33 edits to `spec.md`, `plan.md`, and `tasks.md`. Scope: the approved Q9 constraint deferral and synthetic Stack-B audit (T058), Q10 EN copy / pending AR draft and Q11 clear-on-edit behavior (T059), plus refreshed username error-state UI evidence (T060). FR-028 and SC-023 cover the validation, server status, field association, focus, and constraint scope; Hero Given/When/Then scenarios 7–9 now cite the PO decisions. Tasks remain FR-tagged T058–T060. No open behavior ambiguity remains; Q9 remediation and Egyptian-colloquial AR copy are explicitly open approval gates.

| Gate item | Result | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs, Given/When/Then | PASS | `spec.md` FR-028, SC-023, scenarios 7–9. |
| Clarifications / decision register; explicit ambiguity state | PASS | `spec.md` Clarifications cite S32-PO-9 Q9–Q11; no behavior ambiguity; AR copy and Q9 remediation approval remain open. |
| Plan and task IDs tagged to FRs | PASS | `plan.md` S32 signup clarification records Q9–Q11; `tasks.md` T058–T060 [FR-028 / FR-008]. |
| Analyze newer than spec/plan/tasks | PASS | This Round 9 is dated 2026-11-04 after those edits. |

### Findings

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| R9-A1 | MEDIUM | Stack B has 21 synthetic existing usernames outside the allowed ASCII set; constraint rollout must await PO-approved remediation under Q9. | Keep T058 open. This run audits counts/pattern classes only; no data changes or constraint migration. |
| R9-A2 | MEDIUM | Egyptian-colloquial AR unavailable and format-error strings await PO approval under Q10. | Keep generic AR field error. Do not ship the draft. |
| R9-A3 | MEDIUM | Stack B history is 64 rows vs 113 branch migrations, with a remote-only version and 50 versions absent from history. | No repair; this is not the same-blob rename repair accepted on Stack D. Keep history sync outside the Hero run pending the separate decision. |

**Coverage:** FR-028 / SC-023 map to T057–T059; screenshot evidence for signup rendering maps to T060/FR-008 and FR-028. No new schema or permission change is included. EN copy and username edit behavior are already decided in the PO register. The availability check remains submit-only.

**Findings count:** 0 CRITICAL, 0 HIGH, 3 MEDIUM.

**Verdict:** PASS for the existing-PR review fixes and non-schema work in this run. T058 database constraint and any Stack B history repair remain blocked by their recorded gates. T059 remains open until the AR draft is approved; T060 is open until the current-head screenshot and axe evidence is recorded in traceability.

## Round 10 — S33 r21 copy clarification addendum (2026-11-04)

This addendum follows the last `spec.md` edit, which replaced the stale copy-pending statement in acceptance scenario 7 with the exact EN string approved by S32-PO-9 Q10. It changes no user-visible behavior beyond the already-approved Q10 wording and leaves AR copy pending.

- Entry gate: PASS. FR-028/SC-023 remain numbered and measurable; scenarios 7–9 cover Q3/Q7/Q10/Q11. Clarifications cite Q9–Q11, state no behavior ambiguity, and name the remaining Q9/AR approval gates. `plan.md` and T058–T060 remain FR-tagged.
- Design: no new component, token, color, spacing, font, motion, or dependency; existing i18n keys and semantic error treatment only.
- Security/privacy: taken and reserved results share the same string; no raw username data is logged or exposed.
- Coverage/traceability: targeted unit file passes 7/7; r21 local format-error screenshot matrix passes 12/12 captures with axe 0. T060 checkbox/evidence remains pending until committed traceability.
- Findings count: 0 CRITICAL, 0 HIGH, 3 MEDIUM (the Q9 remediation/data gate, pending AR copy, and Stack B migration-history mismatch from Round 9 remain open).

**Verdict:** PASS for the current in-scope review/copy edits; all three medium gates remain as previously recorded. No migration or Stack B history change is authorized.


## Round 11 — S33 r21 evidence revalidation (2026-11-04)

This round follows the final r21 task-status and traceability edits. It records passing evidence for T060 on commit 9f0cd68; the requirement scope and approved behavior did not change. FR-028 still reflects Q9 constraint deferral, Q10 English approval with Arabic approval pending, and Q11 clear-on-edit / submit-only availability.

- Entry gate: PASS. FR-028 and SC-023 remain numbered/measurable; acceptance scenarios 7–9 cover approved Q9–Q11 behavior. Clarifications cite S32-PO-9 and explicitly state no behavior ambiguity; PO decisions remain open only for remediation and the Arabic draft. Plan and tasks retain FR tags.
- Evidence: `tests/unit/client-signup-focus.test.tsx` passed 7/7; `tests/e2e/client-signup-username-screenshots.spec.ts::captures invalid Username across locale, theme and viewport` passed 1/1 with 12 captures and axe 0 per capture. T060 is checked with commit/test evidence in `tasks.md`. T058 and T059 remain open.
- Design/security: no design token, component, motion, dependency, schema, or data change. Username unavailability remains enumeration-neutral; client edits do not perform availability checks.
- Findings count: 0 CRITICAL, 0 HIGH, 3 MEDIUM (Q9 remediation and constraint deferral; Q10 Arabic draft approval; Stack B migration-history mismatch).

**Verdict:** PASS for current approved code/docs scope. T060 verified; T058 and T059 remain open pending their named PO decisions. No migration or Stack B repair is part of this work.

## Round 12 — S34 r22 approved copy and existing-account deferral (2026-11-05)

### Entry gate

- PASS — `spec.md` has numbered FRs (FR-028), measurable SC-023, and Given/When/Then scenarios 7–9 for username validation and errors.
- PASS — `spec.md` Clarifications cites S34-PO-1 H1=A/H2=A and explicitly states no open behavior ambiguity remains. The verbatim decisions are recorded in the F14 spec decision register.
- PASS — `plan.md` and `tasks.md` cover H1/H2 with FR-tagged T058/T059. T058 remains open by decision; no constraint is added.
- PASS — this Analyze round follows the spec/plan/tasks edits and records 0 CRITICAL / 0 HIGH.

### Findings

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| R12-A1 | MEDIUM | Stack B has 21 invalid-character synthetic usernames and migration-history drift (64/113); signup E2E that requires unapplied `20261107032001` is environment-drift blocked. | Keep T058 open under H2=A; no data/schema/history changes. Provide a read-only convergence proposal. |
| R12-A2 | MEDIUM | Existing review thread `zuDS8` reports a stale local invalid-input alert after identity errors clear. | RED-first fix in this authorized existing PR scope. |
| R12-A3 | MEDIUM | Existing review thread `zuDTL` reports an extra FR-008 traceability cell. | Fix the table row to five cells; preserve existing status. |
| R12-A4 | MEDIUM | Existing review thread `zuVlm` reports dark error token leakage to light-OS Follow Device. | RED-first fix and rendered theme checks; no new tokens. |

**Coverage:** S34-PO-1 H1/A specifies exact bilingual strings; H2/A defers existing-account enforcement without changing new-signup validation. All touched FRs remain mapped to T058/T059. No product decision or design gap is introduced. **Findings count:** 0 CRITICAL, 0 HIGH, 4 MEDIUM. **Verdict:** PASS for the in-scope existing-PR work and the required H1/H2 spec clarification.
## Round 13 — S34 r22 implementation revalidation (2026-11-05)

This round follows the final copy, H2 deferral, and FR-008 traceability edits. It revalidates the in-scope CodeRabbit fixes before acceptance.

- Entry gate: PASS. FR-028, SC-023 and scenarios 7–9 remain numbered/measurable and aligned with S34-PO-1 H1=A/H2=A. Clarifications explicitly state no open behavior ambiguity. Plan/tasks retain FR-tagged T058/T059. This analysis follows the latest scope text and plan edits.
- Behavior/security: exact approved Arabic strings use Western digits and the same unavailable message remains shared by taken/reserved. H2 continues to defer existing-account validation and any DB constraint; no data/schema/history change. `zuDS8` affects only the initial local invalid result; no username availability check was added. `zuVlm` uses existing semantic tokens under explicit Dark or OS-dark Follow Device.
- Evidence: targeted units pass 12/12; Playwright screenshot matrix and Follow Device check pass 2/2 on Stack B with axe 0 across 8 captures. RED failures were observed before both code fixes.
- Docs: FR-008 traceability row now has five cells; no `MD056` table-column-count finding remains for that row. The full historical traceability file has pre-existing Markdown style/line-length findings unrelated to this edit; no broad reformat was performed.
- Design: no new token, color, spacing, font, component, motion, effect or dependency. No design gap in the changed behavior.

**Findings count:** 0 CRITICAL, 0 HIGH, 4 MEDIUM (Stack B drift/H2 remediation and the three open review threads until pushed/replied). **Verdict:** PASS for the in-scope existing-PR fixes. T058 remains open; T059/T060 close only after tests pass on the committed head with evidence.
## Round 14 — S34 r22 committed evidence (2026-11-05)

This round follows the T059/T060 checkbox and traceability evidence updates.

- Entry gate: PASS. FR-028 / SC-023 / scenarios 7–9 remain aligned with S34-PO-1 H1=A/H2=A. `spec.md`, `plan.md`, FR-tagged tasks, and the Clarifications session state no open behavior ambiguity. This analysis follows the latest task/traceability edits.
- T059 is verified by commit `0dbc25a` and the 13/13 targeted unit run; T060 is verified by commit `8f09b8b` and 8 rendered captures with axe 0. T058 remains open by H2=A.
- Follow Device is verified under light and dark OS themes with semantic token checks. The stale local alert regression is fixed without adding server calls. No design token/component/color/spacing/font/motion/dependency change beyond the scoped Bidi wrapper and theme guard.
- Stack B baseline and final StartedAt check remain read-only; migration drift keeps `20261107032001` dependent E2E classified as ENV-DRIFT. No assertions are changed.

**Findings count:** 0 CRITICAL, 0 HIGH, 4 MEDIUM (Stack B migration drift, H2 remediation deferral, and the remaining open `zeI67` thread pending architect/reviewer agreement). **Verdict:** PASS for committed in-scope fixes. T058 remains open; no database constraint is introduced.
## Round 15 — S34 r23 docs and signup-test review fixes (2026-11-05)

This round follows the S34-PO-1 H1=A/H2=A clarification and planning/task additions for the authorized existing-PR review fixes T061/T062.

### Entry revalidation

- PASS — `spec.md` retains numbered FR-028, measurable SC-023, and Given/When/Then scenarios 7–9. The clarifications cite H1=A/H2=A and explicitly state no open behavior ambiguity.
- PASS — `plan.md` and `tasks.md` now map the two fixes to FR-028 tasks T061/T062. H1=A is approved/shipped; H2=A defers existing-account validation and the database constraint, leaving T058 open.
- PASS — no requirement or user behavior was added. These are consistency and regression-test maintenance changes within the existing PR scope.
- PASS — no UI implementation changes are planned in this round. The separate `z3iuY` light error-border contrast finding remains a PO-gated design gap; the error border is unchanged.

### Findings and disposition

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| R15-A1 | MEDIUM | Plan.md retained a database-constraint requirement and migration step that conflict with S34-PO-1 H2=A. | Corrected; no constraint or migration is planned in this round; T058 stays open. |
| R15-A2 | MEDIUM | Spec.md retained the pre-H1 Arabic-copy-pending status. | Corrected to cite H1=A and the exact approved/shipped strings. |
| R15-A3 | MEDIUM | Signup tests had stale fixed DOB values and/or omitted newly required identity values, so assertions did not isolate their intended fields. | T062 RED-first test fixture repair; preserve the intended invalid DOB/password assertions and use relative dates. |
| R15-A4 | MEDIUM | `z3iuY` requests a light error-border contrast treatment not decided by the approved design system. | Leave the CSS unchanged, reply that a PO design decision is required, and keep the thread open. |

**Findings count:** 0 CRITICAL, 0 HIGH, 4 MEDIUM. **Verdict:** PASS to continue the authorized docs and test fixes. No schema, database, user-facing copy, visual style, or new signup behavior changes are authorized by this round.