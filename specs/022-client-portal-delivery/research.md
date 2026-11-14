# Research: Client Portal Delivery

## Existing contracts and decisions

- **Decision**: F19 owns Ready & Publish, `plan_deliveries`, initial activation, idempotency and client delivery projection. **Rationale**: Spec 019 is the approved source of truth. **Alternatives considered**: A second P4 delivery record or publish flow; rejected because it duplicates F19.
- **Decision**: F13 owns subscription state, entitlement and overdue/expiry restrictions. **Rationale**: Spec 013 and `contracts/lifecycle-and-entitlement.md` define the authoritative rules. **Alternatives considered**: Portal-computed status/expiry; rejected because it would duplicate lifecycle logic.
- **Decision**: F15 owns inbox events and read state. **Rationale**: Existing inbox/event contract and PR #58. P4 extends client reach only as required. **Alternatives considered**: A separate portal inbox; rejected.
- **Decision**: F17/F18 own export rendering/content and safety; P4 authorizes the client's selected revision. **Rationale**: Existing export tasks and nutrition selection rules. **Alternatives considered**: New export renderer; rejected.
- **Decision**: Directory search fields are name, email, phone and client code; facets use existing account/approval status, subscription status and responsible-trainer assignment state. **Rationale**: S55-PO-7, recorded in Clarifications; existing F11/F13/F20 data only, no new statuses.
- **Decision**: Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); unfinished work proceeds without a flag and flags are reconsidered before production. Authorization/RLS remain mandatory.

## Resolved unknowns

No unresolved implementation choice blocks design. Numeric performance goals and new status semantics are not specified and are not invented. Existing contracts remain authoritative where details are already owned.
