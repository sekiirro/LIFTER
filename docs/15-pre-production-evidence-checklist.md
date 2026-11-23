# Pre-Production Evidence Checklist

## Purpose and authority

This is the ordered, dependency-sorted execution checklist for the hosted-Supabase build-out and for closing every **open** gate row in the production register [`docs/13-production-readiness.md`](13-production-readiness.md) (source head `212b6026b462e0d70a763a7d1fdfcd6b7ebe91b0`). It was prepared under **S70-PO-1 item 6** ("Supabase: Set up real hosted project; prepare ordered pre-production evidence checklist covering all open `docs/13-production-readiness.md` gates"), with two directly related PO decisions applied: **S70-PO-1 item 2** (staff password recovery stays disabled until SMTP + a verified Mail Sender are configured and tested) and **S70-PO-1 item 3** (client-data and audit retention set to **30 days**, subject to Egyptian legal requirements for financial/audit records).

Authority record: `C:/Users/NEW LAP/.lifter/runs/s70-po/s70-po-1.verbatim.txt`, SHA-256 `D8E0EAF354F3923630BA38CD258EDD8E94DD63B86D9345405D40A520A790F20E`. Citations are written "S70-PO-1 item N". No product, scope, copy, legal, or default decision is made by this document; where a decision is required, the step names the PO as owner and the decision itself stays with the PO.

### HARD RULE — read before doing anything

**No real client data may be loaded into any hosted environment until every gate in this checklist is closed with verified evidence and the PO has given explicit Go-Live approval naming the exact release head, target, and action. A merged PR, a `Done` row, or this checklist does not grant that approval.** Until then, work only with synthetic/test data on a non-production hosted project or local Docker.

## How to use this checklist

- Steps are numbered `S01`…`S20` in dependency order. Do not start a step before its **Depends on** prerequisites are closed; the order encodes the gate dependencies in `docs/13` (PO decisions → hosted project → schema → identity/config → data protection → verification → final authorization).
- Each step states the **Owner** as `PO` (decision/approval) and/or `Agent` (implementation/evidence lane — platform, Fxx, CI, or infra), the concrete **Evidence artifact** to attach, and the objective **Pass criterion**. No step requires reading a secret or recording a secret value; evidence is scrubbed.
- A gate is closed only when its evidence artifact exists on the exact release head and its pass criterion is met. Cross-referenced gates listed in `docs/13` stay open until every referenced row is closed.
- `docs/13` rows `PI-01` and `PI-06` are `Done` on the source head and are therefore **not open gates**; they are excluded from the coverage table as required by the register's own status legend. Every other row of `docs/13` (38 gates) is covered below.

---

## Ordered, dependency-sorted steps

### S01 — PO scope, target and pre-production decisions sign-off

- **Depends on:** none (first step).
- **Gates cited:** PI-02, PI-03, PI-04, PI-07 (and the GO-LIVE checklist item 1 of `docs/13`).
- **Owner:** PO (with platform input from Agent for volumes).
- **Evidence artifact:** Written PO approval naming the hosting target/region, the specific paid/deployment action, the exact release head, and the approved pilot volumes (clients/workspaces/staff/plans/versions); plus a recorded pre-production decision on the feature-flag policy (PO S56-PO-4).
- **Pass criterion:** All named approvals are recorded and dated; pilot volumes are PO-approved; the feature-flag decision is recorded. Target approval is explicitly **not** treated as deployment approval. PI-02 remains open until S20 closes it with the exact-head Go-Live approval.

### S02 — Create the hosted Supabase project in the PO-chosen region/plan

- **Depends on:** S01.
- **Gates cited:** PI-02 (target), PI-01 (Done baseline — approved Frankfurt region / LIFTER Free targets, re-checked here).
- **Owner:** PO chooses/confirms region and plan; Agent creates the project.
- **Evidence artifact:** Project-creation record with project ref, region, plan, and PO confirmation; no credentials or secrets in the artifact.
- **Pass criterion:** A hosted project exists in the PO-chosen region/plan, the ref is recorded, and the PO choice is evidenced. No client data is loaded.

### S03 — Apply and verify migrations on the hosted project

- **Depends on:** S02.
- **Gates cited:** hosted-Supabase setup step "migration apply/verification" (S70-PO-1 item 6); supports AI-01, SB-04.
- **Owner:** Agent.
- **Evidence artifact:** Migration apply log with applied versions, the forward-only version check output, and a schema-verification query result (no secret values).
- **Pass criterion:** All migrations apply cleanly on the hosted target, applied versions match the repository, the forward-only check passes, and the verification query confirms the expected schema.

### S04 — RLS smoke test on the hosted project

- **Depends on:** S03.
- **Gates cited:** hosted-Supabase setup step "RLS smoke" (S70-PO-1 item 6); supports SB-01 (Storage RLS), DP-05.
- **Owner:** Agent.
- **Evidence artifact:** RLS smoke-test results covering anon/authenticated/service roles and cross-workspace denial, with counts/booleans only.
- **Pass criterion:** No unintended cross-workspace or anon reads/writes; every policy under test behaves as specified; Storage RLS is included.

### S05 — Hosted Auth compatibility, recovery timers and session lifetime

- **Depends on:** S03, S04.
- **Gates cited:** AI-01, AI-04, ND-F4-3.
- **Owner:** Agent (verification) + PO (approval / ND-F4-3 decision already recorded as defer-and-track).
- **Evidence artifact:** Hosted Auth version, required DML permissions and upgrade-allowlist evidence; PO approval; record that merged `otp_expiry = 3600` and the boundary test are intact; hosted email-OTP expiry verification; and evidence that recovery-session lifetime is enforced across authenticated routes/actions and Auth API, the session is terminated at expiry, and GoTrue reauthentication settings are verified.
- **Pass criterion:** Hosted Auth version/permissions/upgrade allowlist are recorded with PO approval; hosted OTP expiry matches 60 minutes; session lifetime cannot be bypassed by a direct GoTrue `updateUser`; the ND-F4-3 security blocker is either closed with this evidence or explicitly tracked open by PO decision (record discrepancy RD-1).

### S06 — Provision hosted Vault values and revoke API-role grants

- **Depends on:** S02, S03.
- **Gates cited:** AI-02.
- **Owner:** Agent (platform/security) with PO-approved provisioning procedure.
- **Evidence artifact:** PO-approved provisioning procedure, proof of least privilege, and proof that Vault API-role grants are revoked; **never** record secret values (`SIGNUP_RATE_KEY`, `SIGNUP_ATTEST_KEY`).
- **Pass criterion:** Both Vault values exist on the hosted project, grants are revoked, and the procedure and revocation are evidenced without exposing secrets.

### S07 — Verify and enable the Custom Access Token hook

- **Depends on:** S05, S06.
- **Gates cited:** F13-PB-03.
- **Owner:** Agent (verification + production enable) + PO (explicit approval).
- **Evidence artifact:** Non-production hosted hook-verification record; explicit PO approval to enable on hosted production; production hook-active proof; and synthetic deactivated-client sign-in and token-refresh denial evidence.
- **Pass criterion:** The hook is verified on a non-production hosted project **before** production enablement; PO approval is on the exact release head; on production the hook is active and a synthetic deactivated client is denied at sign-in and refresh. This gate is Go-Live phase and stays open until S20.

### S08 — Configure SMTP and a verified Mail Sender for F4 recovery

- **Depends on:** S05.
- **Gates cited:** AI-03 (ND-F4-7 / FR-020), ND-F4-3; **S70-PO-1 item 2**.
- **Owner:** Agent (platform configuration + test) + PO (approval).
- **Evidence artifact:** SMTP configuration record, verified Mail Sender proof, test recovery to permitted addresses (rate limit 2/hour), PO decision register, and evidence that staff password recovery remains disabled until this test passes.
- **Pass criterion:** External SMTP is configured and the Mail Sender is verified; recovery is tested on permitted addresses; rate limits are approved/enforced; general rollout remains gated and staff recovery is **not** enabled before these tests pass, per S70-PO-1 item 2.

### S09 — Hosted Storage: identities, RLS, capacity and limits

- **Depends on:** S03, S04.
- **Gates cited:** SB-01, SB-02, SB-03, SB-04, SB-05.
- **Owner:** Agent (F14 + CI + platform/security) + PO (approvals/dimensions).
- **Evidence artifact:** Hosted compatibility proof for `branding_proxy` / `branding_validator` identities, credential expiry/revocation, cross-workspace denial, F10 checks, render handles, Storage RLS and proof public paths never use service-role fallback; Storage/egress allowances, workload model, benchmark results and the approved 70% exit action; reviewed prototype and PO-approved Hero Banner dimensions/variants; required Storage-enabled CI lane evidence with zero skips; and the PO-approved pre-launch step adding the username check constraint plus real-account audit before first production signup.
- **Pass criterion:** Both restricted identities work on hosted without service-role fallback; credentials are expiring/revocable; Storage policies pass in local/CI and hosted with zero skips; capacity and 70% trigger are approved; dimensions are PO-approved; the check constraint/audit step is scheduled before first production signup.

### S10 — Configure PITR/backups and encrypted backup evidence

- **Depends on:** S03, S06.
- **Gates cited:** BR-01, BR-02, FN-03 (backup half).
- **Owner:** PO (key custody) + Agent (platform).
- **Evidence artifact:** Scheduled-backup configuration, PITR/backup settings, key custody/rotation procedure, and the first real encrypted DB backup with integrity checks (no key material recorded).
- **Pass criterion:** Encrypted DB (and Storage) backups run on an approved schedule with PITR enabled, key custody is approved, and a real encrypted backup completes with integrity checks. Restore proof is closed in S14.

### S11 — Keep pg_cron disabled until PO approval

- **Depends on:** S01, S03, S06, S10.
- **Gates cited:** OP-01.
- **Owner:** Agent keeps activation disabled; PO must approve before activation.
- **Evidence artifact:** Proof that the purge schedule is **not** active on hosted; on approval, PO record and the scrubbed activation run output (exactly one `lifter-f11-purge-signup` job, schedule `0 * * * *`, expected command, `active = true`, `username = postgres`, one successful scheduled run, counts-only cleanup audit); deactivation procedure noted.
- **Pass criterion:** No purge job is active before explicit PO approval, **and** OP-01 is not closed while pg_cron is unapproved. After approval, activation follows the exact `docs/13` sequence (`begin; select app_private.purge_schedule_activate(); commit;`) and the recorded job state matches the gate.

### S12 — Log redaction across all paths

- **Depends on:** S05, S09, S10.
- **Gates cited:** DP-03, DP-05, OP-03.
- **Owner:** Agent (platform + F10/F11) .
- **Evidence artifact:** Sanitized proof from each enabled production log path — application, worker, database and host/platform access logs — showing token-bearing paths omitted/redacted and no raw IP, `ip_key`, tokens, secrets, or client health data; approved expiring HMAC counters preserved.
- **Pass criterion:** Every enabled log path is covered and contains no token, secret, health data, raw IP, or `ip_key`.

### S13 — 30-day retention proof and Egyptian legal confirmation

- **Depends on:** S01, S11, S10.
- **Gates cited:** DP-01, DP-02, DP-06, FN-04 (retention dependencies); **S70-PO-1 item 3**.
- **Owner:** PO (retention value + Egyptian legal confirmation) + Agent (implementation/test evidence).
- **Evidence artifact:** PO-approved 30-day value for client-data and audit retention; Egyptian legal confirmation for financial/audit records; implemented and tested closure behavior; audit-history evidence; and the refund Auth-state retention/purge dependency record from DP-06 (disable/ban Auth user and confirm, stop/complete pending refund retries, then remove/anonymize `app_private.client_deactivation_state` and `app_private.refund_auth_lockouts`, then purge Auth user).
- **Pass criterion:** The 30-day period is approved and implemented for both client data and audit history, closure behavior is tested, Egyptian legal confirmation for financial/audit records is attached, and the DP-06 purge feasibility/retention evidence is recorded. Egyptian legal confirmation is a named external approval — if still pending, the gate stays `Prepared`/open and is recorded as PO-DECISION-NEEDED rather than assumed.

### S14 — Restore drill and refund reconciliation

- **Depends on:** S10, S13, S09.
- **Gates cited:** BR-03, BR-04, F13-PB-01, FN-03 (restore half).
- **Owner:** Agent (platform/F13/F14) + PO (approval if production infra is used).
- **Evidence artifact:** Successful restore drill against local Docker (or `lifter-prod` only with explicit PO approval; **no cloud staging project**), sanitized evidence, F14 Storage backup/restore and reference/audit integrity evidence, and full/partial refund reconciliation proof (corrections, commissions, cancellations, terminal-state races, immutable history).
- **Pass criterion:** A real encrypted backup is restored successfully with integrity checks on the approved environment; Storage backup/restore and refund reconciliation are proven before real financial use; explicit PO approval is attached if production infrastructure was used.

### S15 — Finance operational readiness

- **Depends on:** S13, S14, S05, S06.
- **Gates cited:** FN-01, FN-02, FN-04.
- **Owner:** Agent (F12/F10 + finance operator) + PO (approval).
- **Evidence artifact:** PO-only F12 correction-reversal runbook and its executed evidence (exact amount/commission reversal, original event unchanged, unpaid obligation restored, receipt-idempotent replay, audit, no partial reversal); immutable exact-total installment schedules with first installment at approval and later ones only after activation, Cairo dates, no due date before activation; and the cross-reference closure record for FN-04.
- **Pass criterion:** Correction reversal is operational and proven; installment behavior matches issued F10 terms; and every cross-referenced gate in FN-04 (AI-01/02, DP-01/02, BR-01/02, PI-02, F13-PB-01, F13-PB-03) is closed before hosted real-finance enablement with PO approval of the exact target.

### S16 — P4 consumer and Frontend Design Gate evidence

- **Depends on:** S09.
- **Gates cited:** F13-PB-02.
- **Owner:** Agent (F13/P4 owners) + PO.
- **Evidence artifact:** Evidence of real P4 activation/enforcement/notification consumers and the Frontend Design Gate ([`docs/09-frontend-design-gate.md`](09-frontend-design-gate.md)) result.
- **Pass criterion:** Real consumers and the Design Gate evidence exist before any client-facing freeze/renewal exposure.

### S17 — CI / supply-chain gates

- **Depends on:** S15, S16 (release head fixed).
- **Gates cited:** CS-01, CS-02, CS-03.
- **Owner:** Agent (CI/release owner) + PO (secrets).
- **Evidence artifact:** H4 credential-optional-login commit and CI run showing the login step is skipped when secrets are absent, then PO-added `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` and a CI run showing successful login (values never recorded); exact-head `push` run with `headSha == headRefOid` and matching `pull_request` merge-result run with security checks green; green secret scan/build and reviewed dependency/workflow diff on the exact release head.
- **Pass criterion:** Credentialed pulls are proven both with and without secrets; exact-head CI gates are green; dependency/build provenance is preserved and no secrets appear in source or output.

### S18 — APP_ORIGIN and F10 decision closure

- **Depends on:** S05, S06.
- **Gates cited:** OP-02, DP-04.
- **Owner:** Agent (platform + F10/F11) + PO (decisions/approval).
- **Evidence artifact:** Approved HTTPS `APP_ORIGIN` on the actual production host with end-to-end link-open proof (path/query/fragment/userinfo rejected); PO decisions for ND-F10-1..5 including issuance-rate limits (ND-F10-3), allowed public content, revocation, and price visibility, with production limits enforced.
- **Pass criterion:** Links open only the intended HTTPS origin; all ND-F10 items are PO-decided and enforced, with no local/dev placeholder promoted.

### S19 — Dedicated test account and capacity/measurement authorization

- **Depends on:** S01, S02.
- **Gates cited:** PI-03, PI-04, PI-05.
- **Owner:** PO + Agent (platform).
- **Evidence artifact:** PO authorization and least-privilege test-account record (local Docker or the specifically approved production target only); PO-approved pilot volumes with a dated measurement at those volumes; explicit authorization for the measured run with limits recorded without secrets.
- **Pass criterion:** The test account is approved and least-privilege; pilot volumes are measured and recorded; the measurement run is explicitly authorized.

### S20 — Final Go-Live authorization (hard stop)

- **Depends on:** S01, S07, S15, S17 (all other steps closed).
- **Gates cited:** PI-02, FN-04, F13-PB-03, CS-02 (and GO-LIVE checklist items 2–7 of `docs/13`).
- **Owner:** PO.
- **Evidence artifact:** Complete evidence pack attached to the exact release head; merge/release gate result from [`docs/08-agent-workflow.md`](08-agent-workflow.md); explicit PO Go-Live approval naming the head, target, and action.
- **Pass criterion:** Every gate in this checklist is closed with verified evidence on the exact head, current merge/release gates pass, and the PO has issued explicit Go-Live approval. **Only after this step passes may real client data be loaded.**

---

## Coverage table — every open gate in `docs/13` (none omitted)

| Gate ID (docs/13) | Status on source head | Step(s) in this checklist |
| ----------------- | --------------------- | ------------------------- |
| PI-02             | Open                  | S01, S20                  |
| PI-03             | Open                  | S01, S19                  |
| PI-04             | Open                  | S01, S19                  |
| PI-05             | Open                  | S19                       |
| PI-07             | Open                  | S01                       |
| AI-01             | Open                  | S05                       |
| AI-02             | Open                  | S06                       |
| AI-03             | Open                  | S08                       |
| AI-04             | Open                  | S05                       |
| ND-F4-3           | Open                  | S05, S08                  |
| DP-01             | Open                  | S13                       |
| DP-02             | Open                  | S13                       |
| DP-03             | Open                  | S12                       |
| DP-04             | Open                  | S18                       |
| DP-05             | Open                  | S12                       |
| DP-06             | Open                  | S13                       |
| F13-PB-01         | Open                  | S14                       |
| F13-PB-02         | Open                  | S16                       |
| F13-PB-03         | Open                  | S07, S20                  |
| FN-01             | Open                  | S15                       |
| FN-02             | Open                  | S15                       |
| FN-03             | Open                  | S10, S14                  |
| FN-04             | Open                  | S15, S20                  |
| SB-01             | Open                  | S04, S09                  |
| SB-02             | Open                  | S09                       |
| SB-03             | Open                  | S09                       |
| SB-04             | Open                  | S09                       |
| SB-05             | Open                  | S09                       |
| CS-01             | Open                  | S17                       |
| CS-02             | Open                  | S17, S20                  |
| CS-03             | Open                  | S17                       |
| OP-01             | Open                  | S11                       |
| OP-02             | Open                  | S18                       |
| OP-03             | Open                  | S12                       |
| BR-01             | Open                  | S10                       |
| BR-02             | Open                  | S10                       |
| BR-03             | Open                  | S14                       |
| BR-04             | Open                  | S14                       |

**Open gates covered: 38 / 38.** Excluded (not open, per the register's status legend): `PI-01` (Done), `PI-06` (Done).

## Coverage table — hosted-Supabase setup steps (S70-PO-1 item 6)

| Hosted-Supabase setup item                                    | Step(s)                       |
| ------------------------------------------------------------- | ----------------------------- |
| Project creation in PO-chosen region/plan                     | S02                           |
| Auth hooks incl. Custom Access Token hook                     | S07 (hook), S05 (hosted Auth) |
| Vault                                                         | S06                           |
| SMTP + verified Mail Sender for F4 recovery                   | S08                           |
| Storage                                                       | S09                           |
| PITR / backups                                                | S10                           |
| pg_cron kept disabled until PO approval                       | S11                           |
| Migration apply / verification                                | S03                           |
| RLS smoke                                                     | S04                           |
| Log redaction                                                 | S12                           |
| 30-day retention proof subject to Egyptian legal confirmation | S13                           |
| Restore drill                                                 | S14                           |
