# F14 Verification Quickstart (future implementation work)

The original planning sections below are an implementation verification recipe, not execution evidence. The Session 12 sections record the later explicitly authorized merge and Stack-B T044 run. Stack A belongs to its concurrent lane; F14 DB/Storage verification uses only Stack B.

## Prerequisites before any DB or Storage check

1. Final PO decisions F14-1..8 are recorded in the spec. The PO approved Stack-B provisioning/start on 2026-10-29; the separate stack lane report at `infra-second-stack` commit `d49880010e70ac03c4a264fc19610dfc443d7c55` records isolation proven and 861/861 integration checks on B. F14 does not provision/start it. This reference is historical evidence, not a request to start or touch Stack B in the current run.
2. Use the AD-F14-2 approved F14-based port from `infra-second-stack` head `d49880010e70ac03c4a264fc19610dfc443d7c55`; do not port F11's provisioner or unrelated files. The Stack-B profile includes `storage-api` and Mailpit.
3. Select `LIFTER_SUPABASE_STACK=b`; assert project `lifter-stack-b` and ports 25420–25429 before any connection. Never use stack A or copy keys/URLs across stacks.
4. The F11/stack-B isolated runner is ready to restore state after both success and failure; F11 pending-client Storage denials are included in the required lane.

## Checks by layer

| Layer | Verification | Expected evidence |
|---|---|---|
| Unit, no DB | Validation structure, metadata stripping, animation rejection, hash identity, state machine, revision conflicts, rendering tokens and cache/scope behavior | Unit test report; hostile PNG/WebP fixture matrix; no SVG/JPEG acceptance. |
| Contract, no DB | App authorization matrix, preview/publication outcomes, generic failures, F10-compatible projection and proxy contract | Contract report for PO/WO own scope and Sales/Trainer/foreign-workspace denials. |
| DB + Storage, stack B only | Forced RLS, `authorize()` plus `has_workspace_access()`, bucket-qualified path policies, direct Storage API denials, draft/publish/audit atomicity, upload reconciliation and reference-safe cleanup; current-only publication retention and replacement races | CI lane run identifier, readiness proof, zero skipped Storage tests, isolated fixture cleanup/restoration proof. |
| UI, no DB unless an explicit fixture needs it | Frontend Design Gate matrix and accessibility/state review | Screenshot paths under OS temp; AR-RTL/EN-LTR × light/dark × 390/1440 (tablet if layout changes), keyboard/screen-reader/focus/touch/reduced-motion/axe evidence, `npm run size`. |
| Capacity/recovery, approved environment | Model up to two current assets/workspace plus draft/staging, workspace count, proxy no-store egress against verified Storage allowances and 70% trigger; restore Storage backup and separately verify permanent audit | Assumptions, observed allowance sources, measured usage, restore checksum/results, and decision whether production remains blocked. |

## Q-M mutation and isolation checks (F11-style)

All mutation checks are future checks on an isolated stack-B fixture. Pair each denied request with a positive control in the same workspace. No production data or stack A is used.

| ID | Mutation / attempted bypass | Expected outcome |
|---|---|---|
| Q-M01 | WO reads/saves another workspace draft | Deny generically; no foreign fields or revision leak. |
| Q-M02 | Sales or Trainer invokes branding actions directly | Deny at app wall and DB wall. |
| Q-M03 | Authenticated actor calls database path without `manage_branding` | Deny under forced RLS and `has_workspace_access()` despite app bypass. |
| Q-M04 | Omit workspace scope or submit mismatched workspace/resource ids | Deny; no implicit workspace selection or existence disclosure. |
| Q-M05 | Two saves submit the same draft revision | One CAS winner; stale writer cannot overwrite. |
| Q-M06 | Publish from stale revision or race two changed publishes | Stale request rejects; serialized successful publish has one version/current pointer/audit event. |
| Q-M07 | Cause publication audit failure | No partial version/current-pointer change. |
| Q-M08 | Publish unchanged draft repeatedly | Idempotent no-op; no duplicate version/event. |
| Q-M09 | Publish a changed draft over an existing current version | New snapshot becomes current atomically; previous snapshot/assets become GC-eligible once unreferenced; permanent audit remains independent. No history/restore feature exists. |
| Q-M10 | Upload malformed, truncated, trailing, CRC/RIFF-invalid, animated, oversized/overcomplex PNG/WebP, SVG, or JPEG | Reject; prior reference remains; durable state can reconcile; no unvalidated object attaches. |
| Q-M11 | Interrupt staging, validation, object creation, or stale-revision attachment | Reconciliation completes safely; cleanup never removes a referenced object. |
| Q-M12 | Guess another workspace's path/hash or call Storage list/direct read as anon | Deny via bucket-qualified policy and independent scope/capability check; hash does not authorize. |
| Q-M13 | Mutate published object or cross-workspace object through Storage API | Deny; immutable validated object remains intact. |
| Q-M14 | Request proxy using invalid/expired/consumed token, changed token, arbitrary asset/version selector, or after F10 grace | Generic failure; F10 validity re-applied without grace extension; no selected historical asset. |
| Q-M15 | Publish/collect between page render and image fetch using a handle bound to the previous version | Old handle fails generically or triggers fresh authorized render resolution; never serve deleted bytes. |
| Q-M16 | Inspect headers and client payloads for URLs/caching | No signed URL; private/no-store including errors; no shared token cache; sniffed MIME and nosniff. |
| Q-M17 | Switch workspace while preview is in flight or clear scope | Late response discarded; neutral defaults until authorized scope resolves. |
| Q-M18 | Exercise semantic status colors under brand override and banner backgrounds | Semantic tokens preserved; actual surface contrast passes or text stays off imagery/uses guaranteed-token scrim. |
| Q-M19 | Storage service unavailable or readiness signal absent in CI | Required lane fails before tests; no Storage test is skipped. |
| Q-M20 | Force a Storage test failure mid-suite | Isolated stack/fixtures restore state; no cross-run data leak; runner assumptions updated with F11 owners. |
| Q-M21 | Attempt image resolution with only a visitor token, only a render handle, only a reader credential, or any pair missing one of the required authorities | Deny unless valid token, unexpired bound handle, enabled restricted `branding_proxy` credential and exact slot/object all agree. Positive control succeeds. |
| Q-M22 | Swap token, handle, workspace, slot, bucket, object, or forge version/history selectors | Deny; handle remains bound to its issuance link/workspace/published version and server derives object path. Positive controls in both workspaces. |
| Q-M23 | Consume/expire the F10 link after resolve but before Storage read; test exact grace/deadline boundaries | Subsequent request denies generically; image calls never change `opened_at` or extend grace. Already-authorized in-flight bytes follow the explicitly documented authorization point. |
| Q-M24 | Publish between page render and image fetch, replay an older handle, or race GC of the prior version | Old handle cannot retrieve a replaced/deleted version; proxy re-resolves as a fresh authorized render or fails generically; never serve deleted bytes. |
| Q-M25 | Use `branding_proxy` to list, sign, transform, upload, overwrite, delete, call unrelated RPCs, or read unrelated tables | Deny. Exact validated-bucket download is the only allowed Storage operation; no unrelated DB access. |
| Q-M26 | Drop/spoof context headers, forge operation headers, or reuse a pooled connection across requests | Fail closed at pinned stack B; prove exact download context reaches RLS and list/sign/transform do not. If unproven, stop and return to architect; no silent fallback. Hosted compatibility remains a production blocker. |
| Q-M27 | Disable old credential ID during rotation or use a disabled/unknown ID | Old RPC/download fails immediately; replacement works only after enable/deploy; audit shows credential IDs/outcomes, never JWTs. |
| Q-M28 | Owner user JWT promotes malformed bytes or fabricates validation receipt; validator attempts unrelated operations; revoke WO during upload | Owner promotion/receipt fabrication denies; authorized validator-only transition succeeds; later owner transition/attachment denies after revocation. |
| Q-M29 | Race GC deletion claim against upload attach, publish, or draft reference creation | Reference creation serializes or rejects while claim is active; current/draft/active-upload referenced objects survive; replaced unreferenced snapshots/assets can be collected; retries safely reconcile claims. |
| Q-M30 | Inspect HTML/RSC/network, error output, logs, cache/conditional/range paths, image optimizer and redirects | No credential/handle/token/path leakage, cache bypass, unauthorized bytes, upstream redirect or optimizer path; exact route has private/no-store and no-referrer. |

## Q-M to implementation task mapping

| Q-M checks | Owning task(s) |
|---|---|
| Q-M01, Q-M02, Q-M04 (app-layer predicate only) | T007 unit slice; T005 remains pending for the real application matrix. |
| Q-M05, Q-M06, Q-M08, Q-M09 (pure service behavior only) | T007 unit slice; repository/DB atomicity and GC races remain pending. |
| Q-M18 (input boundary only) | T007 unit slice; UI surface contrast remains pending. |
| Q-M21, Q-M22 | T045, T046 |
| Q-M23 | T046 |
| Q-M09 | T021, T024, T050 |
| Q-M24 | T045, T046, T050 |
| Q-M25 | T047, T051 |
| Q-M26 | T044, T046, T048 |
| Q-M27 | T047 |
| Q-M28 | T049 |
| Q-M29 | T050 |
| Q-M30 | T048 |

### DB-free application-layer evidence (batch 2)

These unit results exercise the pure service and validator boundary only. The injected authorization predicate is mocked; they do not verify the real `manage_branding` matrix, SQL capability parity, forced RLS, or Stack-B behavior. Those checks remain with the deferred DB unit and Stack-B lane.

| Q-M checks | Unit evidence in this batch | Remaining verification |
|---|---|---|
| Q-M01, Q-M02, Q-M04 | `tests/unit/branding-service.test.ts`: foreign scope, denied Sales/Trainer predicate results, and missing explicit scope stop before repository access. | T005 real application matrix and T006/T010 database wall on Stack B. |
| Q-M05, Q-M06, Q-M08, Q-M09 | `tests/unit/branding-service.test.ts`: stale draft/publish CAS, unchanged publication no-op, workspace-local sequences, and current-only publication result. | Repository transaction/unique constraint and publication/GC races on Stack B. |
| Q-M18 | `tests/unit/branding-validation.test.ts`: unknown/semantic-token fields reject; the pure mutation probe below confirms the assertion detects an allowlist regression. | Surface-specific visual contrast remains a UI/Frontend Design Gate check. |

RED was recorded before implementation: the validation, service, and portal-contract suites each failed to load their not-yet-created module (zero tests collected). After implementation, all three focused suites passed: 10 validation tests, 12 service tests, and 2 portal-contract tests (24 total).

Mutation probes were run locally without a database: bypassing the injected authorization predicate caused 4 service tests to fail (7 passed), including foreign-scope and Sales/Trainer denial checks; allowing `semanticTokens` through the validator field allowlist caused 1 validation test to fail (9 passed). Both mutations were restored, then the focused suites passed again. This is application-unit evidence only, not completion of the Q-M stack checks.

## Audit compatibility check

Architect decision: timestamp every F14 migration after every F11 migration, including review-fix migrations. Once F11 is on main, rebuild the F14 extension from the final merged F11 `audit_row_change()` body; F14 DB units that touch audit wait. Preserve every F11 mapping. Do not guess or hand-edit an already applied timestamp.

### Session 12: F11 merge prerequisite (AD-F14-1)

F11 PR #14 head `12036e2` merged as `1f4d235`; the verified main integration point is `a8c7ae569e1ae1380740230b90817679b22d465b`. Session 12 merged `origin/main` into this branch with no conflicts as `30efad9fa4dc2be19033b9ca9a38b0a5c6bddd75` and pushed that merge. The local `main` ref was `79b8ed8`; it was not moved. `rg -n audit_row_change supabase/migrations` confirms the latest complete function body is `supabase/migrations/20261031122000_client_accounts_signup.sql:32` (through line 146). It includes registration-link consumption and `client.signup_succeeded` alongside all earlier mappings. This makes the final F11 body available for later T022; no audit function or F14 migration was changed here. Every future F14 migration must still sort after all F11 migrations, including `20261031130000_purge_scheduling_pg_cron.sql`.

### T044: Session 12 hard gate — STOP, not accepted

The proof-only suite is `tests/integration/branding-storage-context.test.ts`; detailed evidence and pinned source links are in `tests/integration/branding-storage-verification.md`. Run only with `LIFTER_SUPABASE_STACK=b`. The test rejects any other stack before opening its database connection. It creates disposable no-login/no-bypass roles, a private bucket and an invoker policy probe, then removes its fixtures. JWTs are pre-issued in the test process using the selected local environment's signing secret; no signing code is added to Workers. Service-role is used only for fixture upload/bucket creation and cleanup, never for the read path under test.

Initial deny-all policy: **13 failed / 0 passed** (plus a cleanup error subsequently repaired and cleaned up). With the proof predicate: **12 passed / 1 failed / 0 skipped**. Restricted authority, request claims/headers/path/method, exact download operation, negative credentials/context, unrelated mutations, and actual pooled backend reuse pass. The transform contract remains deliberately failing: authenticated image transformation returns **404**, with **0** object-policy evaluations. B's running Storage has `ENABLE_IMAGE_TRANSFORMATION=false`; the installed router exits before registering transform routes. This is fail-closed HTTP behavior, but does not prove transform-vs-download discrimination inside RLS. T044 remains unticked and U03 validator promotion/U04 validated-policy/U06 proxy acceptance remain blocked. T045–T051 and T014 were not started. Hosted compatibility remains a separate production gate.

Pinned runtime: Supabase CLI **2.122.0**, Storage image **public.ecr.aws/supabase/storage-api:v1.84.19** (upstream tag commit `872757184c35626fef3d84f35e0b3c4fa82af1b6`), PostgreSQL **17.11** (image `17.11.0.006`), PostgREST **16.5**. The working mechanism is Storage's own transaction-local `set_config(..., true)` for the effective role, `request.jwt.claims`, `request.jwt.claim.role`, `request.headers`, `request.method`, `request.path`, and `storage.operation`; it is not a caller-supplied operation header. The positive policy requires `storage.object.get_authenticated`, GET, exact path/bucket/object, restricted role, signed proof credential/subject and independently matched opaque context.

After merging F11, its provisioner and four integration test files needed selector-only updates to avoid hard-coded Stack A Docker access. These preserve F11 assertions, SQL and feature behavior. B alone was reset from this worktree's B workdir with the migrations junction targeting this worktree, then provisioned through the selector. The Stack A container IDs and start times matched the baseline after T044, reset and provisioning. The post-full-integration snapshot differed: A's DB ID changed and Auth restarted; unchanged-state isolation across that interval cannot be claimed. The final verbose B probe also completed in the batch that printed this mismatch; further DB/Storage work then stopped. All issued mutation/exec targets were B. Stack B stays running. No production migration, capability or `has_capability` change was made.

Session 12 gates on the publishable state (without local RED `33fd95a`): typecheck, lint and format passed; `npm test` passed **67 files / 1,401 tests**; focused stack-selector unit passed **1 file / 5 tests**. T044 passed **12/13**, with the transform contract failing and zero skipped. Full B integration: **26 files passed / 1 failed / 1 skipped; 891 tests passed / 1 failed / 1 skipped (893 total)**. The skipped test is existing `client-accounts-timing.test.ts`, guarded by `SC011_TIMING_RUN`; it was not excluded by the command. No Storage case was skipped. `git diff --check` passed. Detailed gate/isolation evidence is in the verification document.

## Production blockers

Prove request/operation context on pinned Stack B before accepting proxy/validator units. Prove hosted-infrastructure compatibility before Production; no service-role fallback is allowed for public image delivery. Capacity against the 70% exit trigger and actual Storage backup/restore evidence are also required before Production.
