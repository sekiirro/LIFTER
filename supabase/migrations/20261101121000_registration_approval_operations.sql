-- F12 U3. Forward-only authenticated approval/rejection/reconsideration operations.
-- No reads, activation writer, later collection, correction or F13 behavior.
-- U2's xmin/top-XID comparison rejects legitimate exception subtransactions.
-- Use the guarded, immutable current-transaction approval intent instead. A
-- committed approved client cannot acquire another decision or late schedule.
create or replace function app_private.f12_guard_installment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.subscriptions s
    join app_private.registration_decisions d on d.workspace_id=s.workspace_id and d.client_id=s.client_id
    where s.workspace_id=new.workspace_id and s.id=new.subscription_id
      and d.transaction_id=pg_current_xact_id() and d.actor_user_id=auth.uid()
      and d.kind in ('approve','reconsider') and d.to_state='approved'
      and s.created_by=d.actor_user_id and s.created_at=now()) then
    raise exception 'immutable_installment_schedule' using errcode='23514';
  end if;
  return new;
end $$;
alter function app_private.f12_guard_installment() owner to postgres;
revoke all on function app_private.f12_guard_installment() from public,anon,authenticated,service_role;

create function app_private.f12_u3_can_decide(ws uuid,po_only boolean) returns boolean
language sql volatile security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.workspaces w join public.staff_profiles s on s.user_id=auth.uid()
    where w.id=ws and s.role in ('platform_owner','workspace_owner')
      and (not po_only or s.role='platform_owner')
      and app_private.role_has_capability(s.role,'approve_registration')
      and app_private.has_workspace_access(w.id,'approve_registration'));
$$;

create function app_private.f12_u3_lock_authorization(ws uuid,po_only boolean) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare actor_role public.staff_role;
begin
  -- Called only after target locks. These SHARE locks are held through commit.
  -- Each SELECT is fresh after any wait; never rely on a pre-lock STABLE value.
  select s.role into actor_role from public.staff_profiles s where s.user_id=auth.uid() for share;
  if not found or actor_role not in ('platform_owner','workspace_owner')
    or (po_only and actor_role<>'platform_owner')
    or not app_private.role_has_capability(actor_role,'approve_registration') then return false; end if;
  if actor_role<>'platform_owner' then
    perform 1 from public.workspace_memberships m where m.workspace_id=ws and m.user_id=auth.uid() and m.revoked_at is null for share;
    if not found then return false; end if;
  end if;
  -- has_workspace_access alone does not prove an existing PO target workspace.
  return exists(select 1 from public.workspaces w where w.id=ws
    and app_private.has_workspace_access(w.id,'approve_registration'));
end $$;

create function app_private.f12_u3_canonical(kind text,request jsonb) returns jsonb
language plpgsql immutable security definer set search_path='' as $$
declare keys text[]; field text; ws uuid; cid uuid; key uuid; amount bigint; seq integer; collected date;
begin
  if jsonb_typeof(request) is distinct from 'object' or kind not in ('approve','reject','reconsider') then return null; end if;
  keys:=array['workspace_id','client_id','request_key','expected_state'];
  if kind='reject' then keys:=keys||array['reason_code'];
  else keys:=keys||array['expected_installment_seq','expected_amount_minor','currency','collected_on','payment_confirmed']; end if;
  if (select count(*) from jsonb_object_keys(request))<>cardinality(keys)
    or exists(select 1 from jsonb_object_keys(request) k where not k=any(keys)) then return null; end if;
  foreach field in array array['workspace_id','client_id','request_key'] loop
    if jsonb_typeof(request->field) is distinct from 'string' or (request->>field)!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  end loop;
  ws:=(request->>'workspace_id')::uuid; cid:=(request->>'client_id')::uuid; key:=(request->>'request_key')::uuid;
  if jsonb_typeof(request->'expected_state') is distinct from 'string'
    or (request->>'expected_state') not in ('pending-approval','approved','rejected') then return null; end if;
  request:=request||jsonb_build_object('workspace_id',ws,'client_id',cid,'request_key',key);
  if kind='reject' then
    if request->'reason_code' is distinct from '"registration_rejected"'::jsonb then return null; end if;
  else
    if jsonb_typeof(request->'expected_amount_minor') is distinct from 'string'
      or (request->>'expected_amount_minor')!~'^[1-9][0-9]{0,18}$'
      or jsonb_typeof(request->'currency') is distinct from 'string' or (request->>'currency')!~'^[A-Z]{3}$'
      or jsonb_typeof(request->'collected_on') is distinct from 'string' or (request->>'collected_on')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or jsonb_typeof(request->'payment_confirmed') is distinct from 'boolean'
      or jsonb_typeof(request->'expected_installment_seq') is distinct from 'number' then return null; end if;
    amount:=(request->>'expected_amount_minor')::bigint;
    if (request->>'expected_installment_seq')::numeric<>trunc((request->>'expected_installment_seq')::numeric) then return null; end if;
    seq:=(request->>'expected_installment_seq')::numeric::integer;
    collected:=(request->>'collected_on')::date;
    if not isfinite(collected) or collected<date '0001-01-01' or to_char(collected,'YYYY-MM-DD')<>request->>'collected_on' then return null; end if;
    request:=request||jsonb_build_object('expected_amount_minor',amount::text,'expected_installment_seq',seq,'collected_on',to_char(collected,'YYYY-MM-DD'));
  end if;
  return request;
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then
  return null;
end $$;

create function app_private.f12_u3_purchase(ws uuid,cid uuid,opid uuid,issued_link uuid,kind text,collected date,recorded timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.registration_links%rowtype; sid uuid:=gen_random_uuid(); eid uuid:=gen_random_uuid(); first public.subscription_installments%rowtype;
begin
  -- Read the immutable committed binding. Do not revalidate link lifetime,
  -- consumption, offer availability or the current package version.
  select r.* into strict l from public.clients c join public.registration_links r
    on r.workspace_id=c.workspace_id and r.id=c.registration_link_id and r.package_version_id=c.package_version_id
    where c.workspace_id=ws and c.id=cid and r.id=issued_link;
  insert into app_private.registration_decisions(workspace_id,client_id,operation_id,actor_user_id,kind,from_state,to_state)
    values(ws,cid,opid,auth.uid(),kind,case when kind='reconsider' then 'rejected' else 'pending-approval' end,'approved');
  insert into public.subscriptions(id,workspace_id,client_id,registration_link_id,package_version_id,price_minor,currency,commission_rate_bp,duration_days,duration_months,created_by)
    values(sid,ws,cid,l.id,l.package_version_id,l.price_minor,l.currency,l.commission_rate_bp,l.duration_days,l.duration_months,auth.uid());
  if exists(select 1 from public.registration_link_installments i where i.workspace_id=ws and i.link_id=l.id) then
    insert into public.subscription_installments(workspace_id,subscription_id,seq,amount_minor,currency,issued_day_offset,source_kind)
      select ws,sid,i.seq,i.amount_minor,l.currency,i.due_offset_days,'issued_schedule'
      from public.registration_link_installments i where i.workspace_id=ws and i.link_id=l.id order by i.seq;
  else
    insert into public.subscription_installments(workspace_id,subscription_id,seq,amount_minor,currency,issued_day_offset,source_kind)
      values(ws,sid,1,l.price_minor,l.currency,0,'single_payment');
  end if;
  select * into strict first from public.subscription_installments i where i.workspace_id=ws and i.subscription_id=sid and i.seq=1;
  insert into public.payment_events(id,workspace_id,subscription_id,obligation_id,installment_seq,revision,kind,amount_minor,currency,commission_minor,collected_on,effective_on,recorded_by,recorded_at,operation_id)
    values(eid,ws,sid,first.id,1,1,'collection',first.amount_minor,l.currency,app_private.f12_commission_minor(first.amount_minor,l.commission_rate_bp),collected,collected,auth.uid(),recorded,opid);
  insert into app_private.registration_approval_events(workspace_id,client_id,subscription_id,approved_at) values(ws,cid,sid,recorded);
  update public.clients set approval_state='approved' where workspace_id=ws and id=cid;
  return jsonb_build_object('id',opid,'operation',kind,'workspace_id',ws,'client_id',cid,'subscription_id',sid,'obligation_id',first.id,'event_id',eid,
    'installment_seq',1,'revision',1,'outcome','approved','amount_minor',first.amount_minor::text,'currency',l.currency,'collected_on',collected,'recorded_at',recorded);
end $$;

create function app_private.f12_u3_operation(kind text,request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ws uuid; cid uuid; key uuid; canonical jsonb; binding bytea; previous app_private.registration_operations%rowtype;
  c public.clients%rowtype; l public.registration_links%rowtype; first_amount bigint; sampled timestamptz; opid uuid; receipt jsonb; result jsonb; expected text;
begin
  if auth.uid() is null then return jsonb_build_object('status','not_permitted'); end if;
  if jsonb_typeof(request) is distinct from 'object' then return jsonb_build_object('status','invalid_input','fields','[]'::jsonb); end if;
  if jsonb_typeof(request->'workspace_id') is distinct from 'string' or jsonb_typeof(request->'client_id') is distinct from 'string'
    or (request->>'workspace_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'client_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('status','invalid_input','fields','[]'::jsonb);
  end if;
  ws:=(request->>'workspace_id')::uuid; cid:=(request->>'client_id')::uuid;
  if not app_private.f12_u3_can_decide(ws,kind='reconsider') then return jsonb_build_object('status','not_permitted'); end if;
  canonical:=app_private.f12_u3_canonical(kind,request);
  if canonical is null then return jsonb_build_object('status','invalid_input','fields','[]'::jsonb); end if;
  key:=(canonical->>'request_key')::uuid;
  -- Fixed, typed v1 encoding; inapplicable future-operation fields are explicit null.
  binding:=extensions.digest(convert_to(jsonb_build_array(1,kind,ws::text,cid::text,canonical->>'expected_state',
    null::text,null::text,null::text,canonical->'expected_installment_seq',case when kind='reject' then null::integer else 0 end,null::text,
    canonical->>'expected_amount_minor',canonical->>'currency',canonical->>'collected_on',canonical->'payment_confirmed',canonical->>'reason_code')::text,'UTF8'),'sha256');
  -- Shared lock order: client -> subscription -> obligations -> ledger.
  select * into c from public.clients where workspace_id=ws and id=cid for update;
  if not found then return jsonb_build_object('status','not_permitted'); end if;
  perform s.id from public.subscriptions s where s.workspace_id=ws and s.client_id=cid order by s.id for update;
  perform i.id from public.subscription_installments i join public.subscriptions s on s.workspace_id=i.workspace_id and s.id=i.subscription_id
    where s.workspace_id=ws and s.client_id=cid order by i.subscription_id,i.seq,i.id for update of i;
  perform e.id from public.payment_events e join public.subscriptions s on s.workspace_id=e.workspace_id and s.id=e.subscription_id
    where s.workspace_id=ws and s.client_id=cid order by e.subscription_id,e.obligation_id,e.revision for update of e;
  if not app_private.f12_u3_lock_authorization(ws,kind='reconsider') then return jsonb_build_object('status','not_permitted'); end if;
  -- Actor/key serialization follows target locks. Hash collisions only serialize.
  -- This also serializes one actor/key used concurrently against different clients.
  perform pg_advisory_xact_lock(hashtextextended('lifter.f12.operation:'||auth.uid()::text||':'||key::text,0));
  if not app_private.f12_u3_lock_authorization(ws,kind='reconsider') then return jsonb_build_object('status','not_permitted'); end if;
  select * into previous from app_private.registration_operations o where o.actor_user_id=auth.uid() and o.request_key=key;
  if found then
    if previous.canonical_version<>1 or previous.workspace_id<>ws or previous.client_id<>cid or previous.operation<>kind or previous.canonical_args_hash is distinct from binding then
      return jsonb_build_object('status','key_conflict');
    end if;
    set constraints all immediate;
    return previous.result_receipt;
  end if;
  expected:=case when kind='reconsider' then 'rejected' else 'pending-approval' end;
  if canonical->>'expected_state'<>expected or (kind<>'reject' and (canonical->'payment_confirmed'<>'true'::jsonb or (canonical->>'expected_installment_seq')::integer<>1)) then
    return jsonb_build_object('status','invalid_input','fields','[]'::jsonb);
  end if;
  if c.approval_state<>expected then return jsonb_build_object('status','stale_state'); end if;
  sampled:=clock_timestamp(); opid:=gen_random_uuid();
  if kind<>'reject' then
    if (canonical->>'collected_on')::date>(sampled at time zone 'Africa/Cairo')::date then return jsonb_build_object('status','invalid_input','fields','[]'::jsonb); end if;
    select r.* into strict l from public.registration_links r where r.workspace_id=ws and r.id=c.registration_link_id and r.package_version_id=c.package_version_id;
    select i.amount_minor into first_amount from public.registration_link_installments i where i.workspace_id=ws and i.link_id=l.id and i.seq=1;
    first_amount:=coalesce(first_amount,l.price_minor);
    if (canonical->>'expected_amount_minor')::bigint<>first_amount or canonical->>'currency'<>l.currency then return jsonb_build_object('status','invalid_input','fields','[]'::jsonb); end if;
  end if;
  -- One exception block is the atomic boundary. Cyclic receipt relations are
  -- deferred only during construction, then every constraint is forced below.
  set constraints all deferred;
  if kind='reject' then
    insert into app_private.registration_decisions(workspace_id,client_id,operation_id,actor_user_id,kind,from_state,to_state,rejection_reason_code)
      values(ws,cid,opid,auth.uid(),'reject','pending-approval','rejected','registration_rejected');
    update public.clients set approval_state='rejected' where workspace_id=ws and id=cid;
    receipt:=jsonb_build_object('id',opid,'operation',kind,'workspace_id',ws,'client_id',cid,'subscription_id',null,'obligation_id',null,'event_id',null,
      'installment_seq',null,'revision',null,'outcome','rejected','amount_minor',null,'currency',null,'collected_on',null,'recorded_at',sampled);
  else
    receipt:=app_private.f12_u3_purchase(ws,cid,opid,l.id,kind,(canonical->>'collected_on')::date,sampled);
  end if;
  result:=jsonb_build_object('status','ok','receipt',receipt);
  insert into app_private.registration_operations(id,workspace_id,actor_user_id,request_key,operation,client_id,subscription_id,obligation_id,event_id,
    expected_installment_seq,expected_revision,canonical_args_hash,result_receipt,recorded_at)
    values(opid,ws,auth.uid(),key,kind,cid,(receipt->>'subscription_id')::uuid,(receipt->>'obligation_id')::uuid,(receipt->>'event_id')::uuid,
      case when kind='reject' then null else 1 end,case when kind='reject' then null else 0 end,binding,result,sampled);
  set constraints all immediate;
  return result;
exception when others then
  -- The exception subtransaction rolls back every business/audit/receipt write.
  -- Do not return SQLSTATE, diagnostics, input, PII or protected target details.
  return jsonb_build_object('status','unavailable');
end $$;

create function public.registration_approve(request jsonb) returns jsonb
language sql volatile security definer set search_path='' as $$ select app_private.f12_u3_operation('approve',request) $$;
create function public.registration_reject(request jsonb) returns jsonb
language sql volatile security definer set search_path='' as $$ select app_private.f12_u3_operation('reject',request) $$;
create function public.registration_reconsider(request jsonb) returns jsonb
language sql volatile security definer set search_path='' as $$ select app_private.f12_u3_operation('reconsider',request) $$;

alter function app_private.f12_u3_can_decide(uuid,boolean) owner to postgres;
revoke all on function app_private.f12_u3_can_decide(uuid,boolean) from public,anon,authenticated,service_role;
alter function app_private.f12_u3_lock_authorization(uuid,boolean) owner to postgres;
revoke all on function app_private.f12_u3_lock_authorization(uuid,boolean) from public,anon,authenticated,service_role;
alter function app_private.f12_u3_canonical(text,jsonb) owner to postgres;
revoke all on function app_private.f12_u3_canonical(text,jsonb) from public,anon,authenticated,service_role;
alter function app_private.f12_u3_purchase(uuid,uuid,uuid,uuid,text,date,timestamptz) owner to postgres;
revoke all on function app_private.f12_u3_purchase(uuid,uuid,uuid,uuid,text,date,timestamptz) from public,anon,authenticated,service_role;
alter function app_private.f12_u3_operation(text,jsonb) owner to postgres;
revoke all on function app_private.f12_u3_operation(text,jsonb) from public,anon,authenticated,service_role;
alter function public.registration_approve(jsonb) owner to postgres;
revoke all on function public.registration_approve(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.registration_approve(jsonb) to authenticated;
alter function public.registration_reject(jsonb) owner to postgres;
revoke all on function public.registration_reject(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.registration_reject(jsonb) to authenticated;
alter function public.registration_reconsider(jsonb) owner to postgres;
revoke all on function public.registration_reconsider(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.registration_reconsider(jsonb) to authenticated;
