# Data Model: Subscription expiry notices and scoped client list

This feature extends existing records; it does not create a new inbox, subscription expiry source, or client-list entity.

## Existing records to extend

| Existing record        | Current source                                                  | Planned extension                                                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client notice          | `app_private.client_inbox_notices` (F22)                        | Add client expiry kind(s) for T-3, T-1, expiry; retain recipient-scoped revision-stage uniqueness and recipient-owned `dismissed_at`; notice is self-only.                                                                                           |
| Staff notice           | `app_private.staff_inbox_notices` (F23)                         | Add subscription T-3/expiry kinds; stage identity is `(subscription_id, effective_expiry_revision, stage)` and each recipient row is unique for that identity plus recipient. Keep delivered rows; do not persist client name or health information. |
| Subscription lifecycle | F12/F13 existing subscription and append-only lifecycle records | No new expiry column or duplicate status record. Read current F13 effective boundary and lifecycle state.                                                                                                                                            |
| Directory projection   | Existing staff client directory read                            | Add `expiring` (`now <= effective_expiry < now + 72 elapsed hours`) and `expired` (current F13 state) filters/indicators, bounded page and authorized count; keep source client/status and workspace fields.                                         |

## Keys, lifecycle, and constraints

- At most one committed row exists per authorized recipient, subscription, and logical stage identity; an insert conflict returns/recognizes the existing row.
- Reads, read marks, and dismiss marks belong to each recipient independently. A dismissal never deletes a row and cannot be applied by another recipient.
- Convert F13's `effective_end_exclusive` Cairo date to its first-existing Africa/Cairo instant using F13 FR-004's existing boundary rule; then compute T-3 by subtracting 72 elapsed hours. The projection remains the source and no timestamp is persisted as a competing fact.
- A stage is due only if an effective expiry is known and current F13 state permits notices. Future, active and frozen use their current projected end; when first eligible with under 72 hours remaining, send T-3 immediately once to applicable client/staff recipients; client T-1 remains tied to its 24-hour due instant; awaiting activation, refunded, deactivated, closed or purged clients do not receive new stages.
- Evaluator/enqueue must share the existing F13 subscription lifecycle lock order. After lock wait, sample evaluation time again, recompute projection and recheck current recipient authorization before insert, preventing stale lifecycle state or revoked recipients from being enqueued.
- Renewal/extension/freeze/date correction changes the projected expiry revision. Deduplicate by `(subscription, effective-expiry revision, stage)`; suppress obsolete due instants, recompute against the current projection, and keep already-delivered rows unchanged.
- If first eligible with less than 72 hours remaining, send T-3 immediately once to each applicable client/staff recipient. The expiring-list window is inclusive at now and exclusive at now + 72 elapsed hours.
- The client actor can read/mutate only their own client notice. Staff can read/mutate only their own notice while currently authorized for its workspace and source client. PO is platform-scoped. WO is workspace-scoped. All Trainers with current coaching access in the client workspace can receive notices and see that client's list row. Sales and other roles are denied.
- Forced RLS remains on private tables; API roles receive no direct table grant. Reads/mutations use narrow security-definer RPCs that enforce `auth.uid()`, role and current workspace/object authorization.
- Retention/purge reuses spec 026 and the existing purge allowlist/control. While the account is active, linked notice rows remain. After account closure/deletion, they use the approved 30-day relationship-end clock; tied open refund/dispute holds pause deletion and restart the 30 days on resolution. Notice audit rows follow their own 30-day-from-creation clock. No new cron or additional retention clock is introduced.

## Derived view

`expiry_bucket` is derived at query time from the current F13 projection and one sampled instant: `expiring` or `expired`. It is not persisted as a second status. `expired` means the current F13 projection is `expired`; `expiring` means `now <= effective_expiry < now + 72 elapsed hours`. Returned rows and counts use the same predicate. Trainer rows require current coaching access in the client workspace.

The shared staff notifications surface lives in the staff app shell and reads F15 form alerts via `read_form_alert_inbox` / `mark_form_alert_read` and `app/api/forms/alerts/route.ts`, plus F23 staff notices and expiry kinds via `read_staff_notices` / `mark_staff_notice_read`. It introduces no inbox, table, job, or Realtime publication. Copy remains PROPOSED pending per-screen approval.
