# Spec Kit Analyze — F19 Shared Plan Core

**Analyzed:** 2026-11-10 21:40 UTC
**Scope:** Spec-only Greptile round on PR #76 (F13 pending-reference clarity and new-client eligibility in the activation data model); no implementation or test execution is claimed.

## Entry check

- PASS — `spec.md` contains numbered FRs, measurable SCs, and Given/When/Then scenarios for touched lifecycle, delivery, activation, override, and replay behavior.
- PASS — Clarifications and decision status are explicit. MCQ-17 is resolved by the byte-exact PO words in the register and separate S45-R4 architect mapping; no open MCQ remains.
- PASS — `plan.md` covers the F13 continuity and safe-cleanup deployment prerequisites and blocked legacy-chain behavior; T020 is tagged FR-002/003/015 and includes cleanup scope, audit, dry-run, idempotency, preservation, and refusal test intent.
- PASS — This Analyze follows the latest spec/plan/tasks/data-model/traceability edits and reports 0 open CRITICAL/HIGH findings.

## Review findings and disposition

| Severity | Finding                                                                                    | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRITICAL | 0 open                                                                                     | None.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| HIGH     | 0 open                                                                                     | None.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| RESOLVED | F13 requirement ids cited but absent from F13's merged spec (Greptile P2, tasks.md)        | F19 cites F13-FR-037, F13-FR-040, and F13-FR-041 with incorrect or missing provenance: `origin/main`'s `specs/013-freeze-renewal-refunds/spec.md` ends at FR-036, while FR-037–FR-042 are defined on the pending F13 branch `speckit-013-subscription-continuity`. Every citation is now prefixed `pending` and `spec.md` § Pending F13 requirement references maps each id to that defined deliverable, states the merge/deploy prerequisite, and corrects the FR-040 (plans) / FR-041 (points) labels. |
| RESOLVED | Automatic activation omitted the new-client eligibility check (Greptile P2, data-model.md) | `data-model.md` automatic activation and Platform Owner override now create a productivity unit only when the client is an eligible new client with no existing unit; returning clients and clients with an existing unit activate without one, matching FR-004, FR-007, SC-004, SC-008, T021, and T022.                                                                                                                                                                                                 |
| RESOLVED | Legacy predecessor/successor overlap in mock/test F13 renewal records                      | S45-PO-2 MCQ-17 and S45-R4 map require a safe audited dry-run-first idempotent cleanup correcting only invalid overlaps before F19 delivery is enabled; no production reconciliation or selection rule is specified. FR-002/SC-003/T020 retain generic fail-closed behavior for more than one active subscription projection.                                                                                                                                                                            |
| RESOLVED | Operation-specific client success receipts                                                 | `plan-core-client.md` gives operation-specific receipt fields and omits Plan/revision IDs where absent.                                                                                                                                                                                                                                                                                                                                                                                                  |
| RESOLVED | Productivity-unit eligibility                                                              | FR-004, SC-004, T021, T022, plan, data model, and traceability now say activation may proceed without creating a unit for returning clients or clients with an existing unit.                                                                                                                                                                                                                                                                                                                            |
| RESOLVED | Override retry after commit                                                                | FR-006 and SC-008 require authorized matching receipt replay before active-state refusal.                                                                                                                                                                                                                                                                                                                                                                                                                |
| RESOLVED | F13 supersession references                                                                | The summary records the FR-011 distinct-subscription and FR-012 renewal-activation conflicts alongside the FR-013 unit conflict.                                                                                                                                                                                                                                                                                                                                                                         |

## Cross-artifact sweep

- PASS — FR-002/SC-003/T020/traceability agree on resolved subscription auto-binding, F13 continuity and safe-cleanup deployment prerequisites, synthetic/mock-test-only legacy overlaps, and generic fail-closed refusal for more than one active projection.
- PASS — The `pending` F13 qualifier and the § Pending F13 requirement references table agree across `spec.md`, `plan.md`, `tasks.md`, `data-model.md`, `traceability.md`, and `contracts/plan-core-client.md`; no citation of F13-FR-037/040/041 remains unprefixed, and the F13 spec's FR-036 ceiling is stated where the forward reference first appears.
- PASS — FR-004/FR-007/SC-004/SC-008/T021/T022/data-model agree on conditional, at-most-once units, including the new-client eligibility condition on both the automatic and override paths.
- PASS — FR-006/SC-008/T022/client result contract/data model preserve exact receipt replay and generic closed refusal.
- PASS — MCQ-17 is referenced consistently as resolved in spec, plan, tasks, and traceability; PO quotation is separate from architect mapping, and no production reconciliation/selection behavior is encoded.
- PASS — Task IDs and FR tags checked across `spec.md`, `plan.md`, `tasks.md`, and `traceability.md`; every referenced FR/SC/task id is defined; F11 PR #73 remains labeled pending where referenced.
- PASS — Approved expiry title/body and the S45-PO-2 MCQ-17 quotation were re-compared byte-for-byte against the PO sources with Node; all matched.

## Analyze result

CRITICAL 0; HIGH 0; open MCQ 0. The F13 continuity change and safe cleanup remain deployment prerequisites, and spec-only status authorizes no implementation or production data changes.

## Analyze — 2026-11-11 01:19Z (S46-R1 cache-key carry-forward)

**Analyzed:** 2026-11-11 01:19 UTC
**Scope:** Spec-only carry-forward of the F16 FR-034 plan-identity cache-key clause into F19 FR-003, SC-007, and task T020, per architect ruling S46-R1 (`C:/Users/NEW LAP/.lifter/runs/s46-arch/s46-architect-rulings.md`) and the F16 T051 trace (`C:/Users/NEW LAP/.lifter/runs/s46-ds-t051-trace/report.md`, T051 PARTIAL). No cache, feature, task, or user-visible behavior is added.

### Entry check

- PASS — `spec.md` has numbered FRs, measurable SCs, and Given/When/Then scenarios for the touched scope: FR-003 (client plan viewing) and SC-007 (all-and-only-delivered-plan projection).
- PASS — Clarifications and decision status are explicit. The added clause is a technical architect ruling (S46-R1), not a PO decision; no open MCQ was introduced and none remains.
- PASS — `plan.md` covers the touched scope (sequencing step 3 implements the delivery projection for FR-003); `tasks.md` has T020 tagged FR-003/SC-007 and now carries the cache-key constraint.
- PASS — This Analyze follows the latest spec/plan/tasks edits and reports 0 open CRITICAL/HIGH findings.

### Searched locations for the owning FR and task

- Client plan viewing: `spec.md` FR-003 (client projection returns every delivered plan with its latest published revision) and its acceptance SC-007; `tasks.md` T020 ("all-delivered-plan projection"); `contracts/plan-core-delivery-projection.md:9-16, 20-23` (projection result and inclusion rules); `traceability.md` FR-003 row.
- Exercise Video resolution for published plans: `contracts/plan-core-delivery-projection.md:12` ("Video is resolved live by F16's authorized resolver") and `:22` ("Video is resolved only behind the authorized F19/P4 boundary"); `contracts/plan-core-client.md:13` ("Video remains live"); `spec.md` FR-008 (copy semantics: Video is not copied, F16 resolves it live); `data-model.md:39` (F16's authorized live resolver).
- Cache-related text: none existed in `specs/019-plan-core` before this edit (case-insensitive search for `cache`/`cach` returned no match), which matches the F16 T051 trace finding that no F16–F19 task owns a client plan or video cache today.

### Review findings and disposition

| Severity | Finding                                                                    | Disposition                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CRITICAL | 0 open                                                                     | None.                                                                                                                                                                                                                                                                                                                                                                                                              |
| HIGH     | 0 open                                                                     | None.                                                                                                                                                                                                                                                                                                                                                                                                              |
| RESOLVED | F16 FR-034 cache-key clause had no owner in F19                            | FR-003 and SC-007 now state that any cache introduced for client plan or exercise Video resolution keys on plan identity, workspace and user, that two plans with the same published version for the same user and workspace never share a cached result, and that a test and a drop-plan-identity mutation are required; T020 carries the same constraint. F16 T051 stays PARTIAL until a task owns such a cache. |
| RESOLVED | Cache-key clause could be read as an F19 product decision or a new feature | The clause is conditional ("if any cache is introduced"), adds no cache, no default, no key format, and no user-visible behavior; it is recorded as an architect ruling, not a PO decision.                                                                                                                                                                                                                        |

### Cross-artifact sweep

- PASS — FR-003 (`spec.md`), SC-007 (`spec.md`), T020 (`tasks.md`), the FR-003 traceability row, the traceability carry-forward note, and this Analyze state the same conditional criterion with the same citations (F16 FR-034, F16 T051 PARTIAL, S46-R1).
- PASS — The criterion is bound on the client-facing published-plan projection path only (FR-003/SC-007/T020); the copy-semantics FR-008 and its task T012 were reviewed and not edited, because the clause is about caching client plan views and Video resolution, not copy values.
- PASS — No task, FR, SC, contract, data model, plan, or client-visible behavior was added or removed; only acceptance text, one task row, traceability rows, and this Analyze section changed.
- PASS — Identifiers cited across `spec.md`, `tasks.md`, `traceability.md`, and this Analyze are defined in the owning artifacts; no PO identifier was marked pending.

### Analyze result

CRITICAL 0; HIGH 0; open MCQ 0. The plan-identity cache-key criterion is carried forward as an explicit acceptance criterion; implementation remains unauthorized and no cache exists in F19.

## 2026-11-11 Analyze — merge of main, no PR content change (2026-11-11T02:40:20Z)

- Scope: merged main commit d1b1aff3d618621530158d055425c2eb7955247a; no PR content change.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze — merge of main, no PR content change (2026-11-11T01:58:11Z)

- Scope: merged main commit b1476db5f95d447ed2b0525e19ed4a9c890b90cc; no PR content change.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze — S47 cache-key plan-version correction (2026-11-11T05:33:55Z)

- Scope: architect review finding on S46-R1 carry-forward: cache key must include plan version per F16 FR-034 (authenticated user + plan identity + plan version + workspace); mutations drop plan identity and drop plan version -> test fails; Video never stored in a cached projection. Edited `spec.md` (FR-003, SC-007), `tasks.md` (T020 cache-key constraint), `traceability.md` (FR-003 row and carry-forward note). No other content change.
- CRITICAL: 0 open; HIGH: 0 open.

---

## Analyze — merge of main, no PR content change

**Analyzed:** 2026-11-14 00:00 UTC
**Date update only:** T010 status/traceability; no requirement text changed (constitution 1.16.0).
**Scope:** Sync rebase/merge of `origin/main` (8a846340) into PR #81 branch; no PR content change. Merge commit 1ce5570b4e16353b260ad5179761cf279ca62dec.

## Entry check

- PASS — spec.md, plan.md, tasks.md, traceability.md unchanged by merge; analyze.md appended only.
- PASS — No new FR/SC/task ids introduced; merge brought F18 specs only.
- PASS — 0 open CRITICAL/HIGH findings.

## Analyze result

CRITICAL 0; HIGH 0. Merge of main, no PR content change.
