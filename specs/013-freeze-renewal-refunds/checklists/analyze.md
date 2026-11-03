# F13 plan analysis

## Historical analysis (retained)

The original analysis and S24 addendum below are preserved as history. The current-head refresh is appended after that record.

**Pass**: spec ↔ plan ↔ tasks consistency review. No implementation or tests run. **Model/effort**: Luna High.

## Findings

- FR-001–FR-036 are mapped to one or more named units in tasks.md; FR-034/035/036 have dedicated gate and parity coverage. SC-001–SC-013 map to the financial, freeze, renewal, calendar, authorization, audit, UI-gate and P4/P5 integration units listed there.
- Every task names an originating FR/SC/decision, owner files, DB need, tests-first RED→GREEN evidence and a named mutation check for security/financial logic. No implementation code is included.
- PO-1 uses atomic deactivation/outbox plus a synchronous Custom Access Token hook to deny new issuance; the server-side Auth Admin ban worker remains defense in depth. Stack C integration verifies sign-in/refresh denial while the worker fails. F12 U4 is merged and verified at PR #18 / `e3a2534`; reuse its writer and function contracts.
- F13 database and Auth API verification is assigned to isolated Stack C (lifter-stack-c). Stack A/B remain prohibited targets.
- Order F13 migrations after the integrated replay baseline: enumerate only F12/F14 migrations present in the implementation branch and replay; never depend on unmerged migrations. Rebuild shared audit and capability bodies from the latest integrated versions.
- Capability delta and bidirectional parity are sequenced after both F12 and F14. Cross-feature table/FK/function/i18n/dashboard/nav/CI interactions and merge ordering are stated in tasks.md.
- Remaining production blocker: technical and legal feasibility of 30-day retention across all recoverable copies, including backups.

## Issues corrected during analysis

No critical or high inconsistency found in the generated planning artifacts. No PO policy is inferred beyond the binding decision record and feature spec. Constitution check has no exception. No rendered UI task is included; the future UI gate requirement is explicit in plan.md.

## Remaining medium/low observations

- F12 U4 RPC and receipt shapes are verified against merged PR #18 at `e3a2534`; planning copies must use the pinned merged contract and must not create a duplicate payment writer.
- The Auth design is resolved as the Custom Access Token hook plus the Auth Admin worker; the isolated database and Auth API stack is assigned to Stack C (`lifter-stack-c`).
- F13 UI is outside this plan's implementation units; any later request to add rendered UI must use the Frontend Design Gate and DESIGN.md.

## S24 round 16 implementation addendum

Forward migration `20261103130700_f13_renewal_required_keys.sql` follows the immutable lineage-tail guard and makes each required `record_renewal` key reject absence as `invalid_input`. The quickstart and task history record the new current endpoint; round 12's 82-migration replay remains historical.

## S30 current-head refresh

- **Date:** 2026-11-03
- **Analysed commit:** `506e3bf4135b49319e0bdabab4d5166e2d608f5b` (Part 3 branch head before the local Clarify/T020 status update)
- **Scope:** current `spec.md`, `plan.md`, `tasks.md`, existing analysis history, code/tests, and D-20/B4 production readiness. Static review only; no tests, stack operations, hosted queries, or deployments.
- **Entry inventory:** 36 FRs and 14 SCs; plan/tasks exist; existing requirements and analysis checklists exist; Clarifications added after the named head. T001-T018 are checked with historical evidence, T019 remains open, and T020 is now explicitly deferred by D-20.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F13-A01 | MEDIUM | `tasks.md:T019`; D-20; `docs/07-production-readiness.md` | RET-1..3 technical/legal feasibility across backups remains unresolved; B4 client/audit retention values remain open and block production with real client data. | Preserve T019 open and raise SK-013-01/02; no retention threshold or legal interpretation added. |
| F13-A02 | MEDIUM | `tasks.md:T020`; D-20 | The task requires a hosted non-production Supabase project, while D-20 limits hosting to one production project and requires development/testing to use local Docker. | Mark T020 `[DEFERRED: docs/04-changes-and-questions.md D-20]`; this is directly sourced and does not claim the hosted proof passed. |

### Coverage and verdict

- FR-to-task mapping: 36/36; SC-to-task mapping: 14/14. Existing T017 records cross-feature FR/SC reconciliation and T018 records runtime consumer boundaries.
- Clarifications cite D-13, D-15, D-20, and S22-PO-5. Resolved ND-01/ND-08 remain closed; unresolved retention items are explicit.
- **PASS WITH OPEN PRODUCTION BLOCKERS** — 0 CRITICAL, 0 HIGH, 2 MEDIUM; 50/50 FR/SC items mapped. Static evidence only; no tests executed.
