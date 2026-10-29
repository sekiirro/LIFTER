# Specification Quality Checklist: F13 — Freeze, renewal, refunds and expiry

**Purpose**: Validate draft completeness and quality before clarification/debate and planning.

**Created**: 2026-10-29

**Feature**: [spec.md](../spec.md)

**Review Ownership**: Maintained under speckit-specify conventions. Checked means reviewed for requirements quality, not implementation, executed acceptance tests, independent critique or PO approval.

## Content Quality

- [ ] No implementation details (languages, frameworks, APIs).
- [x] Focused on user value and business needs.
- [x] Written for non-technical stakeholders, with a bounded technical dependency inventory.
- [x] All mandatory sections completed.

## Requirement Completeness

- [x] No anonymous template placeholders or untracked clarification markers remain; all policy gaps have named NOT DECIDED questions.
- [ ] Requirements are fully testable and unambiguous across all policy branches.
- [x] Success criteria are measurable.
- [x] Success criteria describe technology-agnostic outcomes.
- [x] Primary acceptance scenarios are defined, with conditional policy references disclosed.
- [x] Edge cases include Cairo/DST, preactivation, corrected collections, renewal chains and cross-operation races.
- [x] Scope is clearly bounded, including F12/F13/P4 ownership conflicts and PO-only closure ambiguity.
- [x] Dependencies and assumptions identified, with pinned F12 sources and future migration/shared-file coordination.

## Feature Readiness

- [ ] All functional requirements have final unconditional acceptance criteria.
- [x] User scenarios cover primary flows independently using dependency fixtures.
- [x] Specified behavior maps to measurable success criteria; no product pass is claimed.
- [ ] No implementation details leak into specification.

## Notes

- Result: 12/16 built-in quality criteria satisfied, four intentionally open. This is **Draft (pending Spec Debate)**, not implementation approval or an assertion that outcomes are achieved. The request explicitly requires a draft with every policy gap retained; no unanswered choice is silently defaulted to make the checklist green.
- Technical-detail exclusions remain unchecked because the brief requires concrete F12 table/function names, TS/SQL capability parity, audit-body and migration ordering. These are isolated integration constraints, not SQL/code or a substitute plan.
- Full ambiguity/acceptance completion remain unchecked because [Open questions for PO](../spec.md#open-questions-for-po), ND-F13-01..15, affect freeze eligibility/limits/day boundaries, renewal pricing/activation/chain behavior, refunds/corrections/date/eligibility, expiry grace, ownership, client surfaces and notifications. Conditional story outcomes and SC values must be finalized after answers; recommendations remain NOT DECIDED.
- Reviewed coverage: 5 prioritized stories, 34 sequential functional requirements, 11 sequential measurable success criteria, logical entities, edge cases, verbatim P1 roadmap row, Constitution 1.3.0 check, explicit no-activation behavior and inherited/additional production blockers.
- Money review: full refunds reverse only eligible collected revenue plus exact stored commission, cancel unpaid obligations and end target entitlement atomically; F12 corrections remain correction-month append-only reversals restoring unpaid status. Corrected/zero-net/post-refund handling is explicitly ND-F13-07; no double reversal, partial refund or mutable history is allowed.
- Reliability review: same-key/mismatched-key/distinct-key/two-session cases; freeze vs renewal vs refund vs collection/correction/activation; serialized chain state; current authorization after waits and before replay; audit rollback; deterministic expiry and notification handoff.
- Scope review: F12 does not deliver overdue enforcement or client closure. Overdue ownership conflicts between its F13 exclusion and explicit P4 handoff (ND-F13-10); deletion/removal ownership and meaning remain ND-F13-11. P4 activation writer and P5 check-in freeze remain outside this draft.
- Production review: inherited docs/13 gates remain open; proposed local F13-PB-01/02 require later central-register allocation under an authorized shared-file change. No readiness, hosted, restore or UI evidence is claimed.
- Validation is documentation-only: required Prettier and diff-whitespace checks are run before commit; structural checks confirmed sequential IDs/counts, UTF-8, local source links and the verbatim roadmap quote. No application tests, DB/Docker commands or runtime verification are appropriate to this artifact-only unit. No extension hooks file was present on initial or completion inspection. Explicit two-file scope supersedes writing `.specify/feature.json` and interactive clarification/default conventions.
- Next phase: independent Spec Debate and PO answers, reconcile affected requirements and readiness register handoff, then separately authorized planning/tasks/analyze. This checklist must not be presented as a passed implementation gate.
