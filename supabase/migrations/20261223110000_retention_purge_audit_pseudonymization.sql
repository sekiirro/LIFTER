-- T014 / FR-011: preserve expired audit evidence without retaining client paths.
-- The audit table is an explicit update-only target for the active purge run;
-- it is not added to the client FK traversal or delete allowlist.
insert into app_private.retention_purge_allowlist
  (table_oid,can_delete,can_update,traverse)
values ('public.audit_events'::regclass,false,true,false)
on conflict (table_oid) do update
set can_delete = false, can_update = true, traverse = false;

-- A cleared transaction-local GUC is an empty string. Convert only a valid
-- UUID before casting so ordinary guarded mutations still reach their normal
-- immutability error after an apply call.
create or replace function app_private.retention_purge_context_allows(
  p_table_oid oid,
  p_operation text
) returns boolean
language sql stable security definer set search_path = '' as $$
  select current_user = 'postgres'
    and exists (
      select 1 from app_private.retention_purge_runs r
      where r.run_id = case
        when nullif(current_setting('app_private.retention_purge_run_id',true),'')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then nullif(current_setting('app_private.retention_purge_run_id',true),'')::uuid
        else null::uuid
      end
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
alter function app_private.retention_purge_context_allows(oid,text) owner to postgres;
revoke all on function app_private.retention_purge_context_allows(oid,text)
  from public,anon,authenticated,service_role;
grant execute on function app_private.retention_purge_context_allows(oid,text) to public;

create function app_private.retention_purge_audit_context_allows(
  p_table_oid oid,
  p_operation text
) returns boolean
language sql stable security invoker set search_path = '' as $$
  select p_table_oid = 'public.audit_events'::regclass::oid
    and p_operation = 'UPDATE'
    and app_private.retention_purge_context_allows(p_table_oid,p_operation)
    and current_setting('app_private.retention_purge_audit_run_id',true)
      = current_setting('app_private.retention_purge_run_id',true)
$$;
alter function app_private.retention_purge_audit_context_allows(oid,text) owner to postgres;
revoke all on function app_private.retention_purge_audit_context_allows(oid,text)
  from public,anon,authenticated,service_role;
grant execute on function app_private.retention_purge_audit_context_allows(oid,text) to public;

-- Keep the existing F15 erasure exception and the T012 refund_operations
-- pseudonymization exception byte-for-byte in behavior. Audit UPDATE is the
-- only new operation that can pass, and only for the exact sanitized shape.
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
  if tg_op = 'UPDATE'
    and tg_table_schema = 'public'
    and tg_table_name = 'audit_events'
    and app_private.retention_purge_audit_context_allows(tg_relid,'UPDATE') then
    if current_user = 'postgres'
      and new.id = old.id
      and new.occurred_at = old.occurred_at
      and new.actor_user_id is null
      and new.action = old.action
      and new.target_table = 'retention_purged'
      and new.target_id is distinct from old.target_id
      and new.workspace_id is null
      and new.details = '{}'::jsonb then
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
revoke all on function app_private.audit_events_immutable() from public,anon,authenticated,service_role;

create function app_private.purge_retention_pseudonymize_audit(
  p_run_id uuid,
  p_sampled_at timestamptz
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  expected_rows bigint;
  changed_rows bigint;
begin
  if current_user <> 'postgres'
    or p_run_id is null
    or p_sampled_at is null
    or current_setting('app_private.retention_purge_run_id',true) is distinct from p_run_id::text
    or not exists (
      select 1 from app_private.retention_purge_runs r
      where r.run_id = p_run_id and r.status = 'running'
    ) then
    raise exception 'retention_purge_audit_context_required' using errcode = '42501';
  end if;

  select count(*) into expected_rows
  from public.audit_events a
  where a.occurred_at <= p_sampled_at - interval '30 days'
    and (a.actor_user_id is not null or a.target_table <> 'retention_purged'
      or a.workspace_id is not null or a.details <> '{}'::jsonb);

  perform pg_catalog.set_config('app_private.retention_purge_audit_run_id',p_run_id::text,true);
  update public.audit_events a
  set actor_user_id = null,
      target_table = 'retention_purged',
      target_id = pg_catalog.gen_random_uuid(),
      workspace_id = null,
      details = '{}'::jsonb
  where a.occurred_at <= p_sampled_at - interval '30 days'
    and (a.actor_user_id is not null or a.target_table <> 'retention_purged'
      or a.workspace_id is not null or a.details <> '{}'::jsonb);
  get diagnostics changed_rows = row_count;

  if changed_rows <> expected_rows then
    raise exception 'retention_purge_incomplete: audit_events expected % rows but pseudonymized %',
      expected_rows,changed_rows using errcode = 'P0001';
  end if;
  perform pg_catalog.set_config('app_private.retention_purge_audit_run_id','',true);
  return changed_rows;
end $$;
alter function app_private.purge_retention_pseudonymize_audit(uuid,timestamptz) owner to postgres;
revoke all on function app_private.purge_retention_pseudonymize_audit(uuid,timestamptz)
  from public,anon,authenticated,service_role;

-- Keep the merged T012 implementation intact as the non-audit core. This
-- wrapper runs it and audit pseudonymization in one transaction, then records
-- the counts in the existing counts-only run evidence.
alter function app_private.purge_retention_apply(uuid,text)
  rename to purge_retention_apply_non_audit;

create function app_private.purge_retention_apply(p_run_id uuid,p_mode text)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  prior_status text;
  v_result jsonb;
  audit_rows bigint;
  reopened_rows integer;
  sampled_at timestamptz := pg_catalog.clock_timestamp();
begin
  if current_user <> 'postgres' then
    raise exception 'purge_schedule_owner_required' using errcode = '42501';
  end if;
  select r.status into prior_status
  from app_private.retention_purge_runs r where r.run_id = p_run_id;

  v_result := app_private.purge_retention_apply_non_audit(p_run_id,p_mode);
  if p_mode <> 'apply' or v_result->>'status' <> 'applied' or prior_status = 'completed' then
    return v_result;
  end if;

  update app_private.retention_purge_runs
  set status = 'running',result = null,completed_at = null
  where run_id = p_run_id and status = 'completed';
  get diagnostics reopened_rows = row_count;
  if reopened_rows <> 1 then
    raise exception 'retention_purge_run_state_changed' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('app_private.retention_purge_run_id',p_run_id::text,true);
  audit_rows := app_private.purge_retention_pseudonymize_audit(p_run_id,sampled_at);
  v_result := v_result || pg_catalog.jsonb_build_object('pseudonymized_audit_events',audit_rows);
  update app_private.retention_purge_runs
  set status = 'completed',result = v_result,
      completed_at = pg_catalog.clock_timestamp()
  where run_id = p_run_id and status = 'running';
  perform pg_catalog.set_config('app_private.retention_purge_run_id','',true);
  return v_result;
end $$;
alter function app_private.purge_retention_apply(uuid,text) owner to postgres;
revoke all on function app_private.purge_retention_apply(uuid,text)
  from public,anon,authenticated,service_role;
