# F14 Research

**Feature**: [Workspace branding](spec.md)
**Status**: planning research; no implementation or execution evidence is claimed.

## Sources and authority

1. [F14 specification](spec.md), the [r1 debate](research/spec-debate-r1.md), the accepted [focused r2 debate](research/spec-debate-r2-scope.md), and the architect-accepted [proxy credential critique](research/proxy-credential-critique.md). The r2 debate remains closed (8/8 findings accepted); the proxy credential report is recorded verbatim and incorporated below.
2. [Constitution](../../.specify/memory/constitution.md) v1.2.1 and [DESIGN.md](../../DESIGN.md).
3. [Architecture](../../docs/02-architecture.md), [decisions](../../docs/04-changes-and-questions.md), [agent workflow](../../docs/08-agent-workflow.md), [Frontend Design Gate](../../docs/09-frontend-design-gate.md), [feature tracker and DB lock](../../docs/10-feature-tracker.md), and [carried requirements](../../docs/12-carried-requirements.md). `docs/11-second-local-stack.md` is not on main; the second-stack guide was read from `origin/infra-second-stack`.
4. [Design-system specification](../002-design-system/spec.md), plan, research, data model, UI contract, and current `lib/design/tokens.ts`, `lib/design/tokens-css.ts`, `lib/design/color.ts`, and `components/ui/BrandScope.tsx`.
5. F10 `specs/010-registration-links/` public-read and action contracts. F11 `specs/011-client-accounts/` and latest audit migration were read from `origin/011-client-accounts` without switching worktrees.
6. The `infra-second-stack` branch's `docs/11-second-local-stack.md`, read with `git show` only.

## Findings and decisions carried into planning

- `manage_branding` is PO platform-wide (PO authority does not depend on workspace membership) and WO own-workspace with active membership; Sales and Trainer are denied. Enforce app `authorize()` and DB `has_workspace_access()` walls with forced RLS.
- Owner staging, attachment and publication use the verified user JWT, current capability/scope and upload-operation checks. The server validates PNG/WebP structure, strips metadata and rejects animation/SVG/JPEG. Only restricted `branding_validator` can promote immutable content-addressed validated bytes, with validator-only receipts. Revision-checked attachment follows promotion.
- The token-validating proxy is the only public asset path. Extended `registration_link_open(token)` creates a bounded-expiry opaque handle, stores only its hash, and binds it to link/workspace/published version. `registration_brand_asset_resolve(token, render_handle, slot)` is `branding_proxy`-only. Storage RLS repeats the live F10/render binding for the exact validated-bucket download. Image requests never set `opened_at` or extend grace.
- `branding_proxy` and `branding_validator` are restricted `NOLOGIN NOBYPASSRLS` identities with externally pre-issued expiring JWTs. Workers receive neither the project JWT signing key nor authority to mint those JWTs. An enabled credential-ID registry supports staged rotation/emergency disable and audit. The Worker already holds service-role for the PO-approved D-19 authenticated, capability-scoped manual recovery route; restricted identities narrow public-image authority but do not remove that key.
- All definer functions use `SECURITY DEFINER SET search_path=''`, qualified references, explicit owners/grants and no dynamic SQL. Default EXECUTE is revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`; grants are then made only as specified. Prefer a restricted no-login owner with explicit RLS predicates over postgres-owned omnipotent functions.
- GC uses audited cron and transactional deletion claims; all reference-creating operations serialize or reject against an active deleting claim. Recheck references before deleting bytes. Audit credential IDs/outcomes without bearer tokens, handles, token hashes, headers, URLs or bytes.
- **Hard gate**: pinned local stack B must prove verified bearer/header/operation context reaches Storage RLS and that missing/spoofed context and list/sign/transform calls fail closed. If the stack cannot prove this, stop and return to the architect; no silent fallback. Hosted compatibility remains a production blocker until separately proven.
- F14 is based on main; `infra-second-stack` is based on F11 (`440f0b2`). AD-F14-2 now fixes U00's port scope from head `d49880010e70ac03c4a264fc19610dfc443d7c55`: only `scripts/local-stack.mjs`, `supabase-stack-b/supabase/config.toml`, `.env.stack-b.example`, `.gitignore` hunk, `tests/unit/second-local-stack.test.ts`, `tests/integration/local-docker.ts`, and the stack-selector hunk of `tests/integration/harness.ts`. F14 does not need F11's provisioner. PO-approved Stack-B provisioning/start is complete in the separate lane; F14 does not provision/start. Stack B is `lifter-stack-b`, ports 25420–25429, selected by `LIFTER_SUPABASE_STACK=b`, with `storage-api` and Mailpit in its profile.
- Architect decision: all F14 migrations are timestamped after every F11 migration, including review fixes. After F11 lands on main, rebuild F14's audit extension from F11's final merged `audit_row_change()` body. F14 audit-touching DB units wait for that body.
- Separate logo/banner structural limits follow worst-case Workers CPU/memory benchmarks per final PO decision F14-3. Capacity counts up to two current assets/workspace, draft/staging, workspace volume, and no-store egress against verified Storage allowances and the 70% exit trigger. Storage backup/restore proof and permanent independent audit retention are required before Production.
- Final PO decision F14-5 supersedes the historical r1/r2 ten-version retention debate: only the latest published version is retained long-term. The previous snapshot/assets become GC-eligible once unreferenced by current publication, drafts or active uploads; transactional deletion claims coordinate races. Audit remains permanent and independent, with no reference to deleted object bytes/URLs or deletable version/asset rows.
- F14-4 requires pinned local Stack-B proof before proxy/validator acceptance and hosted-infrastructure proof before Production. There is no service-role fallback for public images.
- Preserve existing tokens, `deriveBrand`, `BrandScope`, semantic colors and per-request workspace/version resolution. `deriveBrand` covers neutral surfaces only; banner text stays off imagery or uses a guaranteed-contrast existing-token scrim. Late workspace-switch responses are discarded and no-scope surfaces use neutral defaults. Client Portal remains a brand data/token contract and preview placeholder only, conditional on P4.
- All UI follows DESIGN.md and the Frontend Design Gate. DG-F14-1..3 are approved; banner aspect/height remains a PO design item.

## Alternatives considered

| Concern | Considered alternative | Planning disposition |
|---|---|---|
| Public image access | Anonymous Storage SELECT or a project-wide credential | Rejected; use restricted proxy identity plus live F10/render binding enforced by RPC and Storage RLS. No service-role fallback for public images. |
| Upload sequencing | Attach before validation or direct-to-validated upload | Rejected; user-JWT staging, authoritative validation, validator-only promotion/receipt, revision-checked owner attachment. |
| Garbage collection | Check references, then delete without a claim | Rejected; the check/delete race permits a new reference. Use transactional deletion claims respected by every reference-creating operation. |
| Definer ownership | Postgres-owned omnipotent functions | Avoid; prefer restricted no-login owners, explicit RLS predicates, owners, grants and revokes. |
| Stack integration | Merge the F11-based infra branch wholesale | Rejected; architect decides from stack agent's file list and ports only approved configuration on an F14-based line. |
| Numeric image limits | Guess conservative values | Derive separate role-specific limits from worst-case Workers CPU/memory benchmarks. |

## Open research blockers

- Final PO decisions are recorded. Banner aspect/height values follow Frontend Design Gate prototype; separate role-specific caps follow benchmark evidence. These are implementation/design gates, not open PO choices.
- Pinned stack-B proof of Storage request-context and exact operation enforcement before proxy/validator units can be accepted; on failure return to architect.
- Hosted Storage compatibility proof remains a production blocker.
- AD-F14-2 stack integration scope is fixed; T003 ports only its approved files/hunks. No F14 provisioning/start work.
- Verified Storage capacity model and actual Storage backup/restore evidence before production approval.
- Client Portal contract remains conditional on P4.
