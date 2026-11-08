# Spec Kit Analyze — F20 Client Notes

**Analysis date**: 2026-11-08T23:21Z (round 5, re-run after (a) the architect rulings S38-R8 and S38-R9, (b) the in-round fix of CodeRabbit review 5820103675 on `c428158d` (exit protection), and (c) the in-round fix of CodeRabbit review 5820142764 on `e2b6a6e3` (revoked-membership scope); every spec, plan, tasks, contracts, data-model and research edit precedes this analysis)
**Inputs**: spec.md, plan.md, tasks.md, data-model.md, research.md, contracts/client-notes-api.md, contracts/client-notes-rls.md
**Scope**: Spec-only proposal. No code, SQL, migrations, or runtime work.

## Verdict

**Open ambiguity: 1 (CN-MCQ-16). "No open ambiguities" is NOT stated.** CN-MCQ-01..14 are resolved by the PO. CN-MCQ-15 (DESIGN.md §11 UI values) was removed by architect ruling S38-R9 under S38-PO-3. CN-MCQ-16 (exact copy and Save Draft decision for the unsaved-change exit warning, DESIGN.md §5 Q54) is a genuine PO decision. Its behaviour is encoded; its copy is not guessed. The implementation gate stays closed until CN-MCQ-16 is resolved.

## Counts verified against the artifacts

- CN-MCQ IDs in the register: 15 defined (01–14 and 16; CN-MCQ-15 removed, ID not reused). Resolved by PO: 14 (01–14). Open: 1 (CN-MCQ-16).
- Functional requirements: 10 (FR-001..FR-010). Success criteria: 6 (SC-001..SC-006). Tasks: 14 (T001..T014; T008..T014 are test tasks). Acceptance scenarios: Story 1 = 3, Story 2 = 5, Story 3 = 7.
- Stale-reference grep over the feature folder for `CN-MCQ-15`, `OPEN`, `open ambiguit` and `blocked by`: the only live open item is CN-MCQ-16. CN-MCQ-15 appears only in removal notes and historical records.
- Contracts (`client-notes-api.md`, `client-notes-rls.md`): no reference to CN-MCQ-15 or DESIGN.md §11, and no exit-protection copy. Changed in round 5 only for the revoked-membership wording (non-PO scope, review 5820142764). The API contract has no unsaved-change rule, which is a UI rule and does not belong there.
- Copy table (spec.md Clarifications, rows 1–29): unchanged from round 4 (29 rows; row 26 Arabic “صاحب الملاحظة غير متاح”; Western digits). It does not contain the exit-protection copy.

## Findings

| Severity | Open count | Findings |
| --- | ---: | --- |
| CRITICAL | 0 | None. Authorization, tenant isolation and deny-by-default are explicit in FR-004/FR-005, the RLS contract and T006/T011. |
| HIGH | 0 | None. |
| MEDIUM | 1 | **CN-MCQ-16** (OPEN, PO decision): exact bilingual copy for the unsaved-change exit warning (title, body, Stay and Discard labels) and whether Save Draft is offered (DESIGN.md §5, Q54, PO-approved session 14). The behaviour is encoded in FR-007, Story 2 scenario 5 and Story 3 scenario 7. Blocks only the exit-protection copy and its string assertions in T005 and T013. Not blocked: note create/edit, the rest of the copy, data, authorization. |
| LOW | 1 | FR-006/FR-007 name the reusable components by family (textarea, button, dialog, toast, States). The repository has `components/ui/` with Button, ConfirmDialog, Field, Toast, States and Bidi; the textarea mapping is not verified in this spec-only round. **Not an ambiguity**: it is a check for the implementation task that uses the component (T005), under the existing design gate. |

### Scope note (not an F20 ambiguity)

The audit retention period (DP-02 / ND-F5-1 / B4, `docs/13-production-readiness.md`) is an open pre-production decision for the whole app. CN-MCQ-13 (S37-PO-14) makes Client Notes follow the existing `public.audit_events` retention unchanged, so Client Notes behaviour does not depend on that decision. It is tracked outside this feature and is not counted here.

## Architect rulings and review findings applied in this round

- **S38-R8** (CodeRabbit thread `PRRT_kwDOVYgYQ861E1-8`, tasks.md dependency order): the finding that asked to let T014 be ticked while its tests are red is **not adopted**. A test task is ticked only after its tests execute and pass on the implementation head (constitution §3). Red runs are recorded as evidence with the box unticked. The thread was replied to citing S38-R8 and resolved.
- **S38-R9** (CN-MCQ-15, DESIGN.md §11 UI values): removed as a PO question (S38-PO-3). The Client Notes UI reuses existing Design System components and values (DESIGN.md §6 tabs pattern; existing textarea, button, dialog, toast and States components; existing tokens and breakpoints). It introduces no new breakpoint, touch-size, focus or token value. A value that exists neither in DESIGN.md nor in an existing component becomes a PO question only when implementation needs it, under the frontend design gate.
- **CodeRabbit review 5820142764 on `e2b6a6e3`** (CHANGES_REQUESTED, 1 inline finding on spec.md:98, Minor · Functional Correctness): **valid**. SC-001 denied revoked-membership cases for every actor, but the existing helper grants Platform Owner access without a membership check. Fixed in round 5 for SC-001, Story 3 scenario 4, both contracts, plan.md and T006 (non-PO scope). No new access decision.
- **CodeRabbit review 5820103675 on `c428158d`** (CHANGES_REQUESTED, 1 inline finding on spec.md:84, Minor · Functional Correctness): **valid**. FR-002 barred any copy outside the CN-MCQ-08 table, while DESIGN.md §5 (exit protection, Q54, PO-approved) requires Stay/Discard for unsaved changes. The spec did not encode the behaviour. Fixed in round 5: behaviour encoded in FR-007, Story 2 scenario 5, Story 3 scenario 7, SC-005, plan.md UI section and tasks.md T005/T013. The copy is not approved and is recorded as CN-MCQ-16 (PO decision; the reviewer's "obtain approval for bilingual copy" step is a PO action and remains open).

## Round-4 CodeRabbit history (kept for traceability)

- Review `5819883866` on `cdb89424`: 1 inline finding on tasks.md:51 (T014 ordering and the dependency gate). The gate part (T001 blocked) was fixed in `dd5a896f`. The T014 tick part is S38-R8 (not adopted).
- Review `5819936996` on `dd5a896f`: COMMENTED, empty body, one reply that the thread stays open for the architect ruling.

## Coverage map (FR / SC → tasks)

| Requirement | Tasks |
| --- | --- |
| FR-001 tab placement | T005, T013 |
| FR-002 body rule | T003, T004, T009, T013, T014 |
| FR-003 edit, no history | T003, T004, T010 |
| FR-004 role × action | T002, T006, T011 |
| FR-005 isolation, RLS | T003, T006, T011, T014 |
| FR-006 PO decisions, reuse rule | T001, T007 |
| FR-007 states, copy, Bidi, no icon, exit protection | T005, T013 (exit-protection copy blocked by CN-MCQ-16) |
| FR-008 ordering | T008 |
| FR-009 last write wins, local time | T004, T010, T013 |
| FR-010 audit | T004, T012 |
| SC-001..SC-006 | mapped in tasks.md coverage table |

Every FR and SC has at least one task. No task lacks a requirement mapping.

## Gate checklist (Spec Kit entry check, spec-only PR)

- [x] FRs have stable IDs and traceable tasks (FR-001..FR-010 each appear in tasks.md and in the coverage map).
- [x] Success criteria are measurable (SC-001..SC-006), each mapped to tasks in the coverage map.
- [x] Given/When/Then scenarios cover read, create (trim and boundary), edit (including overlapping saves and immutable columns), delete, tenancy, role denial, Trainer cross-client access, restored membership, last save wins and exit protection.
- [x] Current role/membership model and backend/RLS enforcement are described.
- [x] No SQL/migration version is invented; the migration scan is not relied upon.
- [ ] Clarifications: CN-MCQ-01..14 and CN-MCQ-08 copy (rows 1–29) recorded. **FAIL for "no open ambiguities": CN-MCQ-16 is open** (exit-protection copy and Save Draft). CN-MCQ-15 is removed by S38-R9.
- [x] UI follows the authority hierarchy; no icon; horizontal tab placement; text-only copy bound to the approved table; no new UI value introduced; exit-protection behaviour from DESIGN.md §5 encoded.
- [x] PO binding text quoted byte-exact in spec.md: S37-PO-6, S37-PO-7, S37-PO-14, S37-PO-16 (Client Notes line) and S38-PO-2 (item 2).
- [x] Analyze dated after the last change to spec, plan, tasks, data-model, research and contracts (last artifact edit before 2026-11-08T23:20Z; this analysis 23:21Z).
- [x] Revoked-membership scope matches the existing PO rule (FR-004; spec.md Clarifications item 2; `app_private.has_workspace_access` in `supabase/migrations/20261027140000_access_capability_for_po.sql`): SC-001, Story 3 scenario 4, the RLS and API contracts, plan.md and T006 now say non-PO revoked membership (review 5820142764).

## Result

PASS for the spec-only PR analysis gate: 0 open CRITICAL, 0 open HIGH. One MEDIUM item (CN-MCQ-16, OPEN) and one LOW implementation-time check. **Not "No open ambiguities":** CN-MCQ-16 is open and is a PO decision (copy). The implementation gate is closed until CN-MCQ-16 is resolved and Analyze is rerun. This result does not approve product decisions and does not authorize implementation.
