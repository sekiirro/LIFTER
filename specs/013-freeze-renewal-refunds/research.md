# F13 Research and Decisions

**Status**: Planning research; not implementation authorization. **Model/effort**: Luna High.

## Confirmed repository contracts

- F12 owns subscription snapshots, installment obligations, collections, exact correction reversals, operation receipts and the collection/correction writer. F13 extends these merged contracts without creating a competing payment writer.
- F12 U4 is merged on `origin/main` as PR #18 (`e3a2534`). Its final migration, RPC signatures, receipt shape, authorization rechecks, advisory-key lock position, audit rollback, lock order and race guarantees are recorded below from merged source.
- Historical research note: F14 was not merged when this note was written. S21 confirms F14 is now merged; F13 follows its migration chain through `20261102152000`, and T017 verifies the reconciled shared functions.
- The approved final PO decisions settle freeze duration/overlap/day counting, purchase independence, post-deactivation partial refunds and FIFO allocation. No policy branch remains open for those items.

## F12 merged contract and provisional F14 inventory (T001/T002)

**F12 is merged and verified:** PR #18 merge commit
`e3a2534e8de24f80016f42d809061ab2f2207fba` is an ancestor of `origin/main`; the current F13 branch
was merged with `origin/main` at `d4ae80258f31ab550d546355f0138a71b684c23e`. The U2–U5 contract
below was re-read from `origin/main`, not inferred from the pre-merge branch. **Historical S17 snapshot:** the fetched `origin/014-workspace-branding` tip was
`1c337e081b1eee3b5f4a4ec324df00366c0b8bbe` and contained migrations through
`20261102130000`; F14 was continuing with `manage_branding` and later migrations at that time. **S21:** F14 PR #25 is merged to main; its 34 migrations through `20261102152000` are present in the replayed set, and T017 parity/integration checks passed.

### F12 U2–U5 operation boundary

- U3 public RPCs in `20261101121000_registration_approval_operations.sql` are
  `registration_approve(request jsonb)`, `registration_reject(request jsonb)` and
  `registration_reconsider(request jsonb)`. U4 public RPCs in
  `20261101122000_payment_operations.sql` are `installment_collect(request jsonb)` and
  `collection_correct(request jsonb)`. Each delegates to a private operation function; the public
  wrappers are `SECURITY DEFINER`, owned by postgres, revoked from public/anon/service_role, and
  executable by authenticated. U4 additionally exposes no refund or renewal writer.
- Success is a wrapper object `{status:'ok', receipt:{...}}`. The U4 receipt contains `id`,
  `operation`, `workspace_id`, `client_id`, `subscription_id`, `obligation_id`, `event_id`,
  `installment_seq`, `revision`, `outcome`, string `amount_minor`, `currency`, nullable
  `collected_on`, and `recorded_at`. The immutable row in
  `app_private.registration_operations` stores actor + UUID `request_key`, operation, canonical
  version/hash, target/revision bindings and the complete `result_receipt`; `(actor_user_id,
  request_key)` is unique. U3 reject receipts use nullable purchase/event fields. Do not expose
  commission in a refund receipt.
- U4 canonical request keys are exact and operation-specific. Collection requires workspace/client,
  request key, subscription/obligation, expected installment sequence/revision/previous event,
  positive decimal-string expected amount, uppercase currency, ISO Cairo collection date and boolean
  `payment_confirmed`. Correction substitutes original event and `correction_confirmed`. U4 binds a
  fixed v1 JSON array (including actor operation and target/input fields) with SHA-256. Exact
  authorized replay returns the stored JSON result unchanged; same actor/key with changed operation,
  target or canonical args returns `key_conflict` without exposing the previous receipt.
- U3 locks client → subscriptions ordered by UUID → installments ordered by subscription/sequence/ID
  → payment events ordered by subscription/obligation/revision. U4 locks client → selected
  subscription → its obligations ordered by sequence/ID → its ledger events ordered by obligation/
  revision. Both then recheck locked authorization, take the actor/request-key advisory transaction
  lock, recheck authorization after any wait, and only then read the idempotency receipt. F13 must
  follow the integrated shared order and extend locks to all affected purchases/sources as its
  approved ledger design requires.
- U3/U4 authorization is checked before target/receipt disclosure and again under target locks and
  after request-key serialization. Actor role is share-locked; workspace membership is share-locked
  for non-PO staff. PO authorization also requires an actual workspace row. A revocation that wins
  before the post-wait check returns generic `not_permitted`; it cannot reveal a stored receipt.
- U3/U4 force all deferrable constraints immediate before returning both replay and new success.
  Their exception block returns only `{status:'unavailable'}`; the PL/pgSQL exception subtransaction
  rolls back business, audit, and receipt writes together. Existing event audit triggers write in the
  same transaction, so an audit/constraint failure prevents acknowledgment and commits none of the
  operation. U4 locks the shared rows before authorization/key lookup and rechecks stale expected
  revision/tail under those locks. This serializes competing updates; an exact retry is effect-free,
  a stale distinct request is recalculated/rejected, and changed-key intent cannot disclose the
  stored result.

### Latest observed shared migration bodies

- `app_private.role_has_capability(r public.staff_role, cap text)` is most recently replaced in
  F12 U2 `20261101120000_registration_approval_model.sql`: `record_refund` remains platform-owner
  only; `record_payment` and `manage_freeze` map to PO/WO/Sales; registration approval is PO/WO;
  unknown capabilities deny. F14's current branch does not replace it.
- `app_private.has_workspace_access(ws uuid, cap text default null)` remains the
  `20261027140000_access_capability_for_po.sql` body: requires authenticated identity, checks the
  capability when supplied, and allows a PO or a non-revoked workspace membership. This body is
  unchanged by observed F12 U2–U5 and F14 migrations.
- `app_private.audit_row_change()` is most recently extended in F12 U2
  `20261101120000_registration_approval_model.sql`, additive to F11. It audits client approval state
  transitions from a current-transaction/actor-matched registration decision and payment-event
  inserts (`payment.collected` / `payment.collection_corrected`) with workspace, client, subscription,
  obligation, event, installment/revision, amount/currency, collection/effective dates and recorded
  timestamp. The audit insert participates in the triggering transaction. No F12 U3/U4/U5 or current
  F14 migration redefines it.
- Latest inspected F12 guards are in U2 `20261101120000_registration_approval_model.sql` (U3
  redefines only `f12_guard_installment()` in `20261101121000_registration_approval_operations.sql`).
  `f12_guard_subscription()` locks the client, verifies current approval capability and that the new
  subscription snapshot matches the immutable issued registration link. The latest
  `f12_guard_installment()` requires an approval/reconsideration decision by the same actor in the
  current transaction and matching subscription creator/time. `f12_guard_decision()` locks the
  client, verifies expected state, actor, transaction/time and approval capability (PO-only for
  reconsideration). `f12_guard_payment()` locks the subscription and checks `recorded_by = auth.uid()`,
  timestamp bounds and current actor authorization. Deferred subscription/payment/decision validators
  independently check issued schedule totals, immutable approval graph, event-chain, amount,
  commission, currency, operation/actor binding and exact correction reversal. The latest
  `f12_guard_client_transition()` allows only an approval-state-only change backed by a same-xact,
  same-actor registration decision and current approval capability. It currently blocks other client
  updates, including refund deactivation; F13 requires a coordinated forward amendment, never an
  in-place edit.
- Historical F14 remote inventory observed during the original research was
  `20261102120000_workspace_branding_identities.sql`, `...1210000_workspace_branding_render_handles.sql`,
  `...1220000_workspace_branding_asset_resolve.sql`, `...1230000_workspace_branding_definer_owner.sql`,
  `...1240000_workspace_branding_validator_upload_binding.sql`,
  `...1250000_workspace_branding_validator_binding_acl.sql`, and
  `20261102130000_workspace_branding_remove_superseded_binding.sql`. The final migration removes the
  superseded validator binding role/path after the ACL replacement. These were unmerged predecessors at the time; S21 replayed the complete F14 chain through `20261102152000` before F13.

## Design decisions supported by sources

1. **Partial refund ledger**: separate immutable refund header and allocation rows; retain F12's unique `reverses_event_id` exclusively for exact corrections. Enforce per-source and per-purchase cumulative principal caps under the shared financial lock, with deferred validation as an independent integrity wall.
2. **Deterministic allocation and commission**: allocate oldest collection first by `collected_on`, installment sequence, then event UUID. Compute each source's cumulative commission target with exact integer round-half-up arithmetic; each new event records only the delta from the previous cumulative target.
3. **Locking/idempotency**: follow the F12 order: client, subscriptions in UUID order, obligations in subscription UUID/sequence order, ledger tails/events; then current authorization and request-key locking/rechecks exactly as the merged U4 contract specifies. Bind immutable receipts to actor, operation, target, expected revisions and canonical inputs.
4. **PO-1 updated**: the refund transaction writes the deactivation fact and a durable idempotent Auth-lockout outbox row together with refund/audit facts. A Supabase Custom Access Token Postgres hook synchronously checks that committed fact before JWT issuance and returns the safe error `account_unavailable` (HTTP 403), blocking both password sign-in and refresh while the Admin worker is unavailable. The server-side worker remains defense in depth and uses the supported Auth Admin ban API, with retry/backoff, completion state and a safe PO/WO alert after persistent failure. Deactivated clients are also denied app/RPC data even with a valid JWT. Existing JWTs may expire naturally. Stack C verified the hook grant boundary and staff exclusion.
5. **PO-1 follow-up (verbatim, PO session 13, 2026-10-30)**: "Claude, continue as planned. For PO-1, verify and report any window allowing new sign-ins or token refresh before background lockout completes. Existing JWT expiry is accepted, but new authentication must remain controlled. For F15 D1=B, prepare the constitutional amendment for my approval before implementation. Restore all dropped tests without weakening coverage. Continue parallel work and preserve merge gates."
6. **Capability parity**: preserve F12 Sales approval removal and F14 `manage_branding`; add/retain `manage_freeze` and `record_payment` role scope as approved; keep `record_refund` PO-only. Require the bidirectional parity check delivered by F12 before permission changes merge.
7. **Calendar rules**: use Cairo date arithmetic and zone-library first-valid-instant conversion. Never use fixed offsets. Freeze starts count, STOP day excluded, REMOVE reverses the extension subject to the specified delivered-access clamp. Renewal installments anchor to recording date and do not move with service shifts or Freeze.

## Supabase hook evidence

- Supabase documents the Custom Access Token hook as running before token issuance and lists `token_refresh` among authentication methods ([Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)). The Auth Hooks guide says it runs each time a new JWT is created, supports a Postgres function at `pg-functions://postgres/<schema>/<function>`, propagates hook errors to Auth, and recommends an invoker function with explicit grants instead of `SECURITY DEFINER` ([Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)). Local hook configuration uses `[auth.hook.custom_access_token]` ([Supabase CLI config](https://supabase.com/docs/guides/local-development/cli/config)).
- Supabase supports one Custom Access Token hook per project, so future claim customization must be composed into the existing function. The hook's error propagation is fail-closed for token issuance. Hosted projects require enabling the hook through dashboard configuration; validate that setup on a non-production hosted project first, and require PO approval for production enablement.
- The function uses `search_path=''`, default invoker security, and grants execute/table-column reads only to `supabase_auth_admin`; authenticated, anon, public and service_role have no hook execute permission. The policy allows only the hook role to read the internal deactivation key.
- Stack C result: a committed deactivation fact made password sign-in and refresh return HTTP 403 with body message `account_unavailable`; no access token was returned. The simulated worker failure remained retryable. A rolled-back fact left sign-in available and a staff user remained unaffected.
- Measured pre-hook window with a 1,000 ms worker pause: first sign-in/refresh probes at +1,005.366 ms both returned HTTP 200; Auth Admin ban succeeded at +1,118.289 ms; subsequent sign-in/refresh returned HTTP 400. With the hook, final full-suite probes at +5.379 ms returned HTTP 403 and no tokens; no successful issuance window remained.
- After the authorized migration rename and clean Stack C reset, the full integration run measured the first post-commit request at +4.411 ms; sign-in and refresh returned HTTP 403 while worker status was `retry_scheduled`. Allowed issuance window remained 0 ms at the request boundary.
- A deactivated client can still request a password-reset email or sign out/clear a local session; neither action by itself issues an authenticated session. Existing JWTs remain usable to their natural expiry, but application/RPC data checks reject the deactivated client. Supabase documents password-reset initiation separately from access-token issuance and states that access JWTs remain valid until expiry after sign-out ([resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [signOut](https://supabase.com/docs/reference/javascript/auth-signout)). These remaining actions do not conflict with the PO update, which accepts existing JWT expiry and requires new authentication to remain controlled.
- RED mutation evidence: replacing the deactivation branch with `if false` made the integration test fail because sign-in returned HTTP 200 instead of 403. Granting hook EXECUTE to `authenticated` made the catalog test fail because the role gained execute privilege. Both mutations were restored and C was reset before the green run.

## Unresolved technical gates (not policy decisions)

- PO-1 token issuance timing is closed by the tested Custom Access Token hook. The hook does not revoke already-issued JWTs; PO accepted their natural expiry.
- **F14 integration completed in S21**: the full 34-migration F14 chain through `20261102152000` replayed before F13; F12/F13/F14 shared-function and capability expectations passed T017.
- **Verified isolated stack — Stack C assigned**: F13 uses lifter-stack-c only (API 35421, DB 35422). Never use Stack A or B.
- **Retention — PRE-PRODUCTION BLOCKER**: technical feasibility across all recoverable copies including backups and applicable legal exceptions must be resolved before real client data/production.
