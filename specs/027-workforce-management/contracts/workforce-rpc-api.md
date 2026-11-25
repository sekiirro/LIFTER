# Contract — Workforce API/RPC

Logical interface contract for implementation planning. Route/function names are intentionally not assigned until the current app and database seams are verified. All operations derive the actor from authenticated server context. `workspace_id`, staff id and source ids are validated against that actor; caller-supplied role never grants access.

## Read operations

| Operation              | Input                                       | Allowed result                                                                                                                                                    | Authorization                                                                                                                                             |
| ---------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getTrainerCheckins`   | date range/status/page cursor               | client name/phone/platform username/Telegram username; schedule, successful submission, deadline, follow-up times; responsible Trainer; form and follow-up status | PO authorized workspace; Trainer current membership in that workspace. Trainer history includes all authorized Weekly Check-ins, not just assigned cases. |
| `getWorkforceReport`   | workspace/month/filter                      | full source attribution, ledger rows, formula and totals, refund fault decisions, strikes, history                                                                | PO only.                                                                                                                                                  |
| `getOwnCompensation`   | no target staff id; optional allowed period | caller's Basic Salary and own payroll records only                                                                                                                | Caller must map to a Trainer/Sales staff identity. WO has no payroll compensation by P7.                                                                  |
| `getSalesMonthlyTotal` | period                                      | own total only, after month-end and PO finalization                                                                                                               | Caller role Sales; caller staff id is server-derived; no caller-selected target.                                                                          |
| `getRollingStrikes`    | workspace/staff filter                      | 90-day count and 3/6/9 review thresholds                                                                                                                          | PO only.                                                                                                                                                  |

## Write operations

Every mutating operation includes an idempotency key and expected source/snapshot revision when applicable. Reusing a key with a different canonical request hash fails without writes.

| Operation                     | Authorized caller                               | Semantics                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `confirmCheckinFollowup`      | Authorized Trainer / PO in same workspace       | Validate successful submission; append actor/time/status transition; if >24h, ensure one −0.5 event; never erase prior Late state or earn points.                                               |
| `disputeCheckinFollowup`      | PO                                              | Append dispute/correction decision with actor/time and reason; retain prior follow-up evidence and any ledger reversal separately.                                                              |
| `postPointAdjustment`         | PO                                              | Append signed adjustment/deduction/reversal; include target staff, source/reason, period and actor; preserve original ledger facts.                                                             |
| `setBasicSalary`              | PO                                              | Append new compensation revision with exact money representation; reject stale expected revision; WO excluded. Currency/pay period pending P7-MCQ-02.                                           |
| `recordPayrollApproval`       | PO                                              | Append immutable approval for amount already paid externally; no gateway/payout and no implied deduction.                                                                                       |
| `recordMonthlyTransformation` | PO                                              | Append Trainer/month count and per-transformation points; retain prior values on correction.                                                                                                    |
| `recordMonthlyFeedback`       | PO                                              | Append positive/negative counts and per-Trainer point weights; defaults +1/−1; preserve settings/history.                                                                                       |
| `finalizeWorkforceMonth`      | PO                                              | Serialize all events/edits for the workspace-month, snapshot totals/source version and publish role-safe projections only after month-end. P7-MCQ-01 controls later corrections.                |
| F13 full-refund hook          | Existing F13 authorized refund transaction only | Ask PO staff-fault question in PO flow; append one Sales point reversal. If PO says yes, selected workspace staff and exact individual deduction values are PO-entered. No partial-refund path. |

## Standard failures

- `not_authenticated`, `not_permitted`, `not_found_or_not_permitted`, `stale_revision`, `idempotency_conflict`, `invalid_state`, `month_not_ended`, `not_finalized`.
- Errors contain no foreign client/staff existence, ledger content, or unauthorized total.
- A transaction failure writes neither business event, KPI event, audit event nor replay receipt partially.

## Atomicity and ordering

- F19 productivity reads the immutable source and uses a uniqueness guard; never modify source events.
- Plan delay/check-in delay, refund point reversal and corresponding PO decision are committed atomically with their idempotency marker and audit record.
- Check-in UI confirmation and automated threshold penalty converge on the same source key; duplicate clicks/retries cannot create multiple penalties.
- Finalization takes a serialization point for workspace/month; concurrent source event/PO edit either precedes the snapshot or is explicitly handled by P7-MCQ-01 after close. Two finalizers yield one current published version.
- Every request rechecks authorization after lock waits. PO concurrent edits with stale revision fail and require reload; original versions remain.
- Client closure/purge follows F26; P7 source references retain staff-point history without client PII and do not use audit events as business state.
