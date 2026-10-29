# F13 refund-ledger architecture

**Status:** Architecture proposal only; not implementation authorization. **Model/effort:** Luna High.

## Scope and source facts

This design extends F12 forward-only. It does not edit F12 migrations or claim that the planned F12 collection/correction RPC exists. The inspected F12 branch is `origin/012-registration-approval` at `7f2cc19249bc7b6b1a0199240694cb68e5d28a06`; its model migration allows `collection` and `correction_reversal`, uniquely constrains one successor per event and one `reverses_event_id`, and stores per-actor request receipts in `app_private.registration_operations`. The F12 payment-operations work is still unchecked U4 work at that source state.

F13 refund semantics supersede the one-reversal-per-collection shape. Refund allocations are separate immutable negative ledger events tied to a refund-operation header and a source collection. A correction continues using `reverses_event_id` and exact full reversal. A refund allocation does not use that unique field, and multiple allocations may refer to one source collection subject to the cumulative source and purchase caps below. Refunds are external cash actions; the LIFTER transaction only attests the completed refund.

## Proposed event and operation model

- Extend the existing operation receipt model for a `refund` operation with selected purchase, requested amount, expected subscription/purchase revision, canonical request hash, actor/key, immutable safe receipt, and aggregate refund identity. Preserve actor/request-key uniqueness across all F12/F13 operations.
- Because F12 `payment_events` is a per-obligation alternating collection/correction chain with one successor per row, do not force refund partials into that chain. Add immutable `refund_operations` headers and `refund_allocation_events` rows as a new event subtype in the same logical financial ledger. A header binds the PO actor/key, selected purchase, requested amount, expected revisions, refund date and aggregate receipt. Each allocation binds workspace, subscription, source collection event, refund operation, currency, negative principal delta, negative commission delta, Cairo refund `effective_on`, actor and recording timestamp. Financial readers union F12 payment events with these refund events.
- A refund header groups one user-confirmed amount and all its source allocations. Header amount is the sum of positive allocation principal magnitudes. Header/allocations and the F12 operation receipt have deferred composite foreign keys so no orphan or cross-workspace allocation can commit. Unique `(refund_operation_id, source_collection_event_id)` prevents duplicate allocations within one operation; there is intentionally no unique constraint on source collection across operations.
- Keep correction-chain `previous_event_id`, `reverses_event_id`, its one-reversal uniqueness, and exact correction validation for corrections. Refunds live in the separate immutable allocation-event subtype: do not append them as alternating correction-chain successors and do not make a partial refund look like an F12 correction.
- The first successful refund is terminal for client access under PO-1, regardless of partial/full amount. PO may subsequently record another partial refund against the same purchase's remaining collected balance; that write changes only the financial ledger and audit, and never reactivates the client. The selected purchase's remaining unpaid obligations become canceled facts; already collected amounts remain historical. When multiple paid purchases exist, the request must identify one purchase. Purchases remain financially independent: no automatic refund or shift affects another purchase, and PO-1 global deactivation applies; any other-purchase resolution is manual.
- Refund entry, allocations, cancellation facts, client deactivation fact/state, a durable idempotent Auth-lockout outbox row, audit and receipt are one transaction. Every table remains append-only/immutable to application roles, forced-RLS, postgres-owned, with default grants revoked. All public operations use hardened SECURITY DEFINER functions, empty `search_path`, qualified names, explicit owner and narrowly granted EXECUTE.

## Invariants with arguments and worked examples

### 1. Cumulative refund principal never exceeds actual unrefunded collections

For each source collection `c`, let `A_c` be its positive stored amount, `X_c` be the amount already corrected (either zero or the exact full amount under F12), and `R_c` be the sum of committed refund-allocation principal magnitudes. Its refundable residual is `max(0, A_c - X_c - R_c)`. For selected purchase `p`, let `B_p` be the sum of those residuals over its active collection tails. Under the subscription/purchase lock, a request amount `q` is accepted only when `0 < q <= B_p`; deterministic allocation rows must sum exactly to `q`. Deferred DB validation independently proves each `R_c <= A_c - X_c` and `sum(R_c) <= sum(A_c-X_c)` for the purchase. Correction and refund cannot both consume one source: correction is full and excludes its corrected event; subsequent recollection is a new collection source.

**Worked example:** collection A is 10,001, collection B is 20,000; B was previously corrected and recollected as B2 for 20,000. Active collected balance is 30,001, not 50,001. A partial refund of 12,000 allocates 10,001 to A and 1,999 to B2. The residual cap is 18,001. A second refund of 18,002 is rejected; 18,001 can commit, leaving cumulative refunds exactly 30,001. B's corrected original is never refundable, and no original row changes.

### 2. Commission reversal never exceeds stored commission

Allocate principal refunds to active collection sources in deterministic FIFO order: oldest `collected_on`, then installment sequence, then event UUID. For one source with original amount `A` and stored commission `C`, let cumulative refunded principal after this allocation be `R`. Define cumulative commission target `Q(R) = floor((2*C*R + A) / (2*A))` using exact wide integer arithmetic (round-half-up of `C*R/A`). The allocation's commission reversal magnitude is `Q(R_new)-Q(R_old)`. Since `Q` is monotone, `Q(0)=0`, `Q(A)=C`, each delta is nonnegative and cumulative reversal is exactly `Q(R) <= C`. The DB validator recomputes from immutable source and cumulative principal; it does not trust a caller-supplied commission number. The cash refund is principal only; commission is a separate internal ledger amount.

**Worked odd-amount example:** `A=10,001`, stored `C=3,333`. Refund 3,000: `Q(3,000)=1,000`. Refund another 3,000: `Q(6,000)=2,000`, so this operation reverses 1,000 commission. Refund the final 4,001: `Q(10,001)=3,333`, so it reverses 1,333. Deltas sum to 3,333 exactly, even though independent per-refund rounding could drift. Tiny-remainder example: `A=3, C=1`, cumulative principal 1, 2, 3 gives targets 0, 1, 1 and deltas 0, 1, 0; no sequence can reverse more than the stored unit.

### 3. Idempotency and request binding

Use F12's existing actor/request-key namespace, extended for the refund aggregate; do not add a parallel receipt table with a weaker uniqueness boundary. Canonical hash binds operation kind, actor, workspace, client, selected purchase, amount, currency, expected lifecycle/purchase and ledger revisions, confirmation, and schema version. Under the established operation-key advisory lock, authorization is rechecked before receipt lookup/disclosure. Exact authorized replay returns the stored receipt byte-for-byte and creates zero new rows/audit effects. Same actor/key with changed amount, target or confirmation returns `key_conflict` without disclosing the previous request. Different keys still serialize on the financial locks and recalculate the remaining balance.

**Worked example:** purchase residual is 5,000. Actor PO-7 submits key K for 2,000; operation allocates 2,000, records cumulative commission target and stores receipt R. This first partial refund deactivates the client immediately; the worker blocks GoTrue sign-in/refresh after applying the ban, while app/RPC data checks deny access from commit. A retry with K and the same canonical request returns R; principal remains 2,000 and one audit/operation exists. Reusing K for 2,001 returns `key_conflict`. A new, explicitly confirmed key K2 for 3,000 may consume the remaining balance while the client remains deactivated; K2 for 3,001 is rejected under lock. If an exact retry arrives after the actor is revoked, current authorization returns `not_permitted` before R is disclosed.

### 4. Lock ordering and F12 consistency

Use the F12 operation order verbatim: lock the client row first; then that client's subscriptions in stable ascending subscription UUID order; then each subscription's obligations in obligation sequence (subscription UUID order first); then its ledger tails/events. Lock/re-read current actor and membership authorization rows after target locks; take the F12 actor/request-key advisory transaction lock; then repeat the authorization check in fresh statements before receipt lookup/disclosure. Hold all locks through commit. Never acquire a subscription after holding a ledger row. Take fresh Cairo date/time after lock waits. A multi-purchase refund must pre-discover candidate IDs, lock all relevant subscription rows in stable UUID order, and verify that the locked set still matches; if not, retry as stale rather than acquire a lower-sorted lock late.

**Worked lock example:** two subscriptions have IDs `...0010` and `...0020`; one request refunds the first while another refunds the second and both may affect client-wide deactivation. Both take client C, then subscription `...0010`, then `...0020`, then obligations and ledger rows in the declared order. The request targeting only `...0020` cannot lock it before waiting for `...0010`; therefore the two requests cannot form a cycle through reversed subscription order. A correction/collection operation already follows client → subscription → obligation/ledger. If refund wins the shared locks, later correction/collection observes the refund terminal/deactivated state and is denied; if correction wins, refund recalculates the balance from its new committed chain.

## F12 correction interaction

- **Correction first, refund second:** correction writes the existing exact reversal, restoring that obligation to unpaid. The corrected collection is excluded. Any recollection is a new eligible collection tail. The refund's expected revision is stale if based on the pre-correction state; a fresh request recomputes cap and commission from active tails.
- **Refund first, correction second:** after the first refund transaction commits, the client is deactivated and the selected purchase is closed to collection/correction/recollection. Later PO partial refund operations may consume its remaining collected refund balance, but cannot reopen access or payment obligations. New correction, recollection, collection and approval/activation paths are rejected by amended guards. An exact previously committed correction retry returns its historic receipt only after current authorization; it cannot append a new event.
- **Refund versus collection:** both serialize under the same subscription/purchase lock as F12 collection. Collection first raises refundable balance and makes stale expected refund intent fail/re-preview. Refund first terminally prevents collection.
- Correction still reverses its original collection's full amount and stored commission exactly. F13 commission allocation applies only to partial refund principal and never changes correction math.

## Failure atomicity: refund, deactivation and Auth lockout

The refund DB transaction atomically writes refund facts, cancellation, client deactivation, audit, receipt, RET-1 start and one unique-per-client Auth-lockout outbox row. Failure of any transaction write aborts all of them. An Auth Admin failure occurs after commit: it does not roll back the refund; the same outbox row remains retryable with bounded exponential backoff, records success, and surfaces a persistent safe operational alert to PO/WO. Repeated refunds do not create another lockout row or reactivate the client. No direct writes to Supabase Auth-managed tables are allowed.

The server-side worker calls the supported Auth Admin updateUserById(userId, { ban_duration: '876000h' }). Stack C returned HTTP 200 for the ban; after it, fresh password sign-in returned HTTP 400 'User is banned', and refresh returned HTTP 400 'Invalid Refresh Token: User Banned'. The supported auth.admin.signOut call requires a user JWT; there is no documented user-id-only form. Global sign-out is unnecessary to deny refresh while the ban is active, and immediate access-token revocation is no longer required.

**OPEN - GoTrue commit-to-worker window:** before the first successful worker ban, direct GoTrue sign-in and refresh may succeed. An app/DB deactivation check blocks app/RPC client-data access after such issuance but cannot intercept GoTrue-only endpoints or prevent token issuance. This window conflicts with an immediate reading of the PO requirement to block new sign-ins and token refresh. The worker/outbox design cannot claim otherwise; return this precise timing conflict to PO. Existing JWTs remain valid only until natural expiry unless separately checked by the app/DB.

## Forward-only F12 amendment inventory

F13 implementation must add migrations after the latest merged F12/F14 migrations and amend integrated latest function bodies. Never edit merged F12 migrations.

1. **New refund event tables and `payment_events` integration:** add immutable refund operation headers and allocation events with composite workspace/purchase/source/operation FKs; allow many allocations to one source across distinct operations and prevent duplicate source allocation inside one operation. Keep F12's `reverses_event_id` uniqueness solely for corrections. Extend deferred cross-ledger validation and terminal/no-successor checks. Ensure allocation principal and commission values match source collection, currency and cumulative calculations.
2. **`registration_operations`:** allow refund aggregate shape/results and multi-allocation correspondence while retaining global actor/key uniqueness and existing F12 receipt compatibility.
3. **New refund/deactivation facts:** immutable refund header/allocation children; immutable client lifecycle/deactivation fact and any persisted state needed to keep `Active Clients` and authentication gates fail-closed; cancellation facts for unpaid obligations.
4. **`f12_guard_client_transition()`:** forward-amend the merged guard to permit only a refund-linked deactivation transition backed by the same in-transaction refund operation. Preserve approval transition checks and reject all unrelated client updates. Extend audit mapping for that transition.
5. **Auth lockout:** transactionally enqueue one idempotent outbox row with client deactivation; worker applies supported ban with retry/backoff and safe alert. Do not write Auth tables. The direct-GoTrue timing conflict is recorded above.
6. **`f12_guard_payment()`, `f12_validate_payment()` / `f12_check_payment()`:** keep F12 payment event kinds and correction actor/operation behavior intact; cross-check refund-allocation and deactivation facts; prohibit post-refund collection/correction/recollection independently of RPCs and request keys.
7. **Installment / subscription / activation guards:** make cancellation and refund terminal to collection, correction, renewal or activation as applicable; preserve immutable issued obligation facts and linked renewal semantics.
8. **Audit:** extend the latest integrated `audit_row_change()` body for refund, allocation, obligation cancellation and client deactivation with allow-listed fields only. Audit failures abort the transaction. Never copy arbitrary errors into audit/jobs fields.
9. **Readers and projections:** amend every F12 payment status, commission, workspace queue, eligibility, subscription, Active Clients and client-access reader to distinguish collected, corrected, partially refunded, fully refunded, canceled and deactivated; maintain role-safe columns and hide commissions from Sales/Trainer/client.
10. **Capability parity:** extend TypeScript `lib/auth/capabilities.ts` and integrated `app_private.role_has_capability()` with Trainer's already-existing `manage_freeze` and `record_payment` scopes as appropriate; no new capability. Test TS→SQL and SQL→TS parity, retaining F12 Sales approval removal and F14 `manage_branding`.

## Unmerged F12 U4 dependency inventory

At inspected F12 head `7f2cc19`, Phase 5 U4 includes unchecked tests/tasks T018–T022 and planned migration `20261101122000_payment_operations.sql` (T021). F13 depends on each of these planned contracts and must re-inspect the merged implementation before migration design:

- T018 collection/date/timing behavior: exact full obligation, Cairo date, no future collection, activation and earlier-installment gating.
- T019 correction behavior: exact stored principal/commission, original immutable, correction recording month and recollection semantics.
- T020 shared lock/replay races: distinct-key collection/correction/recollection serialization, receipt binding and revoked actor behavior.
- T021 `payment_operations` RPC/migration: actual collection/correction writers, their lock order and advisory-key position, authorization rechecks, operation rows, audit transaction and terminal-state extension point.
- T022 audit/rollback and reconciliation evidence: integrated event vocabulary, safe audit payload and exact failure rollback behavior.

If U4 is still unmerged, F13 cannot assume these runtime guarantees or safely implement the shared race contract. F13 must coordinate after U4 lands; it must not duplicate a parallel collection/correction writer. This document's invariant claims are target design arguments, not evidence that U4 or F13 code has passed them.

## Race fixtures required for implementation

| Fixture | Required outcome |
| --- | --- |
| Two distinct-key partial refunds each individually fit but together exceed purchase balance | Same purchase lock serializes; first commits, second recomputes and is rejected/stale; cumulative committed principal never exceeds collected residual. |
| Refund vs collection | Collection first requires refreshed expected balance; refund first denies collection after terminal deactivation. |
| Refund vs correction | Correction first excludes corrected collection and retains later recollection; refund first denies correction. One serial result, no original mutation. |
| Duplicate idempotency key | Exact authorized replay returns identical receipt and no extra effects; changed intent conflicts; revoked actor cannot read receipt. |
| Revoked actor waiting on financial lock | Recheck authorization after wait; deny with no target/receipt disclosure and no ledger/audit write. |
| Commission one-minor-unit and odd amount remainder | Cumulative formula is exact, monotone and capped at stored commission for every refund partition/order. |
| Refund transaction/deactivation/outbox failure | Whole transaction rolls back: no refund/allocation/cancellation/deactivation/audit/receipt/outbox persists. |
| Auth Admin failure after refund commit | Refund remains committed; same outbox row retries idempotently with backoff; persistent failure raises a safe alert. |
| Repeated refunds after deactivation | No reactivation and no duplicate per-client Auth-lockout row. |
| Multiple purchases, one refund | Explicit selected purchase required; client deactivation applies; other purchases remain financially independent and require manual resolution. |

## Remaining architecture confidence

- **OPEN - GoTrue lockout timing:** direct sign-in/refresh can succeed between refund commit and first successful worker ban; app/DB data denial cannot block GoTrue issuance. Return this exact conflict to PO.
- **DEPENDENCY GATE — F12 U4 integration shape:** final function signatures, receipt shape and advisory-lock placement must be verified against the F12 U4 merge before F13 chooses its forward amendment. No implementation against the unmerged contract.
