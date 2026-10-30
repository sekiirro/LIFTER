# F14 spec debate — round 1

**Date**: 2026-10-28
**Architect**: Claude Opus 5.5
**Critic**: gpt-6.1-sol medium (read-only)
**Codex thread id**: `01a183d7-86a0-7ca1-a226-d098a5bbf4e5`
**Outcome**: closed after one round; 10/11 accepted, #4 accepted in part with architect decision.

The source texts below are preserved for review traceability. The critique is reproduced verbatim.

## Architect v0 draft
# F14 — Workspace branding: draft, preview, publish (Claude initial draft v0)

Status: architect draft for Sol critique. Not PO-approved. Numbering: F14 so the F11 spec's forward reference "F13 freeze, renewal and refunds" stays valid (architect choice; PO may renumber). Sources: BRD-02 "Workspace branding", BRD-04.2, PRD-01 WO console, PRD-02 (branded registration form only), DR-01, D-18, DESIGN.md §2/§11/§12, specs/002-design-system (BrandScope, contrast guard), F10 ND-F10-4, traceability AT-BRD-01/02, constitution IV/V/VIII.

## 1. Problem and scope
Workspace Owners must edit their workspace's visual identity, preview it, and publish it without PO approval (BRD-02). The only public surface in LIFTER is the token-gated registration page (BRD-04.2, PRD-02), which today shows the workspace name only (ND-F10-4).

**In scope**
- B1 Branding draft per workspace: brand color (single hex; D-18 contrast guard in light AND dark), display name AR/EN, logo image, optional short bilingual welcome line on the registration page (length-capped; not marketing).
- B2 Preview: staff-only render of the registration page and app-shell brand surfaces with the draft, in AR/EN × light/dark × mobile/desktop, using the real components with sample (non-token) data.
- B3 Publish: creates an immutable published branding version; the registration page and in-app brand surfaces use only the latest published version (AT-BRD-01: draft never visible on live registration). Revert = publish a copy of an older version (no mutation of history).
- B4 Branding can never alter finance, permissions or security behavior (AT-BRD-02): branding is pure presentation data; no HTML, no CSS, no scripts, no URLs/links.
- B5 Audit `branding.draft_saved`, `branding.published` (ids, version no, field names changed; no image bytes).

**Out of scope**: public marketing/landing/FAQ/price/contact pages (BRD-04.2 forbids); client portal theming beyond shared brand tokens (P4); custom fonts; per-mode separate brand colors (DESIGN.md §11.1 open); hero imagery beyond the logo unless PO approves (see O4); PO approval workflow (BRD: none).

## 2. Requirements (draft)
- FR-01 Capability: NEW `manage_branding` for workspace_owner and platform_owner (PO platform-wide). This IS a capability-matrix change → requires PO approval (O1). Sales/Trainer: none.
- FR-02 Two walls: app `authorize()` + DB SECURITY DEFINER RPCs (`search_path=''`, postgres-owned, EXECUTE to `authenticated`), forced RLS, zero direct grants.
- FR-03 Color: server-side validation of `#RRGGBB`; reuse the existing contrast guard (lib/design + BrandScope) so text-on-brand and brand-on-surface meet WCAG 2.2 AA in both modes; failing colors are rejected with the guard's explanation, or auto-adjusted on-text color only if DESIGN.md already specifies that (else design gap).
- FR-04 Logo: raster only (PNG/WebP/JPEG; SVG rejected — XSS), magic-byte check, ≤ 256 KB, dimension caps; stored per version, content-addressed (SHA-256) so published versions never change; served with `Content-Type` from the sniffed type, `X-Content-Type-Options: nosniff`, no-referrer, long cache keyed by hash.
- FR-05 Storage choice (architect decision after debate): A) Supabase Storage private bucket + signed/proxied read; B) bytea in Postgres with size cap served by a Route Handler; C) defer logo. Draft preference: B for v1 (no storage-api in dev/CI, Free-tier friendly, transactional with the version row) — needs Sol challenge on DB size/egress.
- FR-06 Public read path: anonymous visitors obtain published branding ONLY through the valid-token registration open path (F10 RPC), never via a workspace-enumerable endpoint; invalid/expired tokens show the generic unbranded invalid page (no workspace disclosure).
- FR-07 Text fields bilingual, length-capped, plain text, rendered as authored (constitution VIII), bidi-safe; no links/URLs/phone numbers (no pre-sale CTA, BRD-04.2) — validation rule NEEDS PO (O3).
- FR-08 Published versions immutable (update/delete/truncate rejected for every role, F9 pattern).
- FR-09 Frontend design gate applies to editor, preview and registration page.

## 3. Entities
`workspace_branding_drafts` (workspace_id PK, fields, updated_by/at) · `workspace_branding_versions` (id, workspace_id, version_no, fields snapshot, logo_sha256, published_by/at; immutable) · `branding_assets` (sha256 PK, workspace_id, mime, bytes|storage path, size) · workspace current pointer `published_branding_version_id`.

## 4. Open decisions for PO (do not assume)
- O1 Approve new capability `manage_branding` for WO + PO only?
- O2 Exact editable fields: color, AR/EN display name, logo, welcome line — anything else ("theme", "hero/branding elements" in BRD-02)?
- O3 Welcome line: allowed at all on the registration page (BRD-04.2 "only identity + form")? Max length; forbid URLs/phones?
- O4 Hero image/banner on the registration page: yes/no?
- O5 Where published branding applies: registration page only, or also staff app shell for that workspace, and later the client portal?
- O6 Design gaps (DESIGN.md §11): branded registration-page layout, logo placement/size, editor layout, contrast-failure UX (reject vs auto-adjust on-text color), per-mode brand color.

## Sol Medium critique — round 1 (verbatim)

1. **[BLOCKER] FR-02 does not establish the database authorization wall.** Postgres-owned `SECURITY DEFINER` functions bypass RLS; forced RLS alone cannot authorize their operations. Require independent signed-actor, capability, membership and workspace checks inside every staff RPC, explicit workspace predicates, qualified names, empty `search_path`, and EXECUTE revocation before narrow grants. Update both TypeScript and SQL capability matrices. Evidence: Constitution I/III; `lib/auth/capabilities.ts:9–45`; `20261027140000_access_capability_for_po.sql:1–18`.

2. **[BLOCKER] Asset identity permits cross-tenant collisions.** Draft §3 makes SHA-256 globally primary while assigning each asset one workspace. Two workspaces uploading identical bytes collide; deduplication responses could reveal another workspace’s asset existence. Use `(workspace_id, sha256)` identity and composite references from drafts/versions, plus `(workspace_id, version_id)` for the current pointer. Hashes must never authorize reads. Evidence: draft §3; Constitution I.

3. **[MAJOR] The public contract is incomplete.** FR-06 leaves logo retrieval authorization undefined; a hash URL can bypass token validation. Extend the bounded F10 projection to return published identity only, with no workspace selector, draft/history reader or anonymous table grants. Preserve identical invalid responses. Update the strict parser atomically: added fields currently make valid responses invalid. Evidence: `20261030120000_registration_links.sql:200–245`; `lib/registration-links/open.ts:6–17`.

4. **[MAJOR] Upload checks do not neutralize image payloads.** Raster signatures and compressed-size limits do not exclude polyglots, corrupt decoders, animated-image amplification or decompression bombs. Specify bounded full decoding, pixel/frame/memory limits, metadata stripping and canonical re-encoding before hashing; reject unsupported/truncated files and preserve the previous logo on failure. Choose processing compatible with Cloudflare CPU constraints. Evidence: draft FR-04; architecture §Free-tier validation.

5. **[MAJOR] Cache policy conflicts with token-gated delivery.** “Long cache keyed by hash” must not expose draft assets or serve protected responses after token expiry/consumption. Make registration, preview and gated asset responses private/no-store, including errors; prohibit shared server/CDN caching of token responses. Resolve the published pointer freshly after publication. Any enduring public logo cache requires an explicit relaxation of FR-06. Evidence: draft FR-04/06; F11 `contracts/client-signup-surface.md:47–51`.

6. **[MAJOR] FR-03 contradicts the existing contrast mechanism.** F2 already derives accessible fill/text/ring/hover variants; it does not merely reject raw colors or change on-text color. Reuse `deriveBrand` and `BrandScope`, retain the source color, explain adjustments, and explicitly prohibit overriding semantic tokens. Evidence: F2 spec FR-003–005; `lib/design/color.ts:113–165`; `components/ui/BrandScope.tsx:1–22`. O6 should not reopen this implemented behavior.

7. **[MAJOR] Draft/publication consistency is unspecified.** Add draft revision checks, explicit stale-edit feedback, serialized per-workspace publication and atomic snapshot/pointer/audit commit. Define retries/no-ops, publish-versus-save races, and whether reverting replaces the current draft. Make version numbers unique per workspace. Evidence: draft B3/§3; DESIGN.md §11.7; F9 `contracts/packages-surface.md:33`.

8. **[MAJOR] Open-form and fallback behavior are missing.** Recommend keeping an already rendered form’s identity until reload; publishing must not reset inputs, alter signup authorization or change package snapshots. Define no-branding defaults—workspace name, emerald-derived tokens, no logo—and absent-locale fallback. Flag the existing grace discrepancy separately: F10 may render valid after expiry while F11 refuses signup. Evidence: Constitution VIII; F11 spec edge cases and ND-F11-4a; draft B3/FR-06.

9. **[MAJOR] Audit integration lacks an enforceable contract.** Extend the latest F11 audit body, preserving every legacy mapping; pointer-only updates currently produce no workspace event. Require exactly one publication event, transactional rollback on audit failure, and allow-listed revision/version/source-version identifiers. Exclude image bytes, authored text, tokens and signed asset credentials. Evidence: `20261031122000_client_accounts_signup.sql:32–146`; F9 data-model §Audit extension; draft B5.

10. **[MAJOR] “Free-tier friendly” is unsupported.** One thousand distinct 256-KiB logos consume 250 MiB before indexes, backups or text; immutable history makes growth permanent. Project DB/storage/egress and backup costs, bound abandoned uploads, and deduplicate within each workspace. B shifts media into the constrained database; C defers an explicit BRD requirement. Evidence: draft FR-05/08; architecture §§Files, Free-tier validation, Backups; BRD-02.

11. **[MINOR] Separate unsettled presentation from unrelated features.** Remove welcome text from assumed scope pending approval; registration hero elements must remain identity-only. Keep F13 lifecycle operations, P2 form construction and P4 portal implementation outside F14. Avoid inventing WO/PO mobile navigation while adding branding access. Evidence: BRD-04.2; DR-01; roadmap phase table; DESIGN.md §11.5; draft B1/B2/O3–O5.

**Preferred alternative**

Prefer **A**, private Storage with a bounded token-validating logo proxy: aligns with architecture §Files, preserves database capacity, but needs upload finalization, orphan cleanup and backup coordination. **B**, sanitized bytes embedded in the existing token RPC response, materially simplifies public authorization and transactional publication, but increases database/egress pressure. **C** requires an approved sequencing deferral. Prefer the single token-derived projection over a separately workspace-addressed branding endpoint (findings 2–5).

**Open-decision corrections**

O1 should confirm matrix alignment, not reopen WO branding authority (BRD-02). Consolidate O2–O4 into permitted identity content; marketing remains excluded. O5 needs explicit rollout scope. Correct O6’s §11 attribution: layout/logo dimensions are unspecified design work; contrast derivation already exists. Add PO decisions on bilingual field obligations, live-form publication behavior and user-visible conflict/revert semantics. Storage, grants, decoding limits, cache mechanics and locking belong to the architect; genuine unresolved DESIGN.md choices remain explicitly open.
## Architect response r1

# F14 Workspace branding — Spec debate round 1: architect response (Claude) → v1 decisions

Sol Medium critique (thread 01a183d7-86a0-7ca1-a226-d098a5bbf4e5) verified at a14bc72 (`deriveBrand` in `lib/design/color.ts:113`; strict 2-key `parseOpenResult` in `lib/registration-links/open.ts`). Debate closed after one round: 10 findings ACCEPTED, #4 ACCEPTED IN PART with an architect decision (rationale below; no second round — the disagreement is about feasibility on the platform, not about the threat). These override `branding-draft-claude.md` where they differ.

1. ACCEPT. Every staff RPC performs signed-actor + capability + membership + workspace checks inside the SECURITY DEFINER body (explicit workspace predicates, schema-qualified names, `search_path=''`, revoke default EXECUTE then narrow grants). If `manage_branding` is approved, update BOTH the TS matrix and the SQL capability function in the same change.
2. ACCEPT. Asset identity `(workspace_id, sha256)`; composite FKs from drafts/versions; current pointer `(workspace_id, version_id)`. Hashes never authorize reads; no cross-workspace dedup.
3. ACCEPT. Public read = the existing token-validated F10 open projection extended with published identity fields only (no workspace selector, no draft/history reader, no anonymous table grants). Invalid responses stay byte-identical. The strict parser and its tests change atomically with the RPC.
4. ACCEPT IN PART — architect decision. Full decode + canonical re-encode is not feasible inside a Cloudflare Workers Free CPU budget (architecture §Free-tier validation) and would need a new image dependency. v1 instead: **PNG and WebP only** (JPEG dropped: EXIF/GPS privacy and no cheap safe stripping); magic bytes + full structural chunk walk (PNG chunk CRCs / WebP RIFF sizes) rejecting truncated/trailing data; dimensions read from IHDR/VP8X/VP8/VP8L with a pixel cap (e.g. ≤ 1024×1024) and **animation rejected** (APNG `acTL`, WebP `ANIM`); metadata stripped by dropping all non-critical ancillary chunks (PNG keeps IHDR/PLTE/IDAT/IEND/tRNS; WebP keeps VP8/VP8L/VP8X(without metadata flags)/ALPH); size cap ≤ 64 KiB after stripping; hash computed on the stripped bytes; previous logo preserved on any failure. Rendered only via `<img>` (never inline SVG/HTML), with `X-Content-Type-Options: nosniff` and sniffed `Content-Type`. Residual risk (decoder bugs in the viewer's browser) is recorded as accepted risk for PO visibility.
5. ACCEPT. Registration, preview and asset responses `private, no-store` including errors; no shared/CDN caching of token responses; published pointer resolved fresh per request.
6. ACCEPT. Reuse `deriveBrand` + `BrandScope`; keep the source color, explain adjustments to the editor, never override semantic tokens. O6 no longer reopens contrast behavior.
7. ACCEPT. Draft revision number with compare-and-set and explicit stale-edit feedback; per-workspace serialized publish; snapshot + pointer + audit in one transaction; idempotent publish of an unchanged draft is a no-op; version_no unique per workspace; revert = load an older version into the draft (PO decides UX, see P5) then publish.
8. ACCEPT. An already rendered registration form keeps its identity until reload; publishing never resets inputs, never alters signup authorization or snapshots. No-branding default = workspace name + emerald-derived tokens + no logo; missing-locale fallback to the other locale's text. The F10 grace-open vs F11 strict-signup discrepancy (ND-F11-4a) is referenced, not changed.
9. ACCEPT. Extend the latest `audit_row_change()` body preserving every mapping; exactly one `branding.published` event per publication (version id, version_no, source version id, changed field names); rollback on audit failure; no bytes, authored text, tokens or URLs.
10. ACCEPT. Storage choice made explicit with capacity numbers (below). Uploads are staged inside the draft transaction (no orphan bytes without a draft reference); history bounded per PO decision P6.
11. ACCEPT. Welcome text out of assumed scope pending PO; identity-only registration surface; no navigation invention.

## Logo storage (architect recommendation; PO confirms because option A changes the approved dev/CI stack)
- **Recommended B′:** stripped ≤ 64 KiB PNG/WebP bytea in Postgres, embedded as a data URI in the token-validated registration response (no separate public asset endpoint → no hash-URL bypass, no caching surface). Capacity: 64 KiB × (versions kept) per workspace; at 50 workspaces × 10 versions ≈ 32 MiB worst case. Free-tier DB 500 MB.
- A: private Supabase Storage + token-validating proxy — better long-term capacity, but requires enabling `storage-api` in the default local/CI stack (today excluded by PO-approved flags; Storage tests are isolated-local only) and hosted Storage verification.
- C: defer logo (needs PO sequencing approval; BRD-02 lists logo).

## Final PO decision list (F14)
- P1 Approve capability `manage_branding` for WO (own workspace) + PO (platform-wide); none for Sales/Trainer. (Aligns the matrix with BRD-02; not a re-ask of WO authority.)
- P2 Permitted identity content on the registration page: color + AR/EN display name + logo only (recommended), or also a short welcome line (length? no URLs/phones), or a hero image/banner?
- P3 Bilingual obligations: must both AR and EN display names be filled, or is fallback to one allowed?
- P4 Rollout scope: published branding on the registration page only (recommended for v1), or also the staff app shell for that workspace now?
- P5 Revert/conflict UX: revert loads an older version into the draft for review before publish (recommended) vs instant re-publish.
- P6 Version history retention: keep all versions forever vs keep last N.
- P7 Logo storage: B′ (recommended) / A / C as above; and acceptance of the residual image-decoder risk in #4.
- Design gaps (A/B/C at spec time): branded registration-page layout and logo placement/size; editor + preview layout; how contrast adjustments are explained in the editor.
