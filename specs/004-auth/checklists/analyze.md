# Spec Kit Analyze - F4 Authentication & Manual Recovery Links (round S35-PO-1)

- Date: 2026-11-06 04:59 UTC (re-run after the last change to spec.md, plan.md, tasks.md and traceability.md in this round; the last edits were the scenario 6 wording in spec.md and the T039 wording in tasks.md)
- Base: `speckit-004-t030` @ `f8ab7380a22482e068a92f36bfc67b271cf9395e` (stacked on PR #63)
- Method: static cross-artifact review of `spec.md`, `plan.md`, `tasks.md`, `traceability.md`, `contracts/auth-surface.md`, `docs/04-changes-and-questions.md` (D-19 row and F4 open bullet), `docs/13-production-readiness.md` (AI-03, AI-04, ND-F4-3 rows), `supabase/config.toml`, `lib/auth/recovery-session.ts`, `app/auth/recovery/actions.ts`. Supabase SMTP limits read from the Supabase custom-SMTP documentation. No tests, Docker, Supabase stack or CI jobs were run.
- Classification rule: CRITICAL = contradicts a PO decision or the Constitution; HIGH = a PO-words requirement or a security requirement lacks a requirement, a measurable criterion or a task; MEDIUM = an open PO decision, Sol critique, copy approval or architect decision that blocks implementation but not analysis; LOW = record hygiene or out-of-scope drift.

## Entry check (Spec Kit gate, section 1)

- [x] spec.md has numbered FRs (FR-001..FR-028), measurable SCs (SC-001..SC-013) and Given/When/Then scenarios for US1..US5 (`specs/004-auth/spec.md`).
- [x] Clarifications recorded: S35-PO-1 verbatim register, SK-004-01..06 register, ND-F4-1..7, PDN-F4-7-01..11, record discrepancy RD-1. "No open ambiguities" is NOT claimed: the PDN items and RD-1 are open.
- [x] plan.md covers the ND-F4-7 scope (Design section, Constitution check); tasks.md has T033..T048 tagged with FR IDs (`specs/004-auth/tasks.md`).
- [x] this file is dated after the last spec/plan/tasks/traceability change.
- Open CRITICAL/HIGH findings: 0 (see verdict).
- Gate result for implementation: FAIL for ND-F4-7 implementation (MEDIUM findings N1, N2 block it). Implementation of ND-F4-7 must not start. Spec-level analysis: PASS.

## Carry-over findings (previous round, status unchanged unless noted)

| ID | Category | Severity | Location | Status now |
|---|---|---|---|---|
| A1 | Decision to implementation (T031 limits) | MEDIUM | `tasks.md` T031 | Unchanged. Not ND-F4-7. |
| A2 | Source gap (ND-F4-3 deferral) | MEDIUM | `spec.md` ND-F4-3 | Resolved for the deferral by S35-PO-1 `ND-F4-3=A`. Residual label discrepancy recorded as RD-1 (see N14). |
| A3 | Decision to implementation (T032 Trainers) | MEDIUM | `tasks.md` T032 | Unchanged. Not ND-F4-7. |
| A4 | Task closure (T030) | LOW | `tasks.md` T030 | Unchanged. |
| A5 | Evidence breadth (FR-001/002/003 partial or unverified) | LOW | `traceability.md` | Unchanged. |

## New findings (this round)

| ID | Category | Severity | Location | Finding | Recommendation / blocked |
|---|---|---|---|---|---|
| N1 | PO decision open | MEDIUM | `spec.md` ND-F4-7 PDN register (PDN-F4-7-01..11) | Eleven questions the PO has not answered (permitted-list maintainer, eligible roles, rate-limit values and keying, audit of refused attempts, copy, other sessions, SC-013 target, SMTP provider, hosted change approval). Each is listed with options and a recommendation; no default is encoded. | Blocks T034, T038, T039, T043 to T046 and T047. Analysis complete. |
| N2 | Workflow gate | MEDIUM | `spec.md` Status line of ND-F4-7; `plan.md` ND-F4-7 Status | Sol Medium critique PENDING: not invoked (invocation approval unanswered per architect notes). Constitution Development Workflow requires it before implementation. | Blocks T033 and T048. Do not invoke without approval. |
| N3 | Provider behaviour unverified | MEDIUM | `spec.md` FR-021; `tasks.md` T040 | Single use and supersession for self-service email links are not known to hold in the provider. Written as UNVERIFIED. | SC-010 executed on the local stack decides it. If the provider does not supersede, escalate, do not work around. |
| N4 | Copy | MEDIUM | `spec.md` FR-027, PDN-F4-7-06; `lib/i18n` existing invalid-link text | The existing invalid-link text tells the user to "Ask your coach or workspace for a new link", which is client-oriented and wrong for staff. All new strings are BLOCKED-COPY. | Blocks T042, T043, T045. PO approves exact strings. |
| N5 | Technical design (architect) | MEDIUM | `plan.md` AT-1; `spec.md` FR-025 | Audit-before-send (fail closed) means a provider failure after the audit row leaves a `requested` row for an email that was not sent. FR-025 wording "accepted for delivery" does not settle it. | Architect decision with security review, before T039 and T044. Not a PO decision. |
| N6 | Measurable criterion (security) | MEDIUM | `spec.md` FR-018; `plan.md` AT-2 | FR-018 requires timing that does not reveal existence, but the numeric tolerance and test method are not yet set, and AT-2 says "decided here" without a recorded decision. No SC covers timing. Rated MEDIUM, not HIGH, because the threshold is a security-review decision and the requirement itself is stated. Architect should confirm this rating. | Set the tolerance and test method in plan.md with the security review before T035 and T041 go green. Add an SC then. |
| N7 | Assumption conflict | MEDIUM | `spec.md` Assumptions ("no IP blocking"); FR-024; PDN-F4-7-04 | Option C (per-IP limiting) would revise the Assumption. The Assumption is noted as in force until PDN-F4-7-04 is decided. | Blocks T038 keying. |
| N8 | Constitution I justification | MEDIUM | `plan.md` ND-F4-7 Constitution check, row I | The plan says foreign-workspace negatives are "not applicable (staff reset is platform-scoped)". Constitution I requires a foreign-workspace negative test for every new tenant table, endpoint or job. The rate-limit table and audit rows may carry a workspace. | Architect confirms the justification or adds a foreign-workspace negative before T044. Deviation must be justified in Complexity Tracking if kept. |
| N9 | Provider quota starvation (residual risk) | LOW | `spec.md` Security Notes S3 | The built-in 2-per-hour quota is per project. App-level limits (FR-024) cannot stop the provider quota being used up by others. CAPTCHA is the provider's recommended control. | Residual risk stated; decision in PDN-F4-7-11 (hosted, out of scope). |
| N10 | Out-of-scope stale rows | LOW | `docs/07-production-readiness.md` ND-F4-7 row ("OPEN"); `docs/01-traceability.md` PRD-02 row ("sequenced until SMTP"); `docs/02-architecture.md:18` ("provider chosen in P0"); `docs/03-roadmap.md` | Not in this brief's scope (specs/004-auth and the docs/13 and docs/04 rows only), so not edited. They now contradict S35-PO-1. | Architect follow-up. Not fixed here. |
| N11 | Coexistence check | LOW | `spec.md` FR-005; `plan.md` ND-F4-7 step 1 | Checked: the request form stays on `/login`, so the public allow-list in FR-005 does not change. No finding. | None. |
| N12 | Provider not chosen | MEDIUM | `spec.md` PDN-F4-7-10; FR-020 | No external SMTP provider is chosen in the sources. | Blocks general rollout only (FR-020). No code task. |
| N13 | Reserved number | LOW | `spec.md` PDN-F4-7-08 | PDN-F4-7-08 is intentionally unused, kept so that IDs in other documents do not change. | None. |
| N14 | Record discrepancy RD-1 | LOW | `docs/13-production-readiness.md:34`; `spec.md` Clarifications; `traceability.md` | docs/13 labels the session-lifetime deferral "PO decision: B"; S35-PO-1 records "A". The ND-F4-3 identifier is also used for link expiry (decided 2026-10-29). Labels recorded; neither changed. | Architect confirms the mapping. No requirement change. |
| N15 | Session lifetime (open blocker) | LOW | `spec.md` FR-026, Security Notes S8; `docs/13` ND-F4-3 | Self-service reset creates a normal session, so the open session-lifetime blocker applies unchanged. Stated; not proposed for solving. | Stays Open, Pre-Production. Not an ND-F4-7 defect. |

## Coverage

- FR-016..FR-028 each have at least one task (T034..T046, T048) and a traceability row, all UNVERIFIED.
- SC-008..SC-013 each have a task and a traceability row, all UNVERIFIED.
- Scenarios 1 to 9 of User Story 5 each map to FR and task (see traceability.md).
- Every PO-words sentence in S35-PO-1 is quoted verbatim in spec.md Clarifications and is cited to the verbatim file.
- Architect notes are labelled "Architect note (not PO words)" wherever used.
- No copy string is invented (FR-027).
- Hosted Supabase Auth and SMTP configuration: out of scope (T047), gated on separate PO approval.

## Verdict

**Spec-level analysis: PASS** - 0 CRITICAL, 0 HIGH. MEDIUM: 11 open (new N1 to N8 and N12; carried A1 and A3). LOW: 8 open (new N9, N10, N11, N13, N14, N15; carried A4 and A5). A2 is resolved for the deferral (see N14 for the residual label).

**ND-F4-7 implementation: BLOCKED** by N1, N2, N4, N5, N6, N7, N8 and N12 (MEDIUM). N3 blocks acceptance of the provider-behaviour rows, not the start of work. Implementation must not start until the PO answers the blocking PDN items, approves copy, the Sol Medium critique is completed and this file is re-run.
