# F15 traceability addendum — S31 h10

This addendum records the approved S31-PO-1 fixes only. Existing task checkboxes in `tasks.md` were not changed by this round.

| Requirement | Existing task | Test/evidence | Commit |
| --- | --- | --- | --- |
| FR-026, FR-036, FR-037 — approved Terms copy stays exact | T033 | `tests/unit/forms-approved-copy-s27.test.ts` — pinned Q1 Terms paragraph and superseded-copy mutant, 4/4 targeted tests passed; `specs/015-forms-intake/reports/S14-terms-draft.md` byte diff is one Arabic paragraph line vs h9. | `89c89ac` |
| FR-004, FR-006, FR-007 — slider label validation parity | T034 | `tests/unit/forms-s14-validation.test.ts`; `tests/integration/forms-builder-persistence.test.ts` — SQL omission case and crash-safe missing-middle mutant; `tests/integration/function-drift-guard.ts` — migration drift guard. Focused Stack D suites passed 18/18. | `89c89ac` |

The authorized-route screenshot matrix and the shared client-recovery probe-batching adjustment remain partial integration/evidence work and do not complete T006/T009 or authorize marking those tasks complete.

## S32 h12 PO-8 traceability

| Requirement | Task | Test/evidence | Commit |
| --- | --- | --- | --- |
| FR-026 / FR-036 / FR-037 � record Q5/Q6 decisions, update the approved scope, and refresh Analyze | T058 | `specs/015-forms-intake/checklists/analyze.md` dated 2026-11-04; 0 Critical / 0 High; Clarifications cite S32-PO-8 and state no open ambiguities for authorized work. | `6e6dd4b` |
| FR-026 / FR-036 / FR-037 � implement exact approved English controls and behavior | T059 | `tests/unit/forms-s32-approved-intake.test.ts`; focused seven-file unit run passed 47/47; remaining English rows and T03 Arabic labels are still pending. | `6aebb8d` |
| FR-026 / FR-036 / FR-037 � verify control order, conditions, assets, rendered matrix, and accessibility | T060 | `tests/e2e/forms-authorized-route.spec.ts::approved F15 controls render in both locales, themes, and widths`; `tests/e2e/forms-authorized-route.spec.ts::renders recorded new client controls across AR/EN, theme, and viewport matrix`; focused unit run 47/47; screenshots under `%TEMP%/lifter-s32-f15-h12`. | `6aebb8d` |

### T060 final-head evidence refresh (2026-11-04)

- Implementation head: `8183064`.
- `tests/e2e/forms-authorized-route.spec.ts::approved F15 controls render in both locales, themes, and widths`: PASS, all 12 AR/EN x light/dark x 360/390/1024 cells; axe clean; explicit viewport-width check.
- `tests/e2e/forms-authorized-route.spec.ts::renders recorded new client controls across AR/EN, theme, and viewport matrix`: PASS, 1/1.
- `tests/e2e/forms-authorized-route.spec.ts::submitted answer edits wait for explicit correction and use the latest revision`: PASS, 1/1.
- Final `npm run test`: 189 files / 2,326 passed. Full-suite integration and unrelated Playwright failures are detailed in the S32 h12 run report. No changed F15 assertion failed.
- N12 overflow regression: RED at 390px (document scrollWidth 431px, viewport 390px); GREEN after min-inline-size and flex shrink constraints; final Arabic screenshot shows percentage labels and radio controls within the viewport.
- Rendered evidence: `%TEMP%/lifter-s32-f15-h12/INDEX.md` (210 screenshots).
