# F17 Analyze — spec-only draft (S42)

**Analyzed**: 2026-11-10T02:03Z (after the last change to `spec.md`, `plan.md`, `data-model.md`, `contracts/`, `tasks.md`, `traceability.md` and `research/`).
**Scope**: documentation-only Spec Kit draft. No implementation, migration, code, test or workflow exists to analyze.
**Base**: `origin/main` `d0c5d1ac7ec8adb13ad12712f85cf9702a97a414` in worktree `C:/Users/NEW LAP/Desktop/LFTR-s42-f17`.
**Method**: Constitution check → requirement quality → ID and cross-reference sweep → PO decision coverage → conflict resolution by source priority → hostile self-review of every added line (S41 checklist item 1).

## 1. Gate summary

| Gate | Result | Evidence |
|---|---|---|
| Spec has numbered FRs | PASS | FR-001..FR-027, one definition each |
| Spec has measurable SCs | PASS | SC-001..SC-015 |
| Given/When/Then for every A1–A4 rule | PASS | A1-1..A1-8, A2-1..A2-12, A3-1..A3-8, A4-1..A4-7, A5-1..A5-4 (39 ids) |
| Clarifications cite sources | PASS | `spec.md` §8.1 with 20 byte-exact PO blockquotes; §8.2 contextual; §8.3 mappings |
| Remaining ambiguity stated explicitly | PASS | `spec.md` §8.5/§8.6: "No open ambiguities" explicitly **not** claimed; 9 MCQs |
| Plan covers the drafted scope | PASS | `plan.md` §4.1–4.6, §5–§9 |
| Tasks tagged with FR ids | PASS | all 52 tasks; traceability table covers FR-001..FR-027 and SC-001..SC-015 |
| Analyze dated after last edit | PASS | this timestamp is later than every artifact mtime (verified before commit) |
| Open CRITICAL findings | **0** | §5 |
| Open HIGH findings | **0** | §5 |
| Implementation authorized | **NO** | spec-only; 9 MCQs open |

## 2. Constitution check

I isolation (PASS, design), II money (n/a), III PO governance/least privilege (PASS — PO-only global/assign; deny unlisted), IV approved scope (PASS — D17-1..9, A1–A4, explicit exclusions), V versioned content (PASS — immutable versions, V2 snapshot, live Video), VI people decisions (n/a), VII privacy (PASS — no content in audit/logs), VIII bilingual/accessibility (PASS with copy gate open), IX idempotency (PASS, design). No deviation requiring complexity tracking.

## 3. Cross-reference sweep (S41 item 2)

- FR ids: 27 defined; 0 dangling F17 references after excluding explicitly namespaced foreign references (`F16 FR-…`, `F13 FR-…`, F19 `F19-FR-…`).
- SC ids: 15 defined; 0 dangling. Foreign `SC-` references are explicitly prefixed `F16 SC-`/`F13 SC-`.
- MCQ ids: F17-MCQ-1..9 defined; every reference resolves; each appears in spec, relevant plan/data-model/conflict rows and at least one blocked task.
- Task ids: T001..T052 defined with no gaps; 52 referenced from `traceability.md`; no dangling task reference.
- Scenario ids: 39 defined, 0 referenced-but-missing.
- Traceability rows: every FR except the FR-026 exclusion maps to ≥1 task; every SC maps to ≥1 task.
- Stale status: no "pending/absent" marker remains for anything decided; F19 items are marked pending because the PR is genuinely unmerged.

## 4. Findings and disposition

| Id | Severity | Finding | Disposition |
|---|---|---|---|
| A-01 | HIGH | Old FR-001 bound the plan root to `subscription_id`, contradicting pending F19 delivery-binding | RESOLVED — FR-001/FR-011 + conflict C-01 |
| A-02 | HIGH | Old FR-006/FR-012 global-template read model contradicted PO A2 (no distribution, copies only) | RESOLVED — FR-008..FR-013, C-10/C-11 |
| A-03 | HIGH | Old FR-005 invented warm-up/working set counts that F16 does not have | RESOLVED — FR-004/FR-007 + MCQ-1 |
| A-04 | HIGH | Old FR-003 `variation` + `ExerciseSnapshotV1` contradicted merged F16 V2 | RESOLVED — FR-003, C-07/C-09 |
| A-05 | HIGH | Old FR-011 export scope omitted `Copy Prompt for AI` and the A4 content list | RESOLVED — FR-017..FR-019 |
| A-06 | MEDIUM | Assignment state model was absent; retries/partial distribution undefined | RESOLVED — FR-011, data-model §5, contract |
| A-07 | MEDIUM | Assignment did not pin the template version at run time; concurrent version undefined | RESOLVED — FR-010, contract §3 step 0 |
| A-08 | MEDIUM | Undefined behaviour when promoting a template with workspace-private references | RESOLVED as open question — FR-012 + MCQ-5 (no guess) |
| A-09 | MEDIUM | Contributor attribution (old FR-004b / PRD-06) was dropped in the first draft | RESOLVED — FR-027, SC-015, A5-4, T022, C-22 |
| A-10 | MEDIUM | Publish gate omitted the approved-client prerequisite from D17-5=A | RESOLVED — FR-015, A3-8, SC-006 |
| A-11 | MEDIUM | FR-020 cited F16 FR-012 (catalog read scope) as if it governed plan/template authorization | RESOLVED — citation replaced with pending F19 F19-FR-009 + capabilities |
| A-12 | LOW | MCQ "blocked work" task ids pointed at the wrong tasks (T013/T021/T023/T024/T034/T036) | RESOLVED — pointers corrected to the owning tasks |
| A-13 | LOW | Duplicated "(PO A2.)" marker on FR-012 | RESOLVED |
| A-14 | LOW | `spec.md` §3 claimed scenarios were referenced by `traceability.md`; they are not | RESOLVED — points to the PO decision matrix |
| A-15 | LOW | F16 citations used bare `SC-009/SC-011`, colliding with F17 ids | RESOLVED — explicit `F16 SC-…` prefixes |
| A-16 | LOW | §9 table header said "Source on origin/main" while rows included historic branches | RESOLVED — header now "Source" |
| A-17 | LOW | F16 US6 note asserted a specific reading of F16 wording | RESOLVED — now states the ambiguity and leaves F16 unchanged |

**Open CRITICAL: 0. Open HIGH: 0.** No finding was closed by reply-only or by weakening a requirement; every one changed the artifact.

## 5. Open product decisions (not defects)

F17-MCQ-1 set-row initialization; MCQ-2 Notes/Alternatives seeding; MCQ-3 zero-copy assignment marking; MCQ-4 newer-version reassignment; MCQ-5 promotion with private references; MCQ-6 Copy Prompt role; MCQ-7 exact prompt text/language; MCQ-8 AR/EN export layout; MCQ-9 week grouping. Each is listed with options, implications, recommendation and blocked work in `spec.md` §8.5. Implementation of the affected scope is blocked until the PO answers; this is a Clarify gate, not an Analyze failure.

## 6. Checklist item evidence (S41 pre-request 1, 2, 4, 6)

1. **Self-review of own diff**: read every added line as a hostile reviewer for undefined states (in-flight, unknown result, retry, delete, concurrency, crash), contradictions and unsourced claims. Findings A-01..A-17; all resolved. Extra checks: assignment crash/replay/cancel covered in data-model §5.2; concurrent version read fixed (A-07); no claim of test evidence.
2. **ID sweep**: §3 above; executed with a full-directory regex sweep over `spec.md`, `plan.md`, `tasks.md`, `traceability.md`, `data-model.md`, `contracts/` and `research/`; 0 dangling ids.
3. (Not applicable — no CodeRabbit round in this task.)
4. **Format/static**: Prettier `--check` on all touched Markdown files passes; no code changed, so no eslint/typecheck/test run applies.
5. (Not applicable — no code/SQL PR.)
6. **Copy**: 20 PO blockquotes verified byte-exact as substrings of the PO source by a Node comparison; 13 approved English labels verified present in the PO source; zero Arabic characters in the artifact set (no string retyped); every other string is explicitly marked unapproved or is technical prose.

## 7. Analyze verdict

The draft is internally consistent, sourced, and honest about what is decided and what is not. It is **ready for architect review and PO MCQ answers**, not for implementation. Because requirements may change when the MCQs are answered or F19 merges, this Analyze must be re-run after any such change (Constitution workflow rule); no implementation may cite this analyze as a later-head clearance.
