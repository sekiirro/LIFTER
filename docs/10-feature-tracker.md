# LIFTER feature tracker

Current production blockers and Go-Live gates are consolidated in [docs/13-production-readiness.md](13-production-readiness.md).

The branch, SHA, PR and CI columns contain facts verified from GitHub/Git. `pending` means not yet verified or no record exists. State, dependency, DB-lock and open-item fields come from feature specifications, `docs/04-changes-and-questions.md`, and the PO decision record. Branch SHAs are remote heads as of 2026-10-28 unless noted.

| Feature | State | Branch@SHA | PR | CI | Depends on | DB lock | Open items |
|---|---|---|---|---|---|---|---|
| F1-F10 | Merged | `main` @ `ffc05118c49e2709b1a354da4a14fc83f2ba318e` | PR #1-#10 merged | Green on merged PRs | Foundation | No | None tracked here |
| F11 client accounts | Merged (PR #14, 2026-10-29); T046 PO-approved PASS; merge-approved, NOT production-ready | `011-client-accounts` @ `12036e26fb5e23da22af4ddf0e8d33de800779a2` | #14 merged → `main` @ `1f4d2359bbfcef605e371e29b81a59b2a48d8ed4` | push 40830808815 + pull_request 40830816064 success on `12036e2` (integration 879 passed / 1 opt-in SC-011 skip; Playwright 125 passed / 9 skipped) | F10 | No | Production blockers: C4 hosted Supabase Auth compatibility (version, DML permission, upgrade allowlist; PO approval); hosted Vault provisioning; pg_cron purge activation (deferred to pre-production); host access-log redaction; APP_ORIGIN; ND-F5-1/B4 archived identity and retention; phone-input acceptance; inherited ND-F4/ND-F10 items; ND-F4-3=B (docs/13): session TTL is a security blocker; session lifetime enforcement is deferred to a later feature |
| F12 registration approval | Stage 1 merged; stage 2 in progress | `012-registration-approval-stage2` @ `d56897bb9244b377e13a8c44cbf63753bc93039f` | #18 merged into `main` @ `e3a2534e8de24f80016f42d809061ab2f2207fba` (merge of `b5898f11fa57b3cd17c52f0e7dda93d8fce96213`) | main CI 40976279038 attempt 2: validate + integration success | F11 | Yes - Stack A | Stage 2 follow-ups; F12 PO-only correction reversal remains a production blocker until operational evidence and approval; REQ-P2-01 approval-event hand-off to P2 (not an F12 form UI/engine deliverable); Trainer capability mapping in P2 |
| F14 workspace branding | Merged (PR #25) | 014-workspace-branding @ c0026de5a65388e36e68336008e2d8b8893c46af | #25 merged; merge commit ea2974c49550d1e6f8ac642116550ff4fa1e9750 | Merged on origin/main; historical exact-SHA gates accepted | F2; main | No | Documentary production evidence only; no production deploy/migration authorization |
| F14b branding upload UX | Specified / approved; not implemented | pending | pending | pending | F14 | No | Seven approved design decisions and AR/EN copy in S20-22; show actual server limits |
| F16 exercise/food catalogs | Specified / approved; not implemented | docs-s21-s20-reconcile @ pending | pending | pending | F15; main | No | Remove-only catalog lifecycle (Restore retained); no cascade or automatic plan changes; PO supplies food dataset and approves import after audit |
| Plan Core (F19) | Specified / approved; not implemented | docs-s21-s20-reconcile @ pending | pending | pending | F16; P4 | No | specs/019-plan-core; range 20261106200000-20261106235959 |
| F17 workout planner | Specified / approved; not implemented | docs-s21-s20-reconcile @ pending | pending | pending | F16; Plan Core; F13 | No | Per-exercise defaults; range 20261107* |
| F18 nutrition planner | Specified / approved; not implemented | docs-s21-s20-reconcile @ pending | pending | pending | F16; Plan Core; F13 | No | D18-1 amended; range 20261108* |
| Hero Liquid Glass | Specified / approved; implementation in progress on separate branch | 014-hero-prototype @ 97debafce8a7b6929722f079f0028c8d02311d07 | pending | pending | F14 | No | S21-PO-1/2 selective Glisse implementation authorized; merge requires explicit PO approval; follow-up migrations 20261105000000-20261105235959 |
| F13 freeze/renewal/refunds | Not started | pending | pending | pending | F12 | pending | pending |
| P2 Forms/Intake | Not started | pending | pending | pending | F12 approval event; P2 templates/assignment | pending | REQ-P2-01 post-approval automatic form assignment (must copy into P2 FRs); decide Trainer authorization capability in P2 spec |
| Governance | PR open | `docs-workflow-governance` @ pending (this commit) | #13 open | pending | None | No - DB-free | CodeRabbit review, green CI; explicit PO merge approval |
| Second local Supabase stack | Preparation only | `infra-second-stack` @ `75d4a40def664f0a2cbbd836c593f235ef624e01` | pending | CI 40757475223 success | None | No - preparation only | Configuration/verification only; PO approval required before provisioning or starting |

## Deferred roadmap

| Feature | State | Branch@SHA | PR | CI | Depends on | DB lock | Open items |
|---|---|---|---|---|---|---|---|
| Public premium marketing Landing Page for prospective Workspace Owners | Deferred until after core platform completion (PO, session 14, 2026-10-30) | pending | pending | pending | Core platform completion | No | Services overview with Login, Work With Us and Apply CTAs; do not implement now; current invitation-only client registration flow remains unchanged |
