-- Fix the renewal package lookup variable/column ambiguity without editing pushed F13 migrations.
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
  ws:=(request->>'workspace_id')::uuid; cid:=(request->>'client_id')::uuid;
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

-- Compare a renewal's immutable package snapshot without a multi-column scalar
-- subquery; that expression fails with SQLSTATE 42601 when the trigger runs.
create or replace function app_private.f12_guard_subscription() returns trigger
language plpgsql security definer set search_path='' as $$
declare op app_private.subscription_renewal_operations%rowtype; r public.subscription_renewals%rowtype;
begin
  perform 1 from public.clients c where c.workspace_id=new.workspace_id and c.id=new.client_id for update;
  if new.kind='initial' then
    if new.created_by is distinct from auth.uid() or new.created_at is distinct from now()
      or not app_private.f12_actor_allowed(new.workspace_id,'approve_registration',false)
      or not exists(select 1 from public.clients c join public.registration_links l on l.workspace_id=c.workspace_id and l.id=c.registration_link_id
        where c.workspace_id=new.workspace_id and c.id=new.client_id and c.registration_link_id=new.registration_link_id and c.package_version_id=new.package_version_id
        and (l.price_minor,l.currency,l.commission_rate_bp,l.duration_days,l.duration_months) is not distinct from (new.price_minor,new.currency,new.commission_rate_bp,new.duration_days,new.duration_months)) then
      raise exception 'invalid_subscription_snapshot' using errcode='23514';
    end if;
    return new;
  end if;
  select * into op from app_private.subscription_renewal_operations o
    where o.workspace_id=new.workspace_id and o.subscription_id=new.id and o.actor_user_id=auth.uid();
  select * into r from public.subscription_renewals x
    where x.workspace_id=new.workspace_id and x.subscription_id=new.id
      and x.client_id=new.client_id and x.predecessor_subscription_id=new.predecessor_subscription_id;
  if not found or op.id is null or new.registration_link_id is not null
    or new.created_by is distinct from auth.uid() or new.created_at is distinct from now()
    or not app_private.f12_actor_allowed(new.workspace_id,'record_payment',false)
    or not exists(select 1 from public.package_versions v
      where v.workspace_id=new.workspace_id and v.id=new.package_version_id
        and (new.price_minor,new.currency,new.commission_rate_bp,new.duration_days,new.duration_months)
          is not distinct from (v.price_minor,v.currency,v.commission_rate_bp,v.duration_days,v.duration_months))
    or not exists(select 1 from public.package_versions v
      where v.workspace_id=new.workspace_id and v.id=new.package_version_id
        and v.offer_id=r.package_offer_id and r.package_version_id=new.package_version_id) then
    raise exception 'invalid_renewal_snapshot' using errcode='23514';
  end if;
  return new;
end $$;

alter function app_private.f12_guard_subscription() owner to postgres;
revoke all on function app_private.f12_guard_subscription() from public,anon,authenticated,service_role;

create or replace function app_private.f13_validate_renewal(ws uuid,sid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.subscriptions%rowtype; r public.subscription_renewals%rowtype; n bigint;
begin
  select * into strict s from public.subscriptions where workspace_id=ws and id=sid;
  select * into strict r from public.subscription_renewals x where x.workspace_id=ws and x.subscription_id=sid;
  if s.kind<>'renewal' or s.registration_link_id is not null
    or s.predecessor_subscription_id is distinct from r.predecessor_subscription_id
    or not exists(select 1 from public.package_versions v
      where v.workspace_id=ws and v.id=r.package_version_id
        and (s.price_minor,s.currency,s.commission_rate_bp,s.duration_days,s.duration_months)
          is not distinct from (v.price_minor,v.currency,v.commission_rate_bp,v.duration_days,v.duration_months))
    or not exists(select 1 from app_private.subscription_renewal_operations o where o.workspace_id=ws
       and o.subscription_id=sid and o.predecessor_subscription_id=r.predecessor_subscription_id
       and o.expected_revision=r.expected_revision and o.actor_user_id=r.recorded_by) then
    raise exception 'invalid_renewal_snapshot' using errcode='23514';
  end if;
  select count(*) into n from public.subscription_installments i where i.workspace_id=ws and i.subscription_id=sid;
  if n=0 or not exists(select 1 from public.subscription_installments i where i.workspace_id=ws and i.subscription_id=sid
    having min(i.seq)=1 and max(i.seq)=n and sum(i.amount_minor::numeric)=s.price_minor and bool_and(i.currency=s.currency))
    or exists(select 1 from public.subscription_installments i where i.workspace_id=ws and i.subscription_id=sid
      and (i.source_kind<>'renewal_schedule' or i.due_on is distinct from r.recording_date+i.issued_day_offset)) then
    raise exception 'invalid_renewal_installments' using errcode='23514';
  end if;
end $$;

alter function app_private.f13_validate_renewal(uuid,uuid) owner to postgres;
revoke all on function app_private.f13_validate_renewal(uuid,uuid) from public,anon,authenticated,service_role;
