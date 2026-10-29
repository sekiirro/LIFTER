-- F12 U4: recording full installment collections and PO exact-value corrections.
-- Corrections are not refunds. F13 partial-refund accounting and renewal anchors
-- are separate forward extensions; no refund cardinality or due-date rule here.
create function app_private.f12_u4_can_pay(ws uuid,correction boolean) returns boolean
language sql volatile security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.workspaces w
    join public.staff_profiles s on s.user_id=auth.uid()
    where w.id=ws and (not correction or s.role='platform_owner')
      and app_private.role_has_capability(s.role,case when correction then 'record_refund' else 'record_payment' end)
      and app_private.has_workspace_access(w.id,case when correction then 'record_refund' else 'record_payment' end));
$$;

create function app_private.f12_u4_canonical(kind text,request jsonb) returns jsonb
language plpgsql immutable security definer set search_path='' as $$
declare keys text[]; field text; seq integer; revision integer; amount bigint; collected date;
begin
  if kind not in ('collect','correct') or jsonb_typeof(request) is distinct from 'object' then return null; end if;
  keys:=array['workspace_id','client_id','request_key','subscription_id','obligation_id','expected_installment_seq','expected_revision','expected_previous_event_id'];
  keys:=keys||case when kind='correct' then array['original_event_id','correction_confirmed']
    else array['expected_amount_minor','currency','collected_on','payment_confirmed'] end;
  if (select count(*) from jsonb_object_keys(request))<>cardinality(keys)
    or exists(select 1 from jsonb_object_keys(request) k where not k=any(keys)) then return null; end if;
  foreach field in array array['workspace_id','client_id','request_key','subscription_id','obligation_id','expected_previous_event_id','original_event_id'] loop
    if (field='original_event_id' and kind='collect') or (field='expected_previous_event_id' and request->field='null'::jsonb) then continue; end if;
    if jsonb_typeof(request->field) is distinct from 'string' or (request->>field)!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
    request:=request||jsonb_build_object(field,(request->>field)::uuid);
  end loop;
  foreach field in array array['expected_installment_seq','expected_revision'] loop
    if jsonb_typeof(request->field) is distinct from 'number' or (request->>field)::numeric<>trunc((request->>field)::numeric) then return null; end if;
  end loop;
  seq:=(request->>'expected_installment_seq')::numeric::integer;
  revision:=(request->>'expected_revision')::numeric::integer;
  if seq<=0 or revision<0 or revision=2147483647 then return null; end if;
  request:=request||jsonb_build_object('expected_installment_seq',seq,'expected_revision',revision);
  if kind='correct' then
    if jsonb_typeof(request->'correction_confirmed') is distinct from 'boolean' then return null; end if;
  else
    if jsonb_typeof(request->'expected_amount_minor') is distinct from 'string' or (request->>'expected_amount_minor')!~'^[1-9][0-9]{0,18}$'
      or jsonb_typeof(request->'currency') is distinct from 'string' or (request->>'currency')!~'^[A-Z]{3}$'
      or jsonb_typeof(request->'collected_on') is distinct from 'string' or (request->>'collected_on')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or jsonb_typeof(request->'payment_confirmed') is distinct from 'boolean' then return null; end if;
    amount:=(request->>'expected_amount_minor')::bigint; collected:=(request->>'collected_on')::date;
    if not isfinite(collected) or collected<date '0001-01-01' or to_char(collected,'YYYY-MM-DD')<>request->>'collected_on' then return null; end if;
    request:=request||jsonb_build_object('expected_amount_minor',amount::text,'collected_on',to_char(collected,'YYYY-MM-DD'));
  end if;
  return request;
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then return null;
end $$;

create function app_private.f12_u4_operation(kind text,request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ws uuid; cid uuid; sid uuid; oid uuid; key uuid; canonical jsonb; binding bytea;
  c public.clients%rowtype; s public.subscriptions%rowtype; i public.subscription_installments%rowtype;
  tail public.payment_events%rowtype; previous app_private.registration_operations%rowtype;
  opid uuid; eid uuid; sampled timestamptz; amount bigint; commission bigint; collected date; effective date; receipt jsonb; result jsonb;
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
  -- Shared U3/U4 order: client -> subscription -> all obligations -> ledger.
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
    set constraints all immediate;
    return previous.result_receipt;
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
    -- Only activation existence matters here; never anchor or rewrite due dates.
    -- F13 renewal due dates can therefore use their own recording-date anchor.
    if i.seq>=2 and (not exists(select 1 from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=sid)
      or exists(select 1 from public.subscription_installments earlier where earlier.workspace_id=ws and earlier.subscription_id=sid and earlier.seq<i.seq
        and (select e.kind from public.payment_events e where e.workspace_id=ws and e.subscription_id=sid and e.obligation_id=earlier.id order by e.revision desc limit 1) is distinct from 'collection')) then
      return jsonb_build_object('status','stale_state'); end if;
    amount:=i.amount_minor; commission:=app_private.f12_commission_minor(i.amount_minor,s.commission_rate_bp);
    collected:=(canonical->>'collected_on')::date; effective:=collected;
  else
    if tail.kind is distinct from 'collection' or tail.id is distinct from (canonical->>'original_event_id')::uuid then return jsonb_build_object('status','stale_state'); end if;
    amount:=-tail.amount_minor; commission:=-tail.commission_minor;
    collected:=null; effective:=(sampled at time zone 'Africa/Cairo')::date;
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
  set constraints all immediate;
  return result;
exception when others then return jsonb_build_object('status','unavailable');
end $$;

create function public.installment_collect(request jsonb) returns jsonb
language sql volatile security definer set search_path='' as $$ select app_private.f12_u4_operation('collect',request) $$;
create function public.collection_correct(request jsonb) returns jsonb
language sql volatile security definer set search_path='' as $$ select app_private.f12_u4_operation('correct',request) $$;
alter function app_private.f12_u4_can_pay(uuid,boolean) owner to postgres;
revoke all on function app_private.f12_u4_can_pay(uuid,boolean) from public,anon,authenticated,service_role;
alter function app_private.f12_u4_canonical(text,jsonb) owner to postgres;
revoke all on function app_private.f12_u4_canonical(text,jsonb) from public,anon,authenticated,service_role;
alter function app_private.f12_u4_operation(text,jsonb) owner to postgres;
revoke all on function app_private.f12_u4_operation(text,jsonb) from public,anon,authenticated,service_role;
alter function public.installment_collect(jsonb) owner to postgres;
revoke all on function public.installment_collect(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.installment_collect(jsonb) to authenticated;
alter function public.collection_correct(jsonb) owner to postgres;
revoke all on function public.collection_correct(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.collection_correct(jsonb) to authenticated;
