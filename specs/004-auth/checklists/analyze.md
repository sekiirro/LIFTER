# Spec Kit Analyze - F4 Authentication, S37 round 5 (PDN-F4-7-14 = B, PDN-F4-7-15 = A)

- Date: 2026-11-08; after the last spec, plan, tasks, research and traceability change of this round (last change: the T043 to T046 alignment in tasks.md; re-checked, no new finding, counts unchanged).
- Method: static cross-artifact review of spec.md, plan.md, tasks.md, research.md, traceability.md and this checklist, against `.specify/memory/constitution.md` (Sol Medium critique rule) and the S37 experiment report E1 to E4 (`C:/Users/NEW LAP/.lifter/runs/s37-luna-f4-bypass2/report.md`). No implementation, no tests, no stack run in this round.
- Scope of this round: spec-only. It encodes PO answers S37-PO-8 items 2 and 3 and records the experiment evidence. No task is ticked and no task is added.
- CodeRabbit review of head bd159a9c (2026-11-08 19:52 UTC, CHANGES_REQUESTED: 5 actionable inline comments and 1 additional comment) is folded in as R5-4 to R5-9. All six were checked against the current text; none was judged invalid.

## Entry check (Spec Kit gate, section 1)

| Check | Result | Evidence |
|---|---|---|
| spec.md has numbered FRs, measurable SCs and Given/When/Then scenarios for the touched scope | PASS | spec.md FR-001 to FR-030, SC-001 to SC-015, User Stories 1 to 5 (scenario 10 covers FR-030) |
| Clarifications recorded, with the PO source cited | PASS | spec.md PDN-F4-7-14 (ANSWERED: B) and PDN-F4-7-15 (ANSWERED: A), citing S37-PO-8 in `C:/Users/NEW LAP/.lifter/runs/s37-po/s37-po-1.verbatim.txt`. Open ambiguities are listed below; none is assumed absent. |
| plan.md covers the touched scope; tasks.md tags tasks with FR IDs | PASS | plan.md "Provider-boundary controls" (controls A to D, gates G1 to G6, hosted containment); tasks.md T033, T044, T049b, T049c, T049e, T050a, T050b, each with FR IDs |
| checklists/analyze.md dated after the last change, with 0 open CRITICAL/HIGH | FAIL for implementation | This file is dated 2026-11-08. Open CRITICAL/HIGH: C-R4-1, NF-1, R5-1 (below). Spec-only edits are not blocked; implementation is. |

## Findings and review classification

| ID | Category | Severity | Location | Finding | Disposition |
|---|---|---|---|---|---|
| C-R4-1 | Constitution (process) | CRITICAL (open) | `.specify/memory/constitution.md` lines 148 to 153; S36-PO-2 (Sonnet 5.5 authorized for F4); S37-PO-1 Q3 | The PO approved the Sol Medium critique for "F4 #65" (S37-PO-1 Q3). The critique has not run; the architect schedules it, and this round does not run it. | Open until the Sol Medium critique is recorded. The PO approval is recorded here and does not close the finding by itself. |
| NF-1 | Security | HIGH (open) | spec.md FR-030 control A, US5 scenario 10; plan.md Control A; tasks.md T049b, T049c, T050b; thread PRRT_kwDOVYgYQ860ZFWi (plan.md:138) | Direct anon-key `/recover` bypass CONFIRMED (E1). Mechanism decided: PDN-F4-7-14 = B (local send hook, S37-PO-8 item 2). The send hook was not run; gate G6 is open. | Not closed. Returns to MEDIUM only after T049b and T049c pass on the local stack. |
| NF-2 | Security | MEDIUM (open) | spec.md FR-025 (a) to (h), FR-030 control B; tasks.md T049a, T049d, T049e, T050a; thread PRRT_kwDOVYgYQ860ZFWo | Direct `updateUser` password change CONFIRMED (E2). Mechanism decided: PDN-F4-7-15 = A (guard, S37-PO-8 item 3). The guard is not run; gates G1 and G2 are open. | Not closed. Returns to HIGH if G1 or G2 fails or the guard is refused. |
| CR5-1 | Security (session scope) | MEDIUM (open; architect) | plan.md (thread PRRT_kwDOVYgYQ860sEFX); spec.md FR-025 (b); ARCH-S36-R4-1 | The guard is account-scoped, because a trigger on `auth.users` has no request session id. | Architect question, unchanged. Thread stays open. |
| CR5-5 | Test coverage (timing parity) | MEDIUM (open; AT-2) | tasks.md T035; FR-018 | The timing method and tolerance are not decided. | Unchanged. |
| A-R4-1 | Ambiguity | MEDIUM (open) | spec.md FR-025 (h); PDN-F4-7-12 | The user-visible result of a completion failure awaits PO confirmation. | Unchanged. |
| A-R4-3 | Dependency | MEDIUM (open) | spec.md FR-025 (a); PDN-F4-7-02; tasks.md T050a | `begin` eligibility needs the eligible roles, which are still open (PDN-F4-7-02). | Unchanged. |
| A-R4-4 | Unverified feasibility | MEDIUM (open) | plan.md gates G1 to G6; FR-030 controls C and D | G1 to G5 not run. G6 (send hook) added in this round. E2 did not exercise control D (its recovery verify returned `otp_expired`), so G4 is the only proof of control D. | Open until the gates run. PDN-F4-7-16 is raised if G3 or G4 fails. |
| A-R4-5 | Scope limit | MEDIUM (open) | FR-030 control D; docs/13 ND-F4-3 | Control D covers the password path only. General session lifetime stays the open ND-F4-3 blocker. | Recorded. Not a regression. |
| A-R4-2 | Underspecification | MEDIUM, CLOSED in this round | plan.md control B; PDN-F4-7-15 | The consequence, that a staff password change outside the self-service flow is refused, is accepted by the PO's answer A ("with no emergency override"). | Closed by S37-PO-8 item 3. No break-glass path exists in this feature. |
| A-R4-6 | Historical text | LOW (open) | spec.md "Architect ruling S35-R5", item T1 | Still names T049 as the direct-Auth test. | Kept as history. |
| A-R4-7 | Dependency section | LOW (open) | tasks.md "Dependencies & order" | New tasks are not listed there. | Optional, later round. |
| A-R4-8 | Expected | LOW (open) | plan.md "Project Structure" and "Migration versions" | No migration file name yet. The version is described only and must be above the highest origin version (scan 2026-11-08: `20261108230000`). | Name set at T044 or T050a. |
| R5-1 | Hosted containment | HIGH (open; PO) | spec.md PDN-F4-7-17, FR-020, FR-030 control A; plan.md "Hosted containment" | The PDN packet warns that a committed config setting reaches the hosted project on push. This repository has no workflow that pushes config (`.github/workflows/ci.yml` runs `supabase start` and `supabase stop` only). A hosted-side sync linked to the repository cannot be checked from the repository. | Open PO question (PDN-F4-7-17, one MCQ). Blocks only the merge of the T050b config block. |
| R5-2 | Mechanism check (control C) | LOW (open) | FR-030 control C; plan.md G3; tasks.md T049e, T050a | E4 showed GoTrue's own revocation for one direct update, so the explicit `auth.sessions` deletion may be redundant on the app path. | T050a checks GoTrue's native revocation first. The required outcome is unchanged. |
| R5-3 | Operational (Stack D hygiene) | LOW (open) | research.md R10 | Two synthetic users from the experiment remain in `auth.users` on Stack D (foreign key and `forbid_delete`). Not a spec defect. | Recorded as a blocker in the round report; no spec change. |
| R5-4 | Audit ownership (CodeRabbit on bd159a9c, plan.md:154, additional comment) | MEDIUM (open until T049c passes) | plan.md step 2 (f) and Control A | The app route and the hook both wrote `staff_password_reset.requested`, so one accepted request produced two events, and FR-025 requires exactly one. | Fixed in plan.md: the hook is the only writer. T049c tests exactly one event on either route. |
| R5-5 | Completion guard (CodeRabbit on bd159a9c, spec.md:148) | MEDIUM (open until T049a and T049d pass) | spec.md FR-025 (b), FR-030 control B; tasks.md T049a | The guard allowed a second password change under the same open intent after `password_changed_at` was set. | Fixed in spec.md: `password_changed_at` must be null before a change, checked atomically. T049a tests the second change. |
| R5-6 | Hosted send path (CodeRabbit on bd159a9c, spec.md:141, Major) | MEDIUM (open; design at the FR-020 gate) | spec.md FR-020; plan.md hosted containment (4) | Supabase does not use its own SMTP sender while a send-email hook is enabled, so the hosted path is not specified. | Requirement added to FR-020: the hosted design is specified and tested on the hosted project before rollout. The design itself is not decided here. |
| R5-7 | Refusal replaces a delivered link (CodeRabbit on bd159a9c, plan.md:123, Major) | MEDIUM (open until G6 (vi) runs) | spec.md FR-030 control A; FR-021; plan.md G6 (vi) | GoTrue may regenerate the recovery token on each request, so a refused request could invalidate a delivered link. | Requirement and G6 (vi) added. The GoTrue behaviour is not verified; a failure is raised as a new PDN. |
| R5-8 | Response parity under repeated direct requests (CodeRabbit on bd159a9c, plan.md:110, Minor; E1) | MEDIUM (open until G6 (v) runs) | plan.md G6 (v); FR-018 | E1 showed 200 on the first direct request and 429 on the next five, so the responses can differ. | G6 (v) added. Any difference is raised as an FR-018 gap. |
| R5-9 | Analyze blocker wording (CodeRabbit on bd159a9c, checklists/analyze.md:52, Major) | LOW (fixed; confirm at the next Analyze run) | checklists/analyze.md Verdict | The blocker list required T049b and T049c to pass before implementation, but T050b needs them RED first. | Fixed in this file: their pass is T050b's acceptance, not an entry condition. |

## Coverage summary

| Requirement | Task IDs | Notes |
|---|---|---|
| FR-019 | T038a, T038b, T041, T044, T050b | Test-phase sender is the send hook (PDN-F4-7-14 = B); waiver ends at FR-020. |
| FR-020, SC-011 | T046, T047 | Hosted change out of scope. Hosted containment: PDN-F4-7-17. |
| FR-025 (a) to (h), SC-004 | T039, T044, T045, T049a, T049d, T050a | Intent state machine; guard in T050a (PDN-F4-7-15 = A). |
| FR-030 (controls A to D), SC-015 | T049a to T049e, T050a, T050b | Control A: decided B, G6 open. Control B: decided A, guard not run. Control C: T050a check first. Control D: G4 open. |
| US5 scenario 10 | T049a to T049e, T050a, T050b | Not met until T049b and T049c pass. |
| SC-012 | T037, T049d | - |

## Verdict

- Open CRITICAL: 1 (C-R4-1). Open HIGH: 2 (NF-1, R5-1). The implementation entry check is FAIL, so no implementation task starts in this round.
- The spec-only changes of this round are PASS. They encode the PO answers, the experiment evidence and the fixes for the CodeRabbit review of bd159a9c (R5-4 to R5-9), without implementing anything.
- Implementation blockers (all must clear): C-R4-1 (Sol Medium critique recorded); NF-1: gate G6 passed, and T049b and T049c written RED before T050b (their pass is T050b's acceptance, not an entry condition); R5-1 (PDN-F4-7-17 answered before the T050b config block merges); R5-6 (hosted send path specified at the FR-020 gate); PDN-F4-7-01, -02, -03 and -04 answered; ARCH-S36-R4-1 and AT-2 decided by the architect; gates G1 to G6 passed or raised; PDN-F4-7-06 copy approved; security review scheduled; Analyze re-run afterwards.

## Metrics

- Requirements: 30 FRs, 15 SCs (counted from spec.md). Tasks: 60, of which 29 are ticked and 31 are open (counted from tasks.md; none changed in this round).
- Requirements with at least one task: 30 of 30 FRs and 15 of 15 SCs.
- Findings in the table: 22 (open: 21; closed in this round: 1, A-R4-2). Open by severity: CRITICAL 1, HIGH 2, MEDIUM 12, LOW 6.
- Duplications introduced: 0.

## Next actions

- PO: answer PDN-F4-7-17 (hosted containment of the committed config block). One MCQ, in the round report.
- PO: the remaining open items (PDN-F4-7-01, -02, -03, -04, -05, -06, -09, -10, -11, the user-visible sub-question of -12) stay as they are.
- Architect: schedule the Sol Medium critique (approved by S37-PO-1 Q3); decide ARCH-S36-R4-1 and AT-2.
- Local stack, when the implementation entry check passes: run the G1 to G6 spikes before T050a and T050b.
- Re-run Analyze after the PO answers and after the spikes.

Remediation edits were applied in this round only where a PO answer is recorded (PDN-F4-7-14 and -15), together with the evidence and the dependent task text. No other finding was changed.
