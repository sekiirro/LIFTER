# LIFTER feature tracker

The branch, SHA, PR and CI columns contain facts verified from GitHub/Git. `pending` means not yet verified or no record exists. State, dependency, DB-lock and open-item fields come from feature specifications, `docs/04-changes-and-questions.md`, and the PO decision record. Branch SHAs are remote heads as of 2026-10-28 unless noted.

| Feature | State | Branch@SHA | PR | CI | Depends on | DB lock | Open items |
|---|---|---|---|---|---|---|---|
| F1-F10 | Merged | `main` @ `ffc05118c49e2709b1a354da4a14fc83f2ba318e` | PR #1-#10 merged | Green on merged PRs | Foundation | No | None tracked here |
| F11 client accounts | U9 in progress; T046 PO-reserved | `011-client-accounts` @ `0e8a9c3cd9da50e585be536576ea85f73a5c06de` | pending | CI 40758846342 in progress; prior 40755419603 success; checkpoint 40750430569 failed | F10 | Yes - U9 holds DB lock | Finish U9; T046 PO-reserved |
| F12 registration approval | Spec decisions recorded; no PR | `012-registration-approval` @ `7cc81d52a9ad8bc1d4aa8797122d1bb8162708f7` | pending | CI 40758717481 queued | F11 | No - DB-free | F12 PO-only correction reversal is in scope and a production blocker until operational; REQ-P2-01 approval-event hand-off to P2 (not an F12 form UI/engine deliverable); Trainer capability mapping in P2 |
| F14 workspace branding | Spec decisions recorded; no PR | `014-workspace-branding` @ `c575cfa35b8a22b2f1870692f91846558f332e5e` | pending | pending | F2; main | No - DB-free | Implement and test Storage in local development and CI; hosted Storage/security/isolation compatibility verification is a production blocker; signed URL vs proxy and asset limits are plan items; run one PO-approved focused Sol Medium delta critique before plan; no production changes without PO approval |
| F13 freeze/renewal/refunds | Not started | pending | pending | pending | F12 | pending | pending |
| P2 Forms/Intake | Not started | pending | pending | pending | F12 approval event; P2 templates/assignment | pending | REQ-P2-01 post-approval automatic form assignment (must copy into P2 FRs); decide Trainer authorization capability in P2 spec |
| Governance | PR open | `docs-workflow-governance` @ pending (this commit) | #13 open | pending | None | No - DB-free | CodeRabbit review, green CI; explicit PO merge approval |
| Second local Supabase stack | Preparation only | `infra-second-stack` @ `75d4a40def664f0a2cbbd836c593f235ef624e01` | pending | CI 40757475223 success | None | No - preparation only | Configuration/verification only; PO approval required before provisioning or starting |
