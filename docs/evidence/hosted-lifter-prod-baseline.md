# Hosted `lifter-prod` pre-production baseline

Observed: 2026-11-23 UTC. Target: Supabase project `lifter-prod`, ref `aaxswvjjxdmwbhgcgjyo`. This evidence is pre-production only. No client data or synthetic fixtures were created or loaded. The project was treated as empty. No schema push was performed.

Authority: S70-PO-1 items 2 and 6; S70-PO-3; S70-PO-4. PO states Egyptian legal advice was obtained. Retention for client, audit, payment, refund, and invoice data is 30 days. Record no counsel identity or legal-document details.

## Project and schema baseline

| Check               | Observed evidence                                                                                                                                                                                                                                                                                                                                                                                                      | Gate mapping                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Project             | `supabase projects list` returned ref `aaxswvjjxdmwbhgcgjyo`, region `eu-central-1`, status `ACTIVE_HEALTHY`. Plan is Free per S70-PO-3; the CLI list does not expose a plan field.                                                                                                                                                                                                                                    | PI-01; PI-02 remains open for any deployment action. |
| Migration inventory | `supabase migration list --linked`: 348 local migrations, first `20261027120000`, last `20261218010000`; versions are unique and strictly ascending. Remote applied count: 0. Eleven versions contain out-of-range minute values; all 11 are documented merged exceptions in `scripts/check-migration-timestamps.mjs`, and the hosted branch CI timestamp validation passed. This docs-only branch adds no migrations. | AI-01; PI-02; CS-02.                                 |
| Dry run             | `supabase db push --linked --dry-run` listed the pending migrations and reported a dry run; no remote migration was applied. Do not treat this as approval to push.                                                                                                                                                                                                                                                    | PI-02; AI-01; BR-03.                                 |

## Hosted service settings

| Check                    | Observed evidence                                                                                                                                                                                                                                                                                                                                             | Gate mapping                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Auth comparison          | Read-only `supabase config pull --dry-run` queried the linked project without writing config. Hosted signup is enabled; email confirmations are enabled; email OTP length is 8 and send frequency is `1m0s`. Hosted Custom Access Token hook is disabled; Send Email hook is disabled. The comparison did not expose JWT expiry or SMTP configuration fields. | AI-01; AI-03; AI-04; AI-05. |
| SMTP and verified sender | SMTP presence and Mail Sender verification were not exposed by the read-only CLI config comparison. Treat as unverified; staff password recovery remains disabled until SMTP and a verified Mail Sender are configured and tested (S70-PO-1 item 2).                                                                                                          | AI-03; AI-05.               |
| SSL enforcement          | Supabase CLI read returned database SSL enforcement `false`, successfully applied.                                                                                                                                                                                                                                                                            | PI-01; AI-01.               |
| Network restrictions     | Supabase CLI read returned applied restrictions with one IPv4 and one IPv6 CIDR; both allow all sources (`0.0.0.0/0` and `::/0`). No pending restriction change.                                                                                                                                                                                              | PI-01; PI-03.               |
| Pooler mode              | Not independently reported by the CLI read-only config comparison. Record as unverified; do not infer it from local configuration.                                                                                                                                                                                                                            | PI-01; PI-03.               |

## Free-tier constraints

The PO supplied the Free plan. Supabase documents that Free projects do not include automatic daily database backups; manual CLI exports are possible. PITR is a paid-plan add-on. A Free project may pause after a week with too little database activity. These limitations keep backup and restore gates open. [Free-plan backups](https://supabase.com/kb/faqs/platform/free-plan-backups), [database backups and PITR](https://supabase.com/docs/guides/platform/backups), [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

| Evidence                                                                                                                                                                                   | Gate mapping                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| No automatic daily backup or PITR entitlement on Free; encrypted backup, restore, and all-copy retention evidence are still required.                                                      | BR-01; BR-02; BR-03; BR-04; FN-03; FN-04. |
| 30-day retention value is approved for client, audit, payment, refund, and invoice data. All-copy/backup proof is still open; purge scheduling remains deferred pending its prerequisites. | DP-01; DP-02; DP-06; BR-04; OP-01; FN-04. |
| Low activity may pause the project after one week.                                                                                                                                         | PI-01; PI-03.                             |

## PO and platform actions still open

- PO approval for any real schema push to this target is separate and still required (PI-02). The 11 out-of-range minute values are documented merged exceptions in `scripts/check-migration-timestamps.mjs`; do not edit those merged migrations.
- Configure external SMTP, verify the Mail Sender, and test email delivery before enabling staff password recovery (AI-03, AI-05; S70-PO-1 item 2).
- After schema push approval and application of the schema, enable and verify the Custom Access Token hook in hosted Auth (AI-01).
- Provision hosted Vault values `SIGNUP_RATE_KEY` and `SIGNUP_ATTEST_KEY` through the approved secret procedure and revoke Vault API-role grants (AI-02). Do not record secret values.
- Restrict database network CIDRs and enable SSL enforcement through the platform dashboard/API after the responsible owner approves the configuration (PI-01). Verify pooler mode before relying on it (PI-03).
- Complete approved encrypted DB and Storage backup/restore, key custody, staging restore, and 30-day all-recoverable-copies evidence (BR-01 through BR-04; FN-03/FN-04). No backup gate is closed by this baseline.
- PI-03 pilot capacity, PI-04 measurement authorization, and PI-05 test-account approval remain open.

## Gate status from this evidence

Only PI-01's approved hosting target/region is already marked Done in `docs/13-production-readiness.md`. This baseline adds evidence but does not close any open gate or mark the project Production Ready. The project's Free plan, open backup gates, unrestricted database CIDRs, disabled SSL enforcement, unverified SMTP/sender and pooler mode, and unapplied schema all remain pre-production blockers.

## Smoke tests

Observed: 2026-11-24 UTC. Target: hosted pre-production project `lifter-prod`, ref `aaxswvjjxdmwbhgcgjyo`. Authority: S70-PO-6 and S70-PO-7; S70-PO-1 items 2 and 6.

### Custom Access Token hook

The hosted Auth config now reports the Custom Access Token hook enabled with URI `pg-functions://postgres/public/custom_access_token_hook`, matching `supabase/config.toml`. The change was limited to the CAT enabled flag and URI. No sign-in or refresh token-issuance test was run.

T020 remains open and unchecked. The negative test fixture requested for this lane is a deactivated staff user, while FR-019 specifies blocking deactivated clients and passing staff claims unchanged. The conflicting expectation is recorded as S70-HOSTEDSMOKE-MCQ-1 in the lane report. No staff-deactivation behavior was inferred. Active staff/client issuance controls were not run because the task's negative case is unresolved.

### Hosted RLS smoke

The remote migration inventory reported 349 applied migrations. Before and after the smoke, `auth.users` and every touched application table below had a count of zero.

Two synthetic workspace-owner claim contexts were used, one per workspace. Fixtures covered clients, client-trainer assignments, packages and offers, forms and answer drafts/revisions, and audit events. The database query ran with transaction-local `authenticated` and `anon` roles and synthetic JWT claim settings. Fixture insert triggers/foreign-key triggers were disabled only inside the smoke transaction to permit direct RLS fixture setup. Temporary SELECT grants to authenticated and anon were also applied only in that transaction so those database roles could exercise row policies. The transaction was intentionally rolled back after assertions, removing fixtures and grants. This checks row visibility and does not validate application writers or GoTrue-issued JWTs.

| Table/read path                           | Workspace A owner | Workspace B owner | Anon |
| ----------------------------------------- | ----------------- | ----------------- | ---- |
| `client_trainer_assignments`              | A: 1, B: 0        | B: 1, A: 0        | 0    |
| `packages`                                | A: 1, B: 0        | B: 1, A: 0        | 0    |
| `audit_events`                            | A: 1, B: 0        | B: 1, A: 0        | 0    |
| `clients` direct table read               | A: 0, B: 0        | B: 0, A: 0        | 0    |
| `form_answer_drafts` direct table read    | A: 0, B: 0        | B: 0, A: 0        | 0    |
| `form_answer_revisions` direct table read | A: 0, B: 0        | B: 0, A: 0        | 0    |

Direct reads of `clients` and answer tables returned no rows even for the owning workspace; these tables do not expose direct reads to authenticated callers. The synthetic claims and all fixture rows were transaction-scoped and rolled back. Post-smoke counts were zero for `auth.users`, `staff_profiles`, `workspaces`, `workspace_memberships`, `clients`, `client_trainer_assignments`, `packages`, `package_offers`, `package_versions`, `forms`, `form_versions`, `form_assignments`, `form_answer_drafts`, `form_answer_revisions`, and `audit_events`. No persistent fixture remains; the CAT hook is the only Auth setting changed.
