# Data Model: Client Portal Delivery

This feature composes existing tenant-scoped records and read projections and adds one persistent record: the client notice that extends the F15 in-app inbox to client recipients (S57-PO-10).

## New record

| Record                                             | Fields                                                                    | Constraints                                                                                                                                                                                                                                                                                                                                                                 | Ownership                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Client notice (`app_private.client_inbox_notices`) | id, workspace_id, client_id, notice_kind, source_key, created_at, read_at | Composite FK `(workspace_id, client_id)` to F11 clients; unique `(workspace_id, client_id, notice_kind, source_key)`; kinds: workout/nutrition delivered, subscription activated, workout/nutrition delivered and activated, spec 023 check-in reminder day-of and follow-up; IDs-only (no free text); only `read_at` may change, once; forced RLS, no API table privileges | P4; producers are the F19 hook and spec 023 through `app_private.f22_enqueue_client_notice` |

## Existing records/projections consumed

| Concept                      | Source of truth | Fields used by this feature                                                         | Ownership                                                    |
| ---------------------------- | --------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Client identity/account      | F11             | name, email, phone, client code, account/approval state, workspace, assignment      | F11                                                          |
| Subscription and entitlement | F13             | subscription status, end date, plan-access decision, responsible trainer assignment | F13                                                          |
| Plan delivery                | F19             | client, stable plan identity, kind, delivered published revision, idempotency state | F19                                                          |
| Published plan content       | F17/F18         | revision content; selected nutrition alternatives and computed totals               | F17/F18                                                      |
| Inbox event/read state       | F15             | approved event, recipient, safe payload, read state (staff rows unchanged)          | F15                                                          |
| Refund scope                 | F13             | per-obligation refund state: refunded principal vs latest collection amount         | F13 (read-only; full vs partial for the Refunded label)      |
| Client details/notes         | F20             | existing authorized detail surface                                                  | F20                                                          |
| Directory indicators         | F15/F18/F19     | new check-ins, pending food replacements, plans waiting for delivery                | Owning feature contracts; P4 links to existing work surfaces |

## Relationships and constraints

- Every query is scoped to authorized workspace membership and authenticated actor per existing contracts; no cross-workspace result can be inferred.
- A client projection contains only that client's delivered plans. Draft and foreign-client plans are excluded.
- Plan access is checked against F13 at each server read/export authorization decision.
- Search uses only the four approved identity fields; filters use the existing three state dimensions. No new status or assignment state is modeled.
- The client notice record is the only new table. No enums, lifecycle state transitions, statuses or ownership transfers are introduced; a partially refunded subscription keeps F13's `refunded` state and shows no status label (S57-PO-12; staff wording S57-PO-13).
