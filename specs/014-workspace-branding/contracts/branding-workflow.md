# Contract: Branding workflow

This contract records observable inputs, outcomes and invariants. Route names and database shapes remain implementation choices unless fixed by F10.

## Authorization

- Every draft, preview, upload, and publish request resolves a signed actor and explicit workspace scope. No historical restore/rollback or version-history selection is required.
- `manage_branding`: PO may manage any workspace; WO may manage own workspace; Sales and Trainer are denied. Unknown/foreign resources return generic denials without workspace disclosure.
- Enforce both app `authorize()` and database `has_workspace_access()`/capability policies, with forced RLS. UI visibility is not authorization.

## Draft and publication

- Save accepts current draft revision and allowed fields. Success returns new revision. A stale revision is a conflict and cannot overwrite.
- Preview is private and uses saved draft plus sample non-token data. It never changes public/current branding.
- Publish with stale revision is rejected. Unchanged draft publish is idempotent no-op. Changed publish atomically creates immutable version, updates current reference and appends one audit event; audit failure leaves no partial publication.
- Only the current published version is retained long-term. A changed publish atomically replaces it; the previous snapshot/assets become GC-eligible once no current, draft, or active-upload reference remains. No historical restore/rollback capability is required.
- Publication audit is permanent and independent of version/asset retention. Audit rows have no FK dependency on deletable version/assets and contain no object IDs, bytes or URLs.

## Upload

1. Owner begins and uploads to private staging using the verified user JWT, with current workspace/capability and upload-operation policy checks; persist durable state.
2. Authoritative server validation checks PNG/WebP structure, magic, complete chunk/container boundaries, CRC/RIFF size, dimensions, complexity, animation, and plan-approved separate logo/banner limits. Reject SVG, JPEG, malformed/truncated/trailing data and animated formats. Strip metadata and compute hash over output bytes.
3. Only `branding_validator` may promote immutable content-addressed output to the private validated bucket, using an externally pre-issued expiring JWT and operation-bound validator-only receipt. An owner/browser JWT cannot mark bytes validated or fabricate a receipt. No overwrite or cross-workspace deduplication.
4. Owner attaches only if current `manage_branding` authority and draft revision still match. Reconcile interruptions and failed/stale attachments. Cleanup is bounded, retryable, and rechecks references from the current publication, draft, and active uploads.

Derive and document separate numeric logo/banner upload limits from worst-case CPU/memory benchmarks. Benchmark full PNG/WebP validation, walking, stripping, and hashing against the Workers request CPU/memory budgets before using those limits.

## Storage access policies

- Private buckets. `storage.objects` policies are bucket-qualified and validate workspace-prefixed paths plus independently verified capability/scope.
- `branding_proxy_object_read` grants `SELECT` only to `branding_proxy`, only for the exact validated-bucket authenticated-download operation, and only when `app_private.branding_storage_read_allowed(...)` returns true after independently validating the live F10 token state, enabled credential ID, render handle, link/workspace/version/slot and exact object path.
- `branding_proxy` and `branding_validator` are restricted `NOLOGIN NOBYPASSRLS` roles with only explicitly required memberships/grants, no privileged role memberships, and no unrelated application table access. Workers hold separately issued, expiring role JWTs; the project JWT signing secret is never present in Workers. A private credential-ID registry supports immediate disable and staged rotation and is audited without recording bearer credentials.
- Deny anonymous list/direct read, cross-workspace path access, and published-object mutation. Verify direct API attempts as well as application paths. A reader credential, render handle, object hash, or visitor token alone is insufficient.
- No client-visible signed Storage URL and no service-role fallback for public images. The Worker already has a service-role key for the PO-approved D-19 manual recovery link; restricted identities narrow the public image route and do not remove the key from the Worker. Any other F14 service credential use needs explicit scope, audit, and architect review.

## Render context, function privileges and garbage collection

- Extended `registration_link_open(token)` mints a cryptographically opaque, bounded-lifetime render handle and stores only its hash, bound to registration link, workspace and exact published version. It returns proxy URLs using the opaque handle and fixed `logo|banner` slot; it exposes no object/version selector. Do not change F10 validity behavior. Image requests never set `opened_at` and never extend grace.
- `registration_brand_asset_resolve(token, render_handle, slot)` is executable only by `branding_proxy`; it validates canonical token/hash and binding against F10's live predicate, including consumption and strict deadline. It returns derived object metadata, not client-selected paths.
- All new definer functions use `SECURITY DEFINER SET search_path=''`, qualified references, no dynamic SQL, explicit owners and explicit grants. Revoke `EXECUTE` from `PUBLIC`, `anon`, `authenticated`, and `service_role` by default, then regrant only the specified role/function pairs. Prefer a restricted no-login owner and explicit RLS predicates over postgres-owned omnipotent functions.
- Audited cron performs destructive GC through `branding_gc_claim(...)` and `branding_gc_finalize(...)`. A transactionally claimed deleting state is observed by every operation creating draft/current-publication/upload references; such operations serialize or reject while deletion is claimed. Delete object bytes only after reference recheck, then finalize. SQL metadata deletion alone does not remove Storage bytes. On publish, previous-current assets are eligible when no current, draft, or active-upload reference remains; stale render handles fail generically or trigger fresh authorization and never serve deleted bytes.

| Function/policy | Allowed authority |
|---|---|
| Existing `registration_link_open(text)` | Existing `anon, authenticated` execution retained; narrowly extended to create render context. |
| `registration_brand_asset_resolve(text,text,text)` | `branding_proxy` only; derived metadata for exact bound object. |
| `app_private.branding_storage_read_allowed(...)` | `branding_proxy` only; boolean for exact object and request/operation context. |
| `branding_upload_begin(...)`, `branding_asset_attach(...)`, publish operations | `authenticated` only; independently check current owner capability, workspace scope, upload provenance and revision. |
| `branding_validation_prepare(...)`, `branding_validation_complete(...)` | `branding_validator` only; transitions and validator-only receipts. |
| `branding_gc_claim(...)`, `branding_gc_finalize(...)` | Grant `service_role` only for the audited cron caller on these bounded workspace-scoped functions; transactional deletion claim. This is not a claim that service-role has no other existing application use. |
