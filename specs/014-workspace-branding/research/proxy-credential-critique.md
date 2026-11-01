# Proxy credential critique

Sol Medium, read-only, 2026-10-29, accepted by architect with the context note below

---

--- codex final report ---
**PA-F14-4 A is not implementable as written:** anonymous visitors have no user JWT. `server-only` prevents client bundling; it does not narrow a credential’s privileges.

Reviewed branch `014-workspace-branding` at `5eb374bc`. No edits, services, database commands or tests were run. The recommendations below remain subject to implementation verification.

**Recommend pre-issued, restricted service identities—not runtime JWT signing.** Keep Supabase Storage, private buckets and the token-validating proxy. Provision dedicated Postgres roles and mint their expiring JWTs outside Workers. Workers receive only those restricted bearer tokens; never the project JWT signing secret.

| Option | Security and operational assessment |
|---|---|
| **1. `service_role` / secret API key** | Reject for the public proxy. Both confer `service_role` access and bypass RLS; bucket policies cannot scope them. Worker compromise threatens the project, not merely branding. Separate secret keys improve rotation, not authorization scope. Auditing application calls cannot prevent unlogged direct use. [Supabase key semantics](https://supabase.com/docs/guides/getting-started/api-keys). |
| **2. Dedicated role, JWT minted on Workers** | Reject the signing-secret placement. A stolen project signing key can mint other accepted roles/identities; the intended low-privilege JWT does not constrain its signer. **Pre-issued restricted JWTs avoid that equivalence.** [JWT signing requirements](https://supabase.com/docs/guides/auth/signing-keys). |
| **3. Anon-executable definer RPC returning an artifact** | A server-fetched signed URL is compatible with r2’s **no client-visible signed URLs** intent. However, an anon caller can invoke the RPC directly and obtain its result: calling it server-side does not make the artifact server-only. Also, SQL definer privileges do not themselves provide a supported Storage URL-signing API. A concrete signer must be identified. Leaked signed URLs remain usable until expiry; individual revocation is unavailable, and Auth-key rotation does not revoke them. [Storage URL behavior](https://supabase.com/docs/guides/storage/serving/downloads). |
| **4. Anon SELECT using request context** | Technically plausible, but conflicts with the accepted prohibition on anonymous direct Storage reads. Headers must carry verified bearer authority, never trusted workspace/version assertions. Current upstream Storage explicitly propagates headers and transaction-local request context; that is **not proof of the pinned local or hosted deployment**. [Storage request setup](https://github.com/supabase/storage/blob/master/src/http/plugins/db.ts), [database scope](https://github.com/supabase/storage/blob/master/src/internal/database/postgres/scope.ts). |
| **5. Pre-issued restricted roles + live authorization in Storage RLS** | **Recommended.** No root signing material on Workers; no anonymous Storage permission. Require the restricted reader credential **and** valid token/render context. Scope survives a proxy path-selection bug. Custom roles are supported, but exact header/operation behavior must pass stack-B and hosted compatibility gates. [Custom roles](https://supabase.com/docs/guides/storage/schema/custom-roles). |

All five can retain Supabase Storage and have no inherently required paid component. Options 3–5 add database/API work; none removes no-store image egress. Free-tier acceptance still requires measurements: Workers Free allows 10 ms HTTP CPU; Supabase Free currently includes 1 GB Storage and separate cached/uncached bandwidth allowances. Model uncached delivery conservatively and retain the 70% exit trigger. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Storage quota](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size), [bandwidth](https://supabase.com/docs/guides/storage/serving/bandwidth).

**Exact trust boundary and flow**

1. Extend `registration_link_open(token)` to atomically validate/open the F10 link, resolve the current publication and create a random opaque render handle. Store its hash bound to link, workspace, published version and deadline. Return permitted branding plus proxy URLs containing the handle and `logo|banner`; expose no selectable version/object identifier.
2. Each image request supplies its F10 token and render handle. The proxy uses its restricted reader JWT to call `registration_brand_asset_resolve(token, render_handle, slot)`.
3. That RPC checks canonical token/hash, handle binding and F10’s existing predicate—including consumption and strict effective-deadline comparison. **It never sets `opened_at` or extends grace.** It derives the exact immutable object.
4. The proxy downloads that object using the reader JWT and internally constructed token/render headers. Storage RLS independently repeats the live binding/validity check against the requested bucket/path. Client headers are not forwarded wholesale.
5. Buffer within approved limits; recheck validity before emitting bytes. Return only bytes with sniffed MIME, `nosniff`, `private, no-store` and `no-referrer`; never redirects, upstream URLs or credentials. Define authorization’s concurrency point explicitly: already authorized in-flight bytes cannot be recalled.

Only the validated bucket’s bound logo/banner is readable. Reader credentials alone, object hashes alone, and visitor tokens alone grant no direct Storage access. Missing context fails closed. **Do not ship this design until actual stack-B and hosted Storage prove the context and operation checks.**

**Required database boundary—proposed names**

All new definer functions: `SECURITY DEFINER SET search_path=''`, fully qualified references, no dynamic SQL, default EXECUTE revoked from `PUBLIC`, `anon`, `authenticated`, `service_role`; regrant only as below. Prefer a dedicated `NOLOGIN NOBYPASSRLS` owner with explicit grants/RLS policies over another postgres-owned omnipotent function.

| Function / policy | Authority |
|---|---|
| Existing `registration_link_open(text)` | EXECUTE remains `anon, authenticated`; narrowly add render-context creation. |
| `registration_brand_asset_resolve(text,text,text)` | EXECUTE only `branding_proxy`; returns derived object metadata, never client-selected paths. |
| `app_private.branding_storage_read_allowed(text,text)` | EXECUTE only `branding_proxy`; reads bounded request headers and validates credential ID, handle, F10 state, workspace/version/slot and exact object. Returns boolean only. |
| `branding_proxy_object_read` | SELECT policy only for `branding_proxy`: validated bucket + exact authenticated-download operation + helper above. No listing, signing, transformations, writes or deletion. |
| `branding_upload_begin(...)`, `branding_asset_attach(...)` | EXECUTE `authenticated`; independently enforce `manage_branding`, actor scope, upload provenance and revision CAS. |
| `branding_validation_prepare(...)`, `branding_validation_complete(...)` | EXECUTE only `branding_validator`; narrow upload-operation transitions and immutable-object validation receipts. Recheck originating actor’s current authority. |
| `branding_gc_claim(...)`, `branding_gc_finalize(...)` | EXECUTE only `service_role`; explicit workspace, bounded leases, audit and deletion-state coordination. |

`branding_proxy` and `branding_validator`: `NOLOGIN`, no superuser/BYPASSRLS/role creation or privileged memberships; only necessary schema/table/function privileges and gateway role-switch membership. No application-table reads outside approved helpers. Private context/credential/upload tables have forced RLS and no anonymous grants.

Storage operation restrictions must use verified operation context, not merely SELECT: SELECT also authorizes signing/listing paths. Supabase provides operation helpers, whose availability must be checked on the deployed version. [Operation helpers](https://supabase.com/docs/guides/storage/schema/helper-functions).

**Upload, secrets, rotation and audit**

PO/WO requests and staging uploads use the verified **user JWT**, with workspace/capability and upload-operation policies. Attachment/publication also use that JWT. **Validated promotion needs separate server authority:** letting the same user JWT insert “validated” bytes or attest validation lets a browser bypass the validator. Use `branding_validator` only after server validation, with operation-bound immutable INSERT permission; deny staff direct validated writes, overwrite and deletion.

Workers hold `BRANDING_PROXY_JWT` and `BRANDING_VALIDATOR_JWT` as separate secret bindings, plus public Supabase configuration. Their scope is the named roles/functions/policies above. Neither can mint JWTs. Secrets remain readable by executing Worker code; encrypted bindings are not runtime isolation. [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

Give each JWT a signed credential ID checked against a private enabled-credential registry. Rotate by enabling a replacement, deploying it, then disabling the old ID; emergency disable must immediately affect RPC and Storage policy checks. Audit issuance/revocation, validation transitions, privileged cleanup and bounded access decisions using credential/request IDs and outcomes—never bearer handles, tokens/hashes, headers, URLs or bytes.

GC/reconciliation runs through audited cron. Pure reconciliation does not inherently require service-role; reserve it for the existing narrowly audited background path and destructive Storage cleanup. Claim assets as deleting transactionally; attachment/publish must reject that state before Storage API deletion. SQL metadata deletion is not object cleanup.

**Replace PA-F14-4 with this PO-facing wording**

> **PA-F14-4 — Credentials for private branding Storage**
>
> **A. Restricted branding service identities; service-role remains confined to audited cron (recommended).** Approve externally issued, expiring credentials for public-image delivery and validated-object promotion. Workers hold no project JWT signing key. Image access requires live F10 validity and an opaque render-bound context enforced by database functions and Storage policies. Owner operations retain user-JWT authorization. Require stack-B and hosted compatibility proof, credential revocation/rotation, audit and direct-API bypass tests before release.
>
> **B. Project-wide privileged credential in the public proxy.** Approve an explicit architecture exception for service-role/secret-key access, acknowledging project-wide RLS bypass and compromise impact. Require separate architect review and operational controls. Not recommended.
>
> **C. Defer public image delivery and validated promotion until A is proven.** Preserve the approved Supabase Storage design; do not substitute public buckets, client-visible signed URLs or presumed anonymous user authorization.

**Required Q-M additions—future checks, not executed**

| ID | Mutation and required result |
|---|---|
| Q-M21 | Reader credential without token/context, or token/context without reader credential: deny. |
| Q-M22 | Swap token, workspace, render handle, slot, bucket or object; forge version/history fields: deny. Positive controls in both workspaces. |
| Q-M23 | Consume/expire after resolve but before Storage read; cross exact grace boundaries: deny; image calls never change `opened_at`. |
| Q-M24 | Publish between render/fetch; replay older handles: only that authorized render’s assets or generic failure. |
| Q-M25 | Reader attempts list/sign/transform/upload/delete or unrelated RPC/table access: deny. |
| Q-M26 | Drop context headers, spoof operation headers, reuse pooled connections across requests: fail closed; prove on pinned stack B and hosted Storage. |
| Q-M27 | Disable old credential ID during rotation: old RPC/downloads fail; replacement succeeds; no project-key rotation needed. |
| Q-M28 | User JWT directly promotes malformed bytes or fabricates validation receipt: deny; authorized validator succeeds. Revoke WO during upload: subsequent privileged transition/attach denies. |
| Q-M29 | Race GC against attach/publish/restore: referenced assets survive; deleting assets cannot acquire new references; retries recover. |
| Q-M30 | Inspect HTML/RSC/network/errors/logs, cache/conditional/range paths and upstream redirects: no credential leakage, cache bypass or unauthorized bytes. |

**Other security gaps, with fixes**

1. **Render context is only conceptual:** specify unguessability, hashed storage, link/version binding, expiry, bounded creation and deletion.
2. **Validation provenance is unenforced:** require validator-only receipts and deny browser promotion.
3. **GC has a check/delete race:** introduce transactional deletion claims shared with every reference-creating operation.
4. **Forced RLS does not constrain postgres-owned definers:** specify owners, grants and explicit predicates; audit every bypass.
5. **PO scope wording is inconsistent:** “actual membership” must exempt PO global authority while WO requires active membership.
6. **Proxy middleware integration is unspecified:** permit only the exact image route, preserving F10 generic behavior and privacy headers.
7. **Bearer leakage controls are incomplete:** redact new image paths/headers across Cloudflare, Supabase, telemetry and exceptions; bypass image optimizers/shared caches.
8. **Existing privilege drift undermines the claimed boundary:** `lib/auth/recovery-link.ts` already uses `createAdminClient()` outside cron, and `readServerEnv()` requires `SUPABASE_SERVICE_ROLE_KEY` even for session clients. Resolve/document that separately and split environment readers; F14 must not inherit that requirement.
--- end report ---


## Architect context note (2026-10-29; not part of the verbatim critique)

The Worker already holds the service-role key for the PO-approved D-19 manual recovery link (authenticated, capability-scoped staff route). Option A limits what the public unauthenticated image route can do if it has a bug or is abused; it does not remove the service-role key from the Worker. The restricted identity proposal is the architect's adopted technical direction, subject to PO choice in PA-F14-4 and the pinned stack-B/hosted compatibility gates.
