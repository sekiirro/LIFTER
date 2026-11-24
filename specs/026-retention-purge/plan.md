# Implementation Plan: F26 Retention Purge Entry Point (DP-08)

This artifact is spec-only. It plans a future implementation lane; it does not authorize code, SQL, migrations, scheduler activation, or task ticks. Four implementation-facing questions remain open (Q1–Q4 in spec.md); slices that depend on them stay blocked and are marked accordingly.

## Summary

Extend the existing purge entry point so that it implements the S70-PO-5 clocks: 30 days from account closure/deletion for client, payment, refund and invoice data, and 30 days from creation for audit events, with a deletion hold for records tied to an open refund/dispute and a full 30-day restart at resolution. The scheduler stays disabled, the backup gates stay open, and every behavior is covered by RED-first tests and mutation evidence. No user-visible copy is added.

## Technical context

- Next.js App Router with server-verified identity; Supabase Postgres with RLS enabled and forced. D-10 ("Refunds & deletion | Platform Owner only", `docs/04-changes-and-questions.md:16`) governs deletion authority.
- The current consolidated purge entry point is `app_private.purge_f11_retained_data()` in `supabase/migrations/20261106100000_catalog_operation_keys.sql:111-121` (postgres-only). It calls `app_private.purge_client_signup_attempts()` and `app_private.purge_operation_keys()` defined in `supabase/migrations/20261031123600_client_accounts_admission.sql` and `20261106100000_catalog_operation_keys.sql:81-92`.
- The 30-day attempt value is `app_private.signup_retention_policy()` in `supabase/migrations/20261031121000_client_accounts_model.sql:44-47`, which currently returns `{"attempt_days":30,"counter_retention":"window_end","audit_retention":null}`. A separate audit clock is needed; it is NOT inferred from `audit_retention: null`.
- F15 already has closure-retention facts and purge consumers under `supabase/migrations/20261112024100_f15_closure_retention_facts.sql`, `20261112024200_f15_purge_owner_consumer.sql`, `20261112024600_f15_purge_completion_ledger.sql`, and `20261112021000_f15_lifecycle_purge_submissions.sql`. Reuse their patterns; do not duplicate their clocks.
- `lifter-f11-purge-signup` is an inactive pg_cron placeholder defined in `supabase/migrations/20261031130000_purge_scheduling_pg_cron.sql`; its command was rewritten in `20261106100000_catalog_operation_keys.sql:95-109` to `select app_private.purge_f11_retained_data();`. Activation is deferred under OP-01 (`docs/13-production-readiness.md:84`). No migration, test, or script in this feature calls `app_private.purge_schedule_activate()`.
- `public.audit_events` is immutable: `app_private.audit_events_immutable()` raises errcode `23514` and BEFORE UPDATE OR DELETE and BEFORE TRUNCATE triggers are installed in `supabase/migrations/20261027150000_audit_log.sql:29-41`; the guard applies even to `postgres`. Any audit deletion mechanism depends on Q2/Q3.
- Deletion-state sources: `app_private.client_deactivation_state.deactivated_at` and `public.clients.deactivated_at` (`supabase/migrations/20261103120000_refund_auth_lockout_hook.sql:1-10`; `20261103125000_f13_refund_operations.sql:34`), `deactivation_reason` and the immutable-transition guard in `20261112024100_f15_closure_retention_facts.sql:20-85`. `app_private.refund_auth_lockouts` (`20261103120000_refund_auth_lockout_hook.sql:12-26`) carries `status`, `attempts`, `next_attempt_at`, `completed_at` and `safe_error_code`; the DP-06 operational order (Auth ban confirmed → retries stopped → deactivation/lockout rows removed or anonymized → Auth user purged) must be preserved.
- Financial data classes: `public.payment_events` (`20261101120000_registration_approval_model.sql:94-125`), `public.refund_operations` and `public.refund_allocation_events` (`20261103123000_f13_refund_ledger.sql:2-57`). Their FKs are `ON DELETE RESTRICT`; F13 records "ledger is never physically deleted". No invoice table exists (Q4).
- The separate outbox/Cron Worker (`workers/cron/wrangler.jsonc:7-9`; `workers/cron/src/drain.ts`, `refund-auth-lockout.ts`, `account-deletion.ts`, `branding-gc.ts`) is not a retention scheduler and is not activated by this feature.
- Integration tests live in `tests/integration/**/*.test.ts` under `vitest.integration.config.ts`; mutation evidence follows the rollback-scoped `underMutant()` pattern in `tests/integration/client-portal-db-mutation.test.ts:10-13,79-100` and the RLS-loosening probes in `tests/integration/client-accounts-fixture.ts:39-52,510-605`. Never edit a committed migration to run a probe.
- Migration versions: none are allocated by this spec-only PR. A later implementation lane must scan all origin refs immediately before selecting any forward-only version, again before commit, and again before push (`npm run check:migration-versions:remote`).
- Formatting: `.prettierignore` lists `specs`, so `npm run format:check` skips these files, but `scripts/format-check-changed.mjs` checks changed Markdown using `prettier.resolveConfig` + `filepath`. Format all `specs/026-retention-purge/*.md` with the Prettier JS API (`resolveConfig` then `format` with the file path) before committing.

## Design

### Clock and eligibility model

- Introduce pure clock predicates (no I/O, no wall-clock read inside the predicate) for: closure/deletion clock for client/payment/refund/invoice rows; creation clock for audit events; and hold/restart for records tied to an open refund/dispute.
- A row is eligible only when the full 30 days have elapsed AND no hold is in force. The 30-day value and both clock starts come only from S70-PO-1 item 3, S70-PO-3, S70-PO-4 and S70-PO-5; they are not configurable by argument, flag, or environment variable in this feature.
- The hold restart uses the resolution time of the refund/dispute as the new clock start; elapsed time before resolution is not carried over. The set of states that count as "open" is Q1 and is not encoded.
- The concrete objects that carry "invoice data" are Q4 and are not invented.
- The treatment of immutable legally required evidence is Q2; the audit deletion mechanism is Q3.

### Entry point and modes

- Extend the existing postgres-only entry point rather than adding a second scheduler or a new automatic invocation. The entry point supports a dry-run mode that computes candidates, holds and reasons without mutation, and an apply mode that mutates only eligible rows.
- A stable run identifier makes replay idempotent: a second apply with the same identifier performs no additional deletion and appends no duplicate evidence. The identifier is not an authorization factor.
- Evidence is counts-and-decisions only: candidate counts, eligible/held/inside-window counts, hold reasons, the cited decision sources, and "PO states Egyptian legal advice was obtained". No PII, tokens, secrets, raw IP, `ip_key`, note or body text, and no lawyer name/date/file/citation.
- Authorization is enforced at the application boundary and at the database boundary under D-10 (Platform Owner only). Deny-by-default RLS stays in force; no service-role fallback widens tenant access.
- The DP-06 operational order is preserved before any Auth-user purge. This feature does not shorten or reorder it.

### Scheduler and backups

- No cron job, schedule, trigger, activation, or hosted change. `lifter-f11-purge-signup` stays inactive, OP-01 stays Open, and `app_private.purge_schedule_activate()` is not called.
- No evidence artifact claims backup coverage. BR-01, BR-02, BR-04 and FN-03 stay Open; BR-04 remains the all-copies/backup proof that keeps 013 T019/T020 and 015 T019/T025 unticked.

## Implementation phases (future implementation lane, RED-first)

Each slice is bounded to roughly 400 changed lines and lands RED first: commit the failing named test file, then commit the smallest implementation that turns it GREEN. Test files are named explicitly below.

1. **Contract lock** — confirm the cited sources and Q1–Q4 markers; no code. Evidence: reviewed artifacts and Analyze.
2. **Pure clocks RED → GREEN** — `tests/unit/retention-purge-clocks.test.ts`: 29 vs 30 days, active account never eligible, audit clock from creation, no deletion inside the window. RED commit before GREEN.
3. **Eligibility query RED → GREEN** — `tests/integration/retention-purge-eligibility.test.ts`: database-backed candidate set for client/payment/refund rows and invoice objects once Q4 is answered; audit candidates once Q2/Q3 are answered; scope isolation and no cross-tenant selection.
4. **Hold and restart RED → GREEN** — `tests/integration/retention-purge-hold-restart.test.ts`: open refund/dispute hold, no partial carry-over, full 30 days from resolution, unrelated records unaffected. Blocked on Q1 for the open-state list.
5. **Dry-run and idempotency RED → GREEN** — `tests/integration/retention-purge-dryrun-evidence.test.ts` and `tests/unit/retention-purge-idempotency.test.ts`: zero mutation on dry-run, evidence shape and source citations, same-run replay and mid-run retry without double deletion.
6. **Authorization and mutation evidence RED → GREEN** — `tests/integration/retention-purge-authz.test.ts`: Platform Owner allow, every other identity deny at both boundaries; rollback-scoped RLS/grant/predicate mutants that fail the negative assertion and pass on restore, with tested SHA and tool versions recorded.
7. **Audit-event deletion path RED → GREEN** — `tests/integration/retention-purge-audit.test.ts`: immutability preserved for all other actors, 30-day audit clock from creation, no audit row touched inside the window, evidence for the audited exception. Blocked on Q2 and Q3.
8. **Scheduler and backup regressions RED → GREEN** — `tests/integration/retention-purge-scheduler-disabled.test.ts`: zero activated jobs/schedules/triggers, OP-01 unchanged, no backup-coverage claim in any artifact; existing `tests/unit/backup-retention.test.ts` regression re-run.
9. **Gate slice** — Analyze re-run after any FR/SC text change, traceability rows written only after tests pass, format gates, `check:secrets`, lint, typecheck, full unit, touched integration suites, and PR gates on the exact head.

## Risks and mitigations

- **Deleting inside the window** — pure clock predicates with 29/30-day boundary tests and an explicit "no override flag" assertion; every deletion path goes through eligibility.
- **Indefinite or premature hold** — Q1 status enumeration before hold tests are final; hold tests assert both no-carry-over and restart from resolution.
- **Ledger/audit contradiction** — Q2 and Q3 resolved before any physical deletion; Constitution VII and F13 preservation language cited; no mechanism invented.
- **Unauthorized purge** — D-10 Platform-Owner-only at both walls, deny-by-default RLS, mutation evidence that kills each guard, no service-role fallback.
- **Accidental scheduler activation** — no activation call anywhere in the feature; scheduler-disabled test and OP-01 citation; exact-head CI gates.
- **False backup closure** — FR-006 and SC-007; no artifact claims BR-01/BR-02/BR-04/FN-03 satisfied.
- **Invented scope/copy** — Q4 for invoice objects; no user-visible strings; legal basis recorded only as the S70-PO-4 quoted string.

## Complexity tracking

| Item                                                                                                                                                                                | Deviation                                                                                    | Status                                                       | Blocks                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| S70-PO-5 "deleted 30 days after..." vs Constitution VII / F13 "pseudonymize PII while keeping the legally required ledger and audit records" / "ledger is never physically deleted" | Physical deletion vs pseudonymization of immutable evidence is not decided by the PO sources | OPEN — Q2 (recommendation B in spec.md); no behavior encoded | Audit and financial deletion slices            |
| Immutable `public.audit_events` triggers vs "audit events are deleted 30 days after creation"                                                                                       | Deletion mechanism for an append-only table is not decided                                   | OPEN — Q3 (recommendation A); no mechanism encoded           | Audit deletion slice and its mutation evidence |
| "Invoice data" named by S70-PO-4 with no invoices table in the schema                                                                                                               | No persisted object identified for this data class                                           | OPEN — Q4 (recommendation A); no table list invented         | Eligibility slice invoice assertions           |
| "Open refund/dispute" named by S70-PO-5 with no status list                                                                                                                         | No enumeration of open states                                                                | OPEN — Q1 (recommendation A); no status list encoded         | Hold/restart slice                             |

## PO decisions

- Resolved and cited: 30 days (S70-PO-1 item 3; S70-PO-3/4); legal basis string only (S70-PO-4); clock start (S70-PO-5 Q1A; S70-R3-MCQ-1); hold and restart (S70-PO-5 Q2A; S70-R3-MCQ-2); backup gate stays open (S70-PO-4; docs/13 DP-08, BR-01/02/04, FN-03); scheduler disabled (docs/13 OP-01); Platform Owner only for deletion (D-10). See spec.md "PO decision register".
- Open implementation-facing PO questions: Q1 (open-state list), Q2 (deletion vs pseudonymization of immutable evidence), Q3 (audit deletion mechanism), Q4 (invoice objects). Each has options, implications, a recommendation, and a blocked-scope statement in spec.md; the numbered MCQs are in the lane report.
- No new product decision is made by this spec-only PR. No task is ticked.
