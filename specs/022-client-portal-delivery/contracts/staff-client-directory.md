# Staff Client Directory Contract

## Query

- Searchable fields: existing client name, email, phone and client code.
- Filter dimensions: existing account/approval status, subscription status and responsible-trainer assignment state.
- Indicators: new check-ins, pending food replacements and plans waiting for delivery.

## Authorization and behavior

- Apply existing F11/F13/F20 workspace and capability authorization server-side and at the database boundary.
- Return only clients in the staff member's authorized workspace(s); do not reveal foreign-workspace membership or existence.
- Read status and assignment values from existing owning contracts. Do not create statuses, assignment rules, bulk actions, or duplicate F11/F20 details/notes.
- Indicator links navigate to existing F15/F18/F19 work surfaces; this contract does not redefine their behavior.
