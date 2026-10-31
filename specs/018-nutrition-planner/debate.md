# F18 debate record

Historical review record. It preserves earlier proposals and deliberation only; the approved S20 decisions in docs/04-changes-and-questions.md supersede conflicting statements. Do not treat old pending proposals or pair-delivery designs below as current requirements.

## Round 1 ? review record

| # | Sev | Verdict | Reasoning / integration |
|---|---|---|---|
| R1 | critical | ACCEPTED | Real forgery path: publish now ignores caller snapshots/totals, rebuilds from exact food versions and recomputes in SQL; TS/SQL parity via shared golden fixtures (FR-003/FR-005). |
| R2 | major | ACCEPTED | Selection composite FKs to plan and version; identity from auth.uid(); item/alternative validated in the immutable document (FR-009). |
| R3 | major | ACCEPTED | FR-007 pending D18-1, proposed PO-only; shared read helper (PO direct); creator/origin masking; NULL-workspace audit. |
| R4 | major | ACCEPTED (adapted) | Uses F17 FINAL's eligibility interface and explicit `initial_delivery` pair instead of `client_is_activated`; F18 never writes activated_at/productivity. |
| R5 | major | ACCEPTED | Domain-specific RPC names; also applied to F17. Consume Plan Core, never fork. |
| R6 | major | ACCEPTED | Shared operation-key ledger for every mutation; selection serialized by row lock + `selection_revision`. |
| R7 | major | ACCEPTED | Schema v1 invariants + frozen validator/renderer/export/algorithm per version (FR-002, FR-013). |
| R8 | major | ACCEPTED | Contributor attribution (PRD-06); also applied to F17. |
| R9 | major | ACCEPTED | FR-010a audit allowlist + log-scrub tests. |
| R10 | major | PARTIAL | Accepted capacity/CPU/search/pagination gates; CPU target aligned with F17 (p95 <= 8 ms, max < 10) rather than 5 ms; byte cap stays engineering-owned via Plan Core benchmark (no D18-8). |
| R11 | major | ACCEPTED | SC-002 path inventory + full negative matrix; golden fixtures. |
| R12 | major | ACCEPTED | Exact decimal/rational arithmetic, decimal strings, round only at display (D18-4 provisional). |
| R13 | major | ACCEPTED | `[PENDING]` markers; D18-3 -> engineering; D18-5 removed; D18-1/7 proposals; D18-9 added. D18-8 not added (see R10). |
| R14 | minor | ACCEPTED | tasks + analyze before code; stack lock/separate stacks vs F17; safe-wrapper rule; final gates. |

## Round 2 ? review record

| # | Sev | Verdict | Reasoning / integration |
|---|---|---|---|
| R1 | major | ACCEPTED | Private nutrition version writer callable only by `publish_pair`; public publish stays guarded. |
| R2 | major | ACCEPTED | Canonical representation: input scales, exact intermediates, single half-even rounding to 4 decimals, fixed-scale strings, numeric(12,4) bound; fixtures assert serialized outputs incl. repeating fractions. |
| R3 | major | ACCEPTED | Post-lock membership/capability + eligibility recheck on every mutating RPC. |
| R4 | major | ACCEPTED | UNIQUE per (workspace, client, plan, version, item); null clears to default, audited. |
| R5 | major | ACCEPTED | Selection applies the same plan-visibility/access restriction as the client view/export (shared interface, P4 rules). |
| R6 | major | ACCEPTED | `implicitDayTypeId` for single-day documents. |
| R7 | major | ACCEPTED | SC-006 benchmark envelope defined before implementation. |
| R8 | minor | ACCEPTED | D18-7 removed; no delta display in scope. |

## Round 3 ? review record

| # | Sev | Verdict | Reasoning / integration |
|---|---|---|---|
| R1 | critical | CLARIFIED (not a defect) | FR-009 already required the visibility check; plan text now states it explicitly. |
| R2 | critical | CLARIFIED (not a defect) | Confused F16 per-100 nutrient scale (2 dp) with plan quantities (<= 3 dp, in the document). FR-002 now states the distinction. |
| R3 | major | PARTIAL | Recompute already runs in SQL; Worker target tightened to p95 <= 5 ms (aligned with F16). D18-10 rejected (engineering, not PO). |
| R4 | major | ACCEPTED | Explicit FORCE RLS SELECT policy on global template tables. |
| R5 | major | ACCEPTED | Carry-forward mechanism (if D18-9 approved) inside the publish transaction; D18-9 kept as a PO question with a defined mechanism either way. |
| R6 | major | ACCEPTED | Selection operation key bound to `client.nutrition_select`. |
| R7 | major | ACCEPTED | `implicitDayTypeId` always required for single-day. |
| R8 | major | ACCEPTED | Export checks both walls before any read. |
| R9 | minor | ACCEPTED | `action_code` CHECK enum. D18-11 rejected as a PO decision (engineering). |
| R10 | minor | ACCEPTED | Unreachable training-only meals: draft warning, rejected at ready/publish. |

## Summary

History only. Any old proposal or pending label below is superseded where it conflicts with the approved S20 PO decisions recorded in docs/04-changes-and-questions.md. The feature spec and plan are canonical.

3 debates, 32 recommendations: 27 accepted, 3 partial/clarified-with-change, 2 clarified (not defects); 0 outright rejected; 2 proposed PO decisions folded into engineering. At the time, the spec and plan were v3 drafts for PO review; subsequent S20 PO decisions supersede conflicts.
