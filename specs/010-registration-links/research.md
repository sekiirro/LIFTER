# Research: Registration Links (P1-F10)

This is repository-grounded transcription of the supplied binding design, not independent product policy. Sources were read in the requested worktree: Constitution, architecture, decision/production registers; BRD/PRD lines 15–70, 120–140, 190–205, 270–300; F9/F4 artifacts; migrations; auth/package libraries; middleware/show-once dialog; Spec Kit templates. No new dependency or external recommendation is needed.

## R1 — Precedence and scope

BRD-04.1/04.2 and PRD-02 establish post-payment, single-use, workspace/package binding, fixed 24 hours, pre-expiry first-open grace and no IP blocking. D-09 allows four issuing roles, but only PO/WO/Sales configure schedules. D-12/D-17 explicitly replace BRD-03/PRD-07 line 198's fixed three-month 50/50 rule. F10 snapshots the schedule; F11 creates accounts/consumes; future subscription work materializes due dates. No payment receipt, activation, ledger, duplicate handling or branding is added.

Architecture generally prefers SECURITY INVOKER transactional RPCs. The supplied F10 design specifically requires SECURITY DEFINER for issuance/open. Preserve it, with postgres owner, empty search_path, fully qualified objects, signed staff checks on issuance, narrow anon open projection, forced RLS and explicit grants. This is the same controlled privilege pattern as F9/F4, not general service-key access.

## R2 — Existing authorization and reads

`lib/auth/capabilities.ts` and the SQL role helper already contain both required capabilities with the exact D-09 matrix. No capability edit. `authorize()` includes PO global scope and active membership for others. Reuse `getActor()` and session JWT RPCs; do not copy F4's recovery admin-client use into registration issuance.

F9 has composite workspace/version identities, same-offer current pointer protection, immutable versions, `package_versions_safe` with text money and explicit safe column grants. Reuse those offers/read patterns. Link safe view also excludes hash and commission; a PO/WO-only role/workspace reader returns commission separately. Existing audit RLS denies Sales/Trainer, preventing indirect rate disclosure.

## R3 — Current-version selection versus stale-request rejection

**Decision R10-1 (binding architect correction)**: `public.issue_registration_link(workspace_id uuid, package_version_id uuid, token_hash text, installments jsonb)` binds issuance to the version displayed to staff. Authorize generation and, for any non-NULL schedule, configuration before target lookup or stale-state disclosure. Derive the offer from the same-workspace version; foreign/unknown versions return only `42501/not_permitted`. Lock that offer and require `available AND current_version_id = package_version_id`; otherwise return `22023/stale_terms`. Validate/copy only that exact immutable version. No insertion or audit event occurs on rejection. The app returns `stale_terms`; translated UI says "These package terms changed. Refresh and try again." and offers a reload action. Test publication between load and issue, disablement, unknown/foreign versions and unauthorized callers. This resolves the former offer-only limitation; no policy ND is closed.

## R4 — Token transport and local digest evidence

Choose `token_hash text` as lowercase 64-character SHA-256 hex, globally UNIQUE. Server uses `crypto.randomBytes(32).toString('base64url')`; hash the ASCII/UTF-8 encoded token string, not its decoded random bytes. SQL hashes exactly that same string with `extensions.digest(token,'sha256')` and hex encoding. No raw token is persisted; server action retains it only until committed RPC response and one-time URL return.

Read-only local verification on 2026-10-27: Docker container `supabase_db_lifter`, `pg_extension` reports `pgcrypto` in schema `extensions`; `pg_proc` reports both `extensions.digest(bytea,text)` and `extensions.digest(text,text)`. `encode(extensions.digest('abc','sha256'),'hex')` returned the standard SHA-256 value `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`. No local database mutation, migration or reset was performed.

Future migration must check/create the extension in the intended schema when absent and fail explicitly on an unexpected existing schema rather than rely on search_path or silently relocate an installation. Local integration/catalog checks re-confirm schema and TS/SQL token hashing parity from a fresh migrated database. No remote database was consulted.

## R5 — Schedule representation and enforcement

NULL means no schedule. Non-null JSON must be a nonempty array of `{seq, amount_minor, due_offset_days}`; empty array is invalid_input, so Trainer cannot bypass the second capability check with `[]`. This distinguishes absent from present without inventing a maximum or first-offset rule. Amount JSON strings preserve bigint exactly; TS rejects Number money, fractions, exponent notation and overflow. SQL validates strings before bigint conversion, sums using numeric (Postgres SUM(bigint)) and compares exactly. Sequence is explicit, contiguous and array ordered. Day/sequence integers use DB storage limits only.

Use a DB schedule-validation helper plus deferred constraint triggers for exact totals/order at commit, while RPC validates before inserts. Parent insertion is also checked so a malformed scheduled set cannot evade validation by missing a final child trigger. Zero child rows remain legal full payment. Child inserts require parent creation in the same transaction: parent xmin matches current transaction, both parent markers remain NULL, and parent no-op UPDATE is rejected to prevent xmin refresh on an older unopened link. Later child INSERT and any UPDATE/DELETE/TRUNCATE fail. These technical guard choices do not add business schedule bounds or an extra transaction-id column.

## R6 — First-open grace and concurrency

The architecture's short SQL predicate lacks an explicit `opened_at < expires_at` precondition. Binding design and PRD acceptance supply it. First-open mutation is allowed only at `now() < expires_at`; validity thereafter uses the later of expiry and first-open + 30 minutes, strictly before the deadline and with consumption dominant. A row lock makes simultaneous opens set once and coordinates with future F11 consumption. Reopening never slides the window.

Use a pure TS function with injected `now` timestamp, no browser clock authority. SQL is authoritative; shared table fixtures are tested in SQL at injected times through a private pure predicate, without exposing a public client-controlled clock. Store/use timestamptz instants; 24 hours and 30 minutes are elapsed intervals, with no Cairo calendar arithmetic. Cairo remains display/reporting context. Invalid/malformed timestamps fail closed in TS.

## R7 — Exact audit with child count

Latest `app_private.audit_row_change()` is in `20261029120000_packages.sql`, not the F4 version. Preserve workspace/staff/membership/recovery/package/version/offer/jobs mappings. Issued details require final child count, so attach a deferred AFTER INSERT constraint audit trigger on the link parent; it calls the extended common function after rows exist. A separate AFTER UPDATE trigger handles only NULL-to-value first-open transitions. No child audit trigger and no manual RPC duplicate audit insert. Audit failure aborts transaction and prevents URL return. A consumed-only change has no F10 audit event; F11 must define its audit contract separately.

## R8 — Rate limit, retry and generic failures

The existing `app_private.registration_link_limits()` is a technical placeholder (20 per actor per rolling hour) and does not conform to the approved policy. S31-PO-3 sets 50 successful issuances per authorized account per rolling 24 hours, across workspaces, including Trainer/WO/PO, with no exceptions or workspace resets. T035 tracks implementation, concurrency tests, and configuration verification; no code change is made in this lane.

The supplied F10 error vocabulary has no rate_limited result. Map limit rejection to `unavailable`; tests inspect the limit behavior without exposing SQL details. All failed transactions leave no issuance event. Fixed RPC has no idempotency key: same supplied hash cannot create two links; a repeated hash returns generic failure, never recovers a URL. A fresh user-requested issuance uses fresh randomness. A lost delivery response may leave a valid undisclosed link; do not add replay storage or automatic blind action retries. Concurrent distinct issuance is allowed within the limit; this differs from single-use consumption.

## R9 — Public surface, logs and minimum UI

Reuse the F4 Copy-only dialog's focus/state reset/generation guard, not its recovery verification route. F10 open happens on the public page request by invoking the open RPC, and sets first-open; no account mutation occurs. This differs deliberately from F4's POST-only recovery verification. Automated link scanners may therefore start the non-sliding grace marker; that follows the prescribed OPEN contract, and no undocumented “human-only” detection is introduced.

Plan chooses valid/invalid messages only with workspace name on valid. No Continue control/form behind an invented feature flag, no “arrives in F11” copy. ND-F10-4 stays open for future approved content; branding/logo/colors are separate P1 work. Sales/Trainer staff prices follow the supplied provisional yes (ND-F10-5); commission stays denied (ND-F9-4).

Add only the `/register/<single segment>` public allow-list shape; keep `/registration-links` protected. Set no-referrer after middleware response/cookie replacement, including error states. No-store server rendering, no token in metadata, analytics, custom console, breadcrumbs, request URL logging or redirects/`next` parameters. Platform access logs must omit/redact `/register/*` token-bearing paths before production; local app tests alone cannot certify host logging behavior. This follows the binding never-log rule, not a new logging service.

## R10 — Explicit ambiguities/conflicts and handling register

| Point                                                              | Handling                                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Historical 50/50 and line 198 vs D-12/D-17                         | Superseded; use exact arbitrary permitted schedule, never fixed percentages/due month.                                                                  |
| Generic invoker architecture vs binding definer RPCs               | Specific binding RPCs retained and hardened; no blanket elevated client.                                                                                |
| Non-current rejection vs offer-only RPC                            | R10-1 binds the displayed version, checks current/available under lock after authorization, and returns stale_terms.                                    |
| Open OR predicate vs pre-expiry-open requirement                   | R6 adds required precondition and strict max/deadline semantics from binding/PRD.                                                                       |
| 30-minute “grace” could mean after expiry                          | Use first-open + 30 minutes, max with expiry; never expiry + 30 automatically.                                                                          |
| Hash storage/encoding and extension schema optional in brief       | Choose text hex/hash encoded token; pgcrypto schema confirmed read-only locally.                                                                        |
| Empty schedule/JSON seq encoding unspecified                       | NULL only absent, nonempty explicit ordered seq array present; Trainer any non-null denied.                                                             |
| Commit-time child count vs parent INSERT audit                     | Deferred parent issuance audit; immediate opened audit; one event per actual change.                                                                    |
| Immutable children vs later INSERT                                 | Same-transaction parent xmin plus NULL markers; reject parent no-op UPDATE to prevent refreshed-xmin bypass; no direct write grants.                    |
| Rate values absent; F4 has extra rate_limited status               | Historical 2026-10-27 row: rate values were absent at the time and a local-only 20/hour placeholder was selected. Superseded by R8 and S31-PO-3 (SK-010-03): 50 issuances per authorized account per rolling 24 hours, including Trainer/WO/PO, no exceptions or per-workspace resets — recorded, not implemented (T035). No new public error code; limit rejection maps to `unavailable`. |
| Retry/idempotency semantics absent                                 | Unique hash; duplicate fails generically, no URL recovery; no request-key invention.                                                                    |
| Recent “opened” could mask expired/consumed; list size unstated    | Status precedence consumed, expired, opened, valid; opened only if still usable. Recent 50 is a technical display batch, not retention/issuance policy. |
| No stored offer_id explicitly required                             | Derive immutable offer_id through composite-bound version for reads/audit; no redundant field.                                                          |
| Public preliminary UI vs form/branding source                      | Minimal states only permitted by binding; no form placeholder; ND-F10-4 open.                                                                           |
| Staff price vs commission                                          | Provisional price yes; commission no for Sales/Trainer; both NDs remain open.                                                                           |
| Workflow: Codex writing/running reviewer phase vs no self-approval | User-authorized binding Claude transcription and Codex execution; independent Claude audit/approval retained.                                           |
| F9 not merged; migration dates later than current date             | Stack on origin/009-packages as instructed; additive F10 file sorts after F9; no rewrite of F9 or source dates.                                         |
| Architecture staging description vs later D-20                     | Local Docker only; production-readiness register wins; no cloud staging or deployment.                                                                  |
| Backdated open fixtures vs fresh insert guard                      | Temporarily suspend only insert guard in isolated fixture setup, restore before subject calls; no public clock override.                                |
| Prettier scoped command vs specs ignore rule                       | Run requested plain commands, then use --ignore-path .gitignore for effective write/check of all eight files; no ignore-config edits.                   |

ND-F10-1..3 are decided by S31-PO-3/4 and recorded in [spec.md](spec.md); ND-F10-4/5 remain open. ND-F9-1..3/5 remain open; ND-F9-4 remains denied by S31-PO-4. SK-009-01 belongs to the separate F9 specification lane. Approved behavior is recorded but not implemented. No source decision file is edited in this run.
