# Feature Specification: F26 — Retention Purge Entry Point (DP-08)

**Feature Branch**: `s70-026-retention-purge-spec`
**Status**: Spec-only. No implementation, SQL, migration, scheduler activation, hosted change, or task tick is authorized by this artifact. The PO decisions are recorded; the purge implementation is a pre-production item (docs/13 DP-08). The four implementation-facing questions Q1–Q4 are resolved by S70-PO-10 (all recommended options); the decided text, the enumerated refund state values and the concrete invoice-data objects are recorded below. No question is left open. Architect mapping S70-R47 corrects the Q1 hold mapping (refund-only hold; no subscription-status or generic-job hold, no persisted dispute object) and is recorded below and in FR-004; it changes no PO decision.
**Scope**: A purge **entry point** and its tests that implement the S70-PO-5 retention clocks for the PO-scoped data classes. It does not enable any scheduler, does not claim backup coverage, and does not alter any other feature's retention text.

## Binding source quotations

The policy below is **cited, not paraphrased**. Where an architect mapping or a decision-register note interprets PO words, it is labelled as such.

### S70-PO-1 item 3

Source: `C:/Users/NEW LAP/.lifter/runs/s70-po/s70-po-1.verbatim.txt`, SHA-256 `D8E0EAF354F3923630BA38CD258EDD8E94DD63B86D9345405D40A520A790F20E`. Cited as **S70-PO-1 item 3**. Verbatim:

```text
3. **Retention:** Set client-data and audit retention to **30 days**, subject to Egyptian legal requirements for financial/audit records. Reconcile F11/F13/F15 and production gates.
```

The legal clause is superseded for recording purposes by S70-PO-3/4, as recorded in `docs/04-changes-and-questions.md` line 1777 ("source cited; legal clause superseded by S70-PO-3/4").

### S70-PO-3

Source: `C:/Users/NEW LAP/.lifter/runs/s70-po/s70-po-3.verbatim.txt`. Verbatim:

```text
Egyptian legal counsel approved **30-day retention**. Apply to DP-01/02/06, 013 T019/T020, and 015 T019/T025. Flag ambiguities and list unblocked gates.
```

### S70-PO-4

Source: `C:/Users/NEW LAP/.lifter/runs/s70-po/s70-po-4.verbatim.txt`. Verbatim:

```text
30-day retention approval covers client, audit, payment, refund, and invoice data.
Record only: **“PO states Egyptian legal advice was obtained”** — no lawyer name, date, file location, or citation.
Keep the backup gate open.
```

The legal basis is recorded only as the quoted string "PO states Egyptian legal advice was obtained"; no lawyer name, date, file location, or citation is added by this feature.

### S70-PO-5

Source: `C:/Users/NEW LAP/.lifter/runs/s70-po/s70-po-5.verbatim.txt`, SHA-256 `FBE1F9186AD1B853890617EF4AAFCDE967C81C2518C466744EB1250C2697C957`. Verbatim:

```text
Q1: "30-day retention: when does the 30-day clock start?" A: "From account closure (Recommended)" = Client, payment, refund and invoice data are kept while the account is active and deleted 30 days after closure/deletion; audit events are deleted 30 days after creation.
Q2: "If a refund or payment dispute is still open when a record reaches day 30, what happens?" A: "Hold until resolved (Recommended)" = Deletion pauses for records tied to an open refund/dispute; the 30 days restart when it is resolved.
```

Architect mapping (not PO words), recorded in `docs/04-changes-and-questions.md` line 1793: S70-R3-MCQ-1 = A, refined so that the clock starts at account closure/deletion for client, payment, refund and invoice data and at creation for audit events; S70-R3-MCQ-2 = A, so deletion pauses for records tied to an open refund/dispute and the 30 days restart when it is resolved.

### S70-PO-10 (resolves Q1–Q4)

Source: `C:/Users/NEW LAP/.lifter/runs/s70-po/s70-po-10.verbatim.txt`, 2026-11-24T01:33:12Z. The PO selected the recommended option for every MCQ (verbatim):

```text
Q1 "30-day deletion: deletion waits while a refund or dispute is 'open'. Which states count as open?" = "Not yet finished (Recommended)" [Pending or under review = open. Any final outcome (done, rejected, cancelled) = resolved, and the 30 days restart from then.]
Q2 "On day 30, what happens to records the law/rules say must not be lost (payment ledger, refunds, audit history)? ..." = "Anonymize those, delete rest (Recommended)" [Strip anything that identifies the client from ledger/audit rows so they stay as anonymous evidence; physically delete everything else.]
Q3 "The audit log is locked so nobody can edit or delete rows. How should the 30-day audit deletion work?" = "One special purge path (Recommended)" [A single reviewed database function is the only thing allowed past the lock, and it records what it removed. Everything else stays locked.]
Q4 "LIFTER has no separate invoices table. What counts as 'invoice data' for the 30-day rule?" = "Payments/receipts/refunds (Recommended)" [Treat the existing payment, receipt and refund records as the invoice data. No new table.]
```

Cite as **S70-PO-10 Q1/Q2/Q3/Q4**. These answers resolve the four implementation-facing questions; no new product decision is made by this artifact.

**Q1 concrete state values (architect mapping S70-R47, enumerated from existing migrations, not invented).** The PO rule is "not yet finished = open; any final outcome = resolved, then restart the 30 days." The architect mapping corrects which persisted object carries the refund hold; it does not change the PO decision. Applied to the actual persisted refund process state:

| State column (file:line)                                                                                         | OPEN — non-terminal (hold applies) | RESOLVED — terminal (30-day clock restarts) |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| `app_private.refund_auth_lockouts.status` — `supabase/migrations/20261103120000_refund_auth_lockout_hook.sql:16` | `pending`, `retry`                 | `succeeded`                                 |

The only non-terminal refund state is the Auth-lockout outbox: `20261103120000_refund_auth_lockout_hook.sql:16` defines `status text not null default 'pending' check (status in ('pending','retry','succeeded'))`, so OPEN = `pending`/`retry` and the sole RESOLVED value = `succeeded`. This constraint is unchanged by later migrations.

Architect mapping S70-R47 — excluded objects (recorded facts, not PO decisions):

- **Refund ledger is atomic.** `public.refund_operations` (`supabase/migrations/20261103123000_f13_refund_ledger.sql:2-20`) has no `status` column; refunds are recorded atomically, so there is no other refund state to hold on.
- **`public.jobs` is not a hold source.** No `public.jobs.kind` in any migration is tied to the refund lockout: the lockout is driven by `public.claim_refund_auth_lockout_jobs`, `public.complete_refund_auth_lockout_job` and `public.retry_refund_auth_lockout_job` directly on `app_private.refund_auth_lockouts` (`20261103125000_f13_refund_operations.sql:370-408`), while enqueued `public.jobs` kinds are generic (e.g. `forms.alert` in `20261112022800_f15_alert_schedules.sql:222-223`, `client.distribution` in `20261124040000_f11_client_trainer_distribution.sql:75-76`). Generic `public.jobs.status` (`pending`/`running`/`done`/`dead`, `20261027160000_jobs.sql:9`) MUST NOT be used as a refund hold predicate; a `public.jobs` row counts only if a future job kind tied to this refund lockout is introduced, with its exact kind/filter enumerated at that time.
- **`public.subscriptions.status` is removed from the hold.** `awaiting_activation`/`future`/`active`/`frozen`/`expired`/`refunded` (`20261103124000_f13_entitlement.sql:6`) is an entitlement/account-activity projection governed by FR-002's account-active rule, not a refund hold; `expired` is time passage, not a refund resolution.
- **No dispute object exists.** `git grep -i dispute origin/main -- supabase/migrations` returns no match (verified): no persisted dispute table, column or state exists in LIFTER. The dispute hold applies when a dispute object is introduced; until then only refund holds are enforceable. No dispute model is invented by this spec.

**Q4 concrete invoice-data objects (enumerated from existing migrations, no new table).** The "invoice data" objects are the existing payment/receipt/refund ledger projections:

- `public.payment_events` — `supabase/migrations/20261101120000_registration_approval_model.sql:94-125` (collection/correction/receipt ledger).
- `public.refund_operations` — `supabase/migrations/20261103123000_f13_refund_ledger.sql:2-20`.
- `public.refund_allocation_events` — `supabase/migrations/20261103123000_f13_refund_ledger.sql:22-40`.
- `public.subscription_obligation_cancellations` — `supabase/migrations/20261103123000_f13_refund_ledger.sql:42-57`.

### docs/13-production-readiness.md gates

- **DP-08** (`docs/13-production-readiness.md:45`): "Implement the S70-PO-5 retention clocks in purge code — pre-production implementation item". Evidence: "Deletion pauses for records tied to an open refund/dispute and the 30 days restart when it is resolved; audit events are deleted 30 days after creation. Record executed test evidence for the pause and restart. The decision is recorded; implementation is a pre-production item. Backup gates BR-01/BR-02/BR-04 and FN-03 stay Open."
- **DP-01** (`docs/13-production-readiness.md:42`): "Clock start (S70-PO-5): client, payment, refund and invoice data are kept while the account is active and deleted 30 days after closure/deletion; audit events are deleted 30 days after creation. An open refund/dispute pauses deletion for records tied to it; the 30 days restart when it is resolved." Remaining includes "the hold-on-dispute purge implementation (DP-08), and the all-copies/backup 30-day proof (BR-04)".
- **DP-02** (`docs/13-production-readiness.md:43`): records the same clock start and hold, with "audit events are deleted 30 days after creation"; remaining includes "policy implementation, evidence that audit history meets it, the hold-on-dispute purge implementation (DP-08), and the all-copies/backup 30-day proof (BR-04)".
- **DP-06** (`docs/13-production-readiness.md:44`): "Future purge job operational requirement (not implemented in F13): (a) disable/ban the Auth user and confirm it, retaining the deactivation denial state until confirmed; (b) stop or complete pending refund lockout retries; (c) only then remove or anonymize `app_private.client_deactivation_state` and `app_private.refund_auth_lockouts` rows; (d) purge the Auth user."
- **OP-01** (`docs/13-production-readiness.md:84`): "F11 purge scheduling uses Supabase `pg_cron`; activation remains deferred to Pre-Production until this gate is met" and "After PO approval, ... connect privately as postgres and run `begin; select app_private.purge_schedule_activate(); commit;`". The inactive placeholder job `lifter-f11-purge-signup` and `app_private.purge_schedule_activate()` / `purge_schedule_deactivate()` are defined in `supabase/migrations/20261031130000_purge_scheduling_pg_cron.sql`; the job command was later rewritten to `select app_private.purge_f11_retained_data();` in `supabase/migrations/20261106100000_catalog_operation_keys.sql:95-121`. The migration deliberately contains no activation call.
- **BR-01** (`:92`), **BR-02** (`:93`), **BR-04** (`:95`), **FN-03** (`:59`) are **Open**. BR-04 is "the all-copies/backup proof that keeps 013 T019/T020 and 015 T019/T025 UNTICKED".

### docs/04-changes-and-questions.md S70 entries

- `docs/04-changes-and-questions.md:1785`: "S70-PO-5 answers the two retention questions that PR #310 recorded as open: S70-R3-MCQ-1 (when the 30-day clock starts) and S70-R3-MCQ-2 (records tied to an open refund/dispute). Both are closed by this record; no PO question on retention remains open."
- `docs/04-changes-and-questions.md:1789-1791`: the S70-PO-5 PO words quoted above.
- `docs/04-changes-and-questions.md:1793`: the architect mapping quoted above; "No task is ticked; the backup gates BR-01/BR-02/BR-04 and FN-03 stay Open."

### Other binding constraints cited

- `docs/04-changes-and-questions.md:16` (D-10): "Refunds & deletion | Platform Owner only".
- Constitution VII, quoted verbatim in `specs/011-client-accounts/plan.md:139-140`: "Account closure MUST deactivate access and pseudonymize PII while keeping the legally required ledger and audit records."
- `specs/013-freeze-renewal-refunds/spec.md:323`: "Reconcile with financial-ledger/audit retention (retain minimal legally required evidence; ledger is never physically deleted)".
- `specs/013-freeze-renewal-refunds/spec.md:287` (RET-1=B): "30-day clock starts when client relationship ends (Closure/Refund/Deactivation)" and the four-step future purge-job operational order quoted in DP-06 above.

## User Scenarios & Testing

### Story 1 — Eligibility from the decided clocks (P1)

An authorized operator runs the purge entry point. Eligibility is computed from the two S70-PO-5 clocks: closure/deletion for client, payment, refund and invoice data, and creation for audit events.

**Independent test**: `tests/integration/retention-purge-eligibility.test.ts` and `tests/unit/retention-purge-clocks.test.ts` exercise the pure clock functions and the database-backed eligibility query with synthetic closed/deleted and active accounts and synthetic audit events.

**Acceptance scenarios**

1. **Given** a client account closed or deleted 29 days ago and no open refund/dispute, **When** the entry point is run in dry-run mode, **Then** its client, payment, refund and invoice records are not selected for deletion and the evidence records the reason "inside the 30-day window" (FR-001, FR-002, FR-003, FR-009).
2. **Given** a client account closed or deleted 30 or more days ago and no open refund/dispute, **When** the entry point is run, **Then** its PO-scoped client, payment, refund and invoice records are selected as eligible (FR-001, FR-002).
3. **Given** a client account that is still active, regardless of the age of its rows, **When** the entry point is run, **Then** none of its client, payment, refund or invoice records are selected for deletion (S70-PO-5 "kept while the account is active"; FR-002).
4. **Given** an audit event created 29 days ago, **When** the entry point is run in dry-run mode, **Then** that audit event is not selected for deletion (FR-001, FR-003).
5. **Given** an audit event created 30 or more days ago, **When** the entry point is run, **Then** that audit event is selected as eligible under the clock "audit events are deleted 30 days after creation" (FR-001, FR-011). Per S70-PO-10 Q2, because audit history is immutable legally required evidence, the eligible audit row is pseudonymized/anonymized so it no longer identifies the client (not physically deleted), and per S70-PO-10 Q3 the mutation is performed only by the single reviewed SECURITY DEFINER purge path that is the sole actor exempt from the `public.audit_events` immutability triggers, which records what it removed.
6. **Given** any record whose 30-day period has not fully elapsed, **When** any mode of the entry point is run, **Then** no delete statement affects that record; the 30-day window is never shortened, skipped, or overridden by a flag or argument (FR-003).

### Story 2 — Open refund/dispute hold and restart (P1)

A record tied to an open refund or dispute is held even after day 30, and the 30 days restart when the refund or dispute is resolved. Architect mapping S70-R47 (not a PO decision): only refund holds are currently enforceable because no persisted dispute object exists in LIFTER; the dispute hold applies when a dispute object is introduced.

**Independent test**: `tests/integration/retention-purge-hold-restart.test.ts` drives synthetic refund states through resolution and asserts the eligibility boundary before and after.

**Acceptance scenarios**

1. **Given** a record that reached day 30 and is tied to an open refund or dispute, **When** the entry point is run, **Then** the record is not deleted and the evidence records the hold and its reason (FR-004; DP-08 "Deletion pauses for records tied to an open refund/dispute"). Per S70-PO-10 Q1 as mapped by architect mapping S70-R47, a refund is "open" only while `app_private.refund_auth_lockouts.status` is non-terminal — `pending` or `retry` (`20261103120000_refund_auth_lockout_hook.sql:16`) — and the 30 days restart when it becomes the sole terminal outcome `succeeded`. No subscription-status or generic `public.jobs` state is a hold predicate, and no dispute hold is enforceable until a dispute object exists (S70-R47; see the S70-PO-10 section above).
2. **Given** a held record whose refund or dispute was resolved 1 day ago, **When** the entry point is run, **Then** the record is still not deleted and the evidence records that the 30-day clock restarted at resolution (FR-004).
3. **Given** a held record whose refund or dispute was resolved 30 or more days ago, **When** the entry point is run, **Then** the record is eligible for deletion (FR-004).
4. **Given** a held record, **When** the hold is in force, **Then** the elapsed time before resolution does not count toward the restarted 30 days and no partial elapsed time is carried over (FR-004).
5. **Given** records tied to an open refund/dispute and unrelated records of the same client, **When** the entry point is run, **Then** only the records tied to the open refund/dispute are held ("pauses deletion for records tied to an open refund/dispute"; FR-004).

### Story 3 — Authorization, idempotency, dry-run and evidence (P1)

The entry point is restricted, safe to replay, and produces verifiable evidence without writing user-facing copy or secrets.

**Independent test**: `tests/integration/retention-purge-authz.test.ts`, `tests/integration/retention-purge-dryrun-evidence.test.ts` and `tests/unit/retention-purge-idempotency.test.ts`.

**Acceptance scenarios**

1. **Given** a Platform Owner identity, **When** the entry point is invoked through the application and directly at the database boundary, **Then** the application and the authenticated-only wrapper authorize it under D-10 ("Refunds & deletion | Platform Owner only"); a non-Platform-Owner, anonymous, client, or foreign-workspace identity is denied at both boundaries (FR-007). The wrapper requires a non-null `auth.uid()` and `app_private.is_platform_owner()` before it calls the postgres-only internal purge.
2. **Given** RLS is temporarily loosened or an authorization guard is mutated, **When** the mutation-evidence suite runs, **Then** the corresponding negative test fails; restoring the guard makes it pass, and the executed mutation results are recorded as evidence (FR-010).
3. **Given** a dry-run invocation, **When** it completes, **Then** no row is deleted, no audit event is written by the purge, and the evidence contains the candidate set, eligibility decisions, hold reasons and counts only — no PII, tokens, secrets, raw IP, or note/body text (FR-009).
4. **Given** two identical invocations with the same run identifier, **When** both complete, **Then** the second performs no additional deletion, produces no duplicate evidence row, and reports the same already-processed outcome (FR-008).
5. **Given** an invocation that fails partway, **When** it is retried with the same run identifier, **Then** the retry resumes without double-deleting any record and without losing evidence for the work already committed (FR-008).
6. **Given** any invocation, **When** evidence is written, **Then** it records the decision source (S70-PO-1 item 3; S70-PO-3; S70-PO-4; S70-PO-5; DP-01/02/06/08) and does not record a lawyer name, date, file location, or citation (FR-009; S70-PO-4).

### Story 4 — Scheduler disabled and backup gate stays open (P1)

The feature delivers code and tests only. It does not start a clock and does not close a backup gate.

**Independent test**: `tests/integration/retention-purge-scheduler-disabled.test.ts` and `tests/unit/backup-retention.test.ts` (existing regression coverage).

**Acceptance scenarios**

1. **Given** any build of this feature, **When** the scheduler/pg_cron state is inspected, **Then** no cron job, schedule, or trigger is created, enabled, or activated by this feature and any pre-existing purge schedule stays disabled exactly as OP-01 requires (FR-005; DP-08).
2. **Given** the entry point's dry-run and mutation evidence, **When** it is read, **Then** it makes no claim that backups, BR-01, BR-02, BR-04, or FN-03 are satisfied or covered by the purge (FR-006; S70-PO-4 "Keep the backup gate open").
3. **Given** this spec and its plan/tasks, **When** they are reviewed, **Then** no task is ticked, no `pg_cron` activation, no migration version allocation, and no change to BR-01/BR-02/BR-04/FN-03 status is present (FR-006, FR-012).

## Functional Requirements

- **FR-001**: The purge entry point MUST implement the 30-day retention period decided by S70-PO-1 item 3 and S70-PO-3/4 for the data classes named in S70-PO-4: client, payment, refund and invoice data, and audit data. For client, payment, refund and invoice data the period is counted from account closure/deletion; for audit events it is counted from creation (S70-PO-5). No other data class is added by this feature. Per S70-PO-10 Q4, "invoice data" is the existing payment/receipt/refund ledger projections and no new table is added: the in-scope objects are `public.payment_events` (`20261101120000_registration_approval_model.sql:94-125`), `public.refund_operations` (`20261103123000_f13_refund_ledger.sql:2-20`), `public.refund_allocation_events` (`20261103123000_f13_refund_ledger.sql:22-40`) and `public.subscription_obligation_cancellations` (`20261103123000_f13_refund_ledger.sql:42-57`).
- **FR-002**: The entry point MUST keep client, payment, refund and invoice data while the account is active, MUST NOT select them for age-based deletion while active, and MUST start the 30-day clock only at closure/deletion (S70-PO-5). The audit clock MUST start at creation (S70-PO-5). Per S70-PO-10 Q2, at day 30 the entry point MUST pseudonymize/anonymize the rows that are immutable legally required evidence (the payment ledger, refund operations/allocations, cancellation facts and audit history in FR-001/FR-011) so they no longer identify the client, and MUST physically delete every other in-scope row that is not immutable legally required evidence. No legally required ledger, refund or audit evidence is physically deleted; the DP-06 operational order is preserved for the Auth-state rows it names. Legal basis stays recorded only as "PO states Egyptian legal advice was obtained" (S70-PO-4).
- **FR-003**: No record MAY be deleted before its full 30-day period has elapsed. No flag, parameter, run mode, or operator action in this feature MAY delete data inside the window, override the window, or shorten the period (S70-PO-1 item 3; S70-PO-3; S70-PO-5; DP-01/DP-02/DP-08).
- **FR-004**: Deletion MUST pause for records tied to an open refund or dispute, and the full 30-day period MUST restart when that refund or dispute is resolved (S70-PO-5 Q2; DP-08). The hold applies only to the tied records, not to unrelated records of the same client. Per S70-PO-10 Q1 as mapped by **architect mapping S70-R47** (not a PO decision), the only non-terminal refund state is the Auth-lockout outbox `app_private.refund_auth_lockouts.status` (`20261103120000_refund_auth_lockout_hook.sql:16`, `check (status in ('pending','retry','succeeded'))`): the concrete OPEN states are `pending` and `retry`, and the sole RESOLVED state is `succeeded`. Refund ledger rows in `public.refund_operations` (`20261103123000_f13_refund_ledger.sql:2-20`) are atomic and have no status column, so no other refund state creates a hold. `public.jobs` contributes no hold row: no `public.jobs.kind` is tied to the refund lockout (the lockout is driven by RPCs directly on the outbox, `20261103125000_f13_refund_operations.sql:370-408`), and generic `public.jobs.status` MUST NOT be used as a hold predicate. `public.subscriptions.status` (`20261103124000_f13_entitlement.sql:6`) is an account-activity projection governed by FR-002, not a refund hold; `expired` is not a refund resolution. **Recorded fact (S70-R47):** no persisted dispute object exists in LIFTER (`git grep -i dispute origin/main -- supabase/migrations` returns no match); the dispute hold applies when a dispute object is introduced, and until then only refund holds are enforceable. The full 30-day window restarts from the moment the state becomes RESOLVED, with no carry-over.
- **FR-005**: The scheduler/pg_cron MUST remain DISABLED. This feature delivers the entry point and tests only: it MUST NOT create, register, enable, or activate a cron job, schedule, trigger, or any other automatic invocation, and it MUST NOT change OP-01 (docs/13:84) or call `app_private.purge_schedule_activate()`. The existing inactive `lifter-f11-purge-signup` placeholder and the `app_private.purge_f11_retained_data()` command it references stay inactive and unchanged (DP-08; OP-01; `supabase/migrations/20261031130000_purge_scheduling_pg_cron.sql`; `supabase/migrations/20261106100000_catalog_operation_keys.sql`).
- **FR-006**: The backup gate MUST remain open. The purge and its evidence MUST NOT claim that backup coverage, BR-01, BR-02, BR-04, or FN-03 is satisfied, covered, or closed by the purge; those gates and BR-04's all-copies/backup proof stay Open (S70-PO-4 "Keep the backup gate open"; docs/13 DP-08, BR-01, BR-02, BR-04, FN-03).
- **FR-007**: The entry point MUST be authorized under D-10 ("Refunds & deletion | Platform Owner only") at both the application boundary and the database boundary, with deny-by-default RLS. The database boundary MUST be one authenticated-callable SECURITY DEFINER wrapper with `search_path=''` that first requires non-null `auth.uid()` and `app_private.is_platform_owner()`, raises SQLSTATE `42501` otherwise, then calls the existing postgres-only internal purge. Grant wrapper EXECUTE only to `authenticated`; revoke it from PUBLIC, `anon`, and `service_role`. The internal purge stays postgres-only. This narrow explicit check does not widen tenant access (architect mapping S70-R61). Authorization MUST not rely on UI visibility. No RLS policy, grant, or role is weakened by this feature.
- **FR-008**: Purge runs MUST be idempotent by a stable run identifier: a replay or retry with the same identifier MUST NOT delete a second time, duplicate an evidence row, or lose evidence for work already committed. The run identifier is not an authorization factor.
- **FR-009**: A dry-run mode MUST compute the eligible set, the held set, and the reasons without mutating data; it MUST produce evidence of counts and decisions only. All evidence MUST omit PII, tokens, secrets, raw IP, `ip_key`, and note or body text. The evidence MUST cite the decision sources (S70-PO-1 item 3; S70-PO-3; S70-PO-4; S70-PO-5; DP-01/02/06/08) and MUST record only "PO states Egyptian legal advice was obtained" as the legal basis (S70-PO-4).
- **FR-010**: Every deletion behavior MUST be covered by executed mutation evidence: tests MUST fail when an authorization/RLS guard or a clock/hold predicate is mutated and pass when restored. The tested SHA, tool versions, failing assertion, and restore result MUST be recorded in the feature's verification record before any traceability tick (Spec Kit gate §3; S70 Common rules).
- **FR-011**: The S70-PO-5 rule "audit events are deleted 30 days after creation" MUST be implemented for the audit data class. Per S70-PO-10 Q2, an audit event older than 30 days is pseudonymized/anonymized so it no longer identifies the client, not physically deleted, because it is immutable legally required evidence. Per S70-PO-10 Q3, the mutation is performed only through one narrow, audited SECURITY DEFINER purge function that is the sole actor exempted from the immutability triggers in `supabase/migrations/20261027150000_audit_log.sql:29-41`; every other actor (including `postgres`) remains blocked on UPDATE/DELETE/TRUNCATE. The function MUST have reviewed grants and MUST record what it removed. No existing audit row younger than 30 days is touched, and no audit mutation outside the decided clock is introduced.
- **FR-012**: This feature is spec-only. It MUST NOT change any other feature's retention text, tick any task, allocate a migration version, change a PO-decision record, change the constitution, or close a production-readiness gate. Implementation authorization, migration version selection, and task ticks require the applicable later lane and gates.

## Success Criteria

- **SC-001**: 100% of eligibility cases in Story 1 produce the result stated in the scenario: no deletion inside 30 days, deletion only from closure/deletion for client/payment/refund/invoice data and from creation for audit events, and no deletion for an active account.
- **SC-002**: 100% of hold cases in Story 2 hold the tied records while the refund is in the OPEN state (`pending`/`retry` in `app_private.refund_auth_lockouts.status`) and start a fresh full 30-day period when it reaches the RESOLVED state (`succeeded`); zero partial elapsed time is carried over, and unrelated records of the same client are unaffected (S70-PO-10 Q1; architect mapping S70-R47). No generic `public.jobs` or `public.subscriptions.status` state triggers a hold, and no dispute hold is asserted while no dispute object exists.
- **SC-003**: 100% of authorization cases in Story 3 are allowed for Platform Owner and denied for every other identity at both application and database boundaries (D-10; FR-007). Mutation evidence kills every authorization/RLS guard tested and records the failing assertion and restore.
- **SC-004**: 100% of dry-run invocations make zero row deletions and zero purge-written audit events, and their evidence contains no PII, token, secret, raw IP, `ip_key`, or note/body text (FR-009).
- **SC-005**: Identical run identifiers replay with zero additional deletions and zero duplicate evidence rows, including after a mid-run failure (FR-008).
- **SC-006**: Scheduler/pg_cron state is unchanged and disabled: zero jobs, schedules, triggers, or activations created or enabled by this feature, and OP-01 unchanged (FR-005).
- **SC-007**: Zero evidence artifact or document owned by this feature claims backup coverage or a closed BR-01/BR-02/BR-04/FN-03 gate; all four gates remain Open (FR-006).
- **SC-008**: Every executed test named in tasks.md has a recorded pass result on the tested head, and every RED-first test is recorded as failing before its implementation slice and passing after (FR-010; Spec Kit gate §3).
- **SC-009**: No user-visible copy is introduced by this feature; no legal detail beyond "PO states Egyptian legal advice was obtained" is recorded (S70-PO-4; FR-009).
- **SC-010**: This artifact changes only `specs/026-retention-purge/**`; no task is ticked, no migration, code, scheduler, hosted configuration, or production-readiness gate is changed by it (FR-012).

## Clarifications

### PO decision register (resolved, cited — not re-decided)

### Architect mapping (technical design, not a PO decision)

- **S70-R61** resolves the database-boundary implementation for FR-007: use one authenticated-callable SECURITY DEFINER wrapper with an empty search path; check `auth.uid()` is non-null and `app_private.is_platform_owner()` before calling the existing postgres-only purge; raise `42501` on denial; grant EXECUTE to `authenticated` only and revoke from PUBLIC, `anon`, and `service_role`. The internal purge remains postgres-only. This narrow guard does not widen tenant access.

1. **30-day value** — S70-PO-1 item 3, S70-PO-3, S70-PO-4; `docs/04` D-20 line 26, B4 line 62, S70 section lines 1777-1781. Recorded as 30 days for client, audit, payment, refund and invoice data.
2. **Legal basis recording** — S70-PO-4: record only "PO states Egyptian legal advice was obtained"; no lawyer name, date, file location, or citation.
3. **Clock start** — S70-PO-5 Q1 = A (architect mapping S70-R3-MCQ-1 = A): client, payment, refund and invoice data from account closure/deletion; audit events from creation. Recorded in docs/13 DP-01/DP-02/DP-06/DP-08 and docs/04 lines 1783-1793.
4. **Open refund/dispute hold and restart** — S70-PO-5 Q2 = A (architect mapping S70-R3-MCQ-2 = A): deletion pauses for records tied to an open refund/dispute, and the 30 days restart when it is resolved. Recorded in docs/13 DP-01/DP-02/DP-06/DP-08. The open/terminal state enumeration is decided by S70-PO-10 Q1 (below).
5. **Backup gate** — S70-PO-4 "Keep the backup gate open"; docs/13 DP-08, BR-01, BR-02, BR-04, FN-03 remain Open; BR-04 all-copies/backup proof keeps 013 T019/T020 and 015 T019/T025 UNTICKED.
6. **Scheduler** — docs/13 OP-01: purge scheduling uses pg_cron but activation remains deferred; this feature adds no activation.
7. **Deletion authority** — `docs/04` D-10 (line 16): "Refunds & deletion | Platform Owner only".
8. **No open question on retention itself** — `docs/04` line 1785: "Both are closed by this record; no PO question on retention remains open." The four implementation-facing questions were implementation details that arise when the recorded decision is encoded in purge code; all four are now closed by S70-PO-10, and none reopened the 30-day value, the two clocks, or the hold-and-restart rule.

### Resolved by S70-PO-10 (all four MCQs closed; no question remains open)

The four implementation-facing questions were escalated as numbered MCQs in the prior lane report; S70-PO-10 selected the recommended option for every one. The decided text is cited in the S70-PO-10 source section above and encoded in FR-001/FR-002/FR-004/FR-011, the Story 1/Story 2 scenarios, the plan and the tasks.

- **Q1 = A (Not yet finished)** — OPEN = non-terminal refund states; RESOLVED = any final outcome, which restarts the 30 days. Architect mapping S70-R47 corrects the persisted object: the only source is `app_private.refund_auth_lockouts.status` — OPEN `pending`/`retry`, RESOLVED `succeeded` (`20261103120000_refund_auth_lockout_hook.sql:16`). `public.subscriptions.status` (account activity, FR-002) and generic `public.jobs.status` are excluded from the hold, and no persisted dispute object exists. Encoded in FR-004 and Story 2 scenarios 1-5.
- **Q2 = B (Anonymize those, delete rest)** — pseudonymize/anonymize the legally required ledger, refund and audit evidence so it no longer identifies the client; physically delete all other in-scope rows. Legal basis remains only "PO states Egyptian legal advice was obtained". Encoded in FR-001/FR-002/FR-011 and Story 1 scenario 5.
- **Q3 = A (One special purge path)** — a single narrow, audited SECURITY DEFINER purge function is the only actor exempt from the `public.audit_events` immutability triggers; every other actor stays blocked, grants are reviewed, and the function records what it removed. Encoded in FR-011 and Story 1 scenario 5.
- **Q4 = A (Payments/receipts/refunds)** — existing payment/receipt/refund ledger projections are the invoice data; no new table. Concrete objects: `public.payment_events` (`20261101120000_registration_approval_model.sql:94-125`), `public.refund_operations` (`20261103123000_f13_refund_ledger.sql:2-20`), `public.refund_allocation_events` (`20261103123000_f13_refund_ledger.sql:22-40`), `public.subscription_obligation_cancellations` (`20261103123000_f13_refund_ledger.sql:42-57`). Encoded in FR-001 and the eligibility tasks.

### Analyze

`checklists/analyze.md` was re-run after the S70-PO-10 requirement-text change and again after the architect mapping S70-R47 correction to the Q1 state mapping; it is dated after this spec, plan, and tasks. It records the four resolved questions above, the cited decision sources (including S70-PO-10), the S70-R47 mapping (refund-only hold; no subscription-status or generic-job hold; no persisted dispute object), and zero open CRITICAL/HIGH findings within the decided scope.
