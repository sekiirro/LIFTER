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

Observed: 2026-11-24 UTC. Target: hosted project `lifter-prod`, ref `aaxswvjjxdmwbhgcgjyo`. Authority: S70-PO-6, S70-PO-7, and cleanup authorization S70-PO-11. The hosted Custom Access Token hook remains enabled at `pg-functions://postgres/public/custom_access_token_hook`, matching `supabase/config.toml`; this lane did not change Auth configuration.

### T020 token issuance

Reused the five Auth users already tagged `synthetic_test=true` and `lane=s70-luna-hostedsmoke`; no Auth users were created. Following architect ruling S70-R39, the deactivated subject was a synthetic client. Deactivation used the same committed `client_deactivation_state` and `refund_auth_lockouts` fixture path covered by `tests/integration/refund-auth-lockout-hook.test.ts::denies client sign-in and refresh immediately after committed deactivation, even while lockout worker is unavailable`.

After deactivation, password sign-in returned HTTP 403 and refresh returned HTTP 403; neither response contained an access token. Positive controls passed: an active synthetic client and an active synthetic staff user both signed in successfully (HTTP 200). JWT inspection emitted claim names and `role=authenticated` only. No token or credential was printed or recorded. T020 is verified for the hosted smoke scope.

### Hosted RLS smoke

The owner of workspace A read A's client through `public.staff_client_directory` and A's form answer through the audited `public.read_form_answer`; both reads of B's corresponding data were denied. Workspace B's owner likewise read only B's client and answer. The anon form-answer call returned null. In the companion table-policy checks, cross-workspace reads were denied for `client_trainer_assignments`, `packages`, and `audit_events`, and anon saw zero rows. Direct table reads of clients and form-answer tables intentionally return no rows; direct client SELECT is revoked by `supabase/migrations/20261031121000_client_accounts_model.sql:79`. Supported readers are `supabase/migrations/20261118100200_f22_refund_scope_status.sql:90` and `supabase/migrations/20261112021100_f15_immutable_answer_corrections.sql:158`.

The supported-path fixtures ran inside an inner transaction that was rolled back after assertions. No persistent RLS smoke rows or grants remained.

### Cleanup and verification

Before cleanup, the five tagged users had 5 `auth.identities`, 3 `auth.sessions`, 3 `auth.refresh_tokens`, and 5 `app_private.account_identifier_claims`. Other synthetic rows: 3 `staff_profiles`, 2 `workspaces`, 2 `workspace_memberships`, 2 `clients`, 2 each of `packages`, `package_versions`, `package_offers`, and `registration_links`; 1 each of `app_private.client_deactivation_state` and `app_private.refund_auth_lockouts`; and 16 `audit_events`. `registration_link_installments`, `client_trainer_assignments`, `forms`, `form_versions`, `form_assignments`, `form_answer_drafts`, and `form_answer_revisions` were 0 before cleanup.

Under the one-time bypass authorized by S70-PO-11, one linked SQL transaction snapshotted the exact five lane-tagged Auth IDs, disabled only the 11 blocking protection triggers listed below, deleted only those IDs and the two workspaces plus their dependent synthetic rows, re-enabled the same triggers, asserted all target counts were zero and every trigger returned to `tgenabled='O'`, then committed. A fresh query verified `auth.users=0`, workspace slugs=0, synthetic client email matches=0, and all 11 protection triggers enabled. The transaction's per-ID/per-workspace assertions covered every Auth, claim, deactivation/lockout, staff, workspace/membership, client/assignment, package/offer/version, registration-link/installment, forms/answer, and audit table listed above; all were zero before commit.

Protection triggers temporarily disabled and restored (`tgenabled='O'` before and after): `app_private.account_identifier_claims.signup_no_delete`, `public.clients.signup_no_delete`, `public.audit_events.audit_events_immutable`, `public.package_offers.package_offers_no_delete`, `public.package_versions.package_versions_no_delete`, `public.packages.packages_no_delete`, `public.registration_links.registration_links_no_delete`, `public.staff_profiles.staff_profiles_no_delete`, `public.staff_profiles.staff_profiles_00_owner_count_guard`, `public.workspace_memberships.workspace_memberships_no_delete`, and `public.workspaces.workspaces_no_delete`. This was the S70-PO-11 one-time bypass; no other triggers or hosted settings were changed.
