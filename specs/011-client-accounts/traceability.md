
## S33 traceability — S33-PO-4

| FR | Task | Test | Evidence |
|---|---|---|---|
| FR-008, FR-012 | T900 | `tests/integration/client-accounts-recovery.test.ts::PO recovery remains denied by safe-column RLS probes in both workspaces` | Commit `1d157df`; focused integration run on current head: 5 files / 41 tests passed. |

## S40 traceability — spec-only (2026-11-09)

No S40 requirement is implemented or verified. Every row is PLANNED with no test or evidence claimed. A row is updated only after its tests execute and pass on the head.

| FR | Task | Test (planned) | Evidence | Status |
|---|---|---|---|---|
| FR-018 | T047, T048 | `tests/integration/client-accounts-deletion.test.ts` (new) | none | PLANNED — BLOCKED by S40-F11-MCQ-1, -2, -3, -6 |
| FR-019 | T047 | `tests/integration/client-accounts-deletion.test.ts` (new) | none | PLANNED — BLOCKED by S40-F11-MCQ-2 |
| FR-020 | T047, T048 | `tests/integration/client-accounts-deletion.test.ts` (new) | none | PLANNED — BLOCKED by S40-F11-MCQ-2 |
| FR-021 | T049, T051 | `tests/integration/workspace-creation.test.ts` (new); `tests/e2e/workspace-creation.spec.ts` (new) | none | PLANNED — T049 not blocked; T051 BLOCKED by S40-F11-MCQ-7 |
| FR-022 | T050, T052 | `tests/integration/client-trainer-assignment.test.ts` (new) | none | PLANNED — BLOCKED by S40-F11-MCQ-4, -5 |
| FR-023 | T050 | `tests/integration/client-trainer-assignment.test.ts` (new) | none | PLANNED — BLOCKED by S40-F11-MCQ-4, -9 |
| FR-024 | T052, T053 | release test in F15 branch (not on main) | none | DEFERRED — BLOCKED by S40-F11-MCQ-8 and F15 branch |
| SC-013–SC-017 | T047–T053 | as above | none | PLANNED |
