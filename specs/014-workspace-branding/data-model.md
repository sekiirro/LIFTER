# F14 Data Model

This is a logical model for implementation planning. It specifies no SQL, migration syntax, or physical schema. Names below are conceptual and subordinate to the approved F14 specification and plan-approval items.

## Entities

| Entity | Scope and lifecycle | Required invariants |
|---|---|---|
| Workspace brand draft | One editable draft per workspace; revision increases on each accepted edit | Workspace-bound; editable only by `manage_branding` with explicit authorized scope; each save uses compare-and-set against the submitted revision. |
| Brand draft fields | Required name in one locale; optional second locale with fallback; brand color; optional logo/banner references and bilingual banner alt text | Color is `#RRGGBB`; semantic tokens are not configurable. Banner is architect-decided image-only pending PO confirmation; no banner text/CTA/link/pricing/contact. |
| Brand asset | Workspace-qualified content hash, asset role (logo/banner), validated format, dimensions, byte size, immutable validated object reference | Hash is not a credential; no cross-workspace deduplication. Only structurally validated, metadata-stripped PNG/WebP enters the validated state. |
| Upload operation | Durable state machine associated with workspace, role, target draft revision, staging object and eventual validated asset | Private staging → server validation → immutable validated object → revision-checked draft attachment. Interrupted upload and failed attachment are reconcilable; cleanup is reference-safe. |
| Published brand version | Immutable snapshot with per-workspace version number, author/time, fields and asset references | Changed publish atomically snapshots, advances current pointer and writes one audit event. Stale publish rejects. Unchanged publish is a no-op. Restore copies into draft; explicit publish creates a new version. Last 10 published versions remain restorable. |
| Current publication reference | Workspace-scoped pointer to current published version or no-publication default | Updates only with an atomic successful publication; each request resolves authorized workspace and version server-side. |
| Branding audit event | Permanent append-only record for publication | Exactly one `branding.published` event per changed successful publication; only version id/number, source version id and changed field names; no bytes, authored text, tokens or URLs. Extend the latest F11 audit trigger body and preserve every existing mapping. |
| Registration-link render context | Server-authorized F10 token validity plus the published version resolved for the render | Image proxy rechecks F10 open validity including consumption on every request, without grace extension; serves only an asset bound to the version rendered for that token. No client-selected asset/history id. |
| Surface brand projection | Published tokens and permitted identity fields for Registration, Staff Dashboard, and Client Portal only when P4 exists | No shared actor/workspace cache; discard late workspace-switch responses; neutral defaults without scope. Client Portal contract does not add portal features. |

## Relationships and retention

- Every draft, version, asset, upload operation, and current-publication reference is bound to exactly one workspace. Composite relationships and workspace-prefixed Storage paths prevent cross-workspace attachment.
- Draft and published snapshots may reference validated objects. Active upload references protect staging and validated objects during attachment/reconciliation.
- Garbage collection considers references from current publication, draft, the ten restorable published versions, and active uploads. It is retryable, bounded, and must recheck references at deletion time. No audit event or referenced object is deleted.
- Capacity calculations count up to two assets per version, draft/staging overhead, workspace volume, and proxy no-store egress. Exact limits and retention beyond the required ten restorable versions are plan-approval items.

## Authorization and storage boundary

- App wall: `authorize(actor, 'manage_branding', workspace)`; deny by default, explicit workspace scope, PO global scope, WO own workspace only.
- Database wall: `has_workspace_access()` / capability helper in `SECURITY DEFINER` functions with `search_path=''`, plus forced RLS and bucket-qualified `storage.objects` policies.
- Anonymous users cannot list/read Storage directly. Cross-workspace access and mutation of published objects are denied. Public image bytes are available only through the token-validating proxy, never through client-visible signed URLs.
- Any server-side Storage credential exception is a PO plan item and architect review item; if approved, it must be narrowly scoped, audited and documented. No such exception is assumed here.

## Upload state model

The exact enum is intentionally not fixed. The required durable transitions are: staging accepted; validation in progress; validation rejected or validated; immutable validated object created; draft attachment succeeded or attachment failed/stale; reconciliation pending/completed; cleanup eligible/deleted. Transitions must be idempotent and enough evidence must remain to reconcile interruption without logging credentials or image bytes.
