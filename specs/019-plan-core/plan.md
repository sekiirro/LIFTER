# Implementation Plan: Shared Plan Core

**Review status:** Carried from PR #26 (rounds 1–8); reviewed with implementation.

**Spec**: [spec.md](spec.md) | **Status**: Approved contract; implementation not started

## Summary

Implement one shared plan identity, draft/revision, readiness, first-delivery, activation and idempotency contract for F17/F18.

## Design

- Keep a stable plan root and Plan ID with private autosaved draft and append-only published revisions.
- Support silent draft autosave, Save as Draft, and one Ready & Publish action. Publish a revision to the same Plan ID.
- Add plan creation only to explicit Create New Plan flows.
- Track first workout and nutrition deliveries independently. A successful first delivery is durable and retry-safe even if the other plan is delivered on another day; no paired-publish transaction is required.
- When the second first delivery lands, check both durable records and create activation plus its single productivity unit in that delivery transaction. If activation cannot complete there, the same transaction must persist a durable outbox/retry item before the delivery commits. Process retries and exact delivery replays idempotently under the unique subscription-scoped activation guard; two delivery records can never be left without either activation or a durable retry. Later plan revisions cannot reactivate or add first-delivery credit. The contract is in `specs/012-registration-approval/data-model.md` and PC-FR-005.
- Canonical plan-root mutation order for F17/F18 writers: authorize -> lock the stable plan root -> check the idempotency ledger -> for an exact replay, recheck current actor authorization after lock waits before returning the stored result; otherwise lock draft or selection rows as applicable -> re-read expected revision/current published version -> recheck current actor authorization (staff membership/capability or client self-ownership, as applicable) -> validate/write and append one audit event. For explicit Create New Plan, when the root does not exist yet, acquire a transaction-scoped creation lock keyed by actor and operation identity, check the ledger, then create the root in that transaction. Operations on template roots lock the template identity before the ledger; template creation uses a deterministic creation lock until the root exists. Template load into a draft follows the plan-root order and reads an immutable template version.
- F17/F18 use the shared contract and domain-specific schemas/writers; do not add `publish_pair` or a required `initial_delivery` pair.

## Migration range

`20261106200000`-`20261106235959` inclusive, valid UTC times. F16 ends at `20261106195959`; no overlap.

## Dependencies and sequencing

F16 catalog contracts precede Plan Core; Plan Core precedes F17/F18 integration. F17 and F18 consume this contract by reference. P4 integrates delivery and client visibility against it.

## Deferred implementation detail

- P4 activation migration: implement the forward-only typed-link contract recorded in `specs/012-registration-approval/data-model.md`: leave both new typed links unset on legacy rows, require both on new activations, preserve legacy `delivery_event_id` readers, and do not rewrite or backfill existing rows. Tracked from CodeRabbit round 5.
- P4 first-delivery idempotency: in the owning P4 implementation PR, choose and name the ledger referenced by each `first_plan_deliveries` row (`app_private.registration_operations` or the shared `app_private.operation_keys`), then specify its FK, canonical request hash, replay result, and retention contract. Preserve independent delivery retries and exactly-once activation. Tracked from CodeRabbit round 6; see `specs/012-registration-approval/data-model.md`.
- P4 handoff implementation detail: choose the concrete outbox/retry table, columns, worker/retry trigger, and kind-specific composite-FK/check column shape that implements the contract in `specs/012-registration-approval/data-model.md`; retain same-transaction second-delivery activation check, durable retry fallback, idempotent replay, and cross-kind rejection. Tracked from round 7; no paired publish.
- REQUIRED before the Plan Core feature PR merges — **Bind each first delivery to its subscription and plan owner (Major; PR #26 round 9):** database constraints or delivery-RPC validation must bind each first-delivery row to the owning subscription and plan, derive/validate copied workspace/client/subscription identifiers from those relations, and reject cross-owner combinations with negative tests. Resolve in the Plan Core feature PR.

## Validation plan

Before implementation: tasks and clean analyze. Verify same-ID edits, draft invisibility, explicit-only creation, independent deliveries on different days, retries, concurrent first deliveries, exactly-once activation, and no reactivation/productivity credit on later edits. Run the repository's normal implementation gates only in the feature implementation lane.
