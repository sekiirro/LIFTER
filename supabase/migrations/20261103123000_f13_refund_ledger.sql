-- F13 partial refund aggregate ledger. Corrections remain on F12 payment_events.
create table public.refund_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  subscription_id uuid not null,
  operation_id uuid not null,
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  amount_minor bigint not null check(amount_minor>0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  effective_on date not null check(isfinite(effective_on)),
  expected_revision integer not null check(expected_revision>=0),
  recorded_at timestamptz not null default clock_timestamp() check(isfinite(recorded_at)),
  unique(workspace_id,id),
  unique(workspace_id,subscription_id,id),
  unique(workspace_id,operation_id),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(workspace_id,subscription_id,client_id) references public.subscriptions(workspace_id,id,client_id) on delete restrict,
  foreign key(workspace_id,operation_id) references app_private.registration_operations(workspace_id,id) on delete restrict deferrable initially deferred
);

create table public.refund_allocation_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  subscription_id uuid not null,
  obligation_id uuid not null,
  refund_operation_id uuid not null,
  source_collection_event_id uuid not null,
  amount_minor bigint not null check(amount_minor<0),
  commission_minor bigint not null check(commission_minor<=0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  effective_on date not null check(isfinite(effective_on)),
  recorded_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp() check(isfinite(recorded_at)),
  unique(workspace_id,id),
  foreign key(workspace_id,subscription_id,refund_operation_id)
    references public.refund_operations(workspace_id,subscription_id,id) on delete restrict deferrable initially deferred,
  foreign key(workspace_id,subscription_id,obligation_id,source_collection_event_id)
    references public.payment_events(workspace_id,subscription_id,obligation_id,id) on delete restrict
);

create table public.subscription_obligation_cancellations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  subscription_id uuid not null,
  obligation_id uuid not null,
  refund_operation_id uuid not null,
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  effective_on date not null check(isfinite(effective_on)),
  recorded_at timestamptz not null default clock_timestamp() check(isfinite(recorded_at)),
  unique(workspace_id,id),
  unique(workspace_id,obligation_id),
  foreign key(workspace_id,subscription_id,refund_operation_id)
    references public.refund_operations(workspace_id,subscription_id,id) on delete restrict deferrable initially deferred,
  foreign key(workspace_id,subscription_id,obligation_id)
    references public.subscription_installments(workspace_id,subscription_id,id) on delete restrict
);

create index f13_refund_allocation_operation_source_lookup
  on public.refund_allocation_events(workspace_id,refund_operation_id,source_collection_event_id);
create unique index f13_refund_allocation_operation_source
  on public.refund_allocation_events(workspace_id,refund_operation_id,source_collection_event_id);
create index f13_refund_allocation_source
  on public.refund_allocation_events(workspace_id,subscription_id,source_collection_event_id);
create index f13_refund_operation_purchase
  on public.refund_operations(workspace_id,subscription_id,effective_on);

create function app_private.f13_validate_refund_ledger(ws uuid,sid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.refund_operations r
    left join public.refund_allocation_events a
      on a.workspace_id=r.workspace_id and a.subscription_id=r.subscription_id and a.refund_operation_id=r.id
    where r.workspace_id=ws and r.subscription_id=sid
    group by r.id,r.amount_minor
    having coalesce(sum(-a.amount_minor),0)<>r.amount_minor
  ) then
    raise exception 'refund_aggregate_mismatch' using errcode='23514';
  end if;
  if exists (
    select 1
    from public.refund_allocation_events a
    join public.payment_events source
      on source.workspace_id=a.workspace_id and source.subscription_id=a.subscription_id
      and source.obligation_id=a.obligation_id and source.id=a.source_collection_event_id
    left join public.payment_events correction
      on correction.workspace_id=source.workspace_id and correction.reverses_event_id=source.id
    where a.workspace_id=ws and a.subscription_id=sid
      and (source.kind<>'collection' or correction.id is not null or a.currency<>source.currency
        or -a.amount_minor>source.amount_minor or -a.commission_minor>source.commission_minor)
  ) then
    raise exception 'invalid_refund_source' using errcode='23514';
  end if;
  if exists (
    select 1
    from public.refund_allocation_events a
    join public.payment_events source
      on source.workspace_id=a.workspace_id and source.subscription_id=a.subscription_id and source.id=a.source_collection_event_id
    left join public.payment_events correction
      on correction.workspace_id=source.workspace_id and correction.reverses_event_id=source.id
    where a.workspace_id=ws and a.subscription_id=sid
    group by a.source_collection_event_id,source.amount_minor,source.commission_minor
    having sum(-a.amount_minor)>source.amount_minor
      or sum(-a.commission_minor)>source.commission_minor
  ) then
    raise exception 'refund_source_cap_exceeded' using errcode='23514';
  end if;
  if exists (
    select 1 from public.refund_allocation_events a
    where a.workspace_id=ws and a.subscription_id=sid
    group by a.workspace_id,a.subscription_id
    having sum(-a.amount_minor) > (
      select coalesce(sum(source.amount_minor),0)
      from public.payment_events source
      where source.workspace_id=ws and source.subscription_id=sid and source.kind='collection'
        and not exists (select 1 from public.payment_events correction
          where correction.workspace_id=source.workspace_id and correction.reverses_event_id=source.id)
    )
  ) then
    raise exception 'refund_purchase_cap_exceeded' using errcode='23514';
  end if;
  if exists (
    with portions as (
      select a.*,source.amount_minor as source_amount,source.commission_minor as source_commission,
        sum(-a.amount_minor) over (partition by a.source_collection_event_id order by a.recorded_at,a.id) as total_after,
        coalesce(sum(-a.amount_minor) over (partition by a.source_collection_event_id order by a.recorded_at,a.id
          rows between unbounded preceding and 1 preceding),0) as total_before
      from public.refund_allocation_events a
      join public.payment_events source on source.workspace_id=a.workspace_id and source.id=a.source_collection_event_id
      where a.workspace_id=ws and a.subscription_id=sid
    )
    select 1 from portions p where -p.commission_minor <>
        div(2::numeric*p.source_commission*p.total_after+p.source_amount,2::numeric*p.source_amount)
        - div(2::numeric*p.source_commission*p.total_before+p.source_amount,2::numeric*p.source_amount)
  ) then
    raise exception 'refund_commission_allocation_mismatch' using errcode='23514';
  end if;
  if exists (
    select 1
    from public.subscription_obligation_cancellations c
    join public.subscription_installments i on i.workspace_id=c.workspace_id
      and i.subscription_id=c.subscription_id and i.id=c.obligation_id
    join public.payment_events e on e.workspace_id=c.workspace_id and e.subscription_id=c.subscription_id
      and e.obligation_id=c.obligation_id
    where c.workspace_id=ws and c.subscription_id=sid
      and e.kind='collection' and not exists (
        select 1 from public.payment_events correction
        where correction.workspace_id=e.workspace_id and correction.reverses_event_id=e.id
      )
  ) then
    raise exception 'cannot_cancel_collected_obligation' using errcode='23514';
  end if;
  if exists (
    select 1 from public.refund_operations r
    join public.refund_allocation_events a
      on a.workspace_id=r.workspace_id and a.subscription_id=r.subscription_id and a.refund_operation_id=r.id
    join public.payment_events source on source.workspace_id=a.workspace_id and source.id=a.source_collection_event_id
    where r.workspace_id=ws and r.subscription_id=sid and source.currency<>r.currency
  ) then
    raise exception 'refund_currency_mismatch' using errcode='23514';
  end if;
end $$;

create function app_private.f13_check_refund_ledger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.f13_validate_refund_ledger(new.workspace_id,new.subscription_id);
  return new;
end $$;

create function app_private.f13_guard_terminal_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.refund_operations r
    where r.workspace_id=new.workspace_id and r.subscription_id=new.subscription_id
  ) then
    raise exception 'terminal_refund_purchase' using errcode='23514';
  end if;
  if exists(select 1 from public.subscription_obligation_cancellations c
    where c.workspace_id=new.workspace_id and c.subscription_id=new.subscription_id and c.obligation_id=new.obligation_id) then
    raise exception 'cancelled_obligation' using errcode='23514';
  end if;
  return new;
end $$;

create trigger f13_terminal_payment_guard before insert on public.payment_events
  for each row execute function app_private.f13_guard_terminal_payment();
create constraint trigger f13_refund_header_integrity after insert on public.refund_operations
  deferrable initially deferred for each row execute function app_private.f13_check_refund_ledger();
create constraint trigger f13_refund_allocation_integrity after insert on public.refund_allocation_events
  deferrable initially deferred for each row execute function app_private.f13_check_refund_ledger();
create constraint trigger f13_obligation_cancellation_integrity after insert on public.subscription_obligation_cancellations
  deferrable initially deferred for each row execute function app_private.f13_check_refund_ledger();

create function app_private.f13_audit_refund_ledger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare action_name text; target uuid; ws uuid; details jsonb;
begin
  ws:=new.workspace_id; target:=new.id;
  action_name:=case tg_table_name
    when 'refund_operations' then 'payment.refund_recorded'
    when 'refund_allocation_events' then 'payment.refund_allocated'
    else 'payment.obligation_cancelled' end;
  details:=jsonb_build_object('subscription_id',new.subscription_id,'effective_on',new.effective_on);
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(auth.uid(),action_name,tg_table_name,target,ws,details);
  return new;
end $$;

create trigger f13_refund_operation_audit after insert on public.refund_operations
  for each row execute function app_private.f13_audit_refund_ledger();
create trigger f13_refund_allocation_audit after insert on public.refund_allocation_events
  for each row execute function app_private.f13_audit_refund_ledger();
create trigger f13_obligation_cancellation_audit after insert on public.subscription_obligation_cancellations
  for each row execute function app_private.f13_audit_refund_ledger();

do $$
declare t text;
begin
  foreach t in array array['public.refund_operations','public.refund_allocation_events','public.subscription_obligation_cancellations'] loop
    execute format('alter table %s owner to postgres',t);
    execute format('revoke all on %s from public,anon,authenticated,service_role',t);
    execute format('alter table %s enable row level security',t);
    execute format('alter table %s force row level security',t);
    execute format('create trigger f13_no_update before update on %s for each row execute function app_private.audit_events_immutable()',t);
    execute format('create trigger f13_no_delete before delete on %s for each row execute function app_private.forbid_delete()',t);
    execute format('create trigger f13_no_truncate before truncate on %s for each statement execute function app_private.forbid_delete()',t);
  end loop;
end $$;

alter function app_private.f13_validate_refund_ledger(uuid,uuid) owner to postgres;
alter function app_private.f13_check_refund_ledger() owner to postgres;
alter function app_private.f13_guard_terminal_payment() owner to postgres;
alter function app_private.f13_audit_refund_ledger() owner to postgres;
revoke all on function app_private.f13_validate_refund_ledger(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.f13_check_refund_ledger() from public,anon,authenticated,service_role;
revoke all on function app_private.f13_guard_terminal_payment() from public,anon,authenticated,service_role;
revoke all on function app_private.f13_audit_refund_ledger() from public,anon,authenticated,service_role;
