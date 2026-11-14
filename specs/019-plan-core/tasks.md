# F19 Shared Plan Core Tasks

**Planning status:** T001-spec, T010, and T020 are complete on their respective slices. Remaining implementation tasks are unstarted. T010/T020 evidence is recorded in the slice verification reports and traceability rows.

Task ownership is by implementation skill/risk, not by agent/model name. Every task names its FR scope and depends on accepted Spec Kit analysis. Any implementation task stays blocked by its listed MCQ where noted.

## Phase 0 — Spec Kit documentation

- [x] **T001-spec - Rebuild and analyze the F19 Spec Kit artifacts.** `OWNER=product-specification / cross-feature contract`. Create spec, clarification register, plan, tasks, data model, client/delivery contracts, traceability, and Analyze checklist for FR-001-FR-015 and SC-001-SC-013. Validate source authority, PO copy bytes, cross-references, supersessions, and docs formatting. This task records no implementation/test completion; docs validation evidence is in the run report.

## Phase 1 — F16-aligned plan lifecycle

- [x] **T010 — Plan root, private draft, and immutable revisions.** `OWNER=database integrity / authorization`. Implement stable workspace/client Plan ID, private mutable draft, immutable revisions, audit, and restrictive authorship references. **FR:** FR-001, FR-009, FR-010, FR-012. **Depends:** F16 contracts; retain non-login author ID per pending F11 deletion policy. **Evidence required:** real-DB persistence, CAS, append-only, role/workspace negative tests.
- [x] **T011 — Shared client request and response boundary.** `OWNER=typed API / domain contract`. Implement explicit create modes, draft CAS, Ready & Publish response, stable result/error contract, and F16 `ExerciseSnapshotV2`/food-version references. **FR:** FR-001, FR-008, FR-009, FR-010. **Depends:** T010, F16 FR-020/026/027. **Evidence:** `tests/contracts/f19-plan-core-client.test.ts`; persisted draft lifecycle and CAS remain covered by the T010 F19 schema integration suite.
- [ ] **T012 — Template and plan copy.** `OWNER=domain content integrity`. Copy latest published plan revision or immutable template version, preserving content fields and planner-entry settings while excluding ownership/history/subscription/delivery/Video. **FR:** FR-008. **Depends:** T010, T011, F16 snapshot contract. **Evidence required:** source-vs-copy value assertions and independent-destination persistence test.

## Phase 2 — Delivery, projection, and activation

- [x] **T020 — Safe continuity prerequisite, single plan delivery, and client projection.** `OWNER=database security / client access`. F13 continuous-renewal implementation is merged (S55-R19). A dry-run hash gates Platform-Owner-only cleanup for invalid overlapping synthetic successor records; S55-R20 re-attaches IDs through an immutable ledger and preserves every original F13 renewal/payment row. Implement one `plan_deliveries` table, atomic Ready & Publish revision/delivery, one continuous-subscription binding, all-delivered-plan projection, draft/undelivered denial, and no first-delivery omission filter. S55-R21 limits this slice to database contracts (RPCs, projection, RLS); add no UI/routes, and record that flag machinery precedes any F19 UI slice. **FR/SC:** FR-002, FR-003, FR-015; SC-003, SC-007, SC-013. **Depends:** T010/T011, F16, F12 lock/replay contract, and the deployed F13 continuity contract. Ready & Publish fails closed without writes for multiple active projections, uncorrected overlap, or missing eligibility; it auto-binds the sole resolved eligible subscription. **Evidence:** `tests/integration/f19-plan-delivery.test.ts` covers dry-run no-write, PO-only authorization, idempotent apply, immutable history/ledger, successor resolution and expiry recalculation, pre-cleanup denial, CAS, concurrent replay, 12 delivered plans, latest revision, and draft exclusion; `tests/integration/rls-catalog.test.ts` covers hardened ownership/ACLs. Mutation checks remove the PO authorization check and F13 resolver join; each makes the T020 test fail. **Cache-key constraint:** if any cache is introduced for client plan views, its key includes the authenticated user, plan identity, plan version, and workspace; Video is never stored in a cached projection (F16 FR-034, F16 T051 PARTIAL, S46-R1). **Flag:** no UI/routes are included; the server-side flag mechanism must precede any F19 UI slice (S55-R21).
- [ ] **T021 — Automatic initial activation and productivity unit.** `OWNER=database money/integrity`. Forward-extend activation source/typed links; atomically commit completing delivery, activation, any eligible new-client unit, receipt, audit; no outbox. Preserve historical `activation_source='renewal'` rows unchanged, and guard new writes so only `plan_deliveries` or `po_override` can be created (S43-R9 Sol-8). Preserve first-delivery rows across separate days and unique subscription activation. Create a unit only for an eligible new client without an existing unit; returning clients and clients with an existing unit may activate without one (S56-PO-2, S56-R2). **FR/SC:** FR-004, FR-007, FR-014; SC-004, SC-014. **Depends:** T020, F12/F13, F19 productivity-unit producer record; no-assignment activation credits the completing delivery Trainer publisher and refuses a non-Trainer publisher. **Evidence required:** real-DB two-order concurrency, rollback, duplicate/replay, returning-client/existing-unit no-duplicate cases, no-assignment Trainer-publisher, non-Trainer refusal, legacy renewal-source upgrade fixture plus new-write guard, and exactly-one-unit tests. Assigned-Trainer recipient case pending F11 P-S40-2 (S56-PO-3, S56-R3); do not fake it. Leave T021 unchecked until the assigned-recipient dependency is available.
- [ ] **T022 — Platform Owner Override Activate.** `OWNER=database authorization / money integrity`. Implement initial-only override, Q9 refusals, exact authorized receipt replay before active-state refusal, and immediate activation. Create a unit only for an eligible new client without an existing unit. An already-active target with no matching receipt returns `not_permitted` without writes or changes. Preserve recipient selection without assignment mutation, no fabricated delivery row, and no second unit after later delivery. **FR:** FR-006, FR-007, FR-014. **Depends:** T021, F11 assignment semantics, F12 lock/replay contract. **Evidence required:** real-DB zero/one/two-delivery cases, exact replay after activation, concurrent assignment/activation case, generic refusal, no-assignment-write, and no-duplicate unit tests. The assigned-Trainer recipient and concurrent assignment/activation cases remain pending F11 P-S40-2 (S56-PO-3, S56-R3); keep T022 unchecked until those real-assignment cases can be completed.
- [ ] **T023 — Renewal compatibility.** `OWNER=subscription integration`. Renewal modifies the existing subscription expiry under S43-PO-5 items 1 and 3; it creates no subscription row and awards no additional client-level unit. Renewal/upgrade lifecycle+ledger events create no new activation row (architect mapping (S43-R8)). **FR:** FR-005, FR-007, FR-014. **Depends:** F13 continuity contract, T021 schema. **Evidence required:** real-DB in-place expiry extension, full revenue, once-per-client unit, and legacy `activation_source='renewal'` preservation tests.

## Phase 3 — Access and deletion integration

- [ ] **T030 — Expiry denial and renewal page.** `OWNER=client access / UX copy`. Block expired plan content and integrate approved page body; render the approved title/body as informational only; no buttons, CTAs, renewal or contact actions. **FR:** FR-011, FR-013. **Depends:** F13 expiry entitlement and P4 access boundary. **Evidence required:** server-side denial and rendered approved-copy verification; design gate for UI implementation.
- [ ] **T031 — Trainer deletion retention integration.** `OWNER=identity/privacy / database integrity`. Preserve roots, revisions, delivery, activation, units, audit, and author references under RESTRICT/no-cascade while coordinating the merged F11 workflow. **FR:** FR-012, FR-013. **Depends:** F11 PR #73 merged. **Evidence required:** real-DB deletion/RESTRICT tests, F11 compatibility review, identity/audit retention assertions.
- [ ] **T032 — F17/F18 consumer conformance.** `OWNER=workout/nutrition domain integration`. Consume shared Plan Core lifecycle/delivery/projection; retain domain ownership and F16 snapshot semantics; do not redefine activation. **FR:** FR-001–FR-014 as applicable. **Depends:** T011/T020/T021, F16, F17, F18. **Evidence required:** shared-contract integration across workout and nutrition documents.

## Task coverage

| Requirement | Tasks                             |
| ----------- | --------------------------------- |
| FR-001      | T001-spec, T010, T011, T032       |
| FR-002      | T001-spec, T020, T032             |
| FR-003      | T001-spec, T020, T032             |
| FR-004      | T001-spec, T021, T032             |
| FR-005      | T001-spec, T023                   |
| FR-006      | T001-spec, T022                   |
| FR-007      | T001-spec, T021, T022, T023       |
| FR-008      | T001-spec, T011, T012, T032       |
| FR-009      | T001-spec, T010, T011             |
| FR-010      | T001-spec, T010, T011, T020       |
| FR-011      | T001-spec, T030                   |
| FR-012      | T001-spec, T010, T031             |
| FR-013      | T001-spec, T020, T030, T031, T032 |
| FR-014      | T001-spec, T021, T022, T023       |
| FR-015      | T001-spec, T020, T023             |

## Decision dependencies

- S42-PO-6 resolves the expiry page title/body and interaction scope; the page is informational only.
- F19-MCQ-15 is resolved: already-active Override returns `not_permitted` and writes/changes nothing.
- F19-MCQ-16 is resolved: auto-bind the sole resolved eligible subscription with no chooser. MCQ-17 is resolved by S45-PO-2 and S45-R4; T020 carries the safe-cleanup deployment prerequisite and generic fail-closed multiple-active test intent.
- S43-F19-MCQ-1..5 are resolved by S43-PO-5/6 (S43-R8); returning clients never count as new (pending F13-FR-040, pending F13-FR-041).
- S43-F19-MCQ-6 is resolved by architect mapping (S43-R8): renewal/upgrade write lifecycle+ledger events and no new activation row.
