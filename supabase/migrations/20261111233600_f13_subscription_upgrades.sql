-- F13 T042: append-only upgrade purchase facts and one-row subscription continuity.
-- FR-037/038; SC-015/017/020/023/024/027/028/029/030/032/034.

create table app_private.subscription_upgrade_operations (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  subscription_id uuid not null,
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  request_key uuid not null,
  expected_revision integer not null check(expected_revision>=0),
  canonical_args_hash bytea not null check(octet_length(canonical_args_hash)=32),
  result_receipt jsonb not null check(jsonb_typeof(result_receipt)='object'),
  recorded_at timestamptz not null check(isfinite(recorded_at)),
  transaction_id xid8 not null,
  unique(actor_user_id,request_key),
  unique(workspace_id,id),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(workspace_id,subscription_id,client_id) references public.subscriptions(workspace_id,id,client_id) on delete restrict
);

create table public.subscription_upgrades (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  subscription_id uuid not null,
  operation_id uuid not null,
  package_offer_id uuid not null,
  package_version_id uuid not null,
  tier_rank smallint not null check(tier_rank between 1 and 3),
  package_price_minor bigint not null check(package_price_minor>0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  commission_rate_bp integer not null check(commission_rate_bp between 0 and 10000),
  duration_days integer not null check(duration_days>0),
  credit_minor bigint not null check(credit_minor>=0),
  additional_payment_minor bigint not null check(additional_payment_minor>=0),
  commission_minor bigint not null check(commission_minor>=0),
  service_start_date date,
  service_end_exclusive date,
  expected_revision integer not null check(expected_revision>=0),
  recorded_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  recorded_at timestamptz not null check(isfinite(recorded_at)),
  unique(workspace_id,id),
  unique(workspace_id,subscription_id,expected_revision),
  unique(workspace_id,operation_id),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(workspace_id,subscription_id,client_id) references public.subscriptions(workspace_id,id,client_id) on delete restrict,
  foreign key(workspace_id,operation_id) references app_private.subscription_upgrade_operations(workspace_id,id) on delete restrict deferrable initially deferred,
  foreign key(workspace_id,package_offer_id) references public.package_offers(workspace_id,id) on delete restrict,
  foreign key(workspace_id,package_version_id,package_offer_id) references public.package_versions(workspace_id,id,offer_id) on delete restrict,
  check(additional_payment_minor=package_price_minor-credit_minor),
  check((service_start_date is null and service_end_exclusive is null)
    or (service_start_date is not null and service_end_exclusive>service_start_date))
);

do $$ declare t text; begin
  foreach t in array array['app_private.subscription_upgrade_operations','public.subscription_upgrades'] loop
    execute format('alter table %s owner to postgres',t);
    execute format('revoke all on %s from public,anon,authenticated,service_role',t);
    execute format('alter table %s enable row level security',t);
    execute format('alter table %s force row level security',t);
  end loop;
end $$;

create function app_private.f13_guard_subscription_upgrade() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op<>'INSERT' or auth.uid() is null
    or not exists(select 1 from app_private.subscription_upgrade_operations o
      where o.workspace_id=new.workspace_id and o.id=new.operation_id
        and o.actor_user_id=auth.uid() and o.transaction_id=pg_current_xact_id()) then
    raise exception 'immutable_subscription_upgrade' using errcode='23514';
  end if;
  return new;
end $$;
alter function app_private.f13_guard_subscription_upgrade() owner to postgres;
revoke all on function app_private.f13_guard_subscription_upgrade() from public,anon,authenticated,service_role;
create trigger f13_subscription_upgrade_guard before insert or update or delete on public.subscription_upgrades
  for each row execute function app_private.f13_guard_subscription_upgrade();
create trigger f13_subscription_upgrade_no_truncate before truncate on public.subscription_upgrades
  for each statement execute function app_private.forbid_delete();
create trigger f13_upgrade_operation_no_update before update on app_private.subscription_upgrade_operations
  for each row execute function app_private.audit_events_immutable();
create trigger f13_upgrade_operation_no_delete before delete on app_private.subscription_upgrade_operations
  for each row execute function app_private.forbid_delete();
create trigger f13_upgrade_operation_no_truncate before truncate on app_private.subscription_upgrade_operations
  for each statement execute function app_private.forbid_delete();

create function app_private.f13_audit_subscription_upgrade() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(auth.uid(),'subscription.upgraded','subscription_upgrades',new.id,new.workspace_id,
      jsonb_build_object('client_id',new.client_id,'subscription_id',new.subscription_id,
        'package_version_id',new.package_version_id,'tier_rank',new.tier_rank,
        'package_price_minor',new.package_price_minor::text,'credit_minor',new.credit_minor::text,
        'additional_payment_minor',new.additional_payment_minor::text,'currency',new.currency,
        'commission_minor',new.commission_minor::text,'service_start_date',new.service_start_date,
        'service_end_exclusive',new.service_end_exclusive));
  return new;
end $$;
alter function app_private.f13_audit_subscription_upgrade() owner to postgres;
revoke all on function app_private.f13_audit_subscription_upgrade() from public,anon,authenticated,service_role;
create trigger f13_subscription_upgrade_audit after insert on public.subscription_upgrades
  for each row execute function app_private.f13_audit_subscription_upgrade();

create or replace function app_private.f13_project_entitlement(ws uuid,sid uuid,as_of date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare sub public.subscriptions%rowtype; activation public.subscription_activations%rowtype;
  manual_adjustment public.subscription_manual_date_adjustments%rowtype; upgrade_row public.subscription_upgrades%rowtype;
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
    where d.workspace_id=ws and d.subscription_id=sid order by d.recorded_at desc,d.id desc limit 1;
  select * into upgrade_row from public.subscription_upgrades u
    where u.workspace_id=ws and u.subscription_id=sid order by u.expected_revision desc,u.id desc limit 1;
  if upgrade_row.id is not null and (manual_adjustment.id is null or upgrade_row.recorded_at>manual_adjustment.recorded_at) then
    term_start:=coalesce(upgrade_row.service_start_date,(activation.activated_at at time zone 'Africa/Cairo')::date);
    term_end:=coalesce(upgrade_row.service_end_exclusive,term_start+upgrade_row.duration_days);
  elsif manual_adjustment.id is not null then
    term_start:=manual_adjustment.new_service_start_date; term_end:=manual_adjustment.new_service_end_exclusive;
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
    where r.workspace_id=ws and r.subscription_id=sid and r.predecessor_subscription_id=sid order by r.expected_revision loop
    term_days:=term.projected_end-term.projected_start;
    next_start:=greatest(term.projected_start,last_end); next_end:=next_start+term_days;
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

create function public.record_subscription_upgrade(request jsonb) returns jsonb
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
    elsif previous_upgrade.id is not null then start_on:=coalesce(previous_upgrade.service_start_date,(activation.activated_at at time zone 'Africa/Cairo')::date);
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
