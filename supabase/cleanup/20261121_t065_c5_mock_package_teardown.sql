-- Task: T065 [FR-028, SC-019]. PO decisions S61-PO-2 (Teardown Q1=A, Q2=A, Q3=A).
-- Design and controls: specs/009-packages/review.md sections 4-5 (controls 1-12). OPERATOR CLEANUP SCRIPT,
-- NOT A MIGRATION: it lives outside supabase/migrations, never runs on `db reset` or deploy, and is
-- executed by hand as the database owner on a named stack after the independent T064b PASS.
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
--     -v run_id='c5-<yyyymmdd>-<n>' -v review_ref='<T064b PASS record reference>' \
--     -v expected_stack_id='<system_identifier of the named stack>' \
--     -f supabase/cleanup/20261121_t065_c5_mock_package_teardown.sql
-- run_id must match ^c5-<yyyymmdd>-<n>$; review_ref is 1-120 characters of [A-Za-z0-9._:/#-].
-- expected_stack_id is the cluster-unique identifier of the named stack: run
--   select system_identifier::text from pg_control_system();
-- on it and record it. If the owner may not call pg_control_system(), the stack owner maintains
-- `alter database <db> set lifter.stack_id = '<unique id>'` and passes that value instead.
-- (current_database() is 'postgres' on every stack and proves nothing.)
-- Record operator, reviewer, stack identity and before-counts in the out-of-band run record FIRST.
-- package_ids must be the allow-list captured from app_private.package_c5_preflight(...) (deletable = true);
-- workspace_ids is the operator-verified list of synthetic workspaces (the schema has no synthetic marker).
-- A refusal raises SQLSTATE C5001 with message 'c5_refused:<code>', writes nothing and exits non-zero.
--
-- The lines up to the marker below only copy the psql variables into transaction-local settings; the
-- integration tests set the same settings themselves and execute everything after the marker.
select set_config('c5.package_ids', :'package_ids', true),
       set_config('c5.workspace_ids', :'workspace_ids', true),
       set_config('c5.run_id', :'run_id', true),
       set_config('c5.review_ref', :'review_ref', true),
       set_config('c5.expected_stack_id', :'expected_stack_id', true);
-- ==== core ====
-- In autocommit mode each statement is its own transaction, so this setting would be gone when the DO
-- block runs; the block then refuses (control 2: refuse if not inside one transaction).
-- search_path is pinned (pg_catalog only; temp tables are always referenced as pg_temp.c5_*) and the
-- timeouts are set by statements OUTSIDE the DO block, where they apply to it.
set local search_path = pg_catalog;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
select set_config('c5.in_tx', '1', true);

do $c5$
declare
  v_pkgs uuid[];
  v_ws uuid[];
  v_run text := nullif(current_setting('c5.run_id', true), '');
  v_review text := nullif(current_setting('c5.review_ref', true), '');
  v_expected_stack text := nullif(current_setting('c5.expected_stack_id', true), '');
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
  -- N6: explicit expected user-trigger set on the protected tables (name:state). Internal FK (RI)
  -- triggers are matched separately by constraint and function, see assert_state below.
  expected_triggers constant text[] := array[
    'audit_events.audit_events_f18_allowlist:O',
    'audit_events.audit_events_immutable:O',
    'audit_events.audit_events_no_truncate:O',
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
  -- Control 2: one transaction only.
  if current_setting('c5.in_tx', true) is distinct from '1' then
    raise exception 'c5_refused:not_single_transaction' using errcode = 'C5001';
  end if;
  -- Control 1: database owner only, on the named stack.
  if current_user <> 'postgres' then
    raise exception 'c5_refused:not_database_owner' using errcode = 'C5001';
  end if;
  begin
    select system_identifier::text into v_actual_stack from pg_catalog.pg_control_system();
  exception when insufficient_privilege then
    v_actual_stack := nullif(current_setting('lifter.stack_id', true), '');
  end;
  if v_actual_stack is null or v_expected_stack is null or v_actual_stack <> v_expected_stack then
    raise exception 'c5_refused:stack_identity_mismatch' using errcode = 'C5001';
  end if;
  if v_run is null or v_review is null then
    raise exception 'c5_refused:missing_run_or_review_reference' using errcode = 'C5001';
  end if;
  if v_run !~ '^c5-[0-9]{8}-[0-9]+$' or length(v_run) > 40 or v_review !~ '^[A-Za-z0-9._:/#-]{1,120}$' then
    raise exception 'c5_refused:invalid_run_or_review_reference' using errcode = 'C5001';
  end if;
  if current_setting('search_path') <> 'pg_catalog' then
    raise exception 'c5_refused:search_path_not_pinned' using errcode = 'C5001';
  end if;
  if current_setting('statement_timeout') in ('0', '0ms') or current_setting('lock_timeout') in ('0', '0ms') then
    raise exception 'c5_refused:timeouts_not_set' using errcode = 'C5001';
  end if;
  -- Control 8 (finding 13): FORCE RLS on the package tables; deletes rely on BYPASSRLS.
  if not coalesce((select r.rolbypassrls or r.rolsuper from pg_catalog.pg_roles r where r.rolname = current_user), false) then
    raise exception 'c5_refused:owner_lacks_bypassrls' using errcode = 'C5001';
  end if;
  -- Control 3: explicit allow-lists, no pattern selection.
  v_pkgs := array(select distinct x::uuid from unnest(string_to_array(nullif(current_setting('c5.package_ids', true), ''), ',')) x order by 1);
  v_ws := array(select distinct x::uuid from unnest(string_to_array(nullif(current_setting('c5.workspace_ids', true), ''), ',')) x order by 1);
  if cardinality(v_pkgs) = 0 then
    raise exception 'c5_refused:empty_allow_list' using errcode = 'C5001';
  end if;

  -- Control 5 (finding 1): origin replication role, never replica.
  if current_setting('session_replication_role') <> 'origin' then
    raise exception 'c5_refused:replication_role_not_origin' using errcode = 'C5001';
  end if;
  begin
    set local session_replication_role = 'origin';
  exception when insufficient_privilege then
    null; -- already asserted to be 'origin'
  end;

  -- Control 6 (finding 7): EXCLUSIVE lock in a fixed order (timeouts were set before this block).
  lock table public.packages, public.package_offers, public.package_versions in exclusive mode;

  -- Control 5: trigger/FK/rule state, refuse (never repair).
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

  -- Re-run the read-only preflight under the lock and require set-equality with the allow-list.
  v_rep := app_private.package_c5_preflight(v_pkgs);
  if v_rep ->> 'input_mode' <> 'list' or not (v_rep ->> 'deletable')::boolean then
    raise exception 'c5_refused:preflight_not_deletable:%', (v_rep -> 'refusals')::text using errcode = 'C5001';
  end if;
  if (select array_agg((t ->> 'package_id')::uuid order by (t ->> 'package_id')::uuid)
        from jsonb_array_elements(v_rep -> 'targets') t) is distinct from v_pkgs then
    raise exception 'c5_refused:target_set_differs_from_allow_list' using errcode = 'C5001';
  end if;
  if not (v_rep ->> 'synthetic_only')::boolean then
    raise exception 'c5_refused:not_synthetic' using errcode = 'C5001';
  end if;
  -- Every workspace holding an offer/version of a target must be operator-verified synthetic.
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

  -- Control 7 (Q2=A narrowed): break the current-version cycle with ONE update, only
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

  -- Control 8: delete order versions, offers, packages; each trigger disabled only around its own DELETE.
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

  -- Control 9 (finding 10): one teardown audit event per deleted package; no operator identity, no PII.
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  select null, 'package.teardown_executed', 'packages', c.package_id, null,
         jsonb_build_object('run_id', v_run, 'review_ref', v_review, 'offer_count', c.offers, 'version_count', c.versions)
    from pg_temp.c5_counts c;

  -- Control 10: post-conditions, any failure rolls everything back.
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

  raise notice 'c5_ok run_id=% packages=% offers=% versions=%', v_run, cardinality(v_pkgs),
    (select count(*) from pg_temp.c5_offers), (select count(*) from pg_temp.c5_versions);
end
$c5$;
