# LIFTER — Free-tier Validation Report (P0-F8)

**Status**: Eligibility completed on 2026-10-27 (D-20/D-21); offline measurements recorded. Nothing deployed; no cloud migrations. Deployment rows stay **pending approval** until the PO approves a deployment (ND-F8-2). Exit trigger: **≥ 70% of any limit** (architecture § Free-tier validation). Moving to a paid tier is a PO decision.

Verdicts: `ok` (< 70%) · `warn` (≥ 70%) · `over` (> 100%) · `pending approval` · `NEEDS SOURCE CONFIRMATION`.

## 1. Supabase account eligibility (read-only)

| Check | Official rule (source, checked) | Finding | Verdict |
|---|---|---|---|
| Free active-project allowance | 2 active Free projects, counted **across all orgs where the user is Owner or Administrator**. Paused projects don't count. ([billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [pricing](https://supabase.com/pricing), 2026-10-27) | Both PO slots used: YBS 1 + LIFTER 1. No further Free project available. | warn (2/2 used) |
| Separate Free org for LIFTER | Allowed. Orgs don't add allowance; the 2-project cap is per person. | Dedicated **LIFTER** org created (`qsxknusdawhqqhnqfalf`); plan **free** verified via API on 2026-10-27. | ok |
| Existing orgs/projects untouched | Owner decision | YBS organization and project untouched. | ok |
| Single cloud project (production); staging/testing on local Docker (D-20) | One LIFTER cloud project; no cloud staging project | **lifter-prod** (`aaxswvjjxdmwbhgcgjyo`), **ACTIVE_HEALTHY**. Development and testing use local Docker. | ok |
| Region | Chosen at creation, not changeable later | **eu-central-1 (Frankfurt, EU)** per D-20; PO-approved on 2026-10-27, including the legal question. PO statement: YBS previously operated using German hosting without issues. | ok |
| Cloudflare account (D-21) | LIFTER account only; no paid subscription | **LIFTER** (`c3a2ab30d3888eda7071b02916732b69`): **Free**, PO-confirmed on 2026-10-27. Account id pinned in both Wrangler configs; personal account never used for LIFTER. | ok |

### 1a. What the PO checks (read-only, dashboard)

**Completed on 2026-10-27**; results are recorded in section 1. The procedure below is retained for future eligibility checks. D-20 authorizes one LIFTER cloud project only; the current Free allowance is exhausted.

Supabase may also refuse a new project when another Owner or Administrator of
the same organization has exhausted their own Free quota. Eligibility therefore
assumes a dedicated LIFTER organization whose only Owner is the PO and which has
no other Administrators; otherwise, check every Owner's and Administrator's quota
across their organizations before treating the organization as eligible.

1. Go to supabase.com/dashboard and open **every** organization listed. For each one, note your role (Owner/Administrator/Developer/Read-only) and its plan.
2. In each org where you're Owner/Administrator: count the Free-plan projects whose status is **active** (not paused).
3. Eligible for one new LIFTER project if that total is ≤ 1. Eligible for staging + prod if it's 0.
4. Don't pause, delete or transfer anything to make room. Bring the numbers back. Creation then needs your confirmation of the exact org name, project name(s) and region.

## 2. Limits

| Limit | Official value (source, checked) | Measured / projected | % | Source type | Verdict | Exit option |
|---|---|---|---|---|---|---|
| Workers requests/day | 100,000 (Cloudflare Workers limits, 2026-10-27) | — | — | dashboard after deploy | pending approval | Workers Paid (~$5/mo) |
| Workers CPU per HTTP request | 10 ms (same) | per route: `free-tier:tail` | — | measured after deploy | pending approval | Workers Paid / split static from API |
| Web Worker size | 64 MiB uncompressed (same) | 4,783.93 KiB (gzip 997.74 KiB), `main` + F8 | 7.30% | measured offline | ok | split Workers |
| Cron Worker size | 64 MiB uncompressed (same) | 2.85 KiB (gzip 1.25 KiB) | 0.00% | measured offline | ok | — |
| Supabase DB size | 500 MB ([pricing](https://supabase.com/pricing), 2026-10-27) | local stack with test fixtures: 13,039,283 bytes (mostly platform baseline); projection blocked on ND-F8-1 | 2.61% (local) | measured offline; projection pending | ok (local); projection pending | Supabase Pro (from $25/mo) |
| Supabase egress | 5 GB + 5 GB cached (same) | — | — | dashboard after deploy | pending approval | Pro |
| Supabase storage | 1 GB (same) | 0 buckets today (F7) | 0% | measured offline | ok | R2 overflow |
| Supabase Auth MAU | 50,000 (same) | — | — | dashboard after deploy | pending approval | — |
| Active Free projects | 2 per person across orgs (billing doc) | 2/2: YBS 1 + LIFTER 1 (section 1); no further Free project | 100% | confirmed eligibility, 2026-10-27 | warn (allowance exhausted) | PO decision; paid service requires approval |
| Inactivity pause | after 1 week (pricing) | cron Worker every minute keeps activity once deployed | — | design | pending approval | — |
| Automatic backups | not included on Free (pricing) | F7 encrypted local backup tooling prepared; first real encrypted backup + restore test awaits PO age identity (ND-F7-2; see readiness list) | — | design; real drill outstanding | OPEN (real drill) | — |
| Auth default SMTP | team-member addresses only, ~2 messages/hour, not for production ([auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp), 2026-10-27) | F4 sends no email (manual recovery links) | — | design | ok while no SMTP | custom SMTP (ND-F4-7) |

## 3. Projection inputs (ND-F8-1)

Pilot volumes: the illustrative input is decided by S31-PO-4 (ND-F8-1). Verify schema and units before measurement; `free-tier:project` projection remains pending that verification.

Outstanding production gates: [07-production-readiness.md](07-production-readiness.md). They do not block local development or PR merges (PO 2026-10-27).

## 4. Sign-off

| Item | Value |
|---|---|
| Measured by / date | Claude (reviewer), 2026-10-27, local only |
| Environment(s) | local only (until approval) |
| PO decision | |
