# Implementation Plan: F11 — Client accounts + signup

**AD-F11-1: NEEDS SOURCE CONFIRMATION — PENDING PO — architect recommendation: option (i).** All option-(i) schema, RPC, hashing, compatibility and proof details below are conditional proposals, blocked on AD-F11-1 (PENDING PO). C1–C4 are **proposed evaluation criteria**, not approved conditions; no implementation or hosted proof is claimed. Option (ii) analysis remains in research.md. ND-F11-1..10 are Decided (PO, 2026-10-28); the verbatim decisions and explicit open sub-decisions are in [spec.md](spec.md#po-decision-register-and-open-sub-decisions).

**Branch**: `011-client-accounts` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Base for this U3 handoff**: `a7cea30`. User-authorized design decision recording and Spec Kit tasks only. Independent architect review owns acceptance. No implementation approval, migration, application/dependency/capability change, seed, cloud operation or deployment.

## Summary

Add bounded public signup to F10's link route: one Auth-linked client, immutable issued-snapshot association, globally unique canonical identifiers, guarded single consumption and safe transactional audit. Failed signup cannot leave a usable orphan Auth user. Create pending-approval with no client access; approval action scope remains ND-F11-6a. No subscription, activation, payment or plan access.

## AD-F11-1 — NEEDS SOURCE CONFIRMATION — PENDING PO — architect recommendation: option (i)

The architect recommends same-transaction direct `auth.users`/`auth.identities` writes in a hardened SECURITY DEFINER signup function. PO has not selected this mechanism. Option (ii) analysis remains in research R4–R5. Dependent tasks are blocked on AD-F11-1 (PENDING PO). C1–C4 below are **proposed evaluation criteria**, not approved conditions; proofs have not run.

- **C1 Fail-closed compatibility guard**: before any write, the signup function verifies the latest `auth.schema_migrations` version against an explicit allowlist captured from local GoTrue v2.197.0, plus the presence/types of every column it writes. Mismatch → generic unavailable (HTTP 503), nothing written, link not consumed. Guard before admission redemption as well as Auth/client writes. The admission RPC also guards before its own write. Actual version/column values must be captured locally, never guessed. Trace: T002–T005, T015, T041.
- **C2 Real sign-in proof**: integration tests (a) sign in via real local GoTrue (`signInWithPassword`) with a signup-created account and (b) diff signup-created `auth.users`/`auth.identities` rows against a GoTrue-admin-created reference user on every GoTrue-set column. Only ids, timestamps, hashes, email/phone values may differ; normalize those values explicitly, including nested identity references, and compare all other values. Both must pass. Trace: T016–T018, T039–T041.
- **C3 Password handling**: bcrypt via `extensions.crypt(..., extensions.gen_salt('bf', <GoTrue cost>))`; capture the actual local GoTrue cost rather than inventing one. Plaintext never appears in exceptions/RAISE text, audit, logs, receipts or return values. Server code calls the signup RPC with the anon/publishable key only, never the service-role key; no service-role key reaches the browser. A server-only local test harness may use admin credentials solely to create the reference control, not call signup. Existing F4 admin use remains separate. Trace: T010–T018, T023–T026, T040–T042.
- **C4 Hosted-compat production blocker**: "Option (i) verified on local stack only; hosted Supabase Auth version/DML permission and upgrade allowlist must be re-verified before any deployment (PO approval)". No cloud operation is authorized. Local proof remains outstanding until C1–C3 tests pass. Trace: T001, T039, T043, T046.

Local read-only evidence: GoTrue **v2.197.0** (`auth version`), PostgreSQL **17.11**, pgcrypto in `extensions`, postgres Auth DML rights, generated identity-email/confirmed timestamp columns, partial email and provider-ID indexes. CLI **2.122.0** is not GoTrue's version. No Auth writes/sign-in/cleanup tests in U2.

## Technical Context

| Item             | Existing stack / design constraint                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Language/version | TypeScript 6.0.3, Node 24, Next.js 16.4.3 App Router, React 19.3.1                                                               |
| Dependencies     | supabase-js 2.118.0, supabase/ssr 0.12.7, server-only; no dependency changes                                                     |
| Storage          | Local Supabase PostgreSQL 17.11; future additive migration after `20261030120000_registration_links.sql`; none created now       |
| Testing          | Vitest unit/integration, signed/anon fixtures, Playwright/axe, catalog/grant parity and mutations                                |
| Platform/type    | Existing web app, Cloudflare Workers/OpenNext 1.20.13; HTTPS RPC/API, no native bcrypt addon or DB socket                        |
| Performance      | Indexed token/canonical keys; same-link serialization; authoritative time after waits; no invented latency/volume target         |
| Scope            | Account, snapshot binding, consumption, audit and F4 dependency only                                                             |
| Constraints      | $0 direction, never log secrets/PII, no-store/no-referrer, unchanged capabilities, no browser service key                        |
| Unknowns         | ND-F11-1..10 decided with explicit sub-decisions below; AD-F11-1 PENDING PO with proposed C1–C4; no inferred source confirmation |

## Constitution Check

Gate checked before research and after Phase 1 against v1.1.0:

| Principle           | Pre-research / post-design assessment                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I isolation         | Required / designed: tenant workspace and composite FKs, independent app admission/DB guard, forced RLS/default deny, foreign-negative tests. Global claims are private identity security infrastructure. |
| II financial truth  | Required / preserved: immutable issued terms; no finance/refund/commission effects.                                                                                                                       |
| III governance      | Required / designed: no role/capability/membership changes; D-08 global uniqueness/generic errors; D-16 identity separation.                                                                              |
| IV approved scope   | Required / conditional: ND-F11-1..10 decided; explicit sub-decisions and AD-F11-1 PENDING PO; no invented policy; implementation readiness ERROR until resolved.                                          |
| V versioning        | Required / designed: issued link/version reference, no current-offer reread, no activation.                                                                                                               |
| VI people decisions | Required / preserved: no assignments, compensation or personnel effects.                                                                                                                                  |
| VII privacy         | Required / conditional, C1-proposal NEEDS SOURCE CONFIRMATION / PENDING PO: hashed receipts/tokens, safe append-only audit, token-safe POST/headers; retention/B4 open.                                                                                          |
| VIII UI             | Required / planned: existing DS, Arabic-first RTL/English LTR, dark/light, keyboard/labels/pending/error; no package disclosure.                                                                          |
| IX reliability      | Required / designed: explicit locks, constraints, consume-time check, atomic audit, replay receipt; Auth proof outstanding.                                                                               |
| Platform            | Required / preserved: existing Cloudflare/Supabase, local only, forward-only future migration, existing backup/restore gates.                                                                             |
| Workflow            | Required / conditional: explicit user authorization for Codex U2 planning; prior U2 research retained; user-authorized U3 decision/tasks; independent Claude audit/Analyze and no self-approval.          |

**Result:** Design artifacts complete; **ERROR / blocked for implementation readiness** under the skill's unresolved-clarification gate. C1–C4 proof obligations, open sub-decisions and AD-F11-1 PENDING PO and architecture parity proofs are not waived. No constitutional exception approved/requested. This is not an application test pass or production acceptance.

## Phase 0 — Research

[research.md](research.md) records source precedence, actual local Auth catalog/version, both AD candidates, uniqueness, public two-wall admission, authoritative time, F4 and risks. Technical unknowns have evidence or explicit blocking proof obligations. Only explicitly unresolved business details remain open. No interactive input or implicit policy answer.

## Phase 1 — Design and transaction boundary

Normative schema/grants/audit: [data-model.md](data-model.md). Public payloads, admission, middleware and F4: [contract](contracts/client-signup-surface.md). Verification: [quickstart.md](quickstart.md).

**Lock order (verbatim contract):** `link row FOR UPDATE → validity with authoritative clock_timestamp() after lock → request/ticket redemption (pre-admitted in a separate transaction) → canonical uniqueness locks in sorted key order and DB constraints → Auth identity/claim writes → client insert → guarded consume with fresh authoritative time → receipt and audit → deferred checks → COMMIT`.

**Transaction boundary (verbatim contract):** `Client insert + guarded registration-link consumption + successful-change audit (including deferred checks) + Auth user/identity + canonical claims + committed receipt commit in one database transaction; any failure rolls all signup effects back. Durable admission is separate; one-use ticket redemption precedes the inner signup subtransaction and business failures commit redemption without signup effects; infrastructure failures roll back redemption and return unavailable.`

Admission accounting commits durably before expensive work, with advisory link-key then ip-key locks separate from signup row locks. C1 runs before any write in each RPC. Redeem the one-use ticket outside the inner signup subtransaction; force deferred checks inside it. Every consumed-link retry is generic invalid, even with the same request secret after response loss. Receipts are internal dedup evidence only. Consumption uses fresh authoritative time after hashing/lock waits. No provider HTTP, reservation, pending gate, compensation or reconciliation is in the recommended, PO-pending signup design.

## Open-decision seams

Exactly one owner per ND. All base ND-F11-1..10 are **Decided (PO, 2026-10-28)**; verbatim text is in the [spec register](spec.md#po-decision-register-and-open-sub-decisions). The blocker column is true only where something remains open; technical design/proof is not claimed complete. ND-F11-4a blocks public-page alignment, not strict signup consumption; ND-F11-7's blocker concerns other audit retention.

| Seam                                           | ND        | Decided value / open sub-decision                                                                                             | Production-blocker y/n |
| ---------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `signup_password_policy()`                     | ND-F11-1  | Decided: minimum 8 characters including number and symbol; ND-F11-1a open                                                      NEEDS SOURCE CONFIRMATION | y                      |
| `app_private.signup_identity_normalization()`  | ND-F11-2  | Decided: Supabase Auth email rules and E.164 phone                                                                            | n                      |
| `signup_field_contract()`                      | ND-F11-3  | Decided: required name/email/phone/password; no Telegram                                                                      | n                      |
| `app_private.signup_consumption_policy()`      | ND-F11-4  | decided: strict, no grace; ND-F11-4a public-page alignment open                                                                NEEDS SOURCE CONFIRMATION | y                      |
| `app_private.client_signup_limits()`           | ND-F11-5  | Decided: 5/link/15 minutes AND 30/IP/hour; ND-F11-5a open (NEEDS SOURCE CONFIRMATION); AD-F11-2 architect decision                                                         NEEDS SOURCE CONFIRMATION | y                      |
| `signup_completion_policy()`                   | ND-F11-6  | Decided: pending-approval, no client access; ND-F11-6a and ND-F11-6b open                                                                 NEEDS SOURCE CONFIRMATION | y                      |
| `app_private.signup_retention_policy()`        | ND-F11-7  | Decided: signup-attempt logs without IP/ip_key retained 30 days; window-lived HMAC counters separate; other audit retention undecided (NEEDS SOURCE CONFIRMATION) (ND-F5-1/B4 unchanged)  NEEDS SOURCE CONFIRMATION | y                      |
| `signup_authenticated_visitor_policy()`        | ND-F11-8  | Decided: prompt manual sign-out; no auto sign-out/linking/merge or token redirects                                            | n                      |
| `app_private.signup_identifier_scope_policy()` | ND-F11-9  | Decided: DB uniqueness active/pending; archived D-08/admin review, ND-F11-9a and ND-F11-9b open                                           NEEDS SOURCE CONFIRMATION | y                      |
| `app_private.client_signup_audit_contract()`   | ND-F11-10 | Decided: structured attempt/success/failure/consumption/cleanup without secrets; names/payload allow-list technical design    | n                      |
| Auth architecture | AD-F11-1 | NEEDS SOURCE CONFIRMATION — PENDING PO; option (i) recommendation only; C1–C4 proposed | y |
| Privacy proposal | C1-proposal | NEEDS SOURCE CONFIRMATION — PENDING PO; no IP logs, window-lived HMAC counters | y |
| Trusted IP/admission | AD-F11-2 | Architect decision; CF-Connecting-IP, attestation, link-key then ip-key admission locks; privacy approval/proofs outstanding | y |

Enforce both limits with durable admission accounting and attempt/failure evidence independent of signup rollback. Trusted client-IP source is AD-F11-2 (technical ND-F11-5b), never an arbitrary caller IP. Attempt logs contain no IP/ip_key; HMAC counters expire at window end (+ small slack), subject to C1 privacy proposal PENDING PO / NEEDS SOURCE CONFIRMATION. Cleanup events do not inherit a decided retention period for other audit logs.

Signup requires authoritative consumption time strictly before `expires_at`, no grace. F10 open/grace behavior and contract remain unchanged: a post-expiry grace open may render valid while signup returns generic invalid. Public-page alignment is ND-F11-4a and would require PO-approved F10 change. Approver roles/action scope and destination/session are ND-F11-6a/6b; no approval UI or interim client view is invented. Archived behavior is blocked pending absent state definition via ND-F5-1 closure (ND-F11-9b), with review mechanism/reviewer ND-F11-9a open. D-16 and inherited gates remain unchanged.

## AD-F11-2 — architect decision: trusted IP and admission

Technical architect decision, not PO policy approval. The whole C1 privacy proposal below is **NEEDS SOURCE CONFIRMATION / PENDING PO**. AD-F11-1 remains PENDING PO; option (i) is a recommendation and C1–C4 are proposed evaluation criteria.

- On the Worker request trust only `CF-Connecting-IP` set by the Cloudflare edge; ignore `X-Forwarded-For` and all other IP headers. Absent in a production build → `unavailable` (fail closed). Local/test only: an explicit test-only override gated by a non-production flag. Test that it is never active in `build:edge` production output.
- The server action computes `ip_key = HMAC-SHA256(SIGNUP_RATE_KEY, normalized_ip)`. The secret is server-only, local value in `.env.local`, never sent to the browser or logged. Raw IP never leaves the server action and is never stored. Compute `link_key = HMAC-SHA256(SIGNUP_RATE_KEY, token_hash)` even for unknown/malformed links, with no link-row dependency or stored token hash.
- The anon-callable admission RPC cannot trust a supplied ip_key. Send `attestation = HMAC(SIGNUP_ATTEST_KEY, ip_key ‖ link_key ‖ issued_at ‖ nonce)` with shared unambiguous canonical encoding. DB verifies the same key held in Supabase Vault (local) / private schema, freshness ≤ 60 s, no future-issued timestamp and single-use nonce. Missing/invalid attestation or replay → generic `invalid`, no counter credit or ticket (no oracle). Attestation infrastructure failure → `unavailable`. DB independently verifies token-to-link_key binding and enforces per-link limits regardless of caller ip_key; forged attribution cannot bypass it.
- Counter storage: `app_private.signup_rate_counters(scope ∈ {link, ip}, key bytea, window_start, count, expires_at)`, no workspace/link FK, forced RLS, no grants. Advisory xact locks in fixed order: link key, then ip key, inside the separate admission transaction that commits before signup. Enforce both 5/link/15 min and 30/IP/hour across links/workspaces. What counts as an attempt and rolling versus fixed windows remain **ND-F11-5a — NEEDS SOURCE CONFIRMATION**, behind `client_signup_limits()`.
- Counter rows expire at window end (+ small slack); purge opportunistically on each admission and by the local purge job. Their retention is not 30 days. Keep private nonce/ticket security state separate from logs, forced RLS/no grants; nonce replay protection spans the freshness bound and ticket one-use integrity survives counter/log purge.
- `app_private.client_signup_attempts` stores outcome class, timestamp, and link_id/workspace_id ONLY when the link resolved (both NULL otherwise; same-workspace composite relation when present). No IP, ip_key, token, token hash, email/phone/name, or credentials. Retain 30 days (ND-F11-7). Failure evidence (ND-F11-10) is written here in the admission transaction independently of signup rollback. For a failure discovered after the initial admission committed, use a separate admission/evidence transaction after rollback; do not claim to amend an already committed transaction. Success/consumption evidence remains atomic with signup.

## Infrastructure-failure contract (I1)

Only infrastructure failures produce `{status:'unavailable'}`: DB unreachable, C1 Auth-compat guard failure, admission-attestation infrastructure failure (including absent trusted IP in production), or unexpected exception after rollback. HTTP 503, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`; generic English “Please try again later.” / Arabic “يرجى المحاولة مرة أخرى لاحقًا.” only, with no cause. Nothing is consumed on unavailable, including the link or admission ticket; roll back redemption on this path. Previously committed admission accounting remains durable.

Never derive unavailable from link or identity state: unknown/malformed/expired/consumed links, invalid attestation and exhausted limits stay `invalid`; valid-link identity collisions stay D-08 `duplicate`. Unresolved policy blocks implementation/configuration rather than creating a link/identity unavailable branch. F10 GET `/register/[token]` open contract, including `{status:'invalid'}`, is unchanged. UI retains the form for a later retry and never claims completion. Enumerate link/identity branches in tests and prove none selects unavailable.

## C1 privacy proposal — PENDING PO approval

**C1-proposal — NEEDS SOURCE CONFIRMATION.** The whole privacy design above (no IP in logs; short-lived HMAC-keyed counters with automatic expiry) is pending PO approval. This is evaluation only, distinct from the proposed Auth C1 compatibility criterion; it does not approve AD-F11-1 or amend the Constitution.

Constitution VII (verbatim):

> - Client health, fitness and personal data MUST be least-privilege, never written to logs, and
>   every access to sensitive actions and exports MUST be audited.
> - Audit history MUST be append-only and tamper-resistant. The client timeline is a curated
>   projection, not the audit log.
> - Account closure MUST deactivate access and pseudonymize PII while keeping the legally required
>   ledger and audit records.
> - Reset, registration and Telegram link tokens MUST be hashed, expiring and single-use.
> - Production with real client data MUST NOT start until the jurisdiction/retention values (B4)
>   are confirmed.

Constitution IV (verbatim):

> - Unknown values MUST be marked NEEDS SOURCE CONFIRMATION, never guessed.

**Compliance verdict:** The proposal treats mutable aggregate enforcement counters with window-bounded expiry as operational state rather than event logs. That classification requires PO confirmation; the Constitution does not explicitly settle it. If classified as logs, ip_key storage conflicts with VII and implementation remains blocked. A keyed HMAC of IP remains pseudonymous personal data, not anonymous data, because it enables correlation within a key lifetime. Excluding IP/ip_key from attempt/audit logs supports VII, but this does not establish unconditional compliance or an approved exception.

Residual risk: key compromise plus the small IPv4 space permits brute-force reidentification; reused keys enable correlation. Mitigations: separate server-only rate and attestation secrets, private DB key storage, least privilege/forced RLS/no grants, no keys or IP in browser/logs, key rotation with retirement of expired counter keys, retention ≤ the applicable window (only small purge slack), and automatic/opportunistic/local expiry. Rotation must not reset effective limits or grant extra attempts. ND-F11-5a, other-audit retention and B4 remain NEEDS SOURCE CONFIRMATION. PO approval is required before implementing this privacy design.

## Project Structure

Documentation: `specs/011-client-accounts/{plan,research,data-model,quickstart}.md`, `contracts/client-signup-surface.md`; spec/checklist updated for PO decisions in U4. [tasks.md](tasks.md) supplies the phased test-first implementation handoff; execution requires later authorization and Analyze/review.

Future paths (not created/edited now): additive `supabase/migrations/<next>_client_accounts.sql`; `lib/client-accounts/` server-only admission/orchestration and pure contracts; `app/register/[token]/` form/action; middleware; existing AR/EN messages/DS; unit/integration/e2e. F4 lookup extension is future forward migration, not F4 policy changes.

## Complexity Tracking

No approved constitutional violation. Narrow definer public admission follows F10 and needs architect review; forced RLS cannot constrain a BYPASSRLS owner. Private global claims are needed for cross-table uniqueness. Direct Auth writes trade upgrade coupling for one rollback boundary; the API alternative remains documented in research only. Option (i) is PENDING PO; C1–C4 are proposed evaluation criteria. Never substitute broad anon policies, caller scope, fabricated roles or general service-role DML.

## Production blockers

Option (i) verified on local stack only; hosted Supabase Auth version/DML permission and upgrade allowlist must be re-verified before any deployment (PO approval)

C1–C3 local proofs are future obligations, not completed verification. Open sub-decisions, AD-F11-1 PENDING PO, C1 privacy proposal PENDING PO, AD-F11-2 proof obligations, B4, host log redaction, inherited gates, independent Claude audit and Analyze remain blockers. No implementation/deployment is authorized by this artifact commit.
