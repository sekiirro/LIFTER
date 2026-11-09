# Analyze — F11 client accounts

## S40 round 6 analysis (CodeRabbit round 3 on head 765a6ae8, fix round, s41-haiku-f11-r4) — 2026-11-09 21:01 +02:00, round 12 (current; written after the fix edits to spec.md, plan.md, tasks.md and research/s40-pending-mcqs.md; supersedes round 11 for statuses)

Findings addressed (CodeRabbit CHANGES_REQUESTED 5831034045 on 765a6ae8; 7 actionable, all inline):
- plan.md:203, deleted-client manual write: the PO write path locks the client under the P-S40-1 step 0 deletion lock and rejects deletion_pending, release_pending, released or deleted clients (plan P-S40-2; spec FR-022; T050).
- plan.md:203, concurrency: one per-workspace lock shared by the manual-write trigger, the distribution writer and the membership/role change triggers; ascending workspace_id order for multi-workspace role changes (architect technical choice; plan P-S40-2; T050 concurrency case).
- plan.md:206, Workspace Owner read path: a SELECT-only policy for the WO's own workspace (no INSERT/UPDATE/DELETE); the exact helper is an architect technical choice before T055 (plan P-S40-2 Read; FR-027; T050).
- plan.md:217, existing manual assignment: outcome `no_op_active_assignment_exists`, completed under the same lock; follows FR-028 (f) PO override always wins; no retry loop (plan P-S40-5 Delivery; spec FR-028 (g); T058).
- spec.md:233, SC-014: existing audit/F12/F13/signup rows unchanged in content and none removed; only the append-only deletion audit rows the steps write are new (aligns with FR-025 confirmation audit event; plan P-S40-1 test line; T047 wording).
- tasks.md:284, T054 gate: FR-028 verified only after T058, T062 and T063.
- research/s40-pending-mcqs.md:42, S40-F11-MCQ-14 option C: clarified that email and phone are cleared by step D (FR-018, FR-020); the option set is unchanged and MCQ-14 stays PENDING-PO. No option is decided or encoded.

No new product decision was encoded. The PO-blocked items (S40-F11-MCQ-12..20) are unchanged and not encoded; none of the findings needed a new MCQ.

Gate after the fix: CRITICAL open 0. HIGH open 0. MEDIUM open 9 (MCQ-12..20, PO-blocked, unchanged). Static consistency re-run: grep for the new outcome name, SC-014 wording, T054 gate and the WO read clause across spec/plan/tasks: PASS.

## S40 round 5 analysis (CodeRabbit round 2 on head 7fe218b5, fix round) — 2026-11-09 19:10 +02:00, round 11 (superseded by round 12 for statuses)

Findings addressed (CodeRabbit CHANGES_REQUESTED 5829632170 on 7fe218b5; 4 actionable: 4 inline threads and 1 review-body "Unverified finding" that was verified against `supabase/migrations/20261031121000_client_accounts_model.sql:183`, the `signup_auth_claim_sync` trigger on `auth.users` email/phone update):
- PRRT_kwDOVYgYQ861W2LK (plan.md:202, system actor for automatic rows): the record has `assignment_source` (`po_manual` | `system_distribution`), `assigned_by` required only for manual rows, `source_approval_id` for system rows. Attribution never needs an unrelated staff user.
- PRRT_kwDOVYgYQ861W2LT (plan.md:207, role change is global): a role change away from trainer ends the Trainer's active rows in every workspace; a membership revocation ends them only in that workspace; restoration never reactivates.
- PRRT_kwDOVYgYQ861W2Le (plan.md:217, job completion): the job records `completed_at` and `outcome` in the same transaction; a retry checks the job, not the assignment rows.
- PRRT_kwDOVYgYQ861W2Ln (tasks.md:292, durable job emission): new forward-only task T063 (FUTURE, blocked by the S40 gate, the T062 design approval and 012 approval implementation); distinct from the approval fact of 012 T016.
- Review-body unverified finding (plan.md:195, claim sync replaces the old email claim at step C): step C is a guarded exception to `signup_auth_claim_sync`; the old claims stay reserved by the release_pending client until step D; a pause between C and D is tested in T047.

Gate after the fix: CRITICAL open 0. HIGH open 0. MEDIUM open 9 (MCQ-12..20, PO-blocked, unchanged). Static consistency re-run: PASS.

## S40 round 4 analysis (CodeRabbit round 1 on head d8bb100d, fix round) — 2026-11-09 18:56 +02:00, round 10 (superseded by round 11 for statuses)

Findings addressed (CodeRabbit CHANGES_REQUESTED 5829417127 on d8bb100d; 5 inline threads plus 1 review-body finding; all valid):
- PRRT_kwDOVYgYQ861Wf10 (analyze.md:20, product-question options not repo-accessible): full options for MCQ-12..20 are in `research/s40-pending-mcqs.md`; the copy proposal is `research/s40-new-workspace-copy-proposal.md`; references repointed.
- PRRT_kwDOVYgYQ861Wf1- (plan.md:195, identifier release before Auth confirms): P-S40-1 now releases nothing at step B. Client identifiers and claims stay reserved until step D, which runs after Auth step C is confirmed. Tests: T047 old-email/new-phone and new-email/old-phone reuse.
- PRRT_kwDOVYgYQ861Wf2E (plan.md:207, departed assignment reactivated on membership or role restoration): P-S40-2 ends the Trainer's active rows on membership revocation or role change away from trainer (trigger, same transaction); no reactivation; the assignment stores `workspace_membership_id`; T050 tests both restoration cases.
- PRRT_kwDOVYgYQ861Wf2K (plan.md:217, distribution after deletion): P-S40-5 locks the client row with the deletion lock and re-checks eligibility; delayed events are a no-op; T058 tests.
- Review-body finding (012 spec.md:176, approval-event delivery to distribution, "Unverified finding"): 011 FR-028 (g) durable job written in the approval transaction, retries, backlog, idempotent; 012 FR-022 cross-reference; T058 tests. Treated as valid (a crash after approval would leave an eligible client unassigned).
- PRRT_kwDOVYgYQ861Wf2T (tasks.md:276, global clarification gate): tasks.md S40 section now states the global gate; T047/T048 notes say decision-unblocked only; spec Assumptions line updated. Zero open ambiguities is NOT stated.

Gate: CRITICAL open 0. HIGH open 0. MEDIUM open 9 (MCQ-12..20, unchanged, PO-blocked). Re-run static consistency after the fix: PASS.

## S40 round 3 analysis (S40-PO-13 + S40-R19) — 2026-11-09 18:45 +02:00, round 9 (superseded by round 10 for statuses; written after the round 3 edits to spec.md, plan.md, tasks.md, traceability.md and after the 003/012 cross-reference edits)

Entry check (Spec Kit gate section 1, for the touched scope): spec.md FR-018–FR-028 and SC-013–SC-022 with Given/When/Then US5 scenarios 1–8: PASS. Clarifications: Round 3 block quotes the S40-PO-13 MCQ lines byte-exact; S40-R19 labelled as architect ruling: PASS. plan.md P-S40-1..5 cover the touched scope: PASS. tasks.md T047–T062 carry FR tags: PASS. This file is dated after the last change: PASS.

Decided in round 3 (PO): S40-F11-MCQ-1 = B (FR-018, spec 003 FR-015 S40 amendment), MCQ-2 = A (P-S40-1 guarded release, Admin API only, explicit S37-PO-16 exception for this mechanism), MCQ-11 = defaults (FR-028 a–f).
Ruled in round 3 (architect, S40-R19, labelled): MCQ-4 keep ended rows; MCQ-8 in-app channel; MCQ-10 `manage_staff_access` (no matrix change). MCQ-12 stays PENDING (copy proposal file).

Gap sweep (addendum C, before the first CodeRabbit request). Technical gaps fixed in this round:
- G9-1 (fixed): a deleted client's active assignment row was not ended. P-S40-1 step B now ends it in the same transaction.
- G9-2 (fixed): the unassigned list could include deleted clients. FR-027 excludes them.
- G9-3 (fixed): concurrent approvals could over-assign one trainer. P-S40-5 adds a per-workspace lock and one active row per approval.
- G9-4 (fixed): tie-break was not deterministic at equal timestamps. FR-028 (d) adds ascending `user_id`.
- G9-5 (fixed): stale "BLOCKED by MCQ-1/-2/-4/-8/-10/-11" text in tasks, traceability and plan. Updated to the round 3 status.
- G9-6 (fixed, 012): a deletion-pending or deleted client could be approved or rejected. 012 edge case refuses it with the FR-017 stale-state response.
- G9-7 (fixed): 012 FR-022 did not name the approval commit as the FR-028 trigger. Cross-reference added.
- G9-8 (fixed): the 012 Out of Scope line "client closure/deletion" now points to 011 FR-018–FR-026.

Product questions raised in one batch (PENDING-PO; full options in `research/s40-pending-mcqs.md`):
- S40-F11-MCQ-12 (copy, carried), -13 (last active Workspace Owner deletion), -14 (personal fields on the terminal client row), -15 (capability for WO/Trainer/Sales deletion), -16 (never-assigned tie-break; "active client" reading), -17 (placement of the New workspace action; no switcher component on origin/main), -18 (financial-resolution confirmation content), -19 (workspace creation fields, slug, lost-response retry), -20 (Platform Owner self-deletion).

Findings (round 9):
| ID | Severity | Finding | Status |
|---|---|---|---|
| A-S40-R9-1 | MEDIUM (open, PO) | MCQ-12 copy not approved | OPEN — blocks T051/T056 copy |
| A-S40-R9-2 | MEDIUM (open, PO) | MCQ-13 last active Workspace Owner | OPEN — blocks WO-last case of T047 |
| A-S40-R9-3 | MEDIUM (open, PO) | MCQ-14 terminal client row fields | OPEN — blocks T048 field clearing |
| A-S40-R9-4 | MEDIUM (open, PO) | MCQ-15 staff deletion capability | OPEN — blocks staff cases of T047/T048 |
| A-S40-R9-5 | MEDIUM (open, PO) | MCQ-16 never-assigned tie-break; "active client" reading | OPEN — blocks T058/T062 sub-cases |
| A-S40-R9-6 | MEDIUM (open, PO) | MCQ-17 placement (no switcher component on origin/main) | OPEN — blocks T051/T056 placement |
| A-S40-R9-7 | MEDIUM (open, PO) | MCQ-18 financial-resolution confirmation content | OPEN — blocks T059 implementation |
| A-S40-R9-8 | MEDIUM (open, PO) | MCQ-19 creation fields, slug, lost-response retry | OPEN — blocks T051/T056 form |
| A-S40-R9-9 | MEDIUM (open, PO) | MCQ-20 Platform Owner self-deletion | OPEN — blocks self-deletion case of T047 |
| A-S40-2 (round 8) | MEDIUM | Release mechanism | CLOSED (S40-PO-13 MCQ-2 = A) |
| A-S40-15 (round 8) | MEDIUM | Staff deletion vs 003 FR-015 | CLOSED (S40-PO-13 MCQ-1 = B; 003 FR-015 S40 amendment) |
| G9-1..G9-8 | fixed in round 9 | see above | CLOSED |

Counts (round 9): CRITICAL open 0. HIGH open 0. MEDIUM open 9 (A-S40-R9-1..9, all PO-blocked, none a defect in the spec text). Cross-feature check: 003 FR-015 and 011 FR-018/P-S40-1 agree (no FK or trigger change; no hard deletion). "Zero open ambiguities" is NOT stated for S40. This is a static document review; it makes no implementation-conformity claim.

## S40 round 2 analysis (S40-PO-10) — 2026-11-09 round 8 (superseded by round 9 for statuses; written after the CodeRabbit round 2 fixes on head e143456c)

- Date: 2026-11-09, round 8. Written after the last change to spec.md, plan.md, tasks.md and traceability.md in this round.
- CodeRabbit review on `e143456c` (14:22:59Z, CHANGES_REQUESTED, 2 actionable). Both checked against the current text and found VALID:

| ID | Severity | Finding | Status |
|---|---|---|---|
| A-S40-27 | MINOR (valid) | Key Entities required one record linked to an active Trainer per client, while FR-027 allows clients with no valid assignment (`spec.md:208`). FR-022 said each client "MUST resolve" to a Trainer, with the same contradiction. | FIXED: Key Entities and FR-022 allow zero or one valid assignment (unassigned, FR-027); membership checked at resolution. |
| A-S40-28 | MINOR (valid) | The T054 gate for FR-018 did not require T060 or the spec 003 T015 guard for the Platform Owner branch (`tasks.md:282`). | FIXED: T054 FR-018 gate adds T060 and spec 003 T015 for the Platform Owner branch. |

- Gate verdict (round 8): CRITICAL open 0. HIGH open 0. MEDIUM open 9 (unchanged). PENDING-PO unchanged: S40-F11-MCQ-1, -2 (conflict form), -4, -8, -10, -11, -12. Zero open ambiguities are NOT stated for S40.

### Round 7 (superseded for statuses)

## S40 round 2 analysis (S40-PO-10) — 2026-11-09 round 7 (superseded by round 8 for statuses; written after the CodeRabbit fixes on the round 6 head 4ac8ec2e)

- Date: 2026-11-09, round 7. Written after the last change to spec.md, plan.md, tasks.md and traceability.md in this round.
- CodeRabbit review on `4ac8ec2e` (14:12:34Z, CHANGES_REQUESTED, 5 actionable). All 5 were checked against the current text and found VALID. Fixed in this round:

| ID | Severity | Finding (CodeRabbit thread) | Status |
|---|---|---|---|
| A-S40-22 | MAJOR (valid) | P-S40-1 sequence changes the `clients` row, so it cannot cover a Platform Owner account (`PRRT_kwDOVYgYQ861SU2F`). | FIXED: plan P-S40-1 scope bullet (client accounts only); FR-018 states the PO-account mechanism is PENDING-PO (S40-F11-MCQ-2, -10). |
| A-S40-23 | MAJOR (valid) | Automatic distribution has no write path without a human PO session (`PRRT_kwDOVYgYQ861SU2J`). | FIXED: plan P-S40-5 system entry point, not approved and blocked by S40-F11-MCQ-11; FR-028 names the restricted entry point. |
| A-S40-24 | MINOR (valid) | Key Entities required start/end history while MCQ-4 is open (`PRRT_kwDOVYgYQ861SU2S`). | FIXED: spec Key Entities reassignment history is PENDING-PO; plan record marked as not approved. |
| A-S40-25 | MAJOR (valid) | T058 has no balance-measure gate (`PRRT_kwDOVYgYQ861SU2X`). | FIXED: T058 gate; FR-028 row not verified until a balance-measure test executes. |
| A-S40-26 | MAJOR (valid) | No implementation task for FR-028 (`PRRT_kwDOVYgYQ861SU2e`). | FIXED: T062 added, FUTURE, blocked by S40-F11-MCQ-11 and architect approval of the entry-point design; FR-028 traceability row now lists T058, T062. |

- Coverage update: FR-028 → T058, T062, SC-021 → T058, T050, T062. Every FR and SC still maps to a task.
- Gate verdict (round 7): CRITICAL open 0. HIGH open 0. MEDIUM open 9 (unchanged from round 6: A-S40-1, -3, -5, -6, -7, -15, -16, -17, -18). The five CodeRabbit findings are closed by the fixes in this round, pending thread replies and the CodeRabbit re-review.
- PENDING-PO unchanged: S40-F11-MCQ-1 and -2 (conflict form), -4 (residual), -8 (residual channel), -10, -11, -12. Zero open ambiguities are NOT stated for S40.

### Round 6 (superseded for statuses; findings and coverage still applicable)

## S40 round 2 analysis (S40-PO-10) — 2026-11-09 round 6 (superseded by round 7 for statuses; written after the round 2 edits to spec.md, plan.md, tasks.md and traceability.md)

- Date: 2026-11-09, round 6. Written after the last round 2 change to spec, plan, tasks and traceability. It supersedes the round 5 section below for S40 items.
- Scope: FR-018..FR-028, SC-013..SC-021, User Stories 5–8 (scenarios 4–6 added), the spec "Round 2" block, plan.md "S40 proposals" P-S40-1..P-S40-5, tasks T047–T061, traceability S40 rows.
- Entry check: numbered FRs, measurable SCs and Given/When/Then exist for the touched scope. Clarifications record S40-PO-10 byte-exact (`runs/s40-haiku-f11-r2/quote-check-r2.mjs`: 11 of 11 PO quotes OK; FR-025..028 and SC-018..021 each defined once). plan.md covers the touched scope. tasks.md has FR-tagged unticked tasks. "Zero open ambiguities" is NOT stated.
- Conflict audit (step 1, before encoding): `runs/s40-haiku-f11-r2/conflicts.md`. Two GENUINE CONFLICTS, held PENDING-PO and not encoded: item 1 for Workspace Owner, Trainer and Sales deletion (spec 003 FR-015, G1=A) and item 2 for the release mechanism (S37-PO-16 "No hard deletion/new mechanism").
- Coverage: FR-018→T047, T048, T059, T060; FR-019→T047; FR-020→T047, T048; FR-021→T049, T051, T056; FR-022→T050, T052, T055; FR-023→T050, T055; FR-024→T052, T053, T057; FR-025→T059; FR-026→T060; FR-027→T061; FR-028→T058. Every FR has a task and every SC maps to a task (SC-018→T059, SC-019→T060, SC-020→T061, SC-021→T058, T050).
- Unchanged by this PR: `specs/012-registration-approval` (no owned behaviour), `specs/003-tenancy-rls`, `docs/03-roadmap.md` (follow-up only), all code, SQL and migrations.

### Round 6 findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| A-S40-15 | MEDIUM (open, PO, GENUINE CONFLICT) | Non-PO staff deletion (S40-PO-10 item 1, "ALL roles") vs spec 003 FR-015 / G1=A (no deletion of auth user or `staff_profiles`; audit attribution kept). | OPEN — S40-F11-MCQ-1 (conflict form); blocks the non-PO branch only |
| A-S40-1 (updated) | MEDIUM (open, PO, GENUINE CONFLICT) | Release mechanism vs S37-PO-16 "No hard deletion/new mechanism". The outcome (release) is approved by S37-PO-10 and S40-PO-10 item 2. | OPEN — S40-F11-MCQ-2 (conflict form); blocks T048 and the release tests |
| A-S40-2 (updated) | RESOLVED in part | Auth-write rule (spec 013 `ledger-architecture.md:55`): a release is compatible only through the Auth Admin API. FR-018 now says so. | Rule compatible; mechanism still OPEN (MCQ-2) |
| A-S40-3 (updated) | MEDIUM (open, PO) | PO-only write and PO-account deletion need a permission. FR-008 and FR-023 forbid a matrix change unless the PO approves one. | OPEN — S40-F11-MCQ-10 |
| A-S40-4 (updated) | LOW | Items 1 (PO part), 3 and 6 encoded. The residual deletion scope is MCQ-1. | Partly CLOSED |
| A-S40-5 | MEDIUM (dependency) | Spec 003 last-PO guard not implemented on origin/main (`research.md:32`, F-A1; T015 pending). It blocks Platform Owner account deletion (FR-026). | OPEN dependency on spec 003 |
| A-S40-6 | MEDIUM (dependency) | F15 spec is not on origin/main. | OPEN — blocks T053 only |
| A-S40-7 (updated) | MEDIUM (governance) | GOV-1 (independent critique) is approved by S40-PO-10 ("GOV-1: Approve critique") but is not in round 2's steps and was not run. | OPEN — architect to dispatch |
| A-S40-16 | MEDIUM (open, PO) | Reassignment history (ended rows kept or replaced in place), the S40-F11-MCQ-4 residual. | OPEN — S40-F11-MCQ-4 |
| A-S40-17 | MEDIUM (open, PO) | Automatic distribution rules: trigger, tie-break, inactive trainers, client-count and balance measure. | OPEN — S40-F11-MCQ-11; blocks T058 |
| A-S40-18 | MEDIUM (open, PO) | EN/AR copy for the "New workspace" action. | OPEN — S40-F11-MCQ-12; blocks T051, T056 |
| A-S40-19 | LOW (open, PO) | Alert channel (frequency decided). | OPEN — S40-F11-MCQ-8 channel; blocks T057 only |
| A-S40-20 | LOW (follow-up) | Roadmap `docs/03-roadmap.md:26` and `docs/01-traceability.md:27` place balanced auto-assignment in P4; S40-PO-10 item 9 includes it. Judged NO CONFLICT (informed override). | Docs follow-up for the PO; not edited here |
| A-S40-21 | LOW (interpretation) | "ONLY Platform Owner assigns" (item 4) vs automatic distribution (item 9). Encoded as: humans are PO-only; automatic distribution is a system action. | Encoded in FR-028; confirm via S40-F11-MCQ-11 |

Prior round rows A-S40-8..A-S40-14 remain CLOSED as recorded in the round 5 section below.

### Gate verdict (round 6)

- CRITICAL open: 0. HIGH open: 0. MEDIUM open: 9 (A-S40-1, -3, -5, -6, -7, -15, -16, -17, -18). All are PO-blocked or dependency-blocked. None is a defect in the spec text.
- PENDING-PO (explicit, blocks only the named tasks): S40-F11-MCQ-1 (conflict form), S40-F11-MCQ-2 (conflict form), S40-F11-MCQ-4 (reassignment history, residual), S40-F11-MCQ-8 (alert channel, residual), S40-F11-MCQ-10 (permission mechanism), S40-F11-MCQ-11 (automatic distribution rules), S40-F11-MCQ-12 (EN/AR copy).
- "No open ambiguities" is NOT stated for S40. Implementation of the blocked tasks is not approved. No implementation is started.

## S40 spec-only analysis — 2026-11-09 round 5 (superseded by round 6 above for S40 items)

- Date: 2026-11-09 (round 5, after the CodeRabbit round-1 to round-4 fixes; written after the last S40 change to spec.md, plan.md, tasks.md and traceability.md).
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
| A-S40-13 | RESOLVED (CodeRabbit round 3 on 2133707b, one finding; flagged by CodeRabbit as unverified, but the gap is real in the proposal as written) | The ban (A) ran before any durable intent row existed, so a crash between (A) and (B) left nothing to resume from. Fixed: step (0) writes a durable intent row and a `deletion_pending` state before any Auth call; every later step is driven from that row; T047 adds the crash-between-steps case. | CLOSED in this round; re-analysed here |
| A-S40-14 | RESOLVED (CodeRabbit round 4 on c984c420, one finding, valid) | T047 tested non-PO denial but not revocation of an existing JWT. Fixed: T047 adds existing-JWT denial at app `authorize()`, RLS, direct PostgREST/RPC and Storage, while pending and after completion; T054 records FR-018 only after these checks run. | CLOSED in this round; re-analysed here |
| A-S40-12 | RESOLVED (CodeRabbit round 2 on 850c6892, two findings, both valid) | (a) plan P-S40-1 is not recoverable if the Auth update fails after the database step. Fixed: ordering is ban (A), then one transaction with a `release_pending` row (B), then an idempotent Auth placeholder retry (C), with completion only after confirmation (D); FR-018 and T047 gain the failure-and-retry case. (b) P-S40-2 trusted membership alone, while a PO can change a role without revoking membership (`supabase/migrations/20261027120000_tenancy.sql:127–128`). Fixed: the lookup also checks `staff_profiles.role = 'trainer'` at read time; T050 covers the role-change case. | CLOSED in this round; re-analysed here |

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
