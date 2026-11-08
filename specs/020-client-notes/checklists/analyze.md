# Spec Kit Analyze — F20 Client Notes

**Analysis date**: 2026-11-08 (round 2; run after the S37-PO-6 / S37-PO-7 encoding in spec.md, data-model.md, contracts/*, plan.md, research.md and tasks.md)
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
| MEDIUM | 3 | PO decisions still open, tracked as PENDING-PO and not hidden as requirements: CN-MCQ-08 (exact AR/EN copy, blocks T005 and T013 string assertions); CN-MCQ-13 (audit retention, blocks only the retention setting); CN-MCQ-14 (stored body exact vs trimmed, blocks the stored-value form of T003 and T004). |
| LOW | 1 | The migration scan evidence in plan.md (highest `20261108021002` across 91 fetched refs) predates this round. No migration is proposed; a fresh all-origin scan is required before any implementation migration (T003). |

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
