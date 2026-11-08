# S33 traceability — S33-PO-4

| FR | Task | Test | Evidence |
|---|---|---|---|
| FR-015, FR-016a | T900 | `tests/integration/catalog-server.test.ts::searches exercises created through the session wall by stored taxonomy payload keys` | Commit `dfa6fe6`; focused integration run on current head: 5 files / 41 tests passed. |

## S36 round 3 skeleton (planned; no ticks until RED then GREEN is recorded)

Planned tests are named for the tests to be written. Nothing in this table is verified. Evidence is added only after the test runs green on the assigned stack.

| FR | Task | Planned test (not yet written) | Evidence |
|---|---|---|---|
| FR-001, FR-002, FR-003, FR-004, FR-014, FR-018, FR-030 | T037 | contract tests for shared identity, exact eight-field allowlist and value formats, English-required/Arabic-optional Global and Workspace names, one optional Description in any language, at most three unique Alternatives, PO-only Global edits, local isolation, automatic Global appearance, defaults copied at addition, and Instructions-to-Notes preservation | none |
| FR-003, FR-014, FR-016 | T046, T047 | override identity, composite keys, CAS, idempotency, one audit event | none |
| FR-025 | T048 | alternatives child rows: composite targets, exactly-one-target CHECK, active-at-write | none |
| FR-023 | T043 | canonical video: current-version read, validator, allowlist key | none |
| FR-024 | T045 | private exercise video in version content | none |
| FR-026 | T049 | effective-resolution contract with per-field source | none |
| FR-027 | T056 | `ExerciseSnapshotV2` fixtures; rename, publish, rename, re-read sequence; non-video values frozen and current authorized Video returned on subsequent view | none |
| FR-028 | T050 | plan-view resolution without an active identity; merged source uses its own media | none |
| FR-029, FR-034 | T050, T051 | internal resolver: EXECUTE grants, composite match, whole-call generic denial, cache key | none |
| FR-031 | T054, T055 | legacy write revoked from client roles; parity fixture move | none |
| FR-013 | T057 | audit allowlist with `video`, `instructions`, `alternatives` codes | none |
| FR-022 | T060 | F12 guard rejects `workspace_id` changes | none |
| FR-014 | T061 | host list parity across SQL and TypeScript validators; `docs.google.com` rejected | none |
| FR-031 | T062, T063 | carry valid non-dummy legacy videos; delete dummy `docs.google.com` values; “no video lost” excludes these dummy links; Notes/Instructions preservation | none |
| FR-035 | T064 | override search normalization and bounds | none |
| SC-005 | T065 | library list and batch resolve benchmark on a 10k fixture | none |
| SC-013 | T037, T047 | Rest/RIR/Reps boundary and format validation | none |
| SC-016 | T037, T062, T063 | preserve Notes and unique Instructions into Notes; no Instructions library field | none |
