# Spec Kit Analyze - F9 Packages: markets, types and currency (S31)

- Date: 2026-11-04 (fresh pass after the S31 spec/plan/tasks amendment)
- Analyzed source: branch `speckit-009-markets` at `d04ef52` plus this docs change; `origin/main`
  advanced to `ff6e0b9` but touches only `specs/003`, `specs/005`, `specs/006` and `specs/007`, so no
  merge into this branch was required.
- Method: static cross-artifact, shipped-schema/RPC, contract and task-source review. No tests,
  migrations, Docker stack, builds or CI jobs were run.
- Constitution: v1.4.0.

## Inventory and entry check

| Gate | Result | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs and Given/When/Then scenarios for the touched scope | PASS | `specs/009-packages/spec.md` FR-001..FR-021, SC-001..SC-012, US1..US6 |
| Clarifications recorded, or PO-decision register citing the PO source | PASS | `spec.md` `## Clarifications` Session 2026-11-04 and `## PO decision register`; S31-PO-4/S31-PO-5 quoted from `C:/Users/NEW LAP/.lifter/briefs/s28-po-decisions-verbatim.md` |
| Plan covers the touched scope; tasks have IDs tagged with FRs | PASS | `plan.md` S31 delta; `tasks.md` T035..T051 with FR tags |
| `checklists/analyze.md` dated after the last spec/plan/tasks change, 0 CRITICAL/HIGH | PASS | This file, 2026-11-04; 0 CRITICAL, 0 HIGH |

The shipped F9 baseline was verified directly, not taken from the previous run's notes:
`public.packages` is global canonical identity; `public.package_offers` is keyed by
`(workspace_id, package_id, duration_days)`; `public.package_versions` is immutable and owns
`price_minor`/`currency`; `publish_package_version(...)` has no market/type input and accepts any
format-valid three-letter currency; `create_package`, `publish_package_version` and
`set_package_offer_available` enforce PO authority; `package_versions_safe` exposes each version's
own currency; F10 registration links copy that price/currency and F12 subscriptions/installments
preserve it with same-currency totals. No conversion exists in the shipped code.

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | PO decision gap | MEDIUM | `spec.md` SC-009; `contracts/packages-surface.md` downstream boundary | Downstream propagation through F10/F12 is described as the recommended same-currency option but remains SK-009-09. SC-009 is scoped to package surfaces only, so no downstream requirement is silently asserted. | Keep downstream tasks blocked by SK-009-09; do not treat the shipped behavior as approved S31 policy. |
| A2 | PO decision gap | MEDIUM | `spec.md` FR-015/FR-016; `data-model.md` owner table | Market/type ownership, mutability and legacy-row classification are deliberately undecided (SK-009-05/06). FRs carry explicit NEEDS PO markers; no column placement or backfill is selected. | Keep T036/T038/T042/T044/T045 blocked until SK-009-05/06 are answered. |
| A3 | Technical proposal | LOW | `plan.md`, `data-model.md`, `tasks.md` T042 | Forward-migration filename `20261106125000_f9_package_markets_types_currency.sql` is provisional and may change at implementation. | Confirm the filename in the migration task; it is not a policy decision. |
| A4 | Technical proposal | LOW | `data-model.md`, `tasks.md` T036 | Machine encoding `egypt`/`international`/`year_round`/`promotional` is a technical proposal, not PO-approved copy or a PO decision. | Finalize with the implementation; never ship it as a display label. |

No CRITICAL or HIGH findings. No contradictory requirement pairs were found.

## Coverage and constitution

- FR-to-task mapping: 21/21 FRs mapped (100%); SC mapping 12/12; 52/52 tasks map to at least one FR.
- S31 open blockers are listed, not resolved: SK-009-05, SK-009-06, SK-009-07, SK-009-08, SK-009-09.
- Constitution I (isolation), II (financial truth), III (PO governance), V (immutability),
  VII (audit/privacy), VIII (AR/EN UI) and IX (atomic publication) support the amended text.
- No protected artifact (constitution, DESIGN.md, PO records, CI, application code, tests,
  migrations) was changed by this cycle.

## Static traceability

`traceability.md`: 14 baseline FR rows with existing merged test sources (not re-run here) and 7 S31
FR rows marked BLOCKED or NOT-IMPLEMENTED. No S31 task is ticked. No test suite or CI job was run.

## Verdict

**PASS WITH OPEN PO BLOCKERS** - 0 CRITICAL, 0 HIGH, 2 MEDIUM, 2 LOW. The S31 decisions that the PO
actually made are recorded verbatim; every unresolved product question is an explicit blocker rather
than an invented default. Implementation must not start until SK-009-05..SK-009-09 are answered.

## PO-DECISION-NEEDED

- **SK-009-05** - legacy classification of existing package rows (options A-D; recommendation A,
  with verified-empty catalog as the fast path).
- **SK-009-06** - market/type owning entity and mutability (options A-D; recommendation A).
- **SK-009-07** - what `Promotional` changes (options A-D; recommendation A unless a time-bounded
  product is intended).
- **SK-009-08** - exact approved Arabic/English market/type labels (options A-D; recommendation C).
- **SK-009-09** - downstream currency propagation through registration/subscription/installment/
  commission/payment/refund (options A-D; recommendation A).

Full questions, implications, recommendations and blocked work:
`C:/Users/NEW LAP/.lifter/runs/s31-ds-f9-spec/po-decisions.md`.
