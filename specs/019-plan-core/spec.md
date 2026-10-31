# Feature Specification: Shared Plan Core (F19)

**Feature Branch**: `019-plan-core`
**Status**: Specified; PO S20 decisions approved; not implemented.
**Phase**: P4 shared delivery and client plan lifecycle

## Purpose

Define the one plan lifecycle and first-delivery contract consumed by F17 Workout Planner and F18 Nutrition Planner. This contract supersedes their v3 duplicated lifecycle text.

## User scenarios

### Edit and publish an existing plan

Authorized staff edit a published plan under the same Plan ID. Changes silently autosave to its private draft. Staff may choose Save as Draft or the single Ready & Publish action. A draft is never client-visible before publish. Publish adds an immutable revision to the existing plan and does not create another plan.

### Create another plan

Only explicit Create New Plan creates a plan. It may start blank, from a template, or from an existing authorized plan. Editing, autosaving, saving a draft, marking ready, publishing or retrying never creates a plan.

### Deliver first plans independently and activate once

The first workout and first nutrition plan may be delivered on different days. Each first delivery is secure, idempotent and concurrency-safe. Subscription activation happens exactly once after both first plans have been successfully delivered. Later edits or revisions never restart activation.

## Functional requirements

- **PC-FR-001** Each plan has one stable Plan ID, a private mutable draft, and immutable published revisions. Draft saves and publishes do not create a plan. (PO S20 Message B section 4)
- **PC-FR-002** Published plans remain editable under the same Plan ID. Editing silently autosaves to draft; provide Save as Draft and one Ready & Publish action. Draft edits remain invisible until publish. (PO S20 Message B section 4)
- **PC-FR-003** Only explicit Create New Plan creates a plan, from blank, template, or an existing plan the actor is authorized to use. (PO S20 Message B section 4)
- **PC-FR-004** Workout and nutrition first deliveries are independent and may succeed on different days. Do not require a paired-publish transaction or rollback of a successful first delivery when the other has not yet succeeded. (PO S20 Message B section 4; supersedes `initial_delivery`/`publish_pair` transaction contract)
- **PC-FR-005** Record first delivery idempotently and concurrency-safely. When the second independent first delivery succeeds, the same transaction MUST check the two durable delivery records and create activation plus its single productivity unit. If that activation work cannot complete with the delivery, commit the delivery only with a durable outbox/retry record; retries and exact replays use the subscription-scoped idempotency guard until activation succeeds exactly once. Both deliveries must therefore have either a committed activation or a durable activation retry. Later plan edits never restart activation. (PO S20 Message B section 4; handoff contract clarified in `specs/012-registration-approval/data-model.md`)
- **PC-FR-006** Preserve immutable revisions, authorship, audit and revision integrity while maintaining one user-visible plan identity. Authorization and database operations must be secure, idempotent and concurrency-safe. (PO S20 Message B section 4)
- **PC-FR-007** F17 and F18 consume this contract by reference and MUST NOT duplicate or redefine plan lifecycle or activation rules.

## Acceptance scenarios

1. Editing a published workout or nutrition plan retains the same Plan ID; its draft changes are invisible until Ready & Publish succeeds.
2. Save as Draft and publish retries never create another plan. Create New Plan creates exactly one new Plan ID.
3. Delivering the first workout plan on day one does not activate the subscription; delivering the first nutrition plan on a later day activates it exactly once.
4. Concurrent/retried independent deliveries yield one durable result per first plan; the second delivery's transaction activates once, or durably queues an idempotent activation retry if activation cannot complete in that transaction. No paired-publish transaction is required.
5. Later revisions do not change activation state or productivity credit.

## Scope and constraints

Feature-specific workout and nutrition document schemas, catalog snapshots, calculations, template content and exports remain owned by F17/F18/F16. Plan Core owns only shared plan identity, draft/revision lifecycle, first-delivery state, activation condition, audit/idempotency and concurrency contract.

## Source trace

PO S20 Message B section 4 and the S20 handoff section 0-S20-FINAL, REQUIRED NEXT SESSION RECONCILIATION item 1. These are binding overrides under DR-03.
