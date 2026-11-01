-- S22-PO-5: renewals receive their activation fact atomically when recorded.
-- This fact does not grant P4 client/plan access or create plan-pair/productivity
-- records; service dates continue to control entitlement and freeze eligibility.
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
    -- FR-012 allows one unstarted renewal in a lineage. Read every renewal's
    -- latest date revision after the existing client/subscription/installment locks.
    or exists (
      with recursive ancestors(subscription_id,predecessor_subscription_id) as (
        select s.id,s.predecessor_subscription_id from public.subscriptions s
        where s.workspace_id=ws and s.client_id=cid and s.id=predecessor_id
        union
        select p.id,p.predecessor_subscription_id from public.subscriptions p
        join ancestors a on p.workspace_id=ws and p.client_id=cid
          and p.id=a.predecessor_subscription_id
      ),
      root(subscription_id) as (
        select subscription_id from ancestors where predecessor_subscription_id is null
      ),
      descendants(subscription_id) as (
        select subscription_id from root
        union
        select s.id from public.subscriptions s
        join descendants d on s.workspace_id=ws and s.client_id=cid
          and s.predecessor_subscription_id=d.subscription_id
      )
      select 1 from public.subscription_renewals r
      join descendants d on d.subscription_id=r.subscription_id
      where r.workspace_id=ws and r.client_id=cid
        and coalesce((select latest_date.service_start_date
          from public.subscription_renewal_date_revisions latest_date
          where latest_date.workspace_id=ws and latest_date.subscription_id=r.subscription_id
          order by latest_date.revision desc limit 1),r.service_start_date)
          >(clock_timestamp() at time zone 'Africa/Cairo')::date
    )
    or expected<>(select count(*)::integer from public.subscription_renewals r where r.workspace_id=ws and r.predecessor_subscription_id=predecessor_id) then
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
  -- Tie the activation fact to this renewal operation, with no P4 plan-pair write.
  insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
    values(ws,successor_id,sampled,operation_id);
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


