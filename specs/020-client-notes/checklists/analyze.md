# Spec Kit Analyze — F20 Client Notes

**Analysis date**: 2026-11-08 (round 2; re-run after the S37-PO-6 / S37-PO-7 encoding and after the CodeRabbit fixes on head d332c1f1; run after the last spec, plan, tasks, data-model, contracts and research edit)
**Inputs**: spec.md, plan.md, tasks.md, data-model.md, research.md, contracts/client-notes-api.md, contracts/client-notes-rls.md
**Scope**: Spec-only proposal. No code, SQL, migrations, or runtime work.

## Counts verified against the artifacts

- CN-MCQ IDs defined: 14 (01–14). Resolved by PO: 11 (01–07, 09–12). Pending PO: 3 (08, 13, 14).
- Functional requirements: 10 (FR-001..FR-010). Success criteria: 6 (SC-001..SC-006). Tasks: 13 (T001..T007, T008..T013; T008..T013 are test tasks).
- Stale-reference grep over the feature folder: no CN-MCQ ID marked resolved is still described as pending; every PENDING reference names CN-MCQ-08, -13 or -14.

## Findings

| Severity | Open count | Findings |
| --- | ---: | --- |
| CRITICAL | 0 | None. Authorization, tenant isolation and deny-by-default are explicit in FR-004/FR-005, the RLS contract and T006/T011. |
| HIGH | 0 | None. No unresolved high-severity ambiguity is encoded as settled behavior. |
| MEDIUM | 3 | PO decisions still open, tracked as PENDING-PO and not hidden as requirements: CN-MCQ-08 (exact AR/EN copy, blocks T005 and T013 string assertions); CN-MCQ-13 (audit retention, blocks only the retention setting); CN-MCQ-14 (stored body exact vs trimmed, blocks the stored-value form of T003 and T004 and the trailing-whitespace-at-limit case in T009). |
| LOW | 1 | The migration scan evidence in plan.md (highest `20261108021002` across 91 fetched refs) predates this round. No migration is proposed; a fresh all-origin scan is required before any implementation migration (T003). |

## CodeRabbit round on d332c1f1 (review 5818860138, CHANGES_REQUESTED, 3 findings)

- Author edit must require current authorization (active membership and an authorized role), not membership alone. Fixed in FR-003, Story 3, data-model invariant 3, contracts (api and rls), plan and T010. Valid.
- SC-002 must not require persistence for unauthorized creates. Fixed: SC-002 limited to authorized actors, unauthorized denial referenced to SC-001. Valid.
- The trailing-whitespace case at the 5,000-code-point limit depends on the unresolved trimming choice. Not guessed: the case is blocked by CN-MCQ-14 in spec.md, FR-002 and T009. Valid; remains a PO decision.

## Gate checklist

- [x] FRs have stable IDs and traceable tasks (FR-001..FR-010 each appear in at least one task or test task).
- [x] Success criteria are measurable (SC-001..SC-006).
- [x] Given/When/Then scenarios cover read, create, edit, delete, tenancy, role denial, Trainer cross-client access, restored membership and last save wins.
- [x] Current role/membership model and backend/RLS enforcement are described.
- [x] No SQL/migration version is invented.
- [x] Clarifications state that no open ambiguities are assumed resolved; the three pending questions are numbered (CN-MCQ-08, -13, -14).
- [x] UI follows the authority hierarchy; no icon, horizontal tab placement and text-only copy are bound to CN-MCQ-08 for strings.
- [x] PO binding text (S37-PO-6 and S37-PO-7) is quoted in spec.md Binding source quotations.

## Result

PASS for the spec-only PR gate: 0 open CRITICAL, 0 open HIGH findings. 3 MEDIUM items are PENDING-PO decisions and 1 LOW item is a rescan reminder. This result does not approve product decisions or authorize implementation.
