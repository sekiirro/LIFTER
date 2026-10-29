# D1 Constitution Amendment and Security Review Proposal

**Status:** Proposal only. No implementation or migration is authorized until the PO approves the constitutional amendment, the deletion mechanism, and this security review.

## Binding decision and conflict

D1=B requires deletion of an inapplicable answer from every answer version and its related audit records. The current Constitution VII requires audit history to be append-only and tamper-resistant. Migration `20261027150000_audit_log.sql` enforces this through `app_private.audit_events_immutable()` on UPDATE and DELETE, plus `audit_events_no_truncate` on TRUNCATE. F15 also requires immutable answer versions and safe audit history. D1 therefore needs an explicit, narrow exception before implementation.

## Proposed Constitution VII amendment

Replace the existing sentence:

> Audit history MUST be append-only and tamper-resistant. The client timeline is a curated projection, not the audit log.

With this proposed text:

> Audit history MUST be append-only and tamper-resistant, except that an explicitly approved, narrowly scoped privacy-erasure mechanism MAY delete an inapplicable client answer and its directly related answer-version and audit records when required by an approved form-branch change. The exception MUST NOT permit general audit editing, deletion, truncation, or alteration of financial, authentication, authorization, security, or unrelated client records. Each erasure MUST be authorized, tenant-isolated, idempotent, and recorded in a separate append-only deletion-control record containing only the minimum evidence needed to prove authorization and completion. The client timeline is a curated projection, not the audit log.

This exception is limited to D1 data. It does not authorize deleting unrelated access-audit events, financial ledger events, auth or authorization history, or other clients' records.

## Forward migration and enforcement changes required

No existing migration should be edited. After approval, a new forward migration must:

1. Replace or extend `app_private.audit_events_immutable()` in a way that continues to reject all UPDATE, TRUNCATE, and ordinary DELETE operations. If a DELETE exception is approved, it must be restricted to the exact D1 target records and a trusted transaction-local authorization context set only by the dedicated erasure function. A caller-settable custom GUC alone is not authorization.
2. Keep `audit_events_no_truncate` in force and leave the existing `audit_events_select_scoped` read policy unchanged. Do not add a general DELETE policy or grant direct DELETE to `anon`, `authenticated`, `service_role`, application roles, or ordinary staff. F15 answer-table RLS policies must continue to deny direct end-user deletion.
3. Add a forward-only, narrowly scoped function for deleting inapplicable answer values from all relevant versions and their directly related `public.audit_events` rows. Pin its owner, `SECURITY DEFINER`/invoker choice, empty `search_path`, execute grants, row locks, transaction boundary, and failure behavior in the approved migration design. The function must fail closed unless it proves the controlling branch change made the answer inapplicable and rechecks the current tenant and assignment scope.
4. Update the future F15 answer-version immutability/delete triggers so ordinary UPDATE/DELETE stays rejected while the approved function can perform only this erasure. The exact F15 table and trigger names do not exist yet and must be verified against the approved schema before migration authoring.
5. Keep answer RLS and audit read policies deny-by-default. Do not add user-facing row-delete policies. The dedicated function must enforce the same tenant boundary internally and must not provide cross-workspace existence or count signals.
6. Add an independent, append-only deletion-control record/table and insert-only procedure for minimum proof: operation ID, tenant ID, authorized actor, policy/version identifier, reason code, completion time, outcome, and a bounded count. It must not retain the deleted answer, answer text, question label, or a reusable pointer that can recover deleted content. Whether assignment/answer identifiers may remain in this control record is a PO decision because they may be identifying data.
7. Ensure any existing F15 `audit_row_change()` mapping never copies answer values into audit payloads. Erasure must not recursively create answer-content audit rows; the separate control record is the deletion evidence.

## Narrowly scoped mechanism proposal

Recommended design for PO review:

- **Who may run it:** a dedicated internal erasure worker/function only, invoked after a server-side branch recomputation proves the answer is inapplicable. Ordinary Client, Trainer, WO, PO, Sales, browser, and service-role callers receive no direct delete privilege. Whether PO-only manual invocation or a two-person approval is also required needs explicit PO approval.
- **Authorization:** derive tenant, assignment, answer, actor, and branch revision from trusted database rows and the authenticated operation context; accept no caller-supplied tenant or client identity as authority. Recheck membership/relationship and branch applicability after acquiring locks.
- **Audit:** in one transaction, delete only the exact answer value from all extant versions and its directly related answer-audit rows, then append one minimal deletion-control record. If either deletion or the control record fails, roll back the entire operation. Do not log answer values or labels.
- **Idempotency:** require a unique operation key bound to the canonical assignment, question, branch revision and policy version. A retry returns the prior safe result and cannot broaden the target set.
- **Tenant isolation:** require composite workspace/assignment relations, forced RLS for normal access, explicit workspace validation inside the privileged function, exact-row locking, and tests proving cross-tenant IDs cannot change counts or results.
- **Retention and backups:** purge associated records from every recoverable copy within RET-3's 30-day maximum. Keep only the PO-approved minimal deletion-control evidence. Legal holds and technical exceptions must be resolved before production use; the mechanism must not silently bypass them.

## Security, privacy, and integrity implications

- **Tamper-evidence loss:** deleting a historic audit row breaks the prior append-only chain of evidence and may make it impossible to establish which value was previously present or who accessed it. The proposed separate control record proves that an authorized erasure occurred, but cannot restore the erased history.
- **Insider abuse:** a privileged deletion function can be abused to hide misconduct, unauthorized access, or evidence of an incorrect form. Separate authorization, narrow target derivation, transactional audit, idempotency, monitoring, and independent review reduce this risk but do not eliminate it.
- **Legal hold and RET-2:** RET-2 calls for legally required minimal audit evidence. A legal hold may require retaining some records that D1 otherwise targets. The PO must define which obligation controls and the hold check before implementation; no deletion should run while that condition is unresolved.
- **RET-3 and recovery copies:** database backups, PITR, snapshots, and any future attachment storage can retain the deleted answer after the live row is removed. The approved mechanism must be paired with a verified all-copy purge that meets the 30-day maximum. If that cannot be proven, real-data use remains blocked.
- **Forensics:** a later incident investigation may lose evidence about the original answer, audit access, or branch transition. Keep the minimum non-content deletion-control proof, document the loss in the incident/runbook process, and make no claim that deletion preserves the original forensic record.
- **Failure handling:** authorization, branch proof, tenant scope, audit insert, lock, or purge-scheduling failures must abort the transaction and return a safe error without partial deletion or sensitive data in logs.

## Mitigations proposed

Use a single privileged function; no direct table grants or generic purge API. Verify branch applicability from persisted immutable form/answer facts under locks. Limit each operation to one tenant and one answer identity. Use separate append-only control evidence, unique idempotency keys, least-privilege execution grants, generic caller responses, sanitized telemetry, security review of the exact forward migration, tests for cross-tenant and unauthorized calls, and backup/PITR purge evidence before production. Require a documented break-glass and incident-review process if the PO approves manual invocation.

## Exact PO approvals needed

1. Approve or reject the quoted Constitution VII replacement text.
2. Approve the scope of “related audit records,” including whether an IDs-only answer-access event is deleted and whether assignment/question identifiers may remain in the separate deletion-control record.
3. Approve the authorized operator model: dedicated worker only, PO-triggered operation, or a second-person approval requirement.
4. Approve the proposed transaction, idempotency, tenant-isolation, and fail-closed requirements, plus the exception handling for legal holds and RET-2 minimal evidence.
5. Approve this security review and the resulting forward-migration design before implementation. Approval of the proposal is not approval of a later exact migration or merge; existing exact-head review and merge gates still apply.
