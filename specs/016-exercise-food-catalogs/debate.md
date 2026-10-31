# F16 debate record

Historical review record. It preserves earlier proposals and deliberation only; the approved S20 decisions in docs/04-changes-and-questions.md supersede conflicting statements. Do not treat old pending proposals or pair-delivery designs below as current requirements.

## Round 1 ? review record

| # | Sev | Verdict | Reasoning / integration |
|---|---|---|---|
| R1 | critical | ACCEPTED (adjusted) | Draft's INVOKER-only model was unimplementable with no DML grants. Adopted the established F12-F15 SECURITY DEFINER pattern (plan Technical Context). Not a new architecture amendment: practice already moved; docs/02 "SECURITY INVOKER" recorded as doc drift. |
| R2 | major | ACCEPTED | FR-020 explicit-version snapshot builders incl. selected variation version. Cross-feature: F17 document must carry `variationVersion` (apply in F17 v1). |
| R3 | major | ACCEPTED | FR-011 rewritten: exactly three one-way identity mutations; composite FK pointer->version. |
| R4 | major | ACCEPTED | FR-016a versioned taxonomy; plan tables updated. |
| R5 | major | ACCEPTED | FR-016 operation-key semantics, FOR UPDATE + re-read, recheck after waits, deterministic merge locking. |
| R6 | major | ACCEPTED | FR-008 + `food_active_name_keys` real UNIQUE, sorted advisory locks, candidate-set echo. |
| R7 | major | ACCEPTED | D16-1 split into 1a/1b/1c; FR-002/009 marked PENDING with PROPOSED defaults. |
| R8 | major | ACCEPTED | D16-5 = NEEDS SOURCE CONFIRMATION, release-blocking; decimal-string transport at fixed scales; F18 engine converts (apply in F18 v1). |
| R9 | major | ACCEPTED | FR-013 audit allowlist, workspace_id NULL for global, search not audited, two-segment action names. |
| R10 | major | ACCEPTED as PROPOSAL | FR-021 + D16-10; production gate, no moderation queue (PRD-05/PRD-12 preserved). |
| R11 | major | ACCEPTED | SC-005 split Worker CPU vs DB/API SLO (D16-11) + EXPLAIN assertion. |
| R12 | major | ACCEPTED | RED list extended verbatim in substance. |
| R13 | major | ACCEPTED | US4 test now uses frozen snapshot fixtures; rendering moved to F17/F18. |
| R14 | minor | ACCEPTED | `normalize_ar_en_v1`, NFC + fold table, cross-collation tests. |

PO items added/reworded: D16-1a/b/c, D16-5, D16-7, D16-9, D16-10, D16-11. Rejected: none.

## Round 2 ? review record

| # | Sev | Verdict | Reasoning / integration |
|---|---|---|---|
| R1 | major | PARTIAL | Accepted the need for an explicit write path + tests (plan: no direct DML, RPC write tests under the owner). Rejected the round-1 "dedicated non-BYPASSRLS owner role": keep the exact owner pattern of the existing F12-F15 definer functions; no new role. |
| R2 | major | ACCEPTED | PO reads directly without membership (BRD-02; F14 FR-001 precedent): `can_read_global_catalog()`; FR-012 updated. |
| R3 | major | ACCEPTED | FR-020: variation snapshot is F17-only; F18 snapshots food versions incl. alternatives. |
| R4 | major | ACCEPTED | FR-007: once D16-5 is approved, formula enforced in the DB write path too. |
| R5 | major | ACCEPTED | Opaque UUID operation keys; raw key excluded from audit (FR-013). |
| R6 | major | ACCEPTED | Dependencies rewritten (F17 PR-1 Plan Core before F18 integration). |
| R7 | major | ACCEPTED | Gating paragraph: D16-2/5/7 blockers before final schema/numeric tests. |
| R8 | minor | REJECTED | Review note was outside the feature decision scope. |
| R9 | minor | ACCEPTED | SC-005 fixture definition + DB/index size vs 70% exit trigger. |

PO list changes: D16-11 is the engineering-owned p95 <= 300 ms target, not a PO decision; D16-10 owner = PO (proposed).

## Round 3 ? review record

| # | Sev | Verdict | Reasoning / integration |
|---|---|---|---|
| R1 | critical | PARTIAL | 10 ms is the hard limit, so a 10 ms p95 target leaves no headroom: SC-005 now targets Worker CPU p95 <= 5 ms, cold start measured separately. Not "critical": raising the platform limit is out of scope. |
| R2 | major | ACCEPTED | Real gap: workspace-only exercises had no snapshot builder. FR-020 now has a source-discriminated builder; F17 consumes both. |
| R3 | major | REJECTED | PRD-01 grants the PO "global shared exercise/food/form/template governance"; BRD-02 gives the PO full platform authority; F14 FR-001 already records the PO global-access exception. The pack did not include F14, which explains the miss. |
| R4 | major | PARTIAL | Added changed-field codes (never values) to the audit allowlist; immutable version rows already hold content for PO review. Engineering detail, not a PO decision (no D16-12). |
| R5 | major | ACCEPTED | D16-5 illustrative values removed; PO must state the basis (absolute/relative/both), inclusivity, rounding and epsilon. |
| R6 | major | PARTIAL | Rejected "slip the migration range": timestamps encode ordering, not calendar dates, and are valid UTC. Accepted the explicit merge order F14 -> F13 -> F15 -> F16. |
| R7 | major | ACCEPTED | Name keys: UNIQUE (lang, name_norm, basis), food_id payload; insert/keep/swap/delete semantics specified + concurrent test. |
| R8 | major | ACCEPTED (simplified) | Instead of a max chain depth: the survivor must be active, so chains and cycles cannot exist; locking is two rows in UUID order. |
| R9 | minor | ACCEPTED | Fixed-scale strings ("10.50"), never trimmed; fixture assertions. |
| R10 | minor | ACCEPTED | Client UUIDv4 bound to action; 30-day retention purged by the existing cron. |
| R11 | minor | ACCEPTED | `catalog_operations` counted in D16-10 storage budgets. |
| R12 | minor | REJECTED | BRD-06 was deliberately excluded from the sanitized pack; the source exists. |

Decisions: D16-7 split into 7a/7b/7c (accepted); the R3 "PO read without membership" proposal was rejected and has no D16 decision identifier; D16-11 remains the engineering-owned p95 target; D16-12 rejected (R4 handled as engineering).

## Summary

History only. Any old proposal or pending label below is superseded where it conflicts with the approved S20 PO decisions recorded in docs/04-changes-and-questions.md. The feature spec and plan are canonical.

3 debates, 35 recommendations: 27 accepted, 5 partial, 3 rejected. At the time, the spec and plan were v3 drafts for PO review; subsequent S20 PO decisions supersede conflicts.

## Cross-feature update (from F17 round 3)
Renamed for reuse by F17/F18: `can_read_global_catalog()` -> `can_read_global_coaching_content()`; `catalog_operations` -> shared `app_private.operation_keys`. No semantic change.
