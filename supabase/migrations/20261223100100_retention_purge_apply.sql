-- T012 / FR-008 / FR-009. The run ledger contains counts only; it never stores row IDs.
create table app_private.retention_purge_runs (
  run_id uuid primary key,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('running', 'completed')),
  result jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  check ((status = 'running' and result is null and completed_at is null)
    or (status = 'completed' and jsonb_typeof(result) = 'object' and completed_at is not null))
);
alter table app_private.retention_purge_runs owner to postgres;
alter table app_private.retention_purge_runs enable row level security;
alter table app_private.retention_purge_runs force row level security;
revoke all on app_private.retention_purge_runs from public, anon, authenticated, service_role;
create policy retention_purge_runs_postgres_only on app_private.retention_purge_runs
  for all to postgres using (true) with check (true);

-- This allowlist is frozen from the Stack E FK closure by this migration.
-- Evidence tables are traversable parents but are never delete targets.
create table app_private.retention_purge_allowlist (
  table_oid oid primary key,
  can_delete boolean not null,
  can_update boolean not null default false,
  traverse boolean not null default true,
  check (can_delete or can_update or traverse)
);
alter table app_private.retention_purge_allowlist owner to postgres;
alter table app_private.retention_purge_allowlist enable row level security;
alter table app_private.retention_purge_allowlist force row level security;
revoke all on app_private.retention_purge_allowlist from public, anon, authenticated, service_role;
create policy retention_purge_allowlist_postgres_only on app_private.retention_purge_allowlist
  for all to postgres using (true) with check (true);

with recursive closure(table_oid) as (
  select 'public.clients'::regclass::oid
  union
  select fk.conrelid
  from pg_catalog.pg_constraint fk
  join closure parent on parent.table_oid = fk.confrelid
  where fk.contype = 'f'
    and fk.conrelid not in (
      'public.audit_events'::regclass,
      'app_private.retention_purge_runs'::regclass,
      'app_private.retention_purge_allowlist'::regclass
    )
)
insert into app_private.retention_purge_allowlist(table_oid, can_delete, can_update, traverse)
select table_oid,
  table_oid not in (
    'public.payment_events'::regclass,
    'public.refund_operations'::regclass,
    'public.refund_allocation_events'::regclass,
    'public.subscription_obligation_cancellations'::regclass
  ),
  table_oid = 'public.refund_operations'::regclass,
  true
from closure;

create function app_private.retention_purge_context_allows(p_table_oid oid, p_operation text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select current_user = 'postgres'
    and current_setting('app_private.retention_purge_run_id', true)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from app_private.retention_purge_runs r
      where r.run_id = current_setting('app_private.retention_purge_run_id', true)::uuid
        and r.status = 'running'
    )
    and exists (
      select 1 from app_private.retention_purge_allowlist a
      where a.table_oid = p_table_oid
        and case p_operation
          when 'DELETE' then a.can_delete
          when 'UPDATE' then a.can_update
          else false
        end
    )
$$;
alter function app_private.retention_purge_context_allows(oid, text) owner to postgres;
grant execute on function app_private.retention_purge_context_allows(oid, text) to public;

-- Keep existing triggers and their default behavior intact. Add the run-scoped
-- early return inside each existing DELETE guard function instead of replacing
-- trigger semantics; unrelated DELETE/TRUNCATE and non-DELETE behavior continues.
do $$
declare t record; definition text; changed text;
begin
  for t in
    select distinct tr.tgfoid
    from pg_catalog.pg_trigger tr
    join app_private.retention_purge_allowlist a on a.table_oid = tr.tgrelid
    join pg_catalog.pg_proc fn on fn.oid = tr.tgfoid
    join pg_catalog.pg_language lang on lang.oid = fn.prolang
    where not tr.tgisinternal and (tr.tgtype & 8) <> 0
      and lang.lanname = 'plpgsql'
  loop
    definition := pg_catalog.pg_get_functiondef(t.tgfoid);
    if pg_catalog.strpos(definition, 'retention_purge_context_allows') = 0 then
      changed := pg_catalog.regexp_replace(definition, '\mBEGIN\M',
        E'BEGIN\n  if tg_op = ''DELETE'' and app_private.retention_purge_context_allows(tg_relid, ''DELETE'') then\n    return old;\n  end if;', 'i');
      if changed = definition then
        raise exception 'retention purge could not update delete guard %', t.tgfoid::regprocedure;
      end if;
      execute changed;
    end if;
  end loop;
end $$;

-- This shared immutable guard permits only refund_operations.client_id = NULL
-- during a locked purge run; every other update remains rejected.
create or replace function app_private.audit_events_immutable() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare token_text text;
begin
  if tg_op = 'DELETE'
    and app_private.retention_purge_context_allows(tg_relid, 'DELETE') then
    return old;
  end if;
  if tg_op = 'UPDATE'
    and tg_table_schema = 'public'
    and tg_table_name = 'refund_operations' then
    if current_user = 'postgres'
      and app_private.retention_purge_context_allows(tg_relid, 'UPDATE')
      and new.client_id is null
      and (to_jsonb(new) - 'client_id') = (to_jsonb(old) - 'client_id') then
      return new;
    end if;
  end if;
  if tg_op <> 'DELETE' or tg_table_schema <> 'public' or tg_table_name <> 'audit_events' then
    raise exception 'Audit events are immutable' using errcode = '23514';
  end if;
  if current_user = 'postgres' then
    token_text := current_setting('app_private.f15_d1_erasure_token', true);
    if token_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and old.action in ('form.answer_viewed', 'form.answer_corrected', 'form.draft_saved')
      and old.target_table in ('form_answer_current','form_answer_draft','form_answer_history','form_answer_revisions','form_answer_drafts')
      and exists (
        select 1 from app_private.f15_d1_erasure_context ctx
        where ctx.tx_id = pg_catalog.pg_current_xact_id()::text
          and ctx.token = token_text::uuid and ctx.workspace_id = old.workspace_id
          and ctx.assignment_id = old.target_id and old.id = any(ctx.allowed_audit_ids)
      ) then return old;
    end if;
  end if;
  raise exception 'Audit events are immutable' using errcode = '23514';
end $$;
alter function app_private.audit_events_immutable() owner to postgres;
revoke all on function app_private.audit_events_immutable() from public, anon, authenticated, service_role;

create or replace function app_private.forbid_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE'
    and app_private.retention_purge_context_allows(tg_relid, 'DELETE') then
    return old;
  end if;
  raise exception 'Deletes are not allowed on audited governance tables' using errcode = '23514';
end $$;
alter function app_private.forbid_delete() owner to postgres;
revoke execute on function app_private.forbid_delete() from public, anon, authenticated, service_role;

create function app_private.purge_retention_apply(p_run_id uuid, p_mode text)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  sampled_at timestamptz := pg_catalog.clock_timestamp();
  fingerprint text := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to('retention-purge-apply-v1', 'UTF8'), 'sha256'), 'hex'
  );
  prior app_private.retention_purge_runs%rowtype;
  eligible_count integer;
  held_count integer;
  inside_window_count integer;
  retained_counts jsonb;
  deleted_counts jsonb := '{}'::jsonb;
  v_result jsonb;
  edge record;
  target_table record;
  join_clause text;
  added_rows integer;
  expected_rows bigint;
  found_more boolean;
begin
  if current_user <> 'postgres' then
    raise exception 'purge_schedule_owner_required' using errcode = '42501';
  end if;
  if p_run_id is null or p_mode not in ('dry_run', 'apply') then
    raise exception 'invalid_retention_purge_request' using errcode = '22023';
  end if;

  select count(distinct p.client_id)::integer into eligible_count
  from app_private.purge_retention_candidates(sampled_at) p
  where p.data_class = 'client';
  select count(distinct c.id)::integer into held_count
  from public.clients c
  join app_private.refund_auth_lockouts l on l.client_id = c.id
  where c.deactivated_at is not null and l.status in ('pending', 'retry')
    and c.deactivated_at <= sampled_at - interval '30 days';
  select count(distinct c.id)::integer into inside_window_count
  from public.clients c
  where c.deactivated_at is not null
    and c.deactivated_at > sampled_at - interval '30 days'
    and not exists (
      select 1 from app_private.refund_auth_lockouts l
      where l.client_id = c.id and l.status in ('pending', 'retry')
    );

  if p_mode = 'dry_run' then
    return jsonb_build_object(
      'status', 'dry_run',
      'eligible_clients', eligible_count,
      'held_clients', held_count,
      'inside_window_clients', inside_window_count,
      'sources', jsonb_build_array('S70-PO-1 item 3', 'S70-R47', 'S70-PO-14'),
      'legal_basis', 'PO states Egyptian legal advice was obtained'
    );
  end if;

  insert into app_private.retention_purge_runs(run_id, request_fingerprint, status)
    values (p_run_id, fingerprint, 'running') on conflict (run_id) do nothing;
  select * into strict prior from app_private.retention_purge_runs r
    where r.run_id = p_run_id for update;
  if prior.request_fingerprint <> fingerprint then
    raise exception 'retention_purge_run_conflict' using errcode = '23505';
  end if;
  if prior.status = 'completed' then
    return prior.result || jsonb_build_object('status', 'replayed');
  end if;

  perform pg_catalog.set_config('app_private.retention_purge_run_id', p_run_id::text, true);
  create temporary table retention_purge_eligible_clients (
    workspace_id uuid not null, client_id uuid not null, row_tid tid not null,
    primary key (workspace_id, client_id)
  ) on commit drop;
  insert into pg_temp.retention_purge_eligible_clients(workspace_id, client_id, row_tid)
  select distinct c.workspace_id, c.id, c.ctid
  from public.clients c
  join app_private.purge_retention_candidates(sampled_at) p
    on p.data_class = 'client' and p.workspace_id = c.workspace_id and p.client_id = c.id;
  get diagnostics eligible_count = row_count;

  create temporary table retention_purge_targets (
    table_oid oid not null, row_tid tid not null, depth integer not null,
    primary key (table_oid, row_tid)
  ) on commit drop;
  insert into pg_temp.retention_purge_targets(table_oid, row_tid, depth)
  select 'public.clients'::regclass::oid, row_tid, 0
  from pg_temp.retention_purge_eligible_clients;

  loop
    found_more := false;
    for edge in
      select fk.conrelid as child_oid, fk.confrelid as parent_oid,
        pg_catalog.format('%I.%I', child_ns.nspname, child.relname) as child_relation,
        pg_catalog.format('%I.%I', parent_ns.nspname, parent.relname) as parent_relation,
        (select pg_catalog.string_agg(
          pg_catalog.format('child_row.%I = parent_row.%I', child_att.attname, parent_att.attname), ' and '
          order by key_col.ordinality)
         from unnest(fk.conkey) with ordinality key_col(attnum, ordinality)
         join unnest(fk.confkey) with ordinality parent_key(attnum, ordinality)
           on parent_key.ordinality = key_col.ordinality
         join pg_catalog.pg_attribute child_att
           on child_att.attrelid = fk.conrelid and child_att.attnum = key_col.attnum
         join pg_catalog.pg_attribute parent_att
           on parent_att.attrelid = fk.confrelid and parent_att.attnum = parent_key.attnum) as join_clause
      from pg_catalog.pg_constraint fk
      join app_private.retention_purge_allowlist child_allow on child_allow.table_oid = fk.conrelid
      join app_private.retention_purge_allowlist parent_allow on parent_allow.table_oid = fk.confrelid
      join pg_catalog.pg_class child on child.oid = fk.conrelid
      join pg_catalog.pg_namespace child_ns on child_ns.oid = child.relnamespace
      join pg_catalog.pg_class parent on parent.oid = fk.confrelid
      join pg_catalog.pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
      where fk.contype = 'f' and child_allow.traverse and parent_allow.traverse
    loop
      join_clause := edge.join_clause;
      execute pg_catalog.format(
        'insert into pg_temp.retention_purge_targets(table_oid,row_tid,depth) '
        'select child_row.tableoid,child_row.ctid,parent_target.depth+1 '
        'from %s child_row join %s parent_row on %s '
        'join pg_temp.retention_purge_targets parent_target '
        'on parent_target.table_oid=parent_row.tableoid and parent_target.row_tid=parent_row.ctid '
        'on conflict (table_oid,row_tid) do nothing',
        edge.child_relation, edge.parent_relation, join_clause
      );
      get diagnostics added_rows = row_count;
      found_more := found_more or added_rows > 0;
    end loop;
    exit when not found_more;
  end loop;

  update public.refund_operations r set client_id = null
  from pg_temp.retention_purge_eligible_clients e
  where r.workspace_id = e.workspace_id and r.client_id = e.client_id;

  select jsonb_build_object(
    'payment_events', count(*) filter (where t.table_oid = 'public.payment_events'::regclass)::integer,
    'refund_operations', count(*) filter (where t.table_oid = 'public.refund_operations'::regclass)::integer,
    'refund_allocation_events', count(*) filter (where t.table_oid = 'public.refund_allocation_events'::regclass)::integer,
    'subscription_obligation_cancellations', count(*) filter (where t.table_oid = 'public.subscription_obligation_cancellations'::regclass)::integer
  ) into retained_counts
  from pg_temp.retention_purge_targets t;

  for target_table in
    with recursive paths(table_oid, depth, path) as (
      select 'public.clients'::regclass::oid, 0, array['public.clients'::regclass::oid]
      union all
      select fk.conrelid, parent.depth + 1, parent.path || fk.conrelid
      from paths parent
      join app_private.retention_purge_allowlist parent_allow
        on parent_allow.table_oid = parent.table_oid and parent_allow.can_delete
      join pg_catalog.pg_constraint fk on fk.confrelid = parent.table_oid and fk.contype = 'f'
      join app_private.retention_purge_allowlist child_allow
        on child_allow.table_oid = fk.conrelid and child_allow.can_delete
      where fk.conrelid <> fk.confrelid and not fk.conrelid = any(parent.path)
    ), ranks as (
      select table_oid, max(depth) as depth from paths group by table_oid
    )
    select a.table_oid,
      pg_catalog.format('%I.%I', n.nspname, c.relname) as relation_name,
      n.nspname || '.' || c.relname as evidence_key
    from app_private.retention_purge_allowlist a
    join pg_catalog.pg_class c on c.oid = a.table_oid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    left join ranks on ranks.table_oid = a.table_oid
    where a.can_delete
      and exists (select 1 from pg_temp.retention_purge_targets t where t.table_oid = a.table_oid)
    order by ranks.depth desc nulls last,
      n.nspname, c.relname
  loop
    execute pg_catalog.format(
      'delete from %s target using pg_temp.retention_purge_targets selected '
      'where selected.table_oid=$1 and selected.row_tid=target.ctid',
      target_table.relation_name
    ) using target_table.table_oid;
    get diagnostics added_rows = row_count;
    select count(*) into expected_rows
    from pg_temp.retention_purge_targets t
    where t.table_oid = target_table.table_oid;
    if added_rows::bigint <> expected_rows then
      raise exception 'retention_purge_incomplete: table % expected % rows but deleted %',
        target_table.evidence_key, expected_rows, added_rows
        using errcode = 'P0001';
    end if;
    deleted_counts := deleted_counts || jsonb_build_object(target_table.evidence_key, added_rows);
  end loop;

  v_result := jsonb_build_object(
    'status', 'applied', 'eligible_clients', eligible_count,
    'held_clients', held_count, 'inside_window_clients', inside_window_count,
    'deleted_by_table', deleted_counts, 'retained_by_table', retained_counts,
    'sources', jsonb_build_array('S70-PO-1 item 3', 'S70-R47', 'S70-PO-14'),
    'legal_basis', 'PO states Egyptian legal advice was obtained'
  );
  update app_private.retention_purge_runs
    set status = 'completed', result = v_result, completed_at = pg_catalog.clock_timestamp()
    where run_id = p_run_id;
  perform pg_catalog.set_config('app_private.retention_purge_run_id', '', true);
  return v_result;
end $$;
alter function app_private.purge_retention_apply(uuid, text) owner to postgres;
revoke all on function app_private.purge_retention_apply(uuid, text)
  from public, anon, authenticated, service_role;

drop function app_private.purge_retention_for_platform_owner();
create function app_private.purge_retention_for_platform_owner(p_run_id uuid, p_mode text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  return app_private.purge_retention_apply(p_run_id, p_mode);
end $$;
alter function app_private.purge_retention_for_platform_owner(uuid, text) owner to postgres;
revoke all on function app_private.purge_retention_for_platform_owner(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.purge_retention_for_platform_owner(uuid, text)
  to authenticated;


-- These four tables are immutable financial evidence. Remove only FK edges to
-- structures intentionally deleted by S70-PO-14; all CHECK and ledger checks remain.
alter table public.payment_events
  drop constraint payment_events_workspace_id_subscription_id_obligation_id__fkey,
  drop constraint payment_events_workspace_id_subscription_id_obligation_id_fkey3;
alter table public.refund_operations
  alter column client_id drop not null,
  drop constraint refund_operations_workspace_id_client_id_fkey,
  drop constraint refund_operations_workspace_id_subscription_id_client_id_fkey,
  drop constraint refund_operations_workspace_id_operation_id_fkey;
alter table public.refund_allocation_events
  drop constraint f13_refund_allocation_upgrade_source;
alter table public.subscription_obligation_cancellations
  drop constraint subscription_obligation_canc_workspace_id_subscription_id_fkey1;
