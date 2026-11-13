-- Resolve decided F13 review corrections without changing append-only history.
-- FR-039, FR-044; S52-PO-4 MCQ16B, S52-PO-7 MCQ17B.

CREATE OR REPLACE FUNCTION app_private.f13_project_entitlement(ws uuid, sid uuid, as_of date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sub public.subscriptions%rowtype; activation public.subscription_activations%rowtype;
  manual_adjustment public.subscription_manual_date_adjustments%rowtype; upgrade_row public.subscription_upgrades%rowtype;
  term record; term_start date; term_end date; next_start date; next_end date; term_days integer;
  last_end date; first_start date; has_current boolean:=false; coverage_end date;
  frozen boolean:=false; projected text; remove_floor date; contribution integer;
  anchor_time timestamptz; previous_end date; base_end date; removed_days integer:=0; removal_day date; freeze_sum integer:=0; upgrade_anchor_selected boolean:=false;
begin
  if as_of is null or not isfinite(as_of) then raise exception 'invalid_input' using errcode='22023'; end if;
  select * into sub from public.subscriptions s where s.workspace_id=ws and s.id=sid;
  if not found then raise exception 'not_permitted' using errcode='42501'; end if;
  if exists(select 1 from public.refund_operations r where r.workspace_id=ws and r.subscription_id=sid) then
    return jsonb_build_object('status','refunded','effective_end_exclusive',null,'coverage_end_exclusive',null); end if;
  select * into activation from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=sid;
  if sub.kind='initial' and not found then return jsonb_build_object('status','awaiting_activation','effective_end_exclusive',null,'coverage_end_exclusive',null); end if;
  if sub.kind<>'initial' then return jsonb_build_object('status','expired','effective_end_exclusive',null,'coverage_end_exclusive',null); end if;
  select * into manual_adjustment from public.subscription_manual_date_adjustments d
    where d.workspace_id=ws and d.subscription_id=sid order by d.recorded_at desc,d.id desc limit 1;
  select * into upgrade_row from public.subscription_upgrades u
    where u.workspace_id=ws and u.subscription_id=sid order by u.expected_revision desc,u.id desc limit 1;
  if upgrade_row.id is not null and (manual_adjustment.id is null or upgrade_row.recorded_at>manual_adjustment.recorded_at) then
    term_start:=coalesce(upgrade_row.service_start_date,(activation.activated_at at time zone 'Africa/Cairo')::date);
    term_end:=coalesce(upgrade_row.service_end_exclusive,term_start+upgrade_row.duration_days);
    anchor_time:=upgrade_row.recorded_at;
    upgrade_anchor_selected:=true;
  elsif manual_adjustment.id is not null then
    term_start:=manual_adjustment.new_service_start_date;
    term_end:=manual_adjustment.new_service_end_exclusive;
    anchor_time:=manual_adjustment.recorded_at;
  else
    term_start:=(activation.activated_at at time zone 'Africa/Cairo')::date;
    term_end:=term_start+sub.duration_days;
    anchor_time:=activation.activated_at;
  end if;
  if upgrade_anchor_selected then
    select max((e.recorded_at at time zone 'Africa/Cairo')::date) into removal_day
      from public.subscription_freeze_events e
      where e.workspace_id=ws and e.subscription_id=sid and e.kind='remove'
        and e.recorded_at>anchor_time;
    if removal_day is not null then
      select coalesce(sum(x.contribution),0)::integer into freeze_sum from (
        select f.id,case when stop_event.effective_on is null then f.duration_days
          else greatest(stop_event.effective_on-f.applied_on,1) end as contribution
        from public.subscription_freezes f
        left join lateral (select min(e.effective_on) as effective_on from public.subscription_freeze_events e
          where e.workspace_id=f.workspace_id and e.subscription_id=f.subscription_id
            and e.freeze_id=f.id and e.kind='stop') stop_event on true
        where f.workspace_id=ws and f.subscription_id=sid and f.recorded_at<=anchor_time
          and exists(select 1 from public.subscription_freeze_events e where e.workspace_id=f.workspace_id
            and e.subscription_id=f.subscription_id and e.freeze_id=f.id and e.kind='remove'
            and e.recorded_at>anchor_time)
      ) x;
      removed_days:=least(freeze_sum,greatest(0,upgrade_row.service_end_exclusive
        - greatest(upgrade_row.service_start_date+upgrade_row.duration_days,removal_day+1)));
      term_end:=term_end-removed_days;
    end if;
  end if;  base_end:=term_end;
  loop
    previous_end:=term_end;
    contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer
      from public.subscription_freezes f
      where f.workspace_id=ws and f.subscription_id=sid and f.recorded_at>anchor_time
        and f.applied_on>=term_start and f.applied_on<term_end),0);
    select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor
      from public.subscription_freeze_events e
      where e.workspace_id=ws and e.subscription_id=sid and e.kind='remove' and e.recorded_at>anchor_time
        and (e.recorded_at at time zone 'Africa/Cairo')::date>=term_start
        and (e.recorded_at at time zone 'Africa/Cairo')::date < coalesce((
          select min(coalesce(d.service_start_date,r.service_start_date))
          from public.subscription_renewals r
          left join lateral (select x.service_start_date from public.subscription_renewal_date_revisions x
            where x.workspace_id=r.workspace_id and x.subscription_id=r.subscription_id and x.renewal_id=r.id
            order by x.revision desc limit 1) d on true
          where r.workspace_id=ws and r.subscription_id=sid and r.predecessor_subscription_id=sid
            and r.recorded_at>anchor_time
        ),'infinity'::date);
    term_end:=greatest(base_end+contribution,coalesce(remove_floor,base_end));
    exit when term_end=previous_end;
  end loop;
  first_start:=term_start; last_end:=term_end;
  if as_of>=term_start and as_of<term_end then has_current:=true; coverage_end:=term_end; end if;
  for term in select r.*,coalesce(d.service_start_date,r.service_start_date) as projected_start,
      coalesce(d.service_end_exclusive,r.service_end_exclusive) as projected_end
    from public.subscription_renewals r
    left join lateral (select x.service_start_date,x.service_end_exclusive from public.subscription_renewal_date_revisions x
      where x.workspace_id=r.workspace_id and x.subscription_id=r.subscription_id and x.renewal_id=r.id
      order by x.revision desc limit 1) d on true
    where r.workspace_id=ws and r.subscription_id=sid and r.predecessor_subscription_id=sid
      and r.recorded_at>anchor_time order by r.expected_revision loop
    term_days:=term.projected_end-term.projected_start;
    if removed_days>0 and removal_day is not null and term.projected_start>removal_day then
      next_start:=greatest(term.projected_start-removed_days,last_end);
    else
      next_start:=greatest(term.projected_start,last_end);
    end if;
    next_end:=next_start+term_days;
    base_end:=next_end;
    loop
      previous_end:=next_end;
      contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer
        from public.subscription_freezes f
        where f.workspace_id=ws and f.subscription_id=sid and f.recorded_at>anchor_time
          and f.applied_on>=next_start and f.applied_on<next_end),0);
      select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor
        from public.subscription_freeze_events e
        where e.workspace_id=ws and e.subscription_id=sid and e.kind='remove' and e.recorded_at>anchor_time
          and (e.recorded_at at time zone 'Africa/Cairo')::date>=next_start
          and (e.recorded_at at time zone 'Africa/Cairo')::date < coalesce((
            select min(coalesce(d.service_start_date,r.service_start_date))
            from public.subscription_renewals r
            left join lateral (select x.service_start_date from public.subscription_renewal_date_revisions x
              where x.workspace_id=r.workspace_id and x.subscription_id=r.subscription_id and x.renewal_id=r.id
              order by x.revision desc limit 1) d on true
            where r.workspace_id=ws and r.subscription_id=sid and r.predecessor_subscription_id=sid
              and r.recorded_at>anchor_time and r.expected_revision>term.expected_revision
          ),'infinity'::date);
      next_end:=greatest(base_end+contribution,coalesce(remove_floor,base_end));
      exit when next_end=previous_end;
    end loop;
    if as_of>=next_start and as_of<next_end then has_current:=true; coverage_end:=next_end;
    elsif has_current and next_start<=coverage_end then coverage_end:=greatest(coverage_end,next_end);
    end if;
    last_end:=next_end;
  end loop;
  if not has_current and as_of<first_start then projected:='future';
  elsif not has_current then projected:='expired';
  else
    select exists(select 1 from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=sid
      and f.recorded_at>anchor_time and app_private.f13_freeze_contribution(ws,sid,f.id)>0
      and as_of>=f.applied_on and as_of<f.applied_on+app_private.f13_freeze_contribution(ws,sid,f.id)) into frozen;
    projected:=case when frozen then 'frozen' else 'active' end;
  end if;
  return jsonb_build_object('status',projected,'effective_end_exclusive',last_end,'coverage_end_exclusive',coverage_end);
end $function$;

alter function app_private.f13_project_entitlement(uuid,uuid,date) owner to postgres;
revoke all on function app_private.f13_project_entitlement(uuid,uuid,date) from public,anon,authenticated,service_role;
grant execute on function app_private.f13_project_entitlement(uuid,uuid,date) to service_role;

CREATE OR REPLACE FUNCTION public.record_renewal(request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ws uuid; cid uuid; predecessor_id uuid; requested_offer_id uuid; request_id uuid;
  expected integer; c public.clients%rowtype; predecessor public.subscriptions%rowtype;
  offer public.package_offers%rowtype; version public.package_versions%rowtype;
  previous app_private.subscription_renewal_operations%rowtype;
  canonical jsonb; binding bytea; legacy_canonical jsonb; legacy_binding bytea; sampled timestamptz; recording date; start_on date; end_on date;
  renewal_id uuid; operation_id uuid; revision integer; seq integer;
  row jsonb; total numeric:=0; amount bigint; offset_days integer;
  receipt jsonb; result jsonb; projected jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('status','not_permitted'); end if;
  if jsonb_typeof(request) is distinct from 'object'
    or coalesce(request->>'workspace_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',true) then
    return jsonb_build_object('status','not_permitted'); end if;
  ws:=(request->>'workspace_id')::uuid;
  if not app_private.f13_actor_preflight(ws,'record_payment',false) then return jsonb_build_object('status','not_permitted'); end if;
  if jsonb_typeof(request) is distinct from 'object'
    or request->>'workspace_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(request->>'client_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',true)
    or coalesce(request->>'predecessor_subscription_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',true)
    or coalesce(request->>'package_offer_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',true)
    or coalesce(request->>'request_key' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',true)
    or coalesce(request->>'expected_revision' !~ '^(0|[1-9][0-9]{0,8})$',true)
    or request->'renewal_confirmed' is distinct from 'true'::jsonb
    or (request->'installments' is not null and request->'installments'<>'null'::jsonb
      and (jsonb_typeof(request->'installments')<>'array' or jsonb_array_length(request->'installments')=0)) then
    return jsonb_build_object('status','invalid_input'); end if;
  cid:=(request->>'client_id')::uuid; predecessor_id:=(request->>'predecessor_subscription_id')::uuid;
  requested_offer_id:=(request->>'package_offer_id')::uuid; request_id:=(request->>'request_key')::uuid;
  expected:=(request->>'expected_revision')::integer;
  if not app_private.f12_actor_allowed(ws,'record_payment',false) then return jsonb_build_object('status','not_permitted'); end if;
  canonical:=jsonb_build_array(2,ws::text,cid::text,predecessor_id::text,requested_offer_id::text,expected,
    true,coalesce((select jsonb_agg(jsonb_build_array(x->>'amount_minor',x->>'due_offset_days') order by n)
      from jsonb_array_elements(case when jsonb_typeof(request->'installments')='array' then request->'installments' else '[]'::jsonb end)
        with ordinality as a(x,n)),'[]'::jsonb));
  binding:=extensions.digest(convert_to(canonical::text,'UTF8'),'sha256');
  legacy_canonical:=jsonb_build_array(1,ws::text,cid::text,predecessor_id::text,requested_offer_id::text,expected,
    true,coalesce((select jsonb_agg(jsonb_build_array(x->>'amount_minor',x->>'due_offset_days') order by n)
      from jsonb_array_elements(case when jsonb_typeof(request->'installments')='array' then request->'installments' else '[]'::jsonb end)
        with ordinality as a(x,n)),'[]'::jsonb));
  legacy_binding:=extensions.digest(convert_to(legacy_canonical::text,'UTF8'),'sha256');
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
    if previous.workspace_id<>ws or previous.client_id<>cid
      or (previous.canonical_args_hash is distinct from binding and previous.canonical_args_hash is distinct from legacy_binding) then
      return jsonb_build_object('status','conflict'); end if;
    return previous.result_receipt;
  end if;
  if exists(select 1 from public.subscription_renewals r
    where r.workspace_id=ws and r.predecessor_subscription_id=predecessor_id
      and r.subscription_id<>predecessor_id) then
    return jsonb_build_object('status','stale_state');
  end if;
  select count(*)::integer into revision from public.subscription_renewals r
    where r.workspace_id=ws and r.client_id=cid and r.subscription_id=predecessor_id and r.predecessor_subscription_id=predecessor_id;
  revision:=revision+(select count(*)::integer from public.subscription_upgrades u
    where u.workspace_id=ws and u.client_id=cid and u.subscription_id=predecessor_id);
  if c.deactivated_at is not null or c.approval_state<>'approved' or predecessor.kind<>'initial'
    or not exists(select 1 from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=predecessor_id)
    or exists(select 1 from public.refund_operations r where r.workspace_id=ws and r.subscription_id=predecessor_id)
    or expected<>revision then return jsonb_build_object('status','stale_state'); end if;
  select * into offer from public.package_offers o where o.workspace_id=ws and o.id=requested_offer_id;
  if not found or offer.available is not true then return jsonb_build_object('status','stale_state'); end if;
  select * into version from public.package_versions v where v.workspace_id=ws and v.id=offer.current_version_id and v.offer_id=requested_offer_id;
  if not found then return jsonb_build_object('status','stale_state'); end if;
  if request->'installments' is not null and request->'installments'<>'null'::jsonb
    and jsonb_array_length(request->'installments')>1 and not app_private.f12_actor_allowed(ws,'configure_installment_schedule',false) then
    return jsonb_build_object('status','not_permitted'); end if;
  if request->'installments' is not null and request->'installments'<>'null'::jsonb then
    for row in select value from jsonb_array_elements(request->'installments') loop
      if jsonb_typeof(row)<>'object' or row->>'amount_minor' !~ '^[1-9][0-9]{0,17}$' or row->>'due_offset_days' !~ '^(0|[1-9][0-9]{0,8})$' then return jsonb_build_object('status','invalid_input'); end if;
      amount:=(row->>'amount_minor')::bigint; offset_days:=(row->>'due_offset_days')::integer;
      if amount<=0 or offset_days<0 then return jsonb_build_object('status','invalid_input'); end if; total:=total+amount;
    end loop;
  else total:=version.price_minor; end if;
  if total<>version.price_minor then return jsonb_build_object('status','invalid_input'); end if;
  sampled:=clock_timestamp(); recording:=(sampled at time zone 'Africa/Cairo')::date;
  projected:=app_private.f13_project_entitlement(ws,predecessor_id,recording);
  if projected->>'status'='frozen' then return jsonb_build_object('status','stale_state'); end if;
  start_on:=case when projected->>'status'='expired' then recording
    else greatest(recording,coalesce((projected->>'effective_end_exclusive')::date,recording)) end;
  end_on:=start_on+version.duration_days;
  renewal_id:=gen_random_uuid(); operation_id:=gen_random_uuid();
  receipt:=jsonb_build_object('operation_id',operation_id,'renewal_id',renewal_id,'workspace_id',ws,'client_id',cid,
    'predecessor_subscription_id',predecessor_id,'subscription_id',predecessor_id,'package_version_id',version.id,
    'price_minor',version.price_minor::text,'currency',version.currency,'duration_days',version.duration_days,
    'recording_date',recording,'service_start_date',start_on,'service_end_exclusive',end_on);
  result:=jsonb_build_object('status','ok','receipt',receipt); set constraints all deferred;
  insert into public.subscription_renewals(id,workspace_id,client_id,predecessor_subscription_id,subscription_id,
    package_offer_id,package_version_id,expected_revision,recording_date,service_start_date,service_end_exclusive,recorded_by,recorded_at)
    values(renewal_id,ws,cid,predecessor_id,predecessor_id,requested_offer_id,version.id,revision,recording,start_on,end_on,auth.uid(),sampled);
  insert into app_private.subscription_renewal_operations(id,workspace_id,client_id,actor_user_id,request_key,
    predecessor_subscription_id,subscription_id,expected_revision,canonical_args_hash,result_receipt,recorded_at,renewal_id,transaction_id)
    values(operation_id,ws,cid,auth.uid(),request_id,predecessor_id,predecessor_id,revision,binding,result,sampled,renewal_id,pg_current_xact_id());
  select coalesce(max(i.seq),0) into seq from public.subscription_installments i where i.workspace_id=ws and i.subscription_id=predecessor_id;
  if request->'installments' is not null and request->'installments'<>'null'::jsonb then
    for row in select value from jsonb_array_elements(request->'installments') loop
      seq:=seq+1; amount:=(row->>'amount_minor')::bigint; offset_days:=(row->>'due_offset_days')::integer;
      insert into public.subscription_installments(workspace_id,subscription_id,seq,amount_minor,currency,issued_day_offset,source_kind,due_on,renewal_id,renewal_commission_rate_bp)
        values(ws,predecessor_id,seq,amount,version.currency,offset_days,'renewal_schedule',recording+offset_days,renewal_id,version.commission_rate_bp);
    end loop;
  else
    insert into public.subscription_installments(workspace_id,subscription_id,seq,amount_minor,currency,issued_day_offset,source_kind,due_on,renewal_id,renewal_commission_rate_bp)
      values(ws,predecessor_id,seq+1,version.price_minor,version.currency,0,'renewal_schedule',recording,renewal_id,version.commission_rate_bp);
  end if;
  set constraints all immediate; return result;
exception when others then return jsonb_build_object('status','unavailable');
end $function$;

alter function public.record_renewal(jsonb) owner to postgres;
revoke all on function public.record_renewal(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_renewal(jsonb) to authenticated;

create or replace function public.workspace_payment_queue(workspace_id uuid,cursor_id uuid default null,page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; totals jsonb; next_id uuid; more boolean;
begin
  if not app_private.f12_u5_authorized(workspace_id,'record_payment') then return jsonb_build_object('status','not_permitted'); end if;
  if page_size is null or page_size<1 or page_size>100 then return jsonb_build_object('status','invalid_input'); end if;
  with all_candidates as (
    select c.id as client_id,s.id as subscription_id,c.name,c.approval_state,s.price_minor,s.currency,
      coalesce(sum(i.amount_minor) filter(where tail.kind is distinct from 'collection'),0)::bigint as unpaid_minor
    from public.clients c join public.subscriptions s on s.workspace_id=c.workspace_id and s.client_id=c.id
    join public.subscription_installments i on i.workspace_id=s.workspace_id and i.subscription_id=s.id
    left join lateral (select e.kind from public.payment_events e where e.workspace_id=i.workspace_id
      and e.obligation_id=i.id order by e.revision desc limit 1) tail on true
    where c.workspace_id=workspace_payment_queue.workspace_id and c.approval_state='approved'
      and c.deactivated_at is null
    group by c.id,s.id
  ), all_installments as (
    select i.currency, i.amount_minor,
      (tail.kind is distinct from 'collection') as unpaid
    from public.clients c join public.subscriptions s on s.workspace_id=c.workspace_id and s.client_id=c.id
    join public.subscription_installments i on i.workspace_id=s.workspace_id and i.subscription_id=s.id
    left join lateral (select e.kind from public.payment_events e where e.workspace_id=i.workspace_id
      and e.obligation_id=i.id order by e.revision desc limit 1) tail on true
    where c.workspace_id=workspace_payment_queue.workspace_id and c.approval_state='approved'
      and c.deactivated_at is null
  ), currency_totals as (
    select coalesce(jsonb_agg(jsonb_build_object('currency',t.currency,'unpaid_minor',t.unpaid_minor::text)
      order by t.currency),'[]'::jsonb) as value
    from (
      select i.currency,sum(i.amount_minor)::bigint as unpaid_minor
      from all_installments i
      where i.unpaid
      group by i.currency
    ) t
  ), candidates as (
    select q.* from all_candidates q
    where workspace_payment_queue.cursor_id is null or q.subscription_id>workspace_payment_queue.cursor_id
    order by q.subscription_id limit workspace_payment_queue.page_size+1
  ), numbered as (
    select row_number() over(order by q.subscription_id) as rn,q.* from candidates q
  )
  select coalesce(jsonb_agg(jsonb_build_object('client_id',q.client_id,'subscription_id',q.subscription_id,
      'name',q.name,'approval_state',q.approval_state,'price_minor',q.price_minor::text,
      'currency',q.currency,'unpaid_minor',q.unpaid_minor::text) order by q.rn)
      filter(where q.rn<=workspace_payment_queue.page_size),'[]'::jsonb),
    count(*)>workspace_payment_queue.page_size,
    (array_agg(q.subscription_id order by q.rn) filter(where q.rn<=workspace_payment_queue.page_size))[workspace_payment_queue.page_size],
    (select value from currency_totals)
    into result,more,next_id,totals from numbered q;
  return jsonb_build_object('status','ok','items',result,'totals',totals,
    'next_cursor',case when more then next_id else null end);
end $$;
