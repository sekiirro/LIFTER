# Independent Critique — Sol Medium

**Date**: 2026-11-27 (Africa/Cairo)
**Reviewer**: OpenAI Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`; independent read-only Spec Kit critique.
**Scope**: spec.md, plan.md, research.md, data-model.md, contracts, tasks.md, and PO MCQs.
**Result**: 0 CRITICAL, 0 HIGH, 0 MEDIUM open after corrections.

## Findings and corrections

1. **HIGH — Retention clock and activation gate** (`spec.md` FR-011/SC-006; `data-model.md`; tasks T009/T017). Critique found the 30-day anchor ambiguous and inconsistent with F26 active-account retention, account closure/deletion clock, tied refund/dispute holds, restart-on-resolution, separate audit creation clock, and existing purge activation gate. **Addressed**: notice retention now remains while account is active; after closure/deletion it uses the approved relationship-end clock with holds/restart; audit rows use their own creation clock; purge remains gated.
2. **HIGH — F13 date-to-instant conversion** (`research.md`; `spec.md` FR-004; evaluator contract). Critique found F13 exposes exclusive Cairo dates rather than an expiry instant. **Addressed**: use F13 FR-004 first-existing-instant conversion, then subtract exactly 72 elapsed hours; added explicit UTC expected fixture and spring-gap/fall-fold acceptance tests.
3. **HIGH — Lifecycle and recipient race** (`contracts/rpc-and-authorization.md`; tasks). Critique found an update/revocation could commit between projection and enqueue. **Addressed**: evaluator uses F13's existing subscription lock order and, after waits, resamples time, recomputes projection, and re-resolves recipients before insert; added RED race task.
4. **MEDIUM — Stage eligibility by F13 state** (`data-model.md`; spec stories/SC-003). **Addressed**: added the complete F13-state eligibility table, including expiry emission for `expired`, freeze-adjusted due times, and suppression after refund/deactivation/closure/purge.
5. **MEDIUM — Expiring-list window missing** (`data-model.md`; contract; SC-005). **Addressed**: added MCQ 028-04 for the window and edges; expired remains the F13 `expired` state and row/count predicates must match.
6. **MEDIUM — RED-first task ordering** (`tasks.md`). **Addressed**: all authz, lifecycle, time, notice, UI and retention RED contracts now precede implementation tasks.

## Severity counts

CRITICAL: 0 · HIGH: 0 open · MEDIUM: 0 open. Findings fixed: 3 HIGH, 3 MEDIUM.
