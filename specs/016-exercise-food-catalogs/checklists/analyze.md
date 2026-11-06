# Analyze — F16 one-global-catalog redesign (S36 round 2)

- Date: 2026-11-06 19:42 UTC (after the S36-PO-2 edits to spec, plan, data-model, contracts, tasks and decision register; last spec-artifact commit a7cef643).
- Scope: S36-PO-2 F16 answers (F16-MCQ-1 to -7), no client transfers between workspaces (FR-022), CI role-matrix restore (S36-R10), planned-operation rule, F16-MCQ-8 / -9 / -10 open, implementation blockers. Spec-only; no app code, SQL, migrations or tests changed.
- Authority: S36-PO-2 F16 paragraph quoted byte-for-byte in `spec.md` Clarifications and `decision-register.md`; architect mapping in `s36-architect-rulings-2.md` applied and labelled as architect words.

## Entry check (Spec Kit gate, section 1)

- spec.md has numbered FRs (FR-001 to FR-022), measurable SCs (SC-001 to SC-012) and Given/When/Then acceptance scenarios for every user story: PASS.
- Clarifications: `## Clarifications` contains S33-PO-4, S35-PO-3, S36-PO-1 and S36-PO-2 sessions; open items are named, not assumed away: PASS.
- plan.md covers the touched scope; tasks.md has T037–T042 with FR tags and status: PASS.
- This file is dated after the last change to spec, plan, data-model, contracts and tasks: PASS.

## Findings

| ID | Category | Severity | Location | Summary | Status / recommendation |
|---|---|---|---|---|---|
| A1 | Coverage | MEDIUM | spec.md FR-002; tasks.md (none) | FR-002 canonical edit (answered F16-MCQ-5 a) had no task. | RESOLVED in a7cef643: T037 now tags FR-002 and carries the global-admin-only canonical edit RED tests. |
| A2 | Ambiguity | MEDIUM | plan.md line 53; spec.md FR-002 | "Explicit global admin scope" had no capability name. | RESOLVED in a7cef643 by mapping to existing PO-only `catalog.exercise.govern`. Architect to confirm the mapping. |
| A3 | Ambiguity | MEDIUM | decision-register.md F16-MCQ-3 | Architect labels MCQ-3 as option (c), but option (c) text contradicts the PO words. | Recorded: binding requirement is the PO words (names and instructions frozen at publish; video live). Label flagged for architect confirmation. No requirement depends on the label alone. |
| A4 | Ambiguity | MEDIUM | decision-register.md F16-MCQ-10 (new) | S36-PO-2 answer to MCQ-4 (c) allows private alternative references; client-view presentation of them is unanswered. | OPEN PO-DECISION-NEEDED. Blocks the client-view alternative presentation in T039; no requirement encodes a default. |
| A5 | Ambiguity | MEDIUM | spec.md FR-014; SC-009 scope | Private Trainer exercise video in client plan views. | OPEN PO-DECISION-NEEDED F16-MCQ-9 (not answered by S36-PO-2). Blocks the private-exercise assertions in T039. |
| A6 | Ambiguity | MEDIUM | spec.md FR-003; T037, T038, T040 | Localization of name overrides. | OPEN PO-DECISION-NEEDED F16-MCQ-8 (not answered by S36-PO-2). Blocks name-field payload validation (T038) and AR/EN editor requirements (T040). |
| A7 | Constitution alignment (process) | BLOCKER (see note) | constitution (`.specify/memory/constitution.md` lines 148–151, Mandatory Spec Debate); S36-PO-2 | S36-PO-2 authorizes Sonnet 5.5 independent critiques for F16. The constitution mandates an independent Sol Medium critique and prohibits substitution outside the permitted tiers. | Implementation blocker, PO-owned. Recorded in spec.md, plan/tasks S36 blockers and this checklist. Reported to PO. Note: the analyze rule classifies constitution conflicts as CRITICAL. No spec, plan or task element violates a principle; the blocker is a review-process conflict, so it is recorded as a blocker per the S36 brief, not as a spec-artifact CRITICAL. The architect should confirm this classification. |
| A8 | Inconsistency | LOW | impact-s35-redesign.md | Audit document still describes F16-MCQ-1 to -9 as open at its audit-time SHA. | Historical audit, not updated; LOW. Architect may refresh it. |
| A9 | Underspecification | LOW | spec.md FR-014 | FR-014 is a long multi-sentence requirement. | Readability only; no ambiguity introduced by S36-PO-2. Leave as is. |
| A10 | Duplication | none | — | No new duplicate requirements found after the edits. | — |

## Coverage

- FR-002 → T037 (A1 resolved). FR-003 → T037, T038, T041. FR-014 → T037, T038, T039, T041, T042. FR-018 → T037, T038, T040. FR-020 → T039, T041, T042. FR-022 → T039. SC-001, SC-008, SC-011, SC-012 → traced through FRs above.
- Planned contract rows (`contracts/catalog-api.md` "Planned operations (not implemented)") map to T037–T039; each moves into the implemented matrix only with its SQL, fixture row and parity test (S36-R10 rule in tasks.md).
- Implemented role matrix in `contracts/catalog-api.md` equals origin/main's 8 rows; `npx vitest run tests/unit/catalog-role-parity.test.ts` checked locally (see report).

## Counts

- CRITICAL (spec artifacts): 0. HIGH: 0.
- Blockers outside spec artifacts: 1 (A7, independent-critique conflict, PO-owned).
- Open PO-DECISION-NEEDED: F16-MCQ-8, F16-MCQ-9, F16-MCQ-10 (new).
- Answered or moot: F16-MCQ-1, -3, -4, -5, -6 (answered); -2, -7 (moot).

## Gate

- Spec and plan artifacts: PASS, 0 CRITICAL / 0 HIGH.
- Implementation: BLOCKED by A7 (independent critique: Sonnet 5.5 authorized by S36-PO-2; constitution Sol Medium conflict reported to PO) and by the open MCQs for the affected tasks (T037 partial on MCQ-8; T038 name fields on MCQ-8; T039 private video and alternatives on MCQ-9/-10; T040 on MCQ-8).
