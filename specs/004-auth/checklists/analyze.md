# Spec Kit Analyze - F4 Authentication, S36 round 4 (ND-F4-7 spec)

- Date: 2026-11-06 20:44 UTC; after the last spec, plan and tasks change (commit 44777b04 for spec.md and plan.md, 20:41 UTC; commit 0e9daefd for tasks.md, 20:41 UTC) and after the traceability.md update.
- Method: static cross-artifact review of spec.md, plan.md, tasks.md, traceability.md and this checklist, against `.specify/memory/constitution.md` (lines 148 to 153 and the Sol Medium critique rule). No implementation, no tests, no local or hosted stack used.
- Entry check (Spec Kit gate, section 1): PASS. spec.md has FR-001 to FR-030 and SC-001 to SC-015, with Given/When/Then scenarios US1 to US5. Clarifications: S35-PO-1 register, S36-PO-2 register (F4 line, verbatim), PDN-F4-7-01 to PDN-F4-7-16. plan.md covers ND-F4-7 and the provider boundary. tasks.md tags each new task with FR IDs (T038a, T049a to T049e, T050a, T050b).
- Copy check (S36-PO-1, four strings): each of the four approved strings was compared byte-for-byte with `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-1.verbatim.txt` and occurs exactly once in spec.md (FR-029 table). PASS.

## Findings and review classification

| ID | Category | Severity | Location | Finding | Disposition |
|---|---|---|---|---|---|
| C-R4-1 | Constitution (process) | CRITICAL (open, PO-owned) | `.specify/memory/constitution.md` lines 148 to 153; S36-PO-2 (Sonnet 5.5 authorized for F4); S36-R11 (spec rounds on Haiku) | The authorized independent critique (Sonnet 5.5) and the model used for this round (Claude Haiku 5.5) are not in the constitution's permitted tiers (GLM 5.3 Flash, Luna High, Sol Medium), and the constitution requires an independent Sol Medium critique. The artifacts do not breach a MUST: plan.md keeps the critique PENDING, and T033, T048 and the implementation gate block implementation until it is resolved. Only the PO can close the conflict. | Reported to the PO (PO-DECISION-NEEDED P1). Blocks implementation. Counted here as CRITICAL under the Analyze rule for constitution conflicts; see verdict. |
| NF-1 | Security and underspecification | HIGH (open) | spec.md FR-030 control A, US5 scenario 10; plan.md "Provider-boundary controls", control A; tasks.md T044, T049b, T049c, T050b | Direct anon-key `/recover` bypasses eligibility, the five-per-account limit, the global cap and request audit. No local mechanism is selected that denies or gates the route while keeping the built-in sender required by FR-019. | Not closed. Candidates A (local ingress), B (send hook) and C (risk acceptance) are recorded as PDN-F4-7-14 (CONFLICT with S35-PO-3 "built-in email temporarily" if B). Blocked: T050b, the enabled-route cases of T049b and T049c, and any staff send beyond the test phase (PDN-F4-7-13 release blocker). |
| NF-2 | Security | MEDIUM (specified; proof open) | spec.md FR-025 (a) to (h), FR-030 controls B to D; plan.md controls B to D and gates G1 to G5; tasks.md T049a, T049d, T049e, T050a | Direct `updateUser` bypass. The control is now fully specified at the database: a guard trigger on `auth.users` refuses a staff password change without an open intent, the change and session revocation share one transaction, the recovery session is age-limited, and closing rows and reconciliation are defined. Acceptance still needs gates G1 to G5 and PDN-F4-7-15. | Not closed; no thread resolution. Returns to HIGH if G1 or G2 fails, or if PDN-F4-7-15 is refused. |
| T-176 | Gate evidence (CodeRabbit tasks.md:176) | FIXED | tasks.md T048 | "Verify the tested merge base" added: at least one executed green `pull_request` run must test the final head merged with the current `main`, and the base is re-verified before acceptance (S36-R9). | Fixed in commit 0e9daefd. Reply with evidence, then resolve. |
| N-168a | Test coverage (review 5805324649 nitpick) | FIXED | tasks.md T049c | The five-request per-account limit is tested through an enabled public `/recover` route, direct and mixed-route, with the first five passing and the sixth and later refused. | Adopted in commit 0e9daefd. Reply with evidence (PR comment). |
| N-168b | Test coverage (review 5805324649 nitpick) | FIXED | tasks.md T038a, T049c | App-side delivery permission: an eligible staff address outside the permitted list receives no email, on the app route (T038a) and on a direct request (T049c). | Adopted in commit 0e9daefd. Reply with evidence (PR comment). |
| A-R4-1 | Ambiguity | MEDIUM | spec.md FR-025 (h); PDN-F4-7-12 | The user-visible result when the completed record fails after the change is an architect reading (signed-in state). It is not PO wording. | PO confirmation requested. Blocks only the completion response branch of T045. |
| A-R4-2 | Underspecification | MEDIUM | plan.md control B; PDN-F4-7-15 | The guard refuses staff password changes made outside the self-service flow (admin or hosted dashboard). No break-glass path is defined. | Confirm with the PO under PDN-F4-7-15. |
| A-R4-3 | Dependency | MEDIUM | spec.md FR-025 (a); PDN-F4-7-02; tasks.md T050a | `begin` eligibility depends on the eligible staff roles, which are still open. | PO decision needed before T050a (listed in T033). |
| A-R4-4 | Unverified feasibility | MEDIUM | plan.md gates G1 to G5; spec.md FR-030 controls C and D; PDN-F4-7-16 (conditional) | Local GoTrue behaviour is not verified: refusal of a deleted session's token (G3), the `recovery` amr method (G4), refresh-token cascade (G5), and guard refusal reaching the caller (G1, G2). | T050a starts with the spike. If G3 fails, PDN-F4-7-16 is raised. |
| A-R4-5 | Scope limit | MEDIUM | spec.md FR-030 control D; docs/13 ND-F4-3 | Control D covers the password path only. General session-lifetime enforcement stays the open ND-F4-3 blocker. | Recorded. Not a regression. |
| A-R4-6 | Historical text | LOW | spec.md "Architect ruling S35-R5", item T1 | The S35-R5 ruling still names T049 as the direct-Auth test. It is superseded by FR-025 (a) to (h), FR-030 and T049a to T049e. | Kept as history. |
| A-R4-7 | Dependency section | LOW | tasks.md "Dependencies & order" | New tasks T038a, T049a to T049e, T050a and T050b are not listed in the dependency block. Each carries its own gate. | Optional edit in a later round. |
| A-R4-8 | Expected | LOW | plan.md "Project Structure" | No file yet for the T050a migration. | Name set at T050a, unique across all origin refs. |

## Coverage summary

| Requirement | Task IDs | Notes |
|---|---|---|
| FR-001 to FR-015 | Merged tasks T001 to T032 | Mapped in traceability.md; not changed in this round. |
| FR-016 | T034, T043 | Blocked by T033 (PDN-F4-7-02). |
| FR-017, FR-018 | T035, T041, T043 | - |
| FR-019 | T038a, T041, T044 | Delivery permission covered on the app route (T038a). |
| FR-020, SC-011 | T046, T047 | Hosted change out of scope. |
| FR-021, SC-010 | T040, T044 | - |
| FR-022 | T037, T037a, T044a, T045 | - |
| FR-023 | T036, T044 | - |
| FR-024, SC-009 | T038, T038a, T044, T049c | Direct and mixed-route checks on an enabled public route. |
| FR-025 (a) to (h), SC-004 | T039, T044, T045, T049d, T050a | Intent state machine; guard in T050a. |
| FR-026 | T045 | ND-F4-3 blocker unchanged. |
| FR-027, FR-029, SC-014 | T042, T042b, T045 | Four strings approved; other copy under PDN-F4-7-06. |
| FR-028 | T034 to T042, T048 | - |
| FR-030 (controls A to D), SC-015 | T049a to T049e, T050a, T050b | Control A blocked (PDN-F4-7-14); control B needs PDN-F4-7-15. |
| SC-008, SC-013 | T041 | SC-013 time target PDN-F4-7-09 open. |
| SC-012 | T037, T049d | - |

## Verdict

- Open CRITICAL: 1 (C-R4-1, constitution process conflict, PO-owned). Spec-defect CRITICAL: 0. The brief's gate "0 CRITICAL" is therefore NOT met on a strict count, and the architect must decide whether a PO-owned constitution conflict counts against it.
- Open HIGH: 1 (NF-1). NF-2 is no longer HIGH, because its control is fully specified, but it stays open until G1 to G5 are proven.
- Open MEDIUM: 6 (NF-2 and A-R4-1 to A-R4-5). Open LOW: 3 (A-R4-6, A-R4-7, A-R4-8).
- Implementation blocker: ND-F4-7 implementation is BLOCKED. It needs: C-R4-1 resolved by the PO (independent critique, Sol Medium conflict); PDN-F4-7-14 and PDN-F4-7-15 answered; PDN-F4-7-02, -01, -03 and -04 answered; feasibility gates G1 to G5 passed or raised; copy approvals (PDN-F4-7-06); security review scheduled; and Analyze re-run afterwards.

## Metrics

- Requirements: 30 FRs, 15 SCs. Tasks: 59 (29 ticked, all pre-existing; none of the new tasks is ticked).
- Requirements with at least one task: 30 of 30 FRs and 15 of 15 SCs.
- Ambiguities open: 1 in the copy and eligibility area (PDN-F4-7-02, -06), plus A-R4-1.
- Duplications introduced: 0.
- Critical issues (strict count): 1 (C-R4-1).

## Next actions

- Resolve C-R4-1 (PO): the independent critique authorization conflicts with the constitution's Sol Medium rule, and the lane's model is outside the permitted tiers.
- Answer PDN-F4-7-14 and PDN-F4-7-15 (CONFLICTS with S35-PO-3 on the public `/recover` mechanism and the migration on `auth.users`).
- Confirm A-R4-1 (user-visible result after a failed completion record).
- Re-run Analyze after the answers and after the T050a feasibility spike.

Remediation edits were offered, not applied.
