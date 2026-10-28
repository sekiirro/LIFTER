# Implementation Plan: F11 — Client accounts + signup

**Branch**: `011-client-accounts` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Base for this U3 handoff**: `a7cea30`. User-authorized design decision recording and Spec Kit tasks only. Independent architect review owns acceptance. No implementation approval, migration, application/dependency/capability change, seed, cloud operation or deployment.

## Summary

Add bounded public signup to F10's link route: one Auth-linked client, immutable issued-snapshot association, globally unique canonical identifiers, guarded single consumption and safe transactional audit. Failed signup cannot leave a usable orphan Auth user. No F12 approval, subscription, activation, payment or plan access.

## AD-F11-1 — architect decision: Option (i)

This later architect decision supersedes the earlier open-AD wording in the unchanged specification; ND policy questions are not superseded.

The architect selected same-transaction direct `auth.users`/`auth.identities` writes in a hardened SECURITY DEFINER signup function. Option (ii) is rejected; its analysis remains in research R4–R5 only. This records the architect's decision, not this author's approval or a claim that the proofs have run.

- **C1 Fail-closed compatibility guard**: before any write, the signup function verifies the latest `auth.schema_migrations` version against an explicit allowlist captured from local GoTrue v2.197.0, plus the presence/types of every column it writes. Mismatch → generic safe failure, nothing written, link not consumed. Guard before admission redemption as well as Auth/client writes. The admission RPC also guards before its own write. Actual version/column values must be captured locally, never guessed. Trace: T002–T005, T015, T041.
- **C2 Real sign-in proof**: integration tests (a) sign in via real local GoTrue (`signInWithPassword`) with a signup-created account and (b) diff signup-created `auth.users`/`auth.identities` rows against a GoTrue-admin-created reference user on every GoTrue-set column. Only ids, timestamps, hashes, email/phone values may differ; normalize those values explicitly, including nested identity references, and compare all other values. Both must pass. Trace: T016–T018, T039–T041.
- **C3 Password handling**: bcrypt via `extensions.crypt(..., extensions.gen_salt('bf', <GoTrue cost>))`; capture the actual local GoTrue cost rather than inventing one. Plaintext never appears in exceptions/RAISE text, audit, logs, receipts or return values. Server code calls the signup RPC with the anon/publishable key only, never the service-role key; no service-role key reaches the browser. A server-only local test harness may use admin credentials solely to create the reference control, not call signup. Existing F4 admin use remains separate. Trace: T010–T018, T023–T026, T040–T042.
- **C4 Hosted-compat production blocker**: "Option (i) verified on local stack only; hosted Supabase Auth version/DML permission and upgrade allowlist must be re-verified before any deployment (PO approval)". No cloud operation is authorized. Local proof remains outstanding until C1–C3 tests pass. Trace: T001, T039, T043, T046.

Local read-only evidence: GoTrue **v2.197.0** (`auth version`), PostgreSQL **17.11**, pgcrypto in `extensions`, postgres Auth DML rights, generated identity-email/confirmed timestamp columns, partial email and provider-ID indexes. CLI **2.122.0** is not GoTrue's version. No Auth writes/sign-in/cleanup tests in U2.

## Technical Context

| Item             | Existing stack / design constraint                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Language/version | TypeScript 6.0.3, Node 24, Next.js 16.4.3 App Router, React 19.3.1                                                         |
| Dependencies     | supabase-js 2.118.0, supabase/ssr 0.12.7, server-only; no dependency changes                                               |
| Storage          | Local Supabase PostgreSQL 17.11; future additive migration after `20261030120000_registration_links.sql`; none created now |
| Testing          | Vitest unit/integration, signed/anon fixtures, Playwright/axe, catalog/grant parity and mutations                          |
| Platform/type    | Existing web app, Cloudflare Workers/OpenNext 1.20.13; HTTPS RPC/API, no native bcrypt addon or DB socket                  |
| Performance      | Indexed token/canonical keys; same-link serialization; authoritative time after waits; no invented latency/volume target   |
| Scope            | Account, snapshot binding, consumption, audit and F4 dependency only                                                       |
| Constraints      | $0 direction, never log secrets/PII, no-store/no-referrer, unchanged capabilities, no browser service key                  |
| Unknowns         | ND-F11-1..10 owned by seams below; AD-F11-1 selected with C1–C4 obligations; no inferred source confirmation               |

## Constitution Check

Gate checked before research and after Phase 1 against v1.1.0:

| Principle           | Pre-research / post-design assessment                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I isolation         | Required / designed: tenant workspace and composite FKs, independent app admission/DB guard, forced RLS/default deny, foreign-negative tests. Global claims are private identity security infrastructure. |
| II financial truth  | Required / preserved: immutable issued terms; no finance/refund/commission effects.                                                                                                                       |
| III governance      | Required / designed: no role/capability/membership changes; D-08 global uniqueness/generic errors; D-16 identity separation.                                                                              |
| IV approved scope   | Required / conditional: all ND items open; provisional seams; no invented policy; implementation readiness ERROR until resolved.                                                                          |
| V versioning        | Required / designed: issued link/version reference, no current-offer reread, no activation.                                                                                                               |
| VI people decisions | Required / preserved: no assignments, compensation or personnel effects.                                                                                                                                  |
| VII privacy         | Required / designed: hashed receipts/tokens, safe append-only audit, token-safe POST/headers; retention/B4 open.                                                                                          |
| VIII UI             | Required / planned: existing DS, Arabic-first RTL/English LTR, dark/light, keyboard/labels/pending/error; no package disclosure.                                                                          |
| IX reliability      | Required / designed: explicit locks, constraints, consume-time check, atomic audit, replay receipt; Auth proof outstanding.                                                                               |
| Platform            | Required / preserved: existing Cloudflare/Supabase, local only, forward-only future migration, existing backup/restore gates.                                                                             |
| Workflow            | Required / conditional: explicit user authorization for Codex U2 planning; prior U2 research retained; user-authorized U3 decision/tasks; independent Claude audit/Analyze and no self-approval.          |

**Result:** Design artifacts complete; **ERROR / blocked for implementation readiness** under the skill's unresolved-clarification gate. C1–C4 proof obligations, ten PO decisions and architecture parity proofs are not waived. No constitutional exception approved/requested. This is not an application test pass or production acceptance.

## Phase 0 — Research

[research.md](research.md) records source precedence, actual local Auth catalog/version, both AD candidates, uniqueness, public two-wall admission, authoritative time, F4 and risks. Technical unknowns have evidence or explicit blocking proof obligations. Business unknowns remain open, as instructed. No interactive input or implicit policy answer.

## Phase 1 — Design and transaction boundary

Normative schema/grants/audit: [data-model.md](data-model.md). Public payloads, admission, middleware and F4: [contract](contracts/client-signup-surface.md). Verification: [quickstart.md](quickstart.md).

**Lock order (verbatim contract):** `link row FOR UPDATE → validity with authoritative clock_timestamp() after lock → request/attempt row and per-token admission → canonical uniqueness locks in sorted key order and DB constraints → Auth identity/claim writes → client insert → guarded consume with fresh authoritative time → receipt and audit → deferred checks → COMMIT`.

**Transaction boundary (verbatim contract):** `Client insert + guarded registration-link consumption + successful-change audit (including deferred checks) + Auth user/identity + canonical claims + committed receipt commit in one database transaction; any failure rolls all signup effects back. Durable admission is separate; one-use ticket redemption precedes the inner signup subtransaction and sanitized failures commit redemption without signup effects.`

Admission accounting commits durably before expensive work, with the same link-first order. C1 runs before any write in each RPC. Redeem the one-use ticket outside the inner signup subtransaction; force deferred checks inside it. Every consumed-link retry is generic invalid, even with the same request secret after response loss. Receipts are internal dedup evidence only. Consumption uses fresh authoritative time after hashing/lock waits. No provider HTTP, reservation, pending gate, compensation or reconciliation is in the selected signup design.

## Open-decision seams

Exactly one policy owner per ND. UI/app/SQL/fixtures consume its contract; generated mirrors cannot add another configurable source. Production readiness fails if any seam remains provisional. Synthetic test values are not defaults or PO answers.

| Seam                                           | ND        | Placeholder                                                                                                                                                             | Production-blocker y/n |
| ---------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `signup_password_policy()`                     | ND-F11-1  | **PROVISIONAL — awaiting PO (ND-F11-1)**: unresolved; reject outside explicit synthetic fixtures; no length/character default                                           | y                      |
| `app_private.signup_identity_normalization()`  | ND-F11-2  | **PROVISIONAL — awaiting PO (ND-F11-2)**: unresolved; normalization fails closed; injected test vectors, no case/country assumptions                                    | y                      |
| `signup_field_contract()`                      | ND-F11-3  | **PROVISIONAL — awaiting PO (ND-F11-3)**: unresolved; synthetic email/password/phone only; no shippable extra collection                                                | y                      |
| `app_private.signup_consumption_policy()`      | ND-F11-4  | **PROVISIONAL — awaiting PO (ND-F11-4)**: unchanged F10 strict 24h/pre-expiry-first-open+30m predicate; confirmation outstanding                                        | y                      |
| `app_private.client_signup_limits()`           | ND-F11-5  | **PROVISIONAL — awaiting PO (ND-F11-5)**: unresolved; fail closed except injected count/window/exhaustion tests; no F10 20/hour reuse                                   | y                      |
| `signup_completion_policy()`                   | ND-F11-6  | **PROVISIONAL — awaiting PO (ND-F11-6)**: synthetic generic completion; no session/redirect/interim business state selected                                             | y                      |
| `app_private.signup_retention_policy()`        | ND-F11-7  | **PROVISIONAL — awaiting PO (ND-F11-7)**: no automatic purge/release/closure; synthetic data only; period unresolved, B4 unchanged                                      | y                      |
| `signup_authenticated_visitor_policy()`        | ND-F11-8  | **PROVISIONAL — awaiting PO (ND-F11-8)**: synthetic signed-in submission denied; no sign-out/merge/conversion UX selected                                               | y                      |
| `app_private.signup_identifier_scope_policy()` | ND-F11-9  | **PROVISIONAL — awaiting PO (ND-F11-9)**: conservative reserve/no release for synthetic integrity tests; staff-phone/inactive rules unresolved; no narrowing of D-08    | y                      |
| `app_private.client_signup_audit_contract()`   | ND-F11-10 | **PROVISIONAL — awaiting PO (ND-F11-10)**: synthetic `client.created`/`registration_link.consumed`, actor NULL, `{client_id,link_id}` only; attempt evidence unresolved | y                      |

Pattern mirrors F10's single `registration_link_limits()` seam without numerical invention. ND-F10-4 stays open beyond the form. All inherited F4/F5/F8/F9/F10 and production gates remain.

## Project Structure

Documentation: `specs/011-client-accounts/{plan,research,data-model,quickstart}.md`, `contracts/client-signup-surface.md`; existing spec/checklist unchanged. [tasks.md](tasks.md) supplies the phased test-first implementation handoff; execution requires later authorization and Analyze/review.

Future paths (not created/edited now): additive `supabase/migrations/<next>_client_accounts.sql`; `lib/client-accounts/` server-only admission/orchestration and pure contracts; `app/register/[token]/` form/action; middleware; existing AR/EN messages/DS; unit/integration/e2e. F4 lookup extension is future forward migration, not F4 policy changes.

## Complexity Tracking

No approved constitutional violation. Narrow definer public admission follows F10 and needs architect review; forced RLS cannot constrain a BYPASSRLS owner. Private global claims are needed for cross-table uniqueness. Direct Auth writes trade upgrade coupling for one rollback boundary; the rejected API alternative remains documented in research only. Selected option (i) must meet C1–C4. Never substitute broad anon policies, caller scope, fabricated roles or general service-role DML.

## Production blockers

Option (i) verified on local stack only; hosted Supabase Auth version/DML permission and upgrade allowlist must be re-verified before any deployment (PO approval)

C1–C3 local proofs are future obligations, not completed verification. All ten ND seams, B4, host log redaction, inherited gates, independent Claude audit and Analyze remain blockers. No implementation/deployment is authorized by this artifact commit.
