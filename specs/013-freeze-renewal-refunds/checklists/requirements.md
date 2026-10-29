# Specification Quality Checklist: F13 — Freeze, renewal, refunds and expiry

**Purpose**: Review specification quality after the binding Spec Debate judgment, before slice-specific PO decisions/approval and planning.

**Created**: 2026-10-29

**Feature**: [spec.md](../spec.md)

**Debate**: [debate.md](../debate.md)

**Status**: Draft — Spec Debate complete (2026-10-29); pending PO decisions.

**Review Ownership**: Maintained under speckit-specify conventions. Checked means requirements-quality review, not implementation, executed acceptance tests or PO policy approval.

## Content Quality

- [ ] No implementation details (languages, frameworks, APIs).
- [x] Focused on user value and business needs.
- [x] Written for stakeholders, with a bounded technical dependency/guard inventory.
- [x] All mandatory sections completed.

## Requirement Completeness

- [x] No untracked clarification placeholders; every remaining policy gap has a named NOT DECIDED question.
- [ ] Requirements are fully testable and unambiguous across every policy branch.
- [x] Success criteria are measurable, with policy-dependent expectations explicitly conditional.
- [ ] Success criteria are entirely technology-agnostic.
- [x] Primary acceptance scenarios and exact race results are defined.
- [x] Edge cases cover Cairo DST/date credit, no activation, corrected/recollected tails, terminal refunds and unstarted-only successor reflow.
- [x] Scope is bounded: P4 enforcement/notices, P5 check-ins, separate closure after B4, later installment/multiple-future renewals.
- [x] Dependencies and assumptions are identified, with exact F12/F14 pins and latest-merged integration rules.

## Feature Readiness

- [ ] Every functional requirement has unconditional final acceptance criteria.
- [x] Five primary stories are independently testable with dependency fixtures.
- [x] Specification behavior maps to measurable success criteria and required traceability AT IDs.
- [ ] No implementation details leak into specification.

## Notes

- Result: 11/16 built-in criteria satisfied; five remain open honestly. Spec Debate is complete, with Sol Medium and Opus 5.5 openings, one rebuttal round and binding Claude Opus 5.5 architect judgment recorded in debate.md. No fresh critique or product implementation approval is claimed by this edit.
- Technical-detail exclusions and wholly technology-agnostic SCs remain unchecked because the judgment explicitly requires SQL guard/kind/constraint names, RPC-independent terminal integrity, capability/grant parity and coordinated reader/audit migrations. These are specification acceptance constraints, not code, SQL implementation, a plan or executed DB evidence.
- Final policy/acceptance completeness remains conditional on 11 PO questions: ND-01/02/03/04/05/06/08/12/13/14/16. They cover allowances, eligibility/day credit, post-completion removal, renewal offer/preactivation/late start, future-renewal exposure, dependent purchase refund, authoritative late-recorded refund date, eligible paid states, frozen plan/export access and renewal payment terms. Recommendations are NOT DECIDED; each blocks only its affected slice.
- Reviewed coverage: 5 stories, FR-001..034, SC-001..013, logical entities, exact calendar/race fixtures, MVP slices and Constitution 1.3.0 check. SC-001 maps AT-FIN-09/10; SC-003 maps AT-FRZ-02/03; SC-004 maps AT-REN-01; SC-010 maps AT-FRZ-04/AT-KPI-03; SC-012 maps AT-EXP-01/02; SC-013 maps AT-FRZ-01. AT IDs remain proposed coverage requirements, not test passes; P4/P5 consumers are separate integration gates.
- Sources: architecture v3 APPROVED and traceability added with later-decision/F12 supersession. F12 pinned 50cc77e8a0090f3baa716c3e4656b216db0983dd, F14 pinned 334f50190bcc78e794832fa26c0ea9d482b116c6. Read-only F12 model inspection confirmed the two-kind CHECK, reversal/successor uniqueness, chain/actor/correspondence guards and non-approval clients UPDATE prohibition.
- Money: one F12 ledger gains terminal refund_reversal; corrected originals are excluded, active recollections included; refund cash is collected revenue only, associated stored commission reversed separately, unpaid obligations get unique cancellation facts. Zero-net monetary refund rejected, terminal never reopens, no partial refund or mutable history. Refund-month posting is binding; late-recorded authoritative date remains ND-12. Every receipt/result omits commission for every role.
- Coordination: forward-extend kind/value/alternation/chain/correspondence checks, audit mapping and all status/commission/queue/eligibility readers together, with deferred no-successor enforcement independent of RPC/key. Use client-first locks, stable subscription-ID order, obligation sequence, ledger tails, then fresh authorization held through commit. Rebuild latest integrated audit/TS/app_private.role_has_capability bodies, retaining F12 Sales approval removal and F14 manage_branding.
- Security: existing workspace row explicitly required even for PO; forced default-deny RLS/no browser base grants; SECURITY DEFINER/search_path empty/qualified names/postgres ownership; EXECUTE revoked from all four application-role defaults then granted narrowly; internal seams never authenticated. Bounded error codes only, including jobs.last_error, which F11 audit copies verbatim.
- Scope/source decisions removed from questions: immediate renewal activation, stacked early start, fixed activation/installment dates, active-tail refund math, refund-month posting, no expiry grace, P4 ownership, closure/removal meaning, freeze role authority and zero-net/terminal behavior. No new capability. Frozen plan/export interpretation remains a PO confirmation, not silently treated as decided.
- Production gates remain open. F13-PB-01/02 require later central-register allocation under an authorized shared-file change. Refund needs no activation; real freeze/renewal exposure waits for the P4 writer. Synthetic projection fixtures are not hosted/portal/enforcement proof.
- Documentation gates before commit: required Prettier check, diff whitespace check and UTF-8/ID/link/verbatim-roadmap/scope validation. Expected timezone instants were checked read-only using Node 24.19.0 / ICU 78.3 / tzdata 2026b; no code/DB/application tests were run. No extension hook file was present on inspection. Explicit three-file scope supersedes metadata/shared-register writes.
- Next: PO answers for affected slices, then separately authorized plan/tasks/analyze and implementation approval. Unanswered policy does not block unrelated planning; checklist incompleteness is not a reason to invent defaults or rerun completed Spec Debate.
