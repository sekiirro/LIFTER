# Analyze — F16 post-critique disposition (S38 round 7)

- Date: 2026-11-09 00:11 local (re-analysis after all round-7 edits to spec, plan, data-model, contracts, tasks, traceability, impact-s35-redesign and critique-response; this record is the last spec-artifact change of the round).
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
| A17 | Ambiguity (PO, cross-feature) | LOW | RESOLVED for F16 | Account deletion and re-registration are specified in F11/F12 (S37-PO-10); no F16 task. |
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
- Tasks: T001 to T073, T900, and the new T074 and T075, 76 in total.
- **Historical evidence (T001–T036, T900; closed rows):** these cover the S25/S26 food, catalog and security work. FR-005 to FR-011, FR-019 and FR-021 have no new redesign API test. Their evidence is historical (T024 to T028 and the S25 release gate), and the food scope has not changed since S25. This is recorded as accepted historical-evidence coverage, pending architect confirmation. These rows are not described as dedicated S36 tests.
- **Planned redesign tests (T037–T075):** each row names its FR IDs. Coverage for FR-001 to FR-004, FR-014, FR-018, FR-022 to FR-038 is planned, not evidenced. Per-field positive and negative cells are in the `data-model.md` coverage table.
- **Implementation coverage (T043–T075):** Global and private storage, validators and allowlists for the eight fields are allocated to T043, T044, T045, T046, T047, T048, T074 and T075. None is implemented; evidence is blank in `traceability.md`.
- Success criteria: SC-001 → T037, T047; SC-002 → T037, T046, T051; SC-003 → T024, T030; SC-004 → T003; SC-005 → T034, T065; SC-006 → T037, T051, T058; SC-007 → T037, T047, T055; SC-008 → T037, T047; SC-009 → T050, T051, T058; SC-010 → T040; SC-011 → T050, T056; SC-012 → T046, T050; SC-013 → T037, T047, T074, T075; SC-014 → T051, T055; SC-015 → T052; SC-016 → T037, T062, T063, T074, T075.

## Counts

- Requirements: 39 FR keys, 16 SC keys. Tasks: 76.
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
