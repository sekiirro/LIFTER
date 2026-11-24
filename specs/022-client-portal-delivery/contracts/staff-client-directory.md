# Staff Client Directory Contract

## Query

- Searchable fields: existing client name, email, phone and normalized username for authorized directory readers; client code is PO/WO-only (Platform Owner or Workspace Owner of that workspace).
- Filter dimensions: existing account/approval status and subscription status for authorized directory readers; responsible-trainer assignment state is PO/WO-only.
- Indicators: new check-ins, pending food replacements and plans waiting for delivery.
- Subscription status uses the separate staff labels (S57-PO-13). Rows carry the F13 state plus `refund_scope` for `refunded`; the Refunded filter matches full refunds only, and a partially refunded row shows no status label.

## Authorization and behavior

- Apply existing F11/F13/F20 workspace and capability authorization server-side and at the database boundary.
- Trainers and other non-owner staff receive no client-code or assignment-state visibility; a client-code search by them returns no clients. Username search remains available within each role's existing row visibility. The PO/WO restriction is repeated in the application and database.
- Return only clients in the staff member's authorized workspace(s); do not reveal foreign-workspace membership or existence.
- Read status and assignment values from existing owning contracts. Do not create statuses, assignment rules, bulk actions, or duplicate F11/F20 details/notes.
- Indicator links navigate to existing F15/F18/F19 work surfaces; this contract does not redefine their behavior.
