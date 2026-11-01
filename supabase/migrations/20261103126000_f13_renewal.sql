-- F13 renewal purchases reuse F12 subscriptions, obligations and collection RPCs.
-- This is a forward-only extension; initial registration agreements remain unchanged.
alter table public.subscriptions alter column registration_link_id drop not null;
alter table public.subscriptions drop constraint subscriptions_kind_check;
alter table public.subscriptions add constraint subscriptions_kind_check
  check (kind in ('initial','renewal'));
alter table public.subscriptions add column predecessor_subscription_id uuid;
alter table public.subscriptions add constraint subscriptions_predecessor_fk
  foreign key (workspace_id,predecessor_subscription_id)
  references public.subscriptions(workspace_id,id) on delete restrict;
alter table public.subscriptions add constraint subscriptions_package_version_fk
  foreign key (workspace_id,package_version_id)
  references public.package_versions(workspace_id,id) on delete restrict;
alter table public.subscriptions add constraint subscriptions_kind_shape_check
  check ((kind='initial' and registration_link_id is not null and predecessor_subscription_id is null)
      or (kind='renewal' and registration_link_id is null and predecessor_subscription_id is not null));

alter table public.subscription_installments add column due_on date;
alter table public.subscription_installments drop constraint subscription_installments_source_kind_check;
alter table public.subscription_installments add constraint subscription_installments_source_kind_check
  check (source_kind in ('issued_schedule','single_payment','renewal_schedule'));

create table public.subscription_renewals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  predecessor_subscription_id uuid not null,
  subscription_id uuid not null,
  package_offer_id uuid not null,
  package_version_id uuid not null,
  expected_revision integer not null check(expected_revision>=0),
  recording_date date not null check(isfinite(recording_date)),
  service_start_date date not null check(isfinite(service_start_date)),
  service_end_exclusive date not null check(isfinite(service_end_exclusive)),
  recorded_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp() check(isfinite(recorded_at)),
  unique(workspace_id,id),
  unique(workspace_id,subscription_id),
  unique(workspace_id,predecessor_subscription_id,expected_revision),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(workspace_id,predecessor_subscription_id,client_id)
    references public.subscriptions(workspace_id,id,client_id) on delete restrict,
  foreign key(workspace_id,subscription_id,client_id)
    references public.subscriptions(workspace_id,id,client_id) on delete restrict deferrable initially deferred,
  foreign key(workspace_id,package_offer_id) references public.package_offers(workspace_id,id) on delete restrict,
  foreign key(workspace_id,package_version_id,package_offer_id)
    references public.package_versions(workspace_id,id,offer_id) on delete restrict
);
create index f13_renewal_predecessor on public.subscription_renewals(workspace_id,predecessor_subscription_id,recording_date);

create table public.subscription_renewal_date_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  subscription_id uuid not null,
  revision integer not null check(revision>0),
  service_start_date date not null check(isfinite(service_start_date)),
  service_end_exclusive date not null check(isfinite(service_end_exclusive)),
  cause_table text not null check(cause_table in ('subscription_freezes','subscription_freeze_events')),
  cause_id uuid not null,
  recorded_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp() check(isfinite(recorded_at)),
  unique(workspace_id,id),
  unique(workspace_id,subscription_id,revision),
  foreign key(workspace_id,subscription_id) references public.subscription_renewals(workspace_id,subscription_id) on delete restrict,
  check(service_end_exclusive>service_start_date)
);

create table app_private.subscription_renewal_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  request_key uuid not null,
  predecessor_subscription_id uuid not null,
  subscription_id uuid not null,
  expected_revision integer not null check(expected_revision>=0),
  canonical_args_hash bytea not null check(octet_length(canonical_args_hash)=32),
  result_receipt jsonb not null check(jsonb_typeof(result_receipt)='object'),
  recorded_at timestamptz not null default clock_timestamp() check(isfinite(recorded_at)),
  unique(actor_user_id,request_key),
  unique(workspace_id,id),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(workspace_id,predecessor_subscription_id,client_id)
    references public.subscriptions(workspace_id,id,client_id) on delete restrict,
  foreign key(workspace_id,subscription_id,client_id)
    references public.subscriptions(workspace_id,id,client_id) on delete restrict deferrable initially deferred
);

do $$
declare t text;
begin
  foreach t in array array['public.subscription_renewals','public.subscription_renewal_date_revisions',
                           'app_private.subscription_renewal_operations'] loop
    execute format('alter table %s owner to postgres',t);
    execute format('revoke all on %s from public,anon,authenticated,service_role',t);
    execute format('alter table %s enable row level security',t);
    execute format('alter table %s force row level security',t);
    execute format('create trigger f13_no_update before update on %s for each row execute function app_private.audit_events_immutable()',t);
    execute format('create trigger f13_no_delete before delete on %s for each row execute function app_private.forbid_delete()',t);
    execute format('create trigger f13_no_truncate before truncate on %s for each statement execute function app_private.forbid_delete()',t);
  end loop;
end $$;

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
    or (new.price_minor,new.currency,new.commission_rate_bp,new.duration_days,new.duration_months)
      is distinct from (select v.price_minor,v.currency,v.commission_rate_bp,v.duration_days,v.duration_months
        from public.package_versions v where v.workspace_id=new.workspace_id and v.id=new.package_version_id)
    or (r.package_version_id,r.package_offer_id) is distinct from
       (new.package_version_id,(select v.offer_id from public.package_versions v where v.workspace_id=new.workspace_id and v.id=new.package_version_id)) then
    raise exception 'invalid_renewal_snapshot' using errcode='23514';
  end if;
  return new;
end $$;

create or replace function app_private.f12_guard_installment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
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

create function app_private.f13_validate_renewal(ws uuid,sid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.subscriptions%rowtype; r public.subscription_renewals%rowtype; n bigint;
begin
  select * into strict s from public.subscriptions where workspace_id=ws and id=sid;
  select * into strict r from public.subscription_renewals x where x.workspace_id=ws and x.subscription_id=sid;
  if s.kind<>'renewal' or s.registration_link_id is not null
    or s.predecessor_subscription_id is distinct from r.predecessor_subscription_id
    or (s.price_minor,s.currency,s.commission_rate_bp,s.duration_days,s.duration_months) is distinct from
      (select v.price_minor,v.currency,v.commission_rate_bp,v.duration_days,v.duration_months
       from public.package_versions v where v.workspace_id=ws and v.id=r.package_version_id)
    or not exists(select 1 from public.subscription_renewal_operations o where o.workspace_id=ws
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

create or replace function app_private.f12_check_subscription() returns trigger
language plpgsql security definer set search_path='' as $$
declare subscription_kind text; target_subscription uuid; target_workspace uuid;
begin
  if tg_table_name='subscriptions' then
    target_subscription:=new.id; target_workspace:=new.workspace_id;
  else
    target_subscription:=new.subscription_id; target_workspace:=new.workspace_id;
  end if;
  select s.kind into subscription_kind from public.subscriptions s
    where s.workspace_id=target_workspace and s.id=target_subscription;
  if subscription_kind='renewal' then perform app_private.f13_validate_renewal(target_workspace,target_subscription);
  else perform app_private.f12_validate_subscription(target_workspace,target_subscription); end if;
  return new;
end $$;

create function app_private.f13_audit_renewal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
  values(auth.uid(),'subscription.renewal_recorded','subscription_renewals',new.id,new.workspace_id,
    jsonb_build_object('client_id',new.client_id,'subscription_id',new.subscription_id,
      'predecessor_subscription_id',new.predecessor_subscription_id,'package_version_id',new.package_version_id,
      'recording_date',new.recording_date,'service_start_date',new.service_start_date,
      'service_end_exclusive',new.service_end_exclusive));
  return new;
end $$;
create trigger f13_renewal_audit after insert on public.subscription_renewals
  for each row execute function app_private.f13_audit_renewal();

-- Renewal requests are serialized by client then predecessor, matching F12's
-- payment/approval lock order. Idempotency binds the full normalized request.
create function public.record_renewal(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  ws uuid; cid uuid; predecessor_id uuid; offer_id uuid; request_id uuid;
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
  offer_id:=(request->>'package_offer_id')::uuid; request_id:=(request->>'request_key')::uuid;
  expected:=(request->>'expected_revision')::integer;
  if not app_private.f12_actor_allowed(ws,'record_payment',false) then return jsonb_build_object('status','not_permitted'); end if;
  canonical:=jsonb_build_array(1,ws::text,cid::text,predecessor_id::text,offer_id::text,expected,
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
  select * into offer from public.package_offers o where o.workspace_id=ws and o.id=offer_id;
  if not found or offer.available is not true then return jsonb_build_object('status','stale_state'); end if;
  select * into version from public.package_versions v where v.workspace_id=ws and v.id=offer.current_version_id and v.offer_id=offer_id;
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
    values(renewal_id,ws,cid,predecessor_id,successor_id,offer_id,version.id,expected,recording,start_on,end_on,auth.uid(),sampled);
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
alter function app_private.f13_validate_renewal(uuid,uuid) owner to postgres;
alter function app_private.f13_audit_renewal() owner to postgres;
revoke all on function app_private.f13_validate_renewal(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.f13_audit_renewal() from public,anon,authenticated,service_role;

-- An eligible successor carries the predecessor's service through the end of
-- its own scheduled term. The result is derived from source facts every call;
-- the materialized table remains a cache only.
create or replace function app_private.f13_project_entitlement(ws uuid,sid uuid,as_of date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sub public.subscriptions%rowtype; activation public.subscription_activations%rowtype;
  own_start date; own_end date; covered_end date; first_start date; frozen boolean; projected text;
  has_current boolean;
begin
  if as_of is null or not isfinite(as_of) then raise exception 'invalid_input' using errcode='22023'; end if;
  select * into sub from public.subscriptions s where s.workspace_id=ws and s.id=sid;
  if not found then raise exception 'not_permitted' using errcode='42501'; end if;
  if exists(select 1 from public.refund_operations r where r.workspace_id=ws and r.subscription_id=sid) then
    return jsonb_build_object('status','refunded','effective_end_exclusive',null,'coverage_end_exclusive',null); end if;
  select * into activation from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=sid;
  if sub.kind='initial' and not found then
    return jsonb_build_object('status','awaiting_activation','effective_end_exclusive',null,'coverage_end_exclusive',null);
  elsif sub.kind='renewal' then
    select coalesce((select d.service_start_date from public.subscription_renewal_date_revisions d
      where d.workspace_id=r.workspace_id and d.subscription_id=r.subscription_id order by d.revision desc limit 1),r.service_start_date),
      coalesce((select d.service_end_exclusive from public.subscription_renewal_date_revisions d
      where d.workspace_id=r.workspace_id and d.subscription_id=r.subscription_id order by d.revision desc limit 1),r.service_end_exclusive)
      into own_start,own_end from public.subscription_renewals r where r.workspace_id=ws and r.subscription_id=sid;
    select own_end+coalesce(sum(app_private.f13_freeze_contribution(ws,sid,f.id)),0)::integer
      into own_end from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=sid;
    if own_end is null then
    select coalesce((select d.service_end_exclusive from public.subscription_renewal_date_revisions d
      where d.workspace_id=r.workspace_id and d.subscription_id=r.subscription_id order by d.revision desc limit 1),r.service_end_exclusive) into own_end from public.subscription_renewals r
        where r.workspace_id=ws and r.subscription_id=sid;
    end if;
  else
    own_start:=(activation.activated_at at time zone 'Africa/Cairo')::date;
    select own_start+sub.duration_days+coalesce(sum(app_private.f13_freeze_contribution(ws,sid,f.id)),0)::integer
      into own_end from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=sid;
    if own_end is null then own_end:=own_start+sub.duration_days; end if;
  end if;
  -- Walk the single successor chain; an unstarted successor is eligible only
  -- because its immutable renewal fact proves an authorized confirmation.
  with recursive chain(subscription_id,predecessor_subscription_id,service_start_date,service_end_exclusive) as (
    select sid,null::uuid,own_start,own_end
    union all
    select r.subscription_id,r.predecessor_subscription_id,
      coalesce((select d.service_start_date from public.subscription_renewal_date_revisions d
        where d.workspace_id=r.workspace_id and d.subscription_id=r.subscription_id order by d.revision desc limit 1),r.service_start_date),
      coalesce((select d.service_end_exclusive from public.subscription_renewal_date_revisions d
        where d.workspace_id=r.workspace_id and d.subscription_id=r.subscription_id order by d.revision desc limit 1),r.service_end_exclusive)
        +coalesce((select sum(app_private.f13_freeze_contribution(ws,r.subscription_id,f.id))::integer
        from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=r.subscription_id),0)
    from chain c join public.subscription_renewals r on r.workspace_id=ws and r.predecessor_subscription_id=c.subscription_id
    where not exists(select 1 from public.refund_operations rf where rf.workspace_id=ws and rf.subscription_id=r.subscription_id)
  ), current_interval as (
    select * from chain where as_of>=service_start_date and as_of<service_end_exclusive
  ), continuous(subscription_id,service_end_exclusive) as (
    select subscription_id,service_end_exclusive from current_interval
    union all
    select n.subscription_id,n.service_end_exclusive from continuous c
      join chain n on n.predecessor_subscription_id=c.subscription_id
      where n.service_start_date<=c.service_end_exclusive
  )
  select exists(select 1 from current_interval),min(service_start_date),
    (select max(service_end_exclusive) from continuous)
    into has_current,first_start,covered_end from chain;
  if own_start is null then own_start:=as_of; end if;
  if not has_current and as_of<coalesce(first_start,own_start) then projected:='future';
  elsif not has_current then projected:='expired';
  else
    select exists(select 1 from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=sid
      and app_private.f13_freeze_contribution(ws,sid,f.id)>0 and as_of>=f.applied_on
      and as_of<f.applied_on+app_private.f13_freeze_contribution(ws,sid,f.id)) into frozen;
    projected:=case when frozen then 'frozen' else 'active' end;
  end if;
  return jsonb_build_object('status',projected,'effective_end_exclusive',own_end,
    'coverage_end_exclusive',case when has_current then covered_end else null end);
end $$;
alter function app_private.f13_project_entitlement(uuid,uuid,date) owner to postgres;
revoke all on function app_private.f13_project_entitlement(uuid,uuid,date) from public,anon,authenticated,service_role;
grant execute on function app_private.f13_project_entitlement(uuid,uuid,date) to service_role;

-- Freeze facts can move an unstarted renewal's service window. The immutable
-- confirmation snapshot remains untouched; each changed window is appended.
create function app_private.f13_reflow_unstarted_renewal() returns trigger
language plpgsql security definer set search_path='' as $$
declare ws uuid; predecessor_id uuid; source_id uuid; renewal record; projection jsonb;
  predecessor_end date; next_start date; next_end date; old_start date; old_end date; latest_revision integer;
begin
  ws:=new.workspace_id; predecessor_id:=new.subscription_id;
  source_id:=new.id;
  for renewal in
    select r.*,s.duration_days
    from public.subscription_renewals r join public.subscriptions s
      on s.workspace_id=r.workspace_id and s.id=r.subscription_id
    where r.workspace_id=ws and r.predecessor_subscription_id=predecessor_id
      and not exists(select 1 from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=r.subscription_id)
    order by r.expected_revision
  loop
    projection:=app_private.f13_project_entitlement(ws,predecessor_id,(clock_timestamp() at time zone 'Africa/Cairo')::date);
    predecessor_end:=(projection->>'effective_end_exclusive')::date;
    if predecessor_end is null then continue; end if;
    select d.service_start_date,d.service_end_exclusive,d.revision into old_start,old_end,latest_revision
      from public.subscription_renewal_date_revisions d where d.workspace_id=ws and d.subscription_id=renewal.subscription_id
      order by d.revision desc limit 1;
    if not found then
      old_start:=renewal.service_start_date; old_end:=renewal.service_end_exclusive; latest_revision:=0;
    end if;
    next_start:=greatest(renewal.recording_date,predecessor_end);
    next_end:=next_start+renewal.duration_days;
    if next_start is distinct from old_start or next_end is distinct from old_end then
      insert into public.subscription_renewal_date_revisions(workspace_id,subscription_id,revision,
        service_start_date,service_end_exclusive,cause_table,cause_id,recorded_by)
      values(ws,renewal.subscription_id,latest_revision+1,next_start,next_end,tg_table_name,source_id,auth.uid());
    end if;
  end loop;
  return new;
end $$;
create trigger f13_reflow_after_freeze after insert on public.subscription_freezes
  for each row execute function app_private.f13_reflow_unstarted_renewal();
create trigger f13_reflow_after_freeze_event after insert on public.subscription_freeze_events
  for each row execute function app_private.f13_reflow_unstarted_renewal();
create function app_private.f13_audit_renewal_date_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
  values(auth.uid(),'subscription.renewal_dates_reprojected','subscription_renewal_date_revisions',new.id,new.workspace_id,
    jsonb_build_object('subscription_id',new.subscription_id,'revision',new.revision,
      'service_start_date',new.service_start_date,'service_end_exclusive',new.service_end_exclusive,
      'cause_table',new.cause_table,'cause_id',new.cause_id));
  return new;
end $$;
create trigger f13_renewal_date_revision_audit after insert on public.subscription_renewal_date_revisions
  for each row execute function app_private.f13_audit_renewal_date_revision();
alter table public.subscription_renewal_date_revisions owner to postgres;
alter function app_private.f13_reflow_unstarted_renewal() owner to postgres;
alter function app_private.f13_audit_renewal_date_revision() owner to postgres;
revoke all on function app_private.f13_reflow_unstarted_renewal() from public,anon,authenticated,service_role;
revoke all on function app_private.f13_audit_renewal_date_revision() from public,anon,authenticated,service_role;
