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

- Round 1 at `da56320af3cc8bba73a2e4f09258b7339a8a9504`: architect accepted findings A1-A6 for the Hero scope on the registration implementation lane.
- Round 2 at `e0a012f98e2d7c4a76b89037b7517a525ba1934b`: accepted static traceability/decision citations for the F14 Hero scope.
- Round 3 at `75aa62a6495bd9b2675b6e2f993eb283fdb8611b`: accepted FR-026..030 / SC-018..022 and T052..T056 committed to `spec.md`, `plan.md`, `tasks.md`, `hero-implementation-plan.md`.
- Round 4 at this file (2026-11-03, `014-hero-glisse`): accepted Hero coverage applied to this branch, S30-PO-2/S30-PO-6 recorded in the Clarifications and plans, and the running T052 work revalidated per S29-PO-3 Q5. Coverage remains complete with 0 CRITICAL/HIGH findings.
- Round 5 at this file (2026-11-03, after the executed evidence was recorded): the T052 assertions executed and passed on code head `1ba2374` (unit 32/32; dev matrix 54 expected / 0 unexpected; production matrix 54 expected / 0 unexpected; 32 screenshots with axe 0; mutation (i) and (ii) killed and restored with a clean `git diff --exit-code`). FR-027, FR-029, SC-019 and SC-021 are VERIFIED; FR-026 and SC-018 stay PARTIAL on the named prototype-review gap (A3), so T052 remains unchecked. No CRITICAL/HIGH finding was introduced.

## Round 6 revalidation (2026-11-04)

The task checkbox update records S32-PO-1 approval of the r18 visual review and the already-passing assertion evidence; no spec, plan, or requirement wording changed. No open ambiguity remains for the focus correction or T052 record. The separate S32 PO-decision items in CodeRabbit threads 4463105165 and 4463105170 remain explicitly unresolved and are not changed here. Findings: 0 CRITICAL, 0 HIGH. Verdict: **PASS** for Spec Kit entry and revalidation; T052 and T053 evidence is cited in `traceability.md`.
