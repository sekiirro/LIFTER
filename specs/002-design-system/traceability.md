# Design System traceability

Targeted verification executed on current local head `6233642ced5fddc9e695eb28cf528f5f5ab56c89`: `npm exec vitest -- run tests/unit/messages.test.ts -t "has identical nonempty catalogs"`; result: 1 passed, 1 skipped (exit 0). Other test names below were inspected in the checked-out source. `VERIFIED` means a concrete test exists and asserts the requirement; `PARTIAL` means no direct asserting test/evidence was found in this pass.

Evidence commits: original Design System implementation `be29751`, `e2df0cd`, `b57d404`, `d9b9fd7`; merged PR #28 head/approved SHA `12bcad944c9366f17afc00a36bd14586c5f2e77a`.

| Requirement | Task(s) | Test(s) / evidence | Status |
|---|---|---|---|
| FR-001 | T006, T008 | `tests/unit/tokens-contrast.test.ts::keeps body and muted text readable on both surfaces`; `tests/unit/tokens-css.test.ts` selector/token assertions | VERIFIED |
| FR-002 | T006 | `tests/unit/tokens-contrast.test.ts::keeps body and muted text readable on both surfaces` | VERIFIED |
| FR-003 | T004, T005, T007, T008, T022 | `tests/unit/color.test.ts::preserves the approved fill with a dark label in both modes`; `tests/unit/tokens-contrast.test.ts`; `tests/e2e/components.spec.ts::workspace brand buttons pass contrast and preserve semantic colors` | VERIFIED |
| FR-004 | T006, T007, T022, T029 | `tests/unit/tokens-contrast.test.ts`; `tests/e2e/components.spec.ts::workspace brand buttons pass contrast and preserve semantic colors` | VERIFIED |
| FR-005 | T004, T005, T007, T008, T020, T022 | `tests/unit/color.test.ts` parsing/derivation cases; `tests/e2e/components.spec.ts::workspace brand buttons pass contrast and preserve semantic colors` | VERIFIED |
| FR-006 | T009, T011, T015, T019 | `tests/unit/preferences.test.ts::accepts both locales and maps direction`; `tests/e2e/theme-locale.spec.ts::persists dark and restores the live device preference` | VERIFIED |
| FR-007 | T006 | `tests/unit/tokens-contrast.test.ts` checks token surfaces and contrast; radii values are present in `lib/design/tokens.ts` but no direct radius assertion located | PARTIAL |
| FR-008 | T009, T010, T011, T016, T019 | `tests/e2e/theme-locale.spec.ts::defaults to Arabic and persists English after switching`; `::cookies are already reflected in response HTML` | VERIFIED |
| FR-009 | T012, T013 | `tests/unit/logical-css.test.ts::scans all application and component styles`; `tests/e2e/shell.spec.ts::Arabic RTL portal tooltip stays content-sized beside its trigger in both themes` | VERIFIED |
| FR-010 | T017 | `tests/e2e/theme-locale.spec.ts::defaults to Arabic and persists English after switching` covers the bilingual showcase; no direct bidi-order assertion located | PARTIAL |
| FR-011 | T010, T016 | `tests/unit/messages.test.ts::has identical nonempty catalogs`; `tests/unit/messages.test.ts::uses the specified Arabic navigation labels` | VERIFIED |
| FR-012 | T001, T011 | Font package/configuration is present; no test asserting font selection/fallback behavior located | PARTIAL |
| FR-013 | T012 | `tests/e2e/a11y.spec.ts` scans the showcase; no direct icon API/name assertion located | PARTIAL |
| FR-014 | T023, T030, T031, T032 | `tests/e2e/components.spec.ts::Tab reaches the primary button with a visible focus indicator`; `::loading buttons ignore pointer and keyboard activation` | VERIFIED |
| FR-015 | T024, T030, T031, T032 | `tests/e2e/components.spec.ts::invalid fields reference the visible error and hint` | VERIFIED |
| FR-016 | T025, T030, T031 | `tests/e2e/a11y.spec.ts` checks showcase component matrix; no direct Card radius assertion located | PARTIAL |
| FR-017 | T026, T030, T031, T032 | `tests/e2e/components.spec.ts::dialog focuses cancel, contains focus, and restores the trigger after Escape` | VERIFIED |
| FR-018 | T027, T030, T031, T032 | `tests/e2e/components.spec.ts::Retry increments the demonstration counter` and `::a11y` showcase matrix | VERIFIED |
| FR-019 | T028, T029, T030, T031, T032 | `tests/e2e/components.spec.ts::toast uses the pre-existing polite region without moving focus, and dismisses`; `::auto-dismisses after five active seconds and pauses for hover and focus` | VERIFIED |
| FR-020 | T006, T011, T023, T027, T032 | `tests/e2e/components.spec.ts::reduces button transitions and disables skeleton shimmer` | VERIFIED |
| FR-021 | T036, T047, T048, T050, T051 | Existing responsive-shell evidence at the pre-Q5 implementation breakpoint; Q16/Q5 1024px sidebar and 1024–1199px content-clearance tasks remain unchecked pending implementation/browser verification (T034's `min-width: 48rem` / provisional ND-3 does not describe FR-021; the 48rem value is superseded by S31-PO-7 Q5) | PARTIAL |
| FR-022 | T033, T034, T036 | `tests/unit/navigation.test.ts::defines the exact trainer order, labels, and icons`; `::defines the exact client order, labels, and icons`; shell role cases | VERIFIED |
| FR-023 | T001, T002, T014, T018, T021, T030, T035, T040 | `tests/unit/showcase-gate.test.ts::enables only the exact flag`; `tests/e2e/theme-locale.spec.ts::uses device colors without a theme cookie and serves the enabled showcase` | VERIFIED |
| FR-024 | T037, T038, T039 | `tests/e2e/print.spec.ts::Arabic print sample hides screen controls and exports its PDF`; `specs/002-design-system/print-spike.md` | VERIFIED |
| FR-025 | T041 | Constitution v1.1.0, D-18, and Architecture v3 UI-row diffs in commit `b57d404`; no test applicable to document content | PARTIAL |
| FR-026 | T040 | `specs/002-design-system/plan.md` decision table is present; no executable asserting test is applicable or recorded | PARTIAL |
| FR-027 | T043, T044, T045, T047, T050, T051 | Existing PR #28 evidence in checked T043-T045, plus unchecked Q16/Q5 follow-up tasks T047, T050, and T051 (implementation and screenshot) | PARTIAL |
| FR-028 | T043, T048, T049 | Existing unit tests cover fallback selection and the browser test covers over-budget focus identity; T048-T049 remain unchecked for all fallback conditions | PARTIAL |
| FR-029 | T045 | `tests/unit/glass-popover-menu.test.tsx::opens on ArrowUp at the last item and on ArrowDown at the first`; `::moves focus with arrows and wraps at either end`; `::supports Home and End and closes without trapping Tab`; `::returns focus to the trigger on Escape`; `::activates the focused item with Space`; `tests/e2e/glass.spec.ts::popover ArrowDown navigation works after enhancement` | VERIFIED |
| SC-001 | T007 | `tests/unit/tokens-contrast.test.ts` contrast assertions for both modes and sample colors | VERIFIED |
| SC-002 | T031 | `tests/e2e/a11y.spec.ts` AR/EN × dark/light axe matrix | VERIFIED |
| SC-003 | T032, T034, T036, T045 | `tests/e2e/components.spec.ts` keyboard cases; `tests/e2e/shell.spec.ts` desktop/mobile keyboard cases | VERIFIED |
| SC-004 | T019 | `tests/e2e/theme-locale.spec.ts::cookies are already reflected in response HTML`; device color tests | VERIFIED |
| SC-005 | T010 | `tests/unit/messages.test.ts::has identical nonempty catalogs`; run at `6233642ced5fddc9e695eb28cf528f5f5ab56c89` (1 passed) | VERIFIED |
| SC-006 | T038-T039 | `tests/e2e/print.spec.ts::Arabic print sample hides screen controls and exports its PDF`; print-spike report | VERIFIED |
| SC-007 | — | Build-size gate evidence is not mapped to a tagged task or re-verified in this static pass; T042 remains untagged and is not attributed to SC-007 | PARTIAL |
| SC-008 | T046 | PR #28 body reports 15 paired samples and passing median deltas; local report outputs r1-r8 are referenced but not present in this checkout; measurement not rerun | PARTIAL |
| SC-010 | T047-T048, T050-T051 | Static inspection only; PR #28 source uses a 75rem breakpoint, so the approved 64rem breakpoint and 1024/1440 screenshot assertions remain unimplemented and unchecked | PARTIAL |
| SC-009 | T043, T048-T049 | Existing unit tests cover fallback selection and browser focus identity for over-budget fallback only; T048-T049 remain unchecked for all fallback conditions | PARTIAL |
| SC-011 | T050-T051 | 1024–1199px content/sidebar non-overlap is specified; implementation and browser assertions remain unchecked | PARTIAL |

## Static verification note

The targeted SC-005 catalog parity test above was executed; no broader test suite was run. Task T046 remains unchecked because its performance run output is absent from this checkout; the PR description's summary was inspected but does not replace the requested evidence artifact.

