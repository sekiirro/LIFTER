# S40 F15 round 11 verification

Date: 2026-11-09. Scope: PR #57, existing approved F15 behavior, PDN-S40-03=A. No merge and no #58 changes.

## Spec Kit gate

- Entry review: PASS. `spec.md` has numbered FRs, measurable SCs, and Given/When/Then scenarios for the touched scope; Clarifications quote S40-PO-1/-2/-4 and state no open ambiguity for the approved sequence. `plan.md` and `tasks.md` include T139 with FR tags. Analyze was refreshed after those edits, dated 2026-11-09, and records 0 Critical / 0 High findings.
- Product decision: none added. The approved behavior overlap is reconciled by preserving main username-unavailable checks alongside approved F15 normalized username, three-component name, and generic identity-collision behavior.

## Migration order and replay

- Minimal below-main prefix from `C:/Users/NEW LAP/.lifter/runs/s40-luna-f15-r11/prefix-closure.md`: `20261104002000_f15_terms_consent.sql`, `20261104003000_f15_s14_forms.sql`, `20261104004000_f15_s14_privacy.sql`, `20261104005000_f15_auth_identity_collisions_and_reader_policies.sql`.
- All other F15 migrations remain renamed above main in original relative order. One new forward migration: `20261108230111_f15_signup_main_reconciliation.sql`.
- Clean Stack D full reset passed. The authorized Stack D migration directory was restored byte-identically (87/87 files). StartedAt advanced from `2026-11-09T12:09:31.551905151Z` to `2026-11-09T12:23:41.514538489Z`; logs and manifests are in the run directory.
- Pushed migration content is unchanged versus base `8fcb2e82170c739c2cbd69ca2c3df7c379b0cddf`: 70/70 blob hashes match the round-10 rename map.

## Verification evidence

- Stack D integration: `forms-builder-persistence`, `client-signup-transaction`, and `rls-catalog`: 3 files / 72 tests passed.
- Executed security mutation proof: the SECURITY DEFINER catalog invariant killed a SECURITY INVOKER mutant; the scoped audit RLS catalog invariant killed removal of `audit_events_select_scoped`; rollback restored the function MD5 and policy row; `RESTORE_DIFF_EXIT=0`. Evidence: `C:/Users/NEW LAP/.lifter/runs/s40-luna-f15-r11/security-mutation-proof.mjs`.
- Local gates: `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run test:unit` passed; unit result 203 files / 2,509 tests.
- `npm run check:migration-timestamps` passed on 187 files with 11 documented exceptions.
- Gate-check result is pending and must use `--allow-shared-below-main 20261104002000_f15_terms_consent.sql,20261104003000_f15_s14_forms.sql,20261104004000_f15_s14_privacy.sql,20261104005000_f15_auth_identity_collisions_and_reader_policies.sql`.

## CI and review

First push: `1419cce2574e3d5d5ed6106a1030834c2f3d57f2`. Exact-head pull_request run `42619956092` completed: validate PASS, storage PASS, integration FAIL (121 files passed / 2 failed / 3 skipped; 1,631 tests passed / 2 failed / 5 skipped).

Hosted failures and fixes: `client-accounts-signup.test.ts` expected the S16 generic duplicate draft even though PO Q4=A left that wording unapproved and D-08 remains authoritative; the stale fixture and assertion are now aligned to D-08's exact bilingual duplicate copy. `forms-alert-channels.test.ts` only searched original migration clocks; source discovery now also includes the safely renamed `2026110823xxxx` F15 files. Runtime copy and migration SQL are unchanged by these fixes. Targeted Stack D rerun passed 2 files / 80 tests. New-head hosted CI observation is pending.

No CodeRabbit request was made. No workflow file was changed. No merge was performed.

## Open decisions

None. If the final live run exposes a behavior conflict with the approved spec, record an MCQ and stop only that affected behavior.
