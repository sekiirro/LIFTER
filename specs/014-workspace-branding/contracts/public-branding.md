# Contract: Public branding and image proxy

## Registration projection

- Extend the existing F10 token-validated open projection with the current published identity only. Drafts and history remain private.
- Every page render resolves workspace and current published version on the server. Invalid, malformed, expired, or consumed tokens receive the exact generic invalid response already defined by F10, with no workspace identity.
- The extended `registration_link_open(token)` creates a cryptographically unguessable, bounded-expiry render handle bound to the exact link, workspace and published version; only its hash is stored. Enforce per-link active-handle and issuance-rate caps, with exact caps set before implementation. A handle expires after the render window, but its issuance row remains as rate-limit history until it is older than the rolling five-minute issuance window; cleanup may delete it only after both conditions hold. The handle is a render capability, not a user-selected version or object id. Existing F10 open semantics remain authoritative.
- Responses, including errors, are private/no-store. No shared actor/workspace or CDN token cache.
- Publication does not alter signup authorization, input state, F10/F11 link validity, or package/workspace snapshots. An already rendered page keeps its identity until reload.

## Image proxy and Storage trust boundary

- A registration image is fetched only through the token-validating proxy. Each image request supplies the F10 token and opaque render handle to `registration_brand_asset_resolve(token, render_handle, slot)`, callable only by `branding_proxy`. The fixed slot is `logo` or `banner`.
- Resolve checks the canonical token/hash, handle hash and binding, link/workspace/version/slot, enabled credential ID and F10 open-validity predicate including consumption and strict effective deadline. The bound version must still be current; after publication advances, an older handle fails generically. The page must reload to obtain a new handle and a coherent identity/image version. Image calls never set `opened_at` or extend grace. Resolve derives the exact validated bucket/object; no client-selected asset, path, workspace, version or history selector is accepted.
- Workers use an externally pre-issued, expiring `branding_proxy` JWT and never contain the project JWT signing key. A separate enabled-credential registry supports staged enable/deploy/disable rotation and immediate emergency disable. The route does not forward client headers wholesale; it constructs only verified bearer and render-context headers.
- Storage RLS independently repeats the live token/render-binding check through `app_private.branding_storage_read_allowed(...)`. `branding_proxy_object_read` grants only `SELECT` to `branding_proxy` for the exact authenticated download operation against the validated bucket. No list, signed URL, transform, write or delete operation is granted. Reader credential, render handle, object hash and visitor token alone each fail closed.
- Return only an approved logo/banner object from the still-current authorized version. Fail generically for invalid scope, token, unavailable/deleted asset, disabled credential, missing/spoofed context or version mismatch. Buffer within approved bounds and recheck validity before emitting bytes. A publish race must never cause bytes from a deleted previous version to be served; an old handle fails and the page must reload for the new publication. Already displayed pixels may remain.
- Return private/no-store and no-referrer with sniffed content type and `X-Content-Type-Options: nosniff`; render only as an image element. Never redirect or expose upstream URLs or signed Storage URLs. Pixels already displayed may remain.
- Permit only the exact image route through middleware. Redact image paths, render handles, tokens, bearer headers and object identifiers from Cloudflare/Supabase logs, telemetry and exceptions; bypass image optimizers, shared caches, conditional/range paths and redirects unless separately proven safe.

## Verification hard gate

Before accepting proxy or validator units, prove on the pinned local stack-B version that the restricted JWT, verified headers, transaction-local/request context and exact Storage operation reach RLS as expected; missing/spoofed context and list/sign/transform calls must fail. If stack B cannot prove the mechanism, stop and return to the architect; no service-role fallback is permitted for public images. Hosted-infrastructure compatibility proof is required before Production.

## Related Worker credential context

The Worker already holds the service-role key for the PO-approved D-19 manual recovery link (authenticated, capability-scoped staff route). The restricted F14 identities limit the authority of the public unauthenticated image route if it has a bug or is abused; they do not remove that service-role key from the Worker.

## Defaults and other surfaces

- With no published customization, use workspace name, emerald-derived tokens, and no logo/banner.
- Registration and Staff Dashboard consume authorized published brand data. Client Portal is conditional on P4; F14 defines only the branding data/token contract and preview placeholder.
- Resolve authorized workspace/version per request. Do not cache across actor/workspace changes; discard late responses after a workspace switch and show neutral defaults when scope is absent.
