# Analyze — F11 client accounts

## S40 spec-only analysis — 2026-11-09 (current; supersedes the scope gate below for S40 items)

- Date: 2026-11-09 (round 2, after the CodeRabbit round-1 fixes; written after the last S40 change to spec.md, plan.md, tasks.md and traceability.md).
- Scope: FR-018..FR-024, SC-013..SC-017, User Stories 5–8, S40 clarification (PO quotes and S40-F11-MCQ-1..9), plan.md "S40 proposals", tasks T047–T054 (unticked), traceability S40 rows.
- Entry check (pre-PR, recorded in `report.md`): the existing scope PASSES; the NEW scope FAILS pre-PR (no FR/SC/Given-When-Then, no plan coverage, analysis dated 2026-11-04). This PR supplies the specification artifacts. No implementation is started.
- Quote check: all PO quotes that appear in spec.md are byte-exact substrings of their PO records (`runs/s40-haiku-f11-spec/quote-check.mjs`: 9 of 9 spec-quoted lines OK; the 10th checked line is cited only in report.md).
- Coverage: FR-018 → T047, T048, SC-013, SC-014. FR-019 → T047, SC-013. FR-020 → T047, T048, SC-014. FR-021 → T049, T051, T056, SC-015. FR-022 → T050, T052, T055, SC-016. FR-023 → T050, T055, SC-016. FR-024 → T052, T053, T057, SC-017. Every SC has a task; every task has an FR tag; no FR without a task. T054 is per-requirement documentation.
- Unchanged by this PR: `specs/012-registration-approval` (no owned behaviour), `specs/003-tenancy-rls`, all code, SQL and migrations.

### Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| A-S40-1 | MEDIUM (open, PO) | Release mechanism for deleted identifiers conflicts with S37-PO-16 "No hard deletion/new mechanism" and with the release guard in `client_accounts_model.sql:174–176`. | OPEN — S40-F11-MCQ-2; blocks T048, T050 |
| A-S40-2 | MEDIUM (open, PO) | Auth-side write rule: spec 013 forbids direct writes to Auth-managed tables; spec 011 FR-003 allows direct writes for signup only. | OPEN — S40-F11-MCQ-2 |
| A-S40-3 | MEDIUM (open, PO) | Any assignment capability would change the capability matrix, which FR-008 keeps unchanged. | OPEN — S40-F11-MCQ-4 |
| A-S40-4 | MEDIUM (open, PO) | Deletion scope (client only or also the replaced PO account), deletion precondition for history, and last-PO deletion are undecided. | OPEN — S40-F11-MCQ-1, -3, -6 |
| A-S40-5 | MEDIUM (dependency) | The last-PO guard is not implemented on origin/main (`specs/003-tenancy-rls/research.md:32`, F-A1; `tasks.md` T015 pending). It blocks PO-account deletion only, and only if MCQ-1 = B. | OPEN dependency on spec 003 |
| A-S40-6 | MEDIUM (dependency) | F15 spec is not on origin/main. The F15 side of S39-PO-8 (F15 spec/tasks/tests/docs) cannot be done in this PR. | OPEN — blocks T053 only |
| A-S40-7 | MEDIUM (governance) | Independent critique of this spec is not approved (`docs/03-roadmap.md:40`; S36-PO-5: each invocation needs explicit PO approval). | OPEN — PO approval needed before implementation |
| A-S40-8 | LOW (terminology) | The brief says "workspace's last PO". PO access is platform-scoped (`supabase/migrations/20261027120000_tenancy.sql:43–45`). The spec reads it as the platform's last PO (MCQ-6). | Noted |
| A-S40-9 | RESOLVED (premise) | S36-01 presumed an existing F12 client assignment; none exists on origin/main (`specs/012-registration-approval/spec.md:175`). S39-PO-8 directs "add assignment to F11/F12 spec", so it is specified as new. | CLOSED in spec (FR-022); architect informed via report.md |
| A-S40-10 | RESOLVED (scope) | Spec 011 Out of Scope listed "closure/deletion implementation" and "trainer assignment". The line is amended so the new FRs are not contradicted. | CLOSED |
| A-S40-11 | RESOLVED (CodeRabbit round 1 on 745ada66, six findings, all valid) | (a) plan P-S40-1 step 3: the Auth placeholder conflicts with the agreement check in `client_accounts_model.sql:168–172`; a scoped exception is proposed. (b) P-S40-2: a revoked membership must not return an active assignee; T050 covers it. (c) SC-013 now excludes the identifiers supplied for the new signup. (d) T055 and T056 added as blocked implementation tasks. (e) T053 split: the F15 release test is separate and is not blocked by MCQ-8; the future alert fixture is T057. (f) T054 is per-requirement, not gated on future work. | CLOSED in this round; re-analysed here |

### Gate verdict

- CRITICAL open: 0. HIGH open: 0. MEDIUM open: 7 (A-S40-1..7), all PO-blocked or dependency-blocked; none is a defect in the spec text.
- "No open ambiguities" is NOT stated for S40. Nine PENDING-PO items (S40-F11-MCQ-1..9) remain open. Under S37-PO-1 Q1, implementation of the affected tasks is BLOCKED until the PO answers them. Unaffected: T049 (DB-level workspace creation tests) may be specified now; no implementation is started.

## Prior scope gate (superseded for S40 items; retained for history)

- Date: 2026-11-04
- Scope: S33-PO-4 test-only recovery RLS probe bounding and diagnostics (T900).
- Spec: Existing FR-008 and FR-012 and their Given/When/Then recovery/authorization scenarios remain unchanged. The S33 clarification is recorded in `spec.md` and explicitly leaves ND-F5-1/B4 open.
- Plan: S33 plan section scopes work to test probes and failure diagnostics; no client recovery behavior or authorization policy changes.
- Tasks: T900 is tagged FR-008 and FR-012; synthetic fixtures only.
- Findings: 0 open CRITICAL, 0 open HIGH. No product behavior, permissions, retention, UI, or schema decision is introduced.
- Gate: PASS for S33 test-only work. Existing open F11 decisions remain out of scope.

## Post-verification S33 re-analysis — 2026-11-04

T900 has been marked complete only after its focused integration tests passed on the committed code head. Traceability records commit `1d157df` and executed coverage. S33 scope remains test-only; 0 open CRITICAL/HIGH findings.
