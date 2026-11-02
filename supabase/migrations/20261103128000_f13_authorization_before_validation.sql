-- Restore F12/F13 authorization-before-validation behavior for payment mutations.

-- Workspace parsing locates the capability scope; malformed or unauthorized requests return uniformly.

create or replace function app_private.f13_actor_preflight(ws uuid,cap text,po_only boolean)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.workspaces w
    join public.staff_profiles p on p.user_id=auth.uid()
    where w.id=ws and (not po_only or p.role='platform_owner')
      and app_private.role_has_capability(p.role,cap)
      and (p.role='platform_owner' or exists(
        select 1 from public.workspace_memberships m
        where m.workspace_id=ws and m.user_id=auth.uid() and m.revoked_at is null))
  );
$$;
alter function app_private.f13_actor_preflight(uuid,text,boolean) owner to postgres;
revoke all on function app_private.f13_actor_preflight(uuid,text,boolean) from public,anon,authenticated,service_role;

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
  select coalesce(sum(greatest(payment_source.amount_minor-coalesce(refunded.amount_minor,0),0)),0)
    into available
    from public.payment_events payment_source
    left join lateral (
      select sum(-a.amount_minor) as amount_minor
      from public.refund_allocation_events a
      where a.workspace_id=payment_source.workspace_id and a.subscription_id=payment_source.subscription_id
        and a.source_collection_event_id=payment_source.id
    ) refunded on true
    where payment_source.workspace_id=ws and payment_source.subscription_id=sid and payment_source.kind='collection'
      and not exists(select 1 from public.payment_events correction
        where correction.workspace_id=payment_source.workspace_id and correction.reverses_event_id=payment_source.id);
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
    select e.id,e.obligation_id,e.amount_minor,e.commission_minor,e.currency,e.collected_on,i.seq,
      coalesce((select sum(-a.amount_minor) from public.refund_allocation_events a
        where a.workspace_id=e.workspace_id and a.subscription_id=e.subscription_id
          and a.source_collection_event_id=e.id),0) as refunded_minor,
      coalesce((select sum(-a.commission_minor) from public.refund_allocation_events a
        where a.workspace_id=e.workspace_id and a.subscription_id=e.subscription_id
          and a.source_collection_event_id=e.id),0) as commission_refunded
    from public.payment_events e
    join public.subscription_installments i on i.workspace_id=e.workspace_id
      and i.subscription_id=e.subscription_id and i.id=e.obligation_id
    where e.workspace_id=ws and e.subscription_id=sid and e.kind='collection'
      and not exists(select 1 from public.payment_events correction
        where correction.workspace_id=e.workspace_id and correction.reverses_event_id=e.id)
    order by e.collected_on,i.seq,e.id
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
      refund_operation_id,source_collection_event_id,amount_minor,commission_minor,currency,
      effective_on,recorded_by,recorded_at)
    values(ws,sid,source.obligation_id,refund_id,source.id,-principal,-commission_delta,
      source.currency,effective,auth.uid(),sampled);
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
  where i.workspace_id=refund_fn.ws and i.subscription_id=refund_fn.sid
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


create or replace function public.record_renewal(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  ws uuid; cid uuid; predecessor_id uuid; requested_offer_id uuid; request_id uuid;
  expected integer; c public.clients%rowtype; predecessor public.subscriptions%rowtype;
  offer public.package_offers%rowtype; version public.package_versions%rowtype;
  previous app_private.subscription_renewal_operations%rowtype;
  canonical jsonb; binding bytea; sampled timestamptz; recording date; start_on date; end_on date;
  successor_id uuid; renewal_id uuid; operation_id uuid; revision integer;
  row jsonb; seq integer:=0; total numeric:=0; amount bigint; offset_days integer;
  receipt jsonb; result jsonb; projected jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('status','not_permitted'); end if;
  if jsonb_typeof(request) is distinct from 'object'
    or coalesce(request->>'workspace_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',true) then
    return jsonb_build_object('status','not_permitted');
  end if;
  ws:=(request->>'workspace_id')::uuid;
  if not app_private.f13_actor_preflight(ws,'record_payment',false) then
    return jsonb_build_object('status','not_permitted');
  end if;
  if jsonb_typeof(request) is distinct from 'object'
    or request->>'workspace_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or request->>'client_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or request->>'predecessor_subscription_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or request->>'package_offer_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or request->>'request_key' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or request->>'expected_revision' !~ '^(0|[1-9][0-9]{0,8})$'
    or request->'renewal_confirmed' is distinct from 'true'::jsonb
    or (request->'installments' is not null and request->'installments'<>'null'::jsonb
      and (jsonb_typeof(request->'installments')<>'array' or jsonb_array_length(request->'installments')=0)) then
    return jsonb_build_object('status','invalid_input');
  end if;
  cid:=(request->>'client_id')::uuid;
  predecessor_id:=(request->>'predecessor_subscription_id')::uuid;
  requested_offer_id:=(request->>'package_offer_id')::uuid; request_id:=(request->>'request_key')::uuid;
  expected:=(request->>'expected_revision')::integer;
  if not app_private.f12_actor_allowed(ws,'record_payment',false) then return jsonb_build_object('status','not_permitted'); end if;
  canonical:=jsonb_build_array(1,ws::text,cid::text,predecessor_id::text,requested_offer_id::text,expected,
    true,coalesce((select jsonb_agg(jsonb_build_array(x->>'amount_minor',x->>'due_offset_days') order by n)
      from jsonb_array_elements(case when jsonb_typeof(request->'installments')='array' then request->'installments' else '[]'::jsonb end)
        with ordinality as a(x,n)),'[]'::jsonb));
  binding:=extensions.digest(convert_to(canonical::text,'UTF8'),'sha256');
  select * into c from public.clients where workspace_id=ws and id=cid for update;
  if not found then return jsonb_build_object('status','not_permitted'); end if;
  select * into predecessor from public.subscriptions where workspace_id=ws and client_id=cid and id=predecessor_id for update;
  if not found then return jsonb_build_object('status','not_permitted'); end if;
  perform i.id from public.subscription_installments i where i.workspace_id=ws and i.subscription_id=predecessor_id order by i.seq,i.id for update;
  if not app_private.f12_actor_allowed(ws,'record_payment',false) then return jsonb_build_object('status','not_permitted'); end if;
  perform pg_advisory_xact_lock(hashtextextended('lifter.f13.renewal:'||auth.uid()::text||':'||request_id::text,0));
  if not app_private.f12_actor_allowed(ws,'record_payment',false) then return jsonb_build_object('status','not_permitted'); end if;
  select * into previous from app_private.subscription_renewal_operations o where o.actor_user_id=auth.uid() and o.request_key=request_id;
  if found then
    if previous.workspace_id<>ws or previous.client_id<>cid or previous.canonical_args_hash is distinct from binding then
      return jsonb_build_object('status','conflict'); end if;
    return previous.result_receipt;
  end if;
  if c.approval_state<>'approved' or predecessor.kind not in ('initial','renewal')
    or not exists(select 1 from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=predecessor_id)
    or exists(select 1 from public.refund_operations r where r.workspace_id=ws and r.subscription_id=predecessor_id)
    or predecessor_id in (select predecessor_subscription_id from public.subscription_renewals r
      where r.workspace_id=ws and r.service_start_date>(clock_timestamp() at time zone 'Africa/Cairo')::date)
    or expected<>(select count(*)::integer from public.subscription_renewals r where r.workspace_id=ws and r.predecessor_subscription_id=predecessor_id)
    or exists(select 1 from public.subscription_renewals r where r.workspace_id=ws and r.predecessor_subscription_id=predecessor_id
      and not exists(select 1 from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=r.subscription_id)) then
    return jsonb_build_object('status','stale_state');
  end if;
  select * into offer from public.package_offers o where o.workspace_id=ws and o.id=requested_offer_id;
  if not found or offer.available is not true then return jsonb_build_object('status','stale_state'); end if;
  select * into version from public.package_versions v where v.workspace_id=ws and v.id=offer.current_version_id and v.offer_id=requested_offer_id;
  if not found then return jsonb_build_object('status','stale_state'); end if;
  if request->'installments' is not null and request->'installments'<>'null'::jsonb
    and jsonb_array_length(request->'installments')>1
    and not app_private.f12_actor_allowed(ws,'configure_installment_schedule',false) then
    return jsonb_build_object('status','not_permitted'); end if;
  if request->'installments' is not null and request->'installments'<>'null'::jsonb then
    for row in select value from jsonb_array_elements(request->'installments') loop
      if jsonb_typeof(row)<>'object' or row->>'amount_minor' !~ '^[1-9][0-9]{0,17}$'
        or row->>'due_offset_days' !~ '^(0|[1-9][0-9]{0,8})$' then return jsonb_build_object('status','invalid_input'); end if;
      amount:=(row->>'amount_minor')::bigint; offset_days:=(row->>'due_offset_days')::integer;
      if amount<=0 or offset_days<0 then return jsonb_build_object('status','invalid_input'); end if;
      total:=total+amount;
    end loop;
  else total:=version.price_minor; end if;
  if total<>version.price_minor then return jsonb_build_object('status','invalid_input'); end if;
  projected:=app_private.f13_project_entitlement(ws,predecessor_id,(clock_timestamp() at time zone 'Africa/Cairo')::date);
  sampled:=clock_timestamp(); recording:=(sampled at time zone 'Africa/Cairo')::date;
  start_on:=greatest(recording,coalesce((projected->>'effective_end_exclusive')::date,recording));
    end_on:=start_on+version.duration_days;
    successor_id:=gen_random_uuid(); renewal_id:=gen_random_uuid(); operation_id:=gen_random_uuid();
    revision:=expected+1;
    receipt:=jsonb_build_object('operation_id',operation_id,'workspace_id',ws,'client_id',cid,
      'predecessor_subscription_id',predecessor_id,'subscription_id',successor_id,'package_version_id',version.id,
      'price_minor',version.price_minor::text,'currency',version.currency,'duration_days',version.duration_days,
      'recording_date',recording,'service_start_date',start_on,'service_end_exclusive',end_on);
    result:=jsonb_build_object('status','ok','receipt',receipt);
    set constraints all deferred;
    insert into app_private.subscription_renewal_operations(id,workspace_id,client_id,actor_user_id,request_key,
      predecessor_subscription_id,subscription_id,expected_revision,canonical_args_hash,result_receipt,recorded_at)
      values(operation_id,ws,cid,auth.uid(),request_id,predecessor_id,successor_id,expected,binding,result,sampled);
  insert into public.subscription_renewals(id,workspace_id,client_id,predecessor_subscription_id,subscription_id,
    package_offer_id,package_version_id,expected_revision,recording_date,service_start_date,service_end_exclusive,recorded_by,recorded_at)
    values(renewal_id,ws,cid,predecessor_id,successor_id,requested_offer_id,version.id,expected,recording,start_on,end_on,auth.uid(),sampled);
  insert into public.subscriptions(id,workspace_id,client_id,kind,registration_link_id,package_version_id,
    predecessor_subscription_id,price_minor,currency,commission_rate_bp,duration_days,duration_months,created_by,created_at)
    values(successor_id,ws,cid,'renewal',null,version.id,predecessor_id,version.price_minor,version.currency,
      version.commission_rate_bp,version.duration_days,version.duration_months,auth.uid(),now());
  if request->'installments' is not null and request->'installments'<>'null'::jsonb then
    for row in select value from jsonb_array_elements(request->'installments') loop
      seq:=seq+1; amount:=(row->>'amount_minor')::bigint; offset_days:=(row->>'due_offset_days')::integer;
      insert into public.subscription_installments(workspace_id,subscription_id,seq,amount_minor,currency,issued_day_offset,source_kind,due_on)
        values(ws,successor_id,seq,amount,version.currency,offset_days,'renewal_schedule',recording+offset_days);
    end loop;
  else
    insert into public.subscription_installments(workspace_id,subscription_id,seq,amount_minor,currency,issued_day_offset,source_kind,due_on)
      values(ws,successor_id,1,version.price_minor,version.currency,0,'renewal_schedule',recording);
  end if;
    set constraints all immediate;
  return result;
exception when others then return jsonb_build_object('status','unavailable');
end $$;

alter function public.record_renewal(jsonb) owner to postgres;
revoke all on function public.record_renewal(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_renewal(jsonb) to authenticated;
