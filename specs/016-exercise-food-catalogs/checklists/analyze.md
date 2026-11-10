# Analyze — F16 post-critique disposition (S40 round 13, current; round 12 record follows)

## Round 13 (current)

- Date: 2026-11-09 17:47 +02:00 (15:47 UTC), after CodeRabbit review `5828405929` (submitted 15:45:01Z) on head `c03957b46c778ccbad69c5f92ed5b2da1c9f8b65`. Its inline thread `4514683205` (`tasks.md:40`, T068) has two findings. Dated after every round-13 spec-artifact edit (`tasks.md` T068 only); this record is the last spec-artifact change of the round.
- Scope (round 13): spec-only, technical gaps in T068 within the decided scope S40-PO-5, S40-PO-7, S40-PO-8 (PO) and S40-R11, S40-R15 (architect). No code, SQL, migration, fixture or test file changed; "tests" below are planned RED test descriptions in `tasks.md`. No new product question.
- Head at start of round 13: `c03957b46c778ccbad69c5f92ed5b2da1c9f8b65`.

Entry check: PASS.

| ID | Source | Severity | Status | Disposition |
| --- | --- | --- | --- | --- |
| R13-1 | CodeRabbit review `5828405929`, `tasks.md:40` T068 finding A (Major, data integrity) | HIGH | FIXED | Valid: an invocation that started before the cutover keeps the RPC body it loaded, so the round-12 re-validation (new bodies only) does not cover it. T068 adds a BEFORE INSERT guard on `exercise_versions` and `workspace_exercise_versions`, installed by the cutover transaction, using the same shared validator as T074 and T075 and raising the RPC's existing validation error. Concurrency test: start the old invocation before cutover, pause after validation, resume after cutover, expect rejection with no version row inserted. |
| R13-2 | CodeRabbit review `5828405929`, `tasks.md:40` T068 finding B (Major, data integrity) | HIGH | FIXED | Valid: the disposability gate and the locked identity comparison were separate checks, so the verified set could differ from the deleted set. T068 binds the gate result to the exact verified IDs; the locked transaction compares the set it deletes against them; any difference pauses the deletion and repeats the gate; no deletion if disposability cannot be established. Concurrency test: an identity added after the gate and before the lock. |
| R13-3 | Addendum C self-review of the touched T068 text | — | CHECKED | Covered: in-flight (R13-1); delete (verified set, R13-2); concurrency (tests in R13-1 and R13-2); retry: a rejected stale create returns the RPC's existing validation error, so no new copy is needed. No undefined state left and no new product question. |
| R13-4 | S40-PO-5 target-database check | — | GATE (implementation, unchanged from R12-6) | Not performed: spec-only round, no target-database access. |

## Round 12

- Date: 2026-11-09 16:28 +02:00 (pass 4, after the CodeRabbit follow-up reply `4513754684` on head `9b6c0279`, which found that the pass-3 lock order alone did not prevent the cycle; see R12-13). Pass 3 at 16:17 +02:00 (after CodeRabbit review `5827087965` on `4b84e288`; pass 2 at 16:02 +02:00 after review `5826912779` on `a0aff053`; pass 1 at 15:48 +02:00 for commit `a0aff053`). Dated after every round-12 spec-artifact edit (`spec.md`, `plan.md`, `tasks.md`, `data-model.md`, `traceability.md`, `contracts/catalog-api.md`, `contracts/export-read-isolation.md`); this record is the last spec-artifact change of the round.
- Scope (round 12): S40-PO-8 (PO; verbatim quote in `spec.md` "S40 round 12") resolves PDN-S40-F16-05 (A) and PDN-S40-F16-06 (B). S40-R15 (architect ruling, NOT PO) resolves PDN-S40-F16-04. Spec-only: no code, SQL, migration, fixture or test file changed; "tests" below are the planned RED test descriptions in `tasks.md`.
- Head at start of round 12: `6fe8228aaeaaf44f0e579a98376ce2ae01f844b6`.

Entry check: PASS.

| Check | Result | Evidence |
| --- | --- | --- |
| numbered FRs and measurable SCs with Given/When/Then for the touched scope | PASS | `spec.md` US2 scenario 9; FR-011, FR-014, FR-020, FR-031, FR-038; SC-016 |
| Clarifications recorded with PO source or architect label | PASS | `spec.md` "S40 round 12 — S40-PO-8" quotes `s40-po-1.verbatim.txt` S40-PO-8 byte-exact (architect mapping labelled); "S40 round 12 — S40-R15" quotes `s40-architect-rulings.md` (labelled architect ruling, not PO) |
| plan.md and tasks.md cover the touched scope with task IDs | PASS | `plan.md` status, migration steps 1 and 3, snapshot paragraph; `tasks.md` T037, T054, T058, T062, T063, T068, T074 and dependency order |
| analyze dated after last change, 0 open CRITICAL/HIGH | PASS | this record |

| ID | Source | Severity | Status | Disposition |
| --- | --- | --- | --- | --- |
| R12-1 | PDN-S40-F16-04, architect ruling S40-R15 | MEDIUM | RESOLVED (architect, not PO) | Legacy Notes are deleted with their rows; S36-PO-5 note preservation applies to non-legacy data only. Edge Cases note bullet (`spec.md` former line 103) reworded. FR-031, FR-038, SC-016, T054, T062(b), T063, `data-model.md` row 26, traceability updated. |
| R12-2 | PDN-S40-F16-05, PO S40-PO-8 = A | MEDIUM | RESOLVED (PO) | Cutover deletes all pre-F16 exercise data, defined in FR-031 (legacy variation rows and history; pre-F16 canonical and workspace-private identities, versions and videos). Updated: FR-011 exception, FR-014, FR-020 exception, FR-038, US2 scenario 9, SC-016; `plan.md` status, steps 1 and 3, snapshot paragraph; `data-model.md` (new pre-F16 identity row); T037, T054, T062(a), T063, T068, T074, dependency order; traceability; `contracts/catalog-api.md`. CodeRabbit thread `PRRT_kwDOVYgYQ861RQcN` (`plan.md:73`) is answered after the push. |
| R12-3 | PDN-S40-F16-06, PO S40-PO-8 = B | MEDIUM | RESOLVED (PO) | Trainer exercise Notes (workspace override and workspace-private) are part of the client-visible frozen snapshot and the F19/P4 projection; no flag, no new copy. Updated: `contracts/export-read-isolation.md:4`; T058 (projection includes frozen Notes; a later trainer edit does not change the published value; mutation test); traceability row FR-027/FR-029 to T058. CodeRabbit thread `PRRT_kwDOVYgYQ861RQcB` (`contracts/export-read-isolation.md:4`) is answered after the push. |
| R12-4 | Consequence of S40-PO-8 F16-05 = A | MEDIUM | CLOSED (covered by S40-PO-8; not raised as PO question) | The conditional conversion PO item of plan step 1 (preserve-history versus written conversion rule) no longer applies, because pre-F16 content is deleted, not converted. Recorded in plan step 1 and T068. |
| R12-5 | Consequence of S40-PO-8 F16-05 = A | LOW | CLOSED (acceptance criterion fixed) | Mock snapshots are "deleted or reset" (architect mapping of S40-PO-8). The per-snapshot choice is an implementation choice inside a fixed criterion: after cutover no snapshot or plan row may reference a deleted identity or version (FR-038, SC-016; T054 and T063 tests). It changes no user-visible rule, and no default is encoded here. |
| R12-6 | S40-PO-5 verification | — | GATE (implementation, not an ambiguity) | The target-database check that no real data is affected is a precondition of the deletion (FR-031; T068 deletion gate). It has NOT been performed: this round is spec-only and has no target-database access. |
| R12-7 | CodeRabbit review `5826912779`, `contracts/catalog-api.md:101` (Minor, data integrity) | LOW | FIXED | Consequence of R12-3: the "only catalog-derived value" sentence now excludes frozen snapshot values (trainer Notes, S40-PO-8); the live-projection limit is kept. `contracts/export-read-isolation.md:3` ("one catalog-derived client value") fixed the same way. Reply cites `a0aff053` pass 2 commit. |
| R12-8 | CodeRabbit review `5826912779`, `tasks.md:26` T054 (Major, data integrity) | HIGH | FIXED | Valid: `exercise_lifecycle_events` and `workspace_exercise_lifecycle_events` are append-only (trigger) with restrictive foreign keys to the identities (`supabase/migrations/20261106113000_catalog_exercise_lifecycle_merge.sql`, `20261108100100_catalog_workspace_exercise_remove.sql`). Under S40-PO-8 they are pre-F16 exercise data: FR-031, data-model pre-F16 row and T054 delete them before their identities (superseding identities before `superseded_by` targets); the cutover migration is the only deletion path; `audit_events` are never deleted (FR-011). Upgrade cases added to T054. Not a new PO question: consequence of S40-PO-8. |
| R12-10 | CodeRabbit review `5827087965`, `spec.md` FR-034 cache key (Major, data integrity) | HIGH | FIXED | Valid: the key named user, plan version and workspace, so two plans with the same published version for one user and workspace could share a cached result. FR-034 now adds the plan identity; T051 and `plan.md` cache rule add the same-version test. Reply cites the pass-3 commit. |
| R12-11 | CodeRabbit review `5827087965`, `tasks.md:40` T068 lock order (Minor, stability) | MEDIUM | FIXED in pass 3, SUPERSEDED by R12-13 | Valid finding: `catalog_version_exercise` takes a row lock before its version insert, so a cutover lock could form a cycle. The pass-3 wording (lock order alone) was insufficient; see R12-13. |
| R12-13 | CodeRabbit follow-up reply `4513754684` on `tasks.md:40` (T068), verified against PostgreSQL lock conflicts | MEDIUM (stability) | FIXED | `FOR UPDATE` takes ROW SHARE, which `SHARE ROW EXCLUSIVE` does not block, so the cutover could lock the version table while a writer still held its row lock: a cycle. T068 now takes EXCLUSIVE on the canonical and workspace-private identity tables first (conflicts with ROW SHARE; drains in-flight row-locking writers and blocks new ones), then SHARE ROW EXCLUSIVE on the version, variation and lifecycle tables in writers' order. The concurrency test asserts that the cutover waits for the writer and that no deadlock abort occurs. `plan.md` step 1 aligned. Technical; no product question. |
| R12-12 | CodeRabbit review `5827087965`, `tasks.md` T075 joint delivery (Major, data integrity) | HIGH | FIXED | Valid: T075 changes the private validator used by `catalog_write_workspace_exercise` while the authoring form can still submit `instructions_*`. S40-R11 joint delivery now includes T075 (T075, T074, dependency order, `plan.md` step 3); it never deploys separately. Technical consequence of S40-R11; no new product question. |
| R12-9 | CodeRabbit review `5826912779`, `tasks.md:40` T068 (Major, data integrity) | HIGH | FIXED | Valid: a create RPC that validated before waiting for the cutover lock could insert a stale payload after cutover. T068 now requires both create RPCs (`catalog_create_exercise`, `catalog_write_workspace_exercise`) to re-run validation after the lock and before insertion, with concurrency tests for both paths (pause after validation, cutover completes, resume, stale payload rejected through the existing validation error path). Technical; no new user copy. |

- Severity (open): **CRITICAL 0, HIGH 0, MEDIUM 0**.
- "No open ambiguities": **STATED** for round 12. Basis: PDN-S40-F16-02 (S40-PO-7), -03 (S40-R11), -04 (S40-R15), -05 and -06 (S40-PO-8) are all resolved. R12-4 and R12-5 are consequences inside existing PO decisions with a fixed acceptance criterion; R12-6 is a gate, not a question. The round-11 "NOT stated" lines below are superseded by this record.
- CodeRabbit pre-round state: 72 review threads, 1 page, 2 unresolved (`PRRT_kwDOVYgYQ861RQcB`, `PRRT_kwDOVYgYQ861RQcN`); evidence `C:/Users/NEW LAP/.lifter/runs/s40-haiku-f16-r12/threads-pre.json`.

## Round 11 (history)

- Date: 2026-11-09 15:38 +02:00 (pass 3, after CodeRabbit review `5826613092` on `616cc9fa`; spec.md FR-011 and SC-009 edited; this record is the last spec-artifact change of the round). Pass 2 at 15:27 +02:00 ( after CodeRabbit review `5826471568` on `eb4c1e3d`; after every round-11 spec-artifact edit, including the pass-2 edits to `tasks.md` T062, T063, T068, `plan.md` step 1 and status, and `spec.md` PDN-S40-F16-05 and -06. Earlier pass-1 record at 15:13 +02:00. Edits: `spec.md` S40 round 11 entry, US2 scenario 9, FR-014, FR-031, FR-038, SC-016 and the `spec.md:103` scope note; `plan.md` status, migration steps 1 and 3; `data-model.md` (`exercise_variations`, `exercise_variation_versions`, Effective resolution); `tasks.md` (T052, T054, T062, T063, T074, dependency order); `traceability.md` (FR-026, FR-031, FR-032, SC-016); `contracts/catalog-api.md`. This record is the last spec-artifact change of the round.
- Scope (round 11): S40-PO-7 (PO, verbatim quote in `spec.md` "S40 round 11 — S40-PO-7") resolves PDN-S40-F16-02. S40-R11 (architect ruling, not PO) rules PDN-S40-F16-03: joint delivery of T054, T040 and T074, with the interim guards removed. S40-R12 (architect ruling) adds the `workspace_private` branch to the effective resolution contract. S40-R13 (architect ruling) adds the pre-deployment ordering gate to T052. Opens PDN-S40-F16-04 (PO). Spec-only: no code, SQL, migration, fixture or test changed.
- Head at start of round 11: `c886ce10e9060ef6701a81e048e89f5a7dcef963`.

## Entry check (Spec Kit gate, section 1) — round 11

| Check | Result | Evidence |
| --- | --- | --- |
| spec.md has numbered FRs, measurable SCs and Given/When/Then scenarios for the touched scope | PASS | FR-001 to FR-038 (incl. FR-016a), 39 keys; SC-001 to SC-016, 16 keys; US2 scenario 9 edited in place (numbering unchanged). |
| Clarifications recorded, or a PO-decision register entry citing the PO source | PASS | `spec.md` "S40 round 11 — S40-PO-7" quotes the PO answer `A: Delete all (Rec.)` and the architect mapping byte-exact against `s40-po-1.verbatim.txt` lines 27-28. "S40 round 11 — architect rulings S40-R11, S40-R12, S40-R13" quotes the three paragraphs byte-exact against `s40-architect-rulings.md` (labelled architect rulings, NOT PO). PDN-S40-F16-04 recorded as open. |
| plan.md covers the touched scope; tasks.md has task IDs tagged with FR IDs | PASS | `plan.md` status, steps 1 and 3; `tasks.md` T052, T054, T062, T063, T074, dependency order. No task added; 92 task IDs unchanged. |
| checklists/analyze.md dated after the last spec/plan/tasks change, 0 open CRITICAL/HIGH | PASS | This record (2026-11-09 15:13 +02:00); open CRITICAL 0, open HIGH 0 (see findings). |

Result: **PASS** for the touched scope (spec-only). Implementation is NOT authorized. No task is ticked. Tasks T037, T040, T049, T054, T057, T062, T063 and T074 remain unticked.

## Findings (round 11)

| ID | Area | Severity | Status | Disposition |
| --- | --- | --- | --- | --- |
| R11-1 | PDN-S40-F16-02, decided by S40-PO-7 | — | FIXED (PO) | Legacy exercise rows, their immutable version history (`exercise_variation_versions` rows of legacy rows) and legacy videos are deleted at cutover, none carried over. Encoded in FR-014, FR-031, FR-038, US2 scenario 9, SC-016, `plan.md` steps 1 and 3, `data-model.md` rows 25 and 26, T054, T062(a), T063, T074 (upgrade test), dependency order, `traceability.md` FR-031 and SC-016, `contracts/catalog-api.md`. Carry-over checks and the backfill rule are removed as moot. Audit history is not rewritten. |
| R11-2 | PDN-S40-F16-03, ruled by S40-R11 (architect, not PO) | — | FIXED (architect ruling) | Joint delivery of T054, T040 and T074 in one PR and deploy. The round-10 interim write-path guard and interim default-bounds guard in T054 are removed with their upgrade and post-cutover tests (plan step 3, T054, T074). |
| R11-3 | S40-R12, workspace_private branch (CodeRabbit `PRRT_kwDOVYgYQ861QIW-`) | MEDIUM | FIXED (architect ruling) | `data-model.md` Effective resolution gains the `workspace_private` input and result branch: private-row values and sources; missing field source `none`; private video is its own `video_url` or `none`; no canonical or override fallback. Canonical branch unchanged. Source label matches the `ExerciseSnapshotV2` vocabulary (FR-027). |
| R11-4 | S40-R13, T052 ordering gate and STOP/recovery (CodeRabbit `PRRT_kwDOVYgYQ861QIXF`) | MEDIUM | FIXED (architect ruling) | T052 gains gate (c): pre-deployment comparison of unapplied F16 migrations with the target's applied versions; a published F16 migration that now sorts earlier is a STOP; no automatic waiver; recovery case by case under S36-PO-4 item 6, S40-PO-1 and S40-PO-4. `traceability.md` FR-032 updated. |
| R11-5 | PDN-S40-F16-04, Notes destination of legacy note text (found in round 11) | MEDIUM | OPEN (PO) | S40-PO-7 deletes the legacy rows. S36-PO-5 ("Keep existing Notes") and `spec.md:103` ("no legacy note text is deleted or rewritten") still apply, and S40-PO-7 says every other rule is unchanged. The conflict is not decided here. Blocked: Notes part of T062(b) and T063, the T054 deletion order, the legacy-row note clause of FR-031 and `spec.md:103`. Options and advisory recommendation in `spec.md` "S40 round 11 — PDN-S40-F16-04". Other tasks are unaffected. |

## Pass 2 findings (CodeRabbit round 11, review `5826471568` on `eb4c1e3d`, 3 inline comments)

Severity below is this record's own classification. CodeRabbit labels all three "Major".

| ID | Area | Severity | Status | Disposition |
| --- | --- | --- | --- | --- |
| R11-6 | `tasks.md:40` (T068 locked recheck omits `exercise_variations` and `exercise_variation_versions`) | MEDIUM (CodeRabbit Major, valid) | FIXED | T068 recheck, identity comparison and cutover lock now include both legacy variation tables; T063 concurrency test covers an authorized concurrent variation write during the recheck and the deletion. Spec-only; no task ticked. |
| R11-7 | `plan.md:73` (define which identities count as "legacy") | MEDIUM (CodeRabbit Major, scope question) | OPEN (PO), PDN-S40-F16-05 | The scope of S40-PO-5/S40-PO-7 "legacy exercise rows" is a PO question. Until answered, plan step 1 and T062 limit the deletion to the legacy variation tables and their videos; canonical and private identities are not deleted under this plan. Options and advisory recommendation in `spec.md` "S40 round 11 — PDN-S40-F16-05". |
| R11-8 | `contracts/export-read-isolation.md:4` (omit trainer Notes from client projections) | MEDIUM (CodeRabbit Major, product question) | OPEN (PO), PDN-S40-F16-06 | Client visibility of trainer Notes is not decided in the spec. Not changed (no default encoded). Options and advisory recommendation in `spec.md` "S40 round 11 — PDN-S40-F16-06". Blocks only the client Notes projection (T058, F19/P4). |

Pass-2 gate check: open CRITICAL 0, open HIGH 0. The three CodeRabbit "Major" items are recorded as MEDIUM because each is an open PO question that blocks only its own part, consistent with the round-10 treatment of PDN items.

## Pass 3 findings (CodeRabbit round 11 second review, `5826613092` on `616cc9fa`, 2 inline comments)

| ID | Area | Severity | Status | Disposition |
| --- | --- | --- | --- | --- |
| R11-9 | `spec.md:124` FR-011 (immutability rule vs approved cutover deletion) | LOW (CodeRabbit Minor, valid) | FIXED | FR-011 excepts the approved cutover deletion of legacy variation version history under FR-031 and FR-038 (S40-PO-7; scope PDN-S40-F16-05). Audit events are stated as never deleted. |
| R11-10 | `spec.md:180` SC-009 (only override or Global video) | MEDIUM (CodeRabbit Major, valid) | FIXED | SC-009 now also covers a workspace-private exercise's own current video or explicit absence (`none`) (FR-024, FR-026; F16-MCQ-9 answered a). The restriction on other workspaces' media is kept. |

Pass-3 gate check: open CRITICAL 0, open HIGH 0. Open MEDIUM: PDN-S40-F16-04, PDN-S40-F16-05, PDN-S40-F16-06 (unchanged; PO items).

## Counts (round 11)

- Requirements inventory: FR-001 to FR-038 (incl. FR-016a), 39 keys; SC-001 to SC-016, 16 keys; US1 to US6.
- Tasks: 92 task IDs, unchanged. No task ticked.
- Severity (open): **CRITICAL 0, HIGH 0**. Open MEDIUM: PDN-S40-F16-04 (PO, R11-5), PDN-S40-F16-05 (PO, R11-7), PDN-S40-F16-06 (PO, R11-8). Process item R10-5 (CodeRabbit approval record, not a spec ambiguity) stays as recorded in the round-10 record.
- "No open ambiguities": **NOT stated.** PDN-S40-F16-04, PDN-S40-F16-05 and PDN-S40-F16-06 are open. PDN-S40-F16-02 is resolved (S40-PO-7). PDN-S40-F16-03 is ruled by the architect (S40-R11), not by the PO.

---

## Round 10 record (history; superseded by the round-11 record above)


- Date: 2026-11-09 14:32 +02:00 (after every round-10 spec-artifact edit: `spec.md` S40 round 10 entry and edits at lines 40, 112, 116, 146, 187; `plan.md`; `data-model.md`; `research.md`; `contracts/catalog-api.md`; `tasks.md`; `traceability.md`; `verification-s40-po5.md`). This record is the last spec-artifact change of the round.
- Scope (round 10): S40-PO-5 (PO, verbatim quote in `spec.md` Clarifications, "S40 round 10"). Resolves PDN-S40-F16-01. Replaces the Instructions-to-Notes carry-over for legacy exercise rows only; every other S36-PO-5 rule is unchanged. Opens PDN-S40-F16-02 and PDN-S40-F16-03. Spec-only: no code, SQL, migration, fixture or test changed.
- Head at start of round 10: `c6d620b9ec47a2facf8bfac08ea654cd945514ac` (PR #66 headRefOid verified at the start gate).

## Entry check (Spec Kit gate, section 1) — round 10

| Box | Result | Evidence |
| --- | --- | --- |
| spec.md has numbered FRs, measurable SCs and Given/When/Then scenarios for the touched scope | PASS | 39 FR keys (FR-001 to FR-038 incl. FR-016a) and 16 SC keys, counts unchanged. Touched: US2 scenario 9 (`spec.md:40`), FR-038 (`:112`), FR-003 (`:116`), FR-031 (`:146`), SC-016 (`:187`). |
| Clarifications recorded, or a PO-decision register entry citing the PO source | PASS | `spec.md` "S40 round 10 — S40-PO-5" quotes the PO line verbatim (byte-checked against `s40-po-1.verbatim.txt` line 18). PDN-S40-F16-02 and PDN-S40-F16-03 are recorded as open PO items. "No open ambiguities" is NOT stated. |
| plan.md covers the touched scope; tasks.md has task IDs tagged with FR IDs | PASS | `plan.md` line 20, migration steps 1 and 3 (lines 73, 75), line 166. `tasks.md`: 92 task IDs unchanged, no task added or removed; the touched rows keep their FR tags. T067 and T069 remain untagged by design (historical). |
| checklists/analyze.md dated after the last spec/plan/task change, with 0 open CRITICAL/HIGH | PASS | This record (2026-11-09 14:32 +02:00) is the last spec-artifact change of the round. Open CRITICAL 0, HIGH 0 (R10-2 and R10-3 are MEDIUM, see below). |

Result: **PASS** for the touched scope (spec-only). Implementation is NOT authorized. Tasks T037, T040, T049, T054, T057, T062, T063 and T074 remain unticked. The T054 write-path guard, the deletion scope (T062(a), T063) and the interim handling (T074) are blocked until PDN-S40-F16-02 and PDN-S40-F16-03 are answered.

## Round-10 findings

| ID | Category | Severity | Status | Summary and evidence |
| --- | --- | --- | --- | --- |
| R10-1 | Decision encoding | — | FIXED | S40-PO-5 encoded: the Instructions-to-Notes carry-over is replaced by legacy-row deletion at cutover, Notes only, no Instructions field. Every other S36-PO-5 rule unchanged. |
| R10-2 | Open PO item (scope of "delete") | MEDIUM | OPEN (PO) | PDN-S40-F16-02. S40-PO-5 says "Delete them"; `data-model.md` (`exercise_variation_versions` row) and FR-031 keep legacy history readable and unchanged; T062(a), T063 and FR-031 carry valid legacy videos ("no video lost", S37-PO-10). Blocks T062(a), T063 and the legacy history rows. MEDIUM, not HIGH: no implementation is authorized this round and the conflict is confined to legacy rows. |
| R10-3 | Open PO item (interim writes) | MEDIUM | OPEN (PO) | PDN-S40-F16-03. Handling of an `instructions_*` key that a version write submits between T054 and the joint T040/T074 change. Blocks the T054 guard and the T074 interim upgrade tests. MEDIUM for the same reason as R10-2. |
| R10-4 | Verification | — | DONE | No real data affected: `verification-s40-po5.md`. No test in the PR asserts the Instructions merge (the PR changes `specs/016` only; checked with `git diff --name-only origin/main...HEAD`), so no test file is edited; the RED tests in T037 and T074 carry the updated assertions. |
| R10-5 | Process | MEDIUM | OPEN (process, not a spec ambiguity) | CodeRabbit APPROVED on the final head is recorded in the round-10 report, §3. |
| R10-6 | Scope encoding (CodeRabbit pass 1, review `5825697710` on `989e5de7`, `plan.md:3`) | MEDIUM | FIXED | The plan status line still said "All F16 product decisions are closed". Replaced: round 10 status; PDN-S40-F16-02 and -03 open and blocking. |
| R10-7 | Scope encoding (CodeRabbit `spec.md:112`) | HIGH | FIXED | FR-038 (and US2 scenario 9, FR-003, FR-031, SC-016) conditioned deletion on Instructions being present. S40-PO-5 says "All legacy exercises ... Delete them". Fixed: every legacy exercise row is deleted, including rows without Instructions; none remains after cutover. |
| R10-8 | Residual merge wording (CodeRabbit `spec.md:141`) | HIGH | FIXED | FR-026 still said "receive preserved unique legacy Instructions data" (missed in the first pass). Fixed to "no legacy Instructions text is merged into Notes (S40-PO-5)". Checked: `data-model.md:50` (FR-026 effective resolution) has no Instructions-merge rule. A residual merge sentence in the `exercise_overrides` row (`data-model.md:22`) was found on re-check and fixed in the same pass. |
| R10-9 | Verification gate (CodeRabbit `spec.md:258`) | MEDIUM | FIXED | The round-10 verification concluded "STOP not met" from repo evidence only. Fixed: repo-side result stated as such; a target-database deletion gate added to T068 (stop the cutover if it cannot be established). |
| R10-10 | Dependency / tests (CodeRabbit `tasks.md:26`, deletion conditional on `instructions_*`) | HIGH | FIXED | T054 made the deletion conditional on the validator's handling of Instructions. Fixed: deletion covers every legacy row; RED tests cover rows with and without `instructions_*` and assert none remains. T062(b) aligned. |
| R10-11 | Write paths (CodeRabbit `tasks.md:26`, both create paths) | HIGH | FIXED | The interim guard named no RPC. Verified in `supabase/migrations/20261106110000_catalog_exercise_operations.sql:82` (`catalog_create_exercise(uuid, jsonb)`) and `20261106111000_catalog_workspace_exercise_operations.sql:2` (`catalog_write_workspace_exercise`). Fixed in T054 and plan step 3: the guard covers every write RPC that accepts `instructions_*`, with RED tests for both create paths. Handling itself stays PDN-S40-F16-03 (open). |
| R10-12 | Verification (CodeRabbit additional comment, `verification-s40-po5.md:18`, unverified finding) | MEDIUM | FIXED | Accepted in substance: the verification did not inspect any target database. The file now has an "Environments and what is NOT verified" table; the conclusion is scoped to repo-side evidence. |
| R10-13 | CodeRabbit pass 2 (review `5825853617` on `b1f20f96`, `data-model.md:26`) | MEDIUM | FIXED | The `exercise_variation_versions` row stated legacy history and video handling as settled. Now marked PENDING PDN-S40-F16-02; the T062(a) carry-over rules stay blocked until it is answered. |
| R10-14 | CodeRabbit pass 2 (`tasks.md:26`, interim default bounds on both create paths) | HIGH | FIXED | T054 interim guard now enforces the existing FR-003 bounds (Rest 0-600 in 15 s, RIR 0-5, Reps integer or range 1-100) on every create and version write after the T068 cutover check, on `catalog_create_exercise` and `catalog_write_workspace_exercise`, with post-cutover tests on both paths. This applies an existing requirement; no new product choice. |
| R10-15 | CodeRabbit pass 2 (`data-model.md:50`, workspace-private branch in the effective resolution contract) | MEDIUM | SKIPPED (outside S40-PO-5; architect item A-R10-2) | The request asks for a new resolver input and result branch for workspace-private exercises. That design is not part of S40-PO-5 and would define new behaviour. Not changed; FR-026 canonical-only and no-fallback rules unchanged. |
| R10-16 | CodeRabbit pass 2 (`tasks.md:24`, T052 ordering gate and recovery path) | MEDIUM | SKIPPED (outside S40-PO-5; architect item A-R10-3) | T052 is pre-existing and not touched by S40-PO-5. A recovery path for a published migration that sorts earlier is a design decision. Not changed. |

## Counts (round 10)

- Requirements: 39 FR keys, 16 SC keys. Tasks: 92 distinct IDs (unchanged).
- Ambiguities (product and spec): **2 open**, both PO items (PDN-S40-F16-02, PDN-S40-F16-03). Two architect items from CodeRabbit pass 2 are out of S40-PO-5 scope and skipped with reasons (R10-15, R10-16; A-R10-2, A-R10-3).
- Severity (open): **CRITICAL 0, HIGH 0** (open MEDIUM: PDN-S40-F16-02, PDN-S40-F16-03, R10-15, R10-16, R10-5).
- "No open ambiguities": NOT stated for round 10.

---

## Round 9 record (history; superseded by the round-10 record above)

- Date: 2026-11-09 14:32 +02:00 (round-9 re-analysis after the S40-R3 architect-ruling record was added to `spec.md` Clarifications and after the CodeRabbit round-9 fixes in `tasks.md` (T040 Global form and sequencing, T054, T074, dependency order) and `plan.md` step 3; this record is the last spec-artifact change of the round). Round 8 record below is history.
- Scope (round 9): architect ruling S40-R3 (`C:/Users/NEW LAP/.lifter/runs/s40-po/s40-architect-rulings.md`, paragraph S40-R3; architect words, not PO): A2 (table lock), A3 (`none` for FR-003-permitted absent optional values), A4 (`decision-register.md` unchanged), A5 (T090 and T043 as technical sequencing) accepted and recorded; A1 is a process item (fresh 2-request CodeRabbit allowance on the same head). No requirement, FR, SC, acceptance scenario, task or plan step changed. Spec-only: no code, SQL, migration, fixture or test changed.
- Head at start of round 9: `12015d3c9ad6f3ee37e660f9b0fe503b14ff48fb` (`origin/speckit-016-redesign`; PR #66 headRefOid verified at the start gate).

## Entry check (Spec Kit gate, section 1) — round 9

| Box | Result | Evidence |
| --- | --- | --- |
| spec.md has numbered FRs, measurable SCs and Given/When/Then scenarios for the touched scope | PASS | Re-verified: 39 distinct FR keys (FR-001 to FR-038, incl. FR-016a); 16 SC keys (SC-001 to SC-016); US1 to US6 unchanged. |
| Clarifications recorded, or a PO-decision register entry citing the PO source | PASS | `spec.md` Clarifications: new round-9 entry "S40 round 9 — architect ruling S40-R3 (architect ruling, not PO; no requirement change)", placed before "S36-PO-5 F16 (S37 round 5)". Plus the S38 round 7 entry. "No open ambiguities" stated explicitly below. |
| plan.md covers the touched scope; tasks.md has task IDs tagged with FR IDs | PASS (with the scope note below) | `tasks.md`: 92 task IDs, 92 distinct, no duplicate rows (T001 to T075, T900, T901, T076 to T090). 90 carry FR tags (checked per row, table and list forms). **T067 and T069 carry no FR tag by design**: they are historical audit rows (FR column `—`; T067 DONE in round 3, T069 in the F11/F12 lane, out of F16 scope). No work is planned under them. Corrected in round 9 after CodeRabbit `PRRT_kwDOVYgYQ861Opya`; the earlier "each FR-tagged" wording was wrong. |
| checklists/analyze.md dated after the last spec/plan/task change, with 0 open CRITICAL/HIGH | PASS | This record (2026-11-09 14:32 +02:00) is dated after the last spec-artifact edits of the round (`spec.md` S40-R3 record; `tasks.md` T040, T074 and dependency order). Open CRITICAL 0; open HIGH 0 after the fixes below. |

Result: **PASS**. Implementation is not authorized by this spec-only round. No task is ticked; T088 remains PENDING.

## Round-9 findings

| ID | Category | Severity | Status | Summary and evidence |
| --- | --- | --- | --- | --- |
| R9-1 | Traceability | LOW | RESOLVED (recorded) | S40-R3 is recorded in `spec.md` Clarifications with the architect-ruling label. The record states it is not a PO decision and changes no requirement. |
| R9-2 | Decision record | LOW | RESOLVED (by ruling) | A4: `decision-register.md` (a PO record) still carries the older F11/F12 wording (lines 20, 163, 185). Architect ruled no change; the F11/F12 spec lane carries client deletion. Recorded as pending in the F11/F12 lane, not in F16. |
| R9-3 | Process | MEDIUM | OPEN, process (not an ambiguity) | A1: CodeRabbit APPROVED on the exact head is not yet reached; handled in the round-9 report (CodeRabbit state), not in the spec. |
| R9-4 | Traceability (count claim) | LOW | FIXED | CodeRabbit `PRRT_kwDOVYgYQ861Opya` (`analyze.md:13`): the claim "all 92 tasks FR-tagged" was wrong; T067 and T069 have FR `—`. Corrected in the plan.md/tasks.md row above with the 90-tagged count and scope note. |
| R9-5 | Dependency / data integrity (Instructions transition) | HIGH (CodeRabbit Major) | FIXED | CodeRabbit `PRRT_kwDOVYgYQ861Opyn` (`tasks.md:47`): T040 could stop submitting `instructions_*` before T054 carries stored Instructions into Notes, so an edit in that window could store a version without them. Fixed in `tasks.md`, `plan.md` step 3 (second pass, after the CodeRabbit reply at 11:27Z on head `c9c031c8`): (1) the T054 cutover installs a write-path guard that applies the S36-PO-5 Instructions-to-Notes preservation rule to any `instructions_*` a version write submits until T074 (closes the interval after T054 in which the old validator still accepted those keys); (2) T040's `instructions_*` removal and T074's validator replacement activate as ONE atomic change, after T054 (removes the "or after it" conflict); (3) new T040 → T054 dependency for that removal only (no cycle: nothing in T054's chain depends on T040); (4) upgrade tests cover before T054, after T054 under the guard, and after the joint change; (5) dependency-order line updated. The guard reuses the existing S36-PO-5 rule and does not choose a Notes text format (architect item A6 in the round-9 report). This is technical sequencing, not a product choice (the removal of Instructions is already S36-PO-5). No PO question. |

| R9-6 | Scope consistency (Global form) | HIGH (CodeRabbit Major) | FIXED | CodeRabbit `PRRT_kwDOVYgYQ861PDsU` (`tasks.md:12`, T040): the Global authoring form was scoped to names and taxonomy, but spec.md line 16 and FR-003 say the PO creates canonical entries with exactly the eight FR-003 fields. Fixed in `tasks.md` T040: the Global form exposes all eight fields for create and edit, the request conversion sends all eight, create and edit tests assert all eight; FR-003 added to T040's FR tags. Existing requirement (no new product choice); the UI controls remain for the Design System gate at implementation. |

No new product question was raised in round 9. Open CRITICAL 0, HIGH 0 after the fixes (R9-5 and R9-6 were HIGH by CodeRabbit severity and are fixed in this round).

Round-8 findings (A7 resolved; R8-1, A18, A20, A21, A39, A50, A22, A38) carry forward unchanged. Their status is in the round-8 record below.

## Counts (round 9)

- Requirements: 39 FR keys, 16 SC keys. Tasks: 92 (T001 to T075, T900, T901, T076 to T090), 92 distinct IDs.
- Ambiguities (product and spec): **0 open**. No PO question raised; the S40-R3 rulings resolve no product question and create none.
- Severity (open): **CRITICAL 0, HIGH 0**.
- "No open ambiguities": stated explicitly for round 9. Basis: S40-R3 (A2 to A5) recorded as architect rulings on round-8 technical items; no PO question is open; dependencies (F19 persistence, T068 source, T066 docs, F11/F12 follow-up) are not ambiguities.

---

## Round 8 record (history; superseded by the round-9 record above)

- Date: 2026-11-09 14:32 +02:00 (fourth pass: FR-022 consistency sweep after CodeRabbit reviews on head `063f0751`; this record is the last spec-artifact change of the round). Third pass at 06:17 +02:00 (after CodeRabbit reviews 5821579127 and 5821593433 on head `5e8361d2`). Second pass at 06:02 +02:00 (after CodeRabbit review 5821150484 on head `fdba2594`). Earlier first pass at 04:37 +02:00 (re-analysis after all round-8 spec edits: spec.md FR-026 and A7 sentence, plan.md lines 7, 73 and 75, data-model.md FR-026 row, tasks.md T040, T059, T068, T074, the SC-003 coverage line, the T087 renumbering and new T088/T089, traceability.md T087 cell, and this record; this record is the last spec-artifact change of the round).
- Scope: CodeRabbit review 5820293740 on head `0883fe6b24776801edffc4cb0704388744c2d707`: six actionable comments, all SPEC-FIX under S38-R11. Merge of `origin/main` `e8a1531b88f294563593b163bdbf3e6f4e17292a` resolved the `tasks.md` T048 collision by renumbering main's catalog-hardening row to T087. Spec-only: no code, SQL, migration, fixture or test changed.
- Authority: S38-R11 (architect ruling, not a PO decision; PO-1 to PO-3 are spec fixes); S37-PO-10 (dummy-link removal, no legacy support); S37-PO-1 Q2 = A; S37-PO-11 (critique approval); S38-PO-3.

## Entry check (Spec Kit gate, section 1) — round 8

| Box | Result | Evidence |
| --- | --- | --- |
| spec.md has numbered FRs, measurable SCs and Given/When/Then scenarios for the touched scope | PASS | FR-001 to FR-038 (incl. FR-016a); SC-001 to SC-016 (SC-003 at `spec.md:174`); US1 to US6. |
| Clarifications recorded, or a PO-decision register entry citing the PO source | PASS | `spec.md` S38 round 7 Clarifications section (S37-PO-11, S38-PO-3) and this record; "No open ambiguities" is stated explicitly below. |
| plan.md covers the touched scope; tasks.md has task IDs tagged with FR IDs | PASS | `plan.md` Summary, §Design and migration steps 1, 3; `tasks.md` T040, T059, T068, T074, T087, T088, T089 with FR tags. |
| checklists/analyze.md dated after the last spec/plan/task change, with 0 open CRITICAL/HIGH | PASS | This record (2026-11-09 14:32 +02:00), the last change of the round; open CRITICAL 0; open HIGH 0. |

Result: **PASS**. Implementation is not authorized by this spec-only round; the entry check does not authorize it. No task is ticked; T088 remains PENDING.

## Round-8 dispositions (CodeRabbit review 5820293740)

| # | Thread | Path:line | Disposition | Where fixed |
| --- | --- | --- | --- | --- |
| 1 | `PRRT_kwDOVYgYQ861FqJb` | `checklists/analyze.md:70` | FIXED: timed SC-003 acceptance task T088 added; SC-003 coverage PENDING; T024 and T030 are supporting functional coverage only. | `tasks.md` T088 row and SC-003 coverage line; this record |
| 2 | `PRRT_kwDOVYgYQ861FqJe` | `data-model.md:50` | FIXED (S38-R11 PO-1): canonical-only global-template resolution (no workspace, no overrides, no private alternatives); a missing canonical value is a T068 inventory blocker with no fallback and no guess. | `spec.md` FR-026; `data-model.md` Effective resolution bullet; `tasks.md` T059 |
| 3 | `PRRT_kwDOVYgYQ861FqJf` | `plan.md:7` | FIXED: formerly open PO decisions marked historical; A7 reconciled to S37-PO-11 and `critique-response.md` §7; spec-only restriction preserved. | `plan.md` Summary; `spec.md` S36-PO-5 A7 sentence |
| 4 | `PRRT_kwDOVYgYQ861FqJh` | `plan.md:75` | FIXED (S38-R11 PO-2): dummy `docs.google.com` values removed from live records at cutover; immutable legacy history and audit history are not rewritten; scope limited to the legacy variation video migration. | `plan.md` migration step 3 |
| 5 | `PRRT_kwDOVYgYQ861FqJl` | `tasks.md:40` | FIXED (S38-R11 PO-3): inventory recheck runs immediately before cutover with conversions paused; no writer-shutdown mechanism; no conversion uses an older inventory. | `tasks.md` T068 row and dependency line; `plan.md` migration step 1 |
| 6 | `PRRT_kwDOVYgYQ861FqJm` | `tasks.md:47` | FIXED: T074 coordinated with T040 (form stops submitting `instructions_*` before or atomically with the validator); cutover preserves unique Instructions in Notes (T054, T062(b)); upgrade test required; validator implementation unchanged. | `tasks.md` T074 and T040 rows |

Rejected: none. Product decisions raised: none (all six are spec fixes or technical choices under S38-R11).

**Second pass (CodeRabbit review 5821150484 on head `fdba2594`, two findings; both verified live):**

| Thread | Path:line | Finding | Disposition |
| --- | --- | --- | --- |
| `PRRT_kwDOVYgYQ861HPRb` (new) | `tasks.md:47` | T049 → T074 → T054 → T050 → T049 ordering cycle. Introduced by the round-8 T074 wording (validator applies after the T054 cutover) while T049 needs canonical Notes, Defaults and Alternatives storage that only T074 described. | FIXED: storage split into new prerequisite task T090 (ordered before T049 and T054; RED storage/composite-key tests; validators stay in T074 and T075). T049 and T054 depend on T090; T074 depends on T054; T075 on T090. Chain checked: T090's prerequisites (T037, T043, T044, T045, T046, T048, T052, T068) do not depend on the chain; no cycle. |
| `PRRT_kwDOVYgYQ861FqJl` (reopened) | `tasks.md:40` | Pausing conversions does not close the window: a canonical or workspace-private write between the recheck and the conversion could bypass the PO gate. | FIXED (technical, no PO question): the conversion compares the source version captured by the recheck with the current version inside the cutover transaction (compare-and-set); on mismatch only the affected conversion pauses and the recheck is repeated; T063 adds the concurrency test. The writer-shutdown choice of S38-R11 PO-3 is unchanged. |

**Third pass (CodeRabbit review on head `5e8361d2`; four findings plus one carried nit; all verified live):** FR-022 (`spec.md:136`) claimed F11/F12 specify account deletion; they exclude it, so the follow-up is recorded as pending. T043/T045 (`tasks.md:15`): the shared validator rejects `video_url`; T043 now adds a video_url-only allowlist extension (same URL validator) that T045 inherits; no cycle, since T090 is after T043. T059/FR-026/data-model (`tasks.md:31`): only a missing required or incompatible canonical value blocks; FR-003-permitted absence resolves to `none` and does not block. T068/T063 (`tasks.md:40`) and plan step 1: the final identity check and conversion run in one transaction under a SHARE ROW EXCLUSIVE lock (writers wait; none shut down); the comparison includes identities created after the recheck; a concurrency test covers it. **Architect-visible choice:** the table lock is the executing agent's mechanism for the CodeRabbit request; the architect should confirm it is consistent with S38-R11 PO-3 (no writer shutdown). Count stays 92. FR-022 consistency sweep: spec.md Status, Edge Cases, Approved PO decisions and Clarifications, plan.md, tasks.md T069 and notes, and data-model.md now record the F11/F12 follow-up as pending. `decision-register.md` (a PO record) still carries the older F11/F12 wording and is left unchanged pending architect instruction.

Counts after the second pass: 92 tasks (T001–T075, T900, T901, T076–T090); 92 distinct IDs verified; CRITICAL 0, HIGH 0; no new PO question.

## Findings register — round 8

| ID | Category | Severity | Status | Summary and evidence |
| --- | --- | --- | --- | --- |
| A7 | Constitution alignment (process) | CRITICAL (historical) | **RESOLVED (S38 round 7, S37-PO-11; reconciled in round 8)** | Sol Medium critique approved (S37-PO-11), ran at `50f5c236`, ten findings dispositioned (`critique-response.md` §7). Not re-run. |
| R8-1 | Coverage | LOW | OPEN, not an ambiguity (by design) | SC-003 timing evidence is pending until T088 executes. Criterion unchanged. |
| A18 | Dependency | MEDIUM | OPEN, not an ambiguity | F19 persistence for the client wrapper (T058). The internal resolver is not blocked. |
| A20 | Process | MEDIUM | OPEN, not an ambiguity | T066 docs record outside `specs/016-*`; not executed. |
| A21 | Cross-feature | MEDIUM | OPEN, not an ambiguity | T059 amendments for F17, F18 and F19 consumers; the canonical-only path is now specified; blocked by F19 persistence. |
| A39 | Monitor | MEDIUM | OPEN, monitor | Parity guard depends on the implemented matrix (T055). |
| A50 | Dependency (process) | MEDIUM | OPEN, not an ambiguity | T068 needs an architect-assigned stack or an approved read-only inventory before any migration task; the paused-conversion recheck is specified. |
| A22, A38 | Coverage, awareness | LOW | OPEN or NOT AN AMBIGUITY | Unchanged from round 7. |

## Coverage (round 8)

- Requirements inventory: FR-001 to FR-038 (incl. FR-016a), 39 keys; SC-001 to SC-016, 16 keys.
- SC-003 → T088 (timed interaction check; PENDING evidence; T024 and T030 are supporting functional coverage only).
- Tasks: T001 to T075, T900, T901, T076 to T086 (PR #43 lane, renumbered in round 7), T087 (main-side S38-R3 catalog hardening, renumbered from T048 during the round-8 merge), T088 (timed SC-003 check) T089 (this round's spec-only follow-up), and T090 (the storage prerequisite split from T074 and T075). Verified live: 92 distinct task IDs, no duplicate rows.

## Counts (round 8)

- Requirements: 39 FR keys, 16 SC keys. Tasks: 92 (T001–T075, T900, T901, T076–T090).
- Ambiguities (product and spec): **0 open**. No new PO question was raised in round 8.
- Severity (open): **CRITICAL 0, HIGH 0**.
- "No open ambiguities": stated explicitly for round 8. Basis: S38-R11 classifies all six findings as spec fixes or technical choices, and no genuine PO question remains open.

---

## Round 7 record (history; superseded by the round-8 record above)

- Date: 2026-11-09 00:33 local (re-analysis after all round-7 edits to spec, plan, data-model, contracts, tasks, traceability, impact-s35-redesign and critique-response, including the four valid CodeRabbit threads on head `60035326` fixed in `critique-response.md` §8; this record is the last spec-artifact change of the round).
- Scope: Sol Medium critique on head `50f5c236d6bfca1c16349cc26f8c31de3b67b8c0` (approved by S37-PO-11; run `C:/Users/NEW LAP/.lifter/runs/s37-sol-f16-critique`; CRITICAL 0, HIGH 5, MEDIUM 4, LOW 1). Dispositions D1–D10 are in `critique-response.md` §6–§7. Spec-only: no code, SQL, migration, fixture or test changed.
- Method: speckit-analyze procedure, read-only on the spec sources except this record. Head facts were verified live: `origin/main` = `29bd0ba5`; `supabase/migrations/20261108100000_catalog_exercise_detail.sql` on `origin/main` still requires `name_ar` and accepts `instructions_*`; PR #43 is MERGED (2026-11-08, head `0fcd905d`); PR #66 head unchanged until this round's push.
- Authority: S37-PO-11 (critique approval); S37-PO-1 Q2 = A; S37-PO-10; S36-PO-5; S38-PO-3 (escalate only genuine blockers); F16-MCQ-A(a), -B(a), -C, -6(a), -G, -H, -O answers in `decision-register.md`.

## Entry check (Spec Kit gate, section 1)

| Box | Result | Evidence |
| --- | --- | --- |
| spec.md has numbered FRs, measurable SCs and Given/When/Then scenarios for the touched scope | PASS | FR-001 to FR-038 (incl. FR-016a); SC-001 to SC-016; US1 to US6 acceptance scenarios. |
| Clarifications recorded, or a PO-decision register entry citing the PO source | PASS | `spec.md` "S38 round 7 — Sol Medium critique disposition (S37-PO-11)" cites S37-PO-11 and S38-PO-3; `decision-register.md` answers cited per finding. |
| plan.md covers the touched scope; tasks.md has task IDs tagged with FR IDs | PASS | `plan.md` §Technical Context, §Design (override, migration step 1, cache rule), §Validation 1b; `tasks.md` T037, T040, T048, T051, T052, T068, T074, T075. |
| checklists/analyze.md dated after the last spec/plan/task change, with 0 open CRITICAL/HIGH | PASS | This record (2026-11-09); open CRITICAL 0; open HIGH 0. |

Result: **PASS** for the spec artifacts. Implementation is not authorized by this spec-only round; the entry check does not authorize it.

## Round-7 dispositions (Sol Medium critique)

| ID | Sol severity | Status | Where |
| --- | --- | --- | --- |
| D1 | HIGH | FIXED. `null` = inherit for the seven non-Alternatives fields; clearing a field is a per-field reset (F16-MCQ-A(a), F16-MCQ-6(a)). No new PO question. | spec FR-026; data-model override row |
| D2 | HIGH | FIXED (planned). Field-by-operation coverage table; T074 (Global) and T075 (workspace-private). | data-model §S38 round 7; tasks T037, T074, T075; traceability |
| D3 | HIGH | FIXED. T068 covers canonical and private payloads and history (counts only). Conditional PO item recorded, not raised. | tasks T068; plan migration step 1 |
| D4 | HIGH | FIXED. Ordering applies to newly authored migrations; published files immutable and exempt; remote conflict check kept. | spec FR-032, SC-015; tasks T052; plan migration range |
| D5 | HIGH | FIXED. Video never cached; warmed-cache sequence tested. | spec FR-034; tasks T051; plan §1b |
| D6 | MEDIUM | FIXED. Filtering only on library and new-selection reads; published reads frozen (F16-MCQ-G). | spec FR-025; data-model alternatives row; tasks T048 |
| D7 | MEDIUM | FIXED. Resolver has no F16 login grant; F19 adds the single grant; staff effective resolution via existing staff RPCs; contract row split. | spec FR-026, FR-029; contracts row 31; plan §Technical Context; tasks T051 |
| D8 | MEDIUM | FIXED. Taxonomy collected by the create/version write; detail editor stays at eight fields. | spec FR-001, FR-018; data-model metadata row; plan §Application and UI; tasks T037, T040 |
| D9 | MEDIUM | FIXED. This record; coverage split (below); A7 resolved; A10 answered in part. | this file; critique-response §7 |
| D10 | LOW | FIXED. Planned audit codes are the eight approved fields. | traceability FR-013 row |

## Findings register (open and recorded)

Severity follows the speckit-analyze heuristic. "Open" means it still blocks something; "Not an ambiguity" means a dependency or awareness item that does not change any requirement.

| ID | Category | Severity | Status | Summary and evidence |
| --- | --- | --- | --- | --- |
| A7 | Constitution alignment (process) | CRITICAL (historical) | **RESOLVED (S38 round 7, S37-PO-11)** | The Sol Medium critique was approved (S37-PO-11), ran at `50f5c236` (run `C:/Users/NEW LAP/.lifter/runs/s37-sol-f16-critique`), and its ten findings are dispositioned (critique-response §7). It is not re-run. |
| A8 | Ambiguity (PO) | HIGH | RESOLVED | F16-MCQ-A option (a), per-field reset (S36-PO-3). |
| A9 | Ambiguity (PO) | HIGH | RESOLVED | F16-MCQ-B option (a), empty alternatives allowed (S36-PO-3). |
| A10 | Ambiguity (PO, data) | HIGH | ANSWERED IN PART | F16-MCQ-C plus S36-PO-5 (A48): keep Notes; T068 precedes any migration. T062(b) is planned inside the T054 cutover and is not blocked on a decision. |
| A11 | Ambiguity (PO, tenancy) | HIGH | RESOLVED | F16-MCQ-E option (a) (S36-PO-3). |
| A12 | Ambiguity (PO) | HIGH | RESOLVED | English name required, Arabic optional (S37-PO-10; F16-MCQ-Q); Description one optional value (F16-MCQ-F-R). |
| A13 | Ambiguity (PO) | HIGH | RESOLVED | F16-MCQ-G frozen at publication; S37-PO-1 Q2 option text: "Frozen values = name/description/notes/alternatives/defaults". |
| A14 | Ambiguity (PO) | HIGH | RESOLVED | F16-MCQ-H (Description frozen); Video live (S37-PO-1 Q2 = A). |
| A15 | Ambiguity (PO) | HIGH | RESOLVED | F16-MCQ-9 option (a) (S36-PO-3). |
| A16 | Ambiguity (PO) | MEDIUM | RESOLVED | F16-MCQ-I (1)(b) and (2)(b) (S36-PO-3). |
| A17 | Ambiguity (PO, cross-feature) | LOW | RESOLVED for F16 | Account deletion and re-registration (S37-PO-10) are not specified in F11/F12, which exclude client deletion; the F11/F12 follow-up is recorded as pending and is outside F16 scope. |
| A18 | Dependency | MEDIUM | OPEN, not an ambiguity | F19 persistence for the client wrapper (T058). The internal resolver (T050, T051) is not blocked. |
| A19 | Dependency | MEDIUM | RESOLVED (PR #43) | PR #43 is MERGED (2026-11-08, `0fcd905d`). The T054/T055 sequencing constraint stays as a planned task rule (FR-031, FR-032). |
| A20 | Process | MEDIUM | OPEN, not an ambiguity | T066 docs record (`docs/04-changes-and-questions.md`, `docs/01-traceability.md`); outside `specs/016-*`; not executed. |
| A21 | Cross-feature | MEDIUM | OPEN, not an ambiguity | T059 amendments for F17, F18 and F19 snapshot and resolver consumers; blocked by F19 persistence. |
| A22 | Coverage | LOW | OPEN, not an ambiguity | No dedicated test asserts that FR-033 adds no capability. Add the assertion to T055 at implementation. |
| A38 | Architect awareness | LOW | NOT AN AMBIGUITY | Absence (`video: null`, source `none`) and the merged-source media rule are stated in FR-026, FR-028 and contract row 31. Awareness only. |
| A39 | Monitor | MEDIUM | OPEN, monitor | Parity guard depends on the implemented matrix (T055); re-run at the final implementation head. |
| A40 | Readability | LOW | CLOSED | No ambiguity; no change. |
| A50 | Dependency (process) | MEDIUM | OPEN, not an ambiguity | T068 needs an architect-assigned stack or an approved read-only inventory before any migration task. Blocks migration tasks, not the spec. |
| A53 | Architect confirmation | LOW | RESOLVED | The F and G answer labels are superseded by verbatim PO words: S37-PO-10 (name and Description) and the S37-PO-1 Q2 option text (frozen alternatives). |
| A23–A37, A41–A49, A51–A52, A54–A61 | Earlier rounds | — | RESOLVED | Closed in rounds 3–6; their text is in the git history of this file. |

## Coverage (split as required by D9)

- Requirements inventory: FR-001 to FR-038 (including FR-016a), 39 keys; SC-001 to SC-016, 16 keys.
- Tasks: T001 to T075 (the redesign and its historical rows), T900 and T901 (historical), and T076 to T086 (the PR #43 lane's completed tasks, renumbered from T037 to T047 during the S38 round 7 merge; see the ID note in `tasks.md`), T087 (the main-side S38-R3 catalog-hardening task, renumbered from T048), T088 (the S39 round-8 timed SC-003 check), T089 (the S39 round-8 CodeRabbit spec-only follow-up), and T090 (the S39 round-8 storage prerequisite split from T074 and T075), 92 in total.
- **Historical evidence (T001–T036, T900, T901 and T076–T086; closed rows):** these cover the S25/S26 food, catalog and security work. FR-005 to FR-011, FR-019 and FR-021 have no new redesign API test. Their evidence is historical (T024 to T028 and the S25 release gate), and the food scope has not changed since S25. This is recorded as accepted historical-evidence coverage, pending architect confirmation. These rows are not described as dedicated S36 tests.
- **Planned redesign tests (T037–T075, T088–T090):** each row names its FR IDs. Coverage for FR-001 to FR-004, FR-014, FR-018, FR-022 to FR-038 is planned, not evidenced. Per-field positive and negative cells are in the `data-model.md` coverage table.
- **Implementation coverage (T043–T075):** Global and private storage, validators and allowlists for the eight fields are allocated to T043, T044, T045, T046, T047, T048, T074 and T075. None is implemented; evidence is blank in `traceability.md`.
- Success criteria: SC-001 → T037, T047; SC-002 → T037, T046, T051; SC-003 → T088 (timed interaction check; PENDING evidence; T024 and T030 are supporting functional coverage only); SC-004 → T003; SC-005 → T034, T065; SC-006 → T037, T051, T058; SC-007 → T037, T047, T055; SC-008 → T037, T047; SC-009 → T050, T051, T058; SC-010 → T040; SC-011 → T050, T056; SC-012 → T046, T050; SC-013 → T037, T047, T074, T075; SC-014 → T051, T055; SC-015 → T052; SC-016 → T037, T062, T063, T074, T075.

## Counts

- Requirements: 39 FR keys, 16 SC keys. Tasks: 88 (T001–T075, T900, T901, T076–T086).
- Ambiguities (product and spec): **0 open**. Answered in part: A10 (T068 is a task dependency, not a question).
- Severity (open): **CRITICAL 0, HIGH 0**. MEDIUM 5 (A18, A20, A21, A39, A50). LOW 2 (A22, A38).
- Round 7 closed: A7, A10 (answered in part), A19, A53 and D1–D10 (D3 conditional item not raised).
- Duplicates: 0 open.

## "No open ambiguities"

**TRUE for this round.** Every product question in the spec, plan and tasks has a recorded PO answer in `decision-register.md` or the spec Clarifications, citing its PO source. No PO-DECISION-NEEDED item is open. The D3 conversion question is conditional and is not raised until the T068 audit finds current content outside the approved bounds. The MEDIUM and LOW items above are dependencies, monitoring or awareness items, not ambiguities, and none changes a requirement.

## Gate

- Spec and plan artifacts: **PASS** (0 open CRITICAL, 0 open HIGH, no open ambiguity).
- Implementation: **not authorized** by this spec-only round. Migration tasks remain blocked by T068 (A50).
- Exit for implementation approval, if the architect requests it: T068 recorded; architect confirmation of FR-005 to FR-011, FR-019 and FR-021 historical coverage (above).

---

# Historical record retained from origin/main (not the F16 gate for this round)

The records below predate S38 round 7. The gate for this round is the record above.

## Specification Analysis Report

**Date:** 2026-11-03  
**Analysed commit:** `a7571707b02ccf9418ff293ebe30f6de98abe16d`
**Scope:** Static Spec Kit analysis and code/test traceability. No test suite was run.

### Entry check â€” mandatory Spec Kit gate

| Check | Result | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs, Given/When/Then scenarios for scope | PASS | `spec.md` FR-001â€“FR-021 (including FR-016a); SC-001â€“SC-005; five user stories with Given/When/Then scenarios. |
| Clarifications / PO decision register and explicit no-open-ambiguities statement | PASS | `spec.md` Approved PO decisions states no D16 item remains open; decisions S20-03â€“S20-13 are recorded in `docs/04-changes-and-questions.md`. |
| Plan covers scope; tasks tagged with FR IDs | PASS | `plan.md`; `tasks.md` T001â€“T040 now each has one or more explicit FR tags. |
| Dated analyze checklist after last spec/plan/tasks change, zero open CRITICAL/HIGH | PASS | This analysis is dated after the task-tag commit; 0 CRITICAL and 0 HIGH findings. |
| Spec Kit prerequisites | PASS | `.specify/feature.json` in this worktree contains `{"feature_directory":"specs/016-exercise-food-catalogs"}`; `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireSpec -RequireTasks -IncludeTasks` resolves `specs/016-exercise-food-catalogs` and lists `tasks.md`. The pointer is machine-local and ignored by `.specify/.gitignore`, as designed by Spec Kit 1.2.3. |

### Inventory

Present: `spec.md`, `plan.md`, `tasks.md`, `research.md`, `data-model.md`, `contracts/catalog-api.md`, `contracts/export-read-isolation.md`, `quickstart.md`, `debate.md`, `ui-handoff.md`, `benchmark-s25.md`, `release-gate-s25.md`, `S27-library-evidence.md`, `checklists/analyze.md`, `checklists/requirements.md`, and `traceability.md`. No `## Clarifications` session; approved decisions are cited in the spec and decision register instead.

### Findings

| ID | Category | Severity | Location | Summary | Recommendation |
|---|---|---|---|---|---|
| A3 | Acceptance | MEDIUM | `spec.md` SC-003; `tasks.md` T024/T028/T029 | The â€œunder 60 seconds of interactionâ€ criterion has no identified timed interaction test or measurement evidence. | Add measurement evidence or ask the PO whether this criterion should be measured differently; do not infer success from functional tests. |
| A4 | Acceptance | MEDIUM | `spec.md` SC-005; `benchmark-s25.md`; `release-gate-s25.md` | Local database benchmark covers query plans/latency, but Worker CPU p95 and hosted HTTP/API p95 remain open production gates. | Keep production gate open and capture the specified full-path measurements before production. |

### Requirement coverage

| Requirement | Task coverage | Notes |
|---|---|---|
| FR-001â€“FR-004 | T006â€“T023, T037â€“T040 | Exercise taxonomy, identities, authorization, variations, workspace scope, lifecycle and UI; tags now explicit in `tasks.md`. |
| FR-005â€“FR-010 | T009â€“T030 | Food shape, add/edit permissions, validation, duplicates and governance; tags now explicit. |
| FR-011â€“FR-014 | T007, T011â€“T016, T018â€“T023, T025â€“T030, T037â€“T040 | Lifecycle, reads, privacy, audit, video resolution and host policy; tags now explicit. |
| FR-015â€“FR-016a | T002â€“T003, T006, T011, T014â€“T016, T018â€“T021, T025â€“T027 | Normalization, bounded search, idempotency/locking, taxonomy; tags now explicit. |
| FR-017â€“FR-021 | T001â€“T002, T004â€“T007, T011â€“T016, T024â€“T036, T040 | Denials, UI, no-seed, snapshots, quotas and benchmark; tags now explicit. |
| SC-001â€“SC-005 | T007, T018â€“T021, T024â€“T036, T040 | Test/evidence coverage exists; SC-003 timing and SC-005 production measurements remain partial. |

### Constitution alignment

No direct conflict found with Constitution v1.4.0 Principles Iâ€“IX. The plan specifies workspace isolation, immutable versions, least privilege, approved scope, bilingual/accessibility requirements, idempotency and test gates.

### Unmapped tasks

None. T001â€“T040 each carry explicit FR tags. FR coverage is 22/22 (100%) by explicit task tags; no task without a requirement mapping was found.

### Metrics

- Functional requirements: 22 identifiers (FR-001â€“FR-021 including FR-016a); SCs: 5.
- Tasks: 40.
- Explicit FR-tag coverage: 22/22 (100%).
- Findings: 0 CRITICAL, 0 HIGH, 2 MEDIUM, 0 LOW.
- Ambiguity: 0 unresolved product ambiguities found in the approved F16 decision set.
- Duplication: 0 material duplicate requirements found.

### Verdict

**PASS WITH MEDIUM follow-ups.** The mandatory entry gate passes; no open CRITICAL/HIGH findings remain. SC-003 timing evidence and production Worker/API measurements for SC-005 remain open.
Static analysis only; no test suite was run. Test source and prior evidence document references are in `traceability.md`.

### History

#### Round 1 â€” analysed `f903683e659d9a0aa5d62b98f0917b8744a4d4f1` on 2026-11-03

Verdict: FAIL. Findings then: A1 HIGH (`.specify/feature.json` missing), A2 HIGH (tasks T001â€“T040 lacked FR tags), A3 MEDIUM (SC-003 timing), A4 MEDIUM (SC-005 production measures), A5 MEDIUM (no tests run by this static lane), A6 LOW (`checklists/requirements.md` missing). 25 traceability items were VERIFIED; SC-003 and SC-005 were PARTIAL; none were NOT-FOUND or DEFERRED. Repairs since that round: added task FR tags; created the local Spec Kit feature pointer in the format emitted by `Save-FeatureJson`; added the requirements checklist. The task-tag change was committed as `a7571707b02ccf9418ff293ebe30f6de98abe16d`.

## S30-PO-9 amendment analysis

**Date:** 2026-11-03 (revalidated after T041 blocker detail)
**Scope:** Spec/plan/task amendment for PO-approved exercise UI governance placement.
**Authority:** S30-PO-9 verbatim in `spec.md` and `C:/Users/NEW LAP/.lifter/briefs/s28-po-decisions-verbatim.md` (S30-Q17).
**Clarifications:** No open PO ambiguity remains about exercise Add/Edit, Remove placement, confirmation, Merge/Restore visibility, permission matrix, or historical preservation. Existing approved keys are available for action, confirm/cancel and result: `catalog.editorRemove`, `dialog.confirm`, `dialog.cancel`, `catalog.editorLifecycleRemoved`; no new copy is needed.
**Traceability:** S30-PO-9 UI requirements are captured in the User Story 4 acceptance scenario, the S30-PO-9 plan subsection, and new FR-tagged task T041.

| Finding | Severity | Evidence | Disposition |
|---|---|---|---|
| Exercise Detail Remove cannot safely call an existing backend operation in either scope without expanding backend scope. The global transition requires a revision omitted from the detail projection; the workspace lifecycle RPC is not implemented. | MEDIUM | `contracts/catalog-api.md`; `lib/catalog/server.ts`; `supabase/migrations/20261106113000_catalog_exercise_lifecycle_merge.sql`; `supabase/migrations/20261108100000_catalog_exercise_detail.sql`; S30-PO-9 prohibits backend RPC/migration changes for this task. | PO-DECISION-NEEDED recorded in lib12 report. T041 remains unchecked until the full role matrix and mutation are verified. No backend guess encoded. |

**Verdict:** PASS WITH MEDIUM blocker. 0 open CRITICAL, 0 open HIGH. Spec Kit entry criteria remain met; implementation is limited to independently supported UI behavior pending PO direction on workspace backend scope.

## S31-PO-1 Q3 amendment analysis

**Date:** 2026-11-04 (after S31 spec, plan, task, contract and traceability edits)
**Authority:** PO decision S31-PO-1 Q3, quoted verbatim in `spec.md` and the lib13 brief; S30-PO-9 remains binding.
**Scope:** Global PO Remove projection and workspace Remove for PO explicit workspace or WO/Trainer current own-workspace `coaching_work`; workspace lifecycle revision projection, CAS/idempotency/audit, preservation; Detail-only UI with confirmation and no Restore/Merge controls.
**Clarification:** `spec.md` records the answer and option text verbatim. No open ambiguities remain for authorized behavior. Workspace Restore is explicitly out of scope.

| Check | Result | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs, Given/When/Then | PASS | `spec.md` FR-002/FR-011 and User Story 4 scenario specify role matrix, confirmation, CAS, audit, search exclusion and preservation. |
| Clarification source and no-open-ambiguities statement | PASS | `spec.md` Clarifications â€” S31 cites S31-PO-1 Q3 verbatim and states no open ambiguities. |
| Plan and FR-tagged task IDs | PASS | `plan.md` S31 amendment; `tasks.md` T042â€“T044 tagged with FR-011 and related FRs; T041 end-to-end pending. |
| Analysis date newer than spec/plan/tasks | PASS | This 2026-11-04 amendment follows all those edits. |
| Open CRITICAL/HIGH findings | PASS | 0 CRITICAL, 0 HIGH. |

| Finding | Severity | Disposition |
|---|---|---|
| Workspace detail must preserve tenant identity if two workspaces contain the same UUID-shaped identity. | MEDIUM | T042/T043 require composite workspace key, explicit scope, same-ID tenant test and tenant-key mutation. |
| Mutation behavior must follow established operation-key and audit conventions. | MEDIUM | Contract specifies CAS, replay, one audit event and error parity; integration tests and four executed mutants are required by T043. |

**Verdict:** PASS WITH MEDIUM implementation risks. Spec Kit entry gate satisfied for T042â€“T044; no implementation began before this amendment analysis. Static analysis only; execution evidence belongs in traceability after tests pass.

## S32 lib14 evidence revalidation

**Date:** 2026-11-04 (after T041-T044 evidence updates in tasks.md and traceability.md).
**Scope:** Verification-only update for the existing S31-PO-1 Q3 approved scope; no requirement, plan, or task behavior text changed. Runtime launch diagnosis and test evidence are in the S32 run report.

| Check | Result | Evidence |
|---|---|---|
| Spec, clarification, measurable scope | PASS | spec.md FR-011 and User Story 4; S31-PO-1 Q3; explicit no-open-ambiguities statement. |
| Plan/task coverage and FR tags | PASS | plan.md; T041-T044 in tasks.md; each task cites executed test evidence. |
| 0 open CRITICAL/HIGH findings | PASS | Static scope recheck; 0 CRITICAL and 0 HIGH. Existing medium implementation risks were exercised by accepted lifecycle tests/mutants. |
| Implementation verification | PASS | Focused unit 37/37, Stack C integration 10/10, Playwright/axe 16/16; final full gates required on final head. |

**Verdict:** PASS. No product decision or design gap was introduced by verification/test evidence updates.

## S33 lib16 remediation re-analysis

**Date:** 2026-11-04 (after the S33 changes to `spec.md` and `tasks.md`).
**Scope:** Existing open PR #43 review fixes T045â€“T047. No new product behavior, UI surface, migration, or permissions are introduced. Authority: S30-PO-9 / S31-PO-1 Q3 recorded in `spec.md`, and `contracts/catalog-api.md`.
**Clarifications:** The only exercise/catalog Restore capability retained by this spec is global PO Restore through the backend/API. Workspace exercise Restore is not authorized. Exercise UI has no Restore or Merge control; Remove remains on Exercise Detail. No open ambiguities remain for this remediation.

| Entry check | Result | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs, Given/When/Then for touched scope | PASS | Existing FR-001 (exercise equipment) and FR-018 (bilingual editor/accessibility) plus User Story 4 scenarios in `spec.md`; no new FR or SC introduced. |
| Clarifications and explicit no-open-ambiguities statement | PASS | `spec.md` Clarificationsâ€”S31 (S31-PO-1 Q3); this S33 analysis states the Restore boundary and no open ambiguities. |
| Plan covers scope; tasks have IDs tagged to FRs | PASS | `plan.md` Application and UI; `tasks.md` T045 [FR-001], T046 [FR-018], T047 [FR-002, FR-011, FR-018]. |
| Analyze follows last spec/plan/tasks change; 0 open CRITICAL/HIGH | PASS | This re-analysis follows the S33 `spec.md`/`tasks.md` edits. 0 CRITICAL, 0 HIGH. |

### Scope findings

| ID | Severity | Location | Finding / disposition |
|---|---|---|---|
| S33-F16-A1 | MEDIUM | `spec.md` User Story 4 and FR-011 | The former workspace-staff Restore clause conflicted with S31 and `contracts/catalog-api.md`. Corrected to retain global PO backend/API Restore only; no behavior added. |
| S33-F16-A2 | LOW | `ui-handoff.md` PO edit row and Exercise Detail inventory | Handoff now matches current PO editor absence assertions (`catalog-ui.spec.ts`) and places Remove at Exercise Detail per T044. |

Existing MEDIUM follow-ups remain unchanged: SC-003 lacks timed interaction evidence and SC-005 hosted Worker/API performance measurements remain a pre-production gate. They do not block these in-scope CodeRabbit fixes.

**Verdict:** PASS. No new open CRITICAL/HIGH findings, product decisions, or design gaps. Existing approved behavior only. Static Spec Kit analysis; focused unit/component execution is recorded separately in `traceability.md`.

### S33 task evidence revalidation

**Date:** 2026-11-04 (after T045/T046 evidence and checkbox updates in `tasks.md`). The S33 scope, authority, requirements, and findings above are unchanged.

| Check | Result | Evidence |
|---|---|---|
| Plan/task coverage and FR tags | PASS | `plan.md` plus checked T045 [FR-001] and T046 [FR-018]; documentation task T047 [FR-002, FR-011, FR-018] remains open pending its documentation commit/evidence record. |
| 0 open CRITICAL/HIGH | PASS | Static S33 scope recheck; 0 CRITICAL and 0 HIGH. |
| Implementation evidence | PASS | RED/GREEN for both code fixes; commits `6da1574` and `5e51afa`; focused unit/component tests 29/29. |

**Verdict:** PASS. Analyze remains newer than the last `spec.md`, `plan.md`, and `tasks.md` edits. T047 does not introduce behavior and stays pending documentation verification.

### S33 T047 completion revalidation

**Date:** 2026-11-04 (after T047 was verified and checked in `tasks.md`).

| Check | Result | Evidence |
|---|---|---|
| Requirement scope and PO authority | PASS | T047 only corrects existing documentation to S31-PO-1 Q3 and `contracts/catalog-api.md`; no product behavior or UI control added. |
| FR-tagged task and evidence | PASS | T047 [FR-002, FR-011, FR-018] cites documentation commit `106157c`, this Analyze result, and the existing UI assertions. |
| Open CRITICAL/HIGH findings | PASS | 0 CRITICAL, 0 HIGH. |

**Verdict:** PASS. All S33 F16 tasks T045â€“T047 have completed evidence; Analyze is after the latest spec/plan/tasks change.

## Main-side S33 analysis record â€” preserved verbatim

# Analyze â€” F16 exercise and food catalogs

- Date: 2026-11-04
- Scope: S33-PO-4 taxonomy/search integration test pagination or unique synthetic filter (T900).
- Spec: Existing catalog search and taxonomy requirements and authorization scenarios remain unchanged. S33 clarification disallows search semantic, visibility, limit, or data changes.
- Plan: The test will locate its expected synthetic result independent of the global first page, using an exact filter or explicitly bounded pagination.
- Tasks: T900 is tagged FR-015 and FR-016a. No test assertion is weakened and no catalog content is added.
- Findings: 0 open CRITICAL, 0 open HIGH.
- Gate: PASS for the stated S33 test-only scope.

## Post-verification S33 re-analysis â€” 2026-11-04

T900 has been marked complete only after its focused integration test passed on the committed code head. Traceability records commit `dfa6fe6` and the executed test. S33 scope remains test-only; 0 open CRITICAL/HIGH findings.


## S34 post-merge re-analysis â€” 2026-11-05

- **Merge inputs:** PR head `ce280c98a4bcf896d5cd04682bc3a571465f2c82` plus `origin/main` `7e2d0149b0370e4389b462130508352bbd69daa2`; analysis performed after the merge operation and conflict reconciliation.
- **Scope:** test-only reconciliation of the existing catalog taxonomy search coverage. No product behavior, schema, permissions, UI or copy requirement changed.
- **Entry check:** PASS. `spec.md` has numbered FR-001â€“FR-021 (including FR-016a), measurable SCs and Given/When/Then scenarios; approved decisions and the explicit â€œNo open ambiguitiesâ€ statement are present. `plan.md` covers the S33 test-only scope. `tasks.md` carries T900 tagged FR-015/FR-016a.
- **Traceability:** PASS. Existing F16 FR rows retained; main-side S33 T900 row retained with its exact test/evidence.
- **Conflict test assertions:** preserved both matching taxonomy positives, both main-side mismatched-filter negatives, the branch-side workspace-name query, and the main-side empty-query workspace filter.
- **Migration safety:** no migration was added or edited by the conflict resolution. The one migration brought by main is byte-identical to `origin/main`.
- **Findings:** 0 open CRITICAL and 0 open HIGH. Existing MEDIUM evidence gaps A3 (timed SC-003 evidence) and A4 (hosted SC-005 measurements) remain unchanged and outside this test-only scope.
- **Verification:** final-head gates and Stack C integration are run after the merge commit; see S34 report.


## S37 PR #43 migration rename entry analysis

- **Date:** 2026-11-08, after the S37 plan/task additions.
- **Scope:** sequence-only migration filename correction for existing open PR #43; no SQL, schema or product behavior change.
- **Authority:** S36-PO-4 item 6 (= A), S36-PO-5 #43; architect S36-R5 and #43 mapping in `s36-architect-rulings-4.md`. Exact PO text and source paths are recorded in the S37 run report.
- **Entry check:** PASS. `spec.md` has numbered FR-001?FR-021 (including FR-016a), measurable SC-001?SC-005 and Given/When/Then scenarios; approved decisions and explicit no-open-ambiguities statement. `plan.md` includes this scope. `tasks.md` includes T901 tagged FR-011. Analyze is dated after this plan/task update.
- **Findings:** 0 open CRITICAL, 0 open HIGH. Existing MEDIUM follow-ups A3/A4 remain unchanged and outside this filename-only scope.
- **Gate:** PASS for T901. Static Spec Kit check only; no implementation or test execution is claimed here.


## S37 PR #43 Option D clarification re-analysis

- **Date:** 2026-11-08, after the Option D plan/task clarification.
- **Scope:** Sequence-only migration filename correction on existing PR #43; no SQL, schema, or product behavior change.
- **Authority:** S37-PO-6 verbatim at `C:/Users/NEW LAP/.lifter/runs/s37-po/s37-po-1.verbatim.txt`; S36-PO-4 item 6 verbatim at `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-4.verbatim.txt`.
- **Clarification:** Stack C is excluded and untouched; no command, query, or harness call may target Stack C. Its history is repaired later only under a PO-approved procedure if ever needed. Prior applied-history audit found both versions absent on B and D; the fresh all-origin-ref scan governs version selection.
- **Spec Kit entry check:** PASS. `spec.md`, `plan.md`, `tasks.md`, this dated analysis, and Spec Kit path check are recorded in the run report. Numbered FRs, measurable SCs, Given/When/Then scenarios, clarification source, and explicit no-open-ambiguities statement are present. T901 remains tagged FR-011.
- **Findings:** 0 open CRITICAL, 0 open HIGH.
- **Gate:** PASS for T901; no implementation or test execution claimed by this analysis.


## S45 T068 evidence re-analysis for T043 entry gate

- **Date:** 2026-11-10 18:47 UTC, after the T068 status/evidence update in 	asks.md and traceability evidence in the S45 base commit 7ff8c1d2.
- **Scope:** Revalidate T043 implementation entry. The T068 edit marks the already-approved inventory complete and cites its executed evidence; it changes no product requirement, acceptance criterion, scope, plan, or task behavior.
- **Spec:** F16 numbered functional requirements include FR-023 and FR-014; measurable success criteria and Given/When/Then scenarios are present. The invalid/disallowed-host video edge case and D16-3 HTTPS YouTube/Google Drive host decision cover the T043 validator behavior.
- **Clarifications:** spec.md has a Clarifications section, cites the approved D16-3 decision, and explicitly states no open ambiguities for the relevant scope.
- **Plan/tasks:** plan.md covers canonical video storage, version writes and host validation. 	asks.md T043 is tagged FR-023 and FR-014, names T052/T037/T068 predecessors, RED-first tests, the ideo_url allowlist-only extension and host/current-version mutations.
- **Findings:** 0 open CRITICAL, 0 open HIGH. No new PO decision or ambiguity found.
- **Entry check:** PASS for T043 after the independently recorded T068 completion.
- **Gate:** Static Spec Kit Analyze; this confirms requirements and scope only, not implementation or test execution.

## S45 T043 implementation re-analysis

- **Date:** 2026-11-10 19:50 UTC, after the T043 traceability and T037 completion evidence updates.
- **Scope:** T043 canonical immutable exercise Video implementation; no product requirement, acceptance criterion, scope, plan, or decision text changed.
- **Spec Kit entry check:** PASS. `spec.md` has numbered FRs, measurable SCs, and Given/When/Then scenarios; Clarifications cite D16-3 and state no open ambiguities. `plan.md` covers canonical video storage, version writes, host validation, and reads. `tasks.md` T043 names FR-023/FR-014 and predecessors T052/T037/T068. The S45 T068 gate is recorded above.
- **Findings:** 0 open CRITICAL, 0 open HIGH. No PO decision or ambiguity found.
- **Gate:** PASS for T043 implementation and evidence update. Runtime evidence is recorded in `traceability.md`; T052 migration gates are recorded in the S45 run report.

## S45 T045 workspace-private exercise Video

- **Date:** 2026-11-10 20:17 UTC, after the T045 test, task-status, and traceability updates.
- **Scope:** T045 stores a nullable private exercise `video_url` in immutable version content, using the owning-workspace write operation and the shared T043 URL validator. No schema or product behavior change was needed because T043's validator extension already flows through `catalog_write_workspace_exercise`.
- **Entry check:** PASS. `spec.md` FR-024/FR-004 and its workspace-private video scenarios define the scope; the S36-PO-3 answer to F16-MCQ-9 governs client projection separately. `plan.md` specifies private video in version content and owning-workspace writes. `tasks.md` T045 is FR-tagged and depends on T043. D16-3 and S37-PO-10 close host behavior; no open ambiguity.
- **Findings:** 0 open CRITICAL, 0 open HIGH. No PO decision needed.
- **Gate:** PASS for T045. Stack A test and mutation evidence is recorded in `traceability.md` and the lane report.
