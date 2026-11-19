-- Task: T065 [FR-028, SC-019]. PO decisions S61-PO-2 (Teardown Q1=A, Q2=A, Q3=A).
-- Design and controls: specs/009-packages/reviews/t064b-teardown-design.md (approved by
-- specs/009-packages/reviews/t064b-security-review-r2.md PASS) and conformance matrix
-- specs/009-packages/reviews/t065-conformance.md. OPERATOR CLEANUP SCRIPT, NOT A MIGRATION:
-- it lives outside supabase/migrations, never runs on `db reset` or deploy, and is executed
-- by hand as the database owner (`postgres`) on a named stack after the T064b PASS.
--
-- What it does (all in ONE transaction, all-or-nothing): removes an explicit allow-list of verified synthetic
-- legacy mock packages together with their offers and versions. It touches only the named per-table delete
-- triggers and, for ONE statement, package_offers_guard (Q2=A narrowed). It never weakens FKs, RLS,
-- audit immutability, truncate guards or any guard function body. audit_events is never modified or deleted.
--
-- Usage (operator, psql 14+; --single-transaction is REQUIRED, the script refuses to run otherwise):
--   psql --single-transaction -v ON_ERROR_STOP=1 -d <database> \
--     -v package_ids='<uuid>,<uuid>' \
--     -v workspace_ids='<verified-synthetic workspace uuid>,...' \
--     -v run_id='c5-<yyyymmdd>-<n>' \
--     -v run_utc='YYYY-MM-DDTHH:MM:SSZ' \
--     -v operator_id='<operator identity>' \
--     -v reviewer_id='<independent reviewer identity>' \
--     -v review_ref='<T064b PASS record reference>' \
--     -v script_sha256='<64-hex sha256 of this script file>' \
--     -v preflight_captured_utc='YYYY-MM-DDTHH:MM:SSZ' \
--     -v expected_stack_id='<cluster-unique identifier of the named stack>' \
--     -v stack_id_source='pg_control_system' \
--     -v stack_env='local' \
--     -v po_approval_ref='' \
--     -v backup_restore_ref='' \
--     -v run_record='<one-line JSON of the recorded PASS>' \
--     -f supabase/cleanup/20261121_t065_c5_mock_package_teardown.sql
--   Before execution, independently compute SHA-256 from this exact file and check the hash,
--   review_ref, operator/reviewer, stack identity, allow-list and captured preflight against ONE
--   recorded PASS. Supply the matching run_record as the one-line JSON parameter.
--
-- Parameter rules (enforced fail-closed inside the transaction; A4, A5, A6, D3, G2):
--   run_id:                 ^c5-<yyyymmdd>-<n>$ (<= 40 chars).
--   run_utc:                ISO-8601 UTC YYYY-MM-DDTHH:MM:SSZ.
--   operator_id:            1-80 chars of [A-Za-z0-9._:@/-]; kept in out-of-band run record, NEVER stored in DB.
--   reviewer_id:            1-80 chars of [A-Za-z0-9._:@/-].
--   review_ref:             1-120 chars of [A-Za-z0-9._:/#-], pointing at the T064b PASS record.
--   script_sha256:          64 lowercase hex chars matching sha256sum of this exact script artifact.
--   preflight_captured_utc: ISO-8601 UTC YYYY-MM-DDTHH:MM:SSZ (<= run_utc) when preflight returned deletable=true.
--   stack_id_source:        'pg_control_system' (pg_control_system().system_identifier) or 'lifter.stack_id'
--                           (owner-maintained alter database <db> set lifter.stack_id = '<unique id>');
--                           no silent fallback is permitted (current_database() is 'postgres' everywhere).
--   stack_env:              classification from the independently verified A4 run record; only 'local'
--                           or 'non_local'. It is bound to the same recorded and live stack identity.
--   run_record:             JSON of the recorded A4 PASS; fields, allow-list and captured preflight
--                           output are compared with settings and the locked live preflight below.
--   po_approval_ref:        PO-S<n>-PO-<n>; REQUIRED when stack_env = 'non_local'.
--   backup_restore_ref:     D14-RESTORE-YYYYMMDD-<record id>; REQUIRED when stack_env = 'non_local'.
--
-- Out-of-band run record (A4, A5, A6, C7, D9, D11 — MUST be recorded BEFORE execution):
--   1. UTC run timestamp (`run_utc`) and `run_id`.
--   2. Operator identity (`operator_id`) and independent reviewer identity (`reviewer_id` + `review_ref`).
--   3. Script artifact SHA-256 (`script_sha256` — operator verifies local file hash matches reviewed artifact).
--   4. Stack identity (`expected_stack_id`) and declared mechanism (`stack_id_source`, `stack_env`).
--   5. Captured `app_private.package_c5_preflight(package_ids)` JSON output (`deletable = true`) with
--      `preflight_captured_utc` and independent synthetic-workspace verification for `workspace_ids`.
--   6. Per-table before-counts (`packages`, `package_offers`, `package_versions`, named `audit_events`).
--   7. Re-derived `expected_triggers` inventory from the target stack's current migration state (C7/D11)
--      and recorded timeout parameters (`lock_timeout = 5s`, `statement_timeout = 120s`, D3/D9).
--   8. For `non_local` stacks: explicit PO approval (`po_approval_ref`) and backup + restore test (`backup_restore_ref`).
--
-- A refusal raises SQLSTATE C5001 with message 'c5_refused:<code>', writes nothing (D5 rollback-invariant:
-- all row data and catalog state identical; only audit_events.id identity sequence may advance on late failure)
-- and exits non-zero.
--
-- The lines up to the marker below only copy the psql variables into transaction-local settings; the
-- integration tests set the same settings themselves and execute everything after the marker.
select set_config('c5.package_ids', :'package_ids', true),
       set_config('c5.workspace_ids', :'workspace_ids', true),
       set_config('c5.run_id', :'run_id', true),
       set_config('c5.run_utc', :'run_utc', true),
       set_config('c5.operator_id', :'operator_id', true),
       set_config('c5.reviewer_id', :'reviewer_id', true),
       set_config('c5.review_ref', :'review_ref', true),
       set_config('c5.script_sha256', :'script_sha256', true),
       set_config('c5.preflight_captured_utc', :'preflight_captured_utc', true),
       set_config('c5.expected_stack_id', :'expected_stack_id', true),
       set_config('c5.stack_id_source', :'stack_id_source', true),
       set_config('c5.stack_env', :'stack_env', true),
       set_config('c5.po_approval_ref', :'po_approval_ref', true),
       set_config('c5.backup_restore_ref', :'backup_restore_ref', true),
       set_config('c5.run_record', :'run_record', true);
-- ==== core ====
-- In autocommit mode each statement is its own transaction, so this setting would be gone when the DO
-- block runs; the block then refuses (D1: refuse if not inside one transaction).
-- search_path is pinned (pg_catalog only; temp tables are always referenced as pg_temp.c5_*) and the
-- timeouts are set by statements OUTSIDE the DO block, where they apply to it.
set local search_path = pg_catalog;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
select set_config('c5.in_tx', '1', true);

do $c5$
declare
  v_raw_pkgs text := nullif(pg_catalog.current_setting('c5.package_ids', true), '');
  v_raw_ws text := nullif(pg_catalog.current_setting('c5.workspace_ids', true), '');
  v_pkg_tokens text[];
  v_ws_tokens text[];
  v_tok text;
  v_pkgs uuid[];
  v_ws uuid[];
  v_run text := nullif(pg_catalog.current_setting('c5.run_id', true), '');
  v_run_utc text := nullif(pg_catalog.current_setting('c5.run_utc', true), '');
  v_operator text := nullif(pg_catalog.current_setting('c5.operator_id', true), '');
  v_reviewer text := nullif(pg_catalog.current_setting('c5.reviewer_id', true), '');
  v_review text := nullif(pg_catalog.current_setting('c5.review_ref', true), '');
  v_script_sha text := nullif(pg_catalog.current_setting('c5.script_sha256', true), '');
  v_preflight_utc text := nullif(pg_catalog.current_setting('c5.preflight_captured_utc', true), '');
  v_run_ts timestamptz;
  v_preflight_ts timestamptz;
  v_expected_stack text := nullif(pg_catalog.current_setting('c5.expected_stack_id', true), '');
  v_stack_id_source text := nullif(pg_catalog.current_setting('c5.stack_id_source', true), '');
  v_stack_env text := nullif(pg_catalog.current_setting('c5.stack_env', true), '');
  v_po_approval text := nullif(pg_catalog.current_setting('c5.po_approval_ref', true), '');
  v_backup_restore text := nullif(pg_catalog.current_setting('c5.backup_restore_ref', true), '');
  v_run_record_raw text := nullif(pg_catalog.current_setting('c5.run_record', true), '');
  v_run_record jsonb;
  v_actual_stack text;
  fk_hash_before text;
  fk_hash_after text;
  v_rep jsonb;
  n int;
  m int;
  v_ids uuid[];
  hash_before text;
  hash_after text;
  nontarget_pkgs int;
  nontarget_offers int;
  nontarget_versions int;
  audit_named_count_before int;
  audit_named_hash_before text;
  audit_named_count_after int;
  audit_named_hash_after text;
  -- C7: explicit expected user-trigger set on the protected tables (name:state), re-derived from
  -- target-stack migrations and pinned in the run record. Internal FK (RI) triggers are matched
  -- separately by constraint and function, see below.
  expected_triggers constant text[] := array[
    'audit_events.audit_events_f18_allowlist:O',
    'audit_events.audit_events_immutable:O',
    'audit_events.audit_events_no_truncate:O',
    'audit_events.f17_workout_export_audit_allowlist:O',
    'package_offers.audit_package_offers:O',
    'package_offers.package_offers_guard:O',
    'package_offers.package_offers_no_delete:O',
    'package_offers.package_offers_no_truncate:O',
    'package_offers.package_offers_z_category_guard:O',
    'package_versions.audit_package_versions:O',
    'package_versions.package_versions_insert_guard:O',
    'package_versions.package_versions_market_guard:O',
    'package_versions.package_versions_no_delete:O',
    'package_versions.package_versions_no_truncate:O',
    'package_versions.package_versions_no_update:O',
    'packages.audit_packages:O',
    'packages.packages_no_delete:O',
    'packages.packages_no_truncate:O',
    'packages.packages_no_update:O'];
  actual_triggers text[];
begin
  -- D1: one transaction only.
  if current_setting('c5.in_tx', true) is distinct from '1' then
    raise exception 'c5_refused:not_single_transaction' using errcode = 'C5001';
  end if;
  -- A1 (D7): database owner only, on the named stack.
  if current_user <> 'postgres' then
    raise exception 'c5_refused:not_database_owner' using errcode = 'C5001';
  end if;
  -- A6 (D2): the run record, not a second caller-declared label, binds the stack class.
  if v_stack_env is null or v_stack_env not in ('local', 'non_local') then
    raise exception 'c5_refused:invalid_stack_environment' using errcode = 'C5001';
  end if;
  if v_stack_env = 'non_local' and (
       v_po_approval is null or v_backup_restore is null
       or v_po_approval !~ '^PO-S[0-9]+-PO-[0-9]+$'
       or v_backup_restore !~ '^D14-RESTORE-[0-9]{8}-[A-Za-z0-9._-]{1,80}$')
  then
    if v_po_approval is null or v_backup_restore is null then
      raise exception 'c5_refused:missing_non_local_approvals' using errcode = 'C5001';
    end if;
    raise exception 'c5_refused:invalid_non_local_approval_reference' using errcode = 'C5001';
  end if;
  -- A5 (D3): stack identity source is declared explicitly; no silent fallback.
  if v_stack_id_source is null or v_stack_id_source not in ('pg_control_system', 'lifter.stack_id') then
    raise exception 'c5_refused:invalid_stack_id_source' using errcode = 'C5001';
  end if;
  if v_stack_id_source = 'pg_control_system' then
    begin
      select system_identifier::text into v_actual_stack from pg_catalog.pg_control_system();
    exception when insufficient_privilege then
      raise exception 'c5_refused:stack_identity_source_unavailable' using errcode = 'C5001';
    end;
  else
    v_actual_stack := nullif(current_setting('lifter.stack_id', true), '');
  end if;
  if v_actual_stack is null or v_expected_stack is null or v_actual_stack <> v_expected_stack then
    raise exception 'c5_refused:stack_identity_mismatch' using errcode = 'C5001';
  end if;
  -- A4 (D1): run_id, review_ref and out-of-band provenance fields must be present and well-formed.
  if v_run is null or v_review is null then
    raise exception 'c5_refused:missing_run_or_review_reference' using errcode = 'C5001';
  end if;
  if v_run !~ '^c5-[0-9]{8}-[0-9]+$' or length(v_run) > 40 or v_review !~ '^[A-Za-z0-9._:/#-]{1,120}$' then
    raise exception 'c5_refused:invalid_run_or_review_reference' using errcode = 'C5001';
  end if;
  if v_operator is null or v_reviewer is null or v_script_sha is null or v_run_utc is null or v_preflight_utc is null then
    raise exception 'c5_refused:missing_run_record_provenance' using errcode = 'C5001';
  end if;
  if v_operator !~ '^[A-Za-z0-9._:@/-]{1,80}$'
     or v_reviewer !~ '^[A-Za-z0-9._:@/-]{1,80}$'
     or v_script_sha !~ '^[0-9a-f]{64}$'
     or v_run_utc !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
     or v_preflight_utc !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
  then
    raise exception 'c5_refused:invalid_run_record_provenance' using errcode = 'C5001';
  end if;
  begin
    v_run_record := v_run_record_raw::jsonb;
  exception when others then
    raise exception 'c5_refused:invalid_run_record' using errcode = 'C5001';
  end;
  if v_run_record is null or v_run_record ->> 'status' is distinct from 'PASS' then
    raise exception 'c5_refused:missing_recorded_pass' using errcode = 'C5001';
  end if;
  -- T064b security-review round 2 is the only recorded design PASS reference.
  if v_review is distinct from 'T064b-r2-PASS' then
    raise exception 'c5_refused:unrecognized_review_pass' using errcode = 'C5001';
  end if;
  if v_run_record ->> 'run_id' is distinct from v_run
     or v_run_record ->> 'run_utc' is distinct from v_run_utc
     or v_run_record ->> 'operator_id' is distinct from v_operator
     or v_run_record ->> 'reviewer_id' is distinct from v_reviewer
     or v_run_record ->> 'review_ref' is distinct from v_review
     or v_run_record ->> 'script_sha256' is distinct from v_script_sha
     or v_run_record ->> 'expected_stack_id' is distinct from v_expected_stack
     or v_run_record ->> 'stack_id_source' is distinct from v_stack_id_source
     or v_run_record ->> 'stack_env' is distinct from v_stack_env
     or v_run_record ->> 'preflight_captured_utc' is distinct from v_preflight_utc
     or v_run_record ->> 'po_approval_ref' is distinct from coalesce(v_po_approval, '')
     or v_run_record ->> 'backup_restore_ref' is distinct from coalesce(v_backup_restore, '')
  then
    raise exception 'c5_refused:run_record_mismatch' using errcode = 'C5001';
  end if;
  begin
    v_run_ts := v_run_utc::timestamptz;
    v_preflight_ts := v_preflight_utc::timestamptz;
  exception when others then
    raise exception 'c5_refused:invalid_run_record_provenance' using errcode = 'C5001';
  end;
  if v_preflight_ts > v_run_ts then
    raise exception 'c5_refused:invalid_run_record_provenance' using errcode = 'C5001';
  end if;
  if current_setting('search_path') <> 'pg_catalog' then
    raise exception 'c5_refused:search_path_not_pinned' using errcode = 'C5001';
  end if;
  if nullif(current_setting('statement_timeout'), '') is null
     or current_setting('statement_timeout') in ('0', '0ms')
     or nullif(current_setting('lock_timeout'), '') is null
     or current_setting('lock_timeout') in ('0', '0ms')
  then
    raise exception 'c5_refused:timeouts_not_set' using errcode = 'C5001';
  end if;
  -- A1: FORCE RLS on the package tables; deletes rely on BYPASSRLS/superuser.
  if not coalesce((select r.rolbypassrls or r.rolsuper from pg_catalog.pg_roles r where r.rolname = current_user), false) then
    raise exception 'c5_refused:owner_lacks_bypassrls' using errcode = 'C5001';
  end if;
  -- B1, G2 (D8): explicit allow-lists, strict UUID token validation before cast, no pattern selection.
  if v_raw_pkgs is null then
    raise exception 'c5_refused:empty_allow_list' using errcode = 'C5001';
  end if;
  v_pkg_tokens := string_to_array(v_raw_pkgs, ',');
  foreach v_tok in array v_pkg_tokens loop
    if v_tok is null or v_tok !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'c5_refused:malformed_allow_list' using errcode = 'C5001';
    end if;
  end loop;
  if v_raw_ws is not null then
    v_ws_tokens := string_to_array(v_raw_ws, ',');
    foreach v_tok in array v_ws_tokens loop
      if v_tok is null or v_tok !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        raise exception 'c5_refused:malformed_allow_list' using errcode = 'C5001';
      end if;
    end loop;
    v_ws := array(select distinct x::uuid from unnest(v_ws_tokens) x order by 1);
  else
    v_ws := '{}'::uuid[];
  end if;
  v_pkgs := array(select distinct x::uuid from unnest(v_pkg_tokens) x order by 1);
  if cardinality(v_pkgs) = 0 then
    raise exception 'c5_refused:empty_allow_list' using errcode = 'C5001';
  end if;
  if v_run_record -> 'package_ids' is distinct from to_jsonb(v_pkgs::text[])
     or v_run_record -> 'workspace_ids' is distinct from to_jsonb(v_ws::text[])
  then
    raise exception 'c5_refused:run_record_mismatch' using errcode = 'C5001';
  end if;

  -- C6: origin replication role, never replica.
  if current_setting('session_replication_role') <> 'origin' then
    raise exception 'c5_refused:replication_role_not_origin' using errcode = 'C5001';
  end if;
  begin
    set local session_replication_role = 'origin';
  exception when insufficient_privilege then
    null; -- already asserted to be 'origin'
  end;

  -- C9: EXCLUSIVE lock in a fixed order (timeouts were set before this block).
  lock table public.packages, public.package_offers, public.package_versions in exclusive mode;

  -- C6/C7: trigger/FK/rule state, refuse (never repair).
  select coalesce(array_agg(c.relname::text || '.' || t.tgname::text || ':' || t.tgenabled::text order by (c.relname::text || '.' || t.tgname::text) collate "C"), '{}')
    into actual_triggers
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
   where t.tgrelid in ('public.packages'::regclass, 'public.package_offers'::regclass,
                       'public.package_versions'::regclass, 'public.audit_events'::regclass)
     and not t.tgisinternal;
  if actual_triggers is distinct from (select array_agg(x order by split_part(x, ':', 1) collate "C") from unnest(expected_triggers) x) then
    raise exception 'c5_refused:trigger_set_or_state_unexpected' using errcode = 'C5001';
  end if;
  if exists (
    select 1 from pg_catalog.pg_trigger t
     where t.tgrelid in ('public.packages'::regclass, 'public.package_offers'::regclass,
                         'public.package_versions'::regclass, 'public.audit_events'::regclass)
       and t.tgisinternal
       and (t.tgenabled <> 'O'
            or not exists (select 1 from pg_catalog.pg_constraint con where con.oid = t.tgconstraint and con.contype = 'f')
            or (select p.proname::text from pg_catalog.pg_proc p where p.oid = t.tgfoid) not like 'RI\_FKey\_%'))
  then
    raise exception 'c5_refused:internal_fk_trigger_unexpected' using errcode = 'C5001';
  end if;
  if exists (
    select 1 from pg_catalog.pg_constraint con
     where con.contype = 'f' and not con.convalidated
       and (con.conrelid in ('public.packages'::regclass, 'public.package_offers'::regclass, 'public.package_versions'::regclass)
         or con.confrelid in ('public.packages'::regclass, 'public.package_offers'::regclass, 'public.package_versions'::regclass)))
  then
    raise exception 'c5_refused:unvalidated_fk' using errcode = 'C5001';
  end if;
  if exists (
    select 1 from pg_catalog.pg_rewrite rw
     where rw.ev_class in ('public.packages'::regclass, 'public.package_offers'::regclass,
                           'public.package_versions'::regclass, 'public.audit_events'::regclass))
  then
    raise exception 'c5_refused:rewrite_rule_present' using errcode = 'C5001';
  end if;

  if exists (
    select 1 from pg_catalog.pg_constraint con
     where con.contype = 'f' and con.confdeltype not in ('r', 'a')
       and con.confrelid in ('public.packages'::regclass, 'public.package_offers'::regclass, 'public.package_versions'::regclass))
  then
    raise exception 'c5_refused:fk_not_restrictive' using errcode = 'C5001';
  end if;
  select md5(string_agg(pg_catalog.pg_get_constraintdef(con.oid) || con.convalidated::text || con.conname::text, '|' order by con.oid))
    into fk_hash_before
    from pg_catalog.pg_constraint con
   where con.conrelid in ('public.packages'::regclass, 'public.package_offers'::regclass, 'public.package_versions'::regclass)
      or con.confrelid in ('public.packages'::regclass, 'public.package_offers'::regclass, 'public.package_versions'::regclass);

  select md5(string_agg(pg_catalog.pg_get_functiondef(p.oid), '|' order by p.proname, p.oid))
    into hash_before
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'app_private'
     and p.proname in ('forbid_delete', 'audit_events_immutable', 'guard_package_offer_update', 'guard_package_offer_category',
                       'guard_package_version_insert', 'guard_package_version_market', 'audit_row_change',
                       'audit_package_created', 'package_c5_preflight');

  -- C9: re-run the read-only preflight under the lock and require set-equality with the allow-list.
  v_rep := app_private.package_c5_preflight(v_pkgs);
  if v_rep ->> 'input_mode' <> 'list' or not (v_rep ->> 'deletable')::boolean then
    raise exception 'c5_refused:preflight_not_deletable:%', (v_rep -> 'refusals')::text using errcode = 'C5001';
  end if;
  if v_run_record -> 'preflight' is distinct from v_rep then
    raise exception 'c5_refused:run_record_mismatch' using errcode = 'C5001';
  end if;
  if (select array_agg((t ->> 'package_id')::uuid order by (t ->> 'package_id')::uuid)
        from jsonb_array_elements(v_rep -> 'targets') t) is distinct from v_pkgs then
    raise exception 'c5_refused:target_set_differs_from_allow_list' using errcode = 'C5001';
  end if;
  if not (v_rep ->> 'synthetic_only')::boolean then
    raise exception 'c5_refused:not_synthetic' using errcode = 'C5001';
  end if;
  -- B3/B5: every workspace holding an offer/version of a target must be operator-verified synthetic, exact equality.
  if exists (select 1 from jsonb_array_elements_text(v_rep -> 'workspace_ids') w where w::uuid <> all(v_ws)) then
    raise exception 'c5_refused:workspace_not_verified_synthetic' using errcode = 'C5001';
  end if;
  if v_ws is distinct from (select coalesce(array_agg(w::uuid order by w::uuid), '{}') from jsonb_array_elements_text(v_rep -> 'workspace_ids') w) then
    raise exception 'c5_refused:workspace_list_mismatch' using errcode = 'C5001';
  end if;

  select count(*) into nontarget_pkgs from public.packages where id <> all(v_pkgs);
  select count(*) into nontarget_offers from public.package_offers where package_id <> all(v_pkgs);
  select count(*) into nontarget_versions
    from public.package_versions v join public.package_offers o on o.id = v.offer_id where o.package_id <> all(v_pkgs);

  create temp table c5_offers on commit drop as
    select o.workspace_id, o.id, o.package_id, o.current_version_id, to_jsonb(o) - 'current_version_id' as rest
      from public.package_offers o where o.package_id = any(v_pkgs);
  create temp table c5_versions on commit drop as
    select v.workspace_id, v.id, o.package_id from public.package_versions v
      join public.package_offers o on o.id = v.offer_id where o.package_id = any(v_pkgs);
  create temp table c5_counts on commit drop as
    select p.id as package_id,
           (select count(*) from pg_temp.c5_offers x where x.package_id = p.id)::int as offers,
           (select count(*) from pg_temp.c5_versions x where x.package_id = p.id)::int as versions
      from public.packages p where p.id = any(v_pkgs);

  -- E1 (D4): capture count and content hash of all pre-existing audit rows naming target packages/offers/versions.
  select count(*)::int,
         md5(coalesce(string_agg(
           e.id::text || '|' || e.occurred_at::text || '|' || coalesce(e.actor_user_id::text, '') || '|' ||
           e.action || '|' || e.target_table || '|' || e.target_id::text || '|' ||
           coalesce(e.workspace_id::text, '') || '|' || e.details::text,
           chr(10) order by e.id), ''))
    into audit_named_count_before, audit_named_hash_before
    from public.audit_events e
   where (e.target_table = 'packages' and e.target_id = any(v_pkgs))
      or (e.target_table = 'package_offers' and e.target_id in (select id from pg_temp.c5_offers))
      or (e.target_table = 'package_versions' and e.target_id in (select id from pg_temp.c5_versions));

  -- C4/C5 (Q2=A narrowed): break the current-version cycle with ONE update, only
  -- package_offers_guard disabled, re-enabled before any DELETE.
  select count(*) into n from pg_temp.c5_offers where current_version_id is not null;
  if n > 0 then
    alter table public.package_offers disable trigger package_offers_guard;
    with u as (
      update public.package_offers o set current_version_id = null
        from pg_temp.c5_offers c
       where o.workspace_id = c.workspace_id and o.id = c.id and o.current_version_id is not null
      returning o.id)
    select count(*) into m from u;
    alter table public.package_offers enable trigger package_offers_guard;
    if m <> n then
      raise exception 'c5_refused:current_version_update_count_mismatch' using errcode = 'C5001';
    end if;
    if not exists (select 1 from pg_catalog.pg_trigger t where t.tgrelid = 'public.package_offers'::regclass
                    and t.tgname = 'package_offers_guard' and t.tgenabled = 'O') then
      raise exception 'c5_refused:offer_guard_not_reenabled' using errcode = 'C5001';
    end if;
    if exists (select 1 from public.package_offers o join pg_temp.c5_offers c on c.id = o.id and c.workspace_id = o.workspace_id
                where o.current_version_id is not null or o.available) then
      raise exception 'c5_refused:offer_state_unexpected' using errcode = 'C5001';
    end if;
    -- Only current_version_id may differ: every other column of every target offer is unchanged.
    if exists (select 1 from public.package_offers o join pg_temp.c5_offers c on c.id = o.id and c.workspace_id = o.workspace_id
                where (to_jsonb(o) - 'current_version_id') is distinct from c.rest) then
      raise exception 'c5_refused:offer_other_column_changed' using errcode = 'C5001';
    end if;
  end if;

  -- C4/D2: delete order versions, offers, packages; each trigger disabled only around its own DELETE.
  alter table public.package_versions disable trigger package_versions_no_delete;
  with d as (
    delete from public.package_versions v using pg_temp.c5_versions c
     where v.workspace_id = c.workspace_id and v.id = c.id
    returning v.id)
  select count(*) into m from d;
  alter table public.package_versions enable trigger package_versions_no_delete;
  if m <> (select count(*) from pg_temp.c5_versions) then
    raise exception 'c5_refused:version_delete_count_mismatch' using errcode = 'C5001';
  end if;

  alter table public.package_offers disable trigger package_offers_no_delete;
  with d as (
    delete from public.package_offers o using pg_temp.c5_offers c
     where o.workspace_id = c.workspace_id and o.id = c.id
    returning o.id)
  select count(*) into m from d;
  alter table public.package_offers enable trigger package_offers_no_delete;
  if m <> (select count(*) from pg_temp.c5_offers) then
    raise exception 'c5_refused:offer_delete_count_mismatch' using errcode = 'C5001';
  end if;

  alter table public.packages disable trigger packages_no_delete;
  with d as (
    delete from public.packages p where p.id = any(v_pkgs) and p.workspace_id is null
    returning p.id)
  select array_agg(id order by id) into v_ids from d;
  alter table public.packages enable trigger packages_no_delete;
  if v_ids is distinct from v_pkgs then
    raise exception 'c5_refused:package_delete_set_mismatch' using errcode = 'C5001';
  end if;

  -- E2: one teardown audit event per deleted package; no operator identity, no PII.
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  select null, 'package.teardown_executed', 'packages', c.package_id, null,
         jsonb_build_object('run_id', v_run, 'review_ref', v_review, 'offer_count', c.offers, 'version_count', c.versions)
    from pg_temp.c5_counts c;

  -- D4: post-conditions, any failure rolls everything back.
  select coalesce(array_agg(c.relname::text || '.' || t.tgname::text || ':' || t.tgenabled::text order by (c.relname::text || '.' || t.tgname::text) collate "C"), '{}')
    into actual_triggers
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
   where t.tgrelid in ('public.packages'::regclass, 'public.package_offers'::regclass,
                       'public.package_versions'::regclass, 'public.audit_events'::regclass)
     and not t.tgisinternal;
  if actual_triggers is distinct from (select array_agg(x order by split_part(x, ':', 1) collate "C") from unnest(expected_triggers) x) then
    raise exception 'c5_refused:post_trigger_state_unexpected' using errcode = 'C5001';
  end if;
  select md5(string_agg(pg_catalog.pg_get_functiondef(p.oid), '|' order by p.proname, p.oid))
    into hash_after
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'app_private'
     and p.proname in ('forbid_delete', 'audit_events_immutable', 'guard_package_offer_update', 'guard_package_offer_category',
                       'guard_package_version_insert', 'guard_package_version_market', 'audit_row_change',
                       'audit_package_created', 'package_c5_preflight');
  select md5(string_agg(pg_catalog.pg_get_constraintdef(con.oid) || con.convalidated::text || con.conname::text, '|' order by con.oid))
    into fk_hash_after
    from pg_catalog.pg_constraint con
   where con.conrelid in ('public.packages'::regclass, 'public.package_offers'::regclass, 'public.package_versions'::regclass)
      or con.confrelid in ('public.packages'::regclass, 'public.package_offers'::regclass, 'public.package_versions'::regclass);
  if fk_hash_after is distinct from fk_hash_before then
    raise exception 'c5_refused:constraint_changed' using errcode = 'C5001';
  end if;
  if hash_after is distinct from hash_before then
    raise exception 'c5_refused:guard_function_changed' using errcode = 'C5001';
  end if;
  if (select count(*) from public.packages where id <> all(v_pkgs)) <> nontarget_pkgs
     or (select count(*) from public.package_offers where package_id <> all(v_pkgs)) <> nontarget_offers
     or (select count(*) from public.package_versions v join public.package_offers o on o.id = v.offer_id
          where o.package_id <> all(v_pkgs)) <> nontarget_versions then
    raise exception 'c5_refused:non_target_rows_changed' using errcode = 'C5001';
  end if;
  if exists (select 1 from public.packages where id = any(v_pkgs))
     or exists (select 1 from public.package_offers o join pg_temp.c5_offers c on c.id = o.id)
     or exists (select 1 from public.package_versions v join pg_temp.c5_versions c on c.id = v.id) then
    raise exception 'c5_refused:targets_remain' using errcode = 'C5001';
  end if;
  if (select count(*) from public.audit_events
       where action = 'package.teardown_executed' and details ->> 'run_id' = v_run) <> cardinality(v_pkgs) then
    raise exception 'c5_refused:teardown_event_count_mismatch' using errcode = 'C5001';
  end if;
  -- E1 (D4): pre-existing audit rows naming target packages/offers/versions must be identical in count and content.
  select count(*)::int,
         md5(coalesce(string_agg(
           e.id::text || '|' || e.occurred_at::text || '|' || coalesce(e.actor_user_id::text, '') || '|' ||
           e.action || '|' || e.target_table || '|' || e.target_id::text || '|' ||
           coalesce(e.workspace_id::text, '') || '|' || e.details::text,
           chr(10) order by e.id), ''))
    into audit_named_count_after, audit_named_hash_after
    from public.audit_events e
   where not (e.action = 'package.teardown_executed' and e.details ->> 'run_id' = v_run)
     and ((e.target_table = 'packages' and e.target_id = any(v_pkgs))
       or (e.target_table = 'package_offers' and e.target_id in (select id from pg_temp.c5_offers))
       or (e.target_table = 'package_versions' and e.target_id in (select id from pg_temp.c5_versions)));
  if audit_named_count_after <> audit_named_count_before or audit_named_hash_after is distinct from audit_named_hash_before then
    raise exception 'c5_refused:preexisting_audit_changed' using errcode = 'C5001';
  end if;

  raise notice 'c5_ok run_id=% packages=% offers=% versions=%', v_run, cardinality(v_pkgs),
    (select count(*) from pg_temp.c5_offers), (select count(*) from pg_temp.c5_versions);
end
$c5$;
