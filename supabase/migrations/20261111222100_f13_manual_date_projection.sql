-- F13 T043: manual dates are effective entitlement dates; frozen and deactivated subscriptions are refused.
-- FR-040; SC-018. Existing audit, authorization, idempotency and zero-revenue behavior is preserved.

create or replace function app_private.f13_project_entitlement(ws uuid,sid uuid,as_of date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sub public.subscriptions%rowtype; activation public.subscription_activations%rowtype; manual_adjustment public.subscription_manual_date_adjustments%rowtype;
  term record; term_start date; term_end date; next_start date; next_end date; term_days integer;
  last_end date; first_start date; has_current boolean:=false; coverage_end date;
  frozen boolean:=false; projected text; remove_floor date; contribution integer;
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
    where d.workspace_id=ws and d.subscription_id=sid
    order by d.recorded_at desc,d.id desc limit 1;
  if found then
    term_start:=manual_adjustment.new_service_start_date;
    term_end:=manual_adjustment.new_service_end_exclusive;
  else
    term_start:=(activation.activated_at at time zone 'Africa/Cairo')::date;
    term_end:=term_start+sub.duration_days;
  end if;
  contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer from public.subscription_freezes f
    where f.workspace_id=ws and f.subscription_id=sid and f.applied_on>=term_start and f.applied_on<term_end),0);
  term_end:=term_end+contribution;
  select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor from public.subscription_freeze_events e
    where e.workspace_id=ws and e.subscription_id=sid and e.kind='remove';
  if remove_floor is not null then term_end:=greatest(term_end,remove_floor); end if;
  first_start:=term_start; last_end:=term_end;
  if as_of>=term_start and as_of<term_end then has_current:=true; coverage_end:=term_end; end if;
  for term in select r.*,coalesce(d.service_start_date,r.service_start_date) as projected_start,
      coalesce(d.service_end_exclusive,r.service_end_exclusive) as projected_end
    from public.subscription_renewals r
    left join lateral (select x.service_start_date,x.service_end_exclusive from public.subscription_renewal_date_revisions x
      where x.workspace_id=r.workspace_id and x.subscription_id=r.subscription_id and x.renewal_id=r.id
      order by x.revision desc limit 1) d on true
    where r.workspace_id=ws and r.subscription_id=sid and r.predecessor_subscription_id=sid
    order by r.expected_revision loop
    term_days:=term.projected_end-term.projected_start;
    next_start:=greatest(term.projected_start,last_end);
    next_end:=next_start+term_days;
    contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer from public.subscription_freezes f
      where f.workspace_id=ws and f.subscription_id=sid and f.applied_on>=next_start and f.applied_on<next_end),0);
    next_end:=next_end+contribution;
    select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor from public.subscription_freeze_events e
      where e.workspace_id=ws and e.subscription_id=sid and e.kind='remove';
    if remove_floor is not null then next_end:=greatest(next_end,remove_floor); end if;
    if as_of>=next_start and as_of<next_end then has_current:=true; coverage_end:=next_end;
    elsif has_current and next_start<=coverage_end then coverage_end:=greatest(coverage_end,next_end);
    elsif has_current and next_start>coverage_end then has_current:=false; coverage_end:=null; end if;
    last_end:=next_end;
  end loop;
  if not has_current and as_of<first_start then projected:='future';
  elsif not has_current then projected:='expired';
  else
    select exists(select 1 from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=sid
      and app_private.f13_freeze_contribution(ws,sid,f.id)>0 and as_of>=f.applied_on
      and as_of<f.applied_on+app_private.f13_freeze_contribution(ws,sid,f.id)) into frozen;
    projected:=case when frozen then 'frozen' else 'active' end;
  end if;
  return jsonb_build_object('status',projected,'effective_end_exclusive',last_end,'coverage_end_exclusive',coverage_end);
end $$;
alter function app_private.f13_project_entitlement(uuid,uuid,date) owner to postgres;
revoke all on function app_private.f13_project_entitlement(uuid,uuid,date) from public,anon,authenticated,service_role;
grant execute on function app_private.f13_project_entitlement(uuid,uuid,date) to service_role;

create or replace function public.record_subscription_date_adjustment(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
<<manual_date_fn>>
declare
  ws uuid; cid uuid; sid uuid; key uuid;
  start_on date; end_on date;
  c public.clients%rowtype; s public.subscriptions%rowtype;
  previous public.subscription_manual_date_adjustments%rowtype;
  projected jsonb;
  adjustment_id uuid; sampled timestamptz; receipt jsonb; result jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('status','not_permitted'); end if;
  if jsonb_typeof(request) is distinct from 'object'
    or jsonb_typeof(request->'workspace_id') is distinct from 'string'
    or coalesce((request->>'workspace_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',true) then
    return jsonb_build_object('status','not_permitted');
  end if;
  ws:=(request->>'workspace_id')::uuid;
  if not app_private.is_platform_owner() then
    return jsonb_build_object('status','not_permitted');
  end if;
  if jsonb_typeof(request) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(request)) <> 6
    or exists(select 1 from jsonb_object_keys(request) k where k not in
      ('workspace_id','client_id','subscription_id','new_service_start_date','new_service_end_exclusive','request_key'))
    or jsonb_typeof(request->'client_id') is distinct from 'string'
    or jsonb_typeof(request->'subscription_id') is distinct from 'string'
    or jsonb_typeof(request->'request_key') is distinct from 'string'
    or jsonb_typeof(request->'new_service_start_date') is distinct from 'string'
    or jsonb_typeof(request->'new_service_end_exclusive') is distinct from 'string'
    or (request->>'workspace_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'client_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'subscription_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'request_key') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'new_service_start_date') !~ '^\d{4}-\d{2}-\d{2}$'
    or (request->>'new_service_end_exclusive') !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('status','invalid_input');
  end if;
  ws:=(request->>'workspace_id')::uuid; cid:=(request->>'client_id')::uuid;
  sid:=(request->>'subscription_id')::uuid; key:=(request->>'request_key')::uuid;
  start_on:=(request->>'new_service_start_date')::date;
  end_on:=(request->>'new_service_end_exclusive')::date;
  if end_on <= start_on then return jsonb_build_object('status','invalid_input'); end if;
  -- Shared F12 order: client -> subscription.
  select * into c from public.clients x where x.workspace_id=ws and x.id=cid for update;
  if not found then return jsonb_build_object('status','not_permitted'); end if;
  select * into s from public.subscriptions x
    where x.workspace_id=ws and x.client_id=cid and x.id=sid for update;
  if not found then return jsonb_build_object('status','not_permitted'); end if;
  if not app_private.is_platform_owner() then
    return jsonb_build_object('status','not_permitted');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lifter.f13.manual_date:'||auth.uid()::text||':'||key::text,0));
  if not app_private.is_platform_owner() then
    return jsonb_build_object('status','not_permitted');
  end if;

  sampled:=clock_timestamp();
  select * into previous from public.subscription_manual_date_adjustments a
    where a.actor_user_id=auth.uid() and a.request_key=key;
  if found then
    if previous.workspace_id<>ws or previous.client_id<>cid or previous.subscription_id<>sid
      or previous.new_service_start_date<>start_on or previous.new_service_end_exclusive<>end_on then
      return jsonb_build_object('status','key_conflict');
    end if;
    receipt:=jsonb_build_object('operation_id',previous.id,'workspace_id',ws,'client_id',cid,
      'subscription_id',sid,'new_service_start_date',previous.new_service_start_date::text,
      'new_service_end_exclusive',previous.new_service_end_exclusive::text);
    return jsonb_build_object('status','ok','receipt',receipt);
  end if;

  if c.deactivated_at is not null then
    return jsonb_build_object('status','stale_state');
  end if;
  projected:=app_private.f13_project_entitlement(ws,sid,(sampled at time zone 'Africa/Cairo')::date);
  if projected->>'status'='frozen' then
    return jsonb_build_object('status','stale_state');
  end if;

  adjustment_id:=gen_random_uuid();
  insert into public.subscription_manual_date_adjustments(id,workspace_id,client_id,subscription_id,
    new_service_start_date,new_service_end_exclusive,request_key,actor_user_id,recorded_at)
  values(adjustment_id,ws,cid,sid,start_on,end_on,key,auth.uid(),sampled);
  receipt:=jsonb_build_object('operation_id',adjustment_id,'workspace_id',ws,'client_id',cid,
    'subscription_id',sid,'new_service_start_date',start_on::text,
    'new_service_end_exclusive',end_on::text);
  result:=jsonb_build_object('status','ok','receipt',receipt);
  return result;
exception
  when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow
    or invalid_datetime_format then return jsonb_build_object('status','invalid_input');
  when others then return jsonb_build_object('status','unavailable');
end $$;

alter function public.record_subscription_date_adjustment(jsonb) owner to postgres;
revoke all on function public.record_subscription_date_adjustment(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_subscription_date_adjustment(jsonb) to authenticated;
