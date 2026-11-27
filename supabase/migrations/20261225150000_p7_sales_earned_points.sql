-- T021: map every issuance-time eligible F10 Sales unit to one durable P7 fact.

create function app_private.p7_earn_sales_productivity_unit()
returns trigger
language plpgsql set search_path = '' as $$
declare
  trigger_month date;
  fact_id uuid;
  actor uuid;
begin
  actor := auth.uid();
  if not exists (
    select 1 from public.registration_links l
    where l.workspace_id = new.workspace_id
      and l.id = new.registration_link_id
      and l.created_by = new.recipient_sales_user_id
      and l.created_by_role_snapshot = 'sales'::public.staff_role
  ) then
    return new;
  end if;

  trigger_month := app_private.p7_month_for_trigger(new.recorded_at);
  perform app_private.p7_lock_period(new.workspace_id, trigger_month);
  -- S71-R17: recheck after every period-fence wait at the last trusted point
  -- before the insert/audit. Workspace Owners also hold approve_registration,
  -- so do not restrict this to platform owners (P0 approval rollback).
  if auth.uid() is distinct from actor
    or not (auth.role() = 'service_role'
      or app_private.has_workspace_access(new.workspace_id, 'approve_registration')) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  insert into public.p7_earned_points(workspace_id, staff_user_id, points,
    effective_month, trigger_at, rule_version, source_key, source_hash)
  values (new.workspace_id, new.recipient_sales_user_id, 1.00,
    trigger_month, new.recorded_at, 'p7-sales-acquisition-v1', new.id,
    pg_catalog.md5(new.workspace_id::text || '|' || new.recipient_sales_user_id::text ||
      '|1.00|' || pg_catalog.to_char(new.recorded_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|p7-sales-acquisition-v1'))
  on conflict (workspace_id, source_key) do nothing
  returning id into fact_id;

  -- The BEFORE INSERT route trigger may take a second fence wait for closed
  -- periods; recheck again after that wait and before the audit write.
  if auth.uid() is distinct from actor
    or not (auth.role() = 'service_role'
      or app_private.has_workspace_access(new.workspace_id, 'approve_registration')) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if fact_id is not null then
    insert into public.audit_events(actor_user_id, action, target_table, target_id,
      workspace_id, details)
    values (auth.uid(), 'workforce.earned_fact_recorded', 'p7_earned_points', fact_id,
      new.workspace_id, jsonb_build_object('reference', new.id::text));
  end if;
  return new;
end
$$;
alter function app_private.p7_earn_sales_productivity_unit() owner to postgres;
revoke all on function app_private.p7_earn_sales_productivity_unit()
  from public, anon, authenticated, service_role;

create function app_private.p7_backfill_sales_productivity_units()
returns void
language plpgsql set search_path = '' as $$
declare
  source_row record;
  trigger_month date;
  fact_id uuid;
begin
  for source_row in
    select u.id, u.workspace_id, u.recipient_sales_user_id, u.recorded_at
    from public.sales_productivity_units u
    join public.registration_links l on l.workspace_id = u.workspace_id
      and l.id = u.registration_link_id
    where l.created_by = u.recipient_sales_user_id
      and l.created_by_role_snapshot = 'sales'::public.staff_role
    order by u.workspace_id, app_private.p7_month_for_trigger(u.recorded_at), u.id
    for share of u, l
  loop
    trigger_month := app_private.p7_month_for_trigger(source_row.recorded_at);
    perform app_private.p7_lock_period(source_row.workspace_id, trigger_month);
    insert into public.p7_earned_points(workspace_id, staff_user_id, points,
      effective_month, trigger_at, rule_version, source_key, source_hash)
    values (source_row.workspace_id, source_row.recipient_sales_user_id, 1.00,
      trigger_month, source_row.recorded_at, 'p7-sales-acquisition-v1', source_row.id,
      pg_catalog.md5(source_row.workspace_id::text || '|' || source_row.recipient_sales_user_id::text ||
        '|1.00|' || pg_catalog.to_char(source_row.recorded_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|p7-sales-acquisition-v1'))
    on conflict (workspace_id, source_key) do nothing
    returning id into fact_id;

    -- FR-020/workforce-rpc-api.md: one opaque audit reference per newly
    -- mapped fact, in the same transaction as the fact (atomic).
    if fact_id is not null then
      insert into public.audit_events(actor_user_id, action, target_table, target_id,
        workspace_id, details)
      values (null, 'workforce.earned_fact_recorded', 'p7_earned_points', fact_id,
        source_row.workspace_id,
        jsonb_build_object('reference', 'p7-sales-backfill:' || source_row.id::text));
    end if;
  end loop;
end
$$;
alter function app_private.p7_backfill_sales_productivity_units() owner to postgres;
revoke all on function app_private.p7_backfill_sales_productivity_units()
  from public, anon, authenticated, service_role;

create trigger p7_earn_sales_productivity_unit_after_insert
  after insert on public.sales_productivity_units
  for each row execute function app_private.p7_earn_sales_productivity_unit();

select app_private.p7_backfill_sales_productivity_units();

comment on function app_private.p7_earn_sales_productivity_unit() is
  'Maps one issuance-time Sales F10 unit to one immutable, non-PII P7 earned fact.';
comment on function app_private.p7_backfill_sales_productivity_units() is
  'Idempotently maps all eligible pre-P7 F10 Sales units to durable P7 earned facts.';
