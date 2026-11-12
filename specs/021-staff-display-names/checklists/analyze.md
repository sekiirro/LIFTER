# Analyze: F21 Staff Display Names

Date: 2026-11-12. Scope: spec-only artifacts for specs/021-staff-display-names/. This analysis follows the final spec, plan, and task edits in this pass.

## Entry check

- spec.md has numbered FRs, measurable SCs, and Given/When/Then scenarios for provisioning, validation, backfill, access, Client Notes author-line use, audit, lifecycle, and out-of-scope surfaces: PASS.
- PO clarifications and source evidence are recorded: NAME-1..NAME-8 from S51-PO-4; NAME-9..NAME-13 from S51-PO-7. Both source verbatims and SHA-256 values are in spec.md. NAME-14..NAME-16 are explicit open MCQs; no unresolved choice is encoded as settled.
- plan.md covers the scope; tasks.md has task IDs tagged with FRs, and migration/RLS/SECURITY DEFINER work is marked Luna-only: PASS.
- This analysis is dated after the final spec.md, plan.md, and tasks.md edits: PASS.

## Findings

- Open CRITICAL: 0.
- Open HIGH: 0.
- Open product decisions: NAME-14 (trim/normalization), NAME-15 (retry after unknown outcome), and NAME-16 (concurrent edits). Their affected validation and mutation behavior is blocked pending PO answers.
- No code, migration, schema, or database changes are part of this pass.

## Addendum C gap sweep

- In-flight, unknown result, and retry: NAME-15 asks whether retry replays the original outcome, creates a new mutation, or requires recovery first. No behavior is guessed.
- Delete, deactivation, and closure: retained author names and existing closure/PII/DP-02 behavior are stated; this feature adds no delete or purge behavior.
- Concurrent changes and crash between steps: NAME-16 asks how concurrent edits resolve. Audit must remain atomic with each successful mutation, and failed changes must not emit success events; transaction rollback and race tests belong to T006 after NAME-15/NAME-16 decisions.
- Copy and scope: marker strings are copied from PO-7 source; only the Client Notes author line is in first implementation scope. Other surfaces and their search/sort/export behavior are explicitly out of scope.
- Permissions: Workspace Owner is own-workspace only; Platform Owner covers platform/PO-owned backfill; same-workspace active staff and existing PO read rule remain; clients/Sales/anonymous/revoked/foreign workspace are denied.
- Validation: NAME-13 fixes the allowed character set and 1-80 code-point count; NAME-14 asks for trim and normalization semantics.
- Retention/deletion: name retention follows NAME-7 and DP-02; no new purge/retention behavior.
- FR/SC/task/traceability cross-references: FR-001..FR-013 and SC-001..SC-006 are accounted for; T001..T010 are linked; no task is ticked and traceability remains unverified until implementation tests run.

## Constitution check

- Principle VII: PASS for spec scope. Staff names are personal data, with least-privilege reads, no old/new name audit values, and existing closure/retention treatment (.specify/memory/constitution.md:90-100; spec FR-003, FR-008, FR-009, FR-011).
- Principle I: PASS for non-PO actors. Platform Owner access inherits the existing F20 recorded rule; no constitution change is made (specs/020-client-notes/plan.md:71).
- No constitution, DESIGN.md, or canonical PO decision record is changed.

## Cross-reference sweep

- FR-001..FR-013 occur in spec.md and are mapped by tasks.md and traceability.md.
- SC-001..SC-006 are measurable and correspond to acceptance scenarios and requirements.
- NAME-1..NAME-13 are resolved and encoded; NAME-14..NAME-16 appear only as explicit open decisions/blockers.
- The F20 unavailable-author fallback and auth-metadata exclusion remain cited (specs/020-client-notes/spec.md:90,113).
- No stale pending/absent status remains for NAME-9..NAME-13; the PO-4 quote is retained as historical verbatim and superseded by PO-7 for NAME-9..NAME-13.

## Result

Analyze passes for this spec-only change with 0 open CRITICAL/HIGH findings. NAME-14..NAME-16 remain PO decisions and block the affected validation/mutation behaviors. No implementation is authorized by this change.
