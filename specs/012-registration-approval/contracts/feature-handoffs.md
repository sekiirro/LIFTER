# Contract: F12 handoffs to P2, P4, F13 and stack B

**Status**: Proposed technical seam, 2026-10-29. Consumer features remain separate. [Plan approval register](../plan.md#plan-approval-items-for-the-po) records final PO decisions and Architect items.

## P2 — REQ-P2-01 registration approved

Durable fact v1: `{event_id, kind:'registration.approved', schema_version:1, workspace_id, client_id, subscription_id, approved_at}`. Emission is an immutable private row in the successful approval/reconsideration transaction with state, first collection and audit. Unique initial subscription/event identity prevents replay duplication. Failed/rejected operations emit none. No PII, form/template/selection/assignment data is included.

F12 owns atomic emission and durable retention. It does not start an unhandled worker or implement form behavior. P2 owns its scoped internal reader/consumer, delivery retry state, inbox dedup keyed by event_id and template/assignment prerequisites. P2 must consume previously committed facts as well as new ones; duplicate delivery must not create a second assignment. P2 must not expose the private event table as a general client reader.

REQ-P2-01 must be copied into P2 FRs: PO, WO or authorized Trainer selects the intake form; assignment follows approval and is presented on login, preserving mandatory Basic/Workout/Nutrition and tenant authorization. Trainer selection capability is explicitly a P2 decision. F12 contains no form engine, form selector, assignment UI or template stub. No functional assignment success is claimed until P2 supplies and verifies its consumer.

## P4 — atomic first plan-pair activation

F12 owns immutable subscription/obligations and an initially empty activation-fact seam; no public F12 writer activates subscriptions. Proposed future internal writer `record_initial_subscription_activation(workspace_id, subscription_id, delivery_event_id, activated_at)` is a P4 contract only, with no standalone EXECUTE grant in F12. P4 derives its arguments from the atomic initial workout+nutrition delivery, never a client/staff-supplied timestamp assertion. A later forward migration supplies the delivery-event FK and trigger/writer enforcement when its real entity exists.

P4 transaction must lock client → subscription → obligations/ledger in the F12 order before appending one activation fact, delivering both plans and creating one productivity unit. Any failure rolls them all back. Unique subscription activation permits safe replay, not a second start. Activation cannot be created from F12 approval, collection, queue rendering or a cron estimate.

Before that fact, due_on for installment n>=2 is undefined and later installment collection is denied. After activation, due_on = the Africa/Cairo activation calendar date + the exact issued offset days; payment is through that day's end, represented as the exclusive following Cairo midnight without hard-coded UTC offsets. Default remainder offset is 30 calendar days, not 720 elapsed hours or adding a calendar month. Preserve all custom schedules and second offsets other than 30 unchanged. First installment is upfront at approval even if its historical stored first offset is nonzero; preserve that raw value. Later collections/recollections require activation and all earlier obligations currently paid; early payment before due is permitted after activation. Correction of an earlier obligation restores it to unpaid without undoing later immutable events; subsequent new collection follows sequence again.

P4 owns overdue restrictions, notices, expiry and reporting; F12 does not claim these work because the seam exists. Future readers must distinguish unknown due date from not-yet-due or paid.

## F13 — full refund, renewal and freeze

F12 correction reversal records a mistaken collection entry; it is not a cash refund. It restores one obligation to unpaid and leaves client/subscription/approval unchanged. F13 full refund instead follows D-15: reverse all actually collected active revenue/commission exactly, cancel all unpaid obligations and end the subscription in one transaction, PO only. F13 must preserve all originals and use the same subscription serialization so collection cannot race a refund/cancellation. Do not reuse F12 correction as an incomplete refund action.

F13 adds reviewed kinds/facts/constraints forward; initial-only client uniqueness must not block its renewal records. Stored original commission is reversed, not recalculated at a changed rate or rounding rule. Freeze/renewal activation remains F13/P4 scope; no mutable ledger update seam is granted now.

## Stack B — future implementation execution

Inspected preparation: `infra-second-stack` revision `75d4a40def664f0a2cbbd836c593f235ef624e01`, documented in that branch's `docs/11-second-local-stack.md`. Project `lifter-stack-b`, service ports 25420–25429, explicit selector `LIFTER_SUPABASE_STACK=b`, ignored `.env.stack-b`, shared canonical `supabase/migrations` through the approved junction. Stack A is the default and remains F11-owned; never rely on default selection for F12 DB work.

AI-F12-1 recommends integrating the infrastructure after it lands by reviewed non-rebase merge of updated main into F12. Include the selector-aware integration harness and F11 provisioner, not config alone. Verify the e2e server receives B URLs/keys as well as the integration runner. Stop before opening any connection if selector is not b, env/config is absent, endpoint is non-loopback or ports do not match B. No fallback or credentials copied from A. Treat stack-B config and selected URLs as a checked tuple; do not log keys/status output.

U0 must record the landed infrastructure SHA and authorized provisioned B availability, including B-specific lock ownership. Future migrations/tests need that lock; A's lock neither authorizes nor protects B. Provisioning is separate work, not authorized by this plan-writing unit. The final 2026-10-29 source records B provisioning/start complete with isolation and 861/861 integration at short infrastructure SHA d498800. This checkout has not integrated or independently re-verified those changes; record the full landed SHA and ownership before future DB work. The current unit executes no stack command. CI uses isolated runner-local infrastructure and its own credentials, never the developer's A or B stack.

## Correction-month accounting boundary

F12 recording correction is effective on the Cairo date of its recording instant; its exact negative amount/commission is attributed to that correction month. Never restate or edit the original collection's recorded_at/collected_on/amount/commission. Receipt replay across month boundaries returns the original correction receipt, not a new effective date. F13 refunds remain a separate full-refund contract.

## Existing route boundary

F12 owns standalone status and bounded detection/navigation now; P2 owns only intake/assignment presentation. Recommend a server-checked `/` fallback until a real authorized P2 route exists. Root is already present and permits signed client role-null identities; it must not imply activation. Never redirect clients to staff approval/payment paths or a guessed future form route.
