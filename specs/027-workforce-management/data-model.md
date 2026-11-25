# Data Model — P7 Workforce Management

This is a logical model, not an approved table/migration design. Existing F19, F15/F23, F10/F12, F13 and F26 records remain owned by their source features. Implementation must verify the exact current schema and avoid a duplicate source of truth.

## Invariants

1. Every tenant-owned P7 record includes `workspace_id`; same-workspace references use composite relations.
2. Source records are immutable. KPI corrections, reversals and deductions append new records; no update/delete path exists for point history.
3. Point values use exact signed base-10 numeric arithmetic (`+1`, `−0.5`); do not use binary floating-point or constrain PO-configured feedback/transformation increments without approval. The displayed formula is the S70-PO-16 formula.
4. Every generated event has a deterministic unique source key. Replayed identical requests return the same logical result; changed arguments under the same key fail.
5. Snapshots are immutable. A new revision never overwrites the earlier snapshot. Sales view derives only from the PO-finalized period and the caller's own staff identity.
6. No client PII or check-in answers are copied into KPI ledger entries. Retain minimal attribution required for staff totals, and unlink client identity under F26 retention. `audit_events` is not an alternate KPI ledger.
7. Payroll is an external-paid record, not a payment instruction or payout. Monetary fields must use exact minor units and currency; currency/period meaning is PENDING-PO (P7-MCQ-02).

## Logical entities

| Entity                               | Key fields                                                                                                                                                                          | Relationships / rules                                                                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KPI source reference                 | `workspace_id`, source domain/id, event kind, effective time, recorded time, source staff                                                                                           | References existing F19/F10/F12/F13/F15/F23 facts; source identity is not mutable. PII stays in source system.                                                                                                 |
| KPI ledger entry                     | `workspace_id`, entry id, staff id, category, signed exact numeric points, period key, source key/hash, source ref, actor id, reason code, created_at, supersedes/reverses entry id | Append-only. Positive/negative entries are distinct rows. One logical effect per deterministic source key; workspace-composite staff/source refs. PO-only entries require actor and approved reason text/code. |
| Follow-up transition                 | Existing form/check-in id, workspace/client, responsible Trainer, old/new status, event actor/time, submission/deadline time                                                        | Extend/use F15/F23 transition history; no replacement Forms table. Late event remains in history after Followed Up.                                                                                            |
| Monthly KPI snapshot                 | workspace, month, version, formula version, source watermark/refs, staff totals, calculated_at, finalized_by/at, supersedes version                                                 | Immutable; stores full PO detail separately from role projections. Finalized Sales total is not exposed until Cairo month-end. Post-close correction rule is pending MCQ-01.                                   |
| Sales month projection               | workspace, month, staff id, finalized snapshot version, own total, projection published_at                                                                                          | Read-only derived object. No formulas, client rows, categories, reasons, deductions or other staff ids in Sales response.                                                                                      |
| Compensation history                 | workspace, staff id, effective date/month, exact amount_minor, currency, salary unit, actor, revision/supersedes id, created_at                                                     | PO write only; salary amount unit/currency pending MCQ-02. Staff can read own row only. Immutable revisions.                                                                                                   |
| Payroll snapshot/approval            | workspace, period, staff id, compensation revision, exact gross inputs and authorized adjustments, exact net amount/currency, state, PO approver/time, correction reference         | Approval is evidence of external payment already made. WO excluded. No payout request, provider, or automatic salary deduction. Value semantics/cycle pending MCQ-02.                                          |
| Monthly transformation entry         | workspace, Trainer, month, count, exact points_per_transformation, derived points, PO actor/time, revision                                                                          | PO only; append correction/revision; preserve prior month value.                                                                                                                                               |
| Monthly feedback entry               | workspace, Trainer, month, positive count, negative count, exact positive/negative numeric weights, derived points, PO actor/time, revision                                         | Defaults +1/−1 points per response; PO can customize weights per Trainer; historical values retained.                                                                                                          |
| Strike event                         | workspace, staff id, event category/source, effective_at, actor/PO decision, source key                                                                                             | Human-review evidence; rolling 90-day projection at 3/6/9; no automatic consequence.                                                                                                                           |
| Staff departure/reassignment history | workspace, staff id, departure/access revoked time, client reassignment records, actor                                                                                              | Reuse existing access revocation and client assignment source; preserve former staff attribution and historical rows.                                                                                          |

## Derived point calculation

For staff `s`, workspace `w`, month `m`:

```text
NetPoints(w,s,m) = Σ earned_points
                  + Σ transformation_and_feedback_points
                  − Σ penalty_magnitudes
                  + Σ PO_adjustment_points
```

In storage, entries are signed, so implementation computes the sum of signed ledger entries once. Negative totals are valid. Required categories include F19 productivity, plan-delay penalty, check-in-delay penalty, Sales acquisition, refund reversal, PO deduction, transformation, feedback, and PO adjustment. A refund reversal references the original acquisition event and may occur once. Do not copy F19 events into this ledger as mutable rows; either calculate from immutable F19 plus separate entries or record a stable reference/award key that is unique.

## State and time

- `form_status`: Scheduled / Awaiting Client / Client Overdue / Submitted.
- `follow_up_status`: Pending / Followed Up / Late / Disputed.
- Preserve transitions and `Late` occurrence independently from current state.
- Period month is a Cairo calendar month. Store effective event time, source time and recorded time separately. Delayed follow-up threshold starts at successful submission time; `> 24h` is late (exact 24h is not late).
- Snapshot finalization can only be published after that calendar month ends. Sale disclosure is additionally conditional on the caller being the staff member represented by that row.
- Post-close correction policy: PENDING-PO MCQ-01. Basic Salary pay unit/currency: PENDING-PO MCQ-02.

## Integrity constraints to verify at implementation

- Unique `workspace + source_key`; idempotency receipt binds operation, workspace, staff/source and canonical argument hash.
- Cross-workspace FKs prohibited; staff identity must be an authorized current or historical member of that workspace as relevant to immutable attribution.
- Reversing/deduction entries reference an existing same-workspace source/entry and cannot reverse an already reversed effect.
- Monthly totals recompute from sources and ledger entries; snapshot version records inputs and formula.
- Race-safe finalization and PO edits serialize per workspace/month; check-in, refund and retry races create one logical entry.
- RLS/privileged functions expose no raw ledger rows to Sales. A projection must not permit joining back to clients or other staff.
- F26 purge must remove/unlink client-identifying values on schedule while preserving non-PII staff totals; audit pseudonymization/deletion remains separately governed.
