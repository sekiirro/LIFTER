# Specification Quality Checklist: F11 — Client accounts + signup

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-28
**Feature**: [spec.md](../spec.md)
**Review Ownership**: Requirements-quality review maintained by speckit-specify; checks do not mean implementation or independent approval is complete.

## Content Quality

- [ ] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [ ] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [ ] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [ ] No implementation details leak into specification

## Notes

- U4 result: 12/16 criteria satisfied. ND-F11-1..10 are **Decided (PO, 2026-10-28)** with verbatim text in spec.md. Clarification Q1–Q5 records PO answers and supersedes earlier options, including no Telegram and no interim client view. No NEEDS CLARIFICATION markers remain in the spec; remaining decisions have explicit IDs, not assumed answers.
- Four items remain unchecked: both implementation-detail exclusions, fully unambiguous/testable requirements, and complete functional acceptance criteria. Binding requested technical constraints remain in FR-003/008/010. No implementation, application test pass or independent approval is claimed.
- Open PO items: ND-F11-1a maximum length/symbol definition; ND-F11-4a public-page/F10 alignment; ND-F11-5a attempt definition/window semantics; ND-F11-6a approvers/action scope and ND-F11-6b destination/session; ND-F11-9a archived review mechanism/reviewer and ND-F11-9b absent archived state (blocked until ND-F5-1 closure). Other audit retention remains undecided under ND-F11-7, ND-F5-1/B4 unchanged.
- Architecture: AD-F11-1 **PENDING PO — architect recommendation: option (i)**; C1–C4 proposed evaluation criteria, not approved conditions; option (ii) analysis retained. AD-F11-2 (technical ND-F11-5b) owns trusted client-IP source on Cloudflare/OpenNext and non-forgeable attribution. Dependent tasks explicitly blocked; implementation readiness remains conditional on these and inherited gates.
- Cross-artifact review covers strict no-grace signup versus unchanged F10 open/grace; both enforced limits with durable accounting; pending-approval denial through both walls; 30-day attempt/IP retention and local purge; manual sign-out; active/pending DB uniqueness and archived blocks; structured secret-free audit with attempts/failures outside signup rollback.
- T001–T046 and U1–U10 order retained, no new tasks; U10/T046 independent PO/Claude audit reservation unchanged and not executed. U4 edits F11 documentation only. Scope, relative links, task structure, formatting and diff validation are documentation checks, not product acceptance.
