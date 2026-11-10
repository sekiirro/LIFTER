# Implementation Plan: F19 Shared Plan Core

**Scope:** Spec-only contract rebuild from `origin/main`. This plan describes later implementation sequencing; it authorizes no implementation in this PR.

## Design summary

Maintain one stable client-owned Plan ID, a private mutable draft with CAS, and immutable published revisions. The root is workspace/client scoped and becomes subscription-bound only through a `plan_deliveries` row. Ready & Publish binds to the client's resolved continuous subscription under F13-FR-037 and atomically appends one revision and one delivery row. Every published revision has a delivery row. All delivered plans are projected; no first-delivery omission filter exists. First workout and nutrition deliveries for an initial subscription activate once; at most one append-only productivity unit exists per eligible new client, and clients with an existing unit receive no duplicate. Platform Owner Override Activate is the approved exceptional path for an otherwise eligible initial subscription; it records no delivery row and awards a unit only when the client qualifies and has none. Renewal extends the existing subscription and records the operation without a second subscription row or additional unit.

F17/F18 retain ownership of content schemas. F16 `ExerciseSnapshotV2`, immutable food-version references, frozen non-video planner values, and live authorized Video semantics replace the V1 `CatalogSnapshotRef`. Copy creates independent destination content and does not copy ownership, audit, subscription, delivery, or Video.

## Data and transaction design

- Use one `plan_deliveries` table for every successful plan delivery. Derive the first workout/nutrition milestone from those rows; do not create `first_plan_deliveries` or another marker table.
- Forward-extend `subscription_activations` for new `plan_deliveries` and `po_override` source shapes with typed links to `plan_deliveries`. Preserve historical `activation_source='renewal'` rows and source IDs without reinterpretation; a write-path guard limits new writes to `plan_deliveries` and `po_override` while keeping legacy rows valid (S43-R9 Sol-8, architect technical ruling).
- Initial delivery, activation, any eligible first unit, receipt, and audit are one database transaction. Any failure rolls back the whole current delivery. No outbox/jobs fallback is allowed. Use a unique `(workspace_id, subscription_id)` activation guard and operation-key replay.
- Reuse F12 lock order: client → subscription → plan root → relevant content rows → operation ledger; for multi-plan copy lock sorted Plan IDs. Recheck authorization/current membership, current subscription, client state, assignment, and CAS values after waits. No lock-order inversion.
- Use RESTRICT/no-cascade references for author, plan, revision, delivery, activation, unit, and audit history. F11 deletion compatibility depends on pending PR #73; retain non-login author ID per pending F11 deletion policy.
- No migration version is reserved. The implementation lane scans all refs immediately before selecting a version and before committing/pushing a new migration.

## Cross-feature ownership and dependencies

1. **F16 first:** use `ExerciseSnapshotV2` and current immutable food versions; do not revive `CatalogSnapshotRef` V1. References: `specs/016-exercise-food-catalogs/spec.md` FR-020/026/027, SC-009/SC-011.
2. **F12/F13 seam:** preserve F12 client → subscription lock order and current authorization/replay contract; renewal extends the existing subscription and earns no additional client-level unit. S43-R8 specifies renewal and upgrade lifecycle+ledger events without a new activation row. References: `specs/012-registration-approval/plan.md` lock-order section and `specs/013-freeze-renewal-refunds/spec.md` S22-PO-5/FR-013.
3. **F11 pending:** coordinate restrictive author references with open PR #73 FR-018/020/027/028 and S41-PO-11. Retain the deleted trainer non-login account ID under its deletion policy; PR #73 is pending, not a merged fact.
4. **F17/F18 consume:** update workout/nutrition planners to use the shared lifecycle and content references, without duplicating lifecycle/activation rules.
5. **P7 consumes:** read the append-only F19 productivity unit; P7 remains owner of KPI/payroll behavior.

## Sequencing and validation

1. Encode F19-MCQ-15/16, S42-PO-6, and S43-PO-5 items 1 and 7; encode S43-PO-5/6 decisions for S43-F19-MCQ-1..5. Ready & Publish fails closed on missing eligibility, unresolved legacy chains, or unexpected continuity violation. F13-FR-037 and the deployed F13 renewal-continuity change are prerequisites to enabling F19 delivery.
2. Implement roots/drafts/revisions and authorized CAS writes (FR-001, FR-009, FR-010, FR-012).
3. Implement the single delivery table, delivery projection, and copy contracts (FR-002, FR-003, FR-008, FR-013).
4. Implement automatic activation and unit transaction plus PO override (FR-004, FR-006, FR-007, FR-014); renewal mutates the existing subscription (FR-005). Award at most one unit per client. If unassigned, credit completing delivery Trainer publisher; refuse completion if publisher is not a Trainer. Already-active Override is rejected with not_permitted and no writes or changes.
5. Integrate client expiry/access and F17/F18/F16 consumers (FR-008, FR-011, FR-013).
6. Require real-DB integration tests for durability, rollback, idempotency replay, concurrency, CAS, cross-tenant denial, activation uniqueness, override recipient, in-place renewal and once-per-client unit, and deletion RESTRICT. Static and mocked tests never count as persistence evidence.

## Risks and blocked decisions

- S43-F19-MCQ-1..6 are resolved by S43-PO-5/6 and architect mapping (S43-R8); see F13-FR-040, F13-FR-041 and F13-FR-037.
- S42-PO-6: informational expiry page title/body only; no buttons or actions.
- F19-MCQ-15: already-active Override is rejected with `not_permitted`; nothing is written or changed.
- F19-MCQ-16: auto-bind the sole resolved eligible subscription; no chooser. Delivery for unresolved legacy overlap remains blocked under MCQ-17.
- F19-MCQ-17: legacy overlapping predecessor/successor chains remain unresolved and block affected delivery; see the run report for the PO decision options and recommendation. Do not infer a selection or migration rule.
- Existing documents on `origin/main` contain conflicts listed in `spec.md` Cross-feature supersessions. They are deliberately not edited in this PR; PO S41-PO-9a assigns later docs/04 register consolidation.
