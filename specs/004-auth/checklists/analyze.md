# Spec Kit Analyze - F4 Authentication, S36 round 4 (ND-F4-7 spec), re-run after review round 5

- Date: 2026-11-06 20:59 UTC; after the last spec, plan, tasks and traceability change (commits 44777b04, 0e9daefd, 1f168277, 91445056 and 0dab1e06).
- Method: static cross-artifact review of spec.md, plan.md, tasks.md, traceability.md and this checklist, against `.specify/memory/constitution.md` (lines 148 to 153, the Sol Medium critique rule). No implementation, no tests, no local or hosted stack used. Live checks: PR threads (GraphQL, full pagination), CodeRabbit review 5806825067, and the merged F4 test `tests/integration/auth-recovery.test.ts` lines 318 to 357 (JWT amr evidence).
- Entry check (Spec Kit gate, section 1): PASS. spec.md has FR-001 to FR-030 and SC-001 to SC-015, with Given/When/Then scenarios US1 to US5. Clarifications: S35-PO-1 register, S36-PO-2 register (F4 line, verbatim), PDN-F4-7-01 to PDN-F4-7-16 and ARCH-S36-R4-1. plan.md covers ND-F4-7 and the provider boundary. tasks.md tags each task with FR IDs (T035, T038a, T038b, T049a to T049e, T050a, T050b).
- Copy check (S36-PO-1, four strings): PASS at the last check (see report.md). Each string occurs exactly once in spec.md (FR-029 table); no copy text was edited in this round.

## Findings and review classification

| ID | Category | Severity | Location | Finding | Disposition |
|---|---|---|---|---|---|
| C-R4-1 | Constitution (process) | CRITICAL (open, PO-owned) | `.specify/memory/constitution.md` lines 148 to 153; S36-PO-2 (Sonnet 5.5 authorized for F4); S36-R11 (spec rounds on Haiku) | The authorized independent critique (Sonnet 5.5) and the model used for this round (Claude Haiku 5.5) are not in the permitted tiers (GLM 5.3 Flash, Luna High, Sol Medium), and the constitution requires an independent Sol Medium critique. The artifacts do not breach a MUST: plan.md keeps the critique PENDING, and T033, T048 and the implementation gate block implementation until the PO resolves it. | Reported to the PO (PO-DECISION-NEEDED P1). Blocks implementation. Counted here as CRITICAL under the Analyze rule for constitution conflicts; see verdict. |
| NF-1 | Security and underspecification | HIGH (open) | spec.md FR-030 control A and US5 scenario 10; plan.md control A; tasks.md T044, T049b, T049c, T050b; review thread PRRT_kwDOVYgYQ860ZFWi (plan.md:136) | Direct anon-key `/recover` bypasses eligibility, the five-per-account limit, the global cap and request audit. No local mechanism that keeps the built-in sender is selected. | Not closed. Options A (local ingress), B (send hook) and C (risk acceptance) recorded as PDN-F4-7-14 (B is a CONFLICT with S35-PO-3 "built-in email temporarily"). Blocked: T050b, the enabled-route cases of T049b and T049c, and any staff send beyond the test phase (PDN-F4-7-13). |
| NF-2 | Security | MEDIUM (specified; proof open) | spec.md FR-025 (a) to (h), FR-030 controls B to D; plan.md controls B to D and gates G1 to G5; tasks.md T049a, T049b, T049d, T049e, T050a; thread PRRT_kwDOVYgYQ860ZFWo | Direct `updateUser` bypass. The database control is specified: a guard on `auth.users` refuses a staff password change without an open intent and outside 900 s of recovery verification; the change and the revocation of other sessions share one transaction; closing rows and reconciliation are defined. Acceptance needs gates G1 to G5 and PDN-F4-7-15. | Not closed. The thread was auto-resolved by coderabbitai[bot] (outdated) and is re-opened by this lane, because the finding is not fixed. Returns to HIGH if G1 or G2 fails or PDN-F4-7-15 is refused. |
| CR5-1 | Security (session scope) | MEDIUM (open; architect question) | plan.md:102 (thread PRRT_kwDOVYgYQ860sEFX); spec.md FR-025 (b), FR-030 control B; ARCH-S36-R4-1 | The review asks the guard to bind the password update to the intent's session. A trigger on `auth.users` receives no request session identifier, so this cannot be implemented as asked. The guard is account-scoped; another session of the same staff account could complete the change while an intent is open (at most 900 s after verification). The change stays audited. | Partly addressed: the no-intent two-session negative case is added to T049a. The open-intent case is an architect decision (ARCH-S36-R4-1, not a PO decision). Thread left open. |
| CR5-2 | Correctness (ambiguous outcome) | FIXED | spec.md FR-025 (d), (f), (h); thread PRRT_kwDOVYgYQ860sEFl | An ambiguous `updateUser` outcome (timeout, lost connection) was treated as "unchanged". Now abort happens only on an explicit Auth error; an ambiguous outcome leaves the intent open, and reconciliation decides from `password_changed_at`. The user-visible result for an ambiguous outcome is the failure state, flagged for PO confirmation. | Fixed in commit 91445056; tested by T049d. Reply with evidence, then resolve. |
| CR5-3 | Security (time window) | FIXED | spec.md FR-030 control D, FR-025 (a) and (b); thread PRRT_kwDOVYgYQ860sEFq | The 900-second window was measured from intent start, so an update could land up to 1800 s after the session. The window is now measured from recovery verification (`recovery_verified_at`), checked at intent start and again at the password change. | Fixed in commit 91445056; tested by T049b. Reply with evidence. |
| CR5-4 | Security (fallback) | FIXED | spec.md FR-030 control D; plan.md G4; thread PRRT_kwDOVYgYQ860sEFq | The review says recovery authentication must not fall back to session age alone. The round 4 text had a session-age fallback. The fallback is removed: if the recovery entry cannot be relied on, control D is not accepted and PDN-F4-7-16 is raised. | Fixed in commit 91445056. Reply with evidence, then resolve the thread (with CR5-3). |
| SELF-1 | Correctness (own error) | FIXED | spec.md FR-030 control D; plan.md G4; traceability.md | Round 4 named `auth.mfa_amr_claims` method `recovery`, which is unverified and wrong for this repo. The merged F4 test reads the JWT `amr` claim, and the recovery session's latest entry is method `otp` (`tests/integration/auth-recovery.test.ts` lines 332 to 355). Control D now uses that established value. G4 still re-proves it on the local stack. | Corrected in commit 91445056. Recorded here; not a review finding. |
| CR5-5 | Test coverage (timing parity, review nitpick tasks.md:158) | FIXED in task; threshold OPEN | tasks.md T035; FR-018; AT-2 | Response-object comparison does not detect timing differences. The timing-parity check is added to T035. The measurement method and tolerance are the architect's AT-2 decision and are not encoded. | Fixed in commit 0dab1e06. FR-018 stays UNVERIFIED until AT-2 is decided. Nitpick reply with evidence (PR comment). |
| CR5-6 | Test coverage (FR-019 delivery cap, review nitpick tasks.md:162) | FIXED | tasks.md T038b | A RED test is added: after two emails within an hour, a further request that passes request limits sends no email, returns the generic confirmation, and exposes no delivery failure. | Fixed in commit 0dab1e06. Nitpick reply with evidence (PR comment). |
| T-176 | Gate evidence (tasks.md:176) | FIXED (round 4) | tasks.md T048 | Merge-base criterion in T048. | Fixed in commit 0e9daefd; replied and resolved (PRRT_kwDOVYgYQ860peAi). |
| N-168a and N-168b | Test coverage (review 5805324649 nitpicks) | FIXED (round 4) | tasks.md T049c, T038a | Public `/recover` five-request limit; app-side delivery permission. | Fixed in commit 0e9daefd; PR comment posted. |
| A-R4-1 | Ambiguity | MEDIUM | spec.md FR-025 (h); PDN-F4-7-12 | The user-visible result when the completed record fails after the change is an architect reading (signed-in state). The ambiguous-outcome result (failure state) is also an architect reading. | PO confirmation requested. Blocks only the response branches of T045. |
| A-R4-2 | Underspecification | MEDIUM | plan.md control B; PDN-F4-7-15 | The guard refuses staff password changes made outside the self-service flow (admin or hosted dashboard). No break-glass path is defined. | Confirm with the PO under PDN-F4-7-15. |
| A-R4-3 | Dependency | MEDIUM | spec.md FR-025 (a); PDN-F4-7-02; tasks.md T050a | `begin` eligibility depends on eligible roles, which are still open. | PO decision needed before T050a. |
| A-R4-4 | Unverified feasibility | MEDIUM | plan.md gates G1 to G5; spec.md FR-030 controls C and D; PDN-F4-7-16 (conditional) | Local behaviour not verified: refusal of a deleted session's token (G3), the JWT recovery entry on the local stack (G4), refresh-token cascade (G5), guard refusal reaching the caller (G1, G2). | T050a starts with the spike. If G3 or G4 fails, PDN-F4-7-16 is raised. |
| A-R4-5 | Scope limit | MEDIUM | spec.md FR-030 control D; docs/13 ND-F4-3 | Control D covers the password path only. General session-lifetime enforcement stays the open ND-F4-3 blocker. | Recorded. Not a regression. |
| A-R4-6 | Historical text | LOW | spec.md "Architect ruling S35-R5", item T1 | The S35-R5 ruling still names T049 as the direct-Auth test; superseded by FR-025 and FR-030. | Kept as history. |
| A-R4-7 | Dependency section | LOW | tasks.md "Dependencies & order" | New tasks (T038a, T038b, T049a to T049e, T050a, T050b) are not listed there. Each carries its own gate. | Optional edit in a later round. |
| A-R4-8 | Expected | LOW | plan.md "Project Structure" | No file yet for the T050a migration. | Name set at T050a, unique across all origin refs. |

## Coverage summary

| Requirement | Task IDs | Notes |
|---|---|---|
| FR-001 to FR-015 | Merged tasks T001 to T032 | Mapped in traceability.md; not changed in this round. |
| FR-016 | T034, T043 | Blocked by T033 (PDN-F4-7-02). |
| FR-017, FR-018 | T035, T041, T043 | FR-018 timing parity: T035 (threshold open, AT-2). |
| FR-019 | T038a, T038b, T041, T044 | Delivery permission on the app route (T038a); delivery cap (T038b). |
| FR-020, SC-011 | T046, T047 | Hosted change out of scope. |
| FR-021, SC-010 | T040, T044 | - |
| FR-022 | T037, T037a, T044a, T045 | - |
| FR-023 | T036, T044 | - |
| FR-024, SC-009 | T038, T038a, T044, T049c | Direct and mixed-route checks on an enabled public route. |
| FR-025 (a) to (h), SC-004 | T039, T044, T045, T049a, T049d, T050a | Intent state machine; guard in T050a. |
| FR-026 | T045 | ND-F4-3 blocker unchanged. |
| FR-027, FR-029, SC-014 | T042, T042b, T045 | Four strings approved; other copy under PDN-F4-7-06. |
| FR-028 | T034 to T042, T048 | - |
| FR-030 (controls A to D), SC-015 | T049a to T049e, T050a, T050b | Control A blocked (PDN-F4-7-14); control B needs PDN-F4-7-15; control D needs G4. |
| SC-008, SC-013 | T041 | SC-013 time target PDN-F4-7-09 open. |
| SC-012 | T037, T049d | - |

## Verdict

- Open CRITICAL: 1 (C-R4-1, constitution process conflict, PO-owned). Spec-defect CRITICAL: 0. The brief's gate "0 CRITICAL" is therefore NOT met on a strict count, and the architect must decide whether a PO-owned constitution conflict counts against it.
- Open HIGH: 1 (NF-1). NF-2 is MEDIUM: its control is fully specified, and it stays open until G1 to G5 are proven.
- Open MEDIUM: 8 (NF-2, CR5-1, CR5-5 threshold, A-R4-1 to A-R4-5). Open LOW: 3 (A-R4-6, A-R4-7, A-R4-8).
- Closed in round 5: CR5-2, CR5-3, CR5-4, CR5-6, SELF-1. Not closed: CR5-1 (architect), CR5-5 (AT-2).
- Implementation blocker: ND-F4-7 implementation is BLOCKED. It needs: C-R4-1 resolved by the PO; PDN-F4-7-14 and PDN-F4-7-15 answered; PDN-F4-7-01, -02, -03 and -04 answered; ARCH-S36-R4-1 and AT-2 decided by the architect; feasibility gates G1 to G5 passed or raised; copy approvals (PDN-F4-7-06); security review scheduled; and Analyze re-run afterwards.

## Metrics

- Requirements: 30 FRs, 15 SCs. Tasks: 60 (29 ticked, all pre-existing; none of the new tasks is ticked).
- Requirements with at least one task: 30 of 30 FRs and 15 of 15 SCs.
- Duplications introduced: 0.
- Critical issues (strict count): 1 (C-R4-1).

## Next actions

- PO: resolve C-R4-1 (the authorized critique conflicts with the constitution's Sol Medium rule, and this lane's model is outside the permitted tiers).
- PO: answer PDN-F4-7-14 and PDN-F4-7-15 (CONFLICTS with S35-PO-3 on the public `/recover` mechanism and the migration on `auth.users`).
- Architect: decide ARCH-S36-R4-1 (guard session scope) and AT-2 (timing-parity method and tolerance).
- PO: confirm the user-visible results in FR-025 (h) (completion-record failure and ambiguous outcome).
- Re-run Analyze after these answers and after the T050a feasibility spike.

Remediation edits were offered, not applied.
