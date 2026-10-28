# LIFTER feature tracker

Use verified GitHub and Git facts only. `pending` means not yet verified or no record exists. Branch SHAs are remote heads as of 2026-10-28 unless noted.

| Feature | State | Branch@SHA | PR | CI | Depends on | DB lock | Open items |
|---|---|---|---|---|---|---|---|
| F1-F10 | Merged | `main` @ `ffc05118c49e2709b1a354da4a14fc83f2ba318e` | PR #1-#10 merged | Green on merged PRs | Foundation | No | None tracked here |
| F11 client accounts | U9 in progress; T046 PO-reserved | `011-client-accounts` @ `440f0b260efe7223e1ba122686ed495ab0ddb1fb` | pending | CI 40755419603 success on remote head; prior U9 checkpoint CI 40750430569 failed | F10 | Yes - U9 holds DB lock | Finish U9; T046 PO-reserved |
| F12 registration approval | Spec decisions recorded; no PR | `012-registration-approval` @ `948fdefa67e3c9ae7df37bdc2d9244a598cbcdcc` | pending | CI 40757294328 pending at tracker capture | F11 | No - DB-free | ND-F12-6 reversal placement; DG-F12-1 P2 sequencing and Trainer capability |
| F14 workspace branding | Spec decisions recorded; no PR | `014-workspace-branding` @ `14ea18992c328ddb97909a17aa34b4ef3470618b` | pending | CI 40757306485 pending at tracker capture | F2; main | No - DB-free | Confirm `storage-api` local/CI plan, hosted Storage verification, signed URL vs proxy, per-asset limits; bounded Sol Medium delta critique before plan |
| F13 freeze/renewal/refunds | Not started | pending | pending | pending | F12 | pending | pending |
| P2 forms | Not started | pending | pending | pending | DG-F12-1; P2 form engine/templates required by F12 | pending | Sequence F12 UI around P2; Trainer capability mapping |
| Governance | Documentation update in progress; PR to open after commit | `docs-workflow-governance` @ `c7d2d19f5030824a2faaac3185939fd5d26e4cdc` | pending | CI 40750658747 success on current remote head | None | No - DB-free | Open authorized PR and track merge gates |
| Second local Supabase stack | Preparation only | `infra-second-stack` @ pending (not listed in remote branches at capture) | pending | pending | None | No - preparation only | Configuration/verification only; PO approval required before provisioning or starting |
