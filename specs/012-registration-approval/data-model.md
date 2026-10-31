# Data Model: F12 — Approval, obligations, collections, and corrections

**Status**: Proposed design, 2026-10-29. No SQL, migration or table has been created by this planning unit. [Plan](plan.md) records final 2026-10-29 decisions and remaining Architect items. F11 baseline: `7a1350467cb9cbfd4a5e037d0b0324ecea255f4c`.

## Common rules

Every new table, including private operational tables, has ENABLE/FORCE RLS, postgres ownership, no PUBLIC/anon/authenticated/service_role table grants, and DELETE/TRUNCATE guards. Immutable rows additionally reject UPDATE. No application role receives direct financial INSERT/UPDATE/DELETE. Only explicit definer operations may write after independent signed-user authorization. All functions are schema-qualified, `search_path=''`, default EXECUTE revoked; authenticated receives only the public inventory in the [surface contract](contracts/registration-approval-surface.md).

Every tenant row carries `workspace_id` and `unique(workspace_id,id)`. Tenant child relationships use composite workspace keys, with additional subscription/obligation identities where needed to prevent a same-workspace wrong-parent relation. FKs use RESTRICT, never cascading financial deletion. Global Auth/staff references are actor identity references, not tenant substitutes. IDs UUID; audit/receipt timestamps immutable DB `timestamptz`; money bigint minor units, transported as exact decimal strings. Existing F11 identity/claim/admission/recovery rows remain untouched.

## Relationship map

```text
F11 client -> committed F10 link -> issued package version/schedule
    |                              |
    +-- initial subscription ------+ (copied immutable terms)
    |       +-- installment obligations
    |       |       +-- payment event chain (collection/reversal/collection)
    |       +-- registration approval fact -> future P2 consumer
    |       +-- activation fact <- future P4 atomic writer
    +-- registration decisions -> transition audit
private operation receipt -> decision/event/subscription result identities
```

## Existing clients: narrow state extension

Installed table: `public.clients` in `20261031121000_client_accounts_model.sql`. Widen pending-only check to `pending-approval`, `approved`, `rejected`. Replace only its `signup_no_update` trigger with a narrow transition guard. Everything except `approval_state` must compare unchanged, including id/workspace/Auth/email/phone/name/link/version/created_at. Existing insert/deferred checks and DELETE/TRUNCATE guards remain.

| Transition                  | Authorized actor                       | Required atomic records                                                                      |
| --------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| pending-approval → approved | PO/WO with approval capability/scope   | initial subscription, obligations, first collection, decision, audit, approval fact, receipt |
| pending-approval → rejected | PO/WO with approval capability/scope   | reason-coded decision, audit, receipt; zero subscription/financial rows                      |
| rejected → approved         | PO only, distinct reconsider operation | same initial purchase unit as approval plus reconsideration audit                            |
| Any other/no-op change      | None                                   | rejected; replay returns receipt without attempting UPDATE                                   |

Guard verifies a matching private decision inserted in this transaction by the current authorized actor, matching old/new states and client, and rechecks transition permissions. It must not trust a caller-set boolean GUC. Private decision insert authorization plus transaction identity bind the guarded UPDATE. A deferred check rejects a decision whose required client transition/related purchase did not complete. F11 signup INSERT still creates pending only.

## public.subscriptions

| Attribute                                | Meaning / integrity                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| id, workspace_id, client_id              | tenant identity; composite client FK                                       |
| kind                                     | `initial` in F12; future F13 expands it through forward migration          |
| registration_link_id, package_version_id | same issued binding as client, with tenant-composite correspondence        |
| price_minor, currency                    | exact positive issued price and inherited currency; caller cannot override |
| commission_rate_bp                       | immutable integer 0..10000 from issued snapshot                            |
| duration_days, duration_months           | copy F10 representation unchanged, including custom-day semantics          |
| created_by, created_at                   | signed staff actor and DB timestamp                                        |

Partial uniqueness on initial `(workspace_id,client_id)` prevents a second initial subscription without creating a permanent client-wide uniqueness rule that blocks F13 renewal. Initial insertion validates the exact committed client/link/version terms, not current availability or link lifetime. Snapshot immutability is enforced for all roles, including integrity probes. Awaiting activation is derived from absence of the activation fact; no approval-time `activated_at` is set.

## public.subscription_installments

Immutable attributes: id, workspace_id, subscription_id, seq (positive integer), amount_minor (positive bigint), currency (snapshot), issued_day_offset (nonnegative integer copied from F10), source kind (`issued_schedule` or `single_payment`). Unique subscription/seq, plus `(workspace_id,subscription_id,id)` for financial correspondence.

No F10 schedule rows produces one synthetic obligation: seq 1, full price, offset 0, source single_payment. Otherwise copy every issued row without changing amount, sequence or offset. Deferred validation checks sequence 1..n, no gaps, exact wide-numeric sum equal to subscription price, inherited currency, and increasing issued offsets for scheduled rows. No new schedule-count/business bound is invented. First collection is required at approval regardless of first issued offset. Do not persist a due date or mutable paid marker.

Installment 2+ due projection is undefined until P4 activation. For n>=2, due_on = Cairo activation date + its issued offset days, payable through Cairo day-end (exclusive next Cairo midnight). Default remainder offset is 30 calendar days; preserve all custom offsets, including second offsets other than 30. No normalization or hold of issued agreements. Later collections/recollections require activation and all earlier obligations currently paid; early payment after activation is allowed. A correction does not rewrite or unpay later events, but restores the earlier obligation and thus blocks new out-of-sequence collection until it is recollected.

## public.payment_events

All financial rows are immutable and append-only. One ledger carries collection and correction reversal; no method/reference/free-text column exists.

| Attribute                                        | Meaning / integrity                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| id, workspace_id, subscription_id, obligation_id | exact tenant/subscription/obligation correspondence                                                     |
| installment_seq                                  | matches obligation seq; explicit in operation/receipt                                                   |
| revision                                         | positive integer, contiguous within obligation stream                                                   |
| previous_event_id                                | null only for revision 1; otherwise preceding event in same obligation stream                           |
| kind                                             | `collection` or `correction_reversal`                                                                   |
| reverses_event_id                                | null for collection; same original collection as predecessor for correction                             |
| amount_minor                                     | positive full obligation amount for collection; exact negative original for correction                  |
| currency                                         | matches obligation and original on reversal                                                             |
| commission_minor                                 | collection Round Half Up result; reversal exact negative stored commission                              |
| collected_on                                     | required finite Cairo date for collection, no future; null on reversal                                  |
| effective_on                                     | collection: collected_on; correction: Cairo date of fresh correction recording time; no caller override |
| recorded_by, recorded_at                         | signed responsible staff identity and DB recording timestamp                                            |
| operation_id                                     | private receipt identity through a deferred composite relation                                          |

### Constraint-backed chain and active state

- Unique `(workspace_id,obligation_id,revision)` and unique root per obligation.
- Unique `(workspace_id,previous_event_id)` for non-null predecessors: at most one successor, independently of operation keys.
- Composite FK on predecessor includes workspace/subscription/obligation; it cannot reference an event in another stream. Revision must equal predecessor revision + 1. Root must be revision 1 and collection. Positive increasing revision prevents cycles.
- Alternation is collection → correction_reversal → collection. A correction must reference exactly its immediate active collection predecessor, and `reverses_event_id` is independently unique per workspace. Correction of a reversal, partial correction, multiple reversals, branching and cross-obligation references fail.
- Collection amount/currency must equal obligation, commission equals snapshot calculation. Reversal must negate original stored amount and commission exactly, regardless of current rate/date/rounding policy. Neither operation changes previous events.
- Deferred constraint trigger validates the complete chain and subscription totals at commit, independent of RPC entry and idempotency keys. Unique keys prevent concurrent branching; trigger validates cross-row truth. Integrity failure rolls back the entire request.

A derived paid-state query finds the stream tail (no successor). Collection tail = paid; correction tail or no event = unpaid. A later new collection uses the reversal tail as predecessor, advancing revision. No mutable `paid_event_id`, `is_paid`, or `reversed_at`. Index obligations by subscription/seq and events by obligation/revision and predecessor; evaluate plans later on stack B.

## app_private.registration_decisions

Immutable id, workspace_id, client_id, operation_id, actor_user_id, decision kind (`approve`, `reject`, `reconsider`), from_state, to_state, rejection_reason_code (reject only, sole value `registration_rejected`), transaction identity (`xid8`), recorded_at. Unique client/transaction transition, plus one decision per operation. No free-text reason, copied identity data, credential or payment field.

Insert validates current actor/current client state under lock. Guarded client UPDATE consumes the matching transaction's intent logically; no mutable consumed flag is needed. Deferred correspondence requires matching resulting state and purchase graph or zero purchase graph for rejection. Only client UPDATE audit emits the transition event; decision insertion must not duplicate it.

## app_private.registration_operations

Immutable id, workspace_id, actor_user_id, request_key UUID, canonical_version, operation kind, client_id, optional subscription/obligation/original-event identities, expected_installment_seq, expected_revision, expected_previous_event_id, canonical_args_hash (SHA-256 bytes), result_receipt JSON, recorded_at. Unique actor/request_key across all F12 operations; tenant-composite result FKs deferred where cycles arise within the atomic unit. No retention cleanup is invented while financial/audit retention is open.

Canonical input and safe result schema are in the surface contract. Receipt carries only IDs, outcome, immutable DB recording time (sampled inside the transaction; success is acknowledged only after commit) and role-safe amount/currency/date, never commission or PII. Actor is not a supplied argument. Authorization precedes lookup/disclosure. Exact replay returns identical stored result, including its original state/date even if the client/ledger has since changed; fresh readers supply current state separately. Changed key binding fails, not a second operation.

## app_private.registration_approval_events

Immutable id/event_id, workspace_id, client_id, subscription_id, schema_version=1, kind=`registration.approved`, approved_at. Composite client/subscription relations; unique initial subscription approval fact. Inserted only inside successful approve/reconsider. No form selection, PII, template ID or assignment row. No browser/service-role grants or public event-list endpoint in F12. P2 adds a separately reviewed internal consumer and delivery/inbox dedup; old events remain available for backfill.

## public.subscription_activations

F12 baseline: immutable id, workspace_id, subscription_id, activated_at and delivery_event_id, with unique workspace/subscription and composite subscription relation. This table has no public writer or standalone activation action. P4 extends it forward with `workout_delivery_id` and `nutrition_delivery_id` relations to first-delivery records; the baseline singular `delivery_event_id` is not evidence that both plans were delivered. The P4 forward migration adds `first_plan_deliveries` with one durable row per `(workspace_id, subscription_id, plan_kind)` (`workout` or `nutrition`), binding `client_id`, `plan_id`, immutable `plan_version_id`, `delivery_event_id`, and `delivered_at`. Each row references the existing idempotency ledger operation; unique constraints on subscription/kind and delivery event prevent duplicate first delivery. P4's delivery RPC commits one kind independently and is retry-safe. Its activation RPC serializes on the subscription, verifies exactly one successful workout row and one successful nutrition row for the same workspace/client/subscription, then inserts `subscription_activations` and the single subscription productivity unit in the same transaction. `activated_at` is recorded by the activation transaction after it verifies both successful first deliveries; it is not copied from either delivery timestamp. The activation row's two delivery FKs preserve both source-event relations; a unique workspace/subscription guard makes concurrent activation attempts return the existing activation. F12 internal due reader sees no rows until that integration.

Later due projection: first obligation is collected at approval; seq≥2 has no due date without activation. With activation, derive Cairo date + the exact issued offset, through that Cairo day-end; the 30-day default never overrides custom offsets. Do not set due date from signup, approval, request clock, or a cron placeholder. F13 cancellation/refund adds new events and shares subscription serialization; it cannot rewrite these snapshots.

## Reads, grants, and client helper

| Reader                | Gate                                         | Returned projection                                                                                                   |
| --------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Approval queue/review | approval capability + PO/WO + real workspace | required name, signup time, safe offer/version/price/schedule and state; no email/phone, raw token/hash or commission |
| Payment queue         | record_payment + PO/WO/Sales in scope        | approved subscription/client IDs and required name, safe amounts/status; no pending registration queue or commission  |
| Payment status        | record_payment + PO/WO/Sales in scope        | obligation exact amounts, collected/reversed totals, safe event IDs, dates and responsible staff IDs; no commission   |
| Commission reader     | explicit PO/WO scope                         | stored commission/rate as exact safe strings/integers; no foreign data                                                |
| Client self-status    | signed non-staff client association          | approval_state only, no target/workspace parameter                                                                    |

All readers return projections from qualified definer code, with no base grants, no embedding/wildcard path and no role widening. Default-deny RLS is tested independently through controlled rolled-back grants and role switching. Internal client-access helper directly looks up unique auth_user_id and state; no recursive policy query. It grants no staff membership or plan/storage permission.

## Audit inventory and invariants

Extend the complete latest `audit_row_change()` body (currently `20261031122000`) without losing any legacy branch. Client INSERT retains `client.signup_succeeded`; UPDATE adds exactly one `client.approved`, `client.rejected`, or `client.reconsidered`. Payment INSERT adds exactly one `payment.collected` or `payment.collection_corrected`. No event for no-op, denied, rolled-back or exact replay. PO/WO audit RLS remains unchanged.

New detail allow-list: client/subscription/obligation/event/decision IDs, from/to state, approved rejection reason code, installment sequence, ledger revision, amount_minor text, currency, collected/effective/recording dates. Omit commission from common details, and all PII/secrets/free text/RPC argument dumps. Responsible actor is audit actor_user_id. Audit insert failure aborts financial/decision/receipt/approval-fact writes.

Migration review must enumerate all tables/functions/triggers/grants and prove no unaudited client transition or financial insert, including direct integrity probes. Catalog checks include default function EXECUTE, service-role grants, view/RPC projections and guards at privileged UPDATE/DELETE/TRUNCATE. Constraint and audit verification are future execution obligations.

## Flexible F10 terms extension (F12-owned U1F)

Reuse existing `registration_link_installments` as the one immutable schedule source; upfront is row seq=1, total payment count is row count (recommend explicit UI label including upfront, AI-F12-2). Full-payment/no-schedule links still yield one upfront obligation. New default split has staff-chosen positive upfront and a positive remainder equal to price minus upfront, row 1 at approval and row 2 offset 30 from activation. A full-price upfront is count 1 with no zero remainder row. More than two payments require exact explicit amounts/offsets; no percentage or equal-split rule is inferred.

Proposed `issue_flexible_registration_link` wrapper accepts full row array plus explicit upfront/count and validates their correspondence, both capabilities and current issued price, then delegates to the installed atomic issuer. Existing row/total/immutability/RLS/audit rules remain. Add only a forward function/grant migration, no duplicate mutable payment-terms table and no update/backfill of old agreements. Custom offsets must remain supported under F10's existing increasing nonnegative integer rules. Preserve any legacy nonzero first offset byte-for-byte while interpreting seq1 as approval upfront, not an activation due date. New default first offset 0 is a constructor value, never a normalization rule.

Correction effective_on is sampled once from fresh recording time in Africa/Cairo within the reversal transaction; recorded_at uses that same instant. It is immutable and belongs to the correction month, even when the original collection month differs. Replays retain the original correction recorded_at/effective_on, including across a later month boundary. Original collected_on and effective_on are never changed.
