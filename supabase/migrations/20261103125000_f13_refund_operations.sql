-- F13 T015: atomic PO refund writer and narrow Auth lockout worker RPCs.
-- The deactivation marker remains the synchronous token-hook gate. The worker
-- uses supported Auth Admin APIs only; it never reads or writes Auth tables.

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid='app_private.registration_operations'::regclass
      and contype='c' and pg_get_constraintdef(oid) ilike '%operation%'
  loop
    execute format('alter table app_private.registration_operations drop constraint %I',constraint_name);
  end loop;
end $$;

alter table app_private.registration_operations
  add constraint f13_registration_operation_kind_check
    check(operation in ('approve','reject','reconsider','collect','correct','refund')),
  add constraint f13_registration_operation_shape_check check(
    (operation='reject' and subscription_id is null and obligation_id is null and event_id is null
      and original_event_id is null and expected_installment_seq is null and expected_revision is null
      and expected_previous_event_id is null)
    or (operation='refund' and subscription_id is not null and obligation_id is null and event_id is null
      and original_event_id is null and expected_installment_seq is null and expected_revision is not null
      and expected_revision>=0 and expected_previous_event_id is null)
    or (operation in ('approve','reconsider','collect','correct') and subscription_id is not null
      and obligation_id is not null and event_id is not null and expected_installment_seq is not null
      and expected_revision is not null)
  ),
  add constraint f13_registration_operation_original_check
    check((operation='correct')=(original_event_id is not null));

alter table public.clients add column deactivated_at timestamptz
  check(deactivated_at is null or isfinite(deactivated_at));

create or replace function app_private.f12_guard_client_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.deactivated_at is null and new.deactivated_at is not null
    and (to_jsonb(new)-'deactivated_at') is not distinct from (to_jsonb(old)-'deactivated_at')
    and exists(select 1 from app_private.client_deactivation_state d
      where d.client_id=new.id and d.auth_user_id=new.auth_user_id and d.deactivated_at=new.deactivated_at)
    and exists(select 1 from public.refund_operations r
      where r.workspace_id=new.workspace_id and r.client_id=new.id and r.actor_user_id=auth.uid()
        and r.recorded_at=new.deactivated_at) then
    return new;
  end if;
  if (to_jsonb(new)-'approval_state') is distinct from (to_jsonb(old)-'approval_state')
    or old.approval_state=new.approval_state
    or not exists(select 1 from app_private.registration_decisions d where d.workspace_id=old.workspace_id and d.client_id=old.id
      and d.transaction_id=pg_current_xact_id() and d.actor_user_id=auth.uid()
      and d.from_state=old.approval_state and d.to_state=new.approval_state
      and app_private.f12_actor_allowed(d.workspace_id,'approve_registration',d.kind='reconsider')) then
    raise exception 'invalid_client_transition' using errcode='23514';
  end if;
  return new;
end $$;
alter function app_private.f12_guard_client_transition() owner to postgres;
revoke all on function app_private.f12_guard_client_transition() from public,anon,authenticated,service_role;

drop trigger audit_client_approval on public.clients;
create trigger audit_client_approval after update on public.clients
  for each row when (old.approval_state is distinct from new.approval_state)
  execute function app_private.audit_row_change();

create function app_private.f13_audit_client_deactivation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(auth.uid(),'client.deactivated','clients',new.id,new.workspace_id,
      jsonb_build_object('reason','refund','deactivated_at',new.deactivated_at));
  return new;
end $$;
create trigger f13_client_deactivation_audit after update on public.clients
  for each row when (old.deactivated_at is null and new.deactivated_at is not null)
  execute function app_private.f13_audit_client_deactivation();
alter function app_private.f13_audit_client_deactivation() owner to postgres;
revoke all on function app_private.f13_audit_client_deactivation() from public,anon,authenticated,service_role;

create or replace function app_private.client_has_access(ws uuid,cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.clients c
    where c.workspace_id=ws and c.id=cid and c.auth_user_id=auth.uid()
      and c.approval_state='approved' and c.deactivated_at is null)
$$;

create or replace function public.client_self_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select case when c.deactivated_at is null
      then jsonb_build_object('status','ok','approval_state',c.approval_state)
      else jsonb_build_object('status','not_permitted') end
    from public.clients c where c.auth_user_id=auth.uid()),jsonb_build_object('status','not_permitted'))
$$;

create or replace function public.workspace_payment_queue(workspace_id uuid,cursor_id uuid default null,page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; next_id uuid; more boolean;
begin
  if not app_private.f12_u5_authorized(workspace_id,'record_payment') then return jsonb_build_object('status','not_permitted'); end if;
  if page_size is null or page_size<1 or page_size>100 then return jsonb_build_object('status','invalid_input'); end if;
  with candidates as (
    select c.id as client_id,s.id as subscription_id,c.name,c.approval_state,s.price_minor,s.currency,
      coalesce(sum(i.amount_minor) filter(where tail.kind is distinct from 'collection'),0)::bigint as unpaid_minor
    from public.clients c join public.subscriptions s on s.workspace_id=c.workspace_id and s.client_id=c.id
    join public.subscription_installments i on i.workspace_id=s.workspace_id and i.subscription_id=s.id
    left join lateral (select e.kind from public.payment_events e where e.workspace_id=i.workspace_id
      and e.obligation_id=i.id order by e.revision desc limit 1) tail on true
    where c.workspace_id=workspace_payment_queue.workspace_id and c.approval_state='approved'
      and c.deactivated_at is null
      and (workspace_payment_queue.cursor_id is null or s.id>workspace_payment_queue.cursor_id)
    group by c.id,s.id order by s.id limit workspace_payment_queue.page_size+1
  ), numbered as (select row_number() over(order by q.subscription_id) as rn,q.* from candidates q)
  select coalesce(jsonb_agg(jsonb_build_object('client_id',q.client_id,'subscription_id',q.subscription_id,
      'name',q.name,'approval_state',q.approval_state,'price_minor',q.price_minor::text,
      'currency',q.currency,'unpaid_minor',q.unpaid_minor::text) order by q.rn)
      filter(where q.rn<=workspace_payment_queue.page_size),'[]'::jsonb),
    count(*)>workspace_payment_queue.page_size,
    (array_agg(q.subscription_id order by q.rn) filter(where q.rn<=workspace_payment_queue.page_size))[workspace_payment_queue.page_size]
    into result,more,next_id from numbered q;
  return jsonb_build_object('status','ok','items',result,'next_cursor',case when more then next_id else null end);
end $$;

create or replace function public.subscription_payment_status(workspace_id uuid,client_id uuid,subscription_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not app_private.f12_u5_authorized(workspace_id,'record_payment') then return jsonb_build_object('status','not_permitted'); end if;
  select jsonb_agg(jsonb_build_object('obligation_id',i.id,'seq',i.seq,'amount_minor',i.amount_minor::text,
    'currency',i.currency,'revision',coalesce(t.revision,0),'tail_event_id',t.id,'kind',t.kind,
    'paid',t.kind='collection','refunded_minor',coalesce(r.principal_minor,0)::text,
    'refund_state',case when coalesce(r.principal_minor,0)=0 then 'none'
      when coalesce(r.principal_minor,0)>=coalesce(t.amount_minor,0) then 'refunded' else 'partial' end,
    'due_on',case when i.seq=1 or a.activated_at is null then null
      else ((a.activated_at at time zone 'Africa/Cairo')::date+i.issued_day_offset) end,
    'collected_on',t.collected_on,'effective_on',t.effective_on,'recorded_by',t.recorded_by) order by i.seq)
  into result from public.clients c join public.subscriptions s on s.workspace_id=c.workspace_id and s.client_id=c.id
    join public.subscription_installments i on i.workspace_id=s.workspace_id and i.subscription_id=s.id
    left join public.subscription_activations a on a.workspace_id=s.workspace_id and a.subscription_id=s.id
    left join lateral (select e.* from public.payment_events e where e.workspace_id=i.workspace_id
      and e.obligation_id=i.id order by e.revision desc limit 1) t on true
    left join lateral (select sum(-x.amount_minor) as principal_minor from public.refund_allocation_events x
      where x.workspace_id=i.workspace_id and x.subscription_id=i.subscription_id and x.obligation_id=i.id) r on true
    where c.workspace_id=subscription_payment_status.workspace_id and c.id=subscription_payment_status.client_id
      and s.id=subscription_payment_status.subscription_id;
  if result is null then return jsonb_build_object('status','not_permitted'); end if;
  return jsonb_build_object('status','ok','obligations',result);
end $$;

create or replace function public.subscription_commission(workspace_id uuid,subscription_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not app_private.f12_u5_authorized(workspace_id,'record_payment',true) then return jsonb_build_object('status','not_permitted'); end if;
  select jsonb_agg(jsonb_build_object('event_id',q.event_id,'installment_seq',q.installment_seq,
    'revision',q.revision,'kind',q.kind,'rate_bp',q.rate_bp,'commission_minor',q.commission_minor,
    'reverses_event_id',q.reverses_event_id,'source_collection_event_id',q.source_collection_event_id,
    'refund_operation_id',q.refund_operation_id) order by q.installment_seq,q.recorded_at,q.event_id)
  into result from (
    select e.id as event_id,e.installment_seq,e.revision,e.kind,s.commission_rate_bp as rate_bp,
      e.commission_minor::text as commission_minor,e.reverses_event_id,null::uuid as source_collection_event_id,
      null::uuid as refund_operation_id,e.recorded_at
    from public.payment_events e join public.subscriptions s on s.workspace_id=e.workspace_id and s.id=e.subscription_id
    where e.workspace_id=subscription_commission.workspace_id and e.subscription_id=subscription_commission.subscription_id
    union all
    select a.id,i.seq,null::integer,'refund_allocation',s.commission_rate_bp,
      a.commission_minor::text,null::uuid,a.source_collection_event_id,a.refund_operation_id,a.recorded_at
    from public.refund_allocation_events a
    join public.subscriptions s on s.workspace_id=a.workspace_id and s.id=a.subscription_id
    join public.subscription_installments i on i.workspace_id=a.workspace_id and i.subscription_id=a.subscription_id and i.id=a.obligation_id
    where a.workspace_id=subscription_commission.workspace_id and a.subscription_id=subscription_commission.subscription_id
  ) q;
  if result is null then return jsonb_build_object('status','not_permitted'); end if;
  return jsonb_build_object('status','ok','events',result);
end $$;

create or replace function app_private.f13_guard_terminal_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.subscriptions s
    where s.workspace_id=new.workspace_id and s.id=new.subscription_id for update;
  if exists (
    select 1 from public.refund_operations r
    where r.workspace_id=new.workspace_id and r.subscription_id=new.subscription_id
  ) then
    raise exception 'terminal_refund_purchase' using errcode='23514';
  end if;
  if exists(select 1 from public.subscription_obligation_cancellations c
    where c.workspace_id=new.workspace_id and c.subscription_id=new.subscription_id and c.obligation_id=new.obligation_id) then
    raise exception 'cancelled_obligation' using errcode='23514';
  end if;
  return new;
end $$;
alter function app_private.f13_guard_terminal_payment() owner to postgres;
revoke all on function app_private.f13_guard_terminal_payment() from public,anon,authenticated,service_role;

create function public.record_refund(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
<<refund_fn>>
declare
  ws uuid; cid uuid; sid uuid; key uuid; requested bigint; requested_revision integer; canonical jsonb; binding bytea;
  c public.clients%rowtype; s public.subscriptions%rowtype; previous app_private.registration_operations%rowtype;
  source record; operation_id uuid; refund_id uuid; sampled timestamptz; effective date;
  available numeric; remaining numeric; residual numeric; principal numeric; commission_before numeric;
  commission_after numeric; commission_delta numeric; revision_count integer; receipt jsonb; result jsonb;
begin
  if auth.uid() is null or jsonb_typeof(request) is distinct from 'object'
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
  if requested_revision is not null and requested_revision<>revision_count then
    return jsonb_build_object('status','stale_state');
  end if;
  select coalesce(sum(greatest(payment_source.amount_minor-coalesce(refunded.amount_minor,0),0)),0)
    into available
    from public.payment_events payment_source
    left join lateral (
      select sum(-a.amount_minor) as amount_minor
      from public.refund_allocation_events a
      where a.workspace_id=payment_source.workspace_id and a.subscription_id=payment_source.subscription_id
        and a.source_collection_event_id=payment_source.id
    ) refunded on true
    where payment_source.workspace_id=ws and payment_source.subscription_id=sid and payment_source.kind='collection'
      and not exists(select 1 from public.payment_events correction
        where correction.workspace_id=payment_source.workspace_id and correction.reverses_event_id=payment_source.id);
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
    select e.id,e.obligation_id,e.amount_minor,e.commission_minor,e.currency,e.collected_on,i.seq,
      coalesce((select sum(-a.amount_minor) from public.refund_allocation_events a
        where a.workspace_id=e.workspace_id and a.subscription_id=e.subscription_id
          and a.source_collection_event_id=e.id),0) as refunded_minor,
      coalesce((select sum(-a.commission_minor) from public.refund_allocation_events a
        where a.workspace_id=e.workspace_id and a.subscription_id=e.subscription_id
          and a.source_collection_event_id=e.id),0) as commission_refunded
    from public.payment_events e
    join public.subscription_installments i on i.workspace_id=e.workspace_id
      and i.subscription_id=e.subscription_id and i.id=e.obligation_id
    where e.workspace_id=ws and e.subscription_id=sid and e.kind='collection'
      and not exists(select 1 from public.payment_events correction
        where correction.workspace_id=e.workspace_id and correction.reverses_event_id=e.id)
    order by e.collected_on,i.seq,e.id
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
      refund_operation_id,source_collection_event_id,amount_minor,commission_minor,currency,
      effective_on,recorded_by,recorded_at)
    values(ws,sid,source.obligation_id,refund_id,source.id,-principal,-commission_delta,
      source.currency,effective,auth.uid(),sampled);
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
  where i.workspace_id=refund_fn.ws and i.subscription_id=refund_fn.sid
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
end $$;

alter function public.record_refund(jsonb) owner to postgres;
revoke all on function public.record_refund(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_refund(jsonb) to authenticated;

create function public.claim_refund_auth_lockout_jobs(p_limit integer)
returns table(id uuid,auth_user_id uuid,attempts integer,status text)
language sql volatile security definer set search_path = '' as $$
  with due as (
    select q.id from app_private.refund_auth_lockouts q
    where q.status in ('pending','retry') and q.next_attempt_at<=clock_timestamp()
    order by q.next_attempt_at,q.created_at,q.id
    for update skip locked limit greatest(1,least(coalesce(p_limit,1),100))
  ), leased as (
    update app_private.refund_auth_lockouts q
    set next_attempt_at=clock_timestamp()+interval '5 minutes'
    from due where q.id=due.id
    returning q.id,q.auth_user_id,q.attempts,q.status
  ) select leased.id,leased.auth_user_id,leased.attempts,leased.status from leased
$$;

create function public.complete_refund_auth_lockout_job(p_id uuid,p_completed_at timestamptz)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update app_private.refund_auth_lockouts q set status='succeeded',completed_at=p_completed_at,
    safe_error_code=null where q.id=p_id and q.status<>'succeeded';
  if found then return true; end if;
  return exists(select 1 from app_private.refund_auth_lockouts q where q.id=p_id and q.status='succeeded');
end $$;

create function public.retry_refund_auth_lockout_job(
  p_id uuid,p_attempt integer,p_retry_at timestamptz,p_safe_error_code text
) returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_attempt is null or p_attempt<1 or p_retry_at is null or p_safe_error_code is null
    or p_safe_error_code not in ('provider_unavailable','auth_admin_unavailable') then return false; end if;
  update app_private.refund_auth_lockouts q set status='retry',attempts=p_attempt,
    next_attempt_at=p_retry_at,safe_error_code=p_safe_error_code
    where q.id=p_id and q.status<>'succeeded' and p_attempt=q.attempts+1;
  if found then return true; end if;
  return exists(select 1 from app_private.refund_auth_lockouts q where q.id=p_id
    and q.status='retry' and q.attempts=p_attempt and q.next_attempt_at=p_retry_at
    and q.safe_error_code=p_safe_error_code);
end $$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.claim_refund_auth_lockout_jobs(integer)',
    'public.complete_refund_auth_lockout_job(uuid,timestamp with time zone)',
    'public.retry_refund_auth_lockout_job(uuid,integer,timestamp with time zone,text)'
  ] loop
    execute format('alter function %s owner to postgres',signature);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',signature);
    execute format('grant execute on function %s to service_role',signature);
  end loop;
end $$;
