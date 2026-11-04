# F15 traceability addendum — S31 h10

This addendum records the approved S31-PO-1 fixes only. Existing task checkboxes in `tasks.md` were not changed by this round.

| Requirement | Existing task | Test/evidence | Commit |
| --- | --- | --- | --- |
| FR-026, FR-036, FR-037 — approved Terms copy stays exact | T033 | `tests/unit/forms-approved-copy-s27.test.ts` — pinned Q1 Terms paragraph and superseded-copy mutant, 4/4 targeted tests passed; `specs/015-forms-intake/reports/S14-terms-draft.md` byte diff is one Arabic paragraph line vs h9. | `89c89ac` |
| FR-004, FR-006, FR-007 — slider label validation parity | T034 | `tests/unit/forms-s14-validation.test.ts`; `tests/integration/forms-builder-persistence.test.ts` — SQL omission case and crash-safe missing-middle mutant; `tests/integration/function-drift-guard.ts` — migration drift guard. Focused Stack D suites passed 18/18. | `89c89ac` |

The authorized-route screenshot matrix and the shared client-recovery probe-batching adjustment remain partial integration/evidence work and do not complete T006/T009 or authorize marking those tasks complete.
