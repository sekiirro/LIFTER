# LIFTER — Free-tier Validation Report (P0-F8)

**Status**: TEMPLATE. Offline rows are filled by the reviewer. Deployment rows stay **pending approval** until the PO approves a deployment (ND-F8-2). Exit trigger: **≥ 70% of any limit** (architecture § Free-tier validation). Moving to a paid tier is a PO decision.

Verdicts: `ok` (< 70%) · `warn` (≥ 70%) · `over` (> 100%) · `pending approval` · `NEEDS SOURCE CONFIRMATION`.

## 1. Supabase account eligibility (read-only)

| Check | Official rule (source, checked) | Finding | Verdict |
|---|---|---|---|
| Free active-project allowance | 2 active Free projects, counted **across all orgs where the user is Owner or Administrator**. Paused projects don't count. ([billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [pricing](https://supabase.com/pricing), 2026-10-27) | Not verifiable from here: the Supabase CLI isn't logged in. The PO reads it in the dashboard (§ 1a). | pending PO check |
| Separate Free org for LIFTER | Allowed. Orgs don't add allowance; the 2-project cap is per person. | — | pending PO check |
| Existing orgs/projects untouched | Owner decision | Nothing created or changed | ok |
| Staging + prod both on Free (architecture "2 projects") | Uses **both** of the PO's Free slots | Possible only if the PO has 0 other active Free projects as Owner/Admin anywhere, YBS included | pending PO check |
| Region | Chosen at creation, not changeable later | Bounded by **B4** (jurisdiction/residency). Not chosen. | NEEDS DECISION (B4) |

### 1a. What the PO checks (read-only, dashboard)

1. Go to supabase.com/dashboard and open **every** organization listed. For each one, note your role (Owner/Administrator/Developer/Read-only) and its plan.
2. In each org where you're Owner/Administrator: count the Free-plan projects whose status is **active** (not paused).
3. Eligible for one new LIFTER project if that total is ≤ 1. Eligible for staging + prod if it's 0.
4. Don't pause, delete or transfer anything to make room. Bring the numbers back. Creation then needs your confirmation of the exact org name, project name(s) and region.

## 2. Limits

| Limit | Official value (source, checked) | Measured / projected | % | Source type | Verdict | Exit option |
|---|---|---|---|---|---|---|
| Workers requests/day | 100,000 (Cloudflare Workers limits, 2026-10-27) | — | — | dashboard after deploy | pending approval | Workers Paid (~$5/mo) |
| Workers CPU per HTTP request | 10 ms (same) | per route: `free-tier:tail` | — | measured after deploy | pending approval | Workers Paid / split static from API |
| Web Worker size | 64 MiB uncompressed (same) | `npm run size` | | measured offline | | split Workers |
| Cron Worker size | 64 MiB uncompressed (same) | `npm run size` | | measured offline | | — |
| Supabase DB size | 500 MB ([pricing](https://supabase.com/pricing), 2026-10-27) | local: `free-tier:db`; projection: `free-tier:project` | | measured offline + projection | | Supabase Pro (from $25/mo) |
| Supabase egress | 5 GB + 5 GB cached (same) | — | — | dashboard after deploy | pending approval | Pro |
| Supabase storage | 1 GB (same) | 0 buckets today (F7) | 0% | measured offline | ok | R2 overflow |
| Supabase Auth MAU | 50,000 (same) | — | — | dashboard after deploy | pending approval | — |
| Active Free projects | 2 per person across orgs (billing doc) | § 1 | — | dashboard (PO) | pending PO check | Pro org |
| Inactivity pause | after 1 week (pricing) | cron Worker every minute keeps activity once deployed | — | design | pending approval | — |
| Automatic backups | not included on Free (pricing) | F7 encrypted local backups + restore test | — | design | ok (F7) | — |
| Auth default SMTP | team-member addresses only, ~2 messages/hour, not for production ([auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp), 2026-10-27) | F4 sends no email (manual recovery links) | — | design | ok while no SMTP | custom SMTP (ND-F4-7) |

## 3. Projection inputs (ND-F8-1)

Pilot volumes: **NEEDS SOURCE CONFIRMATION**. `free-tier:project` refuses to project while any are missing.

## 4. Sign-off

| Item | Value |
|---|---|
| Measured by / date | |
| Environment(s) | local only (until approval) |
| PO decision | |
