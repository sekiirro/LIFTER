# Contract: Public branding and image proxy

## Registration projection

- Extend the existing F10 token-validated open projection with the current published identity only. Drafts and history remain private.
- Every page render resolves workspace and current published version on the server. Invalid, malformed, expired, or consumed tokens receive the exact generic invalid response already defined by F10, with no workspace identity.
- Responses, including errors, are private/no-store. No shared actor/workspace or CDN token cache.
- Publication does not alter signup authorization, input state, F10/F11 link validity, or package/workspace snapshots. An already rendered page keeps its identity until reload.

## Image proxy

- A registration image is fetched only through a token-validating proxy. Reapply F10 open validity on every image request, including consumption, without extending grace.
- Resolve authorization and bind the asset to the published version authorized for the rendered page context. Do not accept arbitrary asset, version, workspace, or history selectors from the client.
- Return only an approved logo/banner object from that authorized version. Fail generically for invalid scope, token, unavailable asset, or version mismatch.
- Return private/no-store with sniffed content type and `X-Content-Type-Options: nosniff`; render only as an image element. No signed Storage URL is exposed. Pixels already displayed may remain.

## Defaults and other surfaces

- With no published customization, use workspace name, emerald-derived tokens, and no logo/banner.
- Registration and Staff Dashboard consume authorized published brand data. Client Portal is conditional on P4; F14 defines only the branding data/token contract and preview placeholder.
- Resolve authorized workspace/version per request. Do not cache across actor/workspace changes; discard late responses after a workspace switch and show neutral defaults when scope is absent.
