-- F13 review corrections; function bodies are copied from live Stack C definitions.
-- FR-037..043; preserve SECURITY DEFINER, empty search_path, postgres ownership and existing grants.

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

CREATE OR REPLACE FUNCTION public.record_refund(request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  revision_count:=revision_count+(select count(*)::integer from public.subscription_upgrades u
    where u.workspace_id=ws and u.subscription_id=sid);
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
        e.amount_minor,e.commission_minor,e.currency,e.collected_on::timestamp as source_time,i.seq as source_seq,
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
        u.additional_payment_minor as amount_minor,u.commission_minor,u.currency,u.recorded_at at time zone 'Africa/Cairo' as source_time,
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
end $function$;

alter function public.record_refund(jsonb) owner to postgres;
revoke all on function public.record_refund(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_refund(jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.record_subscription_date_adjustment(request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform 1 from public.staff_profiles sp
    where sp.user_id=auth.uid() and sp.role='platform_owner'::public.staff_role
    for share;
  if not found then
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
end $function$;

alter function public.record_subscription_date_adjustment(jsonb) owner to postgres;
revoke all on function public.record_subscription_date_adjustment(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_subscription_date_adjustment(jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.record_subscription_upgrade(request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ws uuid; cid uuid; sid uuid; requested_offer_id uuid; key uuid; expected integer;
  c public.clients%rowtype; s public.subscriptions%rowtype; offer public.package_offers%rowtype;
  target_version public.package_versions%rowtype; base_version public.package_versions%rowtype; base_offer public.package_offers%rowtype;
  latest_renewal public.subscription_renewals%rowtype;
  previous_op app_private.subscription_upgrade_operations%rowtype; previous_upgrade public.subscription_upgrades%rowtype;
  activation public.subscription_activations%rowtype; manual_adjustment public.subscription_manual_date_adjustments%rowtype;
  projected jsonb; canonical jsonb; binding bytea; sampled timestamptz; today date; revision integer;
  credit bigint; additional bigint; commission bigint; start_on date; end_on date; base_end date; extension_days integer;
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
  -- F12 payment writers serialize through the client, subscription, and installment locks above.
  -- Revalidate the net immutable event stream after those locks: every issued installment must be settled.
  if exists(
    select 1 from public.subscription_installments i
    left join lateral (
      select coalesce(sum(e.amount_minor),0)::bigint as collected_minor
      from public.payment_events e
      where e.workspace_id=i.workspace_id and e.subscription_id=i.subscription_id and e.obligation_id=i.id
    ) settled on true
    where i.workspace_id=ws and i.subscription_id=sid and settled.collected_minor<>i.amount_minor
  ) then return jsonb_build_object('status','invalid_input'); end if;
  select * into activation from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=sid;
  if not found then start_on:=null; end_on:=null;
  else
    select * into manual_adjustment from public.subscription_manual_date_adjustments d where d.workspace_id=ws and d.subscription_id=sid
      order by d.recorded_at desc,d.id desc limit 1;
    if manual_adjustment.id is not null and (previous_upgrade.id is null or manual_adjustment.recorded_at>previous_upgrade.recorded_at) then
      start_on:=manual_adjustment.new_service_start_date;
      base_end:=manual_adjustment.new_service_end_exclusive;
    elsif previous_upgrade.id is not null then
      start_on:=(activation.activated_at at time zone 'Africa/Cairo')::date;
      base_end:=coalesce(previous_upgrade.service_start_date,start_on)+previous_upgrade.duration_days;
    else
      start_on:=(activation.activated_at at time zone 'Africa/Cairo')::date;
      base_end:=start_on+s.duration_days;
    end if;
    select * into latest_renewal from public.subscription_renewals r where r.workspace_id=ws and r.subscription_id=sid
      and r.service_start_date=r.recording_date
      and (manual_adjustment.id is null or r.recorded_at>manual_adjustment.recorded_at)
      order by r.expected_revision desc limit 1;
    if latest_renewal.id is not null then start_on:=latest_renewal.service_start_date; end if;
    if projected->>'status'='expired' then
      select r.service_start_date into start_on from public.subscription_renewals r where r.workspace_id=ws and r.subscription_id=sid
        order by r.expected_revision desc limit 1;
      start_on:=coalesce(start_on,today);
    elsif offer.tier_rank>base_offer.tier_rank and target_version.duration_days<base_version.duration_days then start_on:=today; end if;
    end_on:=start_on+target_version.duration_days;
    extension_days:=greatest(0,coalesce((projected->>'effective_end_exclusive')::date-greatest(today,base_end),0));
    end_on:=greatest(end_on+extension_days,
      coalesce((projected->>'effective_end_exclusive')::date,end_on));
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
    else app_private.f12_commission_minor(additional,s.commission_rate_bp) end;
  operation_id:=gen_random_uuid(); upgrade_id:=gen_random_uuid();
  receipt:=jsonb_build_object('operation_id',operation_id,'upgrade_id',upgrade_id,'workspace_id',ws,'client_id',cid,
    'subscription_id',sid,'package_offer_id',requested_offer_id,'package_version_id',target_version.id,
    'tier_rank',offer.tier_rank,'package_price_minor',target_version.price_minor::text,
    'credit_minor',credit::text,'additional_payment_minor',additional::text,'currency',target_version.currency,
    'service_start_date',start_on,'service_end_exclusive',end_on);
  result:=jsonb_build_object('status','ok','receipt',receipt);
  insert into app_private.subscription_upgrade_operations(id,workspace_id,client_id,subscription_id,actor_user_id,request_key,
    expected_revision,canonical_args_hash,result_receipt,recorded_at,transaction_id)
    values(operation_id,ws,cid,sid,auth.uid(),key,expected,binding,result,sampled,pg_current_xact_id());
  insert into public.subscription_upgrades(id,workspace_id,client_id,subscription_id,operation_id,package_offer_id,package_version_id,
    tier_rank,package_price_minor,currency,commission_rate_bp,duration_days,credit_minor,additional_payment_minor,commission_minor,
    service_start_date,service_end_exclusive,expected_revision,recorded_by,recorded_at)
    values(upgrade_id,ws,cid,sid,operation_id,requested_offer_id,target_version.id,offer.tier_rank,target_version.price_minor,
      target_version.currency,s.commission_rate_bp,target_version.duration_days,credit,additional,commission,
      start_on,end_on,revision,auth.uid(),sampled);
  return result;
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format
  then return jsonb_build_object('status','invalid_input');
when others then return jsonb_build_object('status','unavailable');
end $function$;

alter function public.record_subscription_upgrade(jsonb) owner to postgres;
revoke all on function public.record_subscription_upgrade(jsonb) from public,anon,service_role;
grant execute on function public.record_subscription_upgrade(jsonb) to authenticated;

create or replace function app_private.f13_validate_productivity_point() returns trigger
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.staff_profiles sp
      where sp.user_id=new.trainer_user_id and sp.role='trainer'::public.staff_role)
    or not exists(select 1 from public.workspace_memberships wm
      where wm.workspace_id=new.workspace_id and wm.user_id=new.trainer_user_id and wm.revoked_at is null) then
    raise exception 'invalid_input' using errcode='23514';
  end if;
  return new;
end $$;
alter function app_private.f13_validate_productivity_point() owner to postgres;
revoke all on function app_private.f13_validate_productivity_point() from public,anon,authenticated,service_role;
create trigger f13_productivity_point_validate before insert on public.trainer_productivity_points
  for each row execute function app_private.f13_validate_productivity_point();
