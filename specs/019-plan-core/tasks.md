# F19 Shared Plan Core Tasks

**Planning status:** All implementation tasks are unstarted. This PR performs documentation only. No code, migration, workflow/config, or test file is created here.

Task ownership is by implementation skill/risk, not by agent/model name. Every task names its FR scope and depends on accepted Spec Kit analysis. Any implementation task stays blocked by its listed MCQ where noted.

## Phase 0 — Spec Kit documentation

- [ ] **T001-spec - Rebuild and analyze the F19 Spec Kit artifacts.** `OWNER=product-specification / cross-feature contract`. Create spec, clarification register, plan, tasks, data model, client/delivery contracts, traceability, and Analyze checklist for FR-001-FR-014 and SC-001-SC-012. Validate source authority, PO copy bytes, cross-references, supersessions, and docs formatting. This task records no implementation/test completion; docs validation evidence is in the run report.

## Phase 1 — F16-aligned plan lifecycle

- [ ] **T010 — Plan root, private draft, and immutable revisions.** `OWNER=database integrity / authorization`. Implement stable workspace/client Plan ID, private mutable draft, immutable revisions, audit, and restrictive authorship references. **FR:** FR-001, FR-009, FR-010, FR-012. **Depends:** F16 contracts; retain non-login author ID per pending F11 deletion policy. **Evidence required:** real-DB persistence, CAS, append-only, role/workspace negative tests.
- [ ] **T011 — Shared client request and response boundary.** `OWNER=typed API / domain contract`. Implement explicit create modes, draft CAS, Ready & Publish response, stable result/error contract, and F16 `ExerciseSnapshotV2`/food-version references. **FR:** FR-001, FR-008, FR-009, FR-010. **Depends:** T010, F16 FR-020/026/027. **Evidence required:** contract tests plus DB-backed integration where state is persisted.
- [ ] **T012 — Template and plan copy.** `OWNER=domain content integrity`. Copy latest published plan revision or immutable template version, preserving content fields and planner-entry settings while excluding ownership/history/subscription/delivery/Video. **FR:** FR-008. **Depends:** T010, T011, F16 snapshot contract. **Evidence required:** source-vs-copy value assertions and independent-destination persistence test.

## Phase 2 — Delivery, projection, and activation

- [ ] **T020 — Single plan delivery and client projection.** `OWNER=database security / client access`. Implement one `plan_deliveries` table with one row per published revision, subscription binding at Ready & Publish, all-delivered-plan projection, undelivered/draft denial, and no first-delivery omission filter. **FR:** FR-002, FR-003, FR-013. **Depends:** T010/T011, F16, F12 lock/replay contract; Ready & Publish is refused without an eligible subscription; multiple eligible subscriptions are blocked by MCQ-16. **Evidence required:** real-DB unlimited-plan projection, authorization, CAS, and concurrency tests.
- [ ] **T021 — Automatic initial activation and productivity unit.** `OWNER=database money/integrity`. Forward-extend activation source/typed links; atomically commit completing delivery, activation, unit, receipt, audit; no outbox. Preserve first-delivery rows across separate days and unique subscription activation. **FR:** FR-004, FR-007, FR-014. **Depends:** T020, F12/F13, P7 consumer contract; no-assignment activation credits the completing delivery Trainer publisher and refuses a non-Trainer publisher. **Evidence required:** real-DB two-order concurrency, rollback, duplicate/replay, assigned-recipient, no-assignment Trainer-publisher, non-Trainer refusal, and exactly-one-unit tests.
- [ ] **T022 — Platform Owner Override Activate.** `OWNER=database authorization / money integrity`. Implement initial-only override, Q9 refusals, immediate one unit except that an already auto-activated target writes no second unit and its response is blocked by MCQ-15, assigned or selected recipient with no assignment mutation, no fabricated delivery row, and no second unit after later delivery. **FR:** FR-006, FR-007, FR-014. **Depends:** T021, F11 assignment semantics, F12 lock/replay contract. **Evidence required:** real-DB zero/one/two-delivery cases, concurrent assignment/activation case, generic refusal, no-assignment-write and replay tests.
- [ ] **T023 — Renewal compatibility.** `OWNER=subscription integration`. Keep `record_renewal` activation at recording with `activation_source='renewal'`, operation ID in `delivery_event_id`, no plan links, and no productivity unit. **FR:** FR-005, FR-014. **Depends:** F13 S22-PO-5 contract and T021 schema. **Evidence required:** real-DB renewal activation and no-unit regression test.

## Phase 3 — Access and deletion integration

- [ ] **T030 — Expiry denial and renewal page.** `OWNER=client access / UX copy`. Block expired plan content and integrate approved page body; do not ship title/button until MCQ-11 is answered. **FR:** FR-011, FR-013. **Depends:** F13 expiry entitlement and P4 access boundary. **Evidence required:** server-side denial and rendered approved-copy verification; design gate for UI implementation.
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

## Open MCQ dependencies

- MCQ-11 blocks final renewal-page title/button copy and page UI completion only.
- MCQ-15 blocks only the Override result for an already auto-activated subscription.
- MCQ-16 blocks Ready & Publish only when multiple eligible subscriptions overlap.
