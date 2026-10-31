# Implementation Plan: Shared Plan Core

**Spec**: [spec.md](spec.md) | **Status**: Approved contract; implementation not started

## Summary

Implement one shared plan identity, draft/revision, readiness, first-delivery, activation and idempotency contract for F17/F18.

## Design

- Keep a stable plan root and Plan ID with private autosaved draft and append-only published revisions.
- Support silent draft autosave, Save as Draft, and one Ready & Publish action. Publish a revision to the same Plan ID.
- Add plan creation only to explicit Create New Plan flows.
- Track first workout and nutrition deliveries independently. A successful first delivery is durable and retry-safe even if the other plan is delivered on another day.
- Activate once after both first deliveries succeed. Serialize activation with a unique/idempotent subscription-scoped guard; later plan revisions cannot reactivate or add first-delivery credit.
- Canonical plan-root mutation order for F17/F18 writers: authorize -> lock the stable plan root -> check the idempotency ledger -> for an exact replay, recheck current actor authorization after lock waits before returning the stored result; otherwise lock draft or selection rows as applicable -> re-read expected revision/current published version -> recheck current actor authorization (staff membership/capability or client self-ownership, as applicable) -> validate/write and append one audit event. For explicit Create New Plan, when the root does not exist yet, acquire a transaction-scoped creation lock keyed by actor and operation identity, check the ledger, then create the root in that transaction. Operations on template roots lock the template identity before the ledger; template creation uses a deterministic creation lock until the root exists. Template load into a draft follows the plan-root order and reads an immutable template version.
- F17/F18 use the shared contract and domain-specific schemas/writers; do not add `publish_pair` or a required `initial_delivery` pair.

## Migration range

`20261106200000`-`20261106235959` inclusive, valid UTC times. F16 ends at `20261106195959`; no overlap.

## Dependencies and sequencing

F16 catalog contracts precede Plan Core; Plan Core precedes F17/F18 integration. F17 and F18 consume this contract by reference. P4 integrates delivery and client visibility against it.

## Deferred implementation detail

- P4 activation migration: in the owning Plan Core/P4 implementation PR, define forward-only nullability for the new typed delivery links on legacy `subscription_activations` rows, require both typed links for new activations, and specify what readers return for legacy rows. Do not rewrite or backfill existing rows. Tracked from CodeRabbit round 5; see the P4 forward extension in `specs/012-registration-approval/data-model.md`.

## Validation plan

Before implementation: tasks and clean analyze. Verify same-ID edits, draft invisibility, explicit-only creation, independent deliveries on different days, retries, concurrent first deliveries, exactly-once activation, and no reactivation/productivity credit on later edits. Run the repository's normal implementation gates only in the feature implementation lane.
