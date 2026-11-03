# Project Scaffold & CI Baseline — Traceability (original merged scope)

**Scope:** FR-001..FR-014, SC-001..SC-005. SK-A4 owns separate FR-015..FR-020; those are excluded. Static inspection only; no suite/CI run.

| Requirement | Tasks | Tests / static evidence | Status |
|---|---|---|---|
| FR-001 | T001-T006 | `package.json`, `tsconfig.json`, `next.config.ts`; no single asserting scaffold test located | PARTIAL |
| FR-002 | T001,T010 | `README.md` Development section | PARTIAL |
| FR-003 | T003,T015 | `.prettierrc`, `eslint.config.mjs`, package scripts; no assertion test | PARTIAL |
| FR-004 | T006-T008,T014 | `tests/unit/health.test.ts` — `returns exactly the public health fields with the package version`; no run recorded | PARTIAL |
| FR-005 | T009 | `tests/e2e/health.spec.ts` — `GET /api/health returns the public health contract`; suite not rerun | PARTIAL |
| FR-006 | T008 | `specs/001-project-scaffold-ci/contracts/health.md`; `app/api/health/route.ts`; `lib/health.ts` — exact public health fields | VERIFIED |
| FR-007 | T005,T012,T015 | `build:edge` script and original CI artifact; no assertion test | PARTIAL |
| FR-008 | T011,T014 | `tests/unit/size-report.test.ts` — `Worker size limit` comparison cases | PARTIAL |
| FR-009 | T012,T015 | Current workflow inspected; secrets use in later jobs conflicts with original scope wording; see SK-001-01 | PARTIAL |
| FR-010 | T013 | `supabase/config.toml`; static configuration inventory | PARTIAL |
| FR-011 | T004 | `.env.example` and tracked-file inspection; no asserting test | PARTIAL |
| FR-012 | T010 | README Development section; static documentation inspection | PARTIAL |
| FR-013 | T001 | `.nvmrc`, `package.json` packageManager/engine declarations | PARTIAL |
| FR-014 | T012,T015 | CI platform inspection and edge build scripts; no lane test executed | PARTIAL |
| SC-001 | T001-T015 | `quickstart.md`, README, historical implementation tasks; no fresh-clone run | PARTIAL |
| SC-002 | T012,T015 | Workflow inspected; coverage/secret conflict is unresolved | PARTIAL |
| SC-003 | T007-T009 | Health unit and e2e assertions; no smoke run recorded | PARTIAL |
| SC-004 | T011,T014 | Size-report comparison test and script | PARTIAL |
| SC-005 | T012 | Workflow inspection only; no deploy/paid-service assertion test | PARTIAL |

## Summary

- FR: 1 VERIFIED, 13 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- SC: 0 VERIFIED, 5 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- No tasks were checked or unchecked in this documentation-only pass; no tests were run.

