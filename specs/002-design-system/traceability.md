# Design System Foundation — Traceability (merged scope)

**Scope:** Existing merged F2 FR-001..FR-026 and SC-001..SC-007. The PR #28 shipped delta is separately covered by the Design System coverage PR. Static inspection only; no tests run.

| Requirement | Tasks | Asserting tests / evidence | Status |
|---|---|---|---|
| FR-001 | T004-T008 | `tokens-contrast.test.ts`, `tokens-css.test.ts` | VERIFIED |
| FR-002 | T004-T008 | `tokens-contrast.test.ts`; DESIGN.md §2 token reference | VERIFIED |
| FR-003 | T005-T008,T020-T022 | `tokens-contrast.test.ts`, `brand-fuzz.test.ts`, `components.spec.ts` | VERIFIED |
| FR-004 | T005-T008,T021-T022 | `tokens-contrast.test.ts`, `components.spec.ts` semantic color assertions | VERIFIED |
| FR-005 | T005,T020-T022 | `brand-fuzz.test.ts`, `components.spec.ts` BrandScope contrasts | VERIFIED |
| FR-006 | T009,T015,T019 | `preferences.test.ts`, `theme-locale.spec.ts` | VERIFIED |
| FR-007 | T004,T008 | token contract and `tokens-css.test.ts`; approved range evidence is static | PARTIAL |
| FR-008 | T009-T011,T016,T019 | `preferences.test.ts`, `theme-locale.spec.ts` first-paint locale/dir cases | VERIFIED |
| FR-009 | T012-T013,T033-T036 | `logical-css.test.ts`, `shell.spec.ts` RTL navigation assertions | VERIFIED |
| FR-010 | T017-T019 | `theme-locale.spec.ts` mixed-direction sample; `Bidi` component | VERIFIED |
| FR-011 | T010,T018 | `messages.test.ts` catalog parity and non-empty messages | VERIFIED |
| FR-012 | T011 | self-hosted font declarations and layout source inspection | PARTIAL |
| FR-013 | T012 | icon source plus `logical-css.test.ts`; accessible icon names checked in component assertions | PARTIAL |
| FR-014 | T023-T026 | `components.spec.ts` button states and repeat-activation assertions | VERIFIED |
| FR-015 | T027-T028 | `components.spec.ts` field labeling/error association assertions | VERIFIED |
| FR-016 | T029 | component tests and token contract | VERIFIED |
| FR-017 | T030-T031 | `components.spec.ts` dialog focus/Escape/return assertions | VERIFIED |
| FR-018 | T032 | `components.spec.ts` distinct state and retry assertions | VERIFIED |
| FR-019 | T032 | `components.spec.ts` toast/alert announcement assertions | VERIFIED |
| FR-020 | T011,T032 | reduced-motion CSS inspection; transition behavior not independently rerun | PARTIAL |
| FR-021 | T033-T036 | `shell.spec.ts` wide/narrow layouts and label behavior | VERIFIED |
| FR-022 | T033-T036 | `shell-navigation.test.ts`, `shell.spec.ts` role lists and undefined-role state | VERIFIED |
| FR-023 | T014,T018-T019,T021,T035 | `showcase-gate.test.ts`, `theme-locale.spec.ts`, `components.spec.ts` | VERIFIED |
| FR-024 | T037-T039 | `print.spec.ts`, `print-spike.md` evidence | VERIFIED |
| FR-025 | T041 | `docs/04-changes-and-questions.md` D-18, constitution and architecture records | VERIFIED |
| FR-026 | T040 | Plan NEEDS DECISION register ND-1..ND-7 | VERIFIED |
| SC-001 | T005-T008,T020-T022 | `tokens-contrast.test.ts`, `brand-fuzz.test.ts`, `components.spec.ts` | VERIFIED |
| SC-002 | T019,T026,T031,T036 | `tests/e2e/a11y.spec.ts`, `tests/e2e/theme-locale.spec.ts`, `tests/e2e/components.spec.ts`, `tests/e2e/shell.spec.ts`; full axe matrix not rerun | PARTIAL |
| SC-003 | T019,T026,T036 | keyboard cases in `components.spec.ts` and `shell.spec.ts`; not rerun | PARTIAL |
| SC-004 | T009,T011,T015-T019 | `preferences.test.ts`, `theme-locale.spec.ts` | VERIFIED |
| SC-005 | T010 | `messages.test.ts` | VERIFIED |
| SC-006 | T037-T039 | `print-spike.md` pass/fail evidence for shaping, direction, mixed runs, tables and hidden chrome | VERIFIED |
| SC-007 | T042 | historical CI build/size gates; no run in this lane | PARTIAL |

## Summary

- FR: 22 VERIFIED, 4 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- SC: 4 VERIFIED, 3 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- Historical task checkboxes remain unchanged. No tests were executed in this reconciliation.
