-- F13 T043: Platform-Owner-only manual subscription date adjustment, audited, zero revenue.
-- FR-040; SC-018. The adjustment records the PO-asserted effective dates as an
-- immutable fact with an immutable audit row. No payment, revenue, ledger,
-- installment or collection row is written by this operation. After-expiry
-- edits are permitted: no expiry gate is encoded. Unspecified policy (shift
-- limits, previous-value derivation, projection wiring, frozen/deactivated
-- handling) is intentionally not encoded; see PO-DECISION-NEEDED.
create table public.subscription_manual_date_adjustments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  subscription_id uuid not null,
  new_service_start_date date not null,
  new_service_end_exclusive date not null
    check (new_service_end_exclusive > new_service_start_date),
  request_key uuid not null,
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(actor_user_id,request_key),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(workspace_id,subscription_id) references public.subscriptions(workspace_id,id) on delete restrict
);

alter table public.subscription_manual_date_adjustments owner to postgres;
revoke all on table public.subscription_manual_date_adjustments from public,anon,authenticated,service_role;
alter table public.subscription_manual_date_adjustments enable row level security;
alter table public.subscription_manual_date_adjustments force row level security;
create trigger f13_no_update before update on public.subscription_manual_date_adjustments
  for each row execute function app_private.audit_events_immutable();
create trigger f13_no_delete before delete on public.subscription_manual_date_adjustments
  for each row execute function app_private.forbid_delete();
create trigger f13_no_truncate before truncate on public.subscription_manual_date_adjustments
  for each statement execute function app_private.forbid_delete();

create function app_private.f13_audit_manual_date() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(auth.uid(),'subscription.manual_date_adjusted',tg_table_name,new.id,new.workspace_id,
      jsonb_build_object('subscription_id',new.subscription_id,'client_id',new.client_id,
        'new_service_start_date',new.new_service_start_date,
        'new_service_end_exclusive',new.new_service_end_exclusive));
  return new;
end $$;
alter function app_private.f13_audit_manual_date() owner to postgres;
revoke all on function app_private.f13_audit_manual_date() from public,anon,authenticated,service_role;
create trigger f13_manual_date_audit after insert on public.subscription_manual_date_adjustments
  for each row execute function app_private.f13_audit_manual_date();

create function public.record_subscription_date_adjustment(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
<<manual_date_fn>>
declare
  ws uuid; cid uuid; sid uuid; key uuid;
  start_on date; end_on date;
  c public.clients%rowtype; s public.subscriptions%rowtype;
  previous public.subscription_manual_date_adjustments%rowtype;
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
