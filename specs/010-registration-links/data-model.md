# Data Model: Registration Links (P1-F10)

Normative requirements: [spec.md](spec.md). One future additive forward migration, `supabase/migrations/20261030120000_registration_links.sql`, ordered after F9. Never edit committed migrations. Extend the latest complete audit body from `20261029120000_packages.sql`. No capability or role-matrix change, no catalog seeds or F11 account tables.

## Registration link

`public.registration_links`; UUID PK `id` default `gen_random_uuid()`, UNIQUE `(workspace_id,id)`. All fields NOT NULL except explicitly NULL below.

| Column             | SQL type         | Rule                                                                                                        |
| ------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| workspace_id       | uuid             | FK workspaces(id), ON DELETE RESTRICT                                                                       |
| id                 | uuid             | Global PK; tenant-composite unique                                                                          |
| package_version_id | uuid             | FK `(workspace_id,package_version_id)` → package_versions(workspace_id,id), ON DELETE RESTRICT              |
| token_hash         | text             | UNIQUE globally; exactly 64 lowercase hex characters, SHA-256 of encoded token string; never SELECT-granted |
| created_by         | uuid             | FK staff_profiles(user_id), ON DELETE RESTRICT; auth.uid() of issuing actor                                 |
| created_at         | timestamptz      | Server transaction time, default now()                                                                      |
| expires_at         | timestamptz      | Server assigned created_at + interval '24 hours'; equality CHECK, never configurable                        |
| opened_at          | timestamptz NULL | Initially NULL; first open only, strictly before expires_at; immutable after set                            |
| consumed_at        | timestamptz NULL | Initially NULL; set once by future F11 signup transaction only                                              |
| price_minor        | bigint           | Positive; exact copy of approved version                                                                    |
| currency           | char(3)          | Copy version's uppercase three-letter code                                                                  |
| duration_days      | integer          | Positive copy of version                                                                                    |
| duration_months    | smallint NULL    | Existing version preset or NULL custom; preserve D-11 representation                                        |
| commission_rate_bp | integer          | Copy version's 0..10000 basis points; no general SELECT grant                                               |

Derive offer_id from the immutable, same-workspace version. This avoids redundant offer identity; issuance audit includes it. Link insert guard verifies capability, NULL markers, server attribution/time, available + current source version, and exact snapshot equality, including NULL-aware duration_months comparison. It locks the scoped offer during snapshot validation, coordinating with F9's publish/toggle row locks. No user-supplied price/rate/creator/deadline is accepted by RPC. Base constraints mirror version positivity/currency/duration/rate validity; copy comparison is the source of truth. A foreign version is rejected by the composite FK even with privileged DML used for integrity probes.

Indexes: hash UNIQUE for open lookup, `(workspace_id,created_at DESC,id)` for deterministic recent list, `(created_by,created_at DESC)` for rolling actor counts, existing composite unique for children. No token-path index or raw token storage.

## Installment rows

`public.registration_link_installments`:

| Column          | Type             | Rule                                                                                            |
| --------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| workspace_id    | uuid NOT NULL    | Tenant scope                                                                                    |
| link_id         | uuid NOT NULL    | Composite FK `(workspace_id,link_id)` → registration_links(workspace_id,id), ON DELETE RESTRICT |
| seq             | integer NOT NULL | >= 1; PK `(workspace_id,link_id,seq)`                                                           |
| amount_minor    | bigint NOT NULL  | > 0                                                                                             |
| due_offset_days | integer NOT NULL | >= 0                                                                                            |

No currency repetition: currency belongs to immutable parent. Offsets are snapshotted day offsets only; F10 does not choose an activation anchor or materialize calendar due dates.

No rows means one full payment. For n>0, sequences are exactly 1..n, offsets strictly increase when ordered by seq, SUM(amount_minor) equals parent price_minor exactly. Use numeric accumulator to avoid bigint-sum overflow; compare exactly before converting any individual amount to bigint. No count cap, offset policy cap or offset-zero requirement. Technical int maximum is 2147483647; bigint positive maximum 9223372036854775807; these are storage constraints, not approved commercial bounds.

### Integrity and transaction rules

- RPC validates full array before writing and inserts parent and children in a single transaction.
- `app_private.validate_registration_link_schedule(ws,link)` checks committed shape/total; internal only, fully qualified objects, empty search path. Zero rows is valid full payment.
- Deferred INITIALLY DEFERRED constraint triggers on parent INSERT and child INSERT validate the whole schedule at commit. This catches a bad final total/order even when callers can perform privileged fixture DML. No trigger may silently remove or normalize bad rows. Application can't issue `SET CONSTRAINTS` through the RPC.
- A child BEFORE INSERT guard requires both parent markers still NULL and verifies parent tuple xmin belongs to the current transaction, using the current backend's granted exclusive transaction-ID locks (including live subtransactions) in pg_catalog.pg_locks. The parent UPDATE guard below rejects no-op UPDATEs, so an older unopened parent cannot acquire a fresh xmin without setting a marker; populated markers then forbid child insertion. This combination establishes creation-transaction provenance without another stored field. Do not use timestamp equality or a caller-settable custom GUC. Tests must attempt the no-op-update-then-insert bypass as well as insertion after a later first-open. It rejects late schedule extension even when other row validations would pass.
- Parent insert/child invariants and all UPDATE/DELETE/TRUNCATE guards apply to postgres/service_role DML as well as application roles under installed guards. No exceptions for staff role, mutable bypass flag or row owner. Superuser DDL disabling guards is outside application threat boundary, exercised only in reviewer mutation tests.

## Immutability and marker transitions

`app_private.guard_registration_link_update()` is BEFORE UPDATE. Compare every field other than opened_at/consumed_at with OLD using IS DISTINCT FROM; reject any changed immutable field (`23514`). Any changed marker must be OLD NULL → NEW non-NULL and server-assigned transaction time; setting NULL, replacing a timestamp or changing both markers together in F10 is rejected. First-open also requires unconsumed row and now() < expires_at. SQL open conditionally updates only when opened_at IS NULL; repeated open performs no UPDATE. Already populated markers may be unchanged in an otherwise valid transition, e.g. F11 setting consumed_at after opening.

Consumed transition is reserved by lack of API UPDATE grants and absence of an F10 consumption RPC. Its generic guard permits a valid NULL-to-now transition for the future trusted F11 RPC, with unconsumed/time-valid predicate independently repeated there. No staff role can set consumed_at directly. Tests use privileged synthetic transitions to establish future compatibility and prove overwrite/clear rejection; they do not add F11 behavior. No audit event for consumed-only changes is invented.

Reuse forbid_delete for parent/child DELETE and statement TRUNCATE guards; child UPDATE uses unconditional immutable guard. Reject parent no-op UPDATE as an unsupported mutation, producing no business audit; legitimate repeated open never issues an UPDATE. This prevents tuple-xmin refresh from bypassing child creation-transaction provenance. Tests distinguish lack of grants from guard protection by rollback-scoped temporary grants / privileged DML. FK rejection must not substitute for DELETE/TRUNCATE guard proof.

## RLS, projections and grants

Both tables ENABLE and FORCE RLS, postgres owner. Start with REVOKE ALL from PUBLIC, anon, authenticated, service_role. No direct write grant or mutation policy. Staff SELECT policy on each table uses `app_private.has_workspace_access(workspace_id,'generate_registration_link')`; child scope is protected both by policy and FK. Unavailable/newer-version offers do not hide the historical link or invalidate it.

| Surface                                              | Allowed result                                                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| registration_links base explicit safe columns        | Authenticated staff in scope; column SELECT on workspace_id,id,package_version_id,created_by,created_at,expires_at,opened_at,consumed_at,price_minor,currency,duration_days,duration_months only |
| registration_links_safe                              | `security_invoker=true`; same columns, price_minor::text; no hash or commission column; grant SELECT authenticated only                                                                          |
| registration_link_installments base                  | Safe columns under scoped RLS, no secrets                                                                                                                                                        |
| registration_link_installments_safe                  | `security_invoker=true`; workspace_id,link_id,seq,amount_minor::text,due_offset_days; SELECT authenticated only                                                                                  |
| get_registration_link_commissions(workspace_id uuid) | Authenticated PO/WO only, generation capability + active scope; rows `{link_id,commission_rate_bp}`                                                                                              |
| registration_link_open(token text)                   | anon + authenticated; one narrow result only                                                                                                                                                     |

Never grant full parent-table SELECT, even to authenticated PO/WO (shared SQL role). Wildcard, explicit hash/commission, embedded reads and alternate definer functions must not leak. Base bigint raw-number transport is not used by TS; exact safe text views are required. Gated reader is postgres-owned SECURITY DEFINER, empty search_path, explicit role + workspace access before lookup. Missing/foreign scope failures generic; no token_hash reader exists for any staff role. Existing audit read policies remain unchanged.

All new functions have fully qualified references and empty search_path, owner postgres; REVOKE EXECUTE from PUBLIC/anon/authenticated/service_role first. Regrant only public issuance/commission to authenticated and public open to anon/authenticated. Private helper/trigger functions are not directly executable through API. No browser admin client or service-key application path.

## Issuance transaction

`public.issue_registration_link(workspace_id uuid, package_version_id uuid, token_hash text, installments jsonb) RETURNS uuid`, SECURITY DEFINER. SQL NULL allowed only for installments. Named JSON RPC arguments remain exactly as binding design.

1. Require auth.uid(), generation access in the selected real workspace; if installments IS NOT NULL independently require configure_installment_schedule before parsing or version lookup. Unauthorized/missing workspace returns `42501/not_permitted`; never disclose stale state before authorization.
2. Lock per-actor advisory transaction key (distinct F10 namespace, global across actor workspaces). Read limits from the sole `app_private.registration_link_limits()` function; count successful link rows in rolling window. Limit exceeded → controlled `unavailable`; no insert.
3. Resolve the requested same-workspace version; foreign/unknown version returns `42501/not_permitted`. Derive and lock its offer by `(workspace_id,id)` FOR UPDATE. Require available AND current_version_id = package_version_id; otherwise raise `22023/stale_terms` (R10-1). Validate/copy that exact version, with no rows/events on failure.
4. Validate hash, schedule JSON shape and exact total against that exact version price. JSON row shape exactly `{seq:integer,amount_minor:decimal-string,due_offset_days:integer}`, explicit ordered contiguous seq. No sparse/null/object rows, coercion, extra financial/source fields or empty array. Controlled errors → `22023/invalid_input`.
5. Insert link copying version fields, creator/time and deadline, then child rows. INSERT ON CONFLICT on the hash constraint returns no row for a duplicate, then raises generic unavailable without constraint/provider echo. Avoid returning a parent from an exception subtransaction, so creation-transaction provenance remains independently testable. Deferred validation/audit must succeed at commit; return UUID only after RPC success. Any failure rolls back all rows/events.

Lock ordering: actor advisory key → offer row → new link/children. F9 never takes F10 actor locks, avoiding cycles; concurrent distinct actors serialize only on shared offer while selecting terms. No concurrency limit override. Hash replay cannot mint another link. No new idempotency argument or stored raw response.

### Single rate-values function

`app_private.registration_link_limits() RETURNS TABLE(per_actor integer, win interval)`, immutable private function. Sole numeric policy placeholder location: `20`, `interval '1 hour'`, each explicitly commented `ND-F10-3: LOCAL/DEV PLACEHOLDER, NOT PO-APPROVED; PRODUCTION BLOCKER`. These reuse F4's technical actor placeholder only; do not inherit target/IP limits. Tests override/restore this function only in disposable DB to prove boundaries without prescribing a policy. Future PO decision changes it through a new forward migration.

## Open and shared time contract

`public.registration_link_open(token text) RETURNS jsonb`, SECURITY DEFINER VOLATILE. EXECUTE anon/authenticated. Syntactically canonical generated tokens have 43 base64url characters representing 32 bytes; malformed/NULL input returns the same invalid result without echo. Hash encoded text using `encode(extensions.digest(token,'sha256'),'hex')`. Select matching link FOR UPDATE to coordinate first open and F11 consumption. Unknown returns `{"status":"invalid"}`.

Private pure SQL predicate `app_private.registration_link_is_valid(expires_at timestamptz,opened_at timestamptz,consumed_at timestamptz,at_time timestamptz)` mirrors the TS function. It is not granted publicly. No injected clock is accepted by the public RPC.

```text
valid_until = expires_at
if opened_at != NULL and opened_at < expires_at:
    valid_until = max(expires_at, opened_at + 30 minutes)
valid = consumed_at == NULL and now < valid_until
```

For a found row: reject consumption; if opened_at NULL, require now() < expires_at then set opened_at=now() once (guard + conditional predicate); otherwise evaluate existing pre-expiry marker. Return only `{"status":"valid","workspace_name":<workspaces.name>}`. No workspace id, slug, timing, link id, price or internals. This workspace name is the explicitly authorized anonymous projection, not general workspace SELECT. All unusable links have identical payload/status behavior; no timing-constant lookup claim is made. Error adapters also return generic invalid without provider details.

TS `lib/registration-links/grace.ts`: pure `registrationLinkValidity({expiresAt,openedAt,consumedAt}, now)` using injected epoch milliseconds and strict finite/date validation, returns internal `{valid,validUntil}`. `now` must be explicitly supplied. Treat malformed/post-expiry first-open data as not eligible for grace; a consumed marker always dominates. Public payload never contains this internal deadline. SQL can preserve microseconds; shared fixtures use exact millisecond instants and integration separately checks strict SQL microsecond boundaries.

Table fixtures, all relative to expiry E (unconsumed unless stated):

| opened_at                | now               | Expected                                                |
| ------------------------ | ----------------- | ------------------------------------------------------- |
| NULL                     | E−1ms             | valid; first open may set marker                        |
| NULL                     | E / E+1ms         | invalid, marker stays NULL                              |
| E−2h                     | E−1ms / E         | valid / invalid (no shortening, no automatic expiry+30) |
| E−10m                    | E+19m59.999s      | valid                                                   |
| E−10m                    | E+20m / E+20m+1ms | invalid / invalid                                       |
| E                        | E+1ms             | invalid (not opened strictly before)                    |
| E+1m                     | E+2m              | invalid (corrupt late-open must not gain grace)         |
| E−10m, consumed non-NULL | E−1m / E+1m       | invalid / invalid                                       |

## Audit extension

Preserve the full latest F9 body and permissions of `app_private.audit_row_change()`.

| Trigger                                                                 | Action / details                                                                                                                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deferred constraint AFTER INSERT on registration_links, once per parent | `registration_link.issued`; `{package_version_id,offer_id,installment_count,price_minor:NEW.price_minor::text,currency}`; count children at deferred execution, no commission/hash/token |
| AFTER UPDATE on registration_links                                      | Only OLD.opened_at NULL and NEW.opened_at non-NULL → `registration_link.opened`, `{}`; all other allowed changes return without event                                                    |

Both set target_table registration_links, target_id NEW.id, workspace_id NEW.workspace_id; issued actor auth.uid() staff, anonymous open actor NULL (authenticated open may have auth.uid()). No other workspace data or token in details. No child trigger, no manual duplicate audit insert. Audit is transactional; failure rolls back markers/issuance. Existing no-op, job/recovery and F9 audit behavior remains intact.

## F11 consumption boundary — documentation only

The future signup RPC resolves/locks the link internally, validates signup and snapshot-bound workspace/package, and executes the equivalent of:

```sql
UPDATE public.registration_links AS l
SET consumed_at = now()
WHERE l.id = resolved_link_id
  AND l.workspace_id = resolved_workspace_id
  AND l.consumed_at IS NULL
  AND app_private.registration_link_is_valid(
    l.expires_at, l.opened_at, l.consumed_at, now())
RETURNING l.id;
```

Account creation, validation and this guarded claim are one transaction; zero returned rows is generic invalid, all later failures roll back consumption. Concurrent claims yield at most one success. Copy immutable terms/schedule into future subscription snapshot without re-reading current offer. D-08 duplicate handling/attempt limits belongs to F11; failed duplicates do not consume. No standalone consume endpoint or signup implementation is authorized in F10.
