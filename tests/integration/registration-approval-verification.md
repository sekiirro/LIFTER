# Registration approval verification

## U1 — exact money, validation and Sales approval denial (T004–T007)

### Architect sequencing decision

Split the unit into two commits to keep push CI aligned with the SQL matrix. Commit A pushes exact money and request validation only; it contains no TypeScript capability change or capability-denial tests, and the full unit suite must pass on that commit. Commit B locally removes Sales approval in the TS matrix and adds its capability test plus the existing `authorize.test.ts` matrix-oracle correction. Commit B remains the unpushed branch tip and must be pushed together with U2's SQL matrix and matrix-parity update. T004/T005 are ticked after Commit A; T006/T007 remain unticked until the denial slice is integrated with U2 parity.

- RED: first focused run before implementation: `npx vitest run tests/unit/registration-approval-money.test.ts tests/unit/registration-approval-validation.test.ts tests/unit/registration-approval-capabilities.test.ts`; 1 capability test failed because Sales still had `approve_registration`, while the money/validation modules did not yet exist. After test-first failing stubs were added, the same command reported 12 failed and 20 passed across 32 tests, including the half-minor rounding, bounds, shape, safe-result, and Sales-denial assertions. The combined-state full-suite diagnostic then showed the known stale-matrix conflict; the B-only capability change/test/oracle edit were removed from Commit A's working state per architect sequencing.
- GREEN: the same focused Vitest command after implementation: 3 files passed, 32 tests passed.
- Commit A gates on the capability-baseline file set: `npm test` passed 61 files / 1,385 tests; `npm run typecheck`, `npm run lint`, `npm run format:check`, and `git diff --check` passed. `npm run test:unit` is not defined in this checkout; `npm test` uses the configured `tests/unit/**/*.test.ts` suite.
- Q-M01 mutation: temporarily restored Sales `approve_registration` in the TS capability list. `npx vitest run tests/unit/registration-approval-capabilities.test.ts` failed at the denial assertion (`expected true to be false`). The mutation was reverted.
- Q-M07 mutation: temporarily changed the commission rounding addend from `5000n` to `4999n`. `npx vitest run tests/unit/registration-approval-money.test.ts -t 'rounds half-minor ties up'` failed at the first tie (`expected '0' to be '1'`). The mutation was reverted.
- Commit B local-only gates after applying the TS matrix denial and oracle correction: `npm test` passed 62 files / 1,386 tests; `npm run typecheck`, `npm run lint`, `npm run format:check`, and `git diff --check` passed. Do not push this commit before U2's SQL matrix and integration matrix-parity update; integration/matrix-parity.test.ts was not run in this DB-free unit.
- Gates: Commit A has the passing results above. The earlier combined-state diagnostic invoked all 62 files and got 1,385 passed / 1 failed in the existing `tests/unit/authorize.test.ts` matrix oracle, which expected Sales `approve_registration` true after the B-only TS capability removal. The oracle is corrected only in local Commit B, and its push waits for U2 SQL parity.
- Scope note: the authorization to update `tests/unit/authorize.test.ts` applies only to local Commit B. Commit A has the baseline TS matrix and no capability-denial test, so its full unit suite is run independently below. T006/T007 remain unticked until Commit B is locally green and later integrated with U2 parity.

## U1F — DB-free part (T049 / T052)

Executed 2026-10-29 on `012-registration-approval`, based on origin `c5a12f96d478fe887d5e811dea39e1805fd4c799`. Only T049/T052 are checked. T050/T051 SQL/integration and T053/T054 UI remain unimplemented by this unit. No DB, Docker, Supabase CLI, integration or e2e command was run; no UI, messages or `app/register/**` file was edited.

- Tests first: added `tests/unit/registration-links-flexible.test.ts` and service/action assertions in `tests/unit/registration-links-actions.test.ts` before implementation. Initial focused run had 19 failed / 40 passed (15 missing-export failures). With typed failing stubs, the same command, `npx vitest run tests/unit/registration-links-flexible.test.ts tests/unit/registration-links-actions.test.ts`, produced meaningful assertion RED: **9 failed / 50 passed**. Examples: v2 service/action `expected 'invalid_input' to be 'ok'`; Trainer null `expected 'not_permitted' to be 'ok'`; custom preservation/default constructor `expected undefined to deeply equal ...`; null `expected undefined to be null`. The later six role/failure-path regressions bring final focused GREEN to **65 passed / 2 files** (33 added tests over the existing 32 action tests).
- Validation: explicit count includes upfront and equals row count; positive exact upfront matches row 1; existing contiguous sequence/positive bounded amount/increasing offset checks remain. Optional known-price validation reuses the existing exact BigInt total check. Default constructor requires a chosen upfront, derives the exact positive residual, uses offsets 0/30, and yields one row for full-price upfront. It reuses `parseMinorUnits` from U1 money helpers, without number money or new dependencies. Legacy parsing, including padded amount strings and nonzero first offsets, is unchanged.
- Timing scope: seq 1 means upfront at approval; later offsets mean Cairo activation calendar date plus issued days, payable through that Cairo day-end (exclusive following Cairo midnight). Constructor tests prove default offsets 0/30, exact residual and absence of invented absolute due dates before activation. Actual activation/calendar/DST/day-end projection is U5/T025-T027 and is **not claimed runtime-verified** here; no activation writer or due-date reader was added.
- Service/action: v2 `paymentTerms` is independently authorized before detailed parsing; Trainer cannot configure even against an accepting mock, but null/full-payment generation remains allowed. Mixed legacy/v2 fields and price/actor overrides fail. Legacy-only input remains supported for the existing UI until T054; its DB RPC contract is unchanged. Custom first/second offsets and amount strings are forwarded unchanged, with hash-only token transport and URL creation/revalidation only after success. Missing wrapper fails safely without fallback to legacy issuance. No issued-row writes/backfill/normalization path was added.
- Wrapper contract coded against: `issue_flexible_registration_link(workspace_id,package_version_id,token_hash,upfront_amount_minor,total_payment_count,installments)`, from [surface contract lines 80–84](../../specs/012-registration-approval/contracts/registration-approval-surface.md#flexible-registration-link-creation-f12-owned-extension) and [plan U1F](../../specs/012-registration-approval/plan.md#flexible-f10-link-creation-owned-by-f12). PostgREST args use decimal strings for upfront/row amounts, integer count/seq/offsets, snake-case row fields `seq,amount_minor,due_offset_days`, and the existing UUID result. Null/full payment uses unchanged `issue_registration_link` with `installments:null`. The flexible wrapper **does not exist in the DB yet**: mocks verify the caller contract only. Authoritative version price/current-version checks, transactional delegation/reauthorization, deferred total/audit rollback and historical DB fingerprints remain T050/T051 on B.
- Q-M19 correspondence mutation: temporarily removed count/row and upfront/row-one comparisons in `parsePaymentTerms`. Focused command with `-t 'count includes upfront|requires explicit positive canonical upfront|v2 rejects incoherent terms'` produced **4 failed / 2 passed / 59 skipped**. RED lines: `registration-links-flexible.test.ts:27` and `:42`, `expected { upfrontAmountMinor: ... } to be undefined`; `registration-links-actions.test.ts:119`, `expected { status: 'ok', ... } to deeply equal { status: 'invalid_input' }` (two cases). Restored the original source in `finally`.
- Q-M19 residual mutation: changed `price - upfront` to `price - upfront + 1n`. `npx vitest run tests/unit/registration-links-flexible.test.ts -t 'constructs chosen upfront'` produced **1 failed / 14 skipped**, at `registration-links-flexible.test.ts:64`: expected remainder `799`, received `800`. Restored in `finally`.
- Q-M20 DB-free transport mutation: forced every seq-2 transported offset to 30. `npx vitest run tests/unit/registration-links-actions.test.ts -t 'v2 service/action uses authenticated flexible wrapper'` produced **2 failed / 48 skipped**, at `registration-links-actions.test.ts:49`: expected `due_offset_days:17`, received `30`. Restored in `finally`; focused suite then passed **65/65**. Historical DB fingerprints and activated due projection remain later B/U5 evidence, not a claim from mocks.
- Gates on the pushable capability-baseline state: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (**62 files / 1,418 tests**), and `git diff --check` passed. Initial typecheck identified two unchecked array accesses; both were corrected and the check rerun successfully. No gate was waived.
- Sales-state rehearsal: applied original local Sales commit `faf21f3` with `git cherry-pick --no-commit`, ran the same five gates successfully (**63 files / 1,419 tests**), then restored only its four paths before preparing this pushable commit. After committing U1F, rerun gates on that exact commit, cherry-pick `faf21f3` as the final local-only tip and rerun all five gates; push only the U1F parent SHA. Final SHA/state and exact-commit gate results are reported with the delivery, so this evidence does not invent a self-referential commit SHA.
- Policy: no new split percentage, business count maximum, currency, normalization or policy decision was introduced. Independent U10 review and later DB/UI/CI evidence remain outstanding; this unit is not acceptance of the whole feature.

## Session 12 lane 1 - T001, U1 completion and U2

### Stack and merge authority

The session-12 architect/user instruction substitutes **Stack A for every B-only
instruction in the historical F12 artifacts**. This run uses project `lifter`,
API `http://127.0.0.1:54321`, DB `127.0.0.1:54322`, default harness selection,
and no `LIFTER_SUPABASE_STACK`. Stack B, its containers and ports 25420-25429
were not operated. This is the explicit A-for-B substitution; it does not claim
that the B selector infrastructure was integrated or tested.

Start `05f219c6064c63e3baf126999bcf2246290d5ce8`; fetched feature remote
`89fe2a86e302df0ce585213071cdd26a39884077`; fetched main
`a8c7ae569e1ae1380740230b90817679b22d465b`. Created `s12-sales-backup`, reset
the current feature branch to its remote, and merged main without conflicts.
Merge `ea5e872816244579285f7fefc59834c2ea57d399` was pushed after `npm ci`,
typecheck, lint, format and **66 unit files / 1,436 tests** passed. Then
`git cherry-pick 05f219c` produced local `59f206b`; no standalone Sales-denial
push was made. Its final delivery includes U2 SQL parity.

F11 PR #14 head `12036e26fb5e23da22af4ddf0e8d33de800779a2` is an ancestor
of main (git exit 0), merge `1f4d2359bbfcef605e371e29b81a59b2a48d8ed4`.
Grep confirms the latest complete audit body is still
`20261031122000_client_accounts_signup.sql`; no later redefinition precedes
this migration. The last main migration is
`20261031130000_purge_scheduling_pg_cron.sql`; the only new file,
`20261101120000_registration_approval_model.sql`, sorts after it. No committed
migration was edited.

### Tests first and observed failures

- U1/T006: `node node_modules/vitest/vitest.mjs run tests/unit/registration-approval-validation.test.ts tests/unit/registration-approval-capabilities.test.ts`
  produced **1 failed / 38 passed**. At validation test line 55, `0000-01-01`
  returned an approval object instead of null. T007 adds the finite positive-year
  check; the same command then passed **39/39**. Existing safe results and the
  cherry-picked Sales denial are retained, without duplicate implementations.
  Prior U1 RED and Sales restoration evidence remains above.
- U2/T008-T010: after privately loading ignored `.env.local` and capturing local
  CLI status in-process, `node tmp/run-integration.mjs tests/integration/registration-approval-schema.test.ts tests/integration/registration-approval-integrity.test.ts tests/integration/registration-approval-audit.test.ts tests/integration/matrix-parity.test.ts`
  produced **42 failed / 278 passed**, four files. T008 forced-RLS assertions
  received no catalog rows; exact private function inventory was `[]` instead of
  twelve signatures. T009 reported missing `app_private.registration_operations`
  and `app_private.f12_commission_minor(bigint,integer)` rather than satisfying
  graph/commission assertions. T010 audit body lacked `payment.collection_corrected`,
  UPDATE audit trigger inventory was incomplete, and SQL Sales approval was
  `true` against TS `false` at both direct role parity and salesA/wsA scope parity.
- The first invocation with only `.env.local` stopped at the harness environment
  precondition (no tests); it is not RED evidence. The scratch runner captures
  status without printing keys, validates exact A loopback endpoints, adds the
  API/DB test environment, and invokes Vitest or `npm run test:integration`.
- Reset used `npx --yes supabase@2.122.0 db reset`, never linked/cloud. Every reset
  was followed by `node tests/integration/client-accounts-provision.mjs`. The first
  provision attempt rejected the copied env because it lacked local endpoint
  entries. Added only the known A endpoint entries in ignored `.env.local`,
  reran provisioning, and observed `Local Vault provisioned; two matching
server-only env copies saved.` Subsequent resets/provisioning completed.
- The first implementation run caught exact numeric division rounding at the
  maximum bigint. Replaced rounded numeric `/` with exact `div()`; SQL now agrees
  with BigInt at 0/17/5000/10000 basis points, ties and bigint bounds. Other first
  run failures exposed fixture masking (pending-trigger DDL, missing temporary
  schema usage), line-ending comparison and stale catalog expectations. These
  were corrected; no guard requirement was waived.
- Scoped GREEN before the final additional integrity/role vectors:
  `node tmp/run-integration.mjs tests/integration/registration-approval-schema.test.ts tests/integration/registration-approval-integrity.test.ts tests/integration/registration-approval-audit.test.ts tests/integration/matrix-parity.test.ts tests/integration/rls-catalog.test.ts`
  passed **5 files / 353 tests**. The expanded integrity file then passed **29/29**,
  including existing same-workspace wrong parents, initial uniqueness, immutable
  identity, and valid exact copying of first/second issued offsets 2/12.

### Model and security inventory (T011)

Seven tables: `public.subscriptions`, `public.subscription_installments`,
`public.payment_events`, `app_private.registration_decisions`,
`app_private.registration_operations`, `app_private.registration_approval_events`,
`public.subscription_activations`. All are postgres-owned, ENABLE/FORCE RLS,
zero policies (default deny), zero base privileges for PUBLIC/anon/authenticated/
service_role. Rolled-back SELECT/schema grants test populated rows with every
fixture identity, including foreign, revoked, no-profile, client and anon.

All tables reject UPDATE, DELETE and TRUNCATE through enabled guards. Tenant FKs
include workspace plus subscription/obligation/client correspondence, RESTRICT
and deferred receipt cycles. Initial uniqueness is a partial index. Independent
unique ledger indexes enforce root, revision, predecessor successor and original
reversal uniqueness. Deferred checks enforce the initial decision/purchase graph,
issued snapshot/sequence/exact wide sum, stream alternation/contiguous revision,
full amount/currency/commission, exact-original reversal and operation binding.
Current actors and decision transaction identity are checked independently of
caller GUC claims. Client UPDATE can change only approval_state with a matching
current-transaction authorized decision; F11 INSERT/identity/consumption and
DELETE/TRUNCATE behavior remains.

Private function inventory (all SECURITY DEFINER, postgres owner,
`SET search_path=''`, no dynamic SQL, no EXECUTE for PUBLIC/anon/authenticated/
service_role):

- `f12_commission_minor(bigint,integer)`
- `f12_actor_allowed(uuid,text,boolean)`
- `f12_guard_subscription()` / `f12_guard_installment()`
- `f12_validate_subscription(uuid,uuid)` / `f12_check_subscription()`
- `f12_validate_payment(uuid,uuid)` / `f12_check_payment()` / `f12_guard_payment()`
- `f12_guard_decision()` / `f12_guard_client_transition()` / `f12_check_decision()`

`role_has_capability(staff_role,text)` is replaced only to move
approve_registration into PO/WO. It is SECURITY DEFINER, postgres-owned,
empty search_path; all execution is revoked, then authenticated alone receives
EXECUTE, preserving its existing policy-helper API. Sales payment remains.
`audit_row_change()` has the same hardened definer attributes and no API EXECUTE.
Existing invoker immutable/delete guards retain their existing attributes.
No public U3+ financial operation, reader, activation writer or consumer is added.

### Audit old - new body diff

The T010 test compares the complete installed body to the latest F11 source after
removing only the marked F12 addition and normalizing CRLF/LF. Every legacy
statement, including signup and consumption, is preserved. No old body line is
removed. New payload keys are explicit IDs/states/controlled reason, exact money
text, currency, sequence/revision and dates; no new PII, secret or commission.

```diff
--- F11 20261031122000 audit body
+++ F12 20261101120000 audit body
@@ -87,4 +87,24 @@
     else return new;
     end if;
+  -- F12 extension begin
+  elsif tg_table_schema = 'public' and tg_table_name = 'clients' and tg_op = 'UPDATE' then
+    event_target := new.id;
+    event_workspace := new.workspace_id;
+    select case d.kind when 'approve' then 'client.approved' when 'reject' then 'client.rejected' when 'reconsider' then 'client.reconsidered' end,
+      jsonb_strip_nulls(jsonb_build_object('decision_id',d.id,'client_id',new.id,'from_state',old.approval_state,'to_state',new.approval_state,'reason_code',d.rejection_reason_code))
+      into event_action,event_details
+      from app_private.registration_decisions d where d.workspace_id=new.workspace_id and d.client_id=new.id
+        and d.transaction_id=pg_current_xact_id() and d.actor_user_id=auth.uid() and d.from_state=old.approval_state and d.to_state=new.approval_state;
+    if not found then raise exception 'invalid_client_transition' using errcode='23514'; end if;
+  elsif tg_table_schema = 'public' and tg_table_name = 'payment_events' then
+    if tg_op <> 'INSERT' then return new; end if;
+    event_action := case new.kind when 'collection' then 'payment.collected' when 'correction_reversal' then 'payment.collection_corrected' end;
+    event_target := new.id;
+    event_workspace := new.workspace_id;
+    event_details := jsonb_build_object('client_id',(select s.client_id from public.subscriptions s where s.workspace_id=new.workspace_id and s.id=new.subscription_id),
+      'subscription_id',new.subscription_id,'obligation_id',new.obligation_id,'event_id',new.id,
+      'installment_seq',new.installment_seq,'revision',new.revision,'amount_minor',new.amount_minor::text,
+      'currency',new.currency,'collected_on',new.collected_on,'effective_on',new.effective_on,'recorded_at',new.recorded_at);
+  -- F12 extension end
   -- U3 client addition begin
   elsif tg_table_schema = 'public' and tg_table_name = 'clients' then
```

### Disposable mutation evidence

Each command is `node tmp/u2-mutations.mjs <ID>`. The ignored scratch driver
changes only the disposable A catalog, runs the indicated repository test source,
restores catalog in `finally`, then runs the identical detector GREEN. No mutant
or scratch driver is staged. Filtered tests are not claimed as passing.

| ID    | Mutant / detector                                                                                                    | Observed RED assertion                                                        | Restored GREEN                                |
| ----- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| Q-M03 | Remove payment/obligation composite FK; schema `-t 'composite tenant'`                                               | schema line 120: expected length 4, got 3                                     | 1 passed / 9 filtered                         |
| Q-M04 | NO FORCE RLS on subscriptions; schema `-t 'forced RLS.*public.subscriptions'`                                        | schema line 23: relforcerowsecurity false vs true                             | 1 passed / 9 filtered                         |
| Q-M05 | Drop f12_payment_root; integrity `-t 'unique root/revision'`                                                         | integrity line 115: expected index names to include f12_payment_root          | 1 passed / 28 filtered                        |
| Q-M06 | Disable subscriptions UPDATE guard; integrity `-t 'privileged UPDATE/DELETE/TRUNCATE guard: public.subscriptions'`   | integrity line 168: promise resolved undefined instead of rejecting           | 1 passed / 24 filtered (before added vectors) |
| Q-M12 | Disable both subscription and installment deferred total triggers; integrity `-t 'deferred schedule correspondence'` | integrity line 94: malformed 1199-vs-1200 total resolved instead of rejecting | 1 passed / 28 filtered                        |
| Q-M13 | Install the unextended F11 audit body; audit `-t 'complete latest F11'`                                              | audit line 30: missing payment.collection_corrected                           | 1 passed / 3 filtered                         |

Q-M06 baseline also exercises DELETE/TRUNCATE independently of incoming-FK
masking for postgres and temporary-granted service_role on every new table.
Q-M12 baseline also exercises malformed reversal commission with the immediate
payment actor guard disabled, proving the deferred chain detector independently.
A subsequent full reset/provision discarded all disposable mutation state.

### Scope and outstanding work

T001 and the requested U1/U2 slice are the only session-12 completion claims.
T002/T003 remain unticked infrastructure/planning records; the explicit A override
unblocks this execution without claiming B readiness. T050/T051 (flexible wrapper
SQL), T053/T054 (editor UI), U3-U10 and public RPC/read/UI/concurrency/replay,
P2 consumer/P4 activation writer, production rollout and independent acceptance
remain pending. Existing U1 money and DB-free flexible terms tasks stay checked.
No new PO policy was invented. No F11 product-behavior conflict was found; stale
unmerged-F11/B-only plan assumptions are superseded explicitly above. CI billing
remains external; no CI repair, PR creation, main merge or deployment was attempted.

### Installed catalog capture

`node tmp/u2-inventory.mjs` observed seven postgres-owned forced-RLS tables,
all with only `{postgres=arwdDxtm/postgres}` ACLs. Constraint counts on those
seven tables: **32 CHECK, 29 FK, 7 primary key, 19 UNIQUE, 4 constraint triggers**;
five additional partial/ledger unique indexes enforce initial/root/revision/
successor/reversal protection. Enabled non-internal trigger counts:
approval_events 3, decisions 5, operations 3, payment_events 6, activations 3,
installments 5, subscriptions 5. Every `f12_*` helper and audit emitter showed
SECURITY DEFINER, postgres owner, `search_path=""`, ACL `{postgres=X/postgres}`.
The role matrix helper alone additionally grants authenticated EXECUTE. Installed
Sales capability query returned `sales_approval:false, sales_payment:true`.

Full-suite first attempt: **921 passed / 1 failed / 1 skipped, 30 files**.
The sole failure was F11's legacy-body assertion, which removes the two F11
additions before comparing the F10 source. Updated that assertion only to also
remove the marked F12 additive block. The original exact F10 body comparison
and every F11 runtime assertion remain. The other shared-test adaptation is the
exact rls-catalog inventory: new emitters/helpers/immutable guards and removal
of the deliberately replaced clients signup_no_update entry. These are test
inventory changes, with no F11 source behavior overwritten.

### Final session-12 gates (T012)

Following the final `npx --yes supabase@2.122.0 db reset` and immediate
`node tests/integration/client-accounts-provision.mjs`, ran
`node tmp/full-with-timing.mjs`. This ignored wrapper privately loads local
status/env and invokes **`npm run test:integration`** with
`SC011_TIMING_RUN=true`. Observed **30 files / 923 tests passed, zero failed,
zero skipped**, duration 223.86s. This includes the F11 timing test, every
F11/F9/F10/matrix/catalog/audit/recovery integration regression and all U2 tests.

The timing harness automatically appends generated F11 evidence. The scratch
wrapper verified the original file prefix byte-for-byte, retained only its new
suffix under ignored `tmp/f11-timing-generated.md`, and restored the original
F11 evidence file; no generated F11 report is staged. Its observed summary:

```json
{
  "run": "2c6ef3d8-a693-47fa-bc7a-7b9f35274e48",
  "verdict": "PASS",
  "n": [200, 200],
  "p": 0.8291407889969358,
  "medians": [97.51209999999628, 98.23845000000074],
  "medianDifference": 0.7263500000044587,
  "before": {
    "auth_users": 605,
    "clients": 22,
    "identities": 601
  },
  "after": {
    "auth_users": 605,
    "clients": 22,
    "identities": 601
  }
}
```

| Gate                                                   | Observed result                                     |
| ------------------------------------------------------ | --------------------------------------------------- |
| `npm ci` before merge push                             | Exit 0, 669 packages added                          |
| `npm run typecheck`                                    | Exit 0                                              |
| `npm run lint`                                         | Exit 0, max warnings 0                              |
| `npm run format:check`                                 | All matched files use Prettier style                |
| `npm test`                                             | 67 files / 1,449 tests passed                       |
| `npm run test:integration`, local env + timing enabled | 30 files / 923 tests passed; no skipped/todo/failed |
| `git diff --check`                                     | Exit 0                                              |

Checked only T001, T006, T007, T008, T009, T010, T011 and T012 in this session.
No pending F12 public-operation/UI/e2e assertion is represented as a passing U2
check. No U3+ RPC was written. Production, P2/P4, U1F wrapper/UI and independent
acceptance remain pending as listed above. Docker inspection shows the Stack A
DB, Auth and API gateway running/healthy on ports 54322/54321; leave A running.
No Stack B operation was performed. Runtime-specific model/effort metadata is
not exposed by the available tools, so the requested Sol Medium routing cannot
be independently verified from this session.

## U3 - approve, reject and reconsider (T013-T017)

### Starting state and scope

Verified clean HEAD and origin at
`50cc77e8a0090f3baa716c3e4656b216db0983dd` after `git fetch origin`.
A continuation after a usage interruption began with `git status --short` and
`git log -3 --oneline`: the same U2 head plus four untracked mid-edit U3 test/helper
files, no U3 commit and no migration. Reviewed and retained those files; fixed
an insert fixture that incorrectly required returned data, then resumed the
original brief. No reset of source, force push, other-worktree git or Stack B
operation occurred.

Stack rules remain the explicit session-12 **A-for-B substitution**: project
`lifter`, API 54321 / DB 54322, default selector, no LIFTER_SUPABASE_STACK.
`supabase@2.122.0 start` used only the prescribed A exclusion list; CLI output
was captured privately. Every local `db reset` was followed immediately by
`node tests/integration/client-accounts-provision.mjs`. Ignored `.env.local`
was loaded privately; keys, scratch drivers and generated evidence are untracked.

No U4 later collection/correction, U5 reader, app/UI, activation writer or P2
consumer is implemented. Architect carry-forward is in research.md: retain the
narrow clients UPDATE guard; F13 closure/pseudonymization needs a later forward
amendment. Use actual role_has_capability/has_workspace_access helpers, and
explicitly require an existing workspace even for PO.

### Tests first: observed RED and GREEN

Before the migration, ran:

```text
node tmp/run-integration.mjs tests/integration/registration-approval-operations.test.ts tests/integration/registration-approval-decisions.test.ts tests/integration/registration-approval-replay.test.ts
```

Observed **3 files / 45 failed**. T013 success expected `ok`, received `rpc_error`;
SQL rollback probes reported missing `public.registration_approve(jsonb)`.
T014 PO/WO rejection expected `ok`, received `rpc_error`; role/shape assertions
received rpc_error instead of not_permitted/invalid_input. T015 concurrent results
were rpc_error/rpc_error instead of ok/stale_state or key_conflict/ok; function
catalog entries were undefined instead of hardened definitions. After correcting
the fixture's missing `.select().single()`, replay-only RED still had **10 failed**,
including the intended `rpc_error` versus `ok` and missing-function assertions.
The helper setup failure is not counted as policy RED.

Fixtures issue real F10 links, obtain real HMAC-attested F11 admission over
anonymous PostgREST, and call the installed real signup RPC. Auth identities,
claims, consumption and pending clients commit before approval tests. No mocked
financial backend or privileged financial writer substitutes for public RPCs;
SQL role/claim seams are limited to disposable fault and blocking probes.

First implementation run: **17 failed / 28 passed**. A rolled-back diagnostic
rethrow identified SQLSTATE 23514 `immutable_installment_schedule`: U2 compared
subscription xmin to the top XID, but the operation's exception block inserts
within a subtransaction. Added the forward-only guard compatibility fix below,
retaining all committed model constraints. Also corrected JSON double-encoding
in the SQL-only helper. A subsequent scoped run had **123 passed / 2 failed**:
one fixture reached F10's unchanged 20-link actor limit, and the inventory expected
the timestamptz alias rather than pg_proc's canonical timestamp-with-time-zone
text. Used a fresh synthetic context and corrected the type spelling; no policy
or limiter was changed.

Then ran:

```text
node tmp/run-integration.mjs tests/integration/registration-approval-operations.test.ts tests/integration/registration-approval-decisions.test.ts tests/integration/registration-approval-replay.test.ts tests/integration/registration-approval-audit.test.ts tests/integration/registration-approval-schema.test.ts tests/integration/registration-approval-integrity.test.ts tests/integration/rls-catalog.test.ts
```

Observed **7 files / 125 passed**. Includes exact full/scheduled/high-bigint
approval; raw offsets 2/17/44; committed expired/consumed/disabled/superseded binding;
initial uniqueness and approve/reject races; generic audit/deferred rollback with
zero partial graph; single rejection code/free-text denial; PO-only reconsider;
identity/link/Auth/claims/recovery fingerprints unchanged; existing/nonexistent
PO workspace parity for every U3 RPC; exact safe replay, intent/actor/target binding;
cross-target same-key race; current role/membership revocation while blocked on
the target; grants/owner/search_path; audit/fact cardinality, failed/stale/denied/
replayed absence and owner/foreign audit RLS. No activation fact is written.

### Migration, grants and transaction inventory

Only new migration:
`supabase/migrations/20261101121000_registration_approval_operations.sql`, sorting
after committed U2 `20261101120000`. No historical migration is edited; no table,
RLS policy or base-table grant is added or widened.

All functions below are postgres-owned SECURITY DEFINER with `search_path=''`
and schema-qualified application references, no dynamic SQL. Explicitly revoke
EXECUTE from PUBLIC/anon/authenticated/service_role before narrow grants.

| Function                                                               | Final EXECUTE beyond postgres |
| ---------------------------------------------------------------------- | ----------------------------- |
| public.registration_approve(jsonb)                                     | authenticated only            |
| public.registration_reject(jsonb)                                      | authenticated only            |
| public.registration_reconsider(jsonb)                                  | authenticated only            |
| app_private.f12_u3_can_decide(uuid,boolean)                            | none                          |
| app_private.f12_u3_lock_authorization(uuid,boolean)                    | none                          |
| app_private.f12_u3_canonical(text,jsonb)                               | none                          |
| app_private.f12_u3_purchase(uuid,uuid,uuid,uuid,text,date,timestamptz) | none                          |
| app_private.f12_u3_operation(text,jsonb)                               | none                          |
| app_private.f12_guard_installment() - forward replacement              | none                          |

`node tmp/u3-inventory.mjs` confirmed these exact owner/definer/settings/ACL
attributes, `audit_body_unchanged_from_U2:true`, and `U4_RPCs:[]`.
Existing U2 catalog inventory now includes the five new sealed helpers and
leaves U4 RPC absence asserted; the public U3 grants are checked separately.

Authorization precedence: existing workspace plus current signed PO/WO role,
role_has_capability and has_workspace_access before target/receipt lookup;
PO-only reconsider is explicit. Minimal UUID parsing precedes authorization;
detailed input/canonical parsing follows it. Target absence/foreign scope returns
the identical not_permitted union. No stale/key/receipt disclosure precedes
permission. Unknown keys, numeric/noncanonical/overflow money, invalid dates,
method/reference/actor/time overrides, false fresh confirmation and wrong first
amount/currency/sequence fail without writes. Historical finite dates remain
allowed; future Cairo dates are checked using fresh clock time after waits.

Lock order: **client -> subscription(s) -> obligations by sequence -> ledger by
obligation/revision -> current staff profile -> active membership -> actor/key**.
The actor and membership rows are re-read with SHARE locks after all target waits
and held until commit. A transaction-scoped advisory lock on the fixed namespace
`lifter.f12.operation:<actor UUID>:<request UUID>` serializes cross-target key reuse
after target locks; hash collisions only add serialization. Recheck authorization
again after that possible wait, before any immutable receipt lookup. Future U4
writers must preserve the same target order and actor/key namespace.

Canonical v1 hashing uses a fixed ordered typed JSON array containing operation,
normalized workspace/client, expected state/sequence/revision, amount text,
currency/date/confirmation/reason and explicit null future-operation fields.
The stored actor/key namespace binds actor independently; UUID spelling normalizes.
Exact authorized replay returns the stored complete result unchanged; changed
intent is key_conflict. Receipt has only the contract's fourteen fields, never
PII, commission/rate, request arguments, token, secret or raw provider diagnostics.

One exception subtransaction encloses all new graph/audit/receipt writes. Approval
and reconsideration create the private decision, immutable issued subscription,
exact obligations, first full collection, durable approval fact, guarded client
transition and bound receipt. Rejection creates only decision/state/audit/receipt.
Cyclic relations are deferred during construction, then **SET CONSTRAINTS ALL
IMMEDIATE** is executed before either new success or exact replay returns.
Unexpected failure rolls the entire subtransaction back and returns unavailable.
No approval-time activation, due-date normalization or manual duplicate audit.

### Forward guard and audit preservation

The installment guard now accepts the current transaction's guarded immutable
approve/reconsider decision for the same subscription client, signed actor and
matching creator/transaction timestamp. There is no caller GUC or boolean bypass.
The decision insert and deferred graph/snapshot/total checks remain. A separate
fresh-transaction late obligation test still gets `immutable_installment_schedule`.
The client transition guard itself is unchanged and still blocks every other UPDATE.

```diff
--- U2 installment guard
+++ U3 forward replacement
@@ -1,7 +1,12 @@
-create function app_private.f12_guard_installment() returns trigger
+create or replace function app_private.f12_guard_installment() returns trigger
 language plpgsql security definer set search_path='' as $$
 begin
-  if not exists(select 1 from public.subscriptions s where s.workspace_id=new.workspace_id and s.id=new.subscription_id and s.xmin::text=pg_current_xact_id()::xid::text) then
+  if not exists(select 1 from public.subscriptions s
+    join app_private.registration_decisions d on d.workspace_id=s.workspace_id and d.client_id=s.client_id
+    where s.workspace_id=new.workspace_id and s.id=new.subscription_id
+      and d.transaction_id=pg_current_xact_id() and d.actor_user_id=auth.uid()
+      and d.kind in ('approve','reconsider') and d.to_state='approved'
+      and s.created_by=d.actor_user_id and s.created_at=now()) then
     raise exception 'immutable_installment_schedule' using errcode='23514';
   end if;
   return new;
```

Audit body U2 -> U3: **no diff**. U3 contains no audit_row_change definition,
confirmed by source inspection and the installed normalized-body comparison.
The U2 complete F11-body preservation assertion and all existing branch tests
remain. T017 real-RPC assertions prove one signup INSERT audit, one approved/
rejected/reconsidered transition, one first collection, zero duplicate replay
success events, exactly one approval fact, and no PII/commission in new details.

### Disposable mutation evidence

Commands: `node tmp/u3-mutations.mjs <ID>`. The ignored driver captures the installed
function, installs only a disposable catalog mutant, runs the exact detector,
restores in finally, then reruns it GREEN. No mutant or driver is staged.

| ID    | Mutant and detector                                                                                 | Observed RED                                                                                              | Restored GREEN        |
| ----- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------- |
| Q-M10 | Skip receipt canonical-hash comparison; replay `-t 'replay key is bound'`                           | replay line 70: received ok receipt instead of key_conflict                                               | 1 passed / 9 filtered |
| Q-M11 | Make post-wait authorization return true; replay `-t 'revocation during target wait denies replay'` | replay line 194: received ok receipt instead of not_permitted, both role and membership                   | 2 passed / 8 filtered |
| Q-M17 | Omit approval fact insert; audit `-t 'T017 real approval RPC emits'`                                | audit line 134: unavailable instead of ok because forced U2 graph correspondence rejects the missing fact | 1 passed / 5 filtered |

The final local reset/provision discarded all mutation state before the full gate.

### F11 regression-probe contract adaptation

The first full U3 integration gate completed **964 passed / 7 failed, 33 files**,
with timing enabled. All seven failures were existing F11 catalog/Auth/recovery
probes that enumerated every public RPC, supplied null for JSON requests, and
recognized only F11's `invalid` result. They rejected the new F12 `invalid_input`
shape; this was not evidence of protected data or a successful client operation.

Updated only test helpers/catalog probes: for the three named U3 RPCs, supply a
complete valid request against an existing committed workspace/client target and
require **exactly `{status:'not_permitted'}`**, with no receipt/extra field. Both
real recovered JWT HTTP probes and the synthetic signed SQL catalog probe use
this strict denial. Existing F11 function checks and all RLS/identity/recovery
assertions remain. No production F11 source or permission was changed.

Scoped rerun:

```text
node tmp/run-integration.mjs tests/integration/client-accounts-recovery.test.ts tests/integration/client-accounts-catalog.test.ts tests/integration/client-accounts-auth.test.ts tests/integration/registration-approval-audit.test.ts
```

Observed **4 files / 49 passed**. T017 additionally proves that a stored rejection
receipt replays identically after a later reconsideration has approved the client,
without another decision, collection, fact or audit.

A second full run after the probe adaptation observed **970 passed / 1 failed**,
33 files, with timing enabled. The sole failure was the existing F11 recovery
case `WO can reset a pending client password without changing approval or access`
at its unchanged 30,000ms timeout; no assertion detail or SQL error was reported.
Read-only pg_stat_activity inspection returned no active queries or blockers at
inspection time. This run is not claimed GREEN and its timeout is retained here;
no timeout, retry setting, production behavior or assertion was relaxed.

Without any code, assertion or timeout change, reran
`node tmp/run-integration.mjs tests/integration/client-accounts-recovery.test.ts`:
**1 file / 13 passed**, 11.85s. The full gate was then rerun after another local
reset and immediate provisioning; final results follow below.

The next full run observed **970 passed / 1 failed**, with the recovery timeout
not recurring. The sole failure was F11 admission's exact global count assertion:
expected 14 nonces, received 13, while the target credits/attempt/audit checks
passed. Admission and the preceding purge sample different fresh clock instants,
so an unrelated fixture nonce crossed expiry between their snapshots. Isolated
only this rolled-back link-state test by advancing preexisting unrelated nonce/
counter expiries within its probe before taking the baseline. Added the explicit
per-request nonce +1 assertion and retained every exact global count assertion.
The newly inserted nonce/counters use real production expiry; no production
TTL, migration, limits owner, historical guard or assertion was relaxed.

The isolated nonce/counter fixture correction passed
`node tmp/run-integration.mjs tests/integration/client-accounts-admission.test.ts`:
**27/27 tests**, 7.23s. Full regression was restarted after reset/provisioning,
without a production code, TTL, rate-limit or timeout change.

### Final U3 gates and task exit

After the final local reset and immediate provisioning,
`node tmp/full-with-timing.mjs` invoked **npm run test:integration** with privately
loaded Stack A env and `SC011_TIMING_RUN=true`. Observed **33 files / 971 tests
passed**, zero failed/skipped/todo. The earlier unchanged F11 timeout did not
reproduce in this full run. No retry setting or timeout was changed.

Timing summary (the wrapper verified/restored the original F11 evidence prefix
and retained only its generated suffix under ignored tmp):

```json
{
  "run": "3dae7cfc-fa94-4bbc-bc7d-a4e15ae6f634",
  "verdict": "PASS",
  "n": [200, 200],
  "p": 0.8460348756511494,
  "medians": [94.7371500000013, 94.41780000000108],
  "medianDifference": 0.3193500000002132,
  "before": {
    "auth_users": 12,
    "clients": 2,
    "identities": 12
  },
  "after": {
    "auth_users": 12,
    "clients": 2,
    "identities": 12
  }
}
```

| Gate                                         | Final observed result                       |
| -------------------------------------------- | ------------------------------------------- |
| npm run typecheck                            | Exit 0                                      |
| npm run lint                                 | Exit 0, max warnings 0                      |
| npm run format:check                         | All matched files use Prettier style        |
| npm test                                     | 67 files / 1,449 passed                     |
| npm run test:integration, timing enabled     | 33 files / 971 passed; no failures or skips |
| git diff --check and staged whitespace check | Exit 0                                      |

Only T013, T014, T015, T016 and T017 are newly checked. Prior U2 acceptance is
retained; U3 independent architect acceptance remains external. T018-T048,
T002/T003 and pending U1F SQL/UI tasks remain unticked. No P2/P4/production release
claim, PR, main merge, force push or CI/billing repair. The one observed full-run
F11 timeout and the forward subtransaction guard fix are explicitly retained for
review. Runtime-specific model/effort metadata is not exposed, so Sol Medium
routing is not independently verified. Stack A remains running; Stack B was not
operated. All scratch/mutation/env files remain outside the staged paths.
