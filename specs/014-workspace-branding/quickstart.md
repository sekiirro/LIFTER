# F14 Verification Quickstart (future implementation work)

This document is an implementation verification recipe, not evidence that any command has been run. This planning unit is DB-free. Never run Docker, Supabase, local database, integration, or e2e commands as part of this unit. F11 owns stack A's database lock; F14 DB/Storage verification is assigned to stack B only after provisioning and the approvals below.

## Prerequisites before any DB or Storage check

1. Final PO decisions F14-1..8 are recorded in the spec. Stack-B provisioning/start was PO-approved and completed by the separate stack lane; F14 does not provision/start it.
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

## Audit compatibility check

Architect decision: timestamp every F14 migration after every F11 migration, including review-fix migrations. Once F11 is on main, rebuild the F14 extension from the final merged F11 `audit_row_change()` body; F14 DB units that touch audit wait. Preserve every F11 mapping. Do not guess or hand-edit an already applied timestamp.

## Production blockers

Prove request/operation context on pinned Stack B before accepting proxy/validator units. Prove hosted-infrastructure compatibility before Production; no service-role fallback is allowed for public image delivery. Capacity against the 70% exit trigger and actual Storage backup/restore evidence are also required before Production.
