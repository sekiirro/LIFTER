# Traceability: F14 Workspace Branding — merged core

Static source inspection and review of historical evidence in `tasks.md`; no tests or CI were run in this compliance lane. VERIFIED means concrete assertions/prior evidence exist, not freshly executed. F14b UI work is outside this core traceability scope.

| Requirement | Task(s) | Asserting test(s) / evidence | Status |
|---|---|---|---|
| FR-001 | T001-T006,T011,T014,T020,T023,T026,T043 | `tests/integration/branding-draft-read.test.ts::authorizes draft reads through has_workspace_access...`; role/scope publish tests | VERIFIED |
| FR-002 | T002,T008,T010,T011,T023,T026,T043 | `tests/integration/branding-storage-policy.test.ts::denies anon and foreign-workspace reads...`; composite ownership probes | VERIFIED |
| FR-003 | T003,T025,T028,T045,T046,T043 | `tests/integration/branding-proxy-resolution.test.ts::T028 serves the bound private object...`; invalid response and token-validation tests | VERIFIED |
| FR-004 | T004,T006,T011,T023,T043 | `tests/integration/branding-draft-read.test.ts`; stale revision/save tests in draft-publish contract suite | VERIFIED |
| FR-005 | T005,T011,T023,T027,T043 | `tests/integration/branding-publish.test.ts::serializes concurrent publication...`; audit rollback case | VERIFIED |
| FR-006 | T005,T011,T027,T050,T043 | `tests/integration/branding-publish.test.ts::retains only the current version...`; owner-GC claim/reference tests | VERIFIED |
| FR-007 | T007,T024,T025,T033,T043 | `tests/unit/branding-contrast-matrix.test.ts` light/dark contrast cases; editor color explanation assertions | VERIFIED |
| FR-008 | T003,T010,T024,T025,T028,T042,T043 | `tests/unit/branding-registration-ui.test.tsx::renders the current published identity...`; portal placeholder is static | VERIFIED |
| FR-009 | T009,T013,T014,T021,T022,T043 | `tests/integration/branding-banner-pipeline.test.ts::creates, validates, attaches, and publishes...`; `tests/integration/branding-publish.test.ts` alt-text guard/fallback; owner-facing editor deferred by S19-PO-2 | PARTIAL |
| FR-010 | T003,T025,T028,T045,T046,T043 | `tests/integration/branding-proxy-resolution.test.ts::T046 live F10 grace/deadline is rechecked...`; F10 token-validating proxy tests | VERIFIED |
| FR-011 | T003,T009,T025,T028,T043 | `tests/unit/branding-proxy-response.test.ts::returns only the current authorized image after a final token/version recheck` asserts `private, no-store`; `tests/integration/branding-proxy-resolution.test.ts` asserts the same header for valid and invalid proxy responses; no asserting test for registration-page render headers was located | PARTIAL |
| FR-012 | T003,T024,T025,T028,T043 | branding read/proxy route and no-store response tests | VERIFIED |
| FR-013 | T008,T024,T025,T033,T043 | `tests/unit/branding-registration-ui.test.tsx::uses a neutral localized fallback hero...`; locale fallback tests | VERIFIED |
| FR-014 | T005,T014,T027,T043 | `tests/integration/branding-audit.test.ts::stores branding audit metadata without URLs, tokens, bytes, or authored text`; `::keeps audit rows detached from collectible targets and immutable`; `tests/integration/branding-publish.test.ts` single-event and audit-insertion rollback assertions | VERIFIED |
| FR-015 | T024,T025,T033,T042,T043 | `tests/unit/branding-editor-ui.test.tsx::explains source and accessible adjusted colors...`; contrast matrix tests | VERIFIED |
| FR-016 | T005,T010,T017,T023,T026,T043 | capability/storage-policy isolation tests and static branding service boundary assertions | VERIFIED |
| FR-017 | T036-T041,T043 | `tests/unit/branding-storage-ci-contract.test.ts`; readiness and zero-skip tests; hosted CI proof remains a D-24 production gate | PARTIAL |
| FR-018 | T010,T013,T014,T028,T033,T035,T040-T041,T043 | `tests/integration/branding-storage-policy.test.ts::keeps F14 buckets private...`; direct API denial cases; T040/T041 production backup/restore and acceptance evidence remains open | PARTIAL |
| SC-001 | T001-T003,T011,T020,T023,T026,T043 | draft read, workspace isolation, and role matrix tests | VERIFIED |
| SC-002 | T004-T005,T011,T027,T043 | stale edit, serialized publish, no-op, and audit rollback tests | VERIFIED |
| SC-003 | T003,T025,T028,T043 | `tests/integration/branding-proxy-resolution.test.ts::T025 returns only version-bound published identity...`; neutral invalid-token UI test | VERIFIED |
| SC-004 | T009,T014,T021,T022,T027,T050,T043 | image validator, banner pipeline, and reference-safe GC tests | VERIFIED |
| SC-005 | T010,T024,T025,T028,T033,T043 | `tests/unit/branding-registration-ui.test.tsx` form/publication identity assertions | VERIFIED |
| SC-006 | T007,T024,T033,T043 | `tests/unit/branding-contrast-matrix.test.ts::keeps brand text, controls, and focus within light/dark contrast requirements` | VERIFIED |
| SC-007 | T003,T025,T028,T045,T046,T043 | proxy route/header and no-store assertions in `branding-public-read`/proxy tests | VERIFIED |
| SC-008 | T003,T025,T028,T045,T046,T043 | `tests/integration/branding-proxy-resolution.test.ts` validity, binding, expiry and publication replacement cases | VERIFIED |
| SC-009 | T010,T013,T014,T028,T033,T035,T041,T043 | `tests/integration/branding-storage-policy.test.ts::denies anon and foreign-workspace reads...`; direct Storage policy probes | VERIFIED |
| SC-010 | T036-T041,T043 | `tests/unit/branding-storage-ci-contract.test.ts`; T038 local zero-skip evidence; T039-T041 backup/capacity/matrix and hosted evidence remain open | PARTIAL |
| SC-011 | T024,T025,T033,T043 | contrast-matrix and editor UI tests; final real-background/surface gate remains open under T043 | PARTIAL |

## Summary

- Functional requirements: 14 VERIFIED, 4 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- Success criteria: 9 VERIFIED, 2 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- Total: 23 VERIFIED / 6 PARTIAL. FR-009 is PARTIAL under S19-PO-2. T039-T041/T043 remain open; no PO source explicitly defers them. No tests or CI were rerun.
