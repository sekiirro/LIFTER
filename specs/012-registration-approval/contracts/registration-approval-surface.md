# Contract: F12 staff operations and client status

**Status**: Proposed, 2026-10-29. [Model](../data-model.md), [plan](../plan.md) PA decisions and [handoffs](feature-handoffs.md) govern unresolved details. Names are proposed public API contracts for implementation review, not existing functions.

## Transport and two walls

Staff reads and Server Actions live under `/registration-approvals`, `/registration-approvals/[clientId]`, separate `/payments` and `/payments/[subscriptionId]` pages gated by record_payment for PO/WO/Sales. Sales cannot enter the approval queue/review. IDs alone never authorize access. Actions verify session with `getUser()`, load current actor, call app `authorize()` for target workspace/capability and explicit role restrictions, validate the allow-listed shape and framework same-origin/CSRF protection, then call one RPC using the same user's session client. No service-role financial writer or redirect parameter containing client PII. Responses are dynamic/no-store; generic errors never return database/provider diagnostics.

Database operations independently verify auth.uid(), an existing workspace and capability/role/scope. No target existence, stale state, receipt or commission is disclosed before permission checks. Lock client → subscription → obligation/ledger, then current actor/membership authorization rows; repeat authorization after waits in fresh statements using current locked tuple values. Keep those locks through commit. Reject target spoofing even when a caller bypasses the action.

Capability map: approve/reject = `approve_registration` and PO/WO; reconsider = approval plus PO; collection = `record_payment` and PO/WO/Sales; correction = PO and existing `record_refund` capability, scoped to this correction operation only. Sales approval is removed in TS and DB matrices. Commission reads additionally require PO/WO. All public functions are postgres-owned SECURITY DEFINER with `search_path=''`, fully qualified references, and EXECUTE only authenticated; internal helpers revoke default EXECUTE from all application roles. Base tables remain ungranted and forced RLS.

## Common mutation request

- `workspace_id`, `client_id`, `request_key`: required canonical UUIDs. workspace must correspond to target; it is not a trusted tenancy assertion.
- Money: canonical unsigned decimal strings for expected collection amount; rate/price/schedule are never caller input. Reject numeric JSON money, sign/fraction/exponent/overflow, unknown keys and mismatched snapshot currency/amount.
- `collected_on`: valid finite ISO `YYYY-MM-DD` date, no future versus fresh Cairo today after waits; no signup lower bound. Responsible staff, recorded_at and audit actor derive from signed actor/DB time.
- Full payment confirmation must be explicit true for collection/approval/reconsideration; false/missing creates nothing.
- Ledger operations name expected installment seq, expected stream revision and previous event ID (null for initial root). Requests never say only “next unpaid.” The exact amount shown in the UI is read-only, but the expected value is still validated on the server.
- Operation-key canonical encoding v1 hashes operation, workspace/client, expected state, subscription/obligation/original event IDs, installment seq, expected revision/predecessor, expected amount/currency, collection date, confirmation and rejection code in fixed ordered typed fields. Absent optional fields are explicit null, UUID/date/money are normalized once. Actor is bound from session. Reject fields not defined for that operation.

## Public RPC inventory

Each mutation takes a single operation-specific typed JSON request and returns the common result union. JSON is validated independently by the DB; it is not an escape for arbitrary columns.

| RPC / action adapter                                 | Request beyond common IDs/key                                                                                                                                                  | Successful result / effects                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `registration_approve` / `approveRegistration`       | expected_state=pending-approval, expected_installment_seq=1, expected_amount_minor, currency, collected_on, payment_confirmed=true                                             | approved receipt; subscription+obligations+first collection+decision+approval fact+audit atomic                       |
| `registration_reject` / `rejectRegistration`         | expected_state=pending-approval, reason_code from PA-approved catalog                                                                                                          | rejected receipt; decision/state/audit only                                                                           |
| `registration_reconsider` / `reconsiderRegistration` | expected_state=rejected, first-payment fields as approve                                                                                                                       | approved receipt with reconsider operation; same initial graph, PO only                                               |
| `installment_collect` / `recordInstallment`          | subscription_id, obligation_id, expected_installment_seq, expected_revision, expected_previous_event_id, expected_amount_minor, currency, collected_on, payment_confirmed=true | collection receipt; full obligation only; timing/order PA-F12-2                                                       |
| `collection_correct` / `correctCollection`           | subscription_id, obligation_id, original_event_id, expected_installment_seq, expected_revision, expected_previous_event_id, correction_confirmed=true                          | reversal receipt; exact negative stored amount/commission, derived unpaid; no supplied amount/date/method/reason text |

No rejection RPC is finalized until PA-F12-1 supplies values; no free-text fallback. No correction reporting-date behavior is implemented before PA-F12-4. Reconsideration is distinct from stale normal approval; no rejected→pending transition, link release or recovery change.

## Result shapes

Successful mutation returns only `{status:'ok', receipt:{id, operation, workspace_id, client_id, subscription_id, obligation_id, event_id, installment_seq, revision, outcome, amount_minor, currency, collected_on, recorded_at}}`. Not-applicable fields are null. `recorded_at` is DB recording time inside the transaction; success is acknowledged only after commit and no exact commit timestamp is asserted. `amount_minor` is a signed decimal string (negative on correction); outcome is approved/rejected/collected/reversed. Commission/rate, names/email/phone, tokens, hashes, raw arguments and arbitrary metadata are absent. Common success payload is equally safe for Sales and owners. Owner commission is fetched separately.

The DB stores the successful receipt and returns it unchanged for an exact authorized replay; no “replayed” flag, fresh timestamp or changed amount. It does not reflect current state after later correction; readers do. Receipt uniqueness is actor/key across all operations. Reuse by another actor is a different key namespace but cannot bypass financial uniqueness. Mismatched target/operation/arguments for the same actor/key fails; key conflicts do not expose the old request. Concurrent distinct-key collection against the same expected revision yields one success and one stale result, not collection of another installment.

| Failure shape                                          | Meaning / precedence                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `{status:'not_permitted'}`                             | unauthenticated/foreign/revoked/nonexistent or disallowed role; no target/receipt details                          |
| `{status:'invalid_input', fields:[allowedFieldCodes]}` | syntactic errors in allowed supplied fields only; no echoed values or existence information                        |
| `{status:'stale_state'}`                               | authorized target no longer has expected client state or ledger revision; exact authorized replay is checked first |
| `{status:'key_conflict'}`                              | authorized actor reuses key with changed canonical intent; no prior receipt details                                |
| `{status:'unavailable'}`                               | infrastructure/unexpected failure after rollback; generic translated retry text, no SQL/provider payload           |

Server Actions return these safe payloads using framework transport; do not add a target-existence HTTP distinction. Missing session uses the existing login flow with a safe token-free return path; direct RPC callers receive the denial/permission error normalized to not_permitted. Unauthorized targets cannot produce stale_state/key_conflict. Retain the exact request/key after uncertain outcomes; UI policy is PA-F12-9. Never report success before commit or replace an uncertain key automatically.

## Staff read inventory

All reads use app authorization and database scope/role checks. Page size defaults to DESIGN.md's 20; validate/cap technical request size and paginate all authorized results server-side, with stable created_at/id ordering. No bulk selection/action. Workspace IDs must be actual accessible workspaces; PO still needs real target workspace.

| Public reader                  | Inputs                                                  | Safe successful payload                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `registration_approval_queue`  | workspace_id, cursor, page_size, approved filter fields | status ok, items of client_id/name/signup_time/approval_state/offer-version-label/price_minor/currency, next_cursor; no commission/PII beyond required name  |
| `registration_approval_review` | workspace_id, client_id                                 | safe queue fields plus immutable schedule and expected first amount; allowed action flags are UI hints, not permission                                       |
| `workspace_payment_queue`      | workspace_id, cursor, page_size                         | record_payment-gated approved subscription/client IDs and required name, safe amounts/status and next_cursor; no pending registration data or commission     |
| `subscription_payment_status`  | workspace_id, client_id, subscription_id                | obligations, explicit seq/revision/tail IDs, full amounts/currency, active paid state, collection/correction dates/actor IDs, due_on nullable; no commission |
| `subscription_commission`      | workspace_id, subscription_id                           | PO/WO-only event_id/rate_bp/commission_minor strings with collection/correction correlation                                                                  |

Do not grant wildcard/embedded base reads to make these work. Verify raw PostgREST paths, embedding and direct RPCs separately. Generic not_permitted for unauthorized/foreign/nonexistent targets; no receipt projection from a read failure.

## Narrow client status

Proposed route `/account/status`, separate client route group; it does not call staff `requireActor()`. Middleware already checks authentication generally; page/action independently verifies session and self mapping, not URL identity. `client_self_status()` takes no inputs and returns `{status:'ok',approval_state:'pending-approval'|'approved'|'rejected'}` or generic not_permitted/unavailable. App `loadClientSelfStatus` and `authorizeClientAccess` are separate from staff authorize. No client ID/workspace/financial/contact fields are returned.

Only self-status is allowed while pending/rejected; approved status does not grant unrelated resources. Internal `client_has_access(workspace_id,client_id)` directly checks signed association and approved state for future client policies without recursive clients RLS. It is not browser-callable or a staff capability. Request memoization may dedup within one request, never across sessions/requests. Poll on visible authenticated status page and refresh on focus/manual action; cadence is a technical bounded setting and not a visibility SLA. UI exact wording/navigation remains PA-F12-6.

## Audit / event consistency

Client UPDATE trigger owns approved/rejected/reconsidered audit. Payment INSERT trigger owns collection/correction audit. Decision/receipt/approval-fact inserts do not duplicate these success events. All effects roll back on audit or deferred failure. Approval fact emission is exactly once for the initial successful approval, including PO reconsideration, and is governed by the [P2 contract](feature-handoffs.md). Denied operations leave no false success audit. F11 audit mappings remain intact.
