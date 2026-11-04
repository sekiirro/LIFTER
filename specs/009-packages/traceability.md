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
| FR-015 market attribute | T036, T038, T039, T042, T044, T045 | `tests/unit/packages-market-type.test.ts`; `tests/integration/packages-markets-types.test.ts` | None; owner/legacy gated by SK-009-05/06 | BLOCKED |
| FR-016 type attribute | T036, T038, T039, T042, T044, T045 | Same as FR-015 | None; owner/mutability and promotional behavior gated by SK-009-06/07 | BLOCKED |
| FR-017 market-currency matrix | T037, T038, T042, T043, T049a | `tests/unit/packages-market-type.test.ts`; `tests/integration/packages-markets-types.test.ts` | None; schema delta not written | NOT-IMPLEMENTED |
| FR-018 no conversion/own currency | T037, T043, T044, T049a, T050 | `tests/unit/packages-money.test.ts` extension; `tests/e2e/packages.spec.ts` extension | None; no-conversion scan not run | NOT-IMPLEMENTED |
| FR-019 unlimited independent packages | T036, T038, T042 | `tests/integration/packages-markets-types.test.ts` | None; no count cap exists in shipped schema, but S31 tests are not written | NOT-IMPLEMENTED |
| FR-020 PO-only authorship/control | T040, T042, T043, T045, T047 | `tests/unit/packages-actions.test.ts` extension; `tests/integration/packages-reads.test.ts` extension | Shipped PO-only walls exist; S31 matrix/UI evidence is not written | NOT-IMPLEMENTED |
| FR-021 preserve existing versions | T035, T042, T046, T049a, T050 | `tests/integration/packages-markets-types.test.ts`; forward-migration catalog check | None; forward migration not written | NOT-IMPLEMENTED |

## SC mapping

SC-001..SC-006 are covered by the shipped baseline test sources above. SC-007..SC-012 are future
tasks: SC-007 → T036/T038; SC-008 → T037/T038; SC-009 → T037/T041/T050; SC-010 →
T038/T039/T047; SC-011 → T035/T038/T050; SC-012 → T041/T045/T049. No S31 SC is claimed passing.

## Open PO blockers

SK-009-05 (legacy classification), SK-009-06 (owner/mutability), SK-009-07 (promotional behavior),
SK-009-08 (approved AR/EN copy) and SK-009-09 (downstream currency). See the `## PO decision register`
in [spec.md](spec.md).

## S32-PO-4 FRs (new; no implementation evidence)

| FR | Task(s) | Planned evidence | Status |
|---|---|---|---|
| FR-022 legacy audit/no inference/editable defaults | T052, T053, T063 | audit inventory reconciliation + migration tests | BLOCKED: S33-01 |
| FR-023 PO package CRUD/version preservation | T053?T055, T063 | management/RPC role tests, immutable version + downstream snapshot tests | BLOCKED: S33-02, S33-07, S33-11 |
| FR-024 promotional dates/expiry/deactivation | T056, T057, T061 | pure date-boundary tests, scheduler/idempotency/link lifecycle tests | BLOCKED: S33-03, S33-05, S33-06, SK-009-08 |
| FR-025 original currency/EGP reporting/settlement distinction | T058, T060 | report fixtures and immutable settlement/snapshot assertions | BLOCKED: S33-03, S33-10, S33-12, SK-009-08 |
| FR-026 API fetch, immutable rate snapshot and safe failures | T058, T059, T062 | provider contract/failure/retry/security tests | BLOCKED: S33-03, S33-04, S33-08, S33-09, S33-10 |
| FR-027 no client data in outbound API request | T059, T062 | captured request allowlist test + security review | Planned, no evidence |

SC-013..SC-018 map respectively to T052/T053, T054/T055, T056/T057, T058/T060, T058/T059, and T059/T060/T062. No task is ticked. Existing rows above retain their S31 evidence status; this cycle ran no tests/builds/stacks and claims no implementation evidence.
