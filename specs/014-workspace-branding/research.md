# F14 Research

**Feature**: [Workspace branding](spec.md)
**Status**: planning research; no implementation or execution evidence is claimed.

## Sources and authority

1. [F14 specification](spec.md), including the [r1 debate](research/spec-debate-r1.md) and [focused r2 debate](research/spec-debate-r2-scope.md). The focused critique is complete (8/8 accepted); it is not reopened here.
2. [Constitution](../../.specify/memory/constitution.md) v1.2.1 and [DESIGN.md](../../DESIGN.md).
3. [Architecture](../../docs/02-architecture.md), [decisions](../../docs/04-changes-and-questions.md), [agent workflow](../../docs/08-agent-workflow.md), [Frontend Design Gate](../../docs/09-frontend-design-gate.md), [feature tracker and DB lock](../../docs/10-feature-tracker.md), and [carried requirements](../../docs/12-carried-requirements.md). `docs/11-second-local-stack.md` is not present on main; the applicable second-stack guide was read from `origin/infra-second-stack`.
4. [Design-system specification](../002-design-system/spec.md), plan, research, data model, UI contract, and the current `lib/design/tokens.ts`, `lib/design/tokens-css.ts`, `lib/design/color.ts`, and `components/ui/BrandScope.tsx`.
5. F10 `specs/010-registration-links/` public-read and action contracts. F11 `specs/011-client-accounts/` and `20261031122000_client_accounts_signup.sql` were read from `origin/011-client-accounts` without switching worktrees. The F11 function body includes the client-signup audit mapping and is the required starting body for an F14 extension.
6. The `infra-second-stack` branch's `docs/11-second-local-stack.md`, read through `git show` without checking out or merging that branch.

## Findings and decisions carried into planning

- Two authorization walls remain mandatory: app `authorize(actor, action, resource)` and database `has_workspace_access()` via `SECURITY DEFINER` helpers with an empty `search_path`; forced RLS applies to each tenant-owned table. `manage_branding` is PO platform-wide and WO in own workspace only; Sales and Trainer are denied.
- Storage design follows r2: private staging, authoritative server validation, immutable workspace-qualified content-addressed validated object, then revision-checked attachment. Persist upload state and reconcile interruptions/failures. Cleanup is bounded, retryable, and reference-checked. Buckets are private; policies are bucket-qualified and constrain workspace-prefixed object paths while independently checking capability/scope. Deny anonymous listing/direct reads, cross-workspace access, and published-object mutation.
- Public asset delivery is the token-validating image proxy only. Every request reapplies F10 open validity including consumption, without extending grace; the request is bound to the authorized published version rendered for that token. No client-visible signed URLs or asset/history selectors; failures are generic and private/no-store.
- Validation stays structural: PNG/WebP only; inspect full structure, CRC/RIFF bounds, dimensions and complexity; strip metadata; reject animation, truncation, trailing bytes and SVG. Numeric limits and a worst-case Workers Free CPU benchmark method remain PO approval items. No image processing library or implementation is selected here.
- Storage capacity must model two assets per version, draft/staging retention, workspace count and no-store egress against verified Free-tier allowances and the architecture's 70% exit trigger. Backup/restore evidence for Storage is required; audit retention is independent and permanent.
- F14 is based on main, whereas `infra-second-stack` is based on F11 (`440f0b2`). Do not merge that branch wholesale into F14. Proposed path: after review with the stack owner, port only approved stack-B infrastructure as a reviewed patch/cherry-pick onto an integration branch based on the F14/main line, then verify no F11 feature payload is included. Exact integration sequencing is an architect item. Stack B is `lifter-stack-b`, ports 25420–25429, selected explicitly by `LIFTER_SUPABASE_STACK=b`; its start profile must enable `storage-api` and any documented Storage dependencies. The current second-stack guide describes the standard stack defaults and does not yet establish a Storage-enabled profile, so infrastructure owner confirmation is a blocker. No provisioning or start is authorized by this plan.
- Extend the latest F11 `app_private.audit_row_change()` body rather than replacing its F11 mappings. F14's main-based migration ancestry creates timestamp ordering and rebase/retimestamp risk when F11 lands. Architect must determine migration ordering and reconcile/retimestamp the F14 migration before implementation integration; no timestamp is invented in this plan.
- Preserve tokens, semantic colors, `deriveBrand`, and `BrandScope`. `deriveBrand` governs neutral surfaces only; banner text stays off imagery or uses a guaranteed-contrast scrim from existing tokens. Check real backgrounds and states on each surface. Keep per-request workspace/version resolution, discard late workspace-switch responses, and use neutral defaults with no scope.
- Portal scope is a brand data/token contract and a preview placeholder only, conditional on P4. It adds no invented portal behavior.
- The Frontend Design Gate is mandatory for all changed UI: DESIGN.md authority, existing tokens/components, bilingual RTL/LTR, light/dark, mobile/desktop matrix, states, accessibility, and review evidence. F14's DG-F14-1..3 are approved; banner aspect/height is still open. Plan approval does not itself approve unresolved design values.

## Alternatives considered

| Concern | Considered alternative | Planning disposition |
|---|---|---|
| Public image access | Storage signed URLs | Rejected by accepted r2 architecture; proxy-only, no client-visible signed URLs. Resolve the stale wording in ND-F14-7 only through the normal PO spec correction process if desired; this plan records the binding r2 constraint. |
| Upload sequencing | Attach before validation or upload directly to validated storage | Rejected; private staging then authoritative validation and immutable validated object before revision-checked attachment. |
| Rollback | Point current publication to a historical version | Rejected by ND-F14-5; restore to draft then explicitly publish a new immutable version. |
| Stack integration | Merge F11-based infra branch wholesale | Rejected pending architecture review because it may carry F11-only ancestry/payload into main-based F14. Port only approved infra on a reviewed F14-based integration branch. |
| Image validation numeric limits | Choose conservative numbers in plan | Deferred to PO approval after worst-case CPU/size benchmark and capacity model; no values are fabricated. |

## Open research blockers

- PO values and benchmark method for distinct logo/banner ingress bytes, output bytes, dimensions, pixels, and structural complexity.
- Confirm Storage-enabled stack-B profile, readiness criteria, and how required Storage services fit the stack's resources.
- Architect-approved stack-B integration path and F11/F14 migration timestamp reconciliation.
- PO choice on any narrowly scoped server-side Storage credential exception. Architecture currently confines service-role to audited cron; public image delivery does not need to issue a signed URL.
- PO banner image-only confirmation, aspect/height values, and final design review.
- Verified Free-tier allowance/capacity model and Storage backup/restore proof before production approval.
- P4 dependency: Client Portal surface contract remains conditional and must be revisited when that feature exists.
