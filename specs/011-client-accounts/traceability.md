
## S33 traceability — S33-PO-4

| FR | Task | Test | Evidence |
|---|---|---|---|
| FR-008, FR-012 | T900 | `tests/integration/client-accounts-recovery.test.ts::PO recovery remains denied by safe-column RLS probes in both workspaces` | Commit `1d157df`; focused integration run on current head: 5 files / 41 tests passed. |

## S40 traceability — spec-only (2026-11-09, round 2)

No S40 requirement is implemented or verified. Every row is PLANNED with no test or evidence claimed. A row is updated only after its tests execute and pass on the head.

| FR | Task | Test (planned) | Evidence | Status |
|---|---|---|---|---|
| FR-018 | T047, T048, T050, T060 | `tests/integration/client-accounts-deletion.test.ts` (new) | none | PLANNED — MCQ-1 = B and MCQ-2 = A (S40-PO-13); MCQ-13 = A, MCQ-15 = A, MCQ-20 = A (S41-PO-1); unblocked; Trainer-deletion cases per S41-R4 F1; PO account also needs spec 003 T015 |
| FR-019 | T047 | `tests/integration/client-accounts-deletion.test.ts` (new) | none | PLANNED — unblocked (S40-PO-13 MCQ-2 = A) |
| FR-020 | T047, T048 | `tests/integration/client-accounts-deletion.test.ts` (new) | none | PLANNED — unblocked; terminal-row fields cleared (MCQ-14 = B, S41-PO-1) |
| FR-021 | T049, T051, T056 | `tests/integration/workspace-creation.test.ts` (new); `tests/e2e/workspace-creation.spec.ts` (new) | none | PLANNED — T049 not blocked; placement MCQ-17 = C, fields MCQ-19 = A, copy rows 1-9 MCQ-12 = A (S41-PO-1..3); T051 and T056 BLOCKED only for the new strings (`research/s41-new-copy-proposal.md`, PENDING-PO) |
| FR-022 | T050, T052, T055 | `tests/integration/client-trainer-assignment.test.ts` (new) | none | PLANNED — PO-only via `manage_staff_access`; ended rows kept (S40-R19 MCQ-4 and MCQ-10); unblocked |
| FR-023 | T050, T055 | `tests/integration/client-trainer-assignment.test.ts` (new) | none | PLANNED — unblocked (no matrix change, S40-R19 MCQ-10) |
| FR-024 | T052, T053, T057 | F15 release test on the F15 branch (not on main); future alert fixture | none | DEFERRED — frequency decided; channel in-app (S40-R19 MCQ-8); T053 blocked by F15 branch; T057 blocked by F15 branch |
| FR-025 | T059 | `tests/integration/client-accounts-deletion.test.ts` (new) | none | PLANNED — MCQ-18 = A (S41-PO-2); BLOCKED only for category labels and acknowledgement copy (PENDING-PO) |
| FR-026 | T060 | `tests/integration/client-accounts-deletion.test.ts` (new) | none | PLANNED — BLOCKED by spec 003 T015 (MCQ-10 ruled, S40-R19) |
| FR-027 | T061 | `tests/integration/unassigned-clients.test.ts` (new) | none | PLANNED — BLOCKED by T055 |
| FR-028 | T058, T062, T063 | `tests/integration/client-trainer-distribution.test.ts` (new) | none | PLANNED — MCQ-11 defaults accepted (S40-PO-13); MCQ-16 = A/A (S41-PO-2); BLOCKED by T055; verified only after T058, T062 and T063 execute (S41-R4 F6), including the balance-measure test |
| SC-013–SC-017 | T047–T053 | as above | none | PLANNED |
| SC-018 | T059 | as above | none | PLANNED — BLOCKED as FR-025 |
| SC-019 | T060 | as above | none | PLANNED — BLOCKED as FR-026 |
| SC-020 | T061 | as above | none | PLANNED — BLOCKED as FR-027 |
| SC-021 | T058, T050 | as above | none | PLANNED — balance measure = approved clients with a current assignment row (S41-PO-2 MCQ-16 part 2 = A); never-assigned first (MCQ-16 part 1 = A) |
| SC-022 | T047, T048 | as FR-018 | none | PLANNED — staff deletion cases unblocked by S41-PO-1 MCQ-15 = A |
