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


## Success criteria (approved S29-PO-5 / S30-PO-4 Q4)

### SC-001 - Stable plan identity and private drafts

**Success criterion:** For an existing plan, editing, saving a draft, and publishing retain its Plan ID; changes in a private draft are not client-visible before Ready & Publish succeeds, and publishing appends a revision to that same plan.

**Given/When/Then:** Given a published plan with Plan ID P, when authorized staff edit it and save the draft, then the plan remains P and the draft is not client-visible. When Ready & Publish succeeds, then the published revision is appended under P and the draft changes become visible through the published plan.

### SC-002 - Explicit creation only

**Success criterion:** Exactly one new Plan ID is created by an explicit Create New Plan action; edits, autosaves, Save as Draft, Ready & Publish, and retries create no additional plan.

**Given/When/Then:** Given an authorized actor and an existing plan, when the actor edits, autosaves, saves a draft, publishes, or retries any such operation, then no additional Plan ID is created. When the actor explicitly chooses Create New Plan from blank, a template, or an authorized existing plan, then exactly one new Plan ID is created.

### SC-003 - Independent first deliveries

**Success criterion:** The first workout and first nutrition plans can each be delivered successfully on separate days; the first successful delivery alone does not activate the subscription, and the second successful first delivery completes the two-delivery condition.

**Given/When/Then:** Given a subscription without either first delivery, when its first workout plan is successfully delivered, then that delivery remains durable and the subscription is not activated. When its first nutrition plan is successfully delivered on a later day, then both independent first-delivery records exist and the activation condition is met.

### SC-004 - Durable, idempotent activation

**Success criterion:** After both independent first deliveries succeed, activation and its single productivity unit complete exactly once, either with the second delivery or through a durable activation retry; concurrent, retried and exactly replayed deliveries yield one durable result per first plan and create no duplicate activations or productivity units.

**Given/When/Then:** Given both first-delivery records, when the second delivery succeeds and activation completes in that transaction, then one activation and one productivity unit exist. Given activation cannot complete with that delivery, when the delivery commits, then a durable activation retry exists. When retry or exact replay is processed, then activation eventually succeeds once and there is one productivity unit.

### SC-005 - Later revisions preserve activation state

**Success criterion:** Later edits and published revisions preserve immutable revision, authorship, and audit history and do not change subscription activation state or productivity credit.

**Given/When/Then:** Given a subscription activated after both first deliveries, when staff edit and publish a later revision, then the revision is appended with its authorship and audit evidence, while activation state and productivity credit remain unchanged.



## Clarifications

- S29-PO-5 answer "B" approved drafting measurable SCs and Given/When/Then for PC-FR-001..007 and PO S20 Message B, with PO approval required for exact wording before commit.
- S30-PO-4 Q4 answered verbatim: "A: Approve with my 2 changes (Recommended)". The accepted edits are the SC-004 addition of "concurrent" delivery outcomes and SC-005 use of "productivity credit"; exact accepted criteria and scenarios are recorded above.
- No open ambiguity remains in SC-001..SC-005. Existing implementation dependencies and unverified work remain tracked in `plan.md` and `tasks.md`; they are not requirement ambiguities.
