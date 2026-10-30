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

## Session 13 U4 and bidirectional capability parity

Stack A was reset using the `lifter` project and provisioned before integration runs. Stack B was not touched. The task text for T022 says Stack B; the assigned-lane brief overrides it and this gate ran on Stack A.

### RED, GREEN, and mutations

| Check                                                                                                                                                                           | Observed result                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U4 RED with `20261101122000_payment_operations.sql` temporarily absent from the migration directory and Stack A reset to the 7f2cc19 schema                                     | `registration-approval-payments.test.ts`, `registration-approval-corrections.test.ts`, and `registration-approval-replay.test.ts`: 37 failed / 10 passed. Failures reported missing `collection_correct(jsonb)` / `PGRST202`; no missing-key or provisioning failures remained. Migration restored from a temp backup before GREEN.               |
| U4 GREEN, same three files after migration applied                                                                                                                              | 47 passed / 3 files.                                                                                                                                                                                                                                                                                                                              |
| Capability parity baseline                                                                                                                                                      | `matrix-parity.test.ts`: 369 passed / 1 file.                                                                                                                                                                                                                                                                                                     |
| SQL-only capability mutant `u4_sql_only_probe` added locally to `role_has_capability`                                                                                           | 4 failed / 381 passed: set equality, platform-owner role parity, and both PO workspace parity cases detected the extra grant. Stack A reset to restore the committed SQL function.                                                                                                                                                                |
| TS-only capability mutant `u4_ts_only_probe` added temporarily to `CAPABILITIES`                                                                                                | 5 failed / 380 passed: set equality, immutable definition assertion, platform-owner role parity, and both PO workspace parity cases detected the TS-only grant. Source restored.                                                                                                                                                                  |
| Serialization mutant removed the U4 subscription row lock and U2 payment-trigger subscription lock                                                                              | Runtime wait test still serialized through other database locks. Tightened `T020 U4 shares the client/subscription/obligation/ledger/key lock order` assertion then failed 1 / 1; its earlier broad regex could match a later statement's lock. It now requires `FOR UPDATE` before the same statement's semicolon. Both SQL locks were restored. |
| Exact-value mutant changed the correction amount to one minor unit less                                                                                                         | `T019 correction negates stored original exactly`: 1 failed / 11 skipped; the inexact reversal was rejected as `unavailable`. Restored exact stored amount.                                                                                                                                                                                       |
| PO-only mutant granted `record_refund` to workspace_owner, removed the `po_only` and explicit role checks in the local migration, and disabled the trigger's duplicate PO check | `T019 woA cannot correct`: 1 failed / 11 skipped; workspace_owner received `ok` instead of `not_permitted`. All grant and authorization mutations were restored.                                                                                                                                                                                  |

## Session 13 U5 — safe readers and client self-status (T023–T027)

Stack A only (`lifter`, API 54321 / DB 54322). Stack A was reset and provisioned locally; the ordered migrations ended at `20261101123000_registration_approval_reads.sql`. Stack B was not accessed. No pushed migration (`20261101120000`, `121000`, or `122000`) was edited.

### RED, GREEN and security checks

- RED first: the three new U5 integration files ran before the migration existed: **7 failed / 2 passed / 3 files**. Failures were missing `subscription_payment_status`, `client_self_status`, and related reader signatures/catalog entries.
- Added the forward migration with postgres-owned SECURITY DEFINER readers, `search_path=''`, exact authenticated-only public EXECUTE grants, private helpers with browser EXECUTE revoked, role/capability checks, explicit existing workspace checks, and current membership checks for non-PO staff. Base tables remain forced-RLS with no policies or ordinary grants. No activation writer or P2 consumer was added.
- Staff readers return column-limited JSON projections. Common payment status and approval projections omit commission; `subscription_commission` requires PO/WO. Unauthorized, foreign and nonexistent targets return the same `{status:'not_permitted'}` shape without receipt details. Client self-status accepts no arguments and exposes only the signed client's pending/approved/rejected state. The private client helper uses the indexed `auth_user_id = auth.uid()` association and approved state.
- Activation tests create only transaction-scoped synthetic activation facts and roll them back. Later `due_on` is `NULL` before activation; afterward, the exact stored offset is added to the Cairo activation date. The default 30-day offset and custom 17/53-day offsets cross a Cairo DST transition without fixed-second arithmetic. No P4 writer or functional activation claim is made.
- F11 pending RPC probes now allow only the exact no-argument self-status result for the authenticated client. Staff reader RPCs remain generic `not_permitted`; the exception does not open client tables, staff operations, subscriptions, payments, activation, or Storage.
- U5 focused slice after final reader projection fixes: **7 files / 449 passed** (including `matrix-parity.test.ts`, RLS catalog, and F11 pending catalog/auth readers).

### Mutations

All four temporary Stack A mutants made their named detector RED; each was restored before the final clean reset and full integration run.

| Mutation                                                          | Observed RED                                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Removed reader workspace/membership authorization                 | 1 failed / 5 skipped; `T023 authorization requires an existing target workspace...`, expected false, received true. |
| Granted `authenticated` direct SELECT on `subscriptions`          | 1 failed / 5 skipped; `T023 direct base reads...`, query unexpectedly succeeded.                                    |
| Removed PO/WO-only commission gate                                | 1 failed / 5 skipped; Sales received commission `{status:'ok'}` instead of `not_permitted`.                         |
| Added an authenticated `client_self_status(uuid)` target overload | 1 failed / 2 skipped; catalog asserted exactly one zero-argument status RPC and found the overload.                 |

### Final gates and boundaries

- `npm test`: **67 files / 1,449 passed**.
- Full Stack A `npm run test:integration` after clean reset/provision: **38 files / 1,111 passed / 1 skipped / 0 failed** (Vitest reports 37 passed files and 1 skipped file). `matrix-parity.test.ts` passed in both directions.
- `npm run typecheck`, `npm run lint`, Prettier checks on supported touched TS/Markdown files, and `git diff --check`: passed. Prettier has no SQL parser for the new migration; its syntax was verified by clean migration application and integration tests.
- T023–T027 are checked in `tasks.md`. P2 remains responsible for the later consumer/assignment behavior. P4 remains responsible for the real atomic activation writer; due projections alone do not activate subscriptions.
- Migration-ordering note: T051 plans `20261101124000_flexible_registration_link_terms.sql`, which sorts after the already-pushed `20261101120000` migration and preserves chronological forward-only migration ordering. No T051 file was created or changed here.
- Runtime model routing: this session ran on GPT-6; Luna High/effort selection metadata was not available to this runtime.

### Final gates

- Scoped Stack A gate after restoration: 456 passed / 7 files (schema, payments, corrections, replay, audit, client catalog, capability parity).
- `npm test`: 67 files, 1,449 passed.
- Full Stack A integration run after clean reset/provision: 35 files, 1,098 passed, 1 skipped, 0 failed.
- `npm run typecheck`, `npm run lint`, and `git diff --check`: exit 0. Prettier checks passed for supported touched files; Prettier has no SQL parser for the migration file.
- `tasks.md`: U4 T018–T022 are checked; prior expected checked set T001, T004–T017, T049, T052 was confirmed before this unit. The capability parity test change does not alter role grants.
- Corrections remain PO-only exact-value append-only reversals. No F13 refund cap, refund cardinality, commission-refund behavior, or renewal due-date policy was added.
- Replay returns the stored receipt unchanged, and tests assert equality on replay. A wall-clock month transition was not simulated; the test suite verifies fresh Cairo correction booking and immutable replay receipt behavior.
- Runtime model shown to this session: GPT-6; effort metadata is not exposed here. The requested Luna High routing could not be selected from this runtime.

## Session 13 U6 — DB-free Server Actions and client authorization (T028–T032)

Worktree `LFTR-012b`, branch `012-registration-approval-stage2`, based on stage 1 head `8d54abe97679b69d9f75aaaedb1cfa68faa174d5`. All results below use unit mocks only. No Docker, Supabase CLI, SQL, integration, e2e, or rendered UI route was used. No service-role client/import was added. The action tests use a permissive or failure-configured mocked RPC and do not claim database behavior.

- Tests first RED: `npx vitest run tests/unit/registration-approval-actions.test.ts tests/unit/registration-approval-read.test.ts tests/unit/client-access.test.ts` initially reported **3 failed files / 0 tests** because the service, reader, and client-access modules were not yet implemented. The tests were added before those source modules.
- GREEN focused: after T028–T032 source wiring and the final T032 log cases, the same command passed **3 files / 48 tests**.
- Mutation checks (each mutant was reverted immediately after its detector failed):
  - M1, authorize after RPC: `npx vitest run tests/unit/registration-approval-actions.test.ts -t "scope gates"` reported **9 failed / 10 passed / 14 skipped**; denied roles reached the permissive RPC mock.
  - M2, add `commission_minor` to the safe queue projection: `npx vitest run tests/unit/registration-approval-read.test.ts -t "column-limited projections"` reported **1 failed / 7 skipped** and showed the leaked field.
  - M3, move client memo state to a module-level shared promise: `npx vitest run tests/unit/client-access.test.ts -t "memoizes only inside a reader instance"` reported **1 failed / 5 skipped**; the second request received the first request's pending state.
  - M4, log caller input from the error catch: `npx vitest run tests/unit/registration-approval-actions.test.ts -t "does not log caller input"` reported **1 failed / 32 skipped** and exposed the request object in `console.error`.
- Wired mutation RPCs from the stage 1 migration signatures: `registration_approve(jsonb)`, `registration_reject(jsonb)`, `registration_reconsider(jsonb)`, `installment_collect(jsonb)`, and `collection_correct(jsonb)`. Each action validates an exact allow-listed request, uses `getUser()` and app role/workspace authorization before one RPC on the same signed session client, and returns only allow-listed result fields/statuses. Reconsideration and correction require PO; approval/rejection require PO/WO; collection follows `record_payment`.
- Wired staff readers to the stage 1 reader RPCs with bounded page size and explicit field projections. Ordinary approval/payment results discard commission even if a mock includes it; commission uses a separate PO/WO-gated projection. Client status uses zero-argument `client_self_status()` after signed `getUser()`, with a React request cache and no caller ID, staff helper, shared result map, or Storage permission.
- CSRF coverage rejects mismatched Origin/Host before RPC; the Next Server Action runtime retains its framework Origin/Host enforcement. Shape, uncertain-key retry, generic provider failure, error-log scrubbing, role/scope, commission projection, and isolated-request memoization cases are covered by unit mocks.
- Focused final GREEN: `npx vitest run tests/unit/registration-approval-actions.test.ts tests/unit/registration-approval-read.test.ts tests/unit/client-access.test.ts` passed **3 files / 48 tests**. Full `npm test` passed **70 files / 1,497 tests**; `npm run typecheck`, `npm run lint`, the explicit touched-file `npx prettier --check`, and `git diff --check` passed.
- Tests validate the app wall and projection logic only; DB U5 remains the authority for SQL authorization and row-level behavior. The stage 1 base SHA and PR #18 head were never edited by this unit.
- Runtime model: GPT-6; effort metadata is unavailable in this runtime, so Luna High could not be selected or independently confirmed here.

## Session 13 U7 — T033–T037 (2026-10-30)

### Scope and result

Worktree `LFTR-012b`, branch `012-registration-approval-stage2`. DB-free mock renders only; no Docker, Supabase CLI, integration run, or authenticated U9 screenshot route was used. Staff approval and separate payment list/detail pages, role-gated dashboard links, collection confirmation/history, semantic status badges, and bilingual copy were implemented. T035 remains open for the correction action placement described below.

Commits: T033 RED tests `6b2b224`; T036 messages/parity `53d5669`, `1a32598`; T034 pages `d2991b7`; T035 payment components `487a06f`.

### RED → GREEN and mutations

- T033 tests ran before page/components/feature messages existed: 3 test files failed (2 missing-module suites and message semantics found missing copy keys).
- T036 parity test preceded strings; afterward `npx vitest run tests/unit/registration-approval-messages.test.ts` passed 1 file / 2 tests. AR/EN key and non-empty value parity is asserted.
- T035 correction UI test was extended, then a temporary role-gate mutant produced 1 failed / 6 skipped; restoring the PO gate yielded 1 file / 7 tests passed.
- Mutation M1: rendering commission payloads to Sales produced 1 failed / 5 skipped. Restored PO/WO gate.
- Mutation M2: removing the wrapping checkbox label produced 1 failed / 5 skipped. Restored the label.
- Mutation M3: returning a raw i18n key for badge text produced 1 failed / 5 skipped. Restored translated fallback.
- Each temporary mutant was restored immediately. Final full suite: `npm test` — 73 files passed / 1,512 tests passed.

### Design Gate checklist

| Check                                                    | Result        | Evidence / limit                                                                                                                                                                                        |
| -------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens and workspace brand                               | PASS (source) | Feature CSS uses existing color, spacing and radius variables; semantic status tokens remain separate from brand overrides.                                                                             |
| Typography and mixed direction                           | PASS (source) | Root font preferences are inherited; money, dates, sequence numbers and rejection code use `Bidi`. Arabic shaping was not screenshot-reviewed.                                                          |
| Spacing/layout/components                                | PASS (source) | Logical table layout, existing page container and UI primitives; no new breakpoint, font, token or dependency.                                                                                          |
| Contrast, light/dark and sample brand                    | NOT VERIFIED  | Semantic tokens are used, but no rendered matrix or contrast tool run is claimed.                                                                                                                       |
| Accessibility                                            | PARTIAL       | Labeled date/checkbox inputs, native controls, shared Button/Field/ConfirmDialog/Skeleton/ErrorState and accessible-name assertions. Keyboard walkthrough, screen-reader behavior and axe were not run. |
| Loading/empty/error/success/disabled/pending/interaction | PARTIAL       | Loading/empty/error branches and pending/confirmation/success/failure markup exist; no browser interaction/hover/focus screenshots.                                                                     |
| AR/EN copy                                               | PASS          | Exact key parity and non-empty value test; feature strings are in `lib/i18n/messages/ar.ts` and `en.ts`.                                                                                                |
| Rendered matrix / screenshots                            | NOT RUN       | U7 task defers matrix PASS until U9 authenticated B screenshots. No screenshot files/paths were produced in this unit.                                                                                  |
| Unit tests / size                                        | PASS          | `npm test`: 73 files / 1,512 passed. Web worker 7,165.20 KiB (10.93% / 65,536 KiB); cron 2.85 KiB. Axe was not run.                                                                                     |

Source review found no hard-coded colors, fonts, radii or spacing in the feature stylesheet. Payment controls use native labels/buttons and the shared confirmation dialog. Impeccable detector returned an empty findings array for changed UI targets.

### T035 dependency gap — correction on approval review

Exact gap: `readRegistrationApprovalReview` returns a safe projection without `subscription_id`, `obligation_id`, `revision` or `tail_event_id`. `correctCollectionAction` requires those identifiers and expected revision. This affects `app/(app)/registration-approvals/[clientId]/page.tsx` and `ApprovalReview`. Correction is therefore available only on the separate Payments detail, where U5 returns the required event fields.

Options: (1) extend U5's review reader with a separately authorized, column-limited correction projection; this preserves the approved T035 placement but requires review/change to U5's SQL/read contract. (2) approve moving correction placement to Payments detail; narrower and already implemented, but changes task wording. (3) defer review-page correction to a later approved slice; lowest immediate scope, leaves T035 incomplete. Recommendation: option 1, owned by the U5/DB review lane, then wire the existing PO-only UI action. No reader contract or database work changed here.

### Skill applicability

Conflicts: catalog entries marked `CONFLICT - PO decision` are advisory; `DESIGN.md`, F2 implementation and F12 decisions took precedence over conflicting styling, font, palette or motion suggestions. No alternative design system was generated or persisted.

| Skill                          | Applicability and one-line reason                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apple-design`                 | NOT APPLICABLE — No alternative visual direction is requested; the approved design remains in force.                                           |
| `ui-ux-pro-max`                | APPLIES — lookup-only UX search returned confirmation/loading feedback and visible keyboard focus guidance; no design-system output was saved. |
| `impeccable`                   | APPLIES — existing-surface refinement; context and final detector were run.                                                                    |
| `frontend-design`              | APPLIES — retained the approved LIFTER direction; visual suggestions stayed subordinate to DESIGN.md.                                          |
| `baseline-ui`                  | APPLIES — reused existing Field, Button, ConfirmDialog and State primitives; added no motion or library.                                       |
| `design-dna`                   | NOT APPLICABLE — No reusable system or new dependency is being selected.                                                                       |
| `genjutsu`                     | NOT APPLICABLE — No reusable system or new dependency is being selected.                                                                       |
| `emil-design-eng`              | APPLIES — restraint and existing interaction primitives; no motion or alternative visual language.                                             |
| `animate`                      | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `animate-expo`                 | NOT APPLICABLE — This is a Next.js web app, not a native app.                                                                                  |
| `review-animations`            | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `improve-animations`           | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `find-animation-opportunities` | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `animation-vocabulary`         | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `animation-performance`        | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `prototype`                    | NOT APPLICABLE — No alternative visual direction is requested; the approved design remains in force.                                           |
| `mobile-native`                | NOT APPLICABLE — This is a Next.js web app, not a native app.                                                                                  |
| `pick-ui-library`              | NOT APPLICABLE — No new component or toast library is being selected.                                                                          |
| `ask-sonner`                   | NOT APPLICABLE — No new component or toast library is being selected.                                                                          |
| `write-swift`                  | NOT APPLICABLE — This is a Next.js web app, not a native app.                                                                                  |
| `break-ui`                     | APPLIES — tested denied roles, empty/error states, safe projections and targeted UI mutants in mock renders.                                   |
| `better-ui`                    | APPLIES — retained existing components/tokens and avoided added effects; conflict-marked styling was not authority.                            |
| `better-typography`            | APPLIES — inherited approved fonts and isolated mixed-direction values with Bidi.                                                              |
| `better-colors`                | APPLIES — semantic Design System status tokens only; no palette or rendered contrast claim.                                                    |
| `better-accessibility`         | APPLIES — visible labels, native controls, shared focus/dialog primitives and accessible names reviewed; axe remains pending U9.               |
| `better-layout`                | APPLIES — logical flow and spacing tokens; no new breakpoint token.                                                                            |
| `better-interface`             | APPLIES — consolidated source review across layout, color, copy and accessibility; render evidence deferred.                                   |
| `better-writing`               | APPLIES — authored concise AR/EN labels and states, checked parity and safe errors.                                                            |
| `interface-review`             | APPLIES — reviewed changed screens and direct dashboard consumers.                                                                             |
| `visual-style-presets`         | NOT APPLICABLE — No alternative visual direction is requested; the approved design remains in force.                                           |
| `glass-dark-ui`                | NOT APPLICABLE — The target does not use this skill’s specialized platform or content type.                                                    |
| `progressive-blur`             | NOT APPLICABLE — The target does not use this skill’s specialized platform or content type.                                                    |
| `motion-design`                | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `css-animation`                | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `remotion-motion-graphics`     | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `gsap-core`                    | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `threejs-fundamentals`         | NOT APPLICABLE — No Three.js scene, asset or interaction is in scope.                                                                          |
| `threejs-animation`            | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `threejs-geometry`             | NOT APPLICABLE — No Three.js scene, asset or interaction is in scope.                                                                          |
| `threejs-interaction`          | NOT APPLICABLE — No Three.js scene, asset or interaction is in scope.                                                                          |
| `threejs-lighting`             | NOT APPLICABLE — No Three.js scene, asset or interaction is in scope.                                                                          |
| `threejs-loaders`              | NOT APPLICABLE — No Three.js scene, asset or interaction is in scope.                                                                          |
| `threejs-materials`            | NOT APPLICABLE — No Three.js scene, asset or interaction is in scope.                                                                          |
| `threejs-postprocessing`       | NOT APPLICABLE — No Three.js scene, asset or interaction is in scope.                                                                          |
| `threejs-shaders`              | NOT APPLICABLE — No Three.js scene, asset or interaction is in scope.                                                                          |
| `threejs-textures`             | NOT APPLICABLE — No Three.js scene, asset or interaction is in scope.                                                                          |
| `gsap-frameworks`              | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `gsap-performance`             | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `gsap-plugins`                 | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `gsap-react`                   | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `gsap-scrolltrigger`           | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `gsap-timeline`                | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `gsap-utils`                   | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `lottie`                       | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |
| `remotion-to-hyperframes`      | NOT APPLICABLE — No motion is specified; no animation was added.                                                                               |

### Gates

- `npx prettier --check` on changed UI, i18n, tests and tasks: PASS.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `git diff --check`: PASS.
- `npm run build:edge`: PASS; OpenNext build complete, routes include `/registration-approvals` and `/payments`.
- `npm run size`: PASS; web 7,165.20 KiB / 65,536 KiB, cron 2.85 KiB / 65,536 KiB.
- Runtime identifies GPT-6; effort-selection metadata is unavailable, so Luna High could not be independently verified.

## S14 — U7 T035 continuation (2026-10-30)

Starting feature head was `d56897bb9244b377e13a8c44cbf63753bc93039f`; merged `origin/main` with `--no-ff` as `ee41742`. The protected `012-registration-approval` branch was not checked out. Stack A only was used: project `lifter`, API `127.0.0.1:54321`, DB `127.0.0.1:54322`. Stacks B and C were not accessed.

Architect accepted option 1 for T035. Added one forward-only migration, `supabase/migrations/20261101125000_registration_approval_correction_read.sql`. Its separate authenticated RPC checks `platform_owner`, `approve_registration`, workspace and client association; it returns only `subscription_id` and correctionable rows containing `obligation_id`, `revision`, and `tail_event_id`. The installment sequence is the JSON object key so the page can match those identifiers to the already safe issued schedule without adding a returned data column. WO, Trainer, Sales, clients, unknown targets, and foreign-workspace targets receive `{status: "not_permitted"}`. Existing review RPC remains unchanged.

The workspace membership check in `app/(app)/registration-approvals/[clientId]/page.tsx` now runs before `readRegistrationApprovalReview`, preserving generic `notFound`. The review page reads the new correction projection only for a platform owner and passes the minimal context into the existing PaymentHistory/ConfirmDialog correction control. No new style, token, color, font, dependency, or motion was added. Components continue to use existing semantic status and focus treatments; static UI tests cover PO visibility and the confirmation dialog. Axe and the rendered AR/EN × light/dark × mobile/desktop screenshots remain deferred to U9’s authenticated B gate; no screenshot path or axe result is claimed here.

### Migration order

Sorted migration files at this head (timestamp — file):

- `20261027120000` — `tenancy.sql`
- `20261027130000` — `workspaces_update_columns.sql`
- `20261027140000` — `access_capability_for_po.sql`
- `20261027150000` — `audit_log.sql`
- `20261027150100` — `audited_tables_no_delete.sql`
- `20261027160000` — `jobs.sql`
- `20261027160100` — `audit_jobs.sql`
- `20261028120000` — `auth_recovery_links.sql`
- `20261029120000` — `packages.sql`
- `20261030120000` — `registration_links.sql`
- `20261031120000` — `client_accounts.sql`
- `20261031121000` — `client_accounts_model.sql`
- `20261031122000` — `client_accounts_signup.sql`
- `20261031123000` — `signup_password_parity.sql`
- `20261031123500` — `signup_duplicate_result.sql`
- `20261031123600` — `client_accounts_admission.sql`
- `20261031123700` — `signup_admission_po_decisions.sql`
- `20261031124000` — `client_accounts_recovery.sql`
- `20261031125000` — `client_signup_admission_before_bcrypt.sql`
- `20261031130000` — `purge_scheduling_pg_cron.sql`
- `20261101120000` — `registration_approval_model.sql`
- `20261101121000` — `registration_approval_operations.sql`
- `20261101122000` — `payment_operations.sql`
- `20261101123000` — `registration_approval_reads.sql`
- `20261101125000` — `registration_approval_correction_read.sql` (new)

No `20261101124000_flexible_registration_link_terms.sql` or `20261102120000` F14 migration file exists in this merged tree. The new timestamp is ordered after the reserved T051 timestamp `20261101124000` and before F14’s specified `20261102120000`; no migration already on main was edited.

### RED / GREEN and mutations

- Before implementation, the three focused UI/read suites reported 7 failed / 21 passed: the correction reader/UI was absent and the page ordering assertion was not met.
- Stack A RED after reset from merged-main migrations: read-projection integration reported 2 failed / 6 passed because the new RPC did not exist.
- M1, grant projection to WO: integration assertion failed for `woA` (1 failed / 7 passed). Restored PO-only role check.
- M2, remove workspace predicate: foreign-workspace call returned the other tenant’s subscription (1 failed / 7 passed). Restored the tenant predicate.
- M3, add `amount_minor`: exact projection assertion caught the extra column (1 failed / 7 passed). Removed the field.
- Final focused unit suites: 3 files / 28 tests passed. Registration-approval read integration: 1 file / 8 tests passed.
- Final full unit: `npm test` — 73 files passed, 1,518 passed.
- Final full Stack A integration: 37 files passed, 1 skipped; 1,112 passed, 1 skipped, 0 failed.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build:edge`: PASS. Edge build includes `/registration-approvals/[clientId]` and completed successfully.
- Stack A `supabase db reset` from the checked-out migration chain applied the new migration; `supabase migration up` then reported `applied: []`. No manual DB edits were made. After reset, the approved unmodified `client-accounts-provision.mjs` was run with explicit Stack A endpoint environment; secrets were not printed or committed.
- The existing bidirectional TypeScript↔SQL capability parity suite passed in the full unit/integration gates; the capability matrix itself was unchanged.

### Historical task snapshot (superseded by the S14 continuation below)

The statuses below were recorded before the preserved U8 implementation and the
session-14 Stack A rulings. They are retained as historical context only; use the
current S14 continuation below for present status.

### Remaining open F12 tasks (historical)

- T002 — U0 decision/PA mapping documentation remains a separate plan/spec synchronization task.
- T003 — waiting for the infrastructure owner’s Stack B selector, harness, provisioner, and e2e readiness evidence; Stack B is outside this lane.
- T038 — U8 status-page RED coverage remains unimplemented; next authorized U8 slice.
- T039 — U8 client status UI remains unimplemented; depends on T038.
- T040 — U8 status copy/parity remains unimplemented; depends on T038 and U7 message release.
- T041 — U8 mock/render evidence remains unrecorded; depends on T038–T040 and U9 B proof.
- T042 — U9 real signup/session integration coverage remains open; requires the assigned integration/B lane.
- T043 — U9 e2e, axe, and retained eight-cell screenshot journeys remain open; requires authenticated B session and U8.
- T044 — full Q-M01..Q-M24 U9 mutations remain open; requires disposable B/module fixtures.
- T045 — U9 aggregate gates/finance/isolation/log-scrub review remains open; requires U9 scope and evidence.
- T046 — final traceability reconciliation remains open; depends on U9 evidence.
- T047 — retained artifacts and exact-head CI evidence remain open; requires the later authorized staging/push evidence. No PR was created here.
- T048 — independent U10 architect review remains open; it is not self-approvable.
- T050 — flexible-link RED/history tests remain open; requires Stack B.
- T051 — flexible-link wrapper migration remains open; requires T050 and Stack B; migration timestamp `20261101124000` remains reserved.
- T053 — flexible-link UI RED coverage remains open; requires T050/T051 and Stack B.
- T054 — flexible-link UI implementation remains open; requires T053 and Stack B.

- Runtime identifies GPT-6; effort-selection metadata is unavailable, so Luna High could not be independently verified.

## Session 14 continuation — T035 ambiguity fix and U8 status page (2026-10-30)

### Stack A ownership and migration chain

- Read-only config check: `project_id=lifter`, API `54321`, DB `54322`; filtered local status later confirmed those endpoints. Local DB password classification: **default**. No status/env raw output or password value was emitted.
- RED setup: `npx --yes supabase@2.122.0 db reset --workdir <absolute-worktree> --local --version 20261101125000` exited 0 and applied migrations through immutable `20261101125000_registration_approval_correction_read.sql`. Stack A ownership was checked immediately before the command (`project_id=lifter`, API 54321, DB 54322).
- T035 RED: `npx vitest run --config vitest.integration.config.ts tests/integration/registration-approval-correction-ambiguity.test.ts` yielded 1 failed / 0 passed. The 125000-only function returned `status: "ok"` with arbitrary correction identifiers for two approved subscriptions; the test expected exactly `{status:"unavailable"}`.
- Forward-only GREEN: `npx --yes supabase@2.122.0 migration up --workdir <absolute-worktree> --local` applied only `20261101130000_registration_approval_correction_ambiguity.sql`; the same focused Vitest command yielded 1 passed / 0 failed. The function returns the documented fixed generic ambiguity result without selecting an arbitrary subscription or exposing identifiers. Its probe transaction rolls back the temporary index/trigger changes.
- After that proof, a fresh Stack A `db reset --workdir <absolute-worktree> --local` exited 0 and applied the full migration chain through 130000. Stack A ownership was checked immediately before each Supabase command. No pushed migration (including 124000/125000) was edited.
- New forward migration: `20261101130000_registration_approval_correction_ambiguity.sql`. It follows `20261101125000_registration_approval_correction_read.sql`, is later than the reserved `20261101124000` timestamp, and sorts before F14's `20261102120000` boundary. The existing 20261101125000 migration and migrations on main were not edited.
- Current migration timestamps, in order: `20261027120000`, `20261027130000`, `20261027140000`, `20261027150000`, `20261027150100`, `20261027160000`, `20261027160100`, `20261028120000`, `20261029120000`, `20261030120000`, `20261031120000`, `20261031121000`, `20261031122000`, `20261031123000`, `20261031123500`, `20261031123600`, `20261031123700`, `20261031124000`, `20261031125000`, `20261031130000`, `20261101120000`, `20261101121000`, `20261101122000`, `20261101123000`, `20261101125000`, `20261101130000`.
- The approved, unmodified `node tests/integration/client-accounts-provision.mjs` exited 0 after the fresh reset (`Local Vault provisioned; two matching server-only env copies saved.`). No secret value was emitted by the run.

### RED / GREEN and integration evidence

- T035 uses the fixed ambiguity policy: multiple valid approval event/subscription pairs return exactly `{status:"unavailable"}`; no latest-subscription order is inferred from incomplete history.
- U8 T038 test RED before poller implementation: focused unit failed to resolve the missing `status-polling` module. U8 T040 parity RED before messages: Arabic `registrationApproval.statusPending` was missing. After implementation, focused status/page/message/access tests passed `4 files / 19 tests`.
- Full unit after preserved U8 work: `npm test` — 75 files passed, 1,533 passed / 0 failed.
- Full Stack-A integration after reset/provisioning: `npm run test:integration` finished `39 files / 27 passed / 11 failed / 1 skipped`; `1,114 tests / 991 passed / 81 failed / 42 skipped`. All 81 failures were setup failures reporting `SIGNUP_* env missing; run provisioning`; no assertion failure was observed in those tests. The provisioner succeeded, but does not export the values to the parent process; the current harness reads those values from `process.env`. No file or Vault value was loaded/exported by this run. The full integration gate is therefore blocked, not green.
- Read-only Stack A password classification: `default` (reported without emitting the password or raw status output).
- U9 Playwright attempt: route rendered, but signup returned the generic “Please try again later.” Direct integration-fixture import also failed because it imports Vitest into Playwright CJS. No authenticated session or screenshots were produced; there was no manual database change.
- T042 source review: the operations suite uses real signup and staff RPC clients, but has no Auth sign-in/refresh/session-revocation or Storage assertions. The client-access suite relies on SQL `probe()`/synthetic JWT claims and controlled grants; it is not a real signed-session/PostgREST denial proof. The replay suite tests post-wait role/membership changes, not revocation of an actual session. New real-session coverage remains open because its signup fixture requires `SIGNUP_*` process values, and no allowed in-memory setup path has been established.
- Gates: typecheck PASS; lint PASS; touched-file Prettier PASS; edge build PASS and generated the `/(client)/account/status/page` route in `.next/server/app-paths-manifest.json`; `npm run size` PASS at web `7,215.89 KiB` (`1,484.29 KiB gzip`) and cron `2.85 KiB` (`1.25 KiB gzip`), each below 65,536 KiB.

### U8 implementation and review

`/account/status` now reads only `getClientSelfStatus()` for the authenticated session; the refresh action has no caller-supplied IDs. The page uses the existing login layout, Card, Button, StatusBadge, Skeleton, ErrorState, fonts and semantic tokens. Pending checks wait 15 seconds, cap at 12 automatic attempts, pause while hidden/offline, resume without an immediate request, and share a one-in-flight guard with manual refresh. Approved-transition navigation rechecks the session/status and only permits `/`; direct approved states retain a manual home link. Rejected copy is generic and approved copy says approval is not activation. No P2 form UI or Realtime path was added.

Cross-feature/finance/isolation review notes: the new SQL count is scoped by workspace/client and the composite subscription/client join; ambiguous history returns only `{status:"unavailable"}`. The function retains SECURITY DEFINER, empty search path, postgres ownership, revoked public/anon/service-role execute and authenticated execute grants. The client status path accepts no target IDs, relies on the self-status RPC/session association, does not expose ledger or commission fields, and introduces no cross-request cache. P2 form assignment and P4 activation remain outside the UI.

### Frontend Design Gate

Skill catalog read in full (55 entries). Skill review (APPLIES / NOT APPLICABLE; one-line reason):

| Skill | Status | Reason |
|---|---|---|
| apple-design | NOT APPLICABLE | This is not an Apple-native surface and no motion direction was requested. |
| ui-ux-pro-max | APPLIES ? lookup only | Searched UX guidance for status refresh; no generated design system or persisted output used. |
| impeccable | APPLIES | Loaded incumbent context, craft floor and one post-edit detector pass. |
| frontend-design | APPLIES | Applied production UI guidance; DS overrides its font, palette and motion suggestions. |
| baseline-ui | APPLIES | Reused existing primitives; its Tailwind requirement conflicts with this CSS-module project and was not adopted. |
| design-dna | NOT APPLICABLE | No brand/system extraction or rebrand was requested. |
| genjutsu | NOT APPLICABLE | No canvas or authored motion work is in scope. |
| emil-design-eng | APPLIES | Applied interaction-feedback and restraint guidance to the status controls. |
| animate | NOT APPLICABLE | The status flow specifies no authored animation. |
| animate-expo | NOT APPLICABLE | This is a Next.js web app, not Expo. |
| review-animations | NOT APPLICABLE | No new animation code was added. |
| improve-animations | NOT APPLICABLE | No existing animation was changed. |
| find-animation-opportunities | NOT APPLICABLE | The approved flow does not call for motion. |
| animation-vocabulary | NOT APPLICABLE | No motion direction needed translation. |
| animation-performance | NOT APPLICABLE | No authored motion to optimize. |
| prototype | NOT APPLICABLE | The brief fixes one approved status flow; no alternatives were requested. |
| mobile-native | APPLIES | Reviewed the 390px/touch surface; existing Button meets the project touch token. Physical-device testing remains unavailable. |
| pick-ui-library | NOT APPLICABLE | Existing Design System components cover the surface; no library choice is needed. |
| ask-sonner | NOT APPLICABLE | The flow uses inline status feedback, not toasts. |
| write-swift | NOT APPLICABLE | No Swift/native code is in scope. |
| break-ui | APPLIES | Added tests for offline/hidden, unavailable, budget exhaustion and concurrent refresh cases. |
| better-ui | APPLIES | Reused established page and component patterns. |
| better-typography | APPLIES | Uses root Geist/IBM Plex Sans Arabic font setup and existing hierarchy. |
| better-colors | APPLIES | Uses existing semantic badge and surface tokens only. |
| better-accessibility | APPLIES | Native buttons/links, stable polite status region, alert denial and visible shared focus treatment. |
| better-layout | APPLIES | Reuses the existing narrow login layout and responsive card behavior. |
| better-interface | APPLIES | Reviewed the changed route/component and its callers; full U9 screenshot review remains open. |
| better-writing | APPLIES | Added concise bilingual state copy, with no activation or rejection-reason claims. |
| interface-review | APPLIES | Reviewed the changed UI diff and status flows; axe/rendered evidence remains open. |
| visual-style-presets | NOT APPLICABLE | Presets cannot override the approved LIFTER Design System. |
| glass-dark-ui | NOT APPLICABLE | Glass effects are outside the approved visual language. |
| progressive-blur | NOT APPLICABLE | No blur effect is needed. |
| motion-design | NOT APPLICABLE | No motion is specified. |
| css-animation | NOT APPLICABLE | No authored CSS animation was added. |
| remotion-motion-graphics | NOT APPLICABLE | This is not a video composition. |
| gsap-core | NOT APPLICABLE | No GSAP animation is used. |
| threejs-fundamentals | NOT APPLICABLE | No 3D scene is used. |
| threejs-animation | NOT APPLICABLE | No 3D animation is used. |
| threejs-geometry | NOT APPLICABLE | No 3D geometry is needed. |
| threejs-interaction | NOT APPLICABLE | No 3D interaction is needed. |
| threejs-lighting | NOT APPLICABLE | No 3D lighting is needed. |
| threejs-loaders | NOT APPLICABLE | No 3D assets are loaded. |
| threejs-materials | NOT APPLICABLE | No 3D materials are used. |
| threejs-postprocessing | NOT APPLICABLE | No 3D postprocessing is used. |
| threejs-shaders | NOT APPLICABLE | No shader work is in scope. |
| threejs-textures | NOT APPLICABLE | No 3D textures are used. |
| gsap-frameworks | NOT APPLICABLE | The app uses React and no GSAP or non-React framework. |
| gsap-performance | NOT APPLICABLE | No GSAP code is used. |
| gsap-plugins | NOT APPLICABLE | No GSAP plugins are used. |
| gsap-react | NOT APPLICABLE | No GSAP integration is used. |
| gsap-scrolltrigger | NOT APPLICABLE | No scroll animation is specified. |
| gsap-timeline | NOT APPLICABLE | No animation timeline is specified. |
| gsap-utils | NOT APPLICABLE | No GSAP utilities are used. |
| lottie | NOT APPLICABLE | No Lottie asset or runtime is used. |
| remotion-to-hyperframes | NOT APPLICABLE | No Remotion-to-video port is requested. |

Design authority conflict: frontend-design recommends custom fonts/colors and motion; baseline-ui recommends Tailwind. `DESIGN.md`, existing tokens/components and CSS modules take precedence. No token, dependency, or motion change was made.

Checklist (PASS/FAIL with evidence):
- PASS ? Tokens/brand: no new color, spacing, radius or font values; existing semantic status tokens are retained.
- PASS ? Typography/direction: root Geist and IBM Plex Sans Arabic; page direction follows locale; no mixed-direction values need Bidi.
- PASS ? Layout/components: existing login layout, Card, Button, StatusBadge, Skeleton and ErrorState reused.
- FAIL ? Contrast in rendered light/dark/sample brand colors: not rendered in this run.
- PASS ? Keyboard/focus/touch by code: native Link/Button, shared visible focus, touch-min Button; reduced-motion behavior unchanged because no motion was added.
- FAIL ? Axe and rendered screen-reader verification: not run.
- PASS ? States/copy: pending, approved, rejected, denied, unavailable, loading, disabled/refreshing, exhausted budget and fallback are represented; Arabic/English parity test passes.
- FAIL ? Screenshot matrix {AR-RTL, EN-LTR} ? {light,dark} ? {390px,1440px} for every F12 screen: no screenshots produced. `%TEMP%\lifter-f12-u9\` contains no evidence from this run.
- PASS ? Dependencies/size: no dependency added; `npm run size` passed within the configured limit.

### Earlier remaining-gate snapshot (superseded by S14 addenda below)

At this snapshot, T042 real signup/session coverage, T043 Playwright/axe and the eight-cell screenshot matrix, T044 Q-M01..Q-M24, T045 full gates, T046 traceability review, T047 retained artifacts/CI, and T048 independent review were open. The latest S14 addenda complete the T043 UI matrix and focused journeys; T042 real F11 signup/session coverage, T044 Q-M01..Q-M24, the full integration and broad E2E gates, T046 traceability review, T047 CI evidence, and T048 independent review remain open. T003/T043/T044/T050..T054 run on Stack A under the session-14 ruling.

## Design-skill applicability record end

### S14 UI evidence addendum (latest; supersedes the earlier U9 attempt and rendered-UI FAIL rows above)

- T043 focused Playwright rerun: `npx playwright test tests/e2e/registration-approval-a11y.spec.ts tests/e2e/registration-approval.spec.ts --workers=1` — **4 passed / 0 failed**. Stack A remained the verified `lifter` project (API 54321 / DB 54322); Playwright and Stack A were released after the run.
- Axe ran on 11 rendered states: eight pending-status AR/EN × light/dark × mobile 390/desktop 1440 matrix cells, PO review, payment history/correction, and approved client status. **0 serious and 0 critical violations** in every scan. Rejected status was exercised but not separately axe-scanned.
- Journey coverage: client/trainer staff-dashboard denials; Sales approval denial while payment capability remains; PO approval confirmation uses the first issued installment (400 XTS rather than 1,200 XTS total); client approved status; pre-activation second-installment collection guard; PO correction of the recorded first installment with WO correction unavailable; rejected status and PO reconsideration reflected on the same signed client session after manual refresh. T042 real F11 signup is still separately blocked by the integration harness requiring `SIGNUP_*`; these UI sessions use synthetic local fixture users and do not prove F11 signup. P4 activation/writer is outside scope, so successful collection after activation is not covered.
- The PO review showed 400 XTS and the two installment amounts. The first payment screenshot captured a loading state; the rerun added settled-state waits and the final payment screenshot now shows the loaded history, recorded 400 XTS installment, correction control, and unpaid 800 XTS installment. Visual review of all eight status cells plus review and payment screenshots found no clipping, overflow, contrast, direction, or hierarchy issues. A visible duplicate pending label was found in the live region. An initial attempt used an undefined global class and did not hide it; the final fix imports `buttonStyles.srOnly` from `components/ui/Button.module.css`, preserving announcement semantics without a third visible label. The corrected matrix and staff states were rerun: 4 passed / 0 failed, with 11 axe scans and 0 serious/critical violations; the refreshed 10 PNGs replaced the prior copies in both evidence locations.
- OS-temp screenshots: `%TEMP%\lifter-f12-u9`. Retained evidence: `tests/integration/evidence/f12-u9/` (10 PNGs):
  - `registration-status-ar-light-mobile390.png`
  - `registration-status-ar-light-desktop1440.png`
  - `registration-status-ar-dark-mobile390.png`
  - `registration-status-ar-dark-desktop1440.png`
  - `registration-status-en-light-mobile390.png`
  - `registration-status-en-light-desktop1440.png`
  - `registration-status-en-dark-mobile390.png`
  - `registration-status-en-dark-desktop1440.png`
  - `registration-review-en-light-desktop1440.png`
  - `registration-payment-correction-en-light-desktop1440.png`
- UI verification checklist update: PASS — existing token/component usage, Geist/IBM Plex Sans Arabic, locale direction, responsive layouts, keyboard names/roles and focus, live region, bilingual copy/state handling; axe and screenshot review as above. PARTIAL — contrast with a sample workspace brand override was not separately captured; no tablet viewport was captured. No new dependency, motion, or token was added.
- Focused source checks after the final UI changes: `npx vitest run tests/unit/registration-approval-status-page.test.ts tests/unit/registration-approval-components.test.ts` — 2 files / 17 tests passed; `npx tsc --noEmit` passed. Broad non-DB gates are owned by specs_gates.

### S14 final-source gate rerun

- Final-source non-DB gates passed: `npm run lint`; `npm run typecheck`; `npm test` — 75 files / 1,534 tests passed; `npm run build`; `npm run size`; and `npm run check:secrets`. Final web size: 7,216.38 KiB uncompressed / 1,497.23 KiB upload gzip (1,484.39 KiB worker gzip, within 65,536 KiB); cron worker: 2.85 KiB / 1.25 KiB gzip. Next.js emitted its existing middleware-to-proxy deprecation warning.
- `npm run build:edge` also passed before the final `.srOnly` UI correction; the final-source `npm run build` passed after that correction. The edge build was not rerun on the final correction.
- Final-source T043 focused run: 4 passed / 0 failed; 11 axe scans had 0 serious / 0 critical violations. Ten refreshed screenshots are retained at `%TEMP%\lifter-f12-u9\` and `tests/integration/evidence/f12-u9/` (eight status cells plus review and payment screens; filenames listed above).
- Broad `npm run e2e` first failed during spec collection because the integration harness had no process-local API/DB credentials. It was rerun after a filtered, read-only Stack A status check (`project_id=lifter`, API 54321, DB 54322); only `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, and `DB_URL` were passed to that child process. No `SIGNUP_*` values were supplied, and no raw status/env output or key was printed. Playwright reported 138 total: **80 passed / 39 failed / 8 skipped / 11 did not run**. U9 approval/status cases and signup-dependent client-account/registration-link journeys failed because the signup form fixtures did not initialize; this is not a green broad E2E gate.
- Fresh Stack A full integration after reset/provisioning: `npm run test:integration` — **39 files; 991 passed / 81 failed / 42 skipped**. All 81 failures were setup errors because the child process lacked `SIGNUP_*`; the provisioner does not export values to its parent. No assertion failures were observed in those setup-failing tests. No secret value was read, copied, or emitted. The integration gate remains blocked.
- Stack A DB password classification: `default` (classification only; no password value recorded).
- Remaining verification: resolve the approved non-printing child-process provisioning path for `SIGNUP_*`, rerun full integration and broad E2E, complete T042 real F11 signup/session coverage and T044 Q-M01–Q-M24 mutation checks, then finish T045–T048 review/evidence. No merge/PR is authorized by this record.

### S14 follow-up mutation evidence (DB-free)

- Q-M14 client-status cache mutation: changed `lib/client-access/status.ts` temporarily to use a module-global cached promise across requests instead of the request-scoped reader. Detector: `npx vitest run tests/unit/client-access.test.ts`. RED: 3 failed / 3 passed; approved and rejected status reads returned stale `pending-approval`, and the anonymous read returned the cached pending result instead of `not_permitted`. The original request-scoped implementation was restored immediately. GREEN: 1 file / 6 tests passed.
- Q-M24 payment request-key mutation: extracted the existing operation-and-obligation keyed retry store to `components/registration-approval/payment-request-keys.ts` and added `tests/unit/registration-approval-payment-request-keys.test.ts`. Contract from `quickstart.md`: retries for the same collection/correction and obligation must retain the canonical request key; different actions or obligations get distinct keys. Mutant returned a newly generated key on every call. Detector: `npx vitest run tests/unit/registration-approval-payment-request-keys.test.ts`. RED: 1 failed; the retry for the same collection expected `collection-key` but received the subsequent `correction-key`. The stable keyed map implementation was restored. GREEN: `npx vitest run tests/unit/registration-approval-payment-request-keys.test.ts tests/unit/registration-approval-components.test.ts` passed 2 files / 10 tests; `npx tsc --noEmit` passed.
- Scope: these are DB-free unit mutations. Stack A Q-M cases are not represented as newly completed by this addendum. Existing DB-backed Q-M rows recorded above are historical evidence only; remaining Stack A mutations require the authorized Stack A fixture and a passing `SIGNUP_*` setup. No Stack B/C or `.env*` access was used.

### Final-source non-DB gates at 19c1d1d

- Reverified on HEAD `19c1d1de10749b97ab2cd11b7c3be935ae2ac386`, branch `012-registration-approval-stage2`: `npm run lint`, `npm run typecheck`, `npm test` (**76 files / 1,535 tests passed**), `npm run build`, `npm run size`, and `npm run check:secrets` all passed.
- Size result: web 7,216.38 KiB uncompressed / 1,497.23 KiB upload gzip (1,484.39 KiB worker gzip; 65,536 KiB limit); cron 2.85 KiB / 1.25 KiB gzip. Build emitted the existing Next.js middleware-to-proxy deprecation warning.
- These final-source checks did not run integration or E2E and did not read/load `.env*` files. Earlier integration and broad E2E outcomes remain as recorded above.
