# Feature Specification: F26 — Retention Purge Entry Point (DP-08)

**Feature Branch**: `s70-026-retention-purge-spec`
**Status**: Spec-only. No implementation, SQL, migration, scheduler activation, hosted change, or task tick is authorized by this artifact. The PO decisions are recorded; the purge implementation is a pre-production item (docs/13 DP-08). Four implementation-facing questions are open and marked `[NEEDS PO DECISION: Qn]`; they are listed as numbered MCQs in the lane report, not guessed here.
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
5. **Given** an audit event created 30 or more days ago, **When** the entry point is run, **Then** that audit event is selected as eligible under the clock "audit events are deleted 30 days after creation" (FR-001, FR-011; `[NEEDS PO DECISION: Q2]` and `[NEEDS PO DECISION: Q3]` govern how the deletion is carried out).
6. **Given** any record whose 30-day period has not fully elapsed, **When** any mode of the entry point is run, **Then** no delete statement affects that record; the 30-day window is never shortened, skipped, or overridden by a flag or argument (FR-003).

### Story 2 — Open refund/dispute hold and restart (P1)

A record tied to an open refund or dispute is held even after day 30, and the 30 days restart when the refund or dispute is resolved.

**Independent test**: `tests/integration/retention-purge-hold-restart.test.ts` drives synthetic refund/dispute states through resolution and asserts the eligibility boundary before and after.

**Acceptance scenarios**

1. **Given** a record that reached day 30 and is tied to an open refund or dispute, **When** the entry point is run, **Then** the record is not deleted and the evidence records the hold and its reason (FR-004; DP-08 "Deletion pauses for records tied to an open refund/dispute"). `[NEEDS PO DECISION: Q1]` — the set of states that count as "open" is not defined by the PO sources.
2. **Given** a held record whose refund or dispute was resolved 1 day ago, **When** the entry point is run, **Then** the record is still not deleted and the evidence records that the 30-day clock restarted at resolution (FR-004).
3. **Given** a held record whose refund or dispute was resolved 30 or more days ago, **When** the entry point is run, **Then** the record is eligible for deletion (FR-004).
4. **Given** a held record, **When** the hold is in force, **Then** the elapsed time before resolution does not count toward the restarted 30 days and no partial elapsed time is carried over (FR-004).
5. **Given** records tied to an open refund/dispute and unrelated records of the same client, **When** the entry point is run, **Then** only the records tied to the open refund/dispute are held ("pauses deletion for records tied to an open refund/dispute"; FR-004).

### Story 3 — Authorization, idempotency, dry-run and evidence (P1)

The entry point is restricted, safe to replay, and produces verifiable evidence without writing user-facing copy or secrets.

**Independent test**: `tests/integration/retention-purge-authz.test.ts`, `tests/integration/retention-purge-dryrun-evidence.test.ts` and `tests/unit/retention-purge-idempotency.test.ts`.

**Acceptance scenarios**

1. **Given** a Platform Owner identity, **When** the entry point is invoked through the application and directly at the database boundary, **Then** it is authorized under D-10 ("Refunds & deletion | Platform Owner only"); a non-Platform-Owner, anonymous, client, or foreign-workspace identity is denied at both boundaries (FR-007).
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

- **FR-001**: The purge entry point MUST implement the 30-day retention period decided by S70-PO-1 item 3 and S70-PO-3/4 for the data classes named in S70-PO-4: client, payment, refund and invoice data, and audit data. For client, payment, refund and invoice data the period is counted from account closure/deletion; for audit events it is counted from creation (S70-PO-5). No other data class is added by this feature. `[NEEDS PO DECISION: Q4]`: no persisted invoice table exists in the current schema, so the concrete objects that carry "invoice data" MUST NOT be invented until Q4 is answered.
- **FR-002**: The entry point MUST keep client, payment, refund and invoice data while the account is active, MUST NOT select them for age-based deletion while active, and MUST start the 30-day clock only at closure/deletion (S70-PO-5). The audit clock MUST start at creation (S70-PO-5). `[NEEDS PO DECISION: Q2]` applies only to the treatment of records that are required to remain as immutable legally required evidence; the clock start itself is decided.
- **FR-003**: No record MAY be deleted before its full 30-day period has elapsed. No flag, parameter, run mode, or operator action in this feature MAY delete data inside the window, override the window, or shorten the period (S70-PO-1 item 3; S70-PO-3; S70-PO-5; DP-01/DP-02/DP-08).
- **FR-004**: Deletion MUST pause for records tied to an open refund or dispute, and the full 30-day period MUST restart when that refund or dispute is resolved (S70-PO-5 Q2; DP-08). The hold applies only to the tied records, not to unrelated records of the same client. `[NEEDS PO DECISION: Q1]`: the PO sources do not enumerate which refund/dispute states count as "open"; the entry point MUST NOT invent an enumeration or a status list until Q1 is answered.
- **FR-005**: The scheduler/pg_cron MUST remain DISABLED. This feature delivers the entry point and tests only: it MUST NOT create, register, enable, or activate a cron job, schedule, trigger, or any other automatic invocation, and it MUST NOT change OP-01 (docs/13:84) or call `app_private.purge_schedule_activate()`. The existing inactive `lifter-f11-purge-signup` placeholder and the `app_private.purge_f11_retained_data()` command it references stay inactive and unchanged (DP-08; OP-01; `supabase/migrations/20261031130000_purge_scheduling_pg_cron.sql`; `supabase/migrations/20261106100000_catalog_operation_keys.sql`).
- **FR-006**: The backup gate MUST remain open. The purge and its evidence MUST NOT claim that backup coverage, BR-01, BR-02, BR-04, or FN-03 is satisfied, covered, or closed by the purge; those gates and BR-04's all-copies/backup proof stay Open (S70-PO-4 "Keep the backup gate open"; docs/13 DP-08, BR-01, BR-02, BR-04, FN-03).
- **FR-007**: The entry point MUST be authorized under D-10 ("Refunds & deletion | Platform Owner only") at both the application boundary and the database boundary, with deny-by-default RLS and no service-role or SECURITY DEFINER bypass that widens tenant access. Authorization MUST not rely on UI visibility. No RLS policy, grant, or role is weakened by this feature.
- **FR-008**: Purge runs MUST be idempotent by a stable run identifier: a replay or retry with the same identifier MUST NOT delete a second time, duplicate an evidence row, or lose evidence for work already committed. The run identifier is not an authorization factor.
- **FR-009**: A dry-run mode MUST compute the eligible set, the held set, and the reasons without mutating data; it MUST produce evidence of counts and decisions only. All evidence MUST omit PII, tokens, secrets, raw IP, `ip_key`, and note or body text. The evidence MUST cite the decision sources (S70-PO-1 item 3; S70-PO-3; S70-PO-4; S70-PO-5; DP-01/02/06/08) and MUST record only "PO states Egyptian legal advice was obtained" as the legal basis (S70-PO-4).
- **FR-010**: Every deletion behavior MUST be covered by executed mutation evidence: tests MUST fail when an authorization/RLS guard or a clock/hold predicate is mutated and pass when restored. The tested SHA, tool versions, failing assertion, and restore result MUST be recorded in the feature's verification record before any traceability tick (Spec Kit gate §3; S70 Common rules).
- **FR-011**: The S70-PO-5 rule "audit events are deleted 30 days after creation" MUST be implemented for the audit data class, subject to two open questions: `[NEEDS PO DECISION: Q2]` whether physical deletion or pseudonymization/anonymization applies to records required as immutable legally required evidence, and `[NEEDS PO DECISION: Q3]` how deletion is compatible with the immutable `public.audit_events` table. No mechanism is guessed or encoded in this spec. No existing audit row younger than 30 days is touched, and no audit mutation outside the decided clock is introduced.
- **FR-012**: This feature is spec-only. It MUST NOT change any other feature's retention text, tick any task, allocate a migration version, change a PO-decision record, change the constitution, or close a production-readiness gate. Implementation authorization, migration version selection, and task ticks require the applicable later lane and gates.

## Success Criteria

- **SC-001**: 100% of eligibility cases in Story 1 produce the result stated in the scenario: no deletion inside 30 days, deletion only from closure/deletion for client/payment/refund/invoice data and from creation for audit events, and no deletion for an active account.
- **SC-002**: 100% of hold cases in Story 2 hold the tied records while the refund/dispute is open and start a fresh full 30-day period at resolution; zero partial elapsed time is carried over, and unrelated records of the same client are unaffected (once Q1 is answered).
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

1. **30-day value** — S70-PO-1 item 3, S70-PO-3, S70-PO-4; `docs/04` D-20 line 26, B4 line 62, S70 section lines 1777-1781. Recorded as 30 days for client, audit, payment, refund and invoice data.
2. **Legal basis recording** — S70-PO-4: record only "PO states Egyptian legal advice was obtained"; no lawyer name, date, file location, or citation.
3. **Clock start** — S70-PO-5 Q1 = A (architect mapping S70-R3-MCQ-1 = A): client, payment, refund and invoice data from account closure/deletion; audit events from creation. Recorded in docs/13 DP-01/DP-02/DP-06/DP-08 and docs/04 lines 1783-1793.
4. **Open refund/dispute hold and restart** — S70-PO-5 Q2 = A (architect mapping S70-R3-MCQ-2 = A): deletion pauses for records tied to an open refund/dispute, and the 30 days restart when it is resolved. Recorded in docs/13 DP-01/DP-02/DP-06/DP-08. The status enumeration is not decided (Q1 below).
5. **Backup gate** — S70-PO-4 "Keep the backup gate open"; docs/13 DP-08, BR-01, BR-02, BR-04, FN-03 remain Open; BR-04 all-copies/backup proof keeps 013 T019/T020 and 015 T019/T025 UNTICKED.
6. **Scheduler** — docs/13 OP-01: purge scheduling uses pg_cron but activation remains deferred; this feature adds no activation.
7. **Deletion authority** — `docs/04` D-10 (line 16): "Refunds & deletion | Platform Owner only".
8. **No open question on retention itself** — `docs/04` line 1785: "Both are closed by this record; no PO question on retention remains open." The three questions below are implementation-facing questions that arise when the recorded decision is encoded in purge code; none reopens the 30-day value, the two clocks, or the hold-and-restart rule.

### Open PO decisions (numbered MCQs — answer in the lane report, never guessed here)

- **Q1 — Which refund/dispute states count as "open" for the deletion hold?** Found in FR-004 and Story 2 scenario 1; source: S70-PO-5 Q2A ("an open refund/dispute") and docs/13 DP-08, neither of which enumerates states.
  - A: Only non-terminal refund/dispute states (for example pending or under-review), with resolution = any terminal state. Implication: narrow hold; records become eligible 30 days after the first terminal state.
  - B: Any refund/dispute that is not fully resolved and closed, including retries and lockout states. Implication: broader hold; safer for money/privacy but may delay deletion indefinitely if a state never resolves.
  - C: Delegate to the existing F13 refund/dispute state model with no new state list. Implication: reuses approved states but still requires naming which existing states are "open" before tests can assert it.
  - Recommendation: **A** — it matches the ordinary reading of "open" and makes resolution observable as a terminal state, while B risks an indefinite hold and C still needs a concrete list for tests.
  - Blocked: FR-004 status enumeration, Story 2 scenarios 1-5, the hold-side of T003/T004 and their tests cannot be finalised until answered.

- **Q2 — Does "deleted" at day 30 mean physical row deletion for payment/refund/invoice and audit data, or pseudonymization/anonymization that preserves immutable legally required evidence?** Found in FR-001, FR-002, FR-011 and Story 1 scenario 5. Conflict in cited sources: S70-PO-5 says those records are "deleted 30 days after closure/deletion" and audit events "deleted 30 days after creation"; Constitution VII (`specs/011-client-accounts/plan.md:139-140`) says "Account closure MUST deactivate access and pseudonymize PII while keeping the legally required ledger and audit records"; F13 (`specs/013-freeze-renewal-refunds/spec.md:323`) says "ledger is never physically deleted".
  - A: Physical deletion of all PO-scoped rows at day 30. Implication: literal reading of S70-PO-5, but contradicts the cited constitution/F13 language about keeping legally required ledger and audit records.
  - B: Pseudonymize/anonymize legally required financial and audit evidence at day 30 and physically delete the remaining PO-scoped rows. Implication: satisfies "no longer identifies the client" while keeping immutable evidence; needs a defined anonymization target and may still need the audit mechanism in Q3.
  - C: Physical deletion for client/payment/refund/invoice rows and retention of audit history until a separate PO decision. Implication: contradicts "audit events are deleted 30 days after creation" and cannot close DP-02.
  - Recommendation: **B** — it reconciles the cited S70-PO-5 rule with the cited Constitution VII and F13 constraints without inventing a new legal position; the legal basis stays recorded only as "PO states Egyptian legal advice was obtained".
  - Blocked: the deletion vs anonymization behavior in FR-001/FR-002/FR-011, Story 1 scenario 5, and the deletion-side implementation tasks cannot be finalised until answered.

- **Q3 — How is audit-event deletion at day 30 compatible with the immutable `public.audit_events` table?** Found in FR-011 and Story 1 scenario 5. Source: DP-02 requires "policy implementation" against an append-only table whose UPDATE/DELETE/TRUNCATE are blocked by triggers (as recorded in `specs/020-client-notes/spec.md` FR-010 and `supabase/migrations/20261027150000_audit_log.sql`).
  - A: Add a narrow, audited SECURITY DEFINER purge path that is the only actor exempted from the immutability triggers, keeping the triggers in force for everyone else. Implication: preserves append-only guarantees for normal actors; needs reviewed grants and mutation evidence.
  - B: Change the immutability triggers to permit deletes only after the 30-day audit clock, enforced by a policy checked inside the trigger. Implication: moves the clock into the trigger; higher risk of weakening audit tamper-resistance and needs RLS/mutation evidence.
  - C: Move expired audit events to a separate archive and delete the archive. Implication: adds a new storage/retention surface not decided by the PO and does not by itself prove removal from all recoverable copies.
  - Recommendation: **A** — it keeps the existing append-only guarantee for every other actor and confines the exception to one reviewed, evidenced path.
  - Blocked: FR-011 mechanism, the audit-side deletion task and its RLS/mutation evidence cannot be finalised until answered (and depend on Q2).

- **Q4 — What persisted objects count as "invoice data" for the 30-day clock?** Found in FR-001 and the eligibility tasks. S70-PO-4 names "invoice data" as a retention category and S70-PO-5 gives it the closure/deletion clock, but no `invoices` table or invoice column exists in any migration in this repository; the category appears only in spec and gate text (for example `specs/013-freeze-renewal-refunds/spec.md:287,323` and `docs/13-production-readiness.md:42-45`).
  - A: Treat the existing payment/receipt/refund ledger projections as the "invoice data" objects and apply the closure/deletion clock to them. Implication: no new table; may delete or pseudonymize financial evidence and therefore interacts with Q2.
  - B: Add an explicit invoice data class with a new persisted representation. Implication: new schema and product decisions not present in the PO sources; out of scope for this spec-only feature.
  - C: Record invoice data as a declared PO category with no concrete table in this feature, and keep it as an explicit gap for a later PO-backed lane. Implication: no invention, but DP-08 cannot claim full coverage of the named category.
  - Recommendation: **A** — it uses only existing persisted objects and keeps the closure/deletion clock, but it MUST NOT physically delete immutable legally required evidence unless Q2 also permits it.
  - Blocked: the concrete table list in the eligibility tasks and the invoice-side assertions cannot be finalised until answered.

### Analyze

`checklists/analyze.md` is dated after this spec, plan, and tasks. It records the four open questions above, the cited decision sources, and zero open CRITICAL/HIGH findings within the decided scope.
