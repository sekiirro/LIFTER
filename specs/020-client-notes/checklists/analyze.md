# Spec Kit Analyze — F20 Client Notes

**Analysis date**: 2026-11-08 (round 3; re-run after the S37-PO-14 encoding of CN-MCQ-13 and CN-MCQ-14, and after the CodeRabbit finding on thread PRRT_kwDOVYgYQ861CveV; run after the last spec, plan, tasks, data-model, contracts and research edit)
**Inputs**: spec.md, plan.md, tasks.md, data-model.md, research.md, contracts/client-notes-api.md, contracts/client-notes-rls.md
**Scope**: Spec-only proposal. No code, SQL, migrations, or runtime work.

## Counts verified against the artifacts

- CN-MCQ IDs defined: 14 (01–14). Resolved by PO: 13 (01–07, 09–14). Pending PO: 1 (08).
- Functional requirements: 10 (FR-001..FR-010). Success criteria: 6 (SC-001..SC-006). Tasks: 14 (T001..T014; T008..T014 are test tasks).
- Stale-reference grep over the feature folder: every PENDING-PO reference that remains names CN-MCQ-08 (or is the generic "PENDING-PO MCQ" rule in FR-007). No resolved ID (CN-MCQ-13, CN-MCQ-14) is still described as pending. Tasks T003, T004 and T009 are no longer blocked by CN-MCQ-14.

## Findings

| Severity | Open count | Findings |
| --- | ---: | --- |
| CRITICAL | 0 | None. Authorization, tenant isolation and deny-by-default remain explicit in FR-004/FR-005, the RLS contract and T006/T011. |
| HIGH | 0 | None. No unresolved high-severity ambiguity is encoded as settled behavior. |
| MEDIUM | 1 | CN-MCQ-08 (exact AR/EN copy, PENDING-PO): blocks only T005 and the T013 string assertions. |
| LOW | 2 | (a) The migration scan evidence in plan.md (highest `20261108021002` across 91 fetched refs) predates this round. No migration is proposed; a fresh all-origin scan is required before any implementation migration (T003). (b) The approved CN-MCQ-14 text says "trim leading and trailing spaces"; the spec applies it to leading and trailing whitespace (FR-002), consistent with CN-MCQ-02. Non-blocking architect confirmation (spec.md Clarifications item 6). |

## Round 3 changes checked

- CN-MCQ-13 (S37-PO-14): Client Notes audit events inherit the existing `public.audit_events` retention unchanged. The existing policy source is cited (`supabase/migrations/20261027150000_audit_log.sql`, immutability triggers). The period itself remains an open pre-production decision (DP-02 / ND-F5-1 / B4); the spec states that Client Notes inherits and does not decide it. No retention setting is added (FR-010, T012).
- CN-MCQ-14 (S37-PO-14): trim leading and trailing whitespace, count the trimmed text against 5,000 Unicode code points, store the trimmed text, reject blank-after-trim. Encoded in FR-002, SC-002, Story 2 scenarios 1–3, data-model invariant 8, the RLS and API contracts, and T003, T004, T009, T014.
- CodeRabbit finding on PRRT_kwDOVYgYQ861CveV (trailing whitespace at the limit, "align the length rule with the pending trimming decision"): valid. Now resolved by CN-MCQ-14: 5,000 code points with trailing whitespace is accepted and stored as 5,000 code points (Story 2 scenario 3, RLS contract, T009, T014). The thread is resolved with this evidence.

## Gate checklist

- [x] FRs have stable IDs and traceable tasks (FR-001..FR-010 each appear in at least one task or test task).
- [x] Success criteria are measurable (SC-001..SC-006).
- [x] Given/When/Then scenarios cover read, create (including trim and boundary), edit, delete, tenancy, role denial, Trainer cross-client access, restored membership and last save wins.
- [x] Current role/membership model and backend/RLS enforcement are described.
- [x] No SQL/migration version is invented.
- [x] Clarifications state that no open ambiguities are assumed resolved; the one pending question is numbered (CN-MCQ-08), and the wording check is numbered (item 6).
- [x] UI follows the authority hierarchy; no icon, horizontal tab placement and text-only copy are bound to CN-MCQ-08 for strings.
- [x] PO binding text (S37-PO-6, S37-PO-7 and S37-PO-14) is quoted in spec.md Binding source quotations.

## Result

PASS for the spec-only PR gate: 0 open CRITICAL, 0 open HIGH findings. 1 MEDIUM item is a PENDING-PO copy decision (CN-MCQ-08); 2 LOW items are a rescan reminder and a non-blocking wording confirmation. This result does not approve product decisions or authorize implementation.
