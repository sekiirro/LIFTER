# D1 Constitution Amendment and Security Review Proposal

**Status:** Design and security review approved by the PO under D-29 on 2026-10-30. This approval does not approve a merge or the exact future migration. DB implementation waits for F12/F14 merge and verified Stack C.

## Binding decision and conflict

D1=B requires deletion of an inapplicable answer from every answer version and its related audit records. Constitution VII has been amended under D-29 with a narrow exception. Migration `20261027150000_audit_log.sql` enforces audit immutability through `app_private.audit_events_immutable()` on UPDATE and DELETE, plus `audit_events_no_truncate` on TRUNCATE. F15 also requires immutable answer versions and safe audit history; a future forward migration must implement the approved exact boundary after DB prerequisites are met.

## Proposed Constitution VII amendment

Replace the existing sentence:

> Audit history MUST be append-only and tamper-resistant. The client timeline is a curated projection, not the audit log.

With this proposed text:

> Audit history MUST be append-only and tamper-resistant, except that an explicitly approved, narrowly scoped privacy-erasure mechanism MAY delete an inapplicable client answer and its directly related answer-version records and answer-change and access-view audit records when required by an approved form-branch change. The exception MUST NOT permit general audit editing, deletion, truncation, or alteration of financial, authentication, authorization, security, or unrelated client records. Each erasure MUST be authorized, tenant-isolated, idempotent, and recorded in a separate append-only deletion-control record containing counts only and no assignment, question, or answer IDs. The client timeline is a curated projection, not the audit log.

This exception is limited to inapplicable D1 answer values and their answer-change/access-view audit rows. It does not authorize deleting unrelated access-audit events, financial ledger events, authentication, authorization or security history, or other clients' records. Under PO answer 2=B, erasing the access-view rows removes evidence of who viewed that answer; this loss of evidence is a recorded security consequence.

## Forward migration and enforcement changes required

No existing migration should be edited. After approval, a new forward migration must:

1. Replace or extend `app_private.audit_events_immutable()` in a way that continues to reject all UPDATE, TRUNCATE, and ordinary DELETE operations. If a DELETE exception is approved, it must be restricted to the exact D1 target records and a trusted transaction-local authorization context set only by the dedicated erasure function. A caller-settable custom GUC alone is not authorization.
2. Keep `audit_events_no_truncate` in force and leave the existing `audit_events_select_scoped` read policy unchanged. Do not add a general DELETE policy or grant direct DELETE to `anon`, `authenticated`, `service_role`, application roles, or ordinary staff. F15 answer-table RLS policies must continue to deny direct end-user deletion.
3. Add a forward-only, narrowly scoped function for deleting inapplicable answer values from all relevant versions and their directly related `public.audit_events` rows. Pin its owner, `SECURITY DEFINER`/invoker choice, empty `search_path`, execute grants, row locks, transaction boundary, and failure behavior in the approved migration design. The function must fail closed unless it proves the controlling branch change made the answer inapplicable and rechecks the current tenant and assignment scope.
4. Update the future F15 answer-version immutability/delete triggers so ordinary UPDATE/DELETE stays rejected while the approved function can perform only this erasure. The exact F15 table and trigger names do not exist yet and must be verified against the approved schema before migration authoring.
5. Keep answer RLS and audit read policies deny-by-default. Do not add user-facing row-delete policies. The dedicated function must enforce the same tenant boundary internally and must not provide cross-workspace existence or count signals.
6. Add an independent, append-only deletion-control record/table and insert-only procedure with counts only and no IDs, including no tenant, actor, assignment, question, answer, operation or audit-row identifiers. It must not retain the deleted answer, answer text, question label, or a reusable pointer that can recover deleted content.
7. Ensure any existing F15 `audit_row_change()` mapping never copies answer values into audit payloads. Erasure must not recursively create answer-content audit rows; the separate control record is the deletion evidence.

## Narrowly scoped mechanism proposal

Recommended design for PO review:

- **Who may run it:** an automatic server-validated erasure worker/function only, invoked against the current authoritative answers. It selects every answer whose question is currently inapplicable, including pre-existing hidden values and values deferred by legal hold. No human trigger is allowed; PO, WO, Trainer, Client, Sales, browser and service-role callers receive no direct delete or trigger privilege.
- **Authorization:** derive tenant, assignment, answer, actor, and branch revision from trusted database rows and the authenticated operation context; accept no caller-supplied tenant or client identity as authority. Recheck membership/relationship and branch applicability after acquiring locks.
- **Audit:** in one transaction, delete only the answer value from all extant versions and the answer's answer-change and access-view audit rows, then append a counts-only deletion-control record with no IDs. If deletion or the control record fails, roll back the operation. Do not log answer values or labels.
- **Idempotency:** require a unique operation key bound to the canonical assignment, question, branch revision and policy version. A retry returns the prior safe result and cannot broaden the target set.
- **Tenant isolation:** require composite workspace/assignment relations, forced RLS for normal access, explicit workspace validation inside the privileged function, exact-row locking, and tests proving cross-tenant IDs cannot change counts or results.
- **Retention and backups:** purge associated records from every recoverable copy within RET-3's 30-day maximum. Keep only the counts-only deletion-control evidence. A legal hold defers deletion and alerts; the mechanism must not bypass it.

## Security, privacy, and integrity implications

- **Tamper-evidence loss:** deleting historic answer-change and access-view audit rows breaks the prior append-only chain of evidence and makes it impossible to establish the old answer value or who viewed that erased answer. The counts-only control record proves only the erasure counts, not the prior content or access identities.
- **Insider abuse:** a privileged deletion function can be abused to hide misconduct, unauthorized access, or evidence of an incorrect form. Separate authorization, narrow target derivation, transactional audit, idempotency, monitoring, and independent review reduce this risk but do not eliminate it.
- **Legal hold and RET-2:** RET-2 calls for legally required minimal audit evidence. A legal hold defers D1 deletion and raises an alert; no target is selected while a hold is active.
- **RET-3 and recovery copies:** database backups, PITR, snapshots, and any future attachment storage can retain the deleted answer after the live row is removed. The approved mechanism must be paired with a verified all-copy purge that meets the 30-day maximum. If that cannot be proven, real-data use remains blocked.
- **Forensics:** a later incident investigation may lose evidence about the original answer, audit access, or branch transition. Keep the minimum non-content deletion-control proof, document the loss in the incident/runbook process, and make no claim that deletion preserves the original forensic record.
- **Failure handling:** authorization, branch proof, tenant scope, audit insert, lock, or purge-scheduling failures must abort the transaction and return a safe error without partial deletion or sensitive data in logs.

## Mitigations proposed

Use a single privileged function; no direct table grants or generic purge API. Verify branch applicability from persisted immutable form/answer facts under locks. Limit each operation to one tenant and one answer identity. Use separate append-only control evidence, unique idempotency keys, least-privilege execution grants, generic caller responses, sanitized telemetry, security review of the exact forward migration, tests for cross-tenant and unauthorized calls, and backup/PITR purge evidence before production. Require a documented break-glass and incident-review process if the PO approves manual invocation.

## Binding PO approval (verbatim)

> 1=A: Approve narrowly scoped Privacy Erasure exception. 2=B: Delete related answer-change AND access-view audit records. 3=B: Deletion log retains counts only, no IDs. 4=A: Automatic server-validated deletion only. 5=A: Respect Legal Holds; defer deletion and alert. 6=A: Approve security review and DB change plan. Strictly limit deletion to inapplicable answers and authorized related records. Preserve all Financial, Security and Unrelated Audit Records. Update constitution, specs and tests. Independently review security implications. Escalate genuine conflicts without inventing policy. Design approval only — NOT merge approval. Preserve all CI, CodeRabbit and PO merge gates.

Reference: F15 D1 PO approval in `specs/015-forms-intake/spec.md` (session 13); decision-register entry D-29. The exact future migration remains subject to F12/F14 merge, verified Stack C, exact-head testing and review; this is not merge approval.

### S14 environment update (2026-10-30)

For F15 implementation following the S14 Stack D approval, use Stack D after verifying isolation from Stacks A/B/C and integrating the latest F12/F14 contracts. The earlier Stack C references above document the prior approved plan and are superseded for F15 execution. The migration lower bound is `20261104000000`, still subject to sorting after the latest merged F12/F14 migration.
