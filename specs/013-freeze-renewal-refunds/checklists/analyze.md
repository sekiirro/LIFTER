# F13 plan analysis

**Pass**: spec ↔ plan ↔ tasks consistency review. No implementation or tests run. **Model/effort**: Luna High.

## Findings

- FR-001–FR-036 are mapped to one or more named units in tasks.md; FR-034/035/036 have dedicated gate and parity coverage. SC-001–SC-013 map to the financial, freeze, renewal, calendar, authorization, audit, UI-gate and P4/P5 integration units listed there.
- Every task names an originating FR/SC/decision, owner files, DB need, tests-first RED→GREEN evidence and a named mutation check for security/financial logic. No implementation code is included.
- PO-1 uses atomic deactivation/outbox plus a synchronous Custom Access Token hook to deny new issuance; the server-side Auth Admin ban worker remains defense in depth. Stack C integration verifies sign-in/refresh denial while the worker fails. F12 U4 remains a dependency gate for shared writer/function work.
- F13 database and Auth API verification is assigned to isolated Stack C (lifter-stack-c). Stack A/B remain prohibited targets.
- Migrations are ordered after every F12 and F14 migration present at implementation time, including unmerged work; audit and capability shared bodies must be rebuilt from latest integrated versions.
- Capability delta and bidirectional parity are sequenced after both F12 and F14. Cross-feature table/FK/function/i18n/dashboard/nav/CI interactions and merge ordering are stated in tasks.md.
- Remaining production blocker: technical and legal feasibility of 30-day retention across all recoverable copies, including backups.

## Issues corrected during analysis

No critical or high inconsistency found in the generated planning artifacts. No PO policy is inferred beyond the binding decision record and feature spec. Constitution check has no exception. No rendered UI task is included; the future UI gate requirement is explicit in plan.md.

## Remaining medium/low observations

- Exact F12 U4 RPC and receipt shapes remain unknowable until its merge; final implementation briefs must update contracts after inspection.
- Exact Auth primitive and isolated stack assignment are unresolved technical prerequisites, not planning assumptions.
- F13 UI is outside this plan's implementation units; any later request to add rendered UI must use the Frontend Design Gate and DESIGN.md.
