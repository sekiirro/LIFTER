# F13 plan analysis

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
