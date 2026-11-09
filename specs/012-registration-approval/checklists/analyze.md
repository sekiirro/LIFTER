# Analyze — F12 registration approval and payment recording

## 2026-11-09 21:30 +02:00 — S41 round 4 analysis (S41-PO-1..3 and S41-R4 cross-reference; PR #73)

- Scope: 012 FR-022 (approval commit as trigger for 011 distribution through a durable job) after the S41 edit that adds the delayed-job no-op for a Platform Owner manual assignment (011 FR-028 (g); S41-R4 F2). Other 012 FRs unchanged.
- Entry check: FR-022 has an existing acceptance path (012 T016 and the 011 T063 cross-reference); no new requirement or copy is introduced. PASS.
- Findings: CRITICAL 0. HIGH 0. MEDIUM 0 new. The 012 open items are unchanged; the P2 capability question (DG-F12-1) is an existing P2 item.
- The PO decisions S41-PO-1..3 concern 011 only. Their 012 effect is the cross-reference above and nothing else.
- Result: PASS, 0 CRITICAL, 0 HIGH. Static consistency only; no product behaviour, migration or implementation is changed.

## 2026-11-09 18:45 +02:00 — S40 round 3 analysis (S40-PO-13 + S40-R19 cross-references; PR #73)

- Entry check (Spec Kit gate section 1): spec.md requirements, measurable SCs and Given/When/Then scenarios for the touched scope (FR-022, Out of Scope, edge cases): PASS. Clarifications: the 2026-10-28 and 2026-10-29 PO records are the register; the S40 cross-references cite S40-PO-13 and S40-R19 (architect ruling, labelled). PASS. plan.md and tasks.md: present; no task was added or changed in this round. PASS.
- Gap at entry: this folder had no `checklists/analyze.md` before this round, so the "analyze.md exists" check FAILED. This file is the first analysis for spec 012 and closes that gap for the cross-reference scope. No implementation task is opened by it.
- Scope of change: (1) FR-022 names the approval commit as the trigger for the 011 FR-028 automatic responsible-Trainer distribution (S40-PO-13 MCQ-11 defaults); the distribution is a separate system write that grants nothing and changes no approval semantics. (2) Out of Scope: client closure/deletion now points to 011 FR-018–FR-026 (S40-PO-13); F12 adds no deletion behavior. (3) Edge case: a deletion-pending or deleted client is refused on approve and reject with the FR-017 stale-state response; no subscription, obligation or payment is created. (4) Status line notes the round.
- Consistency checks: FR-001 (WO/PO approve only) and FR-017 (stale state not changed) are unchanged. The F12 "Sales has no approval capability" rule is unchanged. No money, commission, receipt or audit requirement changed. The 011 deletion path keeps approved payments, obligations and collections immutable (011 FR-020), which F12 FR-005 already requires.
- Open items that touch F12 (not F12 decisions): the deletion-confirmation content (011 S40-F11-MCQ-18) and the last-active Workspace Owner case (011 S40-F11-MCQ-13) affect approver availability only through 011; neither changes an F12 requirement. P2 Trainer form-selection capability (DG-F12-1) remains open and unchanged.
- Findings: CRITICAL 0. HIGH 0. MEDIUM 0 new. Previously recorded open items in F12 are unchanged; the P2 capability question (DG-F12-1) is an existing P2 item.
- Fix round (2026-11-09 18:56 +02:00, CodeRabbit round 1 on d8bb100d, review-body finding "Specify delivery of approval events to distribution"): FR-022 now says the distribution is consumed from a durable job written in the approval transaction; ownership is 011 FR-028 (g) (011 consumes, 012 emits; retries, backlog and idempotency specified there). No F12 approval, payment or audit behavior changed. Treated as valid: without a durable job a crash after approval leaves an eligible client unassigned.
- Result: PASS — 0 CRITICAL, 0 HIGH. Static consistency only; no product behavior, migration or implementation is changed.
