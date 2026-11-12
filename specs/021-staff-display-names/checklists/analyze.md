# Analyze: F21 Staff Display Names

Date: 2026-11-12. Scope: spec-only artifacts for `specs/021-staff-display-names/`.

## Entry check

- spec.md has numbered FRs, measurable SCs, and Given/When/Then acceptance scenarios: PASS (`specs/021-staff-display-names/spec.md`).
- Clarifications recorded: PASS. NAME-1..NAME-8 are recorded from S51-PO-4. NAME-9..NAME-13 are recorded as PO-DECISION-NEEDED (`specs/021-staff-display-names/spec.md` Clarifications).
- plan.md covers touched scope; tasks.md has task IDs tagged with FR IDs: PASS.
- analyze.md is dated after the last change to spec/plan/tasks: PASS.

## Findings

- Open CRITICAL: 0.
- Open HIGH: 0.
- Open product decisions: NAME-9, NAME-10, NAME-11, NAME-12, NAME-13. These block the corresponding implementation parts and are not encoded as requirements.
- Technical gaps: none found in the spec-only scope. No migration, RLS, SECURITY DEFINER function, grant, UI copy, or test is implemented by this change.

## Constitution check

- Principle VII (privacy/health data): PASS for spec scope. Staff names are treated as personal data, read-restricted, not logged, and retained/closed under existing rules (`.specify/memory/constitution.md:90-100`; `specs/021-staff-display-names/spec.md` FR-003, FR-009, FR-011).
- Principle I (workspace isolation): PASS for non-PO actors. Platform Owner access inherits the existing F20 recorded deviation and no constitution change is made (`specs/020-client-notes/plan.md:71`; `specs/021-staff-display-names/plan.md` Complexity tracking).
- No constitution, DESIGN.md, or PO-decision record is changed by this spec-only PR.

## Cross-reference sweep

- FR-001..FR-012 are referenced by tasks.md tags.
- NAME-1..NAME-8 are encoded in FR-001..FR-012.
- NAME-9..NAME-13 are listed as PO-DECISION-NEEDED and are not encoded as requirements, defaults, tests, or copy.
- F20 fallback and SC-010 constraints are cited (`specs/020-client-notes/spec.md:90,113`).

## Result

Analyze passes for spec-only scope. Implementation remains blocked on NAME-9..NAME-13 where noted. No implementation is authorized.
