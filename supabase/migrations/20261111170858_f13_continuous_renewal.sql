-- F13 T041: continue renewals on the one immutable F12 subscription.
-- Existing subscription, obligation, payment, and synthetic successor rows are
-- retained as-is. New renewal obligations carry their purchase identity.
alter table public.subscription_renewal_date_revisions
  drop constraint subscription_renewal_date_rev_workspace_id_subscription_id_fkey;
alter table public.subscription_renewals
  drop constraint subscription_renewals_workspace_id_subscription_id_key;
alter table public.subscription_renewals
  add constraint subscription_renewals_workspace_id_id_subscription_id_key
  unique(workspace_id,id,subscription_id);
alter table public.subscription_renewals
  add constraint subscription_renewals_workspace_id_subscription_id_expected_revision_key
  unique(workspace_id,subscription_id,expected_revision);

alter table public.subscription_installments
  add column renewal_id uuid,
  add column renewal_commission_rate_bp integer,
  add constraint subscription_installments_renewal_purchase_fk
    foreign key(workspace_id,renewal_id,subscription_id)
    references public.subscription_renewals(workspace_id,id,subscription_id) on delete restrict,
  add constraint subscription_installments_renewal_snapshot_check check (
    (renewal_id is null and renewal_commission_rate_bp is null)
    or (renewal_id is not null and source_kind='renewal_schedule'
      and renewal_commission_rate_bp between 0 and 10000)
  );

alter table app_private.subscription_renewal_operations
  add column renewal_id uuid,
  add column transaction_id xid8,
  add constraint subscription_renewal_operations_renewal_fk
    foreign key(workspace_id,renewal_id,subscription_id)
    references public.subscription_renewals(workspace_id,id,subscription_id) on delete restrict
    deferrable initially deferred,
  add constraint subscription_renewal_operations_linked_xact_check
    check ((renewal_id is null and transaction_id is null)
      or (renewal_id is not null and transaction_id is not null));

alter table public.subscription_renewal_date_revisions
  add column renewal_id uuid,
  add constraint subscription_renewal_date_revisions_subscription_fk
    foreign key(workspace_id,subscription_id)
    references public.subscriptions(workspace_id,id) on delete restrict,
  add constraint subscription_renewal_date_revisions_renewal_fk
    foreign key(workspace_id,renewal_id,subscription_id)
    references public.subscription_renewals(workspace_id,id,subscription_id) on delete restrict;

create or replace function app_private.f12_guard_installment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.renewal_id is not null and exists(
    select 1 from app_private.subscription_renewal_operations o
    join public.subscription_renewals r on r.workspace_id=o.workspace_id
      and r.id=o.renewal_id and r.subscription_id=o.subscription_id
    where o.workspace_id=new.workspace_id and o.subscription_id=new.subscription_id
      and o.renewal_id=new.renewal_id and o.actor_user_id=auth.uid()
      and o.transaction_id=pg_current_xact_id()
  ) then return new; end if;
  if exists(select 1 from public.subscriptions s
    join app_private.registration_decisions d on d.workspace_id=s.workspace_id and d.client_id=s.client_id
    where s.workspace_id=new.workspace_id and s.id=new.subscription_id
      and s.kind='initial' and d.transaction_id=pg_current_xact_id() and d.actor_user_id=auth.uid()
      and d.kind in ('approve','reconsider') and d.to_state='approved'
      and s.created_by=d.actor_user_id and s.created_at=now()) then return new; end if;
  if exists(select 1 from public.subscriptions s
    join app_private.subscription_renewal_operations o on o.workspace_id=s.workspace_id and o.subscription_id=s.id
    where s.workspace_id=new.workspace_id and s.id=new.subscription_id and s.kind='renewal'
      and o.actor_user_id=auth.uid()) then return new; end if;
  raise exception 'immutable_installment_schedule' using errcode='23514';
end $$;

create or replace function app_private.f13_validate_renewal(ws uuid,sid uuid,rid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.subscription_renewals%rowtype; s public.subscriptions%rowtype; v public.package_versions%rowtype; n bigint;
begin
  select * into strict s from public.subscriptions where workspace_id=ws and id=sid;
  select * into strict r from public.subscription_renewals x
    where x.workspace_id=ws and x.id=rid and x.subscription_id=sid and x.predecessor_subscription_id=sid;
  select * into strict v from public.package_versions where workspace_id=ws and id=r.package_version_id and offer_id=r.package_offer_id;
  if s.kind<>'initial' or not exists(select 1 from public.subscription_activations a
      where a.workspace_id=ws and a.subscription_id=sid)
    or not exists(select 1 from app_private.subscription_renewal_operations o
      where o.workspace_id=ws and o.renewal_id=rid and o.subscription_id=sid
        and o.predecessor_subscription_id=sid and o.expected_revision=r.expected_revision
        and o.actor_user_id=r.recorded_by)
  then raise exception 'invalid_renewal_snapshot' using errcode='23514'; end if;
  select count(*) into n from public.subscription_installments i
    where i.workspace_id=ws and i.subscription_id=sid and i.renewal_id=rid;
  if n=0 or not exists(select 1 from public.subscription_installments i
      where i.workspace_id=ws and i.subscription_id=sid and i.renewal_id=rid
      having sum(i.amount_minor::numeric)=v.price_minor and bool_and(i.currency=v.currency)
        and bool_and(i.source_kind='renewal_schedule')
        and bool_and(i.renewal_commission_rate_bp=v.commission_rate_bp)
        and bool_and(i.due_on is not distinct from r.recording_date+i.issued_day_offset))
  then raise exception 'invalid_renewal_installments' using errcode='23514'; end if;
end $$;
alter function app_private.f13_validate_renewal(uuid,uuid,uuid) owner to postgres;
revoke all on function app_private.f13_validate_renewal(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function app_private.f12_validate_subscription(ws uuid,sid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.subscriptions%rowtype; l public.registration_links%rowtype; n bigint;
begin
  select * into strict s from public.subscriptions where workspace_id=ws and id=sid;
  select l0.* into strict l from public.clients c join public.registration_links l0 on l0.workspace_id=c.workspace_id and l0.id=c.registration_link_id
    where c.workspace_id=ws and c.id=s.client_id and c.registration_link_id=s.registration_link_id and c.package_version_id=s.package_version_id;
  if (s.price_minor,s.currency,s.commission_rate_bp,s.duration_days,s.duration_months) is distinct from (l.price_minor,l.currency,l.commission_rate_bp,l.duration_days,l.duration_months) then
    raise exception 'invalid_subscription_snapshot' using errcode='23514';
  end if;
  if not exists(select 1 from public.clients c join app_private.registration_decisions d on d.workspace_id=c.workspace_id and d.client_id=c.id
    where c.workspace_id=ws and c.id=s.client_id and c.approval_state='approved' and d.to_state='approved' and d.transaction_id=pg_current_xact_id()) then
    raise exception 'missing_approval_decision' using errcode='23514';
  end if;
  if not exists(select 1 from public.subscription_installments i where i.workspace_id=ws and i.subscription_id=sid and i.renewal_id is not null) then
    select count(*) into n from public.subscription_installments i where i.workspace_id=ws and i.subscription_id=sid;
    if n=0 or not exists(select 1 from public.subscription_installments i where i.workspace_id=ws and i.subscription_id=sid
      having min(i.seq)=1 and max(i.seq)=n and sum(i.amount_minor::numeric)=s.price_minor and bool_and(i.currency=s.currency)) then
      raise exception 'invalid_installment_total' using errcode='23514';
    end if;
    if exists(select 1 from public.registration_link_installments i where i.workspace_id=ws and i.link_id=l.id) then
      if exists((select seq,amount_minor,due_offset_days from public.registration_link_installments where workspace_id=ws and link_id=l.id
        except select seq,amount_minor,issued_day_offset from public.subscription_installments where workspace_id=ws and subscription_id=sid)
        union all (select seq,amount_minor,issued_day_offset from public.subscription_installments where workspace_id=ws and subscription_id=sid
        except select seq,amount_minor,due_offset_days from public.registration_link_installments where workspace_id=ws and link_id=l.id))
        or exists(select 1 from public.subscription_installments where workspace_id=ws and subscription_id=sid and source_kind<>'issued_schedule') then
        raise exception 'invalid_issued_schedule' using errcode='23514';
      end if;
    elsif n<>1 or not exists(select 1 from public.subscription_installments where workspace_id=ws and subscription_id=sid and seq=1 and amount_minor=s.price_minor and issued_day_offset=0 and source_kind='single_payment') then
      raise exception 'invalid_single_payment' using errcode='23514';
    end if;
  else
    select count(*) into n from public.subscription_installments i where i.workspace_id=ws and i.subscription_id=sid and i.renewal_id is null;
    if n=0 or not exists(select 1 from public.subscription_installments i where i.workspace_id=ws and i.subscription_id=sid and i.renewal_id is null
      having min(i.seq)=1 and max(i.seq)=n and sum(i.amount_minor::numeric)=s.price_minor and bool_and(i.currency=s.currency)) then
      raise exception 'invalid_installment_total' using errcode='23514';
    end if;
    if exists(select 1 from public.registration_link_installments i where i.workspace_id=ws and i.link_id=l.id) then
      if exists((select seq,amount_minor,due_offset_days from public.registration_link_installments where workspace_id=ws and link_id=l.id
        except select seq,amount_minor,issued_day_offset from public.subscription_installments where workspace_id=ws and subscription_id=sid and renewal_id is null)
        union all (select seq,amount_minor,issued_day_offset from public.subscription_installments where workspace_id=ws and subscription_id=sid and renewal_id is null
        except select seq,amount_minor,due_offset_days from public.registration_link_installments where workspace_id=ws and link_id=l.id))
        or exists(select 1 from public.subscription_installments where workspace_id=ws and subscription_id=sid and renewal_id is null and source_kind<>'issued_schedule') then
        raise exception 'invalid_issued_schedule' using errcode='23514';
      end if;
    elsif n<>1 or not exists(select 1 from public.subscription_installments where workspace_id=ws and subscription_id=sid and renewal_id is null and seq=1 and amount_minor=s.price_minor and issued_day_offset=0 and source_kind='single_payment') then
      raise exception 'invalid_single_payment' using errcode='23514';
    end if;
  end if;
end $$;

create or replace function app_private.f12_check_subscription() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_subscription uuid; target_workspace uuid; purchase_id uuid;
begin
  if tg_table_name='subscriptions' then
    target_subscription:=new.id; target_workspace:=new.workspace_id; purchase_id:=null;
  else
    target_subscription:=new.subscription_id; target_workspace:=new.workspace_id; purchase_id:=new.renewal_id;
  end if;
  if purchase_id is not null then
    perform app_private.f13_validate_renewal(target_workspace,target_subscription,purchase_id);
  else
    perform app_private.f12_validate_subscription(target_workspace,target_subscription);
    if exists(select 1 from public.subscription_renewals r where r.workspace_id=target_workspace and r.subscription_id=target_subscription and r.predecessor_subscription_id=target_subscription) then
      perform app_private.f13_validate_renewal(target_workspace,target_subscription,
        (select r.id from public.subscription_renewals r where r.workspace_id=target_workspace and r.subscription_id=target_subscription and r.predecessor_subscription_id=target_subscription order by r.expected_revision desc limit 1));
    end if;
  end if;
  return new;
end $$;

create or replace function app_private.f12_validate_payment(ws uuid,eid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e public.payment_events%rowtype; p public.payment_events%rowtype; i public.subscription_installments%rowtype; s public.subscriptions%rowtype; rate integer;
begin
  select * into strict e from public.payment_events where workspace_id=ws and id=eid;
  select * into strict i from public.subscription_installments where workspace_id=ws and subscription_id=e.subscription_id and id=e.obligation_id;
  select * into strict s from public.subscriptions where workspace_id=ws and id=e.subscription_id;
  if e.currency<>i.currency or e.installment_seq<>i.seq then raise exception 'invalid_payment_binding' using errcode='23514'; end if;
  if e.previous_event_id is not null then
    select * into strict p from public.payment_events where workspace_id=ws and subscription_id=e.subscription_id and obligation_id=e.obligation_id and id=e.previous_event_id;
    if e.revision<>p.revision+1 or e.kind=p.kind then raise exception 'invalid_payment_chain' using errcode='23514'; end if;
  elsif e.revision<>1 or e.kind<>'collection' then raise exception 'invalid_payment_root' using errcode='23514'; end if;
  if i.renewal_id is null then
    if e.kind='collection' then
      if e.amount_minor<>i.amount_minor or e.commission_minor<>app_private.f12_commission_minor(i.amount_minor,s.commission_rate_bp)
        or e.collected_on>(e.recorded_at at time zone 'Africa/Cairo')::date then
        raise exception 'invalid_collection_value' using errcode='23514'; end if;
    elsif e.amount_minor<>-p.amount_minor or e.commission_minor<>-p.commission_minor
      or e.currency<>p.currency or e.collected_on is not null or e.effective_on<>(e.recorded_at at time zone 'Africa/Cairo')::date then
      raise exception 'invalid_correction_value' using errcode='23514';
    end if;
  else
    select i.renewal_commission_rate_bp into strict rate;
    if e.kind='collection' then
      if e.amount_minor<>i.amount_minor or e.commission_minor<>app_private.f12_commission_minor(i.amount_minor,rate)
        or e.collected_on>(e.recorded_at at time zone 'Africa/Cairo')::date then
        raise exception 'invalid_collection_value' using errcode='23514'; end if;
    elsif e.amount_minor<>-p.amount_minor or e.commission_minor<>-p.commission_minor
      or e.currency<>p.currency or e.collected_on is not null or e.effective_on<>(e.recorded_at at time zone 'Africa/Cairo')::date then
      raise exception 'invalid_correction_value' using errcode='23514';
    end if;
  end if;
end $$;

-- The renewal-rate branch is the only behavioral extension to F12 collection.
create or replace function app_private.f12_u4_operation(kind text,request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ws uuid; cid uuid; sid uuid; oid uuid; key uuid; canonical jsonb; binding bytea;
  c public.clients%rowtype; s public.subscriptions%rowtype; i public.subscription_installments%rowtype;
  tail public.payment_events%rowtype; previous app_private.registration_operations%rowtype;
  opid uuid; eid uuid; sampled timestamptz; amount bigint; commission bigint; collected date; effective date; receipt jsonb; result jsonb; rate integer;
begin
  if auth.uid() is null then return jsonb_build_object('status','not_permitted'); end if;
  if jsonb_typeof(request) is distinct from 'object'
    or jsonb_typeof(request->'workspace_id') is distinct from 'string' or jsonb_typeof(request->'client_id') is distinct from 'string'
    or (request->>'workspace_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'client_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('status','invalid_input','fields','[]'::jsonb); end if;
  ws:=(request->>'workspace_id')::uuid; cid:=(request->>'client_id')::uuid;
  if not app_private.f12_u4_can_pay(ws,kind='correct') then return jsonb_build_object('status','not_permitted'); end if;
  canonical:=app_private.f12_u4_canonical(kind,request);
  if canonical is null then return jsonb_build_object('status','invalid_input','fields','[]'::jsonb); end if;
  sid:=(canonical->>'subscription_id')::uuid; oid:=(canonical->>'obligation_id')::uuid; key:=(canonical->>'request_key')::uuid;
  binding:=extensions.digest(convert_to(jsonb_build_array(1,kind,ws::text,cid::text,null::text,
    sid::text,oid::text,canonical->>'original_event_id',canonical->'expected_installment_seq',canonical->'expected_revision',canonical->>'expected_previous_event_id',
    canonical->>'expected_amount_minor',canonical->>'currency',canonical->>'collected_on',
    case when kind='correct' then canonical->'correction_confirmed' else canonical->'payment_confirmed' end,null::text)::text,'UTF8'),'sha256');
  select * into c from public.clients where workspace_id=ws and id=cid for update;
  if not found then return jsonb_build_object('status','not_permitted'); end if;
  select * into s from public.subscriptions where workspace_id=ws and client_id=cid and id=sid for update;
  if not found then return jsonb_build_object('status','not_permitted'); end if;
  perform x.id from public.subscription_installments x where x.workspace_id=ws and x.subscription_id=sid order by x.seq,x.id for update;
  select * into i from public.subscription_installments where workspace_id=ws and subscription_id=sid and id=oid;
  if not found then return jsonb_build_object('status','not_permitted'); end if;
  perform e.id from public.payment_events e where e.workspace_id=ws and e.subscription_id=sid order by e.obligation_id,e.revision for update;
  if not app_private.f12_actor_allowed(ws,case when kind='correct' then 'record_refund' else 'record_payment' end,kind='correct') then return jsonb_build_object('status','not_permitted'); end if;
  perform pg_advisory_xact_lock(hashtextextended('lifter.f12.operation:'||auth.uid()::text||':'||key::text,0));
  if not app_private.f12_actor_allowed(ws,case when kind='correct' then 'record_refund' else 'record_payment' end,kind='correct') then return jsonb_build_object('status','not_permitted'); end if;
  select * into previous from app_private.registration_operations o where o.actor_user_id=auth.uid() and o.request_key=key;
  if found then
    if previous.canonical_version<>1 or previous.workspace_id<>ws or previous.client_id<>cid or previous.operation<>kind or previous.canonical_args_hash is distinct from binding then
      return jsonb_build_object('status','key_conflict'); end if;
    set constraints all immediate; return previous.result_receipt;
  end if;
  if (kind='correct' and canonical->'correction_confirmed'<>'true'::jsonb) or (kind='collect' and canonical->'payment_confirmed'<>'true'::jsonb) then
    return jsonb_build_object('status','invalid_input','fields','[]'::jsonb); end if;
  select * into tail from public.payment_events e where e.workspace_id=ws and e.subscription_id=sid and e.obligation_id=oid order by revision desc limit 1;
  if c.approval_state<>'approved' or i.seq<>(canonical->>'expected_installment_seq')::integer
    or coalesce(tail.revision,0)<>(canonical->>'expected_revision')::integer
    or tail.id is distinct from (canonical->>'expected_previous_event_id')::uuid then return jsonb_build_object('status','stale_state'); end if;
  sampled:=clock_timestamp(); opid:=gen_random_uuid(); eid:=gen_random_uuid();
  if kind='collect' then
    if tail.kind='collection' then return jsonb_build_object('status','stale_state'); end if;
    if (canonical->>'expected_amount_minor')::bigint<>i.amount_minor or canonical->>'currency'<>i.currency
      or (canonical->>'collected_on')::date>(sampled at time zone 'Africa/Cairo')::date then
      return jsonb_build_object('status','invalid_input','fields','[]'::jsonb); end if;
    if i.seq>=2 and (not exists(select 1 from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=sid)
      or exists(select 1 from public.subscription_installments earlier where earlier.workspace_id=ws and earlier.subscription_id=sid and earlier.seq<i.seq
        and earlier.renewal_id is not distinct from i.renewal_id
        and (select e.kind from public.payment_events e where e.workspace_id=ws and e.subscription_id=sid and e.obligation_id=earlier.id order by e.revision desc limit 1) is distinct from 'collection')) then
      return jsonb_build_object('status','stale_state'); end if;
    amount:=i.amount_minor;
    if i.renewal_id is null then rate:=s.commission_rate_bp; else rate:=i.renewal_commission_rate_bp; end if;
    commission:=app_private.f12_commission_minor(i.amount_minor,rate);
    collected:=(canonical->>'collected_on')::date; effective:=collected;
  else
    if tail.kind is distinct from 'collection' or tail.id is distinct from (canonical->>'original_event_id')::uuid then return jsonb_build_object('status','stale_state'); end if;
    amount:=-tail.amount_minor; commission:=-tail.commission_minor; collected:=null; effective:=(sampled at time zone 'Africa/Cairo')::date;
  end if;
  set constraints all deferred;
  insert into public.payment_events(id,workspace_id,subscription_id,obligation_id,installment_seq,revision,previous_event_id,kind,reverses_event_id,
    amount_minor,currency,commission_minor,collected_on,effective_on,recorded_by,recorded_at,operation_id)
    values(eid,ws,sid,oid,i.seq,coalesce(tail.revision,0)+1,tail.id,case when kind='correct' then 'correction_reversal' else 'collection' end,
      case when kind='correct' then tail.id else null end,amount,i.currency,commission,collected,effective,auth.uid(),sampled,opid);
  receipt:=jsonb_build_object('id',opid,'operation',kind,'workspace_id',ws,'client_id',cid,'subscription_id',sid,'obligation_id',oid,'event_id',eid,
    'installment_seq',i.seq,'revision',coalesce(tail.revision,0)+1,'outcome',case when kind='correct' then 'reversed' else 'collected' end,
    'amount_minor',amount::text,'currency',i.currency,'collected_on',collected,'recorded_at',sampled);
  result:=jsonb_build_object('status','ok','receipt',receipt);
  insert into app_private.registration_operations(id,workspace_id,actor_user_id,request_key,operation,client_id,subscription_id,obligation_id,event_id,original_event_id,
    expected_installment_seq,expected_revision,expected_previous_event_id,canonical_args_hash,result_receipt,recorded_at)
    values(opid,ws,auth.uid(),key,kind,cid,sid,oid,eid,(canonical->>'original_event_id')::uuid,i.seq,coalesce(tail.revision,0),tail.id,binding,result,sampled);
  set constraints all immediate; return result;
exception when others then return jsonb_build_object('status','unavailable');
end $$;

create or replace function public.subscription_payment_status(workspace_id uuid,client_id uuid,subscription_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not app_private.f12_u5_authorized(workspace_id,'record_payment') then return jsonb_build_object('status','not_permitted'); end if;
  select jsonb_agg(jsonb_build_object(
      'obligation_id',i.id,'seq',i.seq,'amount_minor',i.amount_minor::text,'currency',i.currency,
      'revision',coalesce(t.revision,0),'tail_event_id',t.id,'kind',t.kind,
      'paid',coalesce(t.kind='collection',false),'refunded_minor',coalesce(r.principal_minor,0)::text,
      'refund_state',case when coalesce(r.principal_minor,0)=0 then 'none'
        when coalesce(r.principal_minor,0)>=coalesce(t.amount_minor,0) then 'refunded' else 'partial' end,
      'due_on',case when i.renewal_id is not null or s.kind='renewal' then i.due_on
        when i.seq=1 or a.activated_at is null then null
        else (a.activated_at at time zone 'Africa/Cairo')::date+i.issued_day_offset end,
      'collected_on',t.collected_on,'effective_on',t.effective_on,'recorded_by',t.recorded_by
    ) order by i.seq) into result
  from public.clients c join public.subscriptions s on s.workspace_id=c.workspace_id and s.client_id=c.id
  join public.subscription_installments i on i.workspace_id=s.workspace_id and i.subscription_id=s.id
  left join public.subscription_activations a on a.workspace_id=s.workspace_id and a.subscription_id=s.id
  left join lateral (select e.* from public.payment_events e where e.workspace_id=i.workspace_id and e.obligation_id=i.id order by e.revision desc limit 1) t on true
  left join lateral (select sum(-x.amount_minor) as principal_minor from public.refund_allocation_events x
    where x.workspace_id=i.workspace_id and x.subscription_id=i.subscription_id and x.obligation_id=i.id) r on true
  where c.workspace_id=subscription_payment_status.workspace_id and c.id=subscription_payment_status.client_id
    and s.id=subscription_payment_status.subscription_id;
  if result is null then return jsonb_build_object('status','not_permitted'); end if;
  return jsonb_build_object('status','ok','obligations',result);
end $$;

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
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sub public.subscriptions%rowtype; activation public.subscription_activations%rowtype;
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
  term_start:=(activation.activated_at at time zone 'Africa/Cairo')::date;
  term_end:=term_start+sub.duration_days;
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

create or replace function app_private.f13_reflow_unstarted_renewal() returns trigger
language plpgsql security definer set search_path='' as $$
declare ws uuid; sid uuid; source_id uuid; renewal record; projection jsonb;
  predecessor_end date; next_start date; next_end date; old_start date; old_end date; next_revision integer:=0;
  sub public.subscriptions%rowtype; activation public.subscription_activations%rowtype;
  term_end date; remove_floor date; contribution integer; term_days integer;
  today_cairo date := (clock_timestamp() at time zone 'Africa/Cairo')::date;
begin
  ws:=new.workspace_id; sid:=new.subscription_id; source_id:=new.id;
  select * into strict sub from public.subscriptions s where s.workspace_id=ws and s.id=sid;
  select * into strict activation from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=sid;
  predecessor_end:=(activation.activated_at at time zone 'Africa/Cairo')::date+sub.duration_days;
  contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer
    from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=sid
      and f.applied_on>=(activation.activated_at at time zone 'Africa/Cairo')::date and f.applied_on<predecessor_end),0);
  predecessor_end:=predecessor_end+contribution;
  select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor
    from public.subscription_freeze_events e where e.workspace_id=ws and e.subscription_id=sid and e.kind='remove'
      and (e.recorded_at at time zone 'Africa/Cairo')::date>=(activation.activated_at at time zone 'Africa/Cairo')::date
      and (e.recorded_at at time zone 'Africa/Cairo')::date<predecessor_end;
  if remove_floor is not null then predecessor_end:=greatest(predecessor_end,remove_floor); end if;
  for renewal in select r.*,coalesce(d.service_start_date,r.service_start_date) as prior_start,
      coalesce(d.service_end_exclusive,r.service_end_exclusive) as prior_end
    from public.subscription_renewals r left join lateral (
      select x.service_start_date,x.service_end_exclusive from public.subscription_renewal_date_revisions x
      where x.workspace_id=r.workspace_id and x.subscription_id=r.subscription_id and x.renewal_id=r.id
      order by x.revision desc limit 1) d on true
    where r.workspace_id=ws and r.subscription_id=sid and r.predecessor_subscription_id=sid order by r.expected_revision loop
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
    contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer
      from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=sid
        and f.applied_on>=next_start and f.applied_on<next_end),0);
    predecessor_end:=next_end+contribution;
    select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor
      from public.subscription_freeze_events e where e.workspace_id=ws and e.subscription_id=sid and e.kind='remove'
        and (e.recorded_at at time zone 'Africa/Cairo')::date>=next_start
        and (e.recorded_at at time zone 'Africa/Cairo')::date<predecessor_end;
    if remove_floor is not null then predecessor_end:=greatest(predecessor_end,remove_floor); end if;
  end loop;
  return new;
end $$;
alter function app_private.f13_reflow_unstarted_renewal() owner to postgres;
revoke all on function app_private.f13_reflow_unstarted_renewal() from public,anon,authenticated,service_role;

alter function app_private.f12_guard_installment() owner to postgres;
revoke all on function app_private.f12_guard_installment() from public,anon,authenticated,service_role;
alter function app_private.f12_validate_subscription(uuid,uuid) owner to postgres;
revoke all on function app_private.f12_validate_subscription(uuid,uuid) from public,anon,authenticated,service_role;
alter function app_private.f12_check_subscription() owner to postgres;
revoke all on function app_private.f12_check_subscription() from public,anon,authenticated,service_role;
alter function app_private.f12_validate_payment(uuid,uuid) owner to postgres;
revoke all on function app_private.f12_validate_payment(uuid,uuid) from public,anon,authenticated,service_role;
alter function app_private.f12_u4_operation(text,jsonb) owner to postgres;
revoke all on function app_private.f12_u4_operation(text,jsonb) from public,anon,authenticated,service_role;
alter function public.subscription_payment_status(uuid,uuid,uuid) owner to postgres;
revoke all on function public.subscription_payment_status(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.subscription_payment_status(uuid,uuid,uuid) to authenticated;
