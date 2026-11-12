-- F13 review fixes: shared operation revisions, effective-date projection, upgrade validation/anchors, and immutable commission history.

-- FR-027/030/037/038/039/040/042; SC-015/017/018/020/021/022/024/027/028/029/030/031/032/033/034.

create or replace function public.record_renewal(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  ws uuid; cid uuid; predecessor_id uuid; requested_offer_id uuid; request_id uuid;
  expected integer; c public.clients%rowtype; predecessor public.subscriptions%rowtype;
  offer public.package_offers%rowtype; version public.package_versions%rowtype;
  previous app_private.subscription_renewal_operations%rowtype;
  canonical jsonb; binding bytea; sampled timestamptz; recording date; start_on date; end_on date;
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
    if previous.workspace_id<>ws or previous.client_id<>cid or previous.canonical_args_hash is distinct from binding then return jsonb_build_object('status','conflict'); end if;
    return previous.result_receipt;
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
end $$;

alter function public.record_renewal(jsonb) owner to postgres;
revoke all on function public.record_renewal(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_renewal(jsonb) to authenticated;

create or replace function app_private.f13_project_entitlement(ws uuid,sid uuid,as_of date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare sub public.subscriptions%rowtype; activation public.subscription_activations%rowtype;
  manual_adjustment public.subscription_manual_date_adjustments%rowtype; upgrade_row public.subscription_upgrades%rowtype;
  term record; term_start date; term_end date; next_start date; next_end date; term_days integer;
  last_end date; first_start date; has_current boolean:=false; coverage_end date;
  frozen boolean:=false; projected text; remove_floor date; contribution integer;
  anchor_time timestamptz; previous_end date; base_end date;
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
  elsif manual_adjustment.id is not null then
    term_start:=manual_adjustment.new_service_start_date;
    term_end:=manual_adjustment.new_service_end_exclusive;
    anchor_time:=manual_adjustment.recorded_at;
  else
    term_start:=(activation.activated_at at time zone 'Africa/Cairo')::date;
    term_end:=term_start+sub.duration_days;
    anchor_time:=activation.activated_at;
  end if;
  base_end:=term_end;
  loop
    previous_end:=term_end;
    contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer
      from public.subscription_freezes f
      where f.workspace_id=ws and f.subscription_id=sid and f.recorded_at>anchor_time
        and f.applied_on>=term_start and f.applied_on<term_end),0);
    select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor
      from public.subscription_freeze_events e
      where e.workspace_id=ws and e.subscription_id=sid and e.kind='remove' and e.recorded_at>anchor_time;
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
    next_start:=greatest(term.projected_start,last_end); next_end:=next_start+term_days;
    base_end:=next_end;
    loop
      previous_end:=next_end;
      contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer
        from public.subscription_freezes f
        where f.workspace_id=ws and f.subscription_id=sid and f.recorded_at>anchor_time
          and f.applied_on>=next_start and f.applied_on<next_end),0);
      select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor
        from public.subscription_freeze_events e
        where e.workspace_id=ws and e.subscription_id=sid and e.kind='remove' and e.recorded_at>anchor_time;
      next_end:=greatest(base_end+contribution,coalesce(remove_floor,base_end));
      exit when next_end=previous_end;
    end loop;
    if as_of>=next_start and as_of<next_end then has_current:=true; coverage_end:=next_end;
    elsif has_current and next_start<=coverage_end then coverage_end:=greatest(coverage_end,next_end);
    elsif has_current and next_start>coverage_end then has_current:=false; coverage_end:=null; end if;
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
end $$;

alter function app_private.f13_project_entitlement(uuid,uuid,date) owner to postgres;
revoke all on function app_private.f13_project_entitlement(uuid,uuid,date) from public,anon,authenticated,service_role;
grant execute on function app_private.f13_project_entitlement(uuid,uuid,date) to service_role;

create or replace function app_private.f13_reflow_unstarted_renewal() returns trigger
language plpgsql security definer set search_path='' as $$
declare ws uuid; sid uuid; source_id uuid; renewal record; projection jsonb;
  predecessor_end date; next_start date; next_end date; old_start date; old_end date; next_revision integer:=0;
  sub public.subscriptions%rowtype; activation public.subscription_activations%rowtype;
  manual_adjustment public.subscription_manual_date_adjustments%rowtype; upgrade_row public.subscription_upgrades%rowtype;
  term_start date; term_end date; anchor_time timestamptz; previous_end date; base_end date;
  remove_floor date; contribution integer; term_days integer;
  today_cairo date := (clock_timestamp() at time zone 'Africa/Cairo')::date;
begin
  ws:=new.workspace_id; sid:=new.subscription_id; source_id:=new.id;
  select * into strict sub from public.subscriptions s where s.workspace_id=ws and s.id=sid;
  select * into strict activation from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=sid;
  select * into manual_adjustment from public.subscription_manual_date_adjustments d
    where d.workspace_id=ws and d.subscription_id=sid order by d.recorded_at desc,d.id desc limit 1;
  select * into upgrade_row from public.subscription_upgrades u
    where u.workspace_id=ws and u.subscription_id=sid order by u.expected_revision desc,u.id desc limit 1;
  if upgrade_row.id is not null and (manual_adjustment.id is null or upgrade_row.recorded_at>manual_adjustment.recorded_at) then
    term_start:=coalesce(upgrade_row.service_start_date,(activation.activated_at at time zone 'Africa/Cairo')::date);
    term_end:=coalesce(upgrade_row.service_end_exclusive,term_start+upgrade_row.duration_days);
    anchor_time:=upgrade_row.recorded_at;
  elsif manual_adjustment.id is not null then
    term_start:=manual_adjustment.new_service_start_date;
    term_end:=manual_adjustment.new_service_end_exclusive;
    anchor_time:=manual_adjustment.recorded_at;
  else
    term_start:=(activation.activated_at at time zone 'Africa/Cairo')::date;
    term_end:=term_start+sub.duration_days;
    anchor_time:=activation.activated_at;
  end if;
  base_end:=term_end;
  loop
    previous_end:=term_end;
    contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer
      from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=sid and f.recorded_at>anchor_time
        and f.applied_on>=term_start and f.applied_on<term_end),0);
    select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor
      from public.subscription_freeze_events e where e.workspace_id=ws and e.subscription_id=sid
        and e.kind='remove' and e.recorded_at>anchor_time;
    term_end:=greatest(base_end+contribution,coalesce(remove_floor,base_end));
    exit when term_end=previous_end;
  end loop;
  predecessor_end:=term_end;
  for renewal in select r.*,coalesce(d.service_start_date,r.service_start_date) as prior_start,
      coalesce(d.service_end_exclusive,r.service_end_exclusive) as prior_end
    from public.subscription_renewals r left join lateral (
      select x.service_start_date,x.service_end_exclusive from public.subscription_renewal_date_revisions x
      where x.workspace_id=r.workspace_id and x.subscription_id=r.subscription_id and x.renewal_id=r.id
      order by x.revision desc limit 1) d on true
    where r.workspace_id=ws and r.subscription_id=sid and r.predecessor_subscription_id=sid
      and r.recorded_at>anchor_time order by r.expected_revision loop
    old_start:=renewal.prior_start; old_end:=renewal.prior_end;
    term_days:=renewal.service_end_exclusive-renewal.service_start_date;
    next_start:=case when old_start<=today_cairo then old_start
      else greatest(renewal.recording_date,predecessor_end) end;
    next_end:=next_start+term_days;
    if next_start is distinct from old_start or next_end is distinct from old_end then
      if old_start<=today_cairo and next_start is distinct from old_start then
        raise exception 'renewal_reflow_started' using errcode='23514';
      end if;
      select coalesce(max(revision),0)+1 into next_revision from public.subscription_renewal_date_revisions where workspace_id=ws and subscription_id=sid;
      insert into public.subscription_renewal_date_revisions(workspace_id,subscription_id,renewal_id,revision,
        service_start_date,service_end_exclusive,cause_table,cause_id,recorded_by)
      values(ws,sid,renewal.id,next_revision,next_start,next_end,tg_table_name,source_id,auth.uid());
    end if;
    base_end:=next_end;
    loop
      previous_end:=next_end;
      contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer
        from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=sid
          and f.recorded_at>anchor_time and f.applied_on>=next_start and f.applied_on<next_end),0);
      select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor
        from public.subscription_freeze_events e where e.workspace_id=ws and e.subscription_id=sid
          and e.kind='remove' and e.recorded_at>anchor_time;
      next_end:=greatest(base_end+contribution,coalesce(remove_floor,base_end));
      exit when next_end=previous_end;
    end loop;
    predecessor_end:=next_end;
  end loop;
  return new;
end $$;

alter function app_private.f13_reflow_unstarted_renewal() owner to postgres;
revoke all on function app_private.f13_reflow_unstarted_renewal() from public,anon,authenticated,service_role;

create or replace function public.record_subscription_upgrade(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare ws uuid; cid uuid; sid uuid; requested_offer_id uuid; key uuid; expected integer;
  c public.clients%rowtype; s public.subscriptions%rowtype; offer public.package_offers%rowtype;
  target_version public.package_versions%rowtype; base_version public.package_versions%rowtype; base_offer public.package_offers%rowtype;
  latest_renewal public.subscription_renewals%rowtype;
  previous_op app_private.subscription_upgrade_operations%rowtype; previous_upgrade public.subscription_upgrades%rowtype;
  activation public.subscription_activations%rowtype; manual_adjustment public.subscription_manual_date_adjustments%rowtype;
  projected jsonb; canonical jsonb; binding bytea; sampled timestamptz; today date; revision integer;
  credit bigint; additional bigint; commission bigint; start_on date; end_on date;
  operation_id uuid; upgrade_id uuid; receipt jsonb; result jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('status','not_permitted'); end if;
  if jsonb_typeof(request) is distinct from 'object'
    or coalesce((request->>'workspace_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',true) then
    return jsonb_build_object('status','not_permitted'); end if;
  ws:=(request->>'workspace_id')::uuid;
  if not app_private.f13_actor_preflight(ws,'record_payment',false) then return jsonb_build_object('status','not_permitted'); end if;
  if (select count(*) from jsonb_object_keys(request))<>7
    or exists(select 1 from jsonb_object_keys(request) k where k not in
      ('workspace_id','client_id','subscription_id','package_offer_id','request_key','expected_revision','upgrade_confirmed'))
    or coalesce((request->>'client_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',true)
    or coalesce((request->>'subscription_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',true)
    or coalesce((request->>'package_offer_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',true)
    or coalesce((request->>'request_key')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',true)
    or coalesce((request->>'expected_revision')!~'^(0|[1-9][0-9]{0,8})$',true)
    or request->'upgrade_confirmed' is distinct from 'true'::jsonb then return jsonb_build_object('status','invalid_input'); end if;
  cid:=(request->>'client_id')::uuid; sid:=(request->>'subscription_id')::uuid;
  requested_offer_id:=(request->>'package_offer_id')::uuid; key:=(request->>'request_key')::uuid; expected:=(request->>'expected_revision')::integer;
  if not app_private.f12_actor_allowed(ws,'record_payment',false) then return jsonb_build_object('status','not_permitted'); end if;
  canonical:=jsonb_build_array(1,ws::text,cid::text,sid::text,requested_offer_id::text,expected,true);
  binding:=extensions.digest(convert_to(canonical::text,'UTF8'),'sha256');
  select * into c from public.clients x where x.workspace_id=ws and x.id=cid for update;
  if not found then return jsonb_build_object('status','not_permitted'); end if;
  select * into s from public.subscriptions x where x.workspace_id=ws and x.client_id=cid and x.id=sid for update;
  if not found then return jsonb_build_object('status','not_permitted'); end if;
  perform i.id from public.subscription_installments i where i.workspace_id=ws and i.subscription_id=sid order by i.seq,i.id for update;
  if not app_private.f12_actor_allowed(ws,'record_payment',false) then return jsonb_build_object('status','not_permitted'); end if;
  perform pg_advisory_xact_lock(hashtextextended('lifter.f13.upgrade:'||auth.uid()::text||':'||key::text,0));
  if not app_private.f12_actor_allowed(ws,'record_payment',false) then return jsonb_build_object('status','not_permitted'); end if;
  select * into previous_op from app_private.subscription_upgrade_operations o where o.actor_user_id=auth.uid() and o.request_key=key;
  if found then
    if previous_op.workspace_id<>ws or previous_op.client_id<>cid or previous_op.subscription_id<>sid
      or previous_op.canonical_args_hash is distinct from binding then return jsonb_build_object('status','conflict'); end if;
    return previous_op.result_receipt;
  end if;
  select count(*)::integer into revision from public.subscription_renewals r
    where r.workspace_id=ws and r.subscription_id=sid;
  revision:=revision+(select count(*)::integer from public.subscription_upgrades u where u.workspace_id=ws and u.subscription_id=sid);
  sampled:=clock_timestamp(); today:=(sampled at time zone 'Africa/Cairo')::date;
  if c.deactivated_at is not null or c.approval_state<>'approved' or s.kind<>'initial'
    or exists(select 1 from public.refund_operations r where r.workspace_id=ws and r.subscription_id=sid)
    or expected<>revision then return jsonb_build_object('status','stale_state'); end if;
  select * into offer from public.package_offers o where o.workspace_id=ws and o.id=requested_offer_id and o.available is true;
  if not found then return jsonb_build_object('status','stale_state'); end if;
  select * into target_version from public.package_versions v where v.workspace_id=ws and v.id=offer.current_version_id and v.offer_id=requested_offer_id;
  if not found then return jsonb_build_object('status','stale_state'); end if;
  select * into previous_upgrade from public.subscription_upgrades u where u.workspace_id=ws and u.subscription_id=sid
    order by u.expected_revision desc,u.id desc limit 1;
  if previous_upgrade.id is not null then
    select * into base_version from public.package_versions v where v.workspace_id=ws and v.id=previous_upgrade.package_version_id;
    select * into base_offer from public.package_offers o where o.workspace_id=ws and o.id=previous_upgrade.package_offer_id;
  else
    select * into base_version from public.package_versions v where v.workspace_id=ws and v.id=s.package_version_id;
    select * into base_offer from public.package_offers o where o.workspace_id=ws and o.id=base_version.offer_id;
  end if;
  if target_version.price_minor<base_version.price_minor then return jsonb_build_object('status','invalid_input'); end if;
  if target_version.currency<>s.currency then return jsonb_build_object('status','invalid_input'); end if;
  if offer.tier_rank<base_offer.tier_rank
    or (offer.tier_rank=base_offer.tier_rank and target_version.duration_days<=base_version.duration_days)
    then return jsonb_build_object('status','invalid_input'); end if;
  projected:=app_private.f13_project_entitlement(ws,sid,today);
  if projected->>'status' in ('frozen','expired','refunded') then return jsonb_build_object('status','stale_state'); end if;
  select * into activation from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=sid;
  if not found then start_on:=null; end_on:=null;
  else
    select * into manual_adjustment from public.subscription_manual_date_adjustments d where d.workspace_id=ws and d.subscription_id=sid
      order by d.recorded_at desc,d.id desc limit 1;
    if manual_adjustment.id is not null and (previous_upgrade.id is null or manual_adjustment.recorded_at>previous_upgrade.recorded_at) then
      start_on:=manual_adjustment.new_service_start_date;
    elsif previous_upgrade.id is not null then start_on:=(activation.activated_at at time zone 'Africa/Cairo')::date;
    else start_on:=(activation.activated_at at time zone 'Africa/Cairo')::date; end if;
    select * into latest_renewal from public.subscription_renewals r where r.workspace_id=ws and r.subscription_id=sid
      order by r.expected_revision desc limit 1;
    if latest_renewal.id is not null and latest_renewal.service_start_date=latest_renewal.recording_date
      and (manual_adjustment.id is null or latest_renewal.recorded_at>manual_adjustment.recorded_at)
      and (previous_upgrade.id is null or latest_renewal.recorded_at>previous_upgrade.recorded_at) then
      start_on:=latest_renewal.service_start_date;
    end if;
    if projected->>'status'='expired' then
      select r.service_start_date into start_on from public.subscription_renewals r where r.workspace_id=ws and r.subscription_id=sid
        order by r.expected_revision desc limit 1;
      start_on:=coalesce(start_on,today);
    elsif offer.tier_rank>base_offer.tier_rank and target_version.duration_days<base_version.duration_days then start_on:=today; end if;
    end_on:=start_on+target_version.duration_days;
  end if;
  if exists(select 1 from public.subscription_renewals r where r.workspace_id=ws and r.subscription_id=sid) then
    select coalesce(sum(case when tail.kind='collection' then tail.amount_minor else 0 end),0)::bigint into credit
    from public.subscription_installments i left join lateral (select e.kind,e.amount_minor from public.payment_events e
      where e.workspace_id=i.workspace_id and e.obligation_id=i.id order by e.revision desc limit 1) tail on true
    where i.workspace_id=ws and i.subscription_id=sid and i.renewal_id is null;
  elsif previous_upgrade.id is not null then credit:=previous_upgrade.package_price_minor;
  else
    select coalesce(sum(case when tail.kind='collection' then tail.amount_minor else 0 end),0)::bigint into credit
    from public.subscription_installments i left join lateral (select e.kind,e.amount_minor from public.payment_events e
      where e.workspace_id=i.workspace_id and e.obligation_id=i.id order by e.revision desc limit 1) tail on true
    where i.workspace_id=ws and i.subscription_id=sid and i.renewal_id is null;
  end if;
  if target_version.price_minor<credit then return jsonb_build_object('status','invalid_input'); end if;
  additional:=target_version.price_minor-credit;
  commission:=case when additional=0 then 0
    else app_private.f12_commission_minor(additional,target_version.commission_rate_bp) end;
  operation_id:=gen_random_uuid(); upgrade_id:=gen_random_uuid();
  receipt:=jsonb_build_object('operation_id',operation_id,'upgrade_id',upgrade_id,'workspace_id',ws,'client_id',cid,
    'subscription_id',sid,'package_offer_id',requested_offer_id,'package_version_id',target_version.id,
    'tier_rank',offer.tier_rank,'package_price_minor',target_version.price_minor::text,
    'credit_minor',credit::text,'additional_payment_minor',additional::text,'currency',target_version.currency,
    'commission_rate_bp',target_version.commission_rate_bp,'commission_minor',commission::text,
    'service_start_date',start_on,'service_end_exclusive',end_on);
  result:=jsonb_build_object('status','ok','receipt',receipt);
  insert into app_private.subscription_upgrade_operations(id,workspace_id,client_id,subscription_id,actor_user_id,request_key,
    expected_revision,canonical_args_hash,result_receipt,recorded_at,transaction_id)
    values(operation_id,ws,cid,sid,auth.uid(),key,expected,binding,result,sampled,pg_current_xact_id());
  insert into public.subscription_upgrades(id,workspace_id,client_id,subscription_id,operation_id,package_offer_id,package_version_id,
    tier_rank,package_price_minor,currency,commission_rate_bp,duration_days,credit_minor,additional_payment_minor,commission_minor,
    service_start_date,service_end_exclusive,expected_revision,recorded_by,recorded_at)
    values(upgrade_id,ws,cid,sid,operation_id,requested_offer_id,target_version.id,offer.tier_rank,target_version.price_minor,
      target_version.currency,target_version.commission_rate_bp,target_version.duration_days,credit,additional,commission,
      start_on,end_on,revision,auth.uid(),sampled);
  return result;
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format
  then return jsonb_build_object('status','invalid_input');
when others then return jsonb_build_object('status','unavailable');
end $$;

alter function public.record_subscription_upgrade(jsonb) owner to postgres;
revoke all on function public.record_subscription_upgrade(jsonb) from public,anon,service_role;
grant execute on function public.record_subscription_upgrade(jsonb) to authenticated;

create or replace function public.subscription_commission(workspace_id uuid,subscription_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not app_private.f12_u5_authorized(workspace_id,'record_payment',true) then return jsonb_build_object('status','not_permitted'); end if;
  select jsonb_agg(case when q.source_upgrade_id is null then
      jsonb_build_object('event_id',q.event_id,'installment_seq',q.installment_seq,
        'revision',q.revision,'kind',q.kind,'rate_bp',q.rate_bp,'commission_minor',q.commission_minor,
        'reverses_event_id',q.reverses_event_id,'source_collection_event_id',q.source_collection_event_id,
        'refund_operation_id',q.refund_operation_id)
    else
      jsonb_build_object('event_id',q.event_id,'installment_seq',q.installment_seq,
        'revision',q.revision,'kind',q.kind,'rate_bp',q.rate_bp,'commission_minor',q.commission_minor,
        'reverses_event_id',q.reverses_event_id,'source_collection_event_id',q.source_collection_event_id,
        'refund_operation_id',q.refund_operation_id,'source_upgrade_id',q.source_upgrade_id)
    end order by q.installment_seq,q.recorded_at,q.event_id)
  into result from (
    select e.id as event_id,e.installment_seq,e.revision,e.kind,
      case when i.renewal_id is null then s.commission_rate_bp else i.renewal_commission_rate_bp end as rate_bp,
      e.commission_minor::text as commission_minor,e.reverses_event_id,null::uuid as source_collection_event_id,
      null::uuid as refund_operation_id,null::uuid as source_upgrade_id,e.recorded_at
    from public.payment_events e
    join public.subscriptions s on s.workspace_id=e.workspace_id and s.id=e.subscription_id
    join public.subscription_installments i on i.workspace_id=e.workspace_id
      and i.subscription_id=e.subscription_id and i.id=e.obligation_id
    where e.workspace_id=subscription_commission.workspace_id and e.subscription_id=subscription_commission.subscription_id
    union all
    select u.id,null::integer,u.expected_revision,'upgrade_purchase',u.commission_rate_bp,
      u.commission_minor::text,null::uuid,null::uuid,null::uuid,u.id,u.recorded_at
    from public.subscription_upgrades u
    where u.workspace_id=subscription_commission.workspace_id and u.subscription_id=subscription_commission.subscription_id
    union all
    select a.id,i.seq,null::integer,'refund_allocation',
      case when a.source_upgrade_id is not null then u.commission_rate_bp
        when i.renewal_id is not null then i.renewal_commission_rate_bp else s.commission_rate_bp end as rate_bp,
      a.commission_minor::text,null::uuid,a.source_collection_event_id,a.refund_operation_id,
      a.source_upgrade_id,a.recorded_at
    from public.refund_allocation_events a
    join public.subscriptions s on s.workspace_id=a.workspace_id and s.id=a.subscription_id
    left join public.subscription_installments i on i.workspace_id=a.workspace_id
      and i.subscription_id=a.subscription_id and i.id=a.obligation_id
    left join public.subscription_upgrades u on u.workspace_id=a.workspace_id
      and u.subscription_id=a.subscription_id and u.id=a.source_upgrade_id
    where a.workspace_id=subscription_commission.workspace_id and a.subscription_id=subscription_commission.subscription_id
  ) q;
  if result is null then return jsonb_build_object('status','not_permitted'); end if;
  return jsonb_build_object('status','ok','events',result);
end $$;


alter function public.subscription_commission(uuid,uuid) owner to postgres;
revoke all on function public.subscription_commission(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.subscription_commission(uuid,uuid) to authenticated;
