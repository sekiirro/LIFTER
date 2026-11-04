# Specification Quality Checklist: F15 — P2 Forms/Intake

**Purpose**: Validate specification completeness and quality before planning

**Feature ID**: F15

**Feature Branch**: `015-forms-intake`

**Created**: 2026-10-29

**Status**: Draft — Spec Debate complete (2026-10-29); pending PO decisions

**Feature**: [spec.md](../spec.md)

**Review Ownership**: Sol Medium draft/revision; independent Sol Medium and Opus 5.5 critique, one rebuttal round and binding Claude Opus 5.5 architect judgment recorded in [debate.md](../debate.md). No runtime test pass or implementation approval is claimed.

## Content Quality

- [ ] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No bracketed NEEDS CLARIFICATION markers remain; final Q1–Q8 are explicitly NOT DECIDED
- [ ] Requirements are fully testable and unambiguous
- [ ] All success criteria are unconditionally measurable
- [x] Success criteria express outcomes rather than technology performance
- [x] Acceptance scenarios are defined, including partial drafts and fail-closed audited reads
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [ ] All functional requirements have unconditional acceptance criteria
- [x] User scenarios cover primary flows
- [x] Unconditional invariants and gated measurable outcomes are distinguished
- [ ] No implementation details leak into specification

## Notes

- Requirements-quality review: 11/16 criteria satisfied. The five unchecked items are not waived. User-required security/integration details prevent both implementation-detail exclusions from passing; Q1–Q8 and reviewed engineering bounds/timing prevent full unconditional testability/acceptance/measurability. Conditional SCs need decisions and fixtures before PASS.
- Judgments A–M are incorporated. Partial drafts save; submission enforces substantive sections. Staff, PO, client and background authorization paths are distinct. Every staff/client answer access is audited without daily dedup, audit failure returns no answers, direct-table bypass is denied and privileged readers are narrowly granted.
- Health protection includes private/no-store, no browser persistence, no intake Realtime, no service-role application answer paths, safe errors/job codes, IDs-only alerts and encrypted backup/restore gates. Hosted provider at-rest encryption remains UNVERIFIED; region approval is not encryption evidence and no column encryption is invented.
- Assignment requires both committed approval and authorized per-client selection, independent uniqueness and bounded backfill; selection may precede/follow approval. Distinct-key races, F12-compatible lock order, reauthorization and original submission/SLA uniqueness are required.
- D-03 is a pure Friday-only Cairo function with fixed `cairo-d03-v1`; calendar governance is removed. Q2's exact instant is NOT DECIDED. The next-date first-valid-instant algorithm and DST overlap/gap treatment are conditional recommendations only.
- Real-data delay classification/alerts require authoritative P4 delivery/responsibility integration; missing evidence is an operational exception, never lateness. Synthetic integration is permitted. Reusing pg_cron activation/deactivation is an architectural recommendation with activation deferred.
- Former Q4 calendar and Q11 navigation are removed as policy votes; F12 FINAL F12-6 remains binding. Former Q6 cadence is engineering work and its retention is merged into final Q8. General replacement is deferred. Final questions map former Q1/Q2/Q3/Q5/Q7/Q8/Q9/Q10 to sequential Q1–Q8.
- REQ-P2-01 remains verbatim FR-001; roadmap scope remains quoted. Requested F12/F14 source pins are refreshed; future migrations must follow the sets actually merged at implementation, with latest integrated audit/capability definitions and known/unknown-string parity.
- Spec Debate is complete; eight PO decisions remain open. Only specification, checklist and debate Markdown changed; no code, migration, DB, Docker, plan or tasks. Existing B4/DP-01/02 retention gates block production real data only, not local/CI synthetic work. No deployment/merge/production approval is implied.

## S14 Copy Approval Package

Copy approval status follows the PO records; historical source paths remain in [the copy review package](../reports/S14-terms-draft.md).

- [x] T&C Arabic and English, approved verbatim by S30-PO-1 Q2.
- [x] Standalone health notice superseded by S17; use only the separately approved contextual label where useful.
- [x] B06 sex question and labels in Arabic and English, approved verbatim by S30-PO-1 Q2.
- [ ] Remaining authored English intake and option translations not covered by S31-R2/S32-PO-8; approved rows must remain unchanged.
