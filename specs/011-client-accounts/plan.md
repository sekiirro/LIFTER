# Implementation Plan: F11 — Client accounts + signup

**Branch**: `011-client-accounts` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Base**: `b1c75d3`. User-authorized U2 design artifacts only. Independent architect review owns acceptance. No implementation approval, migration, application/dependency/capability change, seed, cloud operation or deployment.

## Summary

Add bounded public signup to F10's link route: one Auth-linked client, immutable issued-snapshot association, globally unique canonical identifiers, guarded single consumption and safe transactional audit. Failed signup cannot leave a usable orphan Auth user. No F12 approval, subscription, activation, payment or plan access.

**AD-F11-1 recommendation — pending architect decision:** Prefer same-transaction direct Auth user/identity writes if isolated provider/hash/configuration parity can be proven. Local Auth schema/rights and pgcrypto establish structural feasibility, not successful sign-in. This has one rollback boundary and avoids the API saga's orphan/cleanup state space. Accept its high internal-schema/upgrade coupling only after review. The alternative is server-only Auth admin `createUser` plus atomic DB finalize, pre-reserved link-bound identity, permanent pending-user gate, deterministic compensation and durable reconciliation. API-only create/delete or finite ban alone fails the no-usable-orphan guarantee. The gated variant reduces creation/hashing coupling but needs gate/atomic-unban compatibility proof. Neither option is selected here. Full comparison: [research R2–R5](research.md).

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
| Unknowns         | ND-F11-1..10 owned by seams below; AD-F11-1 open to architect; no inferred source confirmation                             |

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
| Workflow            | Required / conditional: explicit user authorization for Codex U2 planning; read-only research agent per skill; independent Claude architect review, Tasks/Analyze and no self-approval.                   |

**Result:** Design artifacts complete; **ERROR / blocked for implementation readiness** under the skill's unresolved-clarification gate. AD-F11-1, ten PO decisions and architecture parity proofs are not waived. No constitutional exception approved/requested. This is not an application test pass or production acceptance.

## Phase 0 — Research

[research.md](research.md) records source precedence, actual local Auth catalog/version, both AD candidates, uniqueness, public two-wall admission, authoritative time, F4 and risks. Technical unknowns have evidence or explicit blocking proof obligations. Business unknowns remain open, as instructed. No interactive input or implicit policy answer.

## Phase 1 — Design and transaction boundary

Normative schema/grants/audit: [data-model.md](data-model.md). Public payloads, admission, middleware and F4: [contract](contracts/client-signup-surface.md). Verification: [quickstart.md](quickstart.md).

**Lock order (verbatim contract):** `link row FOR UPDATE → validity with authoritative clock_timestamp() after lock → request/attempt row and per-token admission → canonical uniqueness locks in sorted key order and DB constraints → Auth identity/claim writes → client insert → guarded consume with fresh authoritative time → receipt and audit → deferred checks → COMMIT`.

**Transaction boundary (verbatim contract):** `Client insert + guarded registration-link consumption + successful-change audit (including deferred checks) commit in one database transaction; any failure rolls all three back. Option (i) includes Auth user/identity and canonical claims in that transaction. Option (ii) creates only a permanently gated Auth user beforehand; its finalize transaction includes client, claims, guarded consume, audit, committed receipt and gate release; compensation/reconciliation runs outside it and must never affect a committed client.`

Admission accounting commits durably before expensive work, with the same link-first order; rollback must not erase an attempt. The direct signup RPC redeems its one-use admission ticket outside an inner write subtransaction; sanitized failure returns commit redemption while rolling back Auth/client/consume/audit effects. Force deferred checks inside that protected unit. No lock spans provider HTTP in option (ii); finalize/reconciliation reacquire and revalidate. Every public consumed-link retry returns generic invalid, even after a lost success response with the same request secret. Receipts are internal dedup/reconciliation evidence only. Inherited expiry/grace is unchanged under ND-F11-4; consume time must account for lock waits.

## Open-decision seams

Exactly one policy owner per ND. UI/app/SQL/fixtures/reconciliation consume its contract; generated mirrors cannot add another configurable source. Production readiness fails if any seam remains provisional. Synthetic test values are not defaults or PO answers.

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

Documentation: `specs/011-client-accounts/{plan,research,data-model,quickstart}.md`, `contracts/client-signup-surface.md`; existing spec/checklist unchanged. No tasks.md in plan phase.

Future paths (not created/edited now): additive `supabase/migrations/<next>_client_accounts.sql`; `lib/client-accounts/` server-only admission/orchestration and pure contracts; `app/register/[token]/` form/action; middleware; existing AR/EN messages/DS; unit/integration/e2e. F4 lookup extension is future forward migration, not F4 policy changes.

## Complexity Tracking

No approved constitutional violation. Narrow definer public admission follows F10 and needs architect review; forced RLS cannot constrain a BYPASSRLS owner. Private global claims are needed for cross-table uniqueness. Direct Auth writes trade upgrade coupling for one rollback boundary; API alternative adds reservations/gating/reconciliation. Either candidate needs its proof obligations. Never substitute broad anon policies, caller scope, fabricated roles or general service-role DML.
