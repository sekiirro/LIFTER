# Spec Kit Analyze: F13 continuity decisions

**Analyzed:** 2026-11-10 17:48 UTC
**Method:** Reconciled S45-PO-2/S45-R3 with byte-exact source verification; reviewed FR-005/012/038/039, scenarios 13/14, SC-033 and SC-034, plan, T041/T042, traceability, lifecycle/data model, research, and earlier S43-PO-6/architect mapping for credit after upgrade, renewal, then upgrade. Reviewed in-flight, unknown-result, retry, deletion, concurrency, crash-between-step, and no-partial-write states for these spec-only changes.

## Entry check

- PASS - FR-005/012/039, scenarios 13/14, and measurable SC-033 and SC-034 specify the changed renewal and credit behavior.
- PASS - S45-F13-MCQ-1 is resolved by the exact PO quote and separate S45-R3 mapping in the PO-decision register. The earlier credit finding is covered by S43-PO-6 residual 5 and S43-R7; no new product choice is inferred.
- PASS - plan.md and tagged tasks T041/T042 cover the new behavior and expected tests; implementation tasks remain unchecked.
- PASS - this Analyze pass follows the latest spec, plan, and task edits.

## Findings

- CRITICAL: 0 open.
- HIGH: 0 open.
- MEDIUM: 0 open PO decisions in this change scope.
- LOW: 0 FR/task/SC ID or task-tag mismatches found in the touched continuity and credit scope.

## Decision and evidence status

- FR-012/039 are specified as pre-activation refusal with no writes/no queued duration, then FR-039 active/expired rules after activation. Existing T010 evidence is historical and does not verify all current no-write outcomes; see traceability.md.
- S43-PO-6 residual 5 states the original package full payment is the sole credit after renewal then upgrade. FR-038 and scenario 14 clarify that prior upgrade charges and separate renewal payments are excluded even when an earlier upgrade preceded the renewal.
- SC-033 and SC-034 map to unchecked T041/T042; no test execution or implementation is claimed. Other implementation evidence gaps and independent technical/security gates remain as recorded.

**Analyze result:** CRITICAL 0; HIGH 0; MEDIUM 0 open PO decisions; LOW 0.

## S45 R3 review-fix analysis

**Analyzed:** 2026-11-11 00:51 Africa/Cairo
**Scope:** CodeRabbit round-3 fixes for expired-renewal term anchoring and cumulative refund caps.

- PASS: the expired-renewal anchor is the renewal operation date in lifecycle mapping; this follows the existing approved mapping and makes no new product choice.
- PASS: each source's cumulative refunded principal is bounded by eligible collections; group cumulative refunds use total eligible collections, while a new request is bounded by the pre-operation residual.
- PASS: subscription/group locking and deterministic allocation remain unchanged; FR/SC/task IDs and task tags are untouched.
- PASS: no product ambiguity or new PO decision found.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze — Greptile review PRR_kwDOVYgYQ88AAAABXNC1UA (01:33 UTC)

- Scope: correct the two S43-PO-8 scenario-to-SC citations and the 50-row traceability status summary.
- PASS: scenario 2 maps upgrade term anchors to SC-027; scenario 3 maps pre-activation duration start to SC-028. SC-029 remains mapped to renewal-then-upgrade credit.
- PASS: recomputed matrix statuses are 37 PARTIAL and 13 UNVERIFIED across 50 rows; the summary IDs exactly match the matrix rows and status counts.
- PASS: FR-012/FR-039 and S45-R3's pre-activation renewal refusal, zero-write/no-queued-duration rule remain unchanged. No PO behavior or copy was introduced.
- PASS: numbered FRs, measurable SCs, GWT acceptance, clarifications, plan coverage, task mappings, and dated analysis artifacts exist for the touched feature.
- CRITICAL: 0 open; HIGH: 0 open; MEDIUM: 0 open PO decisions; LOW: 0 stale cross-reference findings.

## 2026-11-11 Analyze — merge of main, no PR content change (01:52 UTC)

- Scope: merged main commit b1476db5f95d447ed2b0525e19ed4a9c890b90cc; no PR content change.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze — T043 PO-only manual date adjustment (FR-040; SC-018)

- Entry check: PASS — FR-040 states the PO-only/after-expiry/audit/zero-revenue rules; SC-018 is measurable; GWT scenario 11 covers PO-after-expiry success and non-PO refusal; task T043 is tagged FR-040/SC-018; plan.md slice (5) covers PO date edits.
- Specified (implement): only `platform_owner` attempts commit; attempts by any other role (including null actor) are refused before any write; adjustment commits even when the subscription term is expired; every commit writes exactly one immutable audit row; zero payment/revenue/ledger rows are written by the operation. Input well-formedness (valid UUIDs, valid Cairo dates, end-exclusive after start) is rejected as `invalid_input`; this is input validity, not product policy.
- NOT specified (no code): which subscription dates are adjustable beyond asserted effective start/end, permitted shift ranges or backdating limits, previous-value derivation, whether entitlement/P4 projections must reflect manual edits, behavior for frozen or deactivated subscriptions, and expected-revision concurrency. These are escalated as PO-DECISION-NEEDED with the adjustment fact recording only the PO-asserted dates.
- Design: new immutable table `public.subscription_manual_date_adjustments` (no money columns by construction) + `public.record_subscription_date_adjustment(jsonb)` (SECURITY DEFINER, authenticated-only grant, explicit `app_private.is_platform_owner()` pre- and post-lock checks, per-actor request-key exact replay, `key_conflict` on changed intent) + audit trigger writing `subscription.manual_date_adjusted`. No new capability (T017 parity untouched). TS service `lib/subscriptions/manual-date-service.ts` enforces PO-before-RPC with an allow-listed receipt.
- Catalog impact: two new `app_private`/`public` objects require updating the pinned `rls-catalog` private-function list; both follow the hardened owner/search-path/grant pattern.
- CRITICAL: 0 open; HIGH: 0 open; MEDIUM: 0 open PO decisions in the specified scope (open questions escalated, not encoded).

## 2026-11-11 Analyze — T044 productivity points (FR-040/041; SC-019/026)

- Entry check: PASS — FR-041 states one point per new client, no repeat for returning clients, and no points for upgrades/renewals/plan publications; FR-040 states unlimited plan revisions/publications and no trainer point for plan publication; GWT scenario 12 and SC-019/SC-026 are measurable; task T044 is tagged FR-040/FR-041/SC-019/SC-026; plan.md slice (6) covers point uniqueness.
- Specified (implement): exactly one point per new client (`points = 1` CHECK); at most one point row per client (`UNIQUE(client_id)`, immutable, never deleted); repeat awards for the same client are rejected with zero new rows; upgrade, renewal and plan-publication operations write zero point rows (no writer is invoked from those paths); no count limit is imposed on plan revisions/publications. Pure rules module pins `new_client -> 1`, all other events -> 0.
- NOT specified (no code): which event/role awards the point in production (award entry point and authorizer), whether a returning client under a new client row can be linked by identity, and point display/reporting. The award entry point is escalated as PO-DECISION-NEEDED; no public award RPC is added. Persistence, uniqueness/immutability guards, audit trigger (`trainer.productivity_point_awarded`), and behavioral no-point coverage are the shippable core.
- Catalog impact: one new audit trigger function requires updating the pinned `rls-catalog` private-function list; hardened pattern followed.
- CRITICAL: 0 open; HIGH: 0 open; MEDIUM: 0 open PO decisions in the specified scope (award entry escalated, not encoded).

## 2026-11-11 Analyze — T047 frozen-state operations (FR-038/039; SC-022)

- Entry check: PASS — FR-038/039 state frozen upgrade/renewal refusal until unfrozen and freeze-day expiry extension; GWT scenario 10 and SC-022 are measurable; task T047 is tagged FR-038/FR-039/SC-022 with paths in freeze-service/freeze-dates and unit/integration freeze-lifecycle tests; plan.md slice (3) covers frozen refusal and freeze-day extension.
- Specified (implement): pure `requireUnfrozenForOperation` gate (upgrade/renewal refused while frozen; mirrors existing `requireFreezeRole` style) + `isFrozenOn` window predicate derived from the specified Apply-counts/Stop-excluded day semantics + exact 10-counted-days → +10-expiry unit fixture + integration fixtures in freeze-lifecycle.test.ts (frozen renewal refusal with zero writes via existing `record_renewal`, DB-level 10-day extension via `f13_project_entitlement`, concurrent-apply race serialization, apply/stop/remove audit counts with replay silence).
- NOT in scope: DB-level frozen upgrade refusal has no upgrade writer until T042 (forbidden to this lane); covered by the pure gate plus a T042 handoff note. No migration is required (freeze guards exist); no catalog changes.
- CRITICAL: 0 open; HIGH: 0 open; MEDIUM: 0 open.
