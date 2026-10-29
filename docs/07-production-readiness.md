# LIFTER — Production Readiness (outstanding)

The table below records the PO-approved gates as they stood on 2026-10-27; its statuses are historical, not a current readiness report. Use [docs/13-production-readiness.md](13-production-readiness.md) for current status and Go-Live sign-off. These gates do not block local development or ordinary PR merges. Any deployment, cloud migration or paid service separately requires explicit PO approval.

D-20 approves Frankfurt (`eu-central-1`), including the legal question: YBS previously operated using German hosting without issues. The dedicated LIFTER org (`qsxknusdawhqqhnqfalf`, plan free verified via API) has one cloud project, `lifter-prod` (`aaxswvjjxdmwbhgcgjyo`, ACTIVE_HEALTHY). Development/testing use local Docker; there is no cloud staging project. Both PO Free slots are used (YBS 1 + LIFTER 1). D-21 fixes the Cloudflare target to the LIFTER Free account (`c3a2ab30d3888eda7071b02916732b69`), PO-confirmed with no paid subscription and pinned in both Wrangler configs; the personal account is never used. Nothing deployed; no cloud migrations.

| Item | Source/decision id | Status | What closes it | Blocks |
|---|---|---|---|---|
| Client closure retention period | B4 (remaining), D-20 | OPEN | PO approves the retention period. | Production with real client data |
| Audit retention | B4 (remaining), ND-F5-1 | OPEN | PO approves the audit retention period. | Production with real client data |
| Remaining F4 decisions | ND-F4-1, ND-F4-2, ND-F4-5, ND-F4-6 | OPEN | PO explicitly resolves each decision; no policy defaults are approved. | Production with real client data |
| Recovery link expiry | ND-F4-3; PO 2026-10-29 | DECIDED — 60 minutes in all environments; single-use; issuing a replacement invalidates earlier unused links for the same account and purpose | Set explicitly (`otp_expiry = 3600`, branch `recovery-timers`, pending merge) and verify the hosted Auth email OTP expiry is 3600 seconds before production. Distinct from the recovery-session window. | Production with real client data |
| Recovery rate limits | ND-F4-4 | OPEN | PO approves rate limits. | Production with real client data |
| Recovery-session window | F4; PO 2026-10-27; PO 2026-10-29 (ND-F4-3) | DECIDED — 15 minutes in all environments (enforced: `RECOVERY_SESSION_MAX_AGE_SECONDS = 900` in `lib/auth/recovery-session.ts`) | Independent of link expiry: a link verified before it expires starts a fresh 15-minute session. Password recovery never changes client approval status. | Production with real client data |
| Self-service email reset / SMTP | ND-F4-7 | OPEN | PO approves SMTP configuration and self-service email reset; configure and validate SMTP after approval. | Production self-service email reset with real client data |
| Pilot volumes | ND-F8-1 | OPEN | PO confirms clients per workspace, workspaces, staff, plans and versions per client per month. | Production capacity validation with real client data |
| Deployment approval for measured run | ND-F8-2; D-20/D-21 | OPEN | Explicit PO approval for the measured deployment to the approved LIFTER targets; target selection alone is not deployment approval. | Deployment and production measurements |
| Dedicated test account | ND-F8-3; D-20 | OPEN | PO authorizes a dedicated test account and its use for authenticated route measurements; local Docker or approved lifter-prod only. | Production authenticated route validation |
| Staging restore drill (revised target) | ND-F7-2; D-20 | OPEN | Complete and record the restore drill against local Docker, or lifter-prod only with explicit PO approval; no cloud staging project. | Production with real client data |
| First real encrypted backup + restore test | D-14; F7 / ND-F7-2 | OPEN — needs PO age identity | PO supplies the age identity through the approved local key-custody process; complete and record the encrypted backup and successful restore test. | Production with real client data |
| Explicit PO approval for any deployment, cloud migration or paid service | PO 2026-10-27; ND-F8-2 | OPEN | Explicit PO approval for the specific action before it occurs. | Any deployment, cloud migration or paid service |
