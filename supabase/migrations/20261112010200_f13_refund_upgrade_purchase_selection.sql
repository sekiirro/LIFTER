-- F13 T045: include immutable upgrade charges in the selected package refund basis.
-- FR-042 / SC-031; preserve F12 payment rows and exclude separately paid renewals.

create unique index f13_subscription_upgrades_refund_source
  on public.subscription_upgrades(workspace_id,subscription_id,id);

alter table public.refund_allocation_events
  add column source_upgrade_id uuid;
alter table public.refund_allocation_events alter column source_collection_event_id drop not null;
alter table public.refund_allocation_events alter column obligation_id drop not null;

do $$ declare c record; begin
  for c in select conname from pg_constraint
    where conrelid='public.refund_allocation_events'::regclass and contype='f'
      and pg_get_constraintdef(oid) like 'FOREIGN KEY (workspace_id, subscription_id, obligation_id, source_collection_event_id)%'
  loop execute format('alter table public.refund_allocation_events drop constraint %I',c.conname); end loop;
end $$;

alter table public.refund_allocation_events
  add constraint f13_refund_allocation_source_xor check (
    (source_collection_event_id is not null and source_upgrade_id is null and obligation_id is not null)
    or (source_collection_event_id is null and source_upgrade_id is not null and obligation_id is null)
  ),
  add constraint f13_refund_allocation_payment_source foreign key(workspace_id,subscription_id,obligation_id,source_collection_event_id)
    references public.payment_events(workspace_id,subscription_id,obligation_id,id) on delete restrict,
  add constraint f13_refund_allocation_upgrade_source foreign key(workspace_id,subscription_id,source_upgrade_id)
    references public.subscription_upgrades(workspace_id,subscription_id,id) on delete restrict;

drop index f13_refund_allocation_operation_source;
create unique index f13_refund_allocation_operation_source
  on public.refund_allocation_events(workspace_id,refund_operation_id,source_collection_event_id)
  where source_collection_event_id is not null;
create unique index f13_refund_allocation_operation_upgrade_source
  on public.refund_allocation_events(workspace_id,refund_operation_id,source_upgrade_id)
  where source_upgrade_id is not null;

create or replace function app_private.f13_validate_refund_ledger(ws uuid,sid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.refund_operations r
    left join public.refund_allocation_events a
      on a.workspace_id=r.workspace_id and a.subscription_id=r.subscription_id and a.refund_operation_id=r.id
    where r.workspace_id=ws and r.subscription_id=sid
    group by r.id,r.amount_minor
    having coalesce(sum(-a.amount_minor),0)<>r.amount_minor
  ) then raise exception 'refund_aggregate_mismatch' using errcode='23514'; end if;

  if exists (
    select 1 from public.refund_allocation_events a
    join public.payment_events source on source.workspace_id=a.workspace_id and source.subscription_id=a.subscription_id
      and source.obligation_id=a.obligation_id and source.id=a.source_collection_event_id
    left join public.payment_events correction on correction.workspace_id=source.workspace_id and correction.reverses_event_id=source.id
    where a.workspace_id=ws and a.subscription_id=sid and a.source_collection_event_id is not null
      and (source.kind<>'collection' or correction.id is not null or a.currency<>source.currency
        or -a.amount_minor>source.amount_minor or -a.commission_minor>source.commission_minor)
  ) or exists (
    select 1 from public.refund_allocation_events a
    join public.subscription_upgrades source on source.workspace_id=a.workspace_id
      and source.subscription_id=a.subscription_id and source.id=a.source_upgrade_id
    where a.workspace_id=ws and a.subscription_id=sid and a.source_upgrade_id is not null
      and (source.additional_payment_minor<=0 or a.obligation_id is not null or a.currency<>source.currency
        or -a.amount_minor>source.additional_payment_minor or -a.commission_minor>source.commission_minor)
  ) then raise exception 'invalid_refund_source' using errcode='23514'; end if;

  if exists (
    select 1 from public.refund_allocation_events a
    join public.payment_events source on source.workspace_id=a.workspace_id and source.id=a.source_collection_event_id
    where a.workspace_id=ws and a.subscription_id=sid
    group by a.source_collection_event_id,source.amount_minor,source.commission_minor
    having sum(-a.amount_minor)>source.amount_minor or sum(-a.commission_minor)>source.commission_minor
  ) or exists (
    select 1 from public.refund_allocation_events a
    join public.subscription_upgrades source on source.workspace_id=a.workspace_id and source.id=a.source_upgrade_id
    where a.workspace_id=ws and a.subscription_id=sid
    group by a.source_upgrade_id,source.additional_payment_minor,source.commission_minor
    having sum(-a.amount_minor)>source.additional_payment_minor or sum(-a.commission_minor)>source.commission_minor
  ) then raise exception 'refund_source_cap_exceeded' using errcode='23514'; end if;

  if exists (
    select 1 from public.refund_allocation_events a
    where a.workspace_id=ws and a.subscription_id=sid
    group by a.workspace_id,a.subscription_id
    having sum(-a.amount_minor) > (
      select coalesce(sum(source.amount_minor),0)
      from public.payment_events source
      where source.workspace_id=ws and source.subscription_id=sid and source.kind='collection'
        and not exists(select 1 from public.payment_events correction
          where correction.workspace_id=source.workspace_id and correction.reverses_event_id=source.id)
    ) + (
      select coalesce(sum(u.additional_payment_minor),0) from public.subscription_upgrades u
      where u.workspace_id=ws and u.subscription_id=sid
    )
  ) then raise exception 'refund_purchase_cap_exceeded' using errcode='23514'; end if;

  if exists (
    with sources as (
      select 'collection:'||source.id::text as source_key,source.amount_minor,source.commission_minor
      from public.payment_events source
      where source.workspace_id=ws and source.subscription_id=sid and source.kind='collection'
        and not exists(select 1 from public.payment_events correction
          where correction.workspace_id=source.workspace_id and correction.reverses_event_id=source.id)
      union all
      select 'upgrade:'||u.id::text,u.additional_payment_minor,u.commission_minor
      from public.subscription_upgrades u
      where u.workspace_id=ws and u.subscription_id=sid and u.additional_payment_minor>0
    ), portions as (
      select a.*,source.amount_minor as source_amount,source.commission_minor as source_commission,
        sum(-a.amount_minor) over (partition by source.source_key order by a.recorded_at,a.id) as total_after,
        coalesce(sum(-a.amount_minor) over (partition by source.source_key order by a.recorded_at,a.id
          rows between unbounded preceding and 1 preceding),0) as total_before
      from public.refund_allocation_events a
      join sources source on source.source_key=case when a.source_collection_event_id is not null
        then 'collection:'||a.source_collection_event_id::text else 'upgrade:'||a.source_upgrade_id::text end
      where a.workspace_id=ws and a.subscription_id=sid
    ) select 1 from portions p where -p.commission_minor <>
      div(2::numeric*p.source_commission*p.total_after+p.source_amount,2::numeric*p.source_amount)
      -div(2::numeric*p.source_commission*p.total_before+p.source_amount,2::numeric*p.source_amount)
  ) then raise exception 'refund_commission_allocation_mismatch' using errcode='23514'; end if;

  if exists (
    select 1 from public.subscription_obligation_cancellations c
    join public.subscription_installments i on i.workspace_id=c.workspace_id
      and i.subscription_id=c.subscription_id and i.id=c.obligation_id
    join public.payment_events e on e.workspace_id=c.workspace_id and e.subscription_id=c.subscription_id
      and e.obligation_id=c.obligation_id
    where c.workspace_id=ws and c.subscription_id=sid and e.kind='collection'
      and not exists(select 1 from public.payment_events correction
        where correction.workspace_id=e.workspace_id and correction.reverses_event_id=e.id)
  ) then raise exception 'cannot_cancel_collected_obligation' using errcode='23514'; end if;

  if exists (
    select 1 from public.refund_operations r
    join public.refund_allocation_events a on a.workspace_id=r.workspace_id
      and a.subscription_id=r.subscription_id and a.refund_operation_id=r.id
    left join public.payment_events payment_source on payment_source.workspace_id=a.workspace_id
      and payment_source.id=a.source_collection_event_id
    left join public.subscription_upgrades upgrade_source on upgrade_source.workspace_id=a.workspace_id
      and upgrade_source.subscription_id=a.subscription_id and upgrade_source.id=a.source_upgrade_id
    where r.workspace_id=ws and r.subscription_id=sid
      and coalesce(payment_source.currency,upgrade_source.currency)<>r.currency
  ) then raise exception 'refund_currency_mismatch' using errcode='23514'; end if;
end $$;
alter function app_private.f13_validate_refund_ledger(uuid,uuid) owner to postgres;
revoke all on function app_private.f13_validate_refund_ledger(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.record_refund(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
<<refund_fn>>
declare
  ws uuid; cid uuid; sid uuid; key uuid; requested bigint; requested_revision integer; canonical jsonb; binding bytea;
  c public.clients%rowtype; s public.subscriptions%rowtype; previous app_private.registration_operations%rowtype;
  source record; operation_id uuid; refund_id uuid; sampled timestamptz; effective date;
  available numeric; remaining numeric; residual numeric; principal numeric; commission_before numeric;
  commission_after numeric; commission_delta numeric; revision_count integer; receipt jsonb; result jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('status','not_permitted'); end if;
  if jsonb_typeof(request) is distinct from 'object'
    or jsonb_typeof(request->'workspace_id') is distinct from 'string'
    or coalesce((request->>'workspace_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',true) then
    return jsonb_build_object('status','not_permitted');
  end if;
  ws:=(request->>'workspace_id')::uuid;
  if not app_private.f13_actor_preflight(ws,'record_refund',true) then
    return jsonb_build_object('status','not_permitted');
  end if;
  if jsonb_typeof(request) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(request)) not in (6,7)
    or exists(select 1 from jsonb_object_keys(request) k where k not in
      ('workspace_id','client_id','purchase_id','request_key','amount_minor','external_confirmation','expected_revision'))
    or jsonb_typeof(request->'workspace_id') is distinct from 'string'
    or jsonb_typeof(request->'client_id') is distinct from 'string'
    or jsonb_typeof(request->'purchase_id') is distinct from 'string'
    or jsonb_typeof(request->'request_key') is distinct from 'string'
    or jsonb_typeof(request->'amount_minor') is distinct from 'string'
    or jsonb_typeof(request->'external_confirmation') is distinct from 'boolean'
    or (request->>'workspace_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'client_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'purchase_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'request_key') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'amount_minor') !~ '^[1-9][0-9]{0,17}$'
    or (request ? 'expected_revision' and
      (jsonb_typeof(request->'expected_revision') is distinct from 'number'
        or (request->>'expected_revision') !~ '^(0|[1-9][0-9]{0,8})$')) then
    return jsonb_build_object('status','invalid_input');
  end if;
  if request->'external_confirmation'<>'true'::jsonb then
    return jsonb_build_object('status','invalid_input');
  end if;
  ws:=(request->>'workspace_id')::uuid; cid:=(request->>'client_id')::uuid;
  sid:=(request->>'purchase_id')::uuid; key:=(request->>'request_key')::uuid;
  requested:=(request->>'amount_minor')::bigint;
  if request ? 'expected_revision' then
    requested_revision:=(request->>'expected_revision')::integer;
  end if;
  -- Shared F12 order: client -> subscription -> obligations -> payment ledger.
  select * into c from public.clients x where x.workspace_id=ws and x.id=cid for update;
  if not found then return jsonb_build_object('status','not_permitted'); end if;
  select * into s from public.subscriptions x
    where x.workspace_id=ws and x.client_id=cid and x.id=sid for update;
  if not found then return jsonb_build_object('status','not_permitted'); end if;
  perform i.id from public.subscription_installments i
    where i.workspace_id=ws and i.subscription_id=sid order by i.seq,i.id for update;
  perform e.id from public.payment_events e
    where e.workspace_id=ws and e.subscription_id=sid order by e.obligation_id,e.revision for update;
  perform u.id from public.subscription_upgrades u
    where u.workspace_id=ws and u.subscription_id=sid order by u.expected_revision,u.id for update;
  if not app_private.f12_actor_allowed(ws,'record_refund',true) then
    return jsonb_build_object('status','not_permitted');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lifter.f12.operation:'||auth.uid()::text||':'||key::text,0));
  if not app_private.f12_actor_allowed(ws,'record_refund',true) then
    return jsonb_build_object('status','not_permitted');
  end if;

  sampled:=clock_timestamp(); effective:=(sampled at time zone 'Africa/Cairo')::date;
  canonical:=jsonb_build_array(1,'refund',ws::text,cid::text,sid::text,requested::text,s.currency,true,requested_revision);
  binding:=extensions.digest(convert_to(canonical::text,'UTF8'),'sha256');
  select * into previous from app_private.registration_operations o
    where o.actor_user_id=auth.uid() and o.request_key=key;
  if found then
    if previous.canonical_version<>1 or previous.workspace_id<>ws or previous.client_id<>cid
      or previous.operation<>'refund' or previous.subscription_id<>sid
      or previous.canonical_args_hash is distinct from binding then
      return jsonb_build_object('status','key_conflict');
    end if;
    set constraints all immediate;
    return previous.result_receipt;
  end if;

  select count(*)::integer into revision_count from public.payment_events e
    where e.workspace_id=ws and e.subscription_id=sid;
  if requested_revision is not null and requested_revision<>revision_count then
    return jsonb_build_object('status','stale_state');
  end if;
  select coalesce(sum(greatest(eligible.amount_minor-eligible.refunded_minor,0)),0)
    into available from (
      select payment_source.amount_minor,
        coalesce((select sum(-a.amount_minor) from public.refund_allocation_events a
          where a.workspace_id=payment_source.workspace_id and a.subscription_id=payment_source.subscription_id
            and a.source_collection_event_id=payment_source.id),0) as refunded_minor
      from public.payment_events payment_source
      join public.subscription_installments purchase_obligation on purchase_obligation.workspace_id=payment_source.workspace_id
        and purchase_obligation.subscription_id=payment_source.subscription_id and purchase_obligation.id=payment_source.obligation_id
      where payment_source.workspace_id=ws and payment_source.subscription_id=sid and payment_source.kind='collection'
        and purchase_obligation.renewal_id is null
        and not exists(select 1 from public.payment_events correction
          where correction.workspace_id=payment_source.workspace_id and correction.reverses_event_id=payment_source.id)
      union all
      select upgrade_source.additional_payment_minor,
        coalesce((select sum(-a.amount_minor) from public.refund_allocation_events a
          where a.workspace_id=upgrade_source.workspace_id and a.subscription_id=upgrade_source.subscription_id
            and a.source_upgrade_id=upgrade_source.id),0)
      from public.subscription_upgrades upgrade_source
      where upgrade_source.workspace_id=ws and upgrade_source.subscription_id=sid
        and upgrade_source.additional_payment_minor>0
    ) eligible;
  if requested::numeric>available then return jsonb_build_object('status','invalid_input'); end if;

  operation_id:=gen_random_uuid(); refund_id:=gen_random_uuid(); remaining:=requested;
  receipt:=jsonb_build_object('operation_id',operation_id,'workspace_id',ws,'client_id',cid,
    'purchase_id',sid,'amount_minor',requested::text,'currency',s.currency);
  result:=jsonb_build_object('status','ok','receipt',receipt);

  set constraints all deferred;
  insert into app_private.registration_operations(id,workspace_id,actor_user_id,request_key,operation,
    client_id,subscription_id,expected_revision,canonical_args_hash,result_receipt,recorded_at)
  values(operation_id,ws,auth.uid(),key,'refund',cid,sid,revision_count,binding,result,sampled);
  insert into public.refund_operations(id,workspace_id,client_id,subscription_id,operation_id,
    actor_user_id,amount_minor,currency,effective_on,expected_revision,recorded_at)
  values(refund_id,ws,cid,sid,operation_id,auth.uid(),requested,s.currency,effective,revision_count,sampled);

  for source in
    select eligible.* from (
      select e.id as source_collection_event_id,null::uuid as source_upgrade_id,e.obligation_id,
        e.amount_minor,e.commission_minor,e.currency,e.collected_on as source_time,i.seq as source_seq,
        coalesce((select sum(-a.amount_minor) from public.refund_allocation_events a
          where a.workspace_id=e.workspace_id and a.subscription_id=e.subscription_id
            and a.source_collection_event_id=e.id),0) as refunded_minor,
        coalesce((select sum(-a.commission_minor) from public.refund_allocation_events a
          where a.workspace_id=e.workspace_id and a.subscription_id=e.subscription_id
            and a.source_collection_event_id=e.id),0) as commission_refunded
      from public.payment_events e
      join public.subscription_installments i on i.workspace_id=e.workspace_id
        and i.subscription_id=e.subscription_id and i.id=e.obligation_id
      where e.workspace_id=ws and e.subscription_id=sid and e.kind='collection' and i.renewal_id is null
        and not exists(select 1 from public.payment_events correction
          where correction.workspace_id=e.workspace_id and correction.reverses_event_id=e.id)
      union all
      select null::uuid,u.id as source_upgrade_id,null::uuid as obligation_id,
        u.additional_payment_minor as amount_minor,u.commission_minor,u.currency,u.recorded_at as source_time,
        2147483647 as source_seq,
        coalesce((select sum(-a.amount_minor) from public.refund_allocation_events a
          where a.workspace_id=u.workspace_id and a.subscription_id=u.subscription_id
            and a.source_upgrade_id=u.id),0) as refunded_minor,
        coalesce((select sum(-a.commission_minor) from public.refund_allocation_events a
          where a.workspace_id=u.workspace_id and a.subscription_id=u.subscription_id
            and a.source_upgrade_id=u.id),0) as commission_refunded
      from public.subscription_upgrades u
      where u.workspace_id=ws and u.subscription_id=sid and u.additional_payment_minor>0
    ) eligible
    order by eligible.source_time,eligible.source_seq,coalesce(eligible.source_collection_event_id,eligible.source_upgrade_id)
  loop
    residual:=source.amount_minor-source.refunded_minor;
    if residual<=0 then continue; end if;
    principal:=least(remaining,residual);
    commission_before:=div(2::numeric*source.commission_minor*source.refunded_minor+source.amount_minor,
      2::numeric*source.amount_minor);
    commission_after:=div(2::numeric*source.commission_minor*(source.refunded_minor+principal)+source.amount_minor,
      2::numeric*source.amount_minor);
    commission_delta:=commission_after-commission_before;
    insert into public.refund_allocation_events(workspace_id,subscription_id,obligation_id,
      refund_operation_id,source_collection_event_id,source_upgrade_id,amount_minor,commission_minor,currency,
      effective_on,recorded_by,recorded_at)
    values(ws,sid,source.obligation_id,refund_id,source.source_collection_event_id,source.source_upgrade_id,
      -principal,-commission_delta,source.currency,effective,auth.uid(),sampled);
    remaining:=remaining-principal;
    exit when remaining=0;
  end loop;
  if remaining<>0 then raise exception 'refund_balance_changed' using errcode='40001'; end if;

  insert into public.subscription_obligation_cancellations(workspace_id,subscription_id,
    obligation_id,refund_operation_id,actor_user_id,effective_on,recorded_at)
  select refund_fn.ws as workspace_id,refund_fn.sid as subscription_id,
    i.id as obligation_id,refund_fn.refund_id as refund_operation_id,
    auth.uid() as actor_user_id,refund_fn.effective as effective_on,
    refund_fn.sampled as recorded_at
  from public.subscription_installments i
  where i.workspace_id=refund_fn.ws and i.subscription_id=refund_fn.sid and i.renewal_id is null
    and not exists(select 1 from public.payment_events e
      where e.workspace_id=i.workspace_id and e.subscription_id=i.subscription_id
        and e.obligation_id=i.id and e.kind='collection'
        and not exists(select 1 from public.payment_events correction
          where correction.workspace_id=e.workspace_id and correction.reverses_event_id=e.id))
    and not exists(select 1 from public.subscription_obligation_cancellations existing_cancellation
      where existing_cancellation.workspace_id=i.workspace_id
        and existing_cancellation.obligation_id=i.id);

  insert into app_private.client_deactivation_state(client_id,auth_user_id,deactivated_at)
    values(cid,c.auth_user_id,sampled) on conflict(client_id) do nothing;
  insert into app_private.refund_auth_lockouts(client_id,auth_user_id)
    values(cid,c.auth_user_id) on conflict(client_id) do nothing;
  update public.clients set deactivated_at=sampled
    where workspace_id=ws and id=cid and deactivated_at is null;
  set constraints all immediate;
  return result;
exception
  when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow
    or invalid_datetime_format then return jsonb_build_object('status','invalid_input');
  when others then return jsonb_build_object('status','unavailable');
end $$;


alter function public.record_refund(jsonb) owner to postgres;
revoke all on function public.record_refund(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_refund(jsonb) to authenticated;
