
## S33 traceability — S33-PO-4

| FR | Task | Test | Evidence |
|---|---|---|---|
| FR-008, FR-012 | T900 | `tests/integration/client-accounts-recovery.test.ts::PO recovery remains denied by safe-column RLS probes in both workspaces` | Commit `1d157df`; focused integration run on current head: 5 files / 41 tests passed. |

## S40 traceability — spec-only (2026-11-09, round 2)

No S40 requirement is implemented or verified. Every row is PLANNED with no test or evidence claimed. A row is updated only after its tests execute and pass on the head.

| FR | Task | Test (planned) | Evidence | Status |
|---|---|---|---|---|
| FR-018 | T047, T048 | `tests/integration/client-accounts-deletion.test.ts` (new) | none | PLANNED — client and PO accounts only; BLOCKED by S40-F11-MCQ-2 and S40-F11-MCQ-10; non-PO staff PENDING (S40-F11-MCQ-1, conflict form) |
| FR-019 | T047 | `tests/integration/client-accounts-deletion.test.ts` (new) | none | PLANNED — BLOCKED by S40-F11-MCQ-2 |
| FR-020 | T047, T048 | `tests/integration/client-accounts-deletion.test.ts` (new) | none | PLANNED — BLOCKED by S40-F11-MCQ-2 (release of identifiers in history) |
| FR-021 | T049, T051, T056 | `tests/integration/workspace-creation.test.ts` (new); `tests/e2e/workspace-creation.spec.ts` (new) | none | PLANNED — T049 not blocked; T051 and T056 BLOCKED by S40-F11-MCQ-12 (copy) |
| FR-022 | T050, T052, T055 | `tests/integration/client-trainer-assignment.test.ts` (new) | none | PLANNED — PO-only; BLOCKED by S40-F11-MCQ-4 (residual) and S40-F11-MCQ-10 |
| FR-023 | T050, T055 | `tests/integration/client-trainer-assignment.test.ts` (new) | none | PLANNED — BLOCKED by S40-F11-MCQ-10 (matrix-unchanged permission) |
| FR-024 | T052, T053, T057 | F15 release test on the F15 branch (not on main); future alert fixture | none | DEFERRED — frequency decided; T053 blocked by F15 branch; T057 blocked by S40-F11-MCQ-8 (channel) |
| FR-025 | T059 | `tests/integration/client-accounts-deletion.test.ts` (new) | none | PLANNED — BLOCKED by S40-F11-MCQ-2 and S40-F11-MCQ-10 |
| FR-026 | T060 | `tests/integration/client-accounts-deletion.test.ts` (new) | none | PLANNED — BLOCKED by spec 003 T015 and S40-F11-MCQ-10 |
| FR-027 | T061 | `tests/integration/unassigned-clients.test.ts` (new) | none | PLANNED — BLOCKED by T055 |
| FR-028 | T058, T062 | `tests/integration/client-trainer-distribution.test.ts` (new) | none | PLANNED — BLOCKED by S40-F11-MCQ-11 and T055; verified only after a balance-measure test executes |
| SC-013–SC-017 | T047–T053 | as above | none | PLANNED |
| SC-018 | T059 | as above | none | PLANNED — BLOCKED as FR-025 |
| SC-019 | T060 | as above | none | PLANNED — BLOCKED as FR-026 |
| SC-020 | T061 | as above | none | PLANNED — BLOCKED as FR-027 |
| SC-021 | T058, T050 | as above | none | PLANNED — balance measure PENDING (S40-F11-MCQ-11) |
