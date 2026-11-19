# T049 / T050a verification — S67 PR2c

Date: 2026-11-19 UTC  
Stack: C, local only  
Candidate baseline: aa114e0426a22a84de34fbec6c18713499ff1453

Expanded RED test and status evidence commit: e14dc11f263e4b80b5c5f1086e9a4ad56c7d0ce3.

## RED evidence

- T049a direct staff update without an intent succeeded and changed the password; its test cleanup restored the fixture password. A second signed-in session also changed the password without an intent; the test now restores the fixture password on that unexpected-success path. These controls remain RED.
- T049a client manual recovery remained successful.
- T049d RED coverage found all four functions absent: public begin, complete, abort, and app_private reconciliation. Expanded cases cover idempotent begin, one-way complete/abort, and stale-open reconciliation.
- Stack C integration run of auth-recovery.test.ts: 33 passed, 7 failed. Failures are the expected missing guard/intent controls; T038a passed separately, 1/1.

## G2 trusted-context feasibility

A temporary local BEFORE UPDATE OF encrypted_password trigger on auth.users recorded only auth.jwt()->>'session_id' and auth.jwt()->'amr' for a recovery-session password update. The verified recovery JWT exposed a session_id, while the trigger observed NULL. The probe table, trigger, and function were removed in the test finally block. This does not establish a trusted initiating-session binding.

Per plan.md G1/G2, do not add an account-only intent exception or implement the guard until a supported trusted request-context mechanism is established. No migration was added. No hook, SECURITY DEFINER, or RLS mutation was attempted because the control B implementation is blocked before its migration gate.

## MCQ-1 — T050a G2 / FR-030 control B

Question: Which approved design supplies the initiating recovery session ID to the auth.users password guard on the pinned local GoTrue stack?

1. Approve and specify another verified request-context source supported by this GoTrue version, then rerun G1/G2.
2. Keep T050a and T049a acceptance blocked; do not add account-only intent behavior.

Recommendation: option 2, following the existing plan's no-bypass rule. Independent tasks may continue. T049a, T049d, T050a, and dependent T043 acceptance remain incomplete.

## Mutation evidence

Not run. No T050a migration or new high-risk control exists on this candidate. Existing PR1b hook mutation evidence is retained at reports/t051-verification.md and remains partial; it does not cover the new T038a route assertion or any session-bound intent/guard control.

## Stack C hook and schema evidence

After a safe Stack C reset and the required local provisioning step, `staff-reset-hook.test.ts` passed 5/5 and `staff-reset-hook-schema.test.ts` passed 6/6. The suites cover unsigned requests, direct unknown-address skip/no mail, one approved-recipient audit-before-send, non-staff refusal, requested-audit RPC failure, request/delivery limits, global cap, deduplication, and schema/RLS/ACL behavior. T049b/c remain unticked: unavailable-hook/timeout caller status, control-D begin cases, and mixed direct/app cap evidence remain uncovered. One approved local recipient email was captured; no other recipient or external SMTP was used.

## T035 / S67-R23 timing

The required-step/fixed-floor unit proof and 30 interleaved local samples were not run because the duration of the fixed response floor is unspecified. MCQ-2 is recorded in the lane report; do not add an unapproved latency value.

## T035 / S67-R23/R33 timing evidence (2026-11-19 03:43:39 UTC)

This section supersedes the earlier note that the floor and samples were pending. The valid-request action now awaits the Auth provider operation on each path and applies a 500 ms response floor. `tests/unit/staff-reset.test.ts` passed 14/14. The full Cairo-timezone suite passed 3920/3920, with 30 interleaved local samples per class: eligible/permitted 514.5 ms, unknown 515.6 ms, client 514.9 ms, policy-refused 515.0 ms, audit-failure 515.4 ms, hook-unavailable 514.4 ms, timeout 515.2 ms. The largest absolute median difference from eligible/permitted was 1.1 ms (<=100 ms).

Stack C remains taken for the independent direct Auth status and mixed-cap evidence. No external SMTP was used.

T035 floor mutation evidence (2026-11-19 03:44:16 UTC): changed the 500 ms floor to 0; targeted unit test failed at 19.6 ms against the >=500 ms assertion. Restored the source and verified SHA256 matched the pre-mutation backup (846968C8A0F25982C458ECA811F3382B7026978D0C9777C6269B61DA453DB439).

## Stack C direct/app hook attempt (2026-11-19 03:59:46 UTC)

The Stack C reset and client-accounts provisioning passed after adding the worktree-only migrations junction. However, the running supabase_auth_lifter-stack-c container environment exposed no Send Email hook setting. The temporary mixed direct/app probe therefore made recovery requests fall through to the local Mailpit SMTP capture; the Mailpit count is 14 after those attempts. Requests used only the approved staff-reset@example.test recipient, and no external SMTP was used. The probe was removed, Stack C was stopped with --no-backup, and no further requests will run on this configuration. T049b direct transport status and T049c mixed app/direct caps remain incomplete. S67-PO-9 control-D and control-B work remains blocked; no account-only fallback or intent migration was added.

Full candidate unit suite (TZ=Africa/Cairo): 348 files, 3920 tests passed; duration 129.88s. Lint and typecheck passed; full format check passed after formatting. Stack C is FREE (stopped with --no-backup).
