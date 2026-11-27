# Implementation Plan: P8 security and performance readiness

**Branch**: `s71-031-hardening` | **Date**: 2026-11-27 | **Spec**: [spec.md](spec.md)

## Summary

Prepare an independent external cross-workspace penetration-test gate and a repeatable performance evidence plan using spec 008 tooling and existing pilot volumes. Update the existing docs/13 register with a new external-test gate and clarify PI-03 evidence; do not create a duplicate gate register. No test is purchased, scheduled, or executed here.

## Technical Context

**Language/Version**: Existing repo TypeScript/Next/Supabase docs and spec 008 scripts; this PR edits docs only.
**Primary Dependencies**: `specs/008-free-tier-validation`, `docs/13-production-readiness.md`, PRD-13 cross-workspace surfaces.
**Storage**: Existing docs/13 evidence links; no new report storage service.
**Testing**: Documentation checks only; future test evidence consists of external report + remediation/retest and measured performance results. No code test run in this lane.
**Target Platform**: Approved pre-production target only after separate PO authorization.
**Project Type**: Readiness/process specification.
**Performance Goals**: Baseline at approved pilot volumes; numeric budgets require MCQ 031-02.
**Constraints**: Never use real client data or production target without separate approval; vendor/budget/timing require MCQ 031-01.
**Scale/Scope**: Use existing illustrative volume values from spec 008; no new workload or monitoring stack.

## Constitution Check

PASS: Principles I, VII, IX and existing production gates. Synthetic-only evidence, external independent scope, no secret/PII artifacts, current exact-head CI and deployment approvals retained. No Constitution conflict/amendment.

## Reuse decisions

- Reuse spec 008 existing HTTP probe/log parser and its approved illustrative pilot inputs; no parallel benchmark tool.
- Reuse docs/13 as the single readiness/gate register; add PT-01 for external test and clarify PI-03 evidence for performance budgets/baseline.
- Reuse existing CI/security scans and production evidence; external testing supplements, not replaces, authorization/RLS tests, code review or `check:secrets`.
- No vendor, purchase, schedule, target, or production action until the PO answers MCQs and any per-target approval gates.
- Leaderboard legal review stays in spec 024 and is out of this plan.

## Clarifications

S71-PO-1 approves P8 external pen-test and performance work. MCQ 031-01 decides procurement scope/budget/window. MCQ 031-02 decides numeric performance thresholds after baseline. Existing spec 008 pilot volumes are already approved and reused without reopening.

## Proposed implementation slices

1. Verify spec 008 measurement interfaces and test-surface checklist; RED-first gate tests are not applicable because this lane is documentation-only and no implementation behavior is changed.
2. Add PT-01 to docs/13 as Open with named PO decisions, scope/evidence/remediation gates; clarify PI-03 uses baseline and approved performance budgets.
3. Document vendor-neutral rules of engagement, synthetic target, coverage map, evidence sanitization, findings lifecycle and retest.
4. Document repeatable benchmark routes/metrics using spec 008 tools; record baseline only until PO budgets are approved.

## Structure Decision

All artifacts remain in `specs/031-security-performance-readiness/` and current `docs/13-production-readiness.md`. No new test tool, vendor record system, production configuration or job is introduced.
