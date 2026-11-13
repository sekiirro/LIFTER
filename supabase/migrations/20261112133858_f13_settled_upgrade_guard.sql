-- S51-PO-1: reject upgrades unless every existing installment is fully settled after the shared payment locks.
create or replace function public.record_subscription_upgrade(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
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
      base_end:=coalesce(previous_upgrade.service_end_exclusive,
        coalesce(previous_upgrade.service_start_date,(activation.activated_at at time zone 'Africa/Cairo')::date)+previous_upgrade.duration_days);
    else
      start_on:=(activation.activated_at at time zone 'Africa/Cairo')::date;
      base_end:=start_on+s.duration_days;
    end if;
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
    extension_days:=greatest(0,coalesce((projected->>'effective_end_exclusive')::date-greatest(today,base_end),0));
    end_on:=end_on+extension_days;
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
    'commission_rate_bp',s.commission_rate_bp,'commission_minor',commission::text,
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
end $$;

alter function public.record_subscription_upgrade(jsonb) owner to postgres;
revoke all on function public.record_subscription_upgrade(jsonb) from public,anon,service_role;
grant execute on function public.record_subscription_upgrade(jsonb) to authenticated;