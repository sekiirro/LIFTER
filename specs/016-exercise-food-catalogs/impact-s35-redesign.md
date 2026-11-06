# F16 S35 redesign impact audit

Audit date: 2026-11-06. Scope is documentation impact only. A final `git fetch origin` succeeded; `origin/main` remains `8b44c59c00e1b7a9fb62aa00dd2bc3ccea58b97a`. F17/F18/F19 file citations below were read from current local remote-tracking refs. Live PR metadata was checked with `gh pr view`.

## PR #43 — 016-catalog-ui

- Known head from the S35 compatibility input: `e3e322f663ba45440ecb9bdc21d77db5ad4243d0`; title `016-catalog-ui`. Compatibility input: `C:/Users/NEW LAP/.lifter/runs/s35-f16-compat/report.md`, sections “VERDICT”, “Gaps” and “Recommended spec changes”.
- Live state: **OPEN**, head `e3e322f663ba45440ecb9bdc21d77db5ad4243d0`, base `main`, mergeable `MERGEABLE` at audit time. PR CI and CodeRabbit thread state were not queried in this documentation impact check; recheck exact-head gates before any merge action.
- Compatibility report states no direct architecture conflict/non-blocking gaps. Required forward changes: (1) replace variation-as-video/note-only behavior with the shared global identity plus per-workspace versioned override model; (2) add global video value, workspace-over-global video precedence, and expose resolution source; (3) add override fields name/description/instructions/video/alternatives while keeping canonical global writes PO-only and the five-field workspace allowlist; (4) workspace library view must show global entries plus this workspace's overrides; (5) preserve workspace-private Trainer exercises; (6) add a separate authorized client-plan read path deriving client workspace, updating video at view time without template republish; (7) reconcile current variation storage/history by forward-only migration design after open PO decisions. Existing variation filtering/type gaps noted by compat report: `20261107030000:136` and `lib/catalog/server.ts:56`.
- Approval to merge #43 remains conditional on the PO's compatibility authorization and live exact-head gates. This spec work does not merge or edit #43.

## PR #64 — “independent workspace copies”

- PR #64 / commit `c4543a1` conflicts with the one-global-catalog model and is superseded by S35-PO-3. It is recorded in `decision-register.md` with S35-PO-1 and S35-PO-2 marked superseded and history retained.
- Live state: **OPEN**, head `26e4f01f0561a2cadc97dbe3696d865ddbb654c6`, base `main` at audit time. Required follow-up: do not merge/continue the independent-copy design; reconcile or close its proposed scope through normal PR ownership after the PO/architect review. Do not edit #64's branch in this task.

## F17 — `origin/017-workout-planner`

Source refs and exact citations (as locally available): `specs/017-workout-planner/spec.md:47,78-86,90`; branch ref `origin/017-workout-planner`.

- FR-008 at `spec.md:86` already says exercise video is resolved dynamically per authorized read/export and not stored in plan snapshots. It must be amended to specify client-workspace derivation, workspace-override then global fallback precedence, source disclosure to the authorized view, update visibility after video changes without republishing, and the separate client/plan read path with generic denial.
- FR-006 at `spec.md:84` says global templates contain only global catalog references. Preserve that canonical identity rule; update video projection/resolution semantics without copying workspace override values into global template identity or broadening template content.
- FR-003 at `spec.md:78` currently permits a variation reference in workout documents. Reconcile that field with F16 overrides and legacy mapping history; do not turn override mappings into duplicated exercise identities.
- Historical-version scenario at `spec.md:47` says every field captured by `ExerciseSnapshotV1` renders unchanged while selected workspace video may update dynamically. Preserve this plan-history guarantee and explicitly separate video (dynamic) from the unresolved treatment of overridden names/instructions (F16-MCQ-3).
- FR-012 at `spec.md:90` says F17 client viewing is not a surface and client has no F17 action. Keep staff plan/template permissions intact; route the authorized client view through the downstream P4/Plan Core client path, not staff catalog APIs.

## F18 — `origin/018-nutrition-planner`

Source refs and exact citations (as locally available): `specs/018-nutrition-planner/spec.md:88,90,92,97,116`; branch ref `origin/018-nutrition-planner`.

- No direct exercise-video or exercise-override dependency is defined in F18's nutrition document. Preserve FR-005 at `spec.md:88` exact food-version snapshot/recompute behavior, FR-007 at `spec.md:90` global/workspace nutrition-template ownership, and FR-009 at `spec.md:92` client alternative selection semantics; do not alter food/template identity or nutrition selection as part of F16.
- `spec.md:116` assigns client plan rendering/selection and overdue restrictions to P4. P4's combined client plan view must call the F16 resolver only for workout exercise videos, derive the workspace from the authorized client/plan relationship, and preserve F18's own food snapshot and selection projection. Add cross-contract tests for mixed plan pages and generic denial; no F18 staff catalog/search contract becomes client-accessible.

## F19 — `origin/019-plan-core`

Source refs and exact citations (as locally available): `specs/019-plan-core/spec.md:15,28,56,58`; `specs/019-plan-core/contracts/plan-core-client.md:12`; branch ref `origin/019-plan-core`.

- Plan Core keeps drafts private and published plan versions stable (`spec.md:15,28,56,58`; client contract `plan-core-client.md:12` excludes staff-only private drafts from client projections). Preserve these invariants; exercise video resolution is a view projection and must never mutate Plan ID, draft, published version or Core document schema.
- Add a consumer contract for authorized client-plan reads that derives workspace through the trusted plan/client relationship, resolves F16 video dynamically for the client workspace, and returns the same generic denial for missing/foreign/unauthorized scope. Keep that read projection separate from Plan Core mutation/idempotency lifecycle and from staff catalog APIs.
- Clarify ownership boundary: Plan Core owns client/plan identity and authorization context; F16 owns exercise video source/precedence and resolver payload; P4 composes the client view. Preserve immutable historical plan content and do not resolve historical non-video override presentation until F16-MCQ-3 is decided.

## Related gates

- F16 decision register currently contains F16-MCQ-1 through F16-MCQ-8. All recommendations are nonbinding; downstream spec changes that depend on them must remain blocked until PO decisions are recorded.
- Sol Medium independent critique is pending PO approval; not invoked. It remains an implementation blocker.
