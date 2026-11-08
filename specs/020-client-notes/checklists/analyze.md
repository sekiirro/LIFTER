# Spec Kit Analyze — F20 Client Notes

**Analysis date**: 2026-11-08T23:02Z (round 5, after the architect rulings S38-R8 and S38-R9 were applied to spec.md, plan.md, tasks.md, data-model.md and research.md at 22:58–22:59Z; contracts checked, no change needed)
**Inputs**: spec.md, plan.md, tasks.md, data-model.md, research.md, contracts/client-notes-api.md, contracts/client-notes-rls.md
**Scope**: Spec-only proposal. No code, SQL, migrations, or runtime work.

## Verdict

**No open ambiguities.** CN-MCQ-01..14 are resolved by the PO. CN-MCQ-15 (DESIGN.md §11 UI values) was removed by architect ruling S38-R9 under S38-PO-3; its ID is not reused. The design-system reuse rule is recorded in spec.md FR-006, FR-007, SC-004 and SC-005, in tasks.md T005 and T013, and in the register (spec.md Clarifications item 8). Nothing else is open for this feature.

## Counts verified against the artifacts

- CN-MCQ IDs in the register: 14 (01–14), all RESOLVED. Open: 0. CN-MCQ-15 is removed (not in the register table; no live reference remains outside this record).
- Functional requirements: 10 (FR-001..FR-010). Success criteria: 6 (SC-001..SC-006). Tasks: 14 (T001..T014; T008..T014 are test tasks). Acceptance scenarios: Story 1 = 3, Story 2 = 4, Story 3 = 6.
- Stale-reference grep over the feature folder for `CN-MCQ-15`, `OPEN`, `open ambiguit` and `blocked by`: no live reference remains in spec, plan, tasks, data-model, research or contracts. Remaining hits are the removal notes and the historical round-4 record in this file.
- Contracts (`client-notes-api.md`, `client-notes-rls.md`): no reference to CN-MCQ-15 or DESIGN.md §11. No change needed.
- The approved copy table (spec.md Clarifications, rows 1–29) is unchanged from round 4 (29 rows; row 26 Arabic “صاحب الملاحظة غير متاح”; Western digits).

## Findings

| Severity | Open count | Findings |
| --- | ---: | --- |
| CRITICAL | 0 | None. Authorization, tenant isolation and deny-by-default are explicit in FR-004/FR-005, the RLS contract and T006/T011. |
| HIGH | 0 | None. |
| MEDIUM | 0 | None. The round-4 MEDIUM (CN-MCQ-15 open) is closed by S38-R9. |
| LOW | 1 | FR-006/FR-007 name the reusable components by family (textarea, button, dialog, toast, States). The repository has `components/ui/` with Button, ConfirmDialog, Field, Toast, States and Bidi; the textarea mapping is not verified in this spec-only round. **Not an ambiguity**: it is a check for the implementation task that uses the component (T005), under the existing design gate. No spec change needed. |

### Scope note (not an F20 ambiguity)

The audit retention period (DP-02 / ND-F5-1 / B4, `docs/13-production-readiness.md`) is an open pre-production decision for the whole app. CN-MCQ-13 (S37-PO-14) makes Client Notes follow the existing `public.audit_events` retention unchanged, so Client Notes behaviour does not depend on that decision. It is tracked outside this feature and is not counted here.

## Architect rulings applied in this round

- **S38-R8** (CodeRabbit thread `PRRT_kwDOVYgYQ861E1-8`, tasks.md dependency order): the finding that asked to let T014 be ticked while its tests are red is **not adopted**. A test task is ticked only after its tests execute and pass on the implementation head (constitution §3). Red runs are recorded as evidence with the box unticked. tasks.md now cites S38-R8 in the dependency-order paragraph. The thread gets a reply citing S38-R8 and is then resolved.
- **S38-R9** (CN-MCQ-15, DESIGN.md §11 UI values): removed as a PO question (S38-PO-3). The Client Notes UI reuses existing Design System components and values (DESIGN.md §6 tabs pattern; existing textarea, button, dialog, toast and States components; existing tokens and breakpoints). It introduces no new breakpoint, touch-size, focus or token value. A value that exists neither in DESIGN.md nor in an existing component becomes a PO question only when implementation needs it, under the frontend design gate.

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
| FR-007 states, copy, Bidi, no icon | T005, T013 |
| FR-008 ordering | T008 |
| FR-009 last write wins, local time | T004, T010, T013 |
| FR-010 audit | T004, T012 |
| SC-001..SC-006 | mapped in tasks.md coverage table |

Every FR and SC has at least one task. No task lacks a requirement mapping.

## Gate checklist (Spec Kit entry check, spec-only PR)

- [x] FRs have stable IDs and traceable tasks (FR-001..FR-010 each appear in tasks.md and in the coverage map).
- [x] Success criteria are measurable (SC-001..SC-006), each mapped to tasks in the coverage map.
- [x] Given/When/Then scenarios cover read, create (trim and boundary), edit (including overlapping saves and immutable columns), delete, tenancy, role denial, Trainer cross-client access, restored membership and last save wins.
- [x] Current role/membership model and backend/RLS enforcement are described.
- [x] No SQL/migration version is invented; the migration scan is not relied upon.
- [x] Clarifications: CN-MCQ-08 copy is recorded (rows 1–29, byte-exact); CN-MCQ-15 is removed by S38-R9; "No open ambiguities" is stated explicitly in spec.md (status line and Clarifications item 4), plan.md, tasks.md and data-model.md.
- [x] UI follows the authority hierarchy; no icon; horizontal tab placement; text-only copy is bound to the approved table; no new UI value is introduced.
- [x] PO binding text quoted byte-exact in spec.md: S37-PO-6, S37-PO-7, S37-PO-14, S37-PO-16 (Client Notes line) and S38-PO-2 (item 2).
- [x] Analyze dated after the last change to spec, plan, tasks, data-model, research and contracts (last artifact edit 2026-11-08T22:59Z; this analysis 23:02Z).

## Result

PASS for the spec-only PR gate: 0 open CRITICAL, 0 open HIGH, 0 open MEDIUM, 0 open ambiguities. One LOW item is an implementation-time check and not an ambiguity. This result does not approve product decisions and does not authorize implementation. Implementation still requires the separate implementation approval recorded in tasks.md.
