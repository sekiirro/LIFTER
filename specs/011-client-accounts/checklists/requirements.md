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
- PO sub-decisions ND-F11-1a/4a/5a/6a/6b/9a/9b and C1 privacy: Decided (PO, 2026-10-28). Archived-state and admin-review design deferred until ND-F5-1; identical generic D-08 non-disclosure applies before and after. Other audit retention remains NEEDS SOURCE CONFIRMATION under ND-F5-1/B4.
- Architecture: AD-F11-1 **Decided (PO, 2026-10-28): option (i); C1–C4 binding**; options (ii) and 3b remain rejected with evidence retained. C1–C4 are binding; local parity proofs and C4 hosted verification remain gates. ND-F11-2a accepted phone input format is OPEN (NEEDS SOURCE CONFIRMATION); only T022/T027/T028 phone-input validation/UI portions wait on it. U1–U4 are not blocked by ND-F11-2a.
- Cross-artifact review covers strict no-grace signup versus unchanged F10 open/grace; both enforced limits with durable accounting; pending-approval denial through both walls; 30-day operational attempt-log retention; separate window-lived HMAC counters; no IP/ip_key in logs; audit_events append-only, retention pending ND-F5-1; manual sign-out; active/pending DB uniqueness and archived blocks; structured secret-free audit with attempts/failures outside signup rollback. AUTH-PW-01 applies the shared min-8/digit/symbol/max-72-byte validator to F11 and F4 recovery; GoTrue min-8 backstop and F4 behavior change are PO-approved.
- T001–T046 and U1–U10 order retained, no new tasks; U10/T046 independent PO/Claude audit reservation unchanged and not executed. U4 edits F11 documentation only. Scope, relative links, task structure, formatting and diff validation are documentation checks, not product acceptance.

- U8 round 2 / round 3: 30-day operational attempt-log retention; separate window-lived HMAC counters; no IP/ip_key in logs; audit_events append-only, retention pending ND-F5-1 (NEEDS SOURCE CONFIRMATION). Purge preserves audit_events. Constitution unchanged; AD-F11-1 option (i) is PO-approved with binding C1–C4.
- Minimal tickets/redemption belong to U2; attested issuance stays U5. Both rate/attestation keys in owner-only local Vault, matching server-only env, manual single-key rotation resets counters with accepted one-hour extra-window risk; post-rotation admission and old-key counter expiry are tested; DB token/link_key verification tested. AUTH-PW-01 is PO-approved (2026-10-28); AD-F11-1 option (i) is PO-approved with binding C1–C4.
- Pending clients denied all app/RLS/direct PostgREST/RPC/Storage client access even with a later sign-in JWT; Q-M04 detects a loosened pending-client policy. T039 excludes historical U6 commit/push instructions. Research R9 records the local Auth password mismatch; AUTH-PW-01 approves the shared F11/F4 validator and minimum-length backstop, with config and F4 call-site changes assigned to implementation tasks.

- U1 status is planned, not complete: T001–T005 remain unchecked; no config edit, anon-signUp rejection result, staff-creation result or recovery integration result is claimed in this documentation update. AUTH-SIGNUP-01 is approved and assigned to T001–T005.
