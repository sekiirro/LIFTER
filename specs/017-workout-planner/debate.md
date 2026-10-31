# F17 debate record

Historical review record. It preserves earlier proposals and deliberation only; the approved S20 decisions in docs/04-changes-and-questions.md supersede conflicting statements. Do not treat old pending proposals or pair-delivery designs below as current requirements.

## Round 1 ? review record

| # | Sev | Verdict | Reasoning / integration |
|---|---|---|---|
| R1 | critical | ACCEPTED | Real gap: no subscription binding, so P4 could not identify the first-delivery pair. FR-001 + Plan Core: `subscription_id` with composite FK; pair = one ready draft of each kind per (workspace, subscription). |
| R2 | critical | ACCEPTED | Readiness tied to `ready_revision`; saves clear it; mark_ready/publish need expected_revision; `source_revision` unique; unchanged re-publish returns the existing version; US3 test fixed. |
| R3 | major | ACCEPTED | FR-013 operation keys on every mutation via the F16 idempotency pattern; removed from version rows. |
| R4 | major | ACCEPTED | `variation: {id, version}` on items and alternatives; snapshot includes stable muscle codes. |
| R5 | major | ACCEPTED | Separate global/workspace template tables; masking view; indistinguishable denials. |
| R6 | major | ACCEPTED | Plan Core as one shared PR on main (no copying); F18 depends on that commit, not the F17 branch. |
| R7 | major | ACCEPTED | `activation_state_unavailable` instead of a false "not activated"; lifecycle-aware eligibility; F13 now a hard dependency. |
| R8 | major | ACCEPTED | FR-003a catalog picker via F16 search with explicit versions + foreign negatives. |
| R9 | major | ACCEPTED | FR-005 PO defaults screen + RPC + versioned active pointer + tests. |
| R10 | major | ACCEPTED | SC-005 benchmark-driven cap; CPU p95 <= 8 ms, max < 10 ms; storage projection vs 350 MB. |
| R11 | major | ACCEPTED | SC-002 explicit negative matrix. |
| R12 | major | ACCEPTED | Export audit (success + denial) and spreadsheet formula-injection protection. |
| R13 | major | ACCEPTED | FR-004 descendant id remapping for duplicate day/exercise. |
| R14 | major | ACCEPTED | Template identity/version/pointer lifecycle in FR-006. |
| R15 | minor | ACCEPTED | Schema-version parser registry, fail-closed unknown versions (FR-014). |

PO list: D17-2/7 reworded NEEDS SOURCE CONFIRMATION; D17-4 narrowed; D17-6 removed (engineering-owned); D17-8 default NO; D17-9 added. Rejected: none.

## Round 2 ? review record

| # | Sev | Verdict | Reasoning / integration |
|---|---|---|---|
| R1 | critical | ACCEPTED | "Exactly one ready draft" was ambiguous with multiple plans per subscription: FR-001 now requires an explicit pair (both plan ids + expected ready revisions), same workspace/client/subscription, deterministic lock order. |
| R2 | critical | ACCEPTED | FR-001a defines the P4 pair-delivery transaction contract (internal pair-only writer, both versions + delivery event + activated_at + one productivity unit, idempotent, no partial delivery), consistent with Constitution V and architecture "First delivery". |
| R3 | major | ACCEPTED | FR-004a id continuity across revisions (PRD-04 session-version continuity). |
| R4 | major | REJECTED | Review note was outside the feature decision scope. |
| R5 | minor | ACCEPTED | D17-9 reworded (catalog-selected vs free-text; AI prohibited); D17-7 bodyweight marked as proposal. |

## Round 3 ? review record

| # | Sev | Verdict | Reasoning / integration |
|---|---|---|---|
| R1 | critical | ACCEPTED (design, not a PO question) | PRD-06 says delivery is AUTOMATIC when both plans are ready, so P4 cannot rely on a staff pick: plan roots carry `initial_delivery` (one per kind per subscription, partial UNIQUE, immutable after activation). D17-10 not added. |
| R2 | critical | ACCEPTED (downgraded: mapping, not breakage) | F17's nested `variation:{id,version}` is the canonical document shape; F16's tagged-union builder accepts it. |
| R3 | major | ACCEPTED | Helper generalized to `can_read_global_coaching_content()` (F16 + F17 + F18 templates). |
| R4 | major | ACCEPTED | US5 contradicted FR-011; US5 now defers to D17-8. |
| R5 | major | ACCEPTED | Defaults are an explicit UI prefill at set-add, no server enforcement (trainers may override per PRD-04). |
| R6 | major | ACCEPTED | FR-010 + D17-1: per working set, each primary group 1.0, each secondary group the fraction. |
| R7 | major | ACCEPTED | Plan Core is its own architect-owned shared PR; later changes are coordinated PRs. |
| R8 | major | ACCEPTED | One shared idempotency table `app_private.operation_keys` (renamed in F16). |
| R9 | major | ACCEPTED | Template RPCs listed in FR-006. |
| R10 | minor | PARTIAL | Readiness clears only when the document hash changes; no-op autosaves keep it. Real edits must clear it (correctness over convenience). |
| R11 | minor | ACCEPTED | Provisional 512 KB cap for the benchmark; final cap from results. |
| R12 | minor | ACCEPTED | Template documents = workout schema v1 minus client fields, same registry. |

Decisions: D17-1 and D17-5 reworded (accepted); D17-8 default YES REJECTED (draft export is outside PRD-04; conservative NO stands); D17-10 REJECTED (solved by design R1).

## Summary

History only. Any old proposal or pending label below is superseded where it conflicts with the approved S20 PO decisions recorded in docs/04-changes-and-questions.md. The feature spec and plan are canonical.

3 debates, 32 recommendations: 29 accepted (2 downgraded/as design), 1 partial, 2 rejected (review scope; D17-8 flip). At the time, the spec and plan were v3 drafts for PO review; subsequent S20 PO decisions supersede conflicts.

## Cross-feature update (from F18 round 1)
Accepted review F18 R5/R8 for F17 too: domain-specific RPC names (`save_workout_draft` etc.) so F17/F18 coexist in one schema; FR-004b contributor attribution (PRD-06).
