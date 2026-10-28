# F14 focused scope debate — round 2

**Date**: 2026-10-28
**Architect**: Claude Opus 5.5
**Critic**: gpt-6.1-sol medium (read-only)
**Scope**: PO-approved focused round
**Critic thread id**: `01a1841a-9887-7601-8456-28cda1eabc97`
**Reviewed spec**: `c575cfa35b8a22b2f1870692f91846558f332e5e`
**Outcome**: 8/8 accepted; debate closed after one round (PO-approved single round).

The critique below is copied verbatim. The architect response reproduces the focused response supplied for this round.

## Sol Medium focused critique (verbatim)
Reviewed `c575cfa35b8a22b2f1870692f91846558f332e5e`; **ND-F14-7 is Decided (PO, 2026-10-28)**. Evidence below is committed content only.

1. **[BLOCKER] Storage breaks the stated upload transaction guarantee.** Architect decision 10 retains “uploads … inside the draft transaction,” inherited from bytea design B′; Storage bytes cannot roll back with the database draft. **Change:** specify private staging → authoritative validation → immutable object → revision-checked draft attachment. Track upload states durably; reconcile interrupted uploads and failed attachment without deleting referenced objects. Replace immediate zero-orphan guarantees with bounded cleanup obligations.

2. **[BLOCKER] Asset delivery lacks an enforceable token-lifecycle contract.** FR-003/011 require token gating and no-store, but ND-F14-7 leaves delivery open. A previously issued signed URL remains an independent bearer credential until its own expiry; no-store does not revoke it on consumption. F10 also permits grace opens while F11 signup requires strict expiry. **Change:** require every new registration asset request to apply F10 open validity, including consumption, without extending grace. Bind access to an authorized rendered published version; reject arbitrary asset/history selectors. Already displayed pixels may remain; subsequent requests must fail generically.

3. **[MAJOR] Workspace isolation is asserted without Storage authorization rules.** FR-001/002/009 do not define bucket access, listing, overwrite, deletion or staging access. Architecture confines service-role use to audited cron operations. **Change:** specify private buckets and bucket-qualified `storage.objects` policies using workspace-prefixed paths plus independently verified capability/scope. Deny anonymous listing/direct reads, cross-workspace access and published-object mutation. Explicitly document any narrowly scoped server credential exception; a proxy alone does not establish Storage isolation.

4. **[MAJOR] Expanded banners lack bounded upload processing.** FR-009 defers size/pixel limits, while architect decision 4 assumes Workers Free CPU feasibility without banner measurements. Post-stripping limits alone permit oversized metadata/input processing. **Change:** select separate logo/banner ingress-byte, output-byte, dimension, pixel and structural-complexity limits at plan approval. Validate authoritatively server-side before attachment; benchmark worst-case PNG/WebP walking, stripping and hashing within the committed CPU budget. Preserve the approved structural-validation approach.

5. **[MAJOR] Banner content and presentation remain untestable.** FR-008 conditionally permits identity text without defining fields or limits. Raster artwork can itself contain forbidden pricing/contact/CTA content. DG-F14-1 specifies composition but no sizing/failure behavior. **Change:** explicitly choose image-only or define bounded bilingual plain-text fields, bidi handling and alternative text. Require identity-only confirmation covering embedded image content. Specify responsive aspect/height bounds, crop preview and missing-image fallback within Premium Centered Card; keep form controls outside imagery.

6. **[MAJOR] Retention does not yet guarantee restoration or capacity.** ND-F14-6 preserves ten restorable versions, but older-asset deletion remains open and draft/staged objects are unbounded. Architecture requires Storage backups and a 70% capacity exit trigger. **Change:** protect assets referenced by current publication, draft, ten restorable versions and active uploads; use retryable reference-checked garbage collection. Model two assets/version, draft/staging, workspace counts and no-store egress against verified Free-tier allowances; retain permanent audit independently.

7. **[MAJOR] CI enablement can leave F11 coverage silently skipped.** FR-017 requires Storage tests, but committed CI excludes `storage-api`; F11’s test skips unavailable Storage, and its isolated runner restores a Storage-disabled stack. **Change:** add a required Storage-enabled CI lane with readiness checks and zero permitted skips. Run F11 pending-client denials alongside F14 bucket/path policies, including direct API attempts; isolate fixtures and update stack restoration assumptions.

8. **[MAJOR] Cross-surface resolution and contrast need explicit contracts.** FR-011 mentions fresh public resolution; FR-008/015 omit staff switching behavior. `deriveBrand` checks neutral background/card contrast, not arbitrary hero imagery. **Change:** resolve authorized workspace and published version server-side per request; prohibit shared actor/workspace caching. Discard late switch responses and reset to neutral defaults without scope. Verify each surface’s actual backgrounds/states; preserve semantic tokens. Define P4’s data/token contract and preview placeholder without inventing portal functionality.

**Preferred design for Storage + delivery**

- Private staging and validated buckets; workspace-prefixed immutable objects.
- PO/WO server uploads after authorization; no browser promotion or published overwrite.
- Bounded server validation before hash and attachment.
- Revision-checked database attachment plus durable reconciliation.
- Token-validating image proxy; no client-visible Storage signed URLs.
- `private, no-store`, no-referrer, sniffed MIME/nosniff; redact credentials everywhere.
- Staff previews require authorization; public requests expose only authorized published assets.
- Reference-safe cleanup, ten restorable versions, quota monitoring and backup/restore proof.
## Architect response (verbatim)

Architect response (Claude, 2026-10-28): ALL 8 findings ACCEPTED; debate closed after one round (PO-approved single round).
1. Replace architect decision 10's "uploads inside the draft transaction" with: private staging bucket → authoritative server validation → immutable content-addressed object in the validated bucket → revision-checked draft attachment; durable upload states; reconciliation of interrupted uploads/failed attachments; reference-safe bounded cleanup (no deletion of referenced objects).
2. Public asset delivery = token-validating image proxy only; no client-visible Storage signed URLs. Every registration asset request re-applies F10 open validity including consumption, without extending grace; access is bound to the authorized published version rendered for that token; no arbitrary asset/history selectors; failures are generic. Already displayed pixels may remain.
3. Private buckets; bucket-qualified `storage.objects` policies with workspace-prefixed paths plus independently verified capability/scope; deny anonymous listing/direct reads, cross-workspace access and published-object mutation. Any server credential use must be narrowly scoped, audited and documented as an explicit exception in the plan (architecture confines service-role to audited cron) — plan item for architect review.
4. Separate logo/banner limits (ingress bytes, output bytes, dimensions, pixels, structural complexity) chosen at plan approval; authoritative server-side validation before attachment; benchmark worst-case PNG/WebP walking/stripping/hashing within the Workers CPU budget; structural-validation approach unchanged.
5. ARCHITECT DECISION (PO may confirm at plan approval): Hero Banner is IMAGE-ONLY, with required bilingual alt text (one language required + fallback, matching ND-F14-3); no banner text fields; uploader must confirm the image contains identity content only (no pricing/contact/CTA/links); responsive aspect/height bounds, crop preview and missing-image fallback within the Premium Centered Card; form controls never overlap imagery. Exact aspect/height values are a design item for the PO at plan time (Frontend Design Gate).
6. Protect assets referenced by current publication, draft, the 10 restorable versions and active uploads; retryable reference-checked garbage collection; capacity model (two assets/version, draft/staging, workspace count, no-store egress) against verified Free-tier allowances and the architecture's 70% exit trigger; Storage backup/restore proof; audit retained independently.
7. Add a required Storage-enabled CI lane with readiness checks and ZERO permitted skips; run F11 pending-client Storage denials alongside F14 bucket/path policy tests including direct API attempts; isolated fixtures; update the F11 isolated-runner stack-restoration assumptions.
8. Server-side per-request resolution of authorized workspace + published version; no shared actor/workspace caching; late workspace-switch responses discarded and neutral defaults when no scope; verify contrast on each surface's real backgrounds/states (deriveBrand covers neutral surfaces only — banner overlays must keep text off imagery or use a guaranteed-contrast scrim from existing tokens); semantic tokens preserved; define the P4 Client Portal data/token contract and a preview placeholder without inventing portal features.