# F16 S35 redesign impact audit

Audit date: 2026-11-06 (original audit). Round-3 refresh: 2026-11-06, after the critique response (`critique-response.md`). Scope is documentation impact only. Round-3 live checks (`git fetch origin --prune`, `gh pr view`, `gh pr list`): `origin/main` = `8b44c59c00e1b7a9fb62aa00dd2bc3ccea58b97a`; `origin/016-catalog-ui` = `e3e322f663ba45440ecb9bdc21d77db5ad4243d0`; `origin/019-plan-core` = `d188b3e6c4238118fe8dd6492c10889c39516cd1`; highest migration version on any origin ref = `20261108021002`. Downstream citations are pinned to these audit-time commits: `origin/017-workout-planner` `fd84fbaa334b9bfb77038fe17cd4996e6533f90f`; `origin/018-nutrition-planner` `066636358f7256e10426efae2290112f15a62e14`; `origin/019-plan-core` `d188b3e6c4238118fe8dd6492c10889c39516cd1`.

## PR #43 — 016-catalog-ui

- Known head from the S35 compatibility input: `e3e322f663ba45440ecb9bdc21d77db5ad4243d0`; title `F16: exercise/food catalog UI and exercise library`.
- Live state (round 3): **OPEN**, head `e3e322f663ba45440ecb9bdc21d77db5ad4243d0`. The round-3 check did not re-query mergeability or CI; recheck exact-head gates before any merge action.
- Compatibility input: `C:/Users/NEW LAP/.lifter/runs/s35-f16-compat/report.md`, sections "VERDICT", "Gaps" and "Recommended spec changes". That report states no direct architecture conflict, while listing seven required forward changes: (1) replace variation-as-video/note-only behaviour with the shared global identity plus a per-workspace versioned override; (2) add a canonical video value, workspace-over-global precedence and the resolution source; (3) add the override fields name, description, instructions, video and alternatives, with canonical writes PO-only; (4) the library view shows global entries plus this workspace's overrides; (5) keep workspace-private Trainer exercises; (6) a separate authorized client-plan read path; (7) reconcile variation storage and history by forward-only migration after the PO decisions.
- Round-3 findings: #43 adds migrations `20261106125000_catalog_exercise_detail.sql` (its `catalog_exercise_detail` returns a `variation jsonb` column) and `20261107030000_catalog_workspace_exercise_remove.sql`. It also adds `lib/catalog/video-variation.ts` (`ALLOWED_HOSTS` includes `docs.google.com`). The `variation` shape and the TypeScript projections must change atomically with the legacy resolver replacement (FR-031; T054). Role-parity fixture files are edited by both #43 and this feature (T055; merge-conflict risk). Existing variation filtering and type gaps noted by the compatibility report: `20261107030000:136` and `lib/catalog/server.ts:56`.
- Approval to merge #43 remains conditional on the PO's compatibility authorization and live exact-head gates. This spec work does not merge or edit #43.

## PR #64 — "independent workspace copies"

- PR #64 / commit `c4543a1` (head `26e4f01f0561a2cadc97dbe3696d865ddbb654c6`) conflicts with the one-global-catalog model and is superseded by S35-PO-3. It is recorded in `decision-register.md` with S35-PO-1 and S35-PO-2 marked superseded and history retained.
- Live state (round 3): **CLOSED, not merged** (`mergedAt` null). At the original audit it was recorded as OPEN; that statement is now stale. No branch edit is made in this round.

## PR #44 — not an F16 PR

- Live state (round 3): **CLOSED**. Its title is "F15: forms, intake and alerts" (head `b36fa4e1c856be3b1f4aa863c44404975f87f4a6`). It is not an F16 PR. The original audit did not mention it. No F16 action is required for it.

## F17 — `origin/017-workout-planner`

Source refs and exact citations (as locally available): `specs/017-workout-planner/spec.md:47,78-86,90`; branch ref `origin/017-workout-planner`.

- FR-008 at `spec.md:86` already says exercise video is resolved dynamically per authorized read/export and not stored in plan snapshots. It must be amended to specify client-workspace derivation, workspace-override then canonical fallback precedence, source disclosure to the authorized view, update visibility after video changes without republishing, and the internal client/plan resolver of FR-029 behind the F19/P4 wrapper, with generic denial.
- FR-006 at `spec.md:84` says global templates contain only global catalog references. Preserve that canonical identity rule; update video projection and resolution semantics without copying workspace override values into global template identity.
- Private-exercise picker and snapshot (round 3, CodeRabbit review on `a8b857f1`): the F17 picker resolves a workspace-private exercise through the effective-resolution contract with source `workspace_private` (FR-026), and publication snapshots it as `ExerciseSnapshotV2` with `source = workspace_private`, the workspace exercise identity and version, and no canonical identity (FR-027). F17 must define this path; the canonical-identity-only wording of FR-008 is not sufficient for private exercises.
- FR-003 at `spec.md:78` permits a `variation?: {id, version}` reference in workout documents. A pinned variation version contradicts live video and the FR-027 V2 snapshot. Remove it, reference the override version (FR-027) and use the effective resolution (FR-026) for the picker. Do not turn override mappings into duplicated exercise identities.
- Historical-version scenario at `spec.md:47` says every field captured by `ExerciseSnapshotV1` renders unchanged while selected workspace video may update dynamically. Under FR-027 the frozen fields become names and instructions, captured by `ExerciseSnapshotV2`. Video stays dynamic. Description and alternatives remain open (F16-MCQ-H, F16-MCQ-G). Round 5: the other V1 fields (primary and secondary muscles, equipment, defaults) are F16-MCQ-L (PO-DECISION-NEEDED); V2 does not freeze them until that is decided.
- FR-012 at `spec.md:90` says F17 client viewing is not a surface. Keep staff plan and template permissions intact; route the authorized client view through the downstream P4/Plan Core client path, not through staff catalog APIs.
- Task T059 owns these amendments. Not executed in round 3; blocked by the F16 decisions and F19 persistence.

## F18 — `origin/018-nutrition-planner`

Source refs and exact citations (as locally available): `specs/018-nutrition-planner/spec.md:88,90,92,97,116`; branch ref `origin/018-nutrition-planner`.

- No direct exercise-video or exercise-override dependency is defined in F18's nutrition document. Preserve FR-005 at `spec.md:88` exact food-version snapshot and recompute behaviour, FR-007 at `spec.md:90` global and workspace nutrition-template ownership, and FR-009 at `spec.md:92` client alternative selection; do not alter food or template identity or nutrition selection as part of F16.
- `spec.md:116` assigns client plan rendering and overdue restrictions to P4. P4's combined client plan view calls the F16 resolver only for workout exercise videos, derives the workspace from the authorized client/plan relationship (FR-029), and keeps F18's own food snapshot and selection projection. Add cross-contract tests for mixed plan pages and generic denial; no F18 staff catalog or search contract becomes client-accessible.

## F19 — `origin/019-plan-core`

Source refs and exact citations (as locally available): `specs/019-plan-core/spec.md:15,28,56,58`; `specs/019-plan-core/contracts/plan-core-client.md:12`; branch ref `origin/019-plan-core`.

- Round-3 check: `origin/019-plan-core` adds **no migration** beyond `origin/main` (0 new migrations). It contains no persisted plan or client-to-plan relation. The F2 premise of the critique is confirmed. The client wrapper (T058) is therefore blocked until F19 persistence exists.
- `lib/plan-core/catalog-snapshot-ref.ts` imports `parseSnapshot` from `lib/catalog/snapshot.ts` and types `CatalogSnapshotRef` against `ExerciseSnapshot` (V1). It must accept `ExerciseSnapshotV2` (FR-027; T059).
- Plan Core keeps drafts private and published plan versions stable (`spec.md:15,28,56,58`; client contract `plan-core-client.md:12` excludes staff-only private drafts from client projections). Preserve these invariants; exercise video resolution is a view projection and must never mutate Plan ID, draft, published version or the Core document schema.
- Add a consumer contract for authorized client-plan reads that derives workspace through the trusted plan/client relationship, calls the F16 internal resolver (FR-029), and returns the same generic denial for missing, foreign or unauthorized scope. Keep that read projection separate from Plan Core mutation and idempotency and from staff catalog APIs.
- Clarify ownership: Plan Core owns client/plan identity and authorization context; F16 owns exercise video source, precedence and the resolver payload; P4 composes the client view. Preserve immutable historical plan content. Historical non-video presentation is governed by FR-027 (names and instructions frozen; description and alternatives pending F16-MCQ-H and F16-MCQ-G).

## Related gates

- The F16 decision register (round 3) lists F16-MCQ-1, -3, -4, -5, -6 as answered; -2 and -7 as moot; and F16-MCQ-A, -B, -C, -D, -E, -F (re-framed from -8), -G (re-framed from -10), -H, -I and -9 as PO-DECISION-NEEDED. F16-MCQ-E and -9 touch the client and PO paths; F16-MCQ-9 specifically blocks whether client-plan projections resolve workspace-private Trainer exercises or omit their video. It does not block an otherwise-authorized plan view.
- The independent critique was performed by Sonnet 5.5 under S36-PO-2 (`C:/Users/NEW LAP/.lifter/runs/s36-sonnet-f16-critique/critique.md`). The constitution's Mandatory Spec Debate (`.specify/memory/constitution.md` lines 148-151, Sol Medium) conflicts with that substitution. This conflict is PO-owned (analyze A7, CRITICAL, open) and remains an implementation blocker.

## Round-3 action list (planning; not executed in this round unless stated)

| Action | Owner | Status |
| --- | --- | --- |
| Refresh this audit at the round-3 live state (#43 OPEN; #64 CLOSED; #44 closed F15 PR) | architect/MiniMax | Done in round 3 (T067) |
| F17 amendments (FR-003 variation reference, FR-008, picker per FR-026) | F17 owner | Not executed; T059 |
| F19 amendments (`CatalogSnapshotRef` V2; client wrapper) | F19/P4 owner | Not executed; T058, T059; blocked by F19 persistence |
| #43 sequencing and atomic consumer change (FR-031) | Luna and MiniMax, under the PO's #43 authorization | Not executed; T054, T055 |
| Record S35/S36 decisions in `docs/04-changes-and-questions.md` and `docs/01-traceability.md` | MiniMax (docs), architect review | Not executed; T066 (outside `specs/016-*`) |
