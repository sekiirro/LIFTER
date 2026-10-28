# Contract: Branding workflow

This contract records observable inputs, outcomes and invariants. Route names and database shapes remain implementation choices unless fixed by F10.

## Authorization

- Every draft, preview, upload, restore, publish, and history request resolves a signed actor and explicit workspace scope.
- `manage_branding`: PO may manage any workspace; WO may manage own workspace; Sales and Trainer are denied. Unknown/foreign resources return generic denials without workspace disclosure.
- Enforce both app `authorize()` and database `has_workspace_access()`/capability policies, with forced RLS. UI visibility is not authorization.

## Draft and publication

- Save accepts current draft revision and allowed fields. Success returns new revision. A stale revision is a conflict and cannot overwrite.
- Preview is private and uses saved draft plus sample non-token data. It never changes public/current branding.
- Publish with stale revision is rejected. Unchanged draft publish is idempotent no-op. Changed publish atomically creates immutable version, updates current reference and appends one audit event; audit failure leaves no partial publication.
- Restore selects a restorable version and copies it into Draft. It does not change the current publication; explicit ordinary publish is required.
- Retain the last ten published versions for restore. Preserve audit events permanently.

## Upload

1. Receive into a private staging bucket and persist durable upload state.
2. Authoritative server validation checks PNG/WebP structure, magic, complete chunk/container boundaries, CRC/RIFF size, dimensions, complexity, animation, and plan-approved separate logo/banner limits. Reject SVG, JPEG, malformed/truncated/trailing data and animated formats. Strip metadata and compute hash over output bytes.
3. Place immutable content-addressed output in the private validated bucket. No overwrite or cross-workspace deduplication.
4. Attach only if the draft revision still matches. Reconcile interruptions and failed/stale attachments. Cleanup is bounded, retryable, and rechecks references including current publication, draft, ten restorable versions, and active uploads.

Numeric upload limits and the worst-case CPU benchmark method require PO approval before implementation. Benchmark full PNG/WebP validation, walking, stripping, and hashing against the Workers Free request CPU budget.

## Storage access policies

- Private buckets. `storage.objects` policies are bucket-qualified and validate workspace-prefixed paths plus independently verified capability/scope.
- Deny anonymous list/direct read, cross-workspace path access, and published-object mutation. Verify direct API attempts as well as application paths.
- No client-visible signed Storage URL. Any server credential exception requires explicit PO decision, narrow scope, audit, and architect review; baseline architecture confines service-role to audited cron.
