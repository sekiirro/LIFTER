# Traceability: Packages & Package Versions (P1-F9)

**Date**: 2026-11-04  
**Scope**: `specs/009-packages` S31 amendment (market, type, currency, unlimited packages).  
**Method**: static cross-artifact review against the shipped F9 schema/RPCs and existing test sources.
No test suite, migration, Docker stack or CI job was run in this documentation lane.

Status meanings:

- **EVIDENCE-EXISTS**: the cited test source is present in the merged baseline; this lane did not
  re-run it.
- **BLOCKED**: implementation and evidence are gated by the cited PO decision.
- **NOT-IMPLEMENTED**: no task is ticked; the work is future and unverified.

## Baseline FRs (shipped F9)

| FR | Task(s) | Test source | Evidence | Status |
|---|---|---|---|---|
| FR-001 canonical identity | T003, T006, T011, T013, T025 | `tests/integration/packages-publish.test.ts::creates once and audits exact code with global PO attribution`; `tests/unit/packages-validation.test.ts::preserves authored content and exact ceiling` | Shipped PR #9; static source review | EVIDENCE-EXISTS |
| FR-002 fixed unique offers | T003, T011, T015 | `tests/integration/packages-publish.test.ts::keeps fixed representation and immutable copied duration` | Shipped PR #9; static source review | EVIDENCE-EXISTS |
| FR-003 duration rules | T003, T006, T011, T013, T025 | `tests/integration/packages-publish.test.ts::accepts every preset, custom equivalents, Unicode name bounds and bigint ceiling` | Shipped PR #9; static source review | EVIDENCE-EXISTS |
| FR-004 authored explicit exact terms | T003, T006, T008, T011, T013, T019, T021, T024, T025 | `tests/unit/packages-validation.test.ts::requires all fields`; `tests/unit/packages-money.test.ts` | Shipped PR #9; static source review | EVIDENCE-EXISTS |
| FR-005 publication/concurrency/replay | T003, T004, T011, T013 | `tests/integration/packages-publish.test.ts::R1: current replay is no-op; v1 -> v2 -> v1 terms appends v3 and moves current`; `::serializes independent first/later distinct publications and identical calls` | Shipped PR #9; static source review | EVIDENCE-EXISTS |
| FR-006 immutable history | T003, T011, T013, T015 | `tests/integration/packages-publish.test.ts::all DML roles hit update/delete guards independently of grants`; `::truncate guards raise 23514 even for postgres/service_role after removing incoming FKs in rollback` | Shipped PR #9; static source review | EVIDENCE-EXISTS |
| FR-007 availability/confirmation | T004, T015, T017, T024, T025 | `tests/integration/packages-availability.test.ts::confirms false -> true -> false with exact events, no-op retry and unchanged history` | Shipped PR #9; static source review | EVIDENCE-EXISTS |
| FR-008 scoped staff reads | T002, T003, T019, T021, T026 | `tests/integration/packages-reads.test.ts::covers every identity x workspace on offers, safe/base versions, packages, rate RPC and audit` | Shipped PR #9; static source review | EVIDENCE-EXISTS |
| FR-009 rate visibility | T004, T019, T021, T026, T029 | `tests/integration/packages-reads.test.ts::explicit, wildcard, embedded commission requests fail for every authenticated SQL role` | Shipped PR #9; static source review | EVIDENCE-EXISTS |
| FR-010 two walls/generic failures | T001, T003, T006, T009, T011, T013, T015, T017, T019, T021, T026, T029 | `tests/unit/packages-actions.test.ts::obeys an app capability denial even for a verified PO and accepting RPC`; `::has no partial success while pending` | Shipped PR #9; static source review | EVIDENCE-EXISTS |
| FR-011 exact atomic audit | T004, T011, T013, T015, T017, T019 | `tests/integration/packages-publish.test.ts::rolls back first/later publication when audit insertion fails, preserving legacy audit body` | Shipped PR #9; static source review | EVIDENCE-EXISTS |
| FR-012 PO route/landing | T021, T024, T025, T026 | `tests/e2e/packages.spec.ts::every authenticated non-PO receives 404 without terms/rates`; `tests/unit/packages-page.test.ts::landing link is PO-only` | Shipped PR #9; static source review | EVIDENCE-EXISTS |
| FR-013 AR/EN/UI/exact format | T008, T024, T025, T026 | `tests/unit/packages-money.test.ts`; `tests/e2e/packages.spec.ts` locale tests | Shipped PR #9; static source review | EVIDENCE-EXISTS |
| FR-014 required verification | T001, T002, T030, T034 | `tests/integration/rls-catalog.test.ts`, `tests/integration/matrix-parity.test.ts` | Shipped PR #9; static source review | EVIDENCE-EXISTS |

## S31 FRs (amendment; no task ticked)

| FR | Task(s) | Planned test source | Evidence | Status |
|---|---|---|---|---|
| FR-015 market attribute | T036, T038, T039, T042, T044, T045, T066 | `tests/unit/packages-market-type.test.ts`; `tests/integration/packages-markets-types.test.ts` | Product decisions resolved; no implementation evidence | NOT-IMPLEMENTED |
| FR-016 type attribute | T036, T038, T039, T042, T044, T045, T066 | Same as FR-015 | Product decisions resolved; no implementation evidence | NOT-IMPLEMENTED |
| FR-017 market-currency matrix | T037, T038, T042, T043, T049a | `tests/unit/packages-market-type.test.ts`; `tests/integration/packages-markets-types.test.ts` | None; schema delta not written | NOT-IMPLEMENTED |
| FR-018 no conversion/own currency | T037, T043, T044, T049a, T050 | `tests/unit/packages-money.test.ts` extension; `tests/e2e/packages.spec.ts` extension | None; no-conversion scan not run | NOT-IMPLEMENTED |
| FR-019 four immutable categories | T036, T038, T042, T066 | `tests/integration/packages-markets-types.test.ts` | C3 settled; implementation tests not written | NOT-IMPLEMENTED |
| FR-020 PO-only authorship/control | T040, T042, T043, T045, T047 | `tests/unit/packages-actions.test.ts` extension; `tests/integration/packages-reads.test.ts` extension | Shipped PO-only walls exist; S31 matrix/UI evidence is not written | NOT-IMPLEMENTED |
| FR-021 preserve commercial/client snapshots | T035, T042, T046, T049a, T050, T066 | `tests/integration/packages-markets-types.test.ts`; forward-migration catalog check | C1/C2 settled; implementation tests not written | NOT-IMPLEMENTED |

## SC mapping

SC-001..SC-006 are covered by the shipped baseline test sources above. SC-007..SC-012 are future
tasks: SC-007 → T036/T038; SC-008 → T037/T038; SC-009 → T037/T041/T050; SC-010 →
T038/T039/T047; SC-011 → T035/T038/T050; SC-012 → T041/T045/T049. No S31 SC is claimed passing.

## Historical PO blocker statuses (superseded by S33-PO-6 / S34-PO-1 / S34-PO-2)

All S33-01..12 product choices, C1–C5, Arabic LABELS and the four mapped English labels in S34-PO-2 are resolved. S34-PO-6 resolves PD-S34-NEW-01 (package row is the category); PD-S34-NEW-02 remains pending for the canonical market literal; the market-literal parts of T042, T043, T044, T055, T065 initialization and T066, plus any dependent literal in contract/schema work, remain blocked. BLOCKED-COPY applies only to dashboard/Installments/empty/error/help copy beyond the approved four English/Arabic label pairs.

## S32-PO-4 FRs (new; no implementation evidence)

| FR | Task(s) | Planned evidence | Status |
|---|---|---|---|
| FR-022 mock inventory/no inference | T052, T053, T064, T071 | synthetic-only inventory + dependency manifest | NOT-IMPLEMENTED |
| FR-023 future real-package retirement | T054, T055, T066 | history-preserving retirement tests | NOT-IMPLEMENTED |
| FR-024 promotional dates/link behavior | T056, T057, T067 | date-boundary and issued-link snapshot tests | NOT-IMPLEMENTED |
| FR-025 collections/settlement reporting | T060, T068, T072, T073 | actual collection, commission and separate settlement fixtures | NOT-IMPLEMENTED |
| FR-026 FX snapshot/failure behavior | T058, T059, T067, T068 | date/provider/rate/retry tests | NOT-IMPLEMENTED |
| FR-027 no client data in outbound API request | T059, T062 | captured request allowlist test + security review | BLOCKED: S33-08 provider verification; T062 independent security review |

SC-013..SC-018 map respectively to T052/T053, T054/T055, T056/T057, T060/T068, T058/T059/T068, and T059/T062. No task is ticked. Existing rows above retain their S31 evidence status; this cycle ran no tests/builds/stacks and claims no implementation evidence.

## S34 current traceability (requirements only; no implementation evidence)

| FR / SC | Tasks | Planned evidence | Status |
|---|---|---|---|
| FR-028 C5 safe removal/empty initialization; SC-019 | T064, T065, T070, T071 | complete dependency manifest, fail-closed tests with zero writes, safe deletion/init/rollback, independent security review | PARTIAL: deletion/preflight specified (teardown mechanism needs separate security review); initialization uses the S34-PO-6 package-row identity but its market literal is BLOCKED: PD-S34-NEW-02 |
| FR-029 PO-only versioned terms; FR-015/016/019/021; SC-020 | T066, T071 | four category pairs, immutable market/type, role tests, commercial versions and historical snapshots | Identity/uniqueness per S34-PO-6 (unique (workspace_id, market, type) on the package row); BLOCKED: PD-S34-NEW-02 for market-literal assertions |
| FR-030 promotions and link expiry; SC-021 | T067, T071 | Cairo date/boundary and new/issued link tests | NOT-IMPLEMENTED |
| FR-031 reporting/FX roles; SC-022 | T068, T072, T073, T074, T071 | actual monthly collections, commissions, separate settlement, installment details, FX and role tests | NOT-IMPLEMENTED |
| FR-032/033 installment UI copy/labels; SC-023 | T069, T074, T071 | four exact English/Arabic label pairs; Frontend Design Gate; other interface copy | label pairs approved by LABELS/S34-PO-2; remaining dashboard/Installments/empty/error/help copy BLOCKED-COPY |

No S34 task is ticked. This cycle ran no tests, SQL, migration, stack, build, UI render or security review. Existing mock packages must not be deleted until the C5 preflight and independent post-implementation security gate pass on the target stack. Category initialization uses the S34-PO-6 package-row identity; its market literal remains BLOCKED by PD-S34-NEW-02.
## S33 traceability — S33-PO-4

| FR | Task | Test | Evidence |
|---|---|---|---|
| FR-013, FR-014 | T900 | `tests/e2e/packages.spec.ts::local-stack authenticated package acceptance › ar: PO create, presets/custom, cancel/confirm, errors, themes and workspace switch` | Commit `45d17ff`; three #41 Playwright specs passed 27/27 on current head and fresh Stack C. |

