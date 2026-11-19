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
