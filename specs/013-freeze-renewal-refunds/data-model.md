# F13 Logical Data Model

These are logical entities and invariants, not SQL definitions or authorization grants. F13 extends F12 forward-only.

| Entity | Ownership and key relationships | Invariants |
|---|---|---|
| Subscription purchase | Existing F12 tenant-scoped snapshot; linked predecessor/successor for renewal | Immutable terms, price, currency, duration, commission snapshot and issued obligations; unique expected renewal successor |
| Activation and entitlement interval | F12 activation seam plus F13-derived Cairo service interval | No initial service interval before P4 activation; immediate renewal recording is distinct from service start; expiry derives from duration, freeze contributions and valid successor coverage |
| Freeze facts | Workspace/client/subscription with immutable Apply, optional Stop/Remove and lifecycle revision | Duration 1–30 calendar days; no overlap, sequential allowed; Apply date included, Stop date excluded; Remove contribution zero without rewriting historical access |
| Installment obligation | Existing F12 immutable issued obligation | Renewal due-date anchor is Cairo recording date; freeze/service shifts do not alter due dates; cancellation uses separate unique fact |
| Collection/correction stream | Existing F12 payment event chain | Preserve exact full correction reversal, one-reversal uniqueness, recollection semantics and original rows |
| Refund operation | Aggregate receipt identity, actor/key, selected purchase, amount, expected revisions and refund date | PO-only, explicit external confirmation, positive amount, one selected purchase, no gateway, idempotent binding |
| Refund allocation event | Tenant-scoped immutable child of refund operation and source collection | Negative principal and commission; multiple operations may allocate against one source; FIFO; source and purchase cumulative caps; never uses correction reversal key |
| Obligation cancellation | Immutable fact linked to one unpaid obligation and refund operation | Unique per obligation; canceled obligations cannot be collected/corrected/reopened |
| Client deactivation/Auth state | Immutable refund-linked lifecycle fact and fail-closed login/session state | One deactivation; PO-1 block/revoke is atomic with first refund; later refunds do not reactivate or revoke anew |
| Operation receipt and audit | Existing private idempotency/audit mechanisms extended | Authorization before disclosure; exact replay is effect-free; safe fields only; failure rolls back all writes |

All tenant-owned entities require `workspace_id`, composite tenant-preserving FKs, forced default-deny RLS and narrowly granted SECURITY DEFINER operations. Financial rows are append-only for application roles. No table shape is finalized until merged F12 U4 is inspected.
