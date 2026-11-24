# Spec Kit Analyze — F26 Retention Purge Entry Point (DP-08)

**Analysis date**: 2026-11-24T02:54:10Z (re-run after the architect mapping S70-R47 requirement-text correction to the Q1 hold mapping; dated after spec.md, plan.md and tasks.md).
**Inputs**: `spec.md`, `plan.md`, `tasks.md`; authority addenda `S70-PO-10` (Q1–Q4 resolved) and architect mapping `S70-R47` (CHANGES REQUESTED — Q1 state mapping corrected).
**Scope**: Spec-only. No code, SQL, migration, scheduler activation, hosted change, or task tick.
**Authority**: S70-PO-1 item 3 (SHA-256 `D8E0EAF354F3923630BA38CD258EDD8E94DD63B86D9345405D40A520A790F20E`), S70-PO-3, S70-PO-4, S70-PO-5 (SHA-256 `FBE1F9186AD1B853890617EF4AAFCDE967C81C2518C466744EB1250C2697C957`), S70-PO-10 (`s70-po-10.verbatim.txt`, 2026-11-24T01:33:12Z), architect mapping S70-R47, docs/13 DP-01/02/06/08 and OP-01, BR-01/BR-02/BR-04, FN-03, docs/04 S70 entries and D-10.

## Verdict

Within the decided scope: **0 open CRITICAL, 0 open HIGH**. The 30-day value, both clock starts, the open-refund/dispute hold and restart, the disabled scheduler, the open backup gate, D-10 authorization, RLS, idempotency, dry-run/evidence and mutation evidence are all encoded in numbered FRs, measurable SCs and Given/When/Then scenarios. The four implementation-facing questions are **resolved by S70-PO-10** (all recommended options). Architect mapping **S70-R47** corrects only the persisted-state mapping for Q1 (refund hold scoped to the Auth-lockout outbox); it makes no new PO decision and does not reopen any decided retention rule. The concrete refund OPEN/RESOLVED value, the Q4 invoice-data object tables, the Q2 anonymize-vs-delete treatment and the Q3 audited SECURITY DEFINER audit path are encoded with file:line citations in spec.md, plan.md and the tasks. No PO-decision placeholder marker remains. No question is guessed. No user-visible copy is added. The spec-only gate is satisfied; implementation requires its own later approval.

## Re-Analyze trigger

Requirement text changed: architect review **S70-R47 = CHANGES REQUESTED (1 BLOCKING, data-loss/spec correctness)** required removing `public.subscriptions.status` from the refund hold, scoping any `public.jobs` row strictly to the refund lockout, and recording that no persisted dispute object exists. FR-004, Story 2 scenario 1, SC-002, the Clarifications Q1 row, plan.md (`Design` and `Hold and restart` slice) and tasks T004/T011 were updated accordingly, all labelled as architect mapping S70-R47. Analyze was re-run per S54-R6 / Spec Kit gate core §2. This analysis supersedes the 2026-11-24T02:02:54Z record.

## S70-R47 correction — recorded facts (architect mapping, not PO words)

| Item                          | Prior mapping (removed)                                                                  | S70-R47 corrected mapping                                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Refund hold source            | Three status objects treated as OPEN/RESOLVED                                            | Only `app_private.refund_auth_lockouts.status`: OPEN `pending`/`retry`, RESOLVED `succeeded`                                                                                                                                                                   | `20261103120000_refund_auth_lockout_hook.sql:16` — `check (status in ('pending','retry','succeeded'))`                                                                                        |
| Refund ledger                 | (implied status via `public.subscriptions.status`)                                       | `public.refund_operations` is atomic and has **no `status` column**; no other refund state holds a record                                                                                                                                                      | `20261103123000_f13_refund_ledger.sql:2-20`                                                                                                                                                   |
| `public.jobs`                 | `public.jobs.status` `pending`/`running` = OPEN, `done`/`dead` = RESOLVED (generic jobs) | Counts **only** for a job tied to the refund lockout; none exists — the lockout is driven by RPCs on the outbox, enqueued kinds are generic (`forms.alert`, `client.distribution`). Generic `public.jobs.status` MUST NOT be a hold predicate.                 | `20261103125000_f13_refund_operations.sql:370-408`; `20261027160000_jobs.sql:9`; `20261112022800_f15_alert_schedules.sql:222-223`; `20261124040000_f11_client_trainer_distribution.sql:75-76` |
| `public.subscriptions.status` | `awaiting_activation`/`future`/`active`/`frozen` = OPEN, `refunded`/`expired` = RESOLVED | **Removed from the hold.** Account-activity/entitlement projection governed by FR-002's account-active rule; `expired` is time passage, not a refund resolution.                                                                                               | `20261103124000_f13_entitlement.sql:6`                                                                                                                                                        |
| Disputes                      | Dispute states implied alongside refund states                                           | **No persisted dispute object exists in LIFTER** (`git grep -i dispute origin/main -- supabase/migrations` → no match). The dispute hold applies when a dispute object is introduced; until then only refund holds are enforceable. No dispute model invented. | verified on origin/main                                                                                                                                                                       |

## Counts verified against the artifacts

- Functional requirements: 12 (FR-001..FR-012). Success criteria: 10 (SC-001..SC-010).
- User stories: 4 (Story 1 eligibility, Story 2 hold/restart, Story 3 authz/idempotency/dry-run/evidence, Story 4 scheduler/backup). All scenarios are Given/When/Then.
- Tasks: 16 (T001 documentation; T002–T008 test tasks with named test files, all RED-first; T009–T015 implementation; T016 final gates). Task ticks: 0.
- Open PO decisions: **0**. Q1–Q4 are resolved by S70-PO-10 (Q1=A, Q2=B, Q3=A, Q4=A). S70-R47 is an architect mapping, not a PO decision.
- PO-decision placeholder markers: **0**.
- Named test files: `tests/unit/retention-purge-clocks.test.ts`, `tests/unit/retention-purge-idempotency.test.ts`, `tests/integration/retention-purge-eligibility.test.ts`, `tests/integration/retention-purge-hold-restart.test.ts`, `tests/integration/retention-purge-dryrun-evidence.test.ts`, `tests/integration/retention-purge-authz.test.ts`, `tests/integration/retention-purge-audit.test.ts`, `tests/integration/retention-purge-scheduler-disabled.test.ts`; existing regression `tests/unit/backup-retention.test.ts`.
- Slice size: each test + implementation pair is planned as a small RED→GREEN slice (~400 changed lines) with one FR cluster per slice.
- Concrete enumerations: refund OPEN/RESOLVED from `20261103120000_refund_auth_lockout_hook.sql:16` only (S70-R47); Q4 objects from `20261101120000_registration_approval_model.sql:94-125` and `20261103123000_f13_refund_ledger.sql:2-57`; Q3 immutability triggers from `20261027150000_audit_log.sql:29-41`.

## S70-PO-10 decision encoding (all four closed; Q1 scoped by S70-R47)

| Question             | Decision                                                                        | Concrete value/object encoded                                                                                                                                                     | Location                                          |
| -------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Q1 open states       | A — non-terminal open, terminal resolved; 30 days restart at resolution         | OPEN `pending`/`retry` (`refund_auth_lockouts.status`) only; RESOLVED `succeeded`; S70-R47 removes `subscriptions.status` and generic `jobs.status` and records no dispute object | FR-004, SC-002, Story 2 s1, plan, T004/T011       |
| Q2 deleted at day 30 | B — pseudonymize/anonymize immutable evidence, physically delete the rest       | ledger/refund/audit rows anonymized; all other in-scope rows physically deleted; DP-06 order preserved                                                                            | FR-001/FR-002/FR-011, Story 1 s5, plan, T007/T014 |
| Q3 audit deletion    | A — one narrow audited SECURITY DEFINER path, reviewed grants, records removals | sole exemption from `20261027150000_audit_log.sql:29-41` triggers; all other actors incl. `postgres` blocked                                                                      | FR-011, Story 1 s5, plan, T007/T014               |
| Q4 invoice data      | A — existing payment/receipt/refund projections; no new table                   | `public.payment_events`, `public.refund_operations`, `public.refund_allocation_events`, `public.subscription_obligation_cancellations`                                            | FR-001, plan, T003/T010                           |

## Cross-reference review

- FR-001/FR-002/FR-003 ↔ SC-001 ↔ T002/T003/T009/T010: 30 days, active-account retention, audit-from-creation and no-delete-inside-window are aligned; Q4 object list is consistent across FR-001, plan and T003/T010.
- FR-004 ↔ SC-002 ↔ T004/T010/T011: hold, no carry-over and restart from resolution are aligned; the S70-R47 OPEN/RESOLVED values (`pending`/`retry` → `succeeded`) are identical in spec.md FR-004, SC-002, Story 2 scenario 1, the Clarifications Q1 row, plan.md and T004/T011.
- FR-002 ↔ FR-004: `public.subscriptions.status` is excluded from the hold and attributed to FR-002's account-active rule (S70-R47), removing the prior contradiction.
- FR-005/FR-006 ↔ SC-006/SC-007 ↔ T008/T015: scheduler disabled and backup gate open are aligned with OP-01, BR-01/02/04 and FN-03.
- FR-007/FR-010 ↔ SC-003 ↔ T006/T013/T016: D-10 authorization and mutation evidence are aligned.
- FR-008/FR-009 ↔ SC-004/SC-005 ↔ T005/T012: dry-run and idempotency are aligned.
- FR-011 ↔ SC-001 ↔ T007/T014: audit clock from creation is aligned; Q2 anonymization and Q3 SECURITY DEFINER mechanism are consistent with the `20261027150000_audit_log.sql:29-41` trigger guard.
- FR-012 ↔ SC-010 ↔ T001/T016: spec-only scope and no task tick are aligned.

## Detection passes (read-only analysis)

- **Duplication**: the single refund state value is stated once per artifact as a citation of the same S70-R47 enumeration, not a conflicting duplicate. No finding.
- **Ambiguity**: no unresolved placeholder (PO-decision marker, TODO, TKTK, `???`) remains. "Open refund" is concretely defined by S70-R47 with a file:line value; "dispute" is explicitly recorded as having no persisted object. No finding.
- **Underspecification**: every task names its test file and FR/SC; T004/T011 carry the corrected state value and the exclusions. No finding.
- **Constitution alignment**: no conflict with a constitution MUST; Constitution VII preservation language is reconciled by Q2 (pseudonymize, not delete, legally required evidence). No finding.
- **Coverage gaps**: all FR-001..FR-012 and SC-001..SC-010 map to at least one task. No unmapped task. No finding.
- **Inconsistency**: terminology is consistent (OPEN/RESOLVED, pseudonymize, SECURITY DEFINER purge path, Q4 object tables). All prior subscription/generic-job/dispute-state mappings were removed in the S70-R47 pass. No finding.

## Findings

| Severity    | Open count | Findings                                                                                               |
| ----------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| CRITICAL    | 0          | None. S70-R47 BLOCKING data-loss/spec-correctness finding resolved in this round.                      |
| HIGH        | 0          | None.                                                                                                  |
| MEDIUM      | 0          | None.                                                                                                  |
| LOW         | 0          | None.                                                                                                  |
| PO decision | 0          | Q1–Q4 all resolved by S70-PO-10; S70-R47 is an architect mapping; no marker remains; no guess encoded. |

## Metrics

- Total requirements: 22 (12 FR + 10 SC). Total tasks: 16.
- Coverage % (requirements with ≥1 task): 100%.
- Ambiguity count: 0. Duplication count: 0. Critical issues count: 0.

## Next actions

No CRITICAL/HIGH/MEDIUM/LOW findings. The S70-R47 blocking correction is encoded consistently across spec.md, plan.md, tasks.md and this record. This spec-only PR is ready for its format/secrets gates and exact-head CI; implementation remains a separate later lane with its own RED-first commits, mutation evidence and task ticks. No remediation edits required.
