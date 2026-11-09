# Spec Kit Analyze — F20 Client Notes

**Analysis date**: 2026-11-09T15:15Z (round 12, re-run after the round-12 CodeRabbit fixes to data-model.md, spec.md FR-007/FR-010 and Story 2 scenario 6, tasks.md, plan.md and the contracts; every spec, plan, tasks, contracts, data-model and research edit precedes this analysis)
**Inputs**: spec.md, plan.md, tasks.md, data-model.md, research.md, contracts/client-notes-api.md, contracts/client-notes-rls.md
**Scope**: Spec-only. No code, SQL, migrations, or runtime work.

## Verdict

**0 open CRITICAL/HIGH findings. All F20 PO questions are resolved and the one architect ruling is encoded. No open ambiguities remain.** CN-MCQ-01..14 are RESOLVED by the PO. CN-MCQ-16 (exit-protection copy and Save Draft) is RESOLVED by S38-PO-10 ("CN-MCQ-16 approved: unsaved-changes warning, no Save Draft. Approve proposed copy.") and S38-PO-11 ("Approved", confirming the draft strings in `runs/s38-po/cn-mcq-16-proposed-copy.md` rows 30-33). CN-MCQ-17 (Discard with an in-flight save) is RESOLVED by S39-PO-8, option A. CN-MCQ-18 (idempotent save/retry with DB-level duplicate prevention) is RESOLVED by S39-PO-9, option A. CN-MCQ-19 (in-flight exit-warning copy) is RESOLVED by S40-PO-3, option Variant 1 (Recommended); its exact EN and Egyptian Arabic strings are encoded byte-exact as spec.md row 34, key `clientNotes.exitWarning.bodyInFlight`. CN-MCQ-20 (retry after a hard delete) and CN-MCQ-21 (note field read-only while a save is in flight) are RESOLVED by S40-PO-6, options A: the PO selected “CN-MCQ-20: A: Never recreate (Rec.)” and “CN-MCQ-21: A: Read-only (Rec.)”; the parenthesised mapping in that section is architect words, not PO words, and is labelled as such. CN-MCQ-22 (same-key retry with a different body) is RULED by architect ruling S40-R9, option A (not a PO question): a same-key create with a different body is rejected as a key/body mismatch. CN-MCQ-15 was removed by architect ruling S38-R9 under S38-PO-3 and its ID is not reused. CN-MCQ-23 (exit-warning copy and Stay/Discard behavior while a save outcome is unknown) is RESOLVED by S40-PO-10, option A: the PO selected “CN-MCQ-23: A: Existing error copy (Rec.)”; the parenthesised mapping in that section is architect words, not PO words, and is labelled as such. Encoded: the unknown-result exit warning uses the approved title, Stay and Discard rows 30, 32 and 33 with the approved generic save-error body CN-MCQ-08 row 18; rows 31 and 34 are not reused; leaving cancels nothing; the unresolved create keeps its key for Retry; no new copy.

Scope note (not an F20 ambiguity): the app-wide audit retention period (DP-02 / ND-F5-1 / B4, `docs/13-production-readiness.md`) is an open pre-production decision. CN-MCQ-13 makes Client Notes follow the existing `public.audit_events` retention unchanged, so F20 does not depend on it and does not decide it. It is tracked outside this feature.

## Counts verified against the artifacts

- CN-MCQ IDs in the register: 22 defined (01-14, 16, 17, 18, 19, 20, 21, 22 and 23; CN-MCQ-15 removed, ID not reused). PO-resolved: 21 (01-14, 16, 17, 18, 19, 20, 21 and 23). Architect-ruled: 1 (22). Open: 0.
- Functional requirements: 11 (FR-001..FR-011). Success criteria: 7 (SC-001..SC-007). Tasks: 15 (T001..T015; T008..T015 are test tasks). Acceptance scenarios: Story 1 = 3, Story 2 = 8, Story 3 = 8.
- Task ticks: 0 (`grep "\[x\]"` on tasks.md returns no match). All tasks remain unticked (spec-only; S38-R8).
- Approved copy: CN-MCQ-08 rows 1–29 (S38-PO-2), CN-MCQ-16 rows 30–33 (S38-PO-11) and CN-MCQ-19 row 34 (S40-PO-3). All 34 copy-table rows are byte-identical to the previous head `ad215a43` (script check over the whole table, 34/34 unchanged); no new copy was added in round 11.
- Authority byte verification: the S40-PO-10 PO line “CN-MCQ-23: A: Existing error copy (Rec.)” and the CN-MCQ-23 architect-mapping sentence are present byte-exact in spec.md; the earlier S40-PO-6 two PO lines, its parenthesised architect mapping and the S40-R9 paragraph remain byte-exact. Script: `runs/s40-ds-cn-r11/verify-authority.cjs` (ALL PASS).
- CN-MCQ-20 is encoded in FR-011, the data-model content-free create-idempotency record, SC-007, T003, T004 and T015.
- CN-MCQ-21 is encoded in FR-007, Story 2 scenario 6, Story 3 scenario 8, plan.md, the API contract, T005 and T013.
- CN-MCQ-22 is encoded in FR-011, SC-002, SC-007, the data-model create-key rule, the API and RLS contracts and T015.
- CN-MCQ-23 is encoded in FR-007, Story 2 scenario 6, Story 3 scenario 8, plan.md, the API contract, T005, T013 and the register, using only the approved rows 30, 32, 33 and 18.
- Round-11 CodeRabbit review 5827032656 on `cc5da506` raised two findings, both valid and fixed: the edit-retry contract is now explicit (an edit retry is a new save, not an idempotent replay; creates alone carry an idempotency key; a retry follows last save wins and each successful write emits its own audit event) in FR-009, Story 3 scenario 8 and T010; and the tasks coverage table now has an SC-007 row mapped to T004/T015.
- Round-11 CodeRabbit review 5827278025 on `f858f120` carried one unverified Minor additional comment on data-model.md:41 (key-state transition in the delete transaction). Addressed as a data-integrity clarification within FR-010/FR-011: the hard delete must set the surviving key record's deleted state, remove the note row and write its audit event atomically, and a failed key-state update rolls the delete back. Stated in FR-011, the data-model entity paragraph and invariant 9, T004 and T015; no product decision is changed.
- No new user-visible string is added. The mismatch and deleted/not-found outcomes use the existing generic save-error state (CN-MCQ-08 row 18); the architect ruling S40-R9 states "no user copy added (generic existing save-failed state)". The unknown-result recovery uses the existing save-error and Retry rows 18 and 17 under PO-approved DESIGN.md Q51.
- Contracts (`client-notes-api.md`, `client-notes-rls.md`): the create row carries same-key/same-body return with trimmed body equality, same-key/different-body mismatch refusal, retry-after-delete deleted/not-found, note-side uniqueness and the atomic hardened boundary; the display section carries the read-only-while-in-flight rule and the unknown-result recovery; the RLS contract adds duplicate-key, mismatch, retry-after-delete, retry-after-edit and content-free-record test rows and requires the fingerprint. The RLS contract's "no row persisted" rows apply only to refused writes, not to Discard or to a duplicate-key return.
- Round-10 CodeRabbit review 5826069631 raised five findings (2 Major, 3 Minor). All five are fixed: the fingerprint is required and retry-after-edit compares the original submission (RLS contract); the note row has its own unique constraint plus a hardened atomic write boundary (data-model, FR-011, T003, T015); retry body equality is defined after trimming (FR-011, data-model, API contract, T015); Story 2 scenarios 7-8 and SC-007 now qualify live/matching-body returns and state the mismatch and deleted outcomes; the unknown-result state retains text and offers the existing Retry/save-error states under PO-approved DESIGN.md Q51. None is a new product question.

## Findings

| Severity | Open count | Findings |
| --- | ---: | --- |
| CRITICAL | 0 | None. Authorization, tenant isolation and deny-by-default are explicit in FR-004/FR-005, the RLS contract and T006/T011. Create idempotency is not an authorization path (FR-011). |
| HIGH | 0 | None. |
| MEDIUM | 0 | None. CN-MCQ-16..CN-MCQ-21 and CN-MCQ-23 are resolved and encoded; CN-MCQ-22 is ruled and encoded. No open PO question remains. |
| LOW | 1 | FR-006/FR-007 name the reusable components by family (textarea, button, dialog, toast, States). The repository has `components/ui/` with Button, ConfirmDialog, Field, Toast, States and Bidi; the textarea mapping is not verified in this spec-only round. **Not an ambiguity**: it is a check for the implementation task that uses the component (T005), under the existing design gate. |

### Inconsistency check (round 11 edits)

- Status lines in spec.md, plan.md and tasks.md agree: CN-MCQ-20 and CN-MCQ-21 RESOLVED by S40-PO-6, CN-MCQ-22 RULED by S40-R9, CN-MCQ-23 RESOLVED by S40-PO-10, no open behavioural ambiguity, no implementation authorized.
- CN-MCQ-20 (content-free idempotency record; retry after a hard delete returns deleted/not-found and never recreates the note) is stated consistently in FR-011, SC-007, the data-model entity, invariant 9 and migration description, the API and RLS contracts, T003, T004 and T015, and the register.
- CN-MCQ-21 (note field read-only while a save is in flight; only row 34 applies; no combined warning state; no new copy) is stated consistently in FR-007, Story 2 scenario 6, Story 3 scenario 8, the copy-table note, plan.md, the API contract, T005 and T013, and the register.
- CN-MCQ-22 (same-key different-body mismatch: no second note, no body change, no create audit event, body equality after trimming) is stated consistently in FR-011, SC-002, SC-007, Story 2 scenarios 7-8, the data-model create-key rule and invariants, the API and RLS contracts, T004 and T015, and the register. The architect ruling is labelled as not a PO question.
- The note-side unique constraint and the hardened atomic write boundary are stated in FR-011, the data-model `idempotency_key` attribute, the create-key entity and invariant 9, the API and RLS contracts, T003 and T015. At most one live note can reference a key; the key record survives a hard delete.
- The unknown-result recovery is stated consistently in FR-007, Story 2 scenario 6, Story 3 scenario 8, the API contract, plan.md (UI and risk), and T005/T013. It reuses the existing save-error and Retry rows 18 and 17 under PO-approved DESIGN.md Q51; no new copy is added.
- CN-MCQ-23 (unknown-result exit warning: title/Stay/Discard rows 30/32/33 with the generic save-error body row 18; rows 31 and 34 not reused; leaving cancels nothing; the unresolved create keeps its key for Retry; no new copy) is stated consistently in FR-007, Story 2 scenario 6, Story 3 scenario 8, the API contract, plan.md, T005/T013, Clarifications item 16 and the register.
- The CN-MCQ-08 table (rows 1–29), CN-MCQ-16 rows (30–33) and CN-MCQ-19 row 34 are unchanged; no new copy row was added. Row 31 (body) is limited to unsubmitted text; rows 30, 32 and 33 (title, Stay, Discard) also label the in-flight warning.
- The idempotency rule is stated identically in FR-011, SC-002, SC-007, Story 2 scenarios 7–8, plan.md (data section, risk and phases 4/6), data-model.md (column, entity, invariant 9 and migration description), both contracts, T003, T004 and T015.
- No statement in spec.md, plan.md, tasks.md or the contracts promises cancellation, "no row persisted" or "no audit event" for a save that has already been submitted. The remaining "no row persisted" statements are refused-write cases only (Story 2 scenario 2, FR-002, SC-002, RLS contract body rows).
- Task ordering text (tasks.md "Dependency order") names CN-MCQ-16, CN-MCQ-17, CN-MCQ-18, CN-MCQ-19, CN-MCQ-20, CN-MCQ-21 and CN-MCQ-22 as resolved/ruled with their encodings. The S38-R8 rule is unchanged: a test task is ticked only after its tests execute and pass. Tasks remain at 0 ticks.

### Constitution check (round 12)

The constitution is present at `.specify/memory/constitution.md` (version 1.4.0; `git ls-tree` at `36db167e` lists it). The round-11 statement that it was absent was wrong and is corrected here. Governance requires every spec, plan and review to include this check. Result per principle:

- **I. Strict Workspace Isolation: PASS.** Every note relation carries `workspace_id`; the note and the create-idempotency record each carry a `(workspace_id, id)` unique key (data-model.md; FR-005; contracts/client-notes-rls.md). Access is denied by default at both walls. Foreign-workspace negative tests are in T011 and T014.
- **II. Immutable Financial Truth: NOT APPLICABLE.** No ledger, payroll or subscription data.
- **III. Platform Owner Governance & Least Privilege: PASS.** Hard delete is PO-only; the existing role set is reused; Sales and Client are denied (FR-004, FR-005).
- **IV. Approved Scope Only: PASS.** Client Notes is PO-approved (S36-PO-5, S37-PO-6, S37-PO-7). No PRD-12 exclusion or YBS behaviour is built.
- **V. Versioned, Non-Retroactive Content: NOT APPLICABLE.** Notes are not plans, forms or catalog entries. The PO's "no version history" rule is FR-003.
- **VI. Human-Governed People Decisions: NOT APPLICABLE.** No KPI, incentive, deduction or termination behaviour.
- **VII. Privacy & Health-Data Protection: PASS for the spec, with an implementation check.** Audit is metadata-only (FR-010; CN-MCQ-07). Round 12 adds to FR-010 that note text is not written to logs. An author who leaves is kept as "Unavailable author" (CN-MCQ-06). The log-scrub check runs at implementation (T012 and the merge gates).
- **VIII. Bilingual, Accessible, Design-System UI: PASS for the spec; implementation gate pending.** FR-006 and FR-007 require DESIGN.md and the existing components, AR RTL and EN LTR, and `Bidi` wrapping with no machine translation. The Frontend Design Gate (real screenshots for AR/EN × light/dark × mobile/desktop, all states, accessibility) applies at implementation (T013, SC-005).
- **IX. Reliable, Idempotent Operations: PASS.** Create idempotency and the note write are atomic; the hard delete's key-state update, note removal and audit event are atomic (FR-010, FR-011; T003, T004, T015).
- **Development Workflow: PASS.** Spec Kit order is followed (Specify, Clarify, Plan, Tasks, Analyze). No implementation is authorized by this spec-only PR, and no task is ticked (0 `[x]`).
- **Deviations:** none. No complexity-tracking entry is needed.

The lifter Spec Kit gate applies as well: zero open CRITICAL/HIGH before implementation and zero open ambiguities in approved behaviour. All F20 PO questions are resolved, and the one architect ruling is encoded. This analysis does not authorize implementation.

## Architect rulings and review findings applied to date

- **S40-PO-6 (PO)**: CN-MCQ-20 and CN-MCQ-21 answered, options A (“Never recreate (Rec.)” and “Read-only (Rec.)”). The parenthesised mapping is architect words, labelled as such in spec.md. Encoded in round 10.
- **S40-R9 (architect ruling, not PO)**: CN-MCQ-22 decided as option A: a same-idempotency-key create with a different body is rejected as a key/body mismatch: no second note, no body change, no create audit event; no user copy added. Encoded in round 10.
- **S40-PO-10 (PO)**: CN-MCQ-23 answered, option A, “Existing error copy (Rec.)”. The parenthesised mapping is architect words, labelled as such in spec.md: the unknown-result exit uses the approved generic save-error body CN-MCQ-08 row 18 with title/Stay/Discard rows 30/32/33; rows 31 and 34 are not reused; leaving cancels nothing; the unresolved create keeps its key for Retry; no new copy. Encoded in round 11.
- **CodeRabbit review 5827032656 on `cc5da506`** (CHANGES_REQUESTED, 2 inline findings): both fixed. `PRRT_kwDOVYgYQ861SRXa` (spec.md:85) asked for the edit-retry contract; the spec now states that an edit retry is a new save, not an idempotent replay (no edit idempotency key), so a later edit is replaced under last save wins (CN-MCQ-11; FR-009) and each successful write emits its own audit event (FR-010), in FR-009, Story 3 scenario 8 and T010. `PRRT_kwDOVYgYQ861SRXm` (tasks.md:49) asked for an SC-007 coverage row; added and mapped to T004/T015.
- **CodeRabbit review 5827871352 on `36db167e`** (CHANGES_REQUESTED, 3 inline findings, all valid, none a new product question): (1) `analyze.md:55` constitution check, fixed by the Constitution check section above (the file exists; checked per principle). (2) `data-model.md:20`, fixed: the note and the create-idempotency record carry `(workspace_id, id)` unique keys (constitution Principle I), in data-model.md, the migration description, T003, the RLS contract and plan.md. (3) `spec.md:95` (FR-007), fixed: a Retry refused by the server does not resolve the original create attempt; the text, read-only field and key stay, and no new create starts (CN-MCQ-23 rule, no new copy), in FR-007, Story 2 scenario 6, the API contract and T015 (refused-Retry test). FR-010 also now states that note text is not written to logs (constitution Principle VII).
- **S38-R8** (CodeRabbit thread `PRRT_kwDOVYgYQ861E1-8`, tasks.md dependency order): a test task is ticked only after its tests execute and pass (constitution §3); red runs are recorded as evidence with the box unticked. Unchanged in round 10.
- **S38-R9** (CN-MCQ-15, DESIGN.md §11 UI values): removed as a PO question (S38-PO-3). The Client Notes UI reuses existing Design System components and values and introduces no new breakpoint, touch-size, focus or token value. Unchanged in round 10.
- **CodeRabbit review 5820142764 on `e2b6a6e3`** (revoked-membership scope): fixed in `f080dc77`; non-PO scope in SC-001, Story 3 scenario 4, both contracts, plan.md and T006.
- **CodeRabbit review 5820103675 on `c428158d`** (exit protection): behaviour encoded in `e2b6a6e3`; the copy is approved (CN-MCQ-16, S38-PO-11) and encoded in round 6.
- **CodeRabbit review 5820602643 on `ccdf5b45`** (CHANGES_REQUESTED, 1 inline finding on `contracts/client-notes-api.md:18`, Minor · Functional Correctness): **valid**. Fixed in round 6; the line now names rows 30–33 for the exit-protection warning and keeps rows 1–29 for all other copy.
- **CodeRabbit review 5820674376 on `0611ae89`** (CHANGES_REQUESTED, 1 inline finding on `spec.md:65`, Major · Data Integrity & Integration; thread `PRRT_kwDOVYgYQ861GZGQ`): **valid**. A PO decision was raised as CN-MCQ-17 and answered by S39-PO-8, option A. Fixed in round 7 and carried into rounds 8, 9 and 10.
- **CodeRabbit review 5822122189 on `38581d78`** (CHANGES_REQUESTED, 2 inline findings, both PO decisions):
  - `PRRT_kwDOVYgYQ861JMXx` `spec.md:93` (Major · Data Integrity & Integration): recovery for a save with no observable result and duplicate-safe retry. **Valid**; answered by S39-PO-9 as CN-MCQ-18 option A and encoded in FR-011, SC-007, Story 2 scenarios 7–8, plan.md, data-model.md, the API contract, T003, T004 and T015. No migration file is added. Resolved in phase 1 of round 8.
  - `PRRT_kwDOVYgYQ861JMX2` `spec.md:190` (Major · Functional Correctness): the warning body overpromises loss for an in-flight save. **Valid**; answered by S40-PO-3 as CN-MCQ-19 option Variant 1 (Recommended), copy encoded byte-exact as row 34, and referenced from FR-006, FR-007, SC-004, Story 2 scenario 6, Story 3 scenario 8, plan.md, the API contract and T005/T013. Replied with the fixing SHA and file:line (comment `4512357886`) and resolved.
- **CodeRabbit review 5825479902 on `62e3cea5`** (CHANGES_REQUESTED, 5 inline findings):
  - `PRRT_kwDOVYgYQ861PcVq` `data-model.md:27` (Major · Data Integrity & Integration): keep retry deduplication after a hard delete. **Valid product question**; answered by S40-PO-6 as CN-MCQ-20 option A. Encoded in FR-011, data-model, SC-007, T003, T004 and T015.
  - `PRRT_kwDOVYgYQ861PcVx` `plan.md:42` (Minor · Functional Correctness): allow the shared title, Stay and Discard controls in the in-flight warning. **Valid editorial**; fixed in `2272ca83` (rows 30, 32 and 33 also label the in-flight warning; only row 31 body is limited to unsubmitted text).
  - `PRRT_kwDOVYgYQ861PcV6` `research.md:5` (Minor · Functional Correctness): include later PO decisions in the source hierarchy. **Valid editorial**; fixed in `2272ca83` (S36 block is the baseline, later PO decisions supplement it).
  - `PRRT_kwDOVYgYQ861PcV-` `spec.md:95` (Major · Functional Correctness): simultaneous pending and unsubmitted changes, plus warning labels. **Valid product question**; the labels part was fixed in `2272ca83`; the behaviour part is answered by S40-PO-6 as CN-MCQ-21 option A (field read-only while in flight; only row 34 applies). Encoded in FR-007, Story 2 scenario 6, Story 3 scenario 8, T005 and T013.
  - `PRRT_kwDOVYgYQ861PcWG` `spec.md:99` (Minor · Data Integrity & Integration): reject same-key retries with a different body. **Valid**; ruled by S40-R9 as CN-MCQ-22 option A. Encoded in FR-011, SC-002, SC-007, both contracts, T004 and T015.
- **PRRT_kwDOVYgYQ861FR0f** (spec.md, "obtain approval for bilingual copy and add exit-protection scenarios"): the copy is approved (S38-PO-11) and the exit-protection scenarios exist. Replied and resolved in the round-6 step.
- **CodeRabbit review 5826069631 on `40748f79`** (CHANGES_REQUESTED, 5 inline findings): all five fixed. `PRRT_kwDOVYgYQ861QhiN` (rls.md:47) requires the original-body fingerprint and adds retry-after-edit coverage; `PRRT_kwDOVYgYQ861QhiU` (data-model.md:27) adds the note-side unique constraint and hardened atomic write boundary; `PRRT_kwDOVYgYQ861QhiY` (data-model.md:40) defines retry body equality after trimming; `PRRT_kwDOVYgYQ861Qhie` (spec.md:68) qualifies Story 2 scenarios 7-8 and SC-007 for live/matching-body, mismatch and deleted outcomes; `PRRT_kwDOVYgYQ861Qhig` (spec.md:95) defines the unknown-result recovery using existing save-error/Retry rows 17-18 under PO-approved DESIGN.md Q51.
- **CodeRabbit review 5826336129 on `cd068d3d`** (CHANGES_REQUESTED, 4 inline findings): three fixed, one new PO question. `PRRT_kwDOVYgYQ861RA5t` (spec.md:67) now compares the retry body with the original submission fingerprint, not the edited body; `PRRT_kwDOVYgYQ861RA6B` (spec.md:99) gives the deleted/not-found outcome precedence over the mismatch refusal after a hard delete, aligned in scenario 8, SC-007 and T015; `PRRT_kwDOVYgYQ861RA6H` (spec.md:104) makes SC-002 apply only to new creates, with retries under FR-011/SC-007. `PRRT_kwDOVYgYQ861RA54` (spec.md:95) asked for approved exit-warning copy and Stay/Discard behavior while a save outcome is unknown; it was recorded as CN-MCQ-23 and is now RESOLVED by S40-PO-10 (option A) and encoded in FR-007, Story 2 scenario 6, Story 3 scenario 8, the API contract, plan.md and T005/T013; no copy was guessed.

## Round-4 CodeRabbit history (kept for traceability)

- Review `5819883866` on `cdb89424`: 1 inline finding on tasks.md:51 (T014 ordering and the dependency gate). The gate part was fixed in `dd5a896f`. The T014 tick part is S38-R8.
- Review `5819936996` on `dd5a896f`: COMMENTED, empty body, one reply that the thread stays open for the architect ruling.

## Coverage map (FR / SC → tasks)

| Requirement | Tasks |
| --- | --- |
| FR-001 tab placement | T005, T013 |
| FR-002 body rule, unavailable-author label | T003, T004, T009, T013, T014 |
| FR-003 edit, no history | T003, T004, T010 |
| FR-004 role × action | T002, T006, T011 |
| FR-005 isolation, RLS | T003, T006, T011, T014 |
| FR-006 PO decisions, reuse rule | T001, T007 |
| FR-007 states, copy rows 1–34, Bidi, no icon, exit protection, no Save Draft, field read-only while in flight, unknown-result recovery with existing Retry/save-error rows, unknown-result exit warning rows 30/32/33 + body row 18 (CN-MCQ-21; CN-MCQ-23; S40-PO-6; S40-PO-10; DESIGN.md Q51) | T005, T013 |
| FR-008 ordering | T008 |
| FR-009 last write wins, local time | T004, T010, T013 |
| FR-010 audit | T004, T012 |
| FR-011 create idempotency, duplicate returns existing note, trimmed body equality, note-side uniqueness and hardened boundary, mismatch refusal, retry-after-delete deleted/not-found, retry-after-edit fingerprint (CN-MCQ-20, CN-MCQ-22) | T003, T004, T015 |
| SC-001..SC-007 | mapped in tasks.md coverage table |

Every FR and SC has at least one task. No task lacks a requirement mapping.

## Gate checklist (Spec Kit entry check, spec-only PR)

- [x] FRs have stable IDs and traceable tasks (FR-001..FR-011 each appear in tasks.md and in the coverage map).
- [x] Success criteria are measurable (SC-001..SC-007), each mapped to tasks in the coverage map.
- [x] Given/When/Then scenarios cover read, create (trim, boundary and idempotent retry), edit (including overlapping saves and immutable columns), delete, tenancy, role denial, Trainer cross-client access, restored membership, last save wins and exit protection (unsubmitted discard and in-flight saves, with the in-flight warning key named and the field read-only while in flight).
- [x] Current role/membership model and backend/RLS enforcement are described; create idempotency is explicitly not an authorization factor.
- [x] No SQL/migration version is invented; the migration scan is not relied upon; no migration file is added by this PR.
- [x] Clarifications: CN-MCQ-01..14, CN-MCQ-16..CN-MCQ-21 and CN-MCQ-23 resolved; CN-MCQ-22 ruled by S40-R9; no open question; CN-MCQ-08 copy (rows 1–29), CN-MCQ-16 copy (rows 30–33) and CN-MCQ-19 row 34 recorded byte-exact; CN-MCQ-23 encoded using only the approved rows 30, 32, 33 and 18.
- [x] UI follows the authority hierarchy; no icon; horizontal tab placement; text-only copy bound to the approved tables; no new UI value introduced; exit-protection behaviour from DESIGN.md §5 encoded; Save Draft not offered; no cancellation promise for an in-flight save (CN-MCQ-17); in-flight body is the approved row 34 (CN-MCQ-19); field read-only while a save is in flight (CN-MCQ-21).
- [x] PO binding text quoted byte-exact in spec.md: S37-PO-6, S37-PO-7, S37-PO-14, S37-PO-16 (Client Notes line), S38-PO-2 (item 2), S38-PO-10, S38-PO-11, S39-PO-8 (Client Notes line), S39-PO-9 (both lines), S40-PO-3 (`Variant 1 (Recommended)`), S40-PO-6 (both PO lines) and S40-PO-10 (`CN-MCQ-23: A: Existing error copy (Rec.)`), with the S40-PO-3, S40-PO-6 and S40-PO-10 parenthesised mappings labelled as not PO words; the S40-R9 architect ruling is quoted and labelled as not a PO question.
- [x] Analyze dated after the last change to spec, plan, tasks, data-model, research and contracts (this analysis 2026-11-09T14:35Z follows every round-11 edit).
- [x] Revoked-membership scope matches the existing PO rule (FR-004; spec.md Clarifications item 2): SC-001, Story 3 scenario 4, the RLS and API contracts, plan.md and T006 say non-PO revoked membership.
- [x] Tasks: 0 ticks; T003/T004/T015 cover the content-free idempotency record, trimmed body equality, note-side uniqueness/hardened boundary, mismatch and retry-after-delete/after-edit; T005/T013 cover the exit-protection rows 30–34, the read-only-while-in-flight rule, the unknown-result recovery with existing rows 17-18 and the unknown-result exit warning with rows 30/32/33 plus body row 18.

## Result

PASS for the spec-only PR analysis gate on severity: 0 open CRITICAL, 0 open HIGH and 0 open MEDIUM. All F20 PO questions are resolved (CN-MCQ-20 and CN-MCQ-21 by S40-PO-6; CN-MCQ-23 by S40-PO-10) and the one architect ruling (CN-MCQ-22 by S40-R9) is encoded. No open ambiguities remain. The five CodeRabbit review 5826069631 findings are fixed within decided scope, all four CodeRabbit review 5826336129 findings are fixed (the fourth was CN-MCQ-23, resolved by S40-PO-10), and both CodeRabbit review 5827032656 findings are fixed, and the one unverified additional comment in CodeRabbit review 5827278025 is addressed. One LOW implementation-time check (textarea component mapping) remains. This result does not approve product decisions and does not authorize implementation.
