# Traceability: 023 Client Progress Coaching (P5 Progress)

| FR     | Task(s)                      | SC     | Evidence   |
| ------ | ---------------------------- | ------ | ---------- |
| FR-001 | T008, T009, T013             | SC-001 | UNVERIFIED |
| FR-002 | T008, T009, T013             | SC-002 | UNVERIFIED |
| FR-003 | T009, T013                   | SC-001 | UNVERIFIED |
| FR-004 | T009, T013                   | SC-002 | UNVERIFIED |
| FR-005 | T011, T015                   | SC-003 | UNVERIFIED |
| FR-006 | T010, T014                   | SC-003 | UNVERIFIED |
| FR-007 | T010, T014                   | SC-003 | UNVERIFIED |
| FR-008 | T017                         | SC-003 | UNVERIFIED |
| FR-009 | T010, T011, T014, T015, T018 | SC-003 | UNVERIFIED |
| FR-010 | T019, T024, T025             | SC-004 | UNVERIFIED |
| FR-011 | T019, T025                   | SC-004 | UNVERIFIED |
| FR-012 | T020, T022, T024, T026, T027 | SC-006 | UNVERIFIED |
| FR-013 | T021, T022, T024, T027       | SC-006 | UNVERIFIED |
| FR-014 | T019, T025                   | SC-004 | UNVERIFIED |
| FR-015 | T020, T026                   | SC-005 | UNVERIFIED |
| FR-016 | T021, T023, T028             | SC-004 | UNVERIFIED |
| FR-017 | T023, T029                   | SC-004 | UNVERIFIED |
| FR-018 | T031, T036                   | SC-007 | UNVERIFIED |
| FR-019 | T030, T032, T035, T037       | SC-008 | UNVERIFIED |
| FR-020 | T030, T035, T037             | SC-008 | UNVERIFIED |
| FR-021 | T030, T037                   | SC-008 | UNVERIFIED |
| FR-022 | T031, T038                   | SC-007 | UNVERIFIED |
| FR-023 | T031, T038                   | SC-007 | UNVERIFIED |
| FR-024 | T031, T036                   | SC-007 | UNVERIFIED |
| FR-025 | T031, T034, T039             | SC-007 | UNVERIFIED |
| FR-026 | T031, T038, T041             | SC-007 | UNVERIFIED |
| FR-027 | T033, T034, T040             | SC-007 | UNVERIFIED |
| FR-028 | T041                         | SC-008 | UNVERIFIED |
| FR-029 | T042, T044, T047, T048       | SC-009 | UNVERIFIED |
| FR-030 | T044, T047, T049             | SC-009 | UNVERIFIED |
| FR-031 | T045                         | SC-009 | UNVERIFIED |
| FR-032 | T042, T048                   | SC-009 | UNVERIFIED |
| FR-033 | T043, T046                   | SC-009 | UNVERIFIED |
| FR-034 | T050                         | SC-010 | UNVERIFIED |
| FR-035 | T050                         | SC-010 | UNVERIFIED |
| FR-036 | T014, T033, T040             | SC-003 | UNVERIFIED |
| FR-037 | T012, T016                   | SC-011 | UNVERIFIED |
| FR-038 | T012, T016                   | SC-011 | UNVERIFIED |

No task is ticked. All PO questions resolved (S54-023-Q1, S54-023-Q2 by S55-PO-3; S55-023-Q3 by S55-PO-5). This spec-only commit is not implementation evidence. SC-001..SC-011 are mapped to the task(s) that implement their primary FR. Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); this work proceeds without a flag; flags are reconsidered before production.

## T054 evidence (tested SHA 788cf3a1e8d1decb661acda78f8ca8d08ecf9b62)

Authority: S70-PO-8 (F23 progress-coaching remaining tasks now our work). Lane: s70-beam-023t054. Stack: E.

### Tool versions

- node v24.19.0
- vitest 5.1.0
- @playwright/test 1.64.1
- supabase CLI 2.122.0
- prettier 3.9.10
- eslint 9.39.5
- typescript 6.0.3

### Repo checks

- `npm run format:check` (prettier --check .): PASS ("All matched files use Prettier code style!")
- `npm run lint` (eslint . --max-warnings=0): PASS (exit 0)
- `npm run typecheck` (tsc --noEmit): PASS (exit 0)
- `npm run check:secrets` (node scripts/check-client-secrets.mjs, after `npm run build --webpack`): PASS (exit 0, no findings)
- Full unit: `TZ=Africa/Cairo npm run test`: PASS, 365 test files, 4190 tests.
- F23 integration on Stack E (after safe reset + vault provision): `npm run test:integration` filtered to `tests/integration/progress-coaching*.test.ts`: PASS, 12 files, 52 tests.
- F23 e2e/screenshot spec: `npx playwright test tests/e2e/progress-coaching-screenshots.spec.ts`: PASS, 6 tests. Screenshots: 53 files under OS temp dir `.../Temp/lifter/f23-progress-coaching` (matrix {AR-RTL,EN-LTR} x {light,dark} x {390,1440} plus dialogs). axe: 0 critical/serious violations reported by the spec.

### Mutation evidence (each restored byte-identical, git diff empty)

1. Trainer-only-own-clients authorization (app layer): removed `authorize(actor, 'coaching_work', target.workspaceId)` in `lib/progress-coaching/service.ts` (`staffSession`). Named test `tests/unit/progress-coaching-correction.test.ts` "denies %s without calling the database" FAILED (3 of 11; status `corrected` instead of `denied`). Restored; `git diff` empty.
2. Server-side validation: removed the validation block in `parseCorrectionInput` (`lib/progress-coaching/correction-input.ts`). Named test `tests/unit/progress-coaching-correction.test.ts` "rejects invalid input before resolving the actor" FAILED (2 of 11; invalid input accepted). Restored; `git diff` empty.
3. RLS/workspace isolation: changed `progress_measurements_staff_read` policy to `using (true)` in `supabase/migrations/20261118200100_f23_progress_measurements.sql`, reset Stack E, re-provisioned vault. Named test `tests/integration/progress-coaching.test.ts` "denies the spec 024 readers and progress RPCs..." FAILED (foreign trainer saw 3 measurement rows). Restored migration + reset + re-provision; 12 files / 52 tests pass.

### Security/UI review checklist (results only)

- Authz on every F23 server action/route: `correctMeasurement`/`recordOwnMeasurement`/`updateOwnMeasurement` (service.ts `staffSession`/`clientSession`); `configureCheckinForm` (checkins/configuration.ts `authorize(assign_intake_form)`); food-replacement `staffRequestSession` (lifecycle.ts `authorize(coaching_work)`). API routes delegate to these. Finding: none (0 BLOCKING).
- RLS policies on F23 tables: `progress_measurements_staff_read`, `progress_measurements_client_read`, `food_replacement_requests_staff_read`, `food_replacement_requests_self_read`; cross-workspace + role negatives covered by `progress-coaching.test.ts` and `progress-coaching-food-replacement-rls.test.ts`. Finding: none (0 BLOCKING).
- No PII in logs: no `console.*` in `lib/progress-coaching`; `http.ts` returns closed status-only bodies. Finding: none (0 BLOCKING).
- AR/EN copy from approved strings only: `components/progress-coaching/*` use `getMessages`; no hardcoded Arabic literals in components. Finding: none (0 BLOCKING).

Classification: 0 BLOCKING findings. Non-blocking findings: none recorded. T054 ticked. BLOCKED note dropped per S70-PO-8 (F23 progress-coaching remaining tasks are now our work).

T051 is handled by lane s70-hy4-023docs (not touched). T004/T052 remain CANCELLED.
