# F16 independent critique — response (S36 round 3)

- Critique: `C:/Users/NEW LAP/.lifter/runs/s36-sonnet-f16-critique/critique.md` (Sonnet 5.5, authorized by S36-PO-2; verdict NOT READY).
- Response scope: spec artifacts in `specs/016-exercise-food-catalogs/` only. No app code, SQL, migrations, tests or fixtures changed. The implemented role matrix in `contracts/catalog-api.md` is unchanged.
- Status vocabulary: **Accepted (fixed)** = spec now states it, with commit; **Accepted, PO-blocked** = the fix is in place as far as the PO allows, and the choice is a numbered PO item; **Partial** = part accepted, part escalated or rejected, with reason; **Rejected** = not applied, with evidence.
- Verification: every critique citation was checked against the pinned head and live refs (`git fetch origin --prune`; `git show origin/main:...`; `gh pr view`). Results are in section 3.

## 1. Commits in this round

| Commit | Scope |
| --- | --- |
| `d94bcdf0` | `spec.md`: FR-003, FR-014, FR-020, FR-022 corrected; FR-023 to FR-035 added; Assumptions, Constitution Check, Clarifications (round-3 session) |
| `958e885f` | `data-model.md`, `contracts/`: canonical and private video, alternatives child table, effective resolution, client boundary, legacy retirement, planned rows |
| `bfc6f729` | `plan.md`: V2 snapshot, resolver, migration rule, dependencies, validation 1b, risks |
| `45810a2a` | `tasks.md`: S36 table restructured into T037 to T067 with owners, predecessors, blockers; T016, T020, T023 superseded |
| `1115aa70` | `decision-register.md`: PO-DECISION-NEEDED A to I; MCQ-8 and MCQ-10 re-framed as F and G with history kept; MCQ-9 open |
| `7850e5e7` | `impact-s35-redesign.md` refreshed; `quickstart.md`, `research.md`, `debate.md`, `traceability.md` |
| `175c9411` | `tasks.md`: removed six pre-restructure rows left by the table replacement (found in self-check) |
| `a819d6c4` | `decision-register.md`: cross-reference for the re-framed MCQ-10 in the historical MCQ-4 status line |
| `ca13be42` | `spec.md`: US6 scenarios 4 to 6 for FR-027, FR-028, FR-029 |
| `c870fcd1` | `spec.md`, `tasks.md`: SC-013 to SC-016; task mapping; FR-034 test added to T051 |

## 2. Per-finding response

### Technical findings

| Finding | Critique severity | Response | Evidence / commit | Status |
| --- | --- | --- | --- | --- |
| F1 frozen names and instructions have no mechanism | CRITICAL | Effective resolution contract (FR-026); `ExerciseSnapshotV2` at publication with override reference and frozen names and instructions; video excluded; overrides retained; RED sequence (plan 1b; US6 scenario 4; T049, T056). Description and alternatives freeze are left to MCQ-H and MCQ-G, as the PO decided only names and instructions. The name-language rule is left to MCQ-F. | `d94bcdf0`, `958e885f`, `bfc6f729`, `ca13be42`, `c870fcd1`; decision register F, G, H | **Accepted (fixed)** for the mechanism; **Accepted, PO-blocked** (F, G, H) for the residual fields |
| F2 client-read boundary and missing plan/client relation | HIGH | F16 exposes only an internal workspace-parameterized resolver, executable by the projection role (FR-029). Client wrapper moved to F19/P4 (T058, blocked by F19 persistence). Whole-call generic denial on any mismatched workspace-scoped reference (FR-029, T051). Plan/client relation confirmed absent (no persisted plan table on main; `origin/019-plan-core` adds no migrations). | `d94bcdf0` FR-029; `958e885f` contracts; `bfc6f729`; T051, T058 | **Accepted (fixed)**; wrapper dependency tracked as A18 |
| F2, fixture strategy for T039 | HIGH | **Partial, rejected as stated.** The critique proposed synthetic plan and client tables in the test schema. Rejected: that would pre-decide F19's persistence model, which does not exist yet. Instead, only the internal resolver is tested, with synthetic workspace IDs (plan 1b); client-boundary tests are blocked until F19 persistence exists. | `bfc6f729` plan 1b; tasks T051, T058 | **Partial** (rejected: test-schema proposal; reason above) |
| F3 canonical video and description do not exist | HIGH | Canonical `video_url` added as a new immutable version field, read as the current canonical version and never pinned (FR-023, T043). Canonical description deferred: its shape is MCQ-F and its freeze is MCQ-H (T044). Plan step 1 "inventory canonical video payload" rewritten (none exists on main). | `d94bcdf0`, `958e885f`, `bfc6f729`; decision register F, H | **Accepted (fixed)** for video; **Accepted, PO-blocked** (F, H) for description |
| F4 alternatives may reference private exercises with no integrity | HIGH | Normalized child rows with composite key for private targets, global FK for global targets, exactly-one-target CHECK, active-at-write, frozen with the version, skipped as unavailable at read (FR-025, T048, SC-016). Empty-list semantics and count bound are not chosen: MCQ-B, MCQ-G. | `958e885f` data-model; `d94bcdf0` FR-025 | **Accepted (fixed)** for integrity; **Accepted, PO-blocked** (B, G) for semantics |
| F5 private exercise has no video field | MEDIUM | Nullable `video_url` in workspace exercise version content (FR-024, T045). Client visibility stays with MCQ-9 (open). | `d94bcdf0` FR-024; `958e885f` data-model | **Accepted (fixed)**; visibility **PO-blocked** (MCQ-9) |
| F6 override reset and empty-alternatives semantics | HIGH | Not chosen. MCQ-A (per-field reset) and MCQ-B (empty alternatives) raised with options and the critique's advisory recommendation recorded as advisory. Planned remove/clear row updated to point to MCQ-A. | `1115aa70`; `958e885f` contracts planned rows | **Accepted, PO-blocked** (A, B) |
| F7 removed or merged identities; plan-view video | HIGH | FR-028: the plan's own referenced identity is resolved, activity is not required, the survivor is never followed for media, override rows are never rewritten by Remove or Merge; RED scenario 5 (US6). The critique's courtesy note on merge-survivor media is kept as FYI-3 for architect review, not a PO item (the rule follows from FR-010 and FR-011). | `d94bcdf0` FR-028; `ca13be42` scenario 5; decision register FYI-3 | **Accepted (fixed)**; FYI-3 for architect |
| F8 migration range before main's head and collides with in-flight branches | HIGH | Fixed range withdrawn; strictly-greater-than-any-origin-ref rule with the existing `npm run check:migration-versions:remote` scan before commit and push (FR-032, SC-015, T052); sequenced after #43's migrations; Plan Core range sentence withdrawn. Verified: highest origin-ref version is `20261108021002`; main contains `20261107032002`; #43 contains `20261107030000`. | `d94bcdf0` FR-032; `bfc6f729`; `7850e5e7` quickstart; `c870fcd1` SC-015 | **Accepted (fixed)**; #43 sequencing depends on the PO's #43 authorization (A19) |
| F9 legacy variation write path alive | HIGH | Legacy `catalog_write_variation` and `catalog_transition_variation` retired at the override-write migration (FR-031); resolver replaced by drop and recreate; #43 consumers changed atomically; T016, T020, T023 marked superseded; role-parity rows move with the SQL (T054, T055). | `d94bcdf0` FR-031; `958e885f`; `45810a2a`; `175c9411` | **Accepted (fixed)** in spec; implementation tracked as T054 and T055 |
| F10 legacy `note` handling and backfill | MEDIUM | Structural rules fixed: backfill only for explicit legacy rows, never for a workspace without one; removed rows to no override with history; provenance kept (FR-031, T063). Note treatment is MCQ-C. | `958e885f` data-model; `d94bcdf0` FR-031; decision register C | **Accepted (fixed)** for structure; **Accepted, PO-blocked** (C) for note treatment |
| F11 FR-022 requires what D-08 forbids | HIGH | FR-022 narrowed to F16-owned enforcement (F12 guard, regression test T060). Re-registration moved to MCQ-D (cross-feature). Verified: the F12 guard rejects every `clients` update except an approval-state transition, so `workspace_id` is already immutable. Verified: `clients.email_normalized` and `phone_e164` are globally unique. | `d94bcdf0` FR-022, edge case; T060; decision register D | **Accepted (fixed)**; re-registration **PO-blocked** (MCQ-D; no F16 task blocked) |
| F12 "personal workspace" undefined; PO write reach | MEDIUM | Scope enforced per RPC, not by workspace type (FR-030); verified there is no personal-workspace concept on main. PO write reach moved to MCQ-E. | `d94bcdf0` FR-030; `958e885f` contracts; decision register E | **Accepted (fixed)** for scope rule; **Accepted, PO-blocked** (E) for reach |
| F13 authorization identifiers cited as existing | MEDIUM | Preferred option taken: identifiers are documentation labels mapped to `app_private.is_platform_owner()` and `has_workspace_access(ws,'coaching_work')` (FR-033). The proposed `govern_global_catalog` capability is withdrawn from the plan. Verified: none of the labels the critique named (`catalog.exercise.govern`, `govern_global_catalog`, `catalog.workspace_override.write`, `catalog.read.workspace_video`) exists as a capability on main. | `d94bcdf0` FR-033; `bfc6f729` plan; `c870fcd1` | **Accepted (fixed)** |
| F14 Analyze honesty | HIGH | Analyze re-run. A7 recorded as CRITICAL and open. Gate NOT PASS. Open HIGH PO items counted. | `checklists/analyze.md` (this round) | **Accepted (fixed)** |
| F15 tasks granularity, owners, missing tasks | MEDIUM | Umbrella tasks split into 45 to 60 minute units with owners, predecessors and blockers; missing tasks added (T043 to T067); T037 to T042 rows replaced; dependency order and SC coverage mapped. Two cleanup commits removed rows left by the first table replacement. | `45810a2a`, `175c9411`, `c870fcd1` | **Accepted (fixed)** |
| F16 validation plan and mutation list | MEDIUM | Round-3 RED, negative-tenancy, mutation, behavioural, performance and cache cases added to plan validation (1b); traceability skeleton added with no ticks; mutation column per task. | `bfc6f729` plan 1b; `7850e5e7` traceability; `45810a2a` | **Accepted (fixed)** |
| F17.1 client statements vs new video projection | MEDIUM | Reworded to "no staff catalog or table access; one scoped video projection behind the F19/P4 wrapper". | `958e885f` catalog-api; export-read-isolation | **Accepted (fixed)** |
| F17.2 garbled FR-014 precedence sentence | MEDIUM | Rewritten: workspace override if set, else canonical current video, else explicit absence. | `d94bcdf0` FR-014 | **Accepted (fixed)** |
| F17.3 MCQ status inside normative text | MEDIUM | Open-MCQ status removed from FR-003 and FR-014; the pointer to the register is kept in brief form. | `d94bcdf0` | **Accepted (fixed)** |
| F17.4 duplicate paragraphs in plan.md | LOW | Consolidated. | `bfc6f729` plan | **Accepted (fixed)** |
| F17.5 stale dependency ordering | MEDIUM | Replaced with the real ordering (#43 PO-conditioned, F15 version constraint, F16 catalog migrations already on main, F19 persistence). | `bfc6f729` plan | **Accepted (fixed)** |
| F17.6 Constitution Check gaps | MEDIUM | Added: client-visible video projection under principle I; storage growth under principle V and the free-tier budget (via MCQ-I); Mandatory Spec Debate conflict recorded (A7). | `d94bcdf0` Constitution Check | **Accepted (fixed)** |
| F17.7 planned canonical row duplicates implemented row | LOW | Rule stated: the implemented row is replaced in the same commit as its SQL, fixture and parity test (S36-R10). The implemented matrix itself is unchanged. | `958e885f` catalog-api | **Accepted (fixed)** |
| F17.8 stale research.md and debate.md artifacts | MEDIUM | Marked superseded in part with the original rows kept. | `7850e5e7` research, debate | **Accepted (fixed)** |
| F17.9 planned matrix lacks override read, library and resolver rows | MEDIUM | Rows added to the planned table only. | `958e885f` catalog-api | **Accepted (fixed)** |
| F18 impact audit stale; consequences missing | MEDIUM | Refreshed at the live state; F17, F18 and F19 amendments listed; T059 and T066 added. Verified: #64 is now CLOSED, not merged (the audit said OPEN); #44 is the closed F15 PR, not an F16 PR; #43 is still OPEN at e3e322f6. The critique's governance line "close superseded #44/#64" was not verified against a PO source in this round. No action taken on #44. | `7850e5e7` impact; T059, T066, T067 | **Accepted (fixed)** for the audit; cross-feature amendments not executed (T059); docs record not executed (T066) |
| F19 library and search semantics; text limits; storage | MEDIUM | Override text bounds and normalized search columns added (FR-035). Which names search matches and the storage budget are not chosen: MCQ-I (added in review). | `d94bcdf0` FR-035; decision register I | **Accepted (fixed)** for bounds and indexes; **Accepted, PO-blocked** (I) for search semantics and budget |
| F20 URL allowlist accepts `docs.google.com` | LOW | The spec states the D16-3 host list. Partial: the critique's citation is corrected (`lib/catalog/video-variation.ts` exists on #43, not on main; main's validator is `app_private.catalog_video_url_allowed`, and it accepts `docs.google.com`). Host list confirmation is an architect item (FYI-2); the validator alignment is T061, blocked until confirmed. | `d94bcdf0` FR-014; decision register FYI-2; T061 | **Partial**: architect confirmation (FYI-2); applied as a task |
| F21 open PO questions and framing | HIGH | Items re-framed and registered: MCQ-8 as F, MCQ-10 as G (history kept); A, B, C, D, E, H added; MCQ-9 kept open (not marked answered, per the brief); FYI-1 recorded. Critique's MCQ-9 advice noted as advisory only. | `1115aa70`, `a819d6c4` | **Accepted (fixed)** in register; each item **PO-blocked** as listed |
| F22 SC-012 mutation | LOW | Added to SC-012. | `d94bcdf0` | **Accepted (fixed)** |
| F22 MCQ-3 option label | LOW | **Rejected as proposed.** The critique asked to amend the original option (c) text in the register. The register is an append-only history record: the rule in `decision-register.md` requires original text to be kept unchanged. The existing label note already states the PO words bind, and no implementation may depend on the label. Architect confirmation of the label is still requested (existing note). | `decision-register.md` header rule; existing MCQ-3 label note | **Rejected** (evidence: register history rule; existing label note) |
| F22 cache-key rule | LOW | Added (FR-034; T051). | `d94bcdf0`; `c870fcd1` | **Accepted (fixed)** |
| F22 absence shape for foreign and missing items | LOW | Same generic shape for both (FR-029, FR-034). | `d94bcdf0` FR-029 | **Accepted (fixed)** |

### Non-technical and process items

| Item | Response | Status |
| --- | --- | --- |
| Critique F14 blocker A7 (constitution, Sol Medium vs Sonnet 5.5) | Recorded as CRITICAL and open. Not resolved by this response, because the conflict is PO-owned. | **Open, PO-owned** (`checklists/analyze.md`, A7) |
| Critique F21 "FYI to PO: video none / source none" | Recorded as FYI-1 for awareness; no behaviour changed. | Recorded |
| Critique "What is sound" | Kept: the single identity with versioned overlays, definer RPCs with forced RLS, immutable versions, the shared operation-key ledger, and the parity matrix rule. | Kept |

## 3. Critique citation check (live verification)

| Claim in critique | Result |
| --- | --- |
| `origin/main` at `8b44c59c`; #43 at `e3e322f6` | Confirmed (`git rev-parse`). |
| Main snapshot has no instructions, description or override reference (`lib/catalog/snapshot.ts`) | Confirmed. |
| Main allowed payload keys in `20261106110000_catalog_exercise_operations.sql:44` | Confirmed: `name_ar`, `name_en`, `primary_muscle_code`, `secondary_muscle_codes`, `equipment_codes`, `instructions_ar`, `instructions_en`, `defaults`. No video, no description. |
| Main `catalog_resolve_exercise_video` requires active variation and active identity | Confirmed (`20261106105000_catalog_video_resolution.sql`, lines 11-32; SECURITY INVOKER). |
| `catalog_write_variation` rejects non-active canonical exercises | Confirmed (`20261106112000_catalog_variation_operations.sql`, lines 22-27). |
| Main `has_workspace_access` returns true for the platform owner in every workspace | Confirmed (`20261027120000_tenancy.sql`, `has_workspace_access`). |
| `catalog.exercise.govern` and `govern_global_catalog` absent on main | Confirmed (no matches in `lib`, `app`, `supabase`, `tests`). |
| Clients table globally unique on e-mail and phone | Confirmed (`20261031121000_client_accounts_model.sql` lines 68-69). |
| F12 guard rejects non-approval-state updates | Confirmed (`20261101120000_registration_approval_model.sql`, `f12_guard_client_transition`). |
| `origin/019-plan-core` adds no migrations; no persisted plan table on main | Confirmed (0 new migrations; no `create table ... plan` on main). |
| Highest migration version on any origin ref is `20261108021002` | Confirmed (scan of 91 origin refs). |
| `docs.google.com` accepted by the main validator | Confirmed (`catalog_video_url_allowed` regex, `20261106105000`). |
| `lib/catalog/video-variation.ts` `ALLOWED_HOSTS` on main | **Incorrect location**: the file is on `origin/016-catalog-ui` (#43), not on main. The host is accepted there. |
| #44 is superseded F16 work | **Incorrect**: #44 is the closed F15 "forms, intake and alerts" PR. |
| #64 OPEN | Was OPEN at the original audit; **now CLOSED**, unmerged (live check). |
| Constitution Mandatory Spec Debate at lines 148 to 151 | Confirmed: the bullet begins at line 151 (`.specify/memory/constitution.md`). |
| Critique line-level citations in spec, plan, data-model, contracts, tasks | Confirmed at the pinned head (checked before editing). |

## 4. What remains (exact)

1. **A7 (CRITICAL, PO-owned):** the constitution's Sol Medium mandate versus the Sonnet 5.5 substitution. Implementation is blocked until the PO resolves it.
2. **PO-DECISION-NEEDED (HIGH):** F16-MCQ-A, -B, -C, -E, -F, -G, -H and -9 (`decision-register.md`).
3. **PO-DECISION-NEEDED (MEDIUM and LOW):** F16-MCQ-I (MEDIUM); F16-MCQ-D (LOW, cross-feature).
4. **Dependencies (MEDIUM, not PO):** F19 persistence for the client wrapper (T058); PR #43 authorization and sequencing (T054, T055); F17, F18 and F19 amendments (T059); docs record (T066).
5. **Architect confirmations (LOW):** FYI-2 host list (T061); FYI-3 merged-source media rule; the MCQ-3 label (existing note).
6. **Gate:** `checklists/analyze.md` is NOT PASS until item 1 and the HIGH items in item 2 are closed. The entry check fails on the open CRITICAL and HIGH items.
