# F17 Requirements Quality Checklist

**Purpose**: Review requirements quality and testability for the workout planner.
**Created**: 2026-11-03
**Feature**: [spec.md](../spec.md)
**Review Ownership**: Reviewer-owned; checkbox state indicates requirements-quality review only, never implementation completion.

## Requirement clarity

- [x] FRs are numbered and use normative language.
- [x] SCs state measurable outcomes for functional, security, export, activation, and performance scope.
- [ ] Product decisions and ambiguities are explicitly consolidated, with “no open ambiguities” stated.
- [ ] Plan Core dependency acceptance contract is available and traceable from this branch.

## Traceability and evidence

- [ ] Every implementation task carries its related FR IDs inline.
- [x] Coverage index maps in-scope requirements to tasks.
- [ ] Every FR/SC maps to a named asserting test and evidence on the reviewed head.
- [x] Unimplemented DB and performance gates remain explicit and unchecked.

## Accessibility and constitution

- [x] Bilingual UI and keyboard-accessible drag alternatives are specified.
- [x] Workspace isolation, least privilege, immutable versions, privacy, and idempotency are explicit.
- [x] No constitution conflict identified by this static review.

## Notes

Static review only; no test suite or runtime environment was used. See [analyze.md](analyze.md) and [traceability.md](../traceability.md).