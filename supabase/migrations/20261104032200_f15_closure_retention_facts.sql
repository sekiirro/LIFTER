-- S27-R1: one immutable client deactivation fact for both refund and closure.
create table app_private.client_closure_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  request_key uuid not null,
  canonical_version integer not null check (canonical_version = 1),
  canonical_args_hash bytea not null check (octet_length(canonical_args_hash) = 32),
  result_receipt jsonb not null check (jsonb_typeof(result_receipt) = 'object'),
  recorded_at timestamptz not null check (isfinite(recorded_at)),
  unique (workspace_id, id),
  unique (actor_user_id, request_key),
  foreign key (workspace_id, client_id) references public.clients(workspace_id,id) on delete restrict
);
alter table app_private.client_closure_operations enable row level security;
alter table app_private.client_closure_operations force row level security;
revoke all on app_private.client_closure_operations from public, anon, authenticated, service_role;

alter table public.clients add column deactivation_reason text;
drop trigger f12_client_transition on public.clients;

-- Historical refund facts are attributable to their immutable operation row.
do $$
begin
  update public.clients c set deactivation_reason='refund'
  where c.deactivated_at is not null and exists (
    select 1 from public.refund_operations r
    where r.workspace_id=c.workspace_id and r.client_id=c.id and r.recorded_at=c.deactivated_at
  );
  if exists (select 1 from public.clients where deactivated_at is not null and deactivation_reason is null) then
    raise exception 'client_deactivation_reason_backfill_unattributed';
  end if;
end $$;
alter table public.clients add constraint clients_deactivation_reason_check
  check (deactivation_reason in ('refund','closure'));
alter table public.clients add constraint clients_deactivation_reason_pair
  check ((deactivated_at is null) = (deactivation_reason is null));

create or replace function app_private.f12_guard_client_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare refund_match boolean; closure_match boolean;
begin
  if old.deactivated_at is not null then
    if new.deactivated_at is distinct from old.deactivated_at
      or new.deactivation_reason is distinct from old.deactivation_reason then
      raise exception 'client_deactivation_is_immutable' using errcode='23514';
    end if;
  elsif new.deactivated_at is not null then
    select exists(select 1 from public.refund_operations r
      where r.workspace_id=new.workspace_id and r.client_id=new.id and r.actor_user_id=auth.uid()
        and r.recorded_at=new.deactivated_at),
      exists(select 1 from app_private.client_closure_operations o
      where o.workspace_id=new.workspace_id and o.client_id=new.id and o.actor_user_id=auth.uid()
        and o.recorded_at=new.deactivated_at)
      into refund_match,closure_match;
    if (to_jsonb(new)-'deactivated_at'-'deactivation_reason')
          is distinct from (to_jsonb(old)-'deactivated_at'-'deactivation_reason')
      or refund_match = closure_match then
      raise exception 'invalid_client_deactivation' using errcode='23514';
    end if;
    new.deactivation_reason := case when refund_match then 'refund' else 'closure' end;
    if not exists(select 1 from app_private.client_deactivation_state d
      where d.client_id=new.id and d.auth_user_id=new.auth_user_id and d.deactivated_at=new.deactivated_at) then
      raise exception 'client_deactivation_lockout_missing' using errcode='23514';
    end if;
    return new;
  elsif new.deactivation_reason is not null then
    raise exception 'invalid_client_deactivation_reason' using errcode='23514';
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
create trigger f12_client_transition before update on public.clients
  for each row execute function app_private.f12_guard_client_transition();

create or replace function app_private.f13_audit_client_deactivation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
  values(auth.uid(),'client.deactivated','clients',new.id,new.workspace_id,
    jsonb_build_object('reason',new.deactivation_reason,'deactivated_at',new.deactivated_at));
  return new;
end $$;
alter function app_private.f13_audit_client_deactivation() owner to postgres;
revoke all on function app_private.f13_audit_client_deactivation() from public,anon,authenticated,service_role;

create function app_private.record_f15_retention_fact() returns trigger
language plpgsql security definer set search_path = '' as $$
declare event_id uuid; event_kind text;
begin
  if old.deactivated_at is null and new.deactivated_at is not null then
    select r.id,'refund' into event_id,event_kind from public.refund_operations r
      where r.workspace_id=new.workspace_id and r.client_id=new.id and r.recorded_at=new.deactivated_at;
    if event_id is null then
      select o.id,'closure' into event_id,event_kind from app_private.client_closure_operations o
        where o.workspace_id=new.workspace_id and o.client_id=new.id and o.recorded_at=new.deactivated_at;
    end if;
    if event_id is null then raise exception 'retention_source_missing' using errcode='23514'; end if;
    insert into app_private.form_retention_windows(workspace_id,client_id,source_event_id,source_kind,ended_at)
      values(new.workspace_id,new.id,event_id,event_kind,new.deactivated_at);
  end if;
  return new;
end $$;
alter function app_private.record_f15_retention_fact() owner to postgres;
revoke all on function app_private.record_f15_retention_fact() from public,anon,authenticated,service_role;
create trigger f15_client_retention_fact after update of deactivated_at on public.clients
  for each row when (old.deactivated_at is null and new.deactivated_at is not null)
  execute function app_private.record_f15_retention_fact();

create function public.close_client(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare ws uuid; cid uuid; request_id uuid; actor uuid; canonical jsonb; binding bytea;
  previous app_private.client_closure_operations%rowtype; c public.clients%rowtype; sampled timestamptz;
  op_id uuid; receipt jsonb; result jsonb;
begin
  actor:=auth.uid();
  if actor is null then return jsonb_build_object('status','not_permitted'); end if;
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
    or (select count(*) from jsonb_object_keys(request))<>3
    or exists(select 1 from jsonb_object_keys(request) k where k not in ('workspace_id','client_id','request_key'))
    or jsonb_typeof(request->'client_id') is distinct from 'string'
    or jsonb_typeof(request->'request_key') is distinct from 'string'
    or (request->>'client_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (request->>'request_key') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('status','invalid_input');
  end if;
  cid:=(request->>'client_id')::uuid; request_id:=(request->>'request_key')::uuid;
  canonical:=jsonb_build_array(1,'closure',ws::text,cid::text);
  binding:=extensions.digest(convert_to(canonical::text,'UTF8'),'sha256');
  perform pg_advisory_xact_lock(hashtextextended('lifter.f12.operation:'||actor::text||':'||request_id::text,0));
  select * into previous from app_private.client_closure_operations o
    where o.actor_user_id=actor and o.request_key=request_id;
  if found then
    if previous.canonical_version<>1 or previous.workspace_id<>ws or previous.client_id<>cid
      or previous.canonical_args_hash is distinct from binding then
      return jsonb_build_object('status','key_conflict');
    end if;
    return previous.result_receipt;
  end if;
  select * into c from public.clients x where x.workspace_id=ws and x.id=cid for update;
  if not found or c.deactivated_at is not null or c.approval_state<>'approved' then
    return jsonb_build_object('status','not_permitted');
  end if;
  if not app_private.f12_actor_allowed(ws,'record_refund',true) then
    return jsonb_build_object('status','not_permitted');
  end if;
  sampled:=clock_timestamp(); op_id:=gen_random_uuid();
  receipt:=jsonb_build_object('status','ok','operation_id',op_id,'workspace_id',ws,'client_id',cid);
  insert into app_private.client_closure_operations(id,workspace_id,client_id,actor_user_id,request_key,
    canonical_version,canonical_args_hash,result_receipt,recorded_at)
    values(op_id,ws,cid,actor,request_id,1,binding,receipt,sampled);
  insert into app_private.client_deactivation_state(client_id,auth_user_id,deactivated_at)
    values(cid,c.auth_user_id,sampled);
  insert into app_private.refund_auth_lockouts(client_id,auth_user_id)
    values(cid,c.auth_user_id);
  update public.clients set deactivated_at=sampled where workspace_id=ws and id=cid;
  return receipt;
exception
  when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow
    or invalid_datetime_format then return jsonb_build_object('status','invalid_input');
  when others then return jsonb_build_object('status','unavailable');
end $$;
alter function public.close_client(jsonb) owner to postgres;
revoke all on function public.close_client(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.close_client(jsonb) to authenticated;
