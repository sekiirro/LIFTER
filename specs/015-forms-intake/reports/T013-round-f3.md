# T013 submission completion — S26 F15 round F3

## Evidence

- `tests/integration/forms-r3-submissions.test.ts`: a two-session concurrent identical submit returns the same idempotent result to both callers; the assignment persists exactly one original submission, SLA, answer revision, and `form.submitted` audit row.
- The same Stack D suite retains the existing empty/incomplete denial, full validation, atomic revision/submission/audit/SLA, frozen D-03 deadline, correction history, replay, and audit rollback coverage.
- `tests/unit/forms-submission-routes.test.ts`: the actual submission and correction handlers reject malformed envelopes and oversized values before the write RPC; their error JSON is allow-listed and private/no-store.
- `tests/unit/forms-submissions.test.ts`: unknown request keys are rejected; both handlers run their validator before the write RPC.
- Focused Stack D integration: **2 files, 4 tests passed**.
- Clean-environment focused unit: **5 files, 30 tests passed**.

## Mutation table

| Mutant | Failing assertion / evidence |
|---|---|
| Remove submission assignment/draft row locks | `forms-r3-submissions.test.ts` removes both lock clauses in the named mutant and verifies the required-lock assertion rejects it; the concurrent two-session case requires identical success and one persisted fact of each kind. |
| Remove the original-submission uniqueness key | The named integration assertion checks the `form_submissions` primary key is `(workspace_id, assignment_id)`; deleting it violates the catalog assertion. |
| Bypass submission route validation | The HTTP test receives `{status:"answer_too_long"}` and verifies the submission RPC was never called; the named source mutant removes the validator marker and is rejected. |
| Bypass correction route validation | Invalid correction metadata and oversized values return `{status:"invalid"}` / `{status:"answer_too_long"}` before `correct_form_answer`. |
| Accept unknown submission/correction envelope keys | Both route requests containing `debug` return only `{status:"invalid"}` and do not invoke a write RPC. |
| Reflect raw provider error | Both routes return `{status:"unavailable"}`; the named `error.message` source mutant fails the safe-error contract assertion. |
| Alter the original D-03 deadline on correction | Existing rollback-scoped SQL mutant changes the deadline; the frozen-deadline assertion fails. |
| Erase prior answer history | The integration assertion requires the original and corrected answer revisions in history. |
| Fail submission audit | The injected audit trigger raises and the test confirms zero submission, SLA, and revision facts remain. |

All SQL probes are synthetic and rollback-scoped. No migration was edited after it had been pushed; no production database or scheduler was used.
