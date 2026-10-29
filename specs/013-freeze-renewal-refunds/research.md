# F13 Research and Decisions

**Status**: Planning research; not implementation authorization. **Model/effort**: Luna High.

## Confirmed repository contracts

- F12 owns subscription snapshots, installment obligations, collections, exact correction reversals, operation receipts and the collection/correction writer. F13 must extend these contracts after U4 merges, not create a competing payment writer.
- F12 U4 is a hard integration gate: re-read its final migration, RPC signatures, operation receipt shape, authorization rechecks, advisory-key lock position, audit rollback and lock order before final implementation design.
- F14 migrations already exist and additional F12/F14 work is planned. F13 migration timestamps must be later than every merged or unmerged F12/F14 migration at implementation time. Rebuild shared functions from the latest integrated bodies.
- The approved final PO decisions settle freeze duration/overlap/day counting, purchase independence, post-deactivation partial refunds and FIFO allocation. No policy branch remains open for those items.

## Design decisions supported by sources

1. **Partial refund ledger**: separate immutable refund header and allocation rows; retain F12's unique `reverses_event_id` exclusively for exact corrections. Enforce per-source and per-purchase cumulative principal caps under the shared financial lock, with deferred validation as an independent integrity wall.
2. **Deterministic allocation and commission**: allocate oldest collection first by `collected_on`, installment sequence, then event UUID. Compute each source's cumulative commission target with exact integer round-half-up arithmetic; each new event records only the delta from the previous cumulative target.
3. **Locking/idempotency**: follow the F12 order: client, subscriptions in UUID order, obligations in subscription UUID/sequence order, ledger tails/events; then current authorization and request-key locking/rechecks exactly as the merged U4 contract specifies. Bind immutable receipts to actor, operation, target, expected revisions and canonical inputs.
4. **PO-1**: first refund and client deactivation/login block/session revocation, refund facts, cancellation, audit and receipt must share one transaction. No outbox or post-commit revocation window is acceptable. The supported mechanism is unknown pending investigation.
5. **Capability parity**: preserve F12 Sales approval removal and F14 `manage_branding`; add/retain `manage_freeze` and `record_payment` role scope as approved; keep `record_refund` PO-only. Require the bidirectional parity check delivered by F12 before permission changes merge.
6. **Calendar rules**: use Cairo date arithmetic and zone-library first-valid-instant conversion. Never use fixed offsets. Freeze starts count, STOP day excluded, REMOVE reverses the extension subject to the specified delivered-access clamp. Renewal installments anchor to recording date and do not move with service shifts or Freeze.

## Unresolved technical gates (not policy decisions)

- **Auth transaction boundary — OPEN**: investigate on a verified isolated stack whether a supported primitive blocks future sign-in and revokes every current Auth session/refresh token within the refund DB transaction. If not proven, stop the refund slice and request a revised approved design; no Sol without explicit PO approval.
- **F12 U4 integration shape — DEPENDENCY GATE**: final RPC, locks and receipt integration are unknown until F12 U4 merges and is reviewed. Blocks refund, renewal/payment integration and any shared-function amendment.
- **Verified isolated stack — UNASSIGNED**: F13 may not use Stack A or Stack B. DB-dependent execution requires a newly verified isolated stack, not yet assigned.
- **Retention — PRE-PRODUCTION BLOCKER**: technical feasibility across all recoverable copies including backups and applicable legal exceptions must be resolved before real client data/production.
