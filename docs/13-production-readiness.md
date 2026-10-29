# LIFTER Production Readiness Register

## Purpose and use

This is the single current register of Production Blockers and Go-Live gates for LIFTER. It covers production with real client data, hosted operation, and the separately approved deployment action. A `Done` row closes only that row's evidence requirement; it does not imply that the system is Production Ready. Local development and ordinary PR merges remain governed by their own gates.

Review this register before any pre-production exercise or Go-Live decision. Keep the source link and evidence current. Anything not verified is `Open`. Items from unmerged feature branches are labeled `(pending merge of <branch>)`; their source is pinned to the observed remote head.

### Status legend

- **Open** - evidence, decision, or sign-off is missing or unverified.
- **Prepared** - setup or design is ready, but a named approval, secret, hosted proof, or execution remains.
- **Done** - the specific requirement has verified evidence. Other rows may still block release.

## Platform / Infrastructure

| ID | Blocker / gate | Source | Owner | Evidence required | Status | Phase |
|---|---|---|---|---|---|---|
| PI-01 | Approved hosting targets and region | [D-20/D-21](04-changes-and-questions.md); [architecture](02-architecture.md) | PO + platform | Confirm exact target/region and current approval in the release record; target selection alone is not deployment approval. | Prepared | Pre-Production |
| PI-02 | Explicit approval for the specific deployment, cloud migration, or paid service | [D-20/D-21 and ND-F8-2](07-production-readiness.md) | PO | Written PO approval naming the action, target, and release head before it occurs. | Open | Go-Live |
| PI-03 | Pilot volumes and production capacity validated | [ND-F8-1](07-production-readiness.md); [F8 validation spec](../specs/008-free-tier-validation/spec.md) | PO + platform | PO-approved clients/workspaces/staff/plans/versions volumes and a dated measurement at those volumes. | Open | Pre-Production |
| PI-04 | Production measurement run authorized | [ND-F8-2](07-production-readiness.md); [F8 validation spec](../specs/008-free-tier-validation/spec.md) | PO + platform | Explicit approval for the measured run against an approved target; measurements and limits recorded without secrets. | Open | Pre-Production |
| PI-05 | Dedicated authenticated-route test account approved | [ND-F8-3](07-production-readiness.md) | PO + platform | PO authorization and recorded least-privilege test account; use local Docker or the specifically approved production target only. | Open | Pre-Production |
| PI-06 | Stack B isolation for concurrent local feature validation | [docs/11 on `infra-second-stack` @ `d49880010e70ac03c4a264fc19610dfc443d7c55`](https://github.com/sekiirro/LIFTER/blob/d49880010e70ac03c4a264fc19610dfc443d7c55/docs/11-second-local-stack.md) (pending merge of `infra-second-stack`) | Infra lane | Isolation proof across lifecycle/reset/provisioning/integration; full local integration result recorded. | Done | Pre-Production |

## Auth & Identity

| ID | Blocker / gate | Source | Owner | Evidence required | Status | Phase |
|---|---|---|---|---|---|---|
| AI-01 | F11 C4 hosted Supabase Auth compatibility: verify hosted Auth version, required DML permissions, and upgrade allowlist; obtain PO approval | [F11 plan](https://github.com/sekiirro/LIFTER/blob/02b3f02b8bcd2cc52674bac435f78f3bfa07cee4/specs/011-client-accounts/plan.md#production-blockers), [Q-C4](https://github.com/sekiirro/LIFTER/blob/02b3f02b8bcd2cc52674bac435f78f3bfa07cee4/specs/011-client-accounts/quickstart.md), and [F11 verification](https://github.com/sekiirro/LIFTER/blob/02b3f02b8bcd2cc52674bac435f78f3bfa07cee4/tests/integration/client-accounts-verification.md) (pending merge of `011-client-accounts`) | F11 + PO | Hosted version/permission/upgrade evidence on the approved target; PO approval; local tests do not imply hosted proof or deployment. | Open | Pre-Production |
| AI-02 | Provision hosted Vault values `SIGNUP_RATE_KEY` and `SIGNUP_ATTEST_KEY`; revoke Vault API-role grants | [F11 plan](https://github.com/sekiirro/LIFTER/blob/02b3f02b8bcd2cc52674bac435f78f3bfa07cee4/specs/011-client-accounts/plan.md#production-blockers) (pending merge of `011-client-accounts`) | F11 + platform/security + PO | PO-approved hosted provisioning procedure and proof of least privilege plus Vault API-role grant revocation; never record secret values here. | Open | Pre-Production |
| AI-03 | Resolve inherited recovery decisions ND-F4-1..7: Trainer eligibility, delivery, expiry, rate limits, client-target sequencing, staff recovery, and SMTP/self-service reset timing | [ND-F4-1..7](../specs/004-auth/spec.md#needs-decision-owner-sub-decisions-not-invented-here); [D-19](04-changes-and-questions.md) | PO + F4 | Record PO decisions; approve expiry/rate limits and validate SMTP before real-client use. Resolve the source discrepancy: docs/07 cites a 15-minute recovery-session default while specs/004 cites the provider default of 60 minutes for local/dev; neither supplies a production value. | Open | Pre-Production |

## Data protection / Privacy

| ID | Blocker / gate | Source | Owner | Evidence required | Status | Phase |
|---|---|---|---|---|---|---|
| DP-01 | Decide client-closure retention period (B4 remaining) | [D-20 and docs/07](04-changes-and-questions.md); [Constitution VII](../.specify/memory/constitution.md) | PO | Approved jurisdictional retention value and implemented/tested closure behavior. | Open | Pre-Production |
| DP-02 | Decide audit retention period (ND-F5-1 / B4) | [D-20](04-changes-and-questions.md); [F11 verification](https://github.com/sekiirro/LIFTER/blob/02b3f02b8bcd2cc52674bac435f78f3bfa07cee4/tests/integration/client-accounts-verification.md) (pending merge of `011-client-accounts`) | PO + F11 | Approved retention value, policy implementation, and evidence that audit history meets it. | Open | Pre-Production |
| DP-03 | Redact registration tokens from host/platform access logs | [F10 surface contract](../specs/010-registration-links/contracts/registration-links-surface.md); [F11 production blockers](https://github.com/sekiirro/LIFTER/blob/02b3f02b8bcd2cc52674bac435f78f3bfa07cee4/specs/011-client-accounts/plan.md#production-blockers) | Platform + F10/F11 | Verify hosting access logs omit or redact token-bearing paths; retain sanitized proof. | Open | Pre-Production |
| DP-04 | Resolve inherited ND-F10-1..5, including issuance-rate limits (ND-F10-3), allowed public content, revocation, and price visibility | [F10 decision register](../specs/010-registration-links/spec.md#needs-decision-remain-open) | PO + F10 | PO decisions for each item; production limits approved and enforced; do not promote local/dev placeholders. | Open | Pre-Production |
| DP-05 | Keep raw IP and `ip_key` out of F11 logs/audit/telemetry; preserve approved expiring HMAC counters | [F11 verification](https://github.com/sekiirro/LIFTER/blob/02b3f02b8bcd2cc52674bac435f78f3bfa07cee4/tests/integration/client-accounts-verification.md) and [F11 privacy decisions](https://github.com/sekiirro/LIFTER/blob/02b3f02b8bcd2cc52674bac435f78f3bfa07cee4/specs/011-client-accounts/spec.md#po-decision-register-and-open-sub-decisions) (pending merge of `011-client-accounts`) | F11 + platform | Review production logs/telemetry and retain regression evidence showing no raw IP, `ip_key`, tokens, or client health data. | Open | Pre-Production |

## Finance

| ID | Blocker / gate | Source | Owner | Evidence required | Status | Phase |
|---|---|---|---|---|---|---|
| FN-01 | F12 PO-only payment correction reversal must be operational before real financial use | [F12 spec @ `89fe2a86e302df0ce585213071cdd26a39884077`](https://github.com/sekiirro/LIFTER/blob/89fe2a86e302df0ce585213071cdd26a39884077/specs/012-registration-approval/spec.md) (pending merge of `012-registration-approval`) | F12 + finance operator + PO | Exact amount/commission reversal, original event unchanged, unpaid obligation restored, receipt-idempotent replay, audit evidence, and operational runbook proven on approved environment. No partial reversal. | Open | Pre-Production |
| FN-02 | F12 installment agreement and collection behavior must match issued F10 terms and activation rules | [F12 spec @ `89fe2a86e302df0ce585213071cdd26a39884077`](https://github.com/sekiirro/LIFTER/blob/89fe2a86e302df0ce585213071cdd26a39884077/specs/012-registration-approval/spec.md) and [F10 spec](../specs/010-registration-links/spec.md) (F12 pending merge) | F10/F12 + PO | Evidence for immutable exact-total schedules, first installment at approval, later sequential installments only after activation, Cairo dates, and no due date before activation. | Open | Pre-Production |
| FN-03 | Verify financial backups and restore before real financial use | [D-14](04-changes-and-questions.md); [F7 backup spec](../specs/007-backups/spec.md); [F12 spec](https://github.com/sekiirro/LIFTER/blob/89fe2a86e302df0ce585213071cdd26a39884077/specs/012-registration-approval/spec.md) (F12 pending merge) | F7/F12 + PO | Successful encrypted backup and restore, plus reconciliation of immutable collections/reversals and audit evidence. | Open | Pre-Production |
| FN-04 | Hosted real-finance enablement remains blocked until F11 hosted identity, approved retention, backups, and the explicit deployment decision are closed | [F12 spec](https://github.com/sekiirro/LIFTER/blob/89fe2a86e302df0ce585213071cdd26a39884077/specs/012-registration-approval/spec.md), AI-01/02, DP-01/02, BR-01/02, and PI-02 | F11/F12 + platform + PO | All cross-referenced hosted and backup evidence is Done, correction reversal is operational, and PO approves the exact production target. | Open | Go-Live |

## Storage / Branding

| ID | Blocker / gate | Source | Owner | Evidence required | Status | Phase |
|---|---|---|---|---|---|---|
| SB-01 | Prove hosted `branding_proxy` / `branding_validator` identities, expiring/revocable credentials, F10 checks, render handles, and Storage RLS; no service-role fallback for public images | [F14 spec @ `ea6b048f274f3c513fca7202f947e5b299193187`](https://github.com/sekiirro/LIFTER/blob/ea6b048f274f3c513fca7202f947e5b299193187/specs/014-workspace-branding/spec.md) and [F14 tasks](https://github.com/sekiirro/LIFTER/blob/ea6b048f274f3c513fca7202f947e5b299193187/specs/014-workspace-branding/tasks.md) (pending merge of `014-workspace-branding`) | F14 + platform/security | Hosted compatibility proof for both restricted identities, credential expiry/revocation, cross-workspace denial, proxy checks, and proof public paths never use service-role fallback. | Open | Pre-Production |
| SB-02 | Measure Storage/egress capacity and establish the 70% exit trigger; set per-asset Logo/Banner limits from worst-case Workers CPU/memory benchmarks | [F14-3/F14-7](https://github.com/sekiirro/LIFTER/blob/ea6b048f274f3c513fca7202f947e5b299193187/specs/014-workspace-branding/spec.md) (pending merge of `014-workspace-branding`) | F14 + platform + PO | Verified Storage/egress allowances, workload model, benchmark results, and approved action at 70% usage. | Open | Pre-Production |
| SB-03 | Finalize Hero Banner dimensions after the Frontend Design Gate prototype review | [F14-2](https://github.com/sekiirro/LIFTER/blob/ea6b048f274f3c513fca7202f947e5b299193187/specs/014-workspace-branding/spec.md) and [Frontend Design Gate](09-frontend-design-gate.md) (pending merge of `014-workspace-branding`) | F14 + PO | Reviewed prototype and recorded PO-approved dimensions/variants. | Open | Pre-Production |
| SB-04 | Prove local/CI Storage policy and hosted Storage compatibility before production | [F14 FR-017 / SC-010](https://github.com/sekiirro/LIFTER/blob/ea6b048f274f3c513fca7202f947e5b299193187/specs/014-workspace-branding/spec.md) (pending merge of `014-workspace-branding`) | F14 + CI + platform | Required Storage-enabled CI lane with readiness checks, F11 pending-client denials, F14 bucket/path tests, zero skips, and hosted compatibility proof. | Open | Pre-Production |

## CI / Supply chain

| ID | Blocker / gate | Source | Owner | Evidence required | Status | Phase |
|---|---|---|---|---|---|---|
| CS-01 | Docker Hub authenticated pulls are prepared as credential-optional; do not rely on them until PO adds repository secrets | Architect-supplied CI readiness item; [CI workflow](../.github/workflows/ci.yml) | PO + CI | PO adds required secret names without exposing values; verify a CI run uses authenticated pulls and succeeds. No secret values in logs or this register. | Prepared | Pre-Production |
| CS-02 | Release head passes exact-head push CI and pull-request merge-result CI; required security checks are green | [docs/08 main merge gate](08-agent-workflow.md#main-merge-gate); [Constitution](../.specify/memory/constitution.md#development-workflow--quality-gates) | Feature owner + reviewer | Successful `push` run with `headSha == headRefOid` and successful `pull_request` run for the same head; security checks and applicable gates attached to release evidence. | Open | Go-Live |
| CS-03 | Preserve dependency/build provenance; no deployment credentials or secrets in source/output | [F1 CI spec](../specs/001-project-scaffold-ci/spec.md); [security exceptions](SECURITY_EXCEPTIONS.md); [CI workflow](../.github/workflows/ci.yml) | CI + release owner | Green secret scan/build and reviewed dependency/workflow diff on the exact release head. | Open | Go-Live |

## Operations / Observability

| ID | Blocker / gate | Source | Owner | Evidence required | Status | Phase |
|---|---|---|---|---|---|---|
| OP-01 | F11 purge scheduling uses Supabase `pg_cron`; job definitions exist, but activation is deferred to pre-production by PO (2026-10-29) | [F11 plan](https://github.com/sekiirro/LIFTER/blob/02b3f02b8bcd2cc52674bac435f78f3bfa07cee4/specs/011-client-accounts/plan.md#production-blockers) (pending merge of `011-client-accounts`) | F11 + platform + PO | **TODO: exact activation step is pending from F11 lane H5.** Record approved schedule, activate only in approved phase, prove execution/retention bounds and audit behavior. | Open | Pre-Production |
| OP-02 | Set and validate production `APP_ORIGIN` before issuing F10/F12 links | [F10 surface contract](../specs/010-registration-links/contracts/registration-links-surface.md); [F11 blockers](https://github.com/sekiirro/LIFTER/blob/02b3f02b8bcd2cc52674bac435f78f3bfa07cee4/specs/011-client-accounts/plan.md#production-blockers) (pending merge of `011-client-accounts`) | Platform + F10/F11 | Approved HTTPS origin on actual production host; reject path/query/fragment/userinfo; end-to-end link opens the intended origin. | Open | Pre-Production |
| OP-03 | Redact tokens and sensitive client data in application, worker, database, and host access logs | [F10 contract](../specs/010-registration-links/contracts/registration-links-surface.md); [F11 verification](https://github.com/sekiirro/LIFTER/blob/02b3f02b8bcd2cc52674bac435f78f3bfa07cee4/tests/integration/client-accounts-verification.md) (pending merge of `011-client-accounts`) | Platform + F10/F11 | Sanitized proof from each enabled production log path, including hosting access logs; no token, secret, health data, raw IP, or `ip_key`. | Open | Pre-Production |

## Backup / Restore

| ID | Blocker / gate | Source | Owner | Evidence required | Status | Phase |
|---|---|---|---|---|---|---|
| BR-01 | Encrypted database and Storage backups run on an approved schedule with periodic restore tests | [Constitution, Platform & Delivery Constraints](../.specify/memory/constitution.md); [D-14](04-changes-and-questions.md); [F7](../specs/007-backups/spec.md) | Platform + PO | Scheduled-backup evidence, key custody/rotation procedure, and successful periodic restore report for DB and Storage. | Open | Pre-Production |
| BR-02 | Complete first real encrypted backup and restore; PO supplies age identity through approved key-custody process | [docs/07](07-production-readiness.md); [F7 / ND-F7-2](../specs/007-backups/spec.md) | PO + platform | Approved key custody; encrypted backup and successful restore with integrity checks recorded. | Open | Pre-Production |
| BR-03 | Complete the staging restore drill against local Docker, or use `lifter-prod` only with explicit PO approval; no cloud staging project | [ND-F7-2 and D-20](07-production-readiness.md); [F7](../specs/007-backups/spec.md) | Platform + PO | Successful restore drill, sanitized evidence, and explicit approval if production infrastructure is used. | Open | Pre-Production |
| BR-04 | F14 Storage backup/restore and audit-retention proof | [F14 F14-7 / SC-010](https://github.com/sekiirro/LIFTER/blob/ea6b048f274f3c513fca7202f947e5b299193187/specs/014-workspace-branding/spec.md) (pending merge of `014-workspace-branding`) | F14 + platform | Successful real Storage backup/restore, reference/audit integrity evidence, and recovery procedure before production approval. | Open | Pre-Production |

## Go-Live checklist

1. **PO scope and target sign-off:** confirm hosting target/region, approved pilot volumes, retention decisions (B4/ND-F5-1), and any paid-service/deployment approval. Target approval is not deployment approval.
2. **Pre-production decisions:** close Auth/recovery and F10 decisions that gate real client flows; verify C4 hosted Auth and hosted Vault procedure with PO approval; finalize `APP_ORIGIN` and the F11 purge activation TODO from H5.
3. **Data protection:** prove token/access-log redaction across production log paths; approve retention and closure behavior; prove purge schedule and audit treatment.
4. **Finance:** demonstrate F10/F12 issued-term consistency and the PO-only F12 correction reversal before real financial use; complete encrypted backup/restore and reconciliation evidence.
5. **Storage/branding:** complete required local/CI Storage evidence; prove hosted proxy/validator identities and no service-role fallback; measure capacity, benchmark upload caps, set the 70% exit action, and prove Storage backup/restore.
6. **Operational readiness:** confirm exact-head CI/release gates, backup and incident runbooks, capacity margins, and no secrets in artifacts/logs. PO adds any required repository CI secrets before relying on credentialed pulls.
7. **Final authorization:** attach evidence to the exact release head, pass current merge/release gates in [docs/08](08-agent-workflow.md), and obtain explicit PO Go-Live approval naming the head, target, and action. No approval is implied by this checklist or by a merged PR.

## How items get added

Every feature PR that introduces a production blocker or Go-Live gate must update this register in the same PR. Add a stable ID, precise source/decision link, responsible owner, observable evidence, status, and phase. Keep unmerged sources labeled with their branch and pinned; on merge, convert them to repository-relative links. Never mark `Done` without evidence. Record PO decisions in the decision register and synchronize this file when they change a gate.
