# Data Model: Client Portal Delivery

This feature adds no persistent domain entity. It composes existing tenant-scoped records and read projections.

## Existing records/projections consumed

| Concept                      | Source of truth | Fields used by this feature                                                         | Ownership                                                    |
| ---------------------------- | --------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Client identity/account      | F11             | name, email, phone, client code, account/approval state, workspace, assignment      | F11                                                          |
| Subscription and entitlement | F13             | subscription status, end date, plan-access decision, responsible trainer assignment | F13                                                          |
| Plan delivery                | F19             | client, stable plan identity, kind, delivered published revision, idempotency state | F19                                                          |
| Published plan content       | F17/F18         | revision content; selected nutrition alternatives and computed totals               | F17/F18                                                      |
| Inbox event/read state       | F15             | approved event, recipient, safe payload, read state                                 | F15                                                          |
| Client details/notes         | F20             | existing authorized detail surface                                                  | F20                                                          |
| Directory indicators         | F15/F18/F19     | new check-ins, pending food replacements, plans waiting for delivery                | Owning feature contracts; P4 links to existing work surfaces |

## Relationships and constraints

- Every query is scoped to authorized workspace membership and authenticated actor per existing contracts; no cross-workspace result can be inferred.
- A client projection contains only that client's delivered plans. Draft and foreign-client plans are excluded.
- Plan access is checked against F13 at each server read/export authorization decision.
- Search uses only the four approved identity fields; filters use the existing three state dimensions. No new status or assignment state is modeled.
- No new tables, enums, lifecycle state transitions, or ownership transfers are introduced.
