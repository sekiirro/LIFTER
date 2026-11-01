# LIFTER — Architecture (v3, APPROVED by PO 2026-10-27)

Approved hosting direction (PO, 2026-10-27): Next.js + Cloudflare + serverless backend, **$0 recurring hosting initially**, evaluate Supabase Free. Decisions referenced as `D-xx` are in [04-changes-and-questions.md](04-changes-and-questions.md).

## Stack (RECOMMENDED)

| Layer | Choice | Why / trade-off |
|---|---|---|
| Web + API | Next.js (App Router) on **Cloudflare Workers** via the OpenNext Cloudflare adapter; route handlers / server actions | One codebase, edge SSR, AR/EN via `next-intl`. Risk: bundle-size and CPU limits on the free plan (see Free-tier validation). |
| Separate Workers | `telegram-webhook`, `cron` (Cron Triggers) | Small, isolated, and they keep the Next bundle smaller |
| DB | **Supabase Postgres (Free)** with RLS | Postgres for money/versioning, JSONB for plan/form documents |
| Auth | **Supabase Auth** (email/password, reset links), JWT verified by Postgres | RLS keys off a *signed* JWT (`auth.uid()`), so the tenant context can't be forged from SQL. Fits globally unique client email (D-08). |
| UI / Design System | P0 Design System: tokens (neutral dark/light, emerald `#059669` default brand, workspace brand colors with contrast guard; D-18), AR-first RTL + EN LTR components, loading/empty/error states, accessible inputs (BRD-02, PRD-13.4/13.7) | Every feature builds on it; prevents per-screen drift |
| Data access | `supabase-js` with the user's JWT → PostgREST/RPC under RLS. Reads use invoker rights where appropriate; privileged mutations use the established F12-F15 `SECURITY DEFINER` RPC pattern with explicit authorization and restricted grants. | No pooled-connection `SET LOCAL` problem. The service-role key is used only by `cron`, through scoped RPCs that take an explicit `workspace_id`, and every call is audited. |
| Jobs | `jobs` table (outbox) + Cloudflare Cron Trigger (every minute) draining with `FOR UPDATE SKIP LOCKED` and unique `idempotency_key`. Alt: Supabase `pg_cron` | Serverless-compatible, $0, and retries never duplicate |
| Files | Supabase Storage (private buckets, RLS, signed URLs). Overflow: Cloudflare R2 | Logos and profile images only. No progress photos (PRD-09). |
| PDF / Excel | **Browser-side**: print-to-PDF with RTL print CSS, and ExcelJS in the browser from authorized API data | Chromium shapes Arabic correctly at $0. There's no headless browser available on the free plan. Server-side Browser Rendering is a later option. |
| Email | Free-tier SMTP for Supabase Auth password-reset mail only (provider chosen in P0) | Supabase's default SMTP isn't meant for production traffic |
| Envs | Supabase Free allows 2 projects: **staging + prod**. Local: Supabase CLI (Docker) | — |

## Free-tier validation (P0 gate; figures are secondhand, verify on official pages)

| Limit (reported) | Impact | Mitigation / exit |
|---|---|---|
| Supabase: 500 MB DB, ~5 GB egress, 2 projects, **project pauses after ~7 days inactivity, no backups**, egress overage may return 402 | Losing the ledger is unacceptable (Inv.4). A pause means an outage. | Encrypted local backups (below). Cron traffic keeps the project active. Monitor DB size and egress. **Exit trigger:** Supabase Pro (~$25/mo) when usage exceeds 70% of a limit (PO decision). |
| Cloudflare Workers Free: ~100k req/day; **10 ms CPU per HTTP request; 64 MiB uncompressed Worker size, no compressed limit** (official limits page, verified 2026-10-27) | Bundle size is low-risk. The 10 ms CPU limit for SSR or heavy JSON is the real constraint. | P0 spike: deploy a skeleton and measure. Exit: Workers Paid (~$5/mo) or split static pages from the API Worker. |
| Supabase Auth: 50k MAU | Ample | — |

## Multi-tenancy & authorization

- **`workspace_id` on every tenant row; composite FKs `(workspace_id, id)`**, so a foreign key can't cross workspaces.
- **Two walls:** (1) an app-layer `authorize(actor, action, resource)` that denies by default and is called by every handler, RPC, job and bot command; (2) RLS policies using `auth.uid()` + `memberships` via a `SECURITY DEFINER` helper `has_workspace_access(ws, capability)`.
- **Threat model:** RLS guards against app bugs. The JWT is signed, so a SQL path can't widen the tenant scope. The service role is confined to audited cron RPCs that take an explicit workspace.
- Staff identity is global, and the role lives on the staff user (consistent role, BRD-02). Each client has **one** workspace-scoped `client_account`, and client email and phone are **globally unique** (D-08): a unique index on normalized email and on E.164 phone, across all workspaces. Staff and client accounts use separate emails, and dual-role accounts are not supported (D-16).
- **Permission matrix (APPROVED D-09/D-10), always within authorized workspaces; deny by default:**

| Capability | PO | WO | Sales | Trainer |
|---|---|---|---|---|
| Set/change package prices & available durations | ✔ | – | – | – |
| Generate registration link (approved settings only) | ✔ | ✔ | ✔ | ✔ |
| Configure installment schedule on link | ✔ | ✔ | ✔ | – |
| Approve registration | ✔ | ✔ | ✔ | – |
| Record renewal / installment payment | ✔ | ✔ | ✔ | – |
| Apply / stop / remove freeze | ✔ | ✔ | ✔ | – |
| Record refund | ✔ | – | – | – |
| Delete / remove client account | ✔ | – | – | – |
| Coaching work (plans, forms, notes) | ✔ | ✔ | – (unconfirmed) | ✔ |

Sales capabilities not listed stay deny-all.

## Registration tokens

Hashed token bound to `(workspace, package_version)`: 24 h validity, `opened_at` grace of 30 min. Consumption happens in an RPC: `UPDATE … WHERE consumed_at IS NULL AND (expires_at > now() OR opened_at + 30 min > now()) RETURNING`, in the same transaction that creates the account. A failed validation rolls back. No IP blocking.

**Duplicate email/phone (D-08 rev.):**
- The form shows only "This email is already registered. Contact support." (same wording for phone).
- No verification code, no workspace disclosure, no transfer or merge.
- The token is not consumed. Per-token attempt limit. Audited without cross-workspace detail.
- *(Superseded: the verification-code disclosure flow / R8.)*

Removal (PO only) pseudonymizes the old email/phone so they become free while the ledger and audit are kept.

## Subscriptions, freeze, renewal

- `package_versions` are immutable and **PO-only**. Duration is stored as **days**: 1/3/6/8/12 months = 30/90/180/240/360 days, or custom days (D-11). No calendar arithmetic. Subscriptions snapshot price, currency, commission rate, duration_days and installment schedule.
- **Early renewal (D-04):** the new period's `starts_at` = the current period's `ends_at` (remaining days preserved). Activation of a renewal is recorded at approval; access continues seamlessly.
- **Freeze (D-05):** `freeze_events` are append-only: `applied(duration)`, `stopped(at)` and `removed`. Effective extension = days actually paused (on stop) or 0 (on remove). `ends_at` is derived from the base end + the effective extensions, never overwritten. Check-in scheduling pauses for the paused interval. Full audit.
- Installments (D-12): the schedule (count, amounts, due offsets in days) is set on the link by PO/WO/Sales and snapshotted on the subscription. Validation: amounts must sum exactly to the PO price snapshot (D-17), enforced by a DB constraint. An overdue installment restricts plan access/export only; login stays. Notices go to the client and staff. Access resumes automatically when the confirmed payment is recorded.

## Money: immutable ledger & finance rules (APPROVED D-12/D-13)

- Append-only `ledger_events` (`payment_confirmed`, `refund_recorded` referencing the original payment, `installment_scheduled`), integer minor units + currency, idempotency key, and UPDATE/DELETE blocked by a trigger and grants.
- **Commission is earned per confirmed collected payment:** `commission = payment.amount × subscription.commission_rate_snapshot`. Workspace share = amount − commission. The unpaid contract balance earns nothing.
- **Reporting month = the payment's collection month** (`collected_at`, Africa/Cairo).
- **Refund (PO only, FULL ONLY, D-15):**
  - Refund = 100% of the amount actually collected on the subscription (e.g. 600 if one installment of 1200 was paid; 1200 if fully paid).
  - One atomic RPC: a reversal event for each confirmed payment (reversing its revenue and commission) booked in the refund month, all unpaid installments cancelled, and the subscription ended.
  - Original events are never edited. Partial refunds are not supported (BRD-03/PRD-07 "partial" superseded).
- No discounts exist (only PO sets prices). No settlement tracking between workspace and platform.

## Payroll / KPI

Monthly `kpi_periods` with weights/targets frozen (changes apply next month). `productivity_units` are unique per subscription and are created by the activation transaction only after both workout and nutrition first-delivery rows succeed; they are kept on refund. `payroll_entries` use approve = paid, immutable, with adjusting entries for corrections. Strikes are a rolling 90-day view. Every action is a PO decision record.

## Plans, forms, catalogs: versioning

- One mutable draft per plan. Publishing creates an immutable `plan_version` JSONB (with a schema version) that snapshots food macros and canonical exercise ids.
- **First delivery:** workout and nutrition plans are delivered independently and may be delivered on different days. Persist each first delivery as an idempotent, concurrency-safe delivery record. Activate the subscription exactly once after both first deliveries succeed, creating the productivity unit in that same transaction; later plan edits do not restart activation or add first-delivery credit. See the canonical contract on branch `019-plan-core` (feature PR pending) and the supersession note in the [F12 data model](../specs/012-registration-approval/data-model.md).
- **SLA (D-03):** `addWorkingDays(submittedAt, 5, {tz: 'Africa/Cairo', nonWorking: [Fri], cutoff: '18:00'})`. Submitted before 18:00 on a working day → that day is day 1. At/after 18:00, or on a Friday → day 1 is the next working day. Pure function, table-tested.
- Forms: immutable template versions, pinned assignments, stable question ids, autosave draft rows.
- Catalogs: foods/exercises are versioned. Only the creator recorded on the stable food identity (immutable `created_by`) or the PO may publish food edits, without moderation; authoring a later version grants no edit right, and other staff cannot edit a global food (D16-1b=A; F16 FR-009). `created_by` is also provenance visible to the PO only (D16-9); PO exclusively manages global exercises and removes/merges global entries. Remove is non-destructive and never changes existing client plans; authorized staff manage workspace exercises. D16-2 through D16-10 values are recorded in docs/04-changes-and-questions.md; the Remove-only amendment is S21-01.

## Telegram

One bot. A webhook Worker verifies the secret token and enqueues; the job drains. Linking uses a one-time deep-link token from an authenticated web session, with many links per Telegram user. Every command and every outbound message re-checks link, membership and access. Outbound respects the Telegram rate limits and records delivery status. Business auto-reply is a feasibility spike.

## Backups (APPROVED D-14, $0)

- **Daily job** (local scheduled script on the PO-controlled machine; GitHub Actions as an optional runner):
  1. `supabase db dump` (schema + data + roles) plus a Storage bucket sync.
  2. Encrypt with **age** (public key only on the runner; private key kept offline by the PO).
  3. Write the archive plus a SHA-256 manifest to a local backup folder.
  4. Retention: 14 daily, 8 weekly, 12 monthly.
- No plaintext export ever leaves the runner. Excluded from git.
- **Restore test (monthly + before every prod migration):** decrypt, restore into local Supabase (CLI/Docker), run row-count/checksum checks on ledger, audit and subscriptions, plus a smoke query. Result logged. A failed restore blocks prod migrations.
- RPO ≤ 24 h, RTO target ≤ 4 h (restore to a fresh Free project). Sizes are monitored against free limits.

## Privacy, audit, reporting, deployment

- Append-only `audit_events`. The timeline is a curated projection. Logs carry no PII or form answers. PO-only full export is audited.
- Closure: deactivate, then pseudonymize PII under a retention policy (jurisdiction B4), keeping ledger and audit.
- Reports are SQL views per workspace. The PO aggregate goes through an audited elevated RPC.
- Migrations via Supabase CLI: forward-only, expand/contract. Destructive ones and prod deploys need PO approval. Nothing touches YBS.
