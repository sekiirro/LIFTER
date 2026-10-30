-- F13 freeze history. New immutable facts extend the merged F12 subscription model.
create table public.subscription_freezes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  subscription_id uuid not null,
  applied_on date not null check (isfinite(applied_on)),
  duration_days integer not null check (duration_days between 1 and 30),
  applied_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp() check (isfinite(recorded_at)),
  unique (workspace_id,id),
  unique (workspace_id,subscription_id,id),
  foreign key (workspace_id,subscription_id) references public.subscriptions(workspace_id,id) on delete restrict
);

create table public.subscription_freeze_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  subscription_id uuid not null,
  freeze_id uuid not null,
  kind text not null check (kind in ('stop','remove')),
  effective_on date not null check (isfinite(effective_on)),
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp() check (isfinite(recorded_at)),
  unique (workspace_id,id),
  unique (workspace_id,freeze_id,kind),
  foreign key (workspace_id,subscription_id,freeze_id)
    references public.subscription_freezes(workspace_id,subscription_id,id) on delete restrict
);

create function app_private.f13_freeze_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sub public.subscriptions%rowtype;
begin
  select * into sub from public.subscriptions s
    where s.workspace_id=new.workspace_id and s.id=new.subscription_id;
  if not found then raise exception 'not_permitted' using errcode='42501'; end if;
  perform 1 from public.clients c where c.workspace_id=sub.workspace_id and c.id=sub.client_id for update;
  select * into sub from public.subscriptions s
    where s.workspace_id=new.workspace_id and s.id=new.subscription_id and s.client_id=sub.client_id for update;
  if not found then raise exception 'not_permitted' using errcode='42501'; end if;
  if new.applied_by is distinct from auth.uid()
    or not app_private.f12_actor_allowed(new.workspace_id,'manage_freeze',false)
    or not exists (select 1 from public.subscription_activations a
      where a.workspace_id=new.workspace_id and a.subscription_id=new.subscription_id)
    or new.recorded_at < statement_timestamp() or new.recorded_at > clock_timestamp() then
    raise exception 'invalid_freeze_actor_or_state' using errcode='23514';
  end if;
  return new;
end $$;

create function app_private.f13_freeze_event_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f public.subscription_freezes%rowtype;
begin
  select * into f from public.subscription_freezes x
    where x.workspace_id=new.workspace_id and x.subscription_id=new.subscription_id and x.id=new.freeze_id
    for update;
  if not found or new.actor_user_id is distinct from auth.uid()
    or not app_private.f12_actor_allowed(new.workspace_id,'manage_freeze',false)
    or new.effective_on < f.applied_on
    or new.effective_on > f.applied_on + f.duration_days then
    raise exception 'invalid_freeze_event' using errcode='23514';
  end if;
  return new;
end $$;

create function app_private.f13_freeze_contribution(ws uuid,sid uuid,fid uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when exists(select 1 from public.subscription_freeze_events e where e.workspace_id=ws
      and e.subscription_id=sid and e.freeze_id=fid and e.kind='remove') then 0
    when exists(select 1 from public.subscription_freeze_events e where e.workspace_id=ws
      and e.subscription_id=sid and e.freeze_id=fid and e.kind='stop') then greatest(
        (select min(e.effective_on)-(select f.applied_on from public.subscription_freezes f
          where f.workspace_id=ws and f.subscription_id=sid and f.id=fid)
          from public.subscription_freeze_events e where e.workspace_id=ws
            and e.subscription_id=sid and e.freeze_id=fid and e.kind='stop'),1)
    else (select f.duration_days from public.subscription_freezes f where f.workspace_id=ws
      and f.subscription_id=sid and f.id=fid)
  end
$$;

create function app_private.f13_validate_freeze(ws uuid,sid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    with intervals as (
      select f.id, f.applied_on as starts_on,
        f.applied_on + app_private.f13_freeze_contribution(ws,sid,f.id) as ends_on
      from public.subscription_freezes f
      where f.workspace_id=ws and f.subscription_id=sid
    )
    select 1 from intervals a join intervals b on a.id < b.id
    where daterange(a.starts_on,a.ends_on,'[)') && daterange(b.starts_on,b.ends_on,'[)')
  ) then
    raise exception 'overlapping_freezes' using errcode='23514';
  end if;
end $$;

create function app_private.f13_check_freeze() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.f13_validate_freeze(new.workspace_id,new.subscription_id);
  return new;
end $$;

create function app_private.f13_audit_freeze() returns trigger
language plpgsql security definer set search_path = '' as $$
declare action_name text; target uuid; ws uuid; details jsonb;
begin
  if tg_table_name='subscription_freezes' then
    action_name:='subscription.freeze_applied'; target:=new.id; ws:=new.workspace_id;
    details:=jsonb_build_object('subscription_id',new.subscription_id,'applied_on',new.applied_on,
      'duration_days',new.duration_days);
  else
    action_name:='subscription.freeze_'||new.kind; target:=new.freeze_id; ws:=new.workspace_id;
    details:=jsonb_build_object('subscription_id',new.subscription_id,'effective_on',new.effective_on);
  end if;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(auth.uid(),action_name,tg_table_name,target,ws,details);
  return new;
end $$;

create trigger f13_freeze_insert before insert on public.subscription_freezes
  for each row execute function app_private.f13_freeze_guard();
create constraint trigger f13_freeze_integrity after insert on public.subscription_freezes
  deferrable initially deferred for each row execute function app_private.f13_check_freeze();
create trigger f13_freeze_event_insert before insert on public.subscription_freeze_events
  for each row execute function app_private.f13_freeze_event_guard();
create constraint trigger f13_freeze_event_integrity after insert on public.subscription_freeze_events
  deferrable initially deferred for each row execute function app_private.f13_check_freeze();
create trigger f13_freeze_audit after insert on public.subscription_freezes
  for each row execute function app_private.f13_audit_freeze();
create trigger f13_freeze_event_audit after insert on public.subscription_freeze_events
  for each row execute function app_private.f13_audit_freeze();

do $$
declare t text;
begin
  foreach t in array array['public.subscription_freezes','public.subscription_freeze_events'] loop
    execute format('alter table %s owner to postgres',t);
    execute format('revoke all on %s from public,anon,authenticated,service_role',t);
    execute format('alter table %s enable row level security',t);
    execute format('alter table %s force row level security',t);
    execute format('create trigger f13_no_update before update on %s for each row execute function app_private.audit_events_immutable()',t);
    execute format('create trigger f13_no_delete before delete on %s for each row execute function app_private.forbid_delete()',t);
    execute format('create trigger f13_no_truncate before truncate on %s for each statement execute function app_private.forbid_delete()',t);
  end loop;
end $$;

alter function app_private.f13_freeze_guard() owner to postgres;
alter function app_private.f13_freeze_event_guard() owner to postgres;
alter function app_private.f13_freeze_contribution(uuid,uuid,uuid) owner to postgres;
alter function app_private.f13_validate_freeze(uuid,uuid) owner to postgres;
alter function app_private.f13_check_freeze() owner to postgres;
alter function app_private.f13_audit_freeze() owner to postgres;
revoke all on function app_private.f13_freeze_guard() from public,anon,authenticated,service_role;
revoke all on function app_private.f13_freeze_event_guard() from public,anon,authenticated,service_role;
revoke all on function app_private.f13_freeze_contribution(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.f13_validate_freeze(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.f13_check_freeze() from public,anon,authenticated,service_role;
revoke all on function app_private.f13_audit_freeze() from public,anon,authenticated,service_role;


create table app_private.subscription_freeze_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  subscription_id uuid not null,
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  request_key uuid not null,
  canonical_args_hash bytea not null check(octet_length(canonical_args_hash)=32),
  result_receipt jsonb not null check(jsonb_typeof(result_receipt)='object'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique(actor_user_id,request_key),
  unique(workspace_id,id),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(workspace_id,subscription_id,client_id) references public.subscriptions(workspace_id,id,client_id) on delete restrict
);
alter table app_private.subscription_freeze_operations owner to postgres;
revoke all on app_private.subscription_freeze_operations from public,anon,authenticated,service_role;
alter table app_private.subscription_freeze_operations enable row level security;
alter table app_private.subscription_freeze_operations force row level security;
create trigger f13_freeze_operation_no_update before update on app_private.subscription_freeze_operations
  for each row execute function app_private.audit_events_immutable();
create trigger f13_freeze_operation_no_delete before delete on app_private.subscription_freeze_operations
  for each row execute function app_private.forbid_delete();
create trigger f13_freeze_operation_no_truncate before truncate on app_private.subscription_freeze_operations
  for each statement execute function app_private.forbid_delete();

create function public.subscription_freeze_operation(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  action_name text;
  ws uuid;
  cid uuid;
  sid uuid;
  key uuid;
  fid uuid;
  days integer;
  revision integer;
  actor uuid:=auth.uid();
  current_revision integer;
  args_hash bytea;
  previous app_private.subscription_freeze_operations%rowtype;
  receipt jsonb;
  sub public.subscriptions%rowtype;
begin
  if jsonb_typeof(request) is distinct from 'object'
    or jsonb_typeof(request->'action') is distinct from 'string'
    or request->>'action' not in ('apply','stop','remove')
    or jsonb_typeof(request->'workspace_id') is distinct from 'string'
    or jsonb_typeof(request->'client_id') is distinct from 'string'
    or jsonb_typeof(request->'subscription_id') is distinct from 'string'
    or jsonb_typeof(request->'request_key') is distinct from 'string'
    or jsonb_typeof(request->'expected_revision') is distinct from 'number'
    or (request->>'expected_revision')!~'^(0|[1-9][0-9]{0,8})$'
    or (request->>'workspace_id')!~*'^[0-9a-f-]{36}$'
    or (request->>'client_id')!~*'^[0-9a-f-]{36}$'
    or (request->>'subscription_id')!~*'^[0-9a-f-]{36}$'
    or (request->>'request_key')!~*'^[0-9a-f-]{36}$' then
    return jsonb_build_object('status','invalid_input');
  end if;
  action_name:=request->>'action';
  ws:=(request->>'workspace_id')::uuid;
  cid:=(request->>'client_id')::uuid;
  sid:=(request->>'subscription_id')::uuid;
  key:=(request->>'request_key')::uuid;
  revision:=(request->>'expected_revision')::integer;
  if action_name='apply' then
    if (select count(*) from jsonb_object_keys(request))<>7 or jsonb_typeof(request->'duration_days') is distinct from 'number'
      or (request->>'duration_days')!~'^(1[0-9]|2[0-9]|30|[1-9])$' then
      return jsonb_build_object('status','invalid_input');
    end if;
    days:=(request->>'duration_days')::integer;
  else
    if (select count(*) from jsonb_object_keys(request))<>7 or jsonb_typeof(request->'freeze_id') is distinct from 'string'
      or (request->>'freeze_id')!~*'^[0-9a-f-]{36}$' then
      return jsonb_build_object('status','invalid_input');
    end if;
    fid:=(request->>'freeze_id')::uuid;
  end if;
  select s.* into sub from public.subscriptions s
    where s.workspace_id=ws and s.id=sid and s.client_id=cid;
  if not found or not app_private.f12_actor_allowed(ws,'manage_freeze',false) then
    return jsonb_build_object('status','not_permitted');
  end if;
  -- Shared financial/lifecycle order: client, subscription, then operation key.
  perform 1 from public.clients c where c.workspace_id=ws and c.id=cid for update;
  select s.* into sub from public.subscriptions s
    where s.workspace_id=ws and s.id=sid and s.client_id=cid for update;
  if not found then return jsonb_build_object('status','not_permitted'); end if;
  if not app_private.f12_actor_allowed(ws,'manage_freeze',false) then
    return jsonb_build_object('status','not_permitted');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lifter.f12.operation:'||actor::text||':'||key::text,0));
  -- Authorization may have been revoked while this request waited for the shared key lock.
  if not app_private.f12_actor_allowed(ws,'manage_freeze',false) then
    return jsonb_build_object('status','not_permitted');
  end if;
  if exists(select 1 from app_private.registration_operations o where o.actor_user_id=actor and o.request_key=key) then
    return jsonb_build_object('status','key_conflict');
  end if;
  args_hash:=extensions.digest(convert_to(request::text,'UTF8'),'sha256');
  select * into previous from app_private.subscription_freeze_operations o
    where o.actor_user_id=actor and o.request_key=key;
  if found then
    if previous.canonical_args_hash=args_hash then
      if not app_private.f12_actor_allowed(ws,'manage_freeze',false) then
        return jsonb_build_object('status','not_permitted');
      end if;
      return previous.result_receipt;
    end if;
    return jsonb_build_object('status','key_conflict');
  end if;
  select count(*)::integer into current_revision from (
    select f.id from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=sid
    union all
    select e.id from public.subscription_freeze_events e where e.workspace_id=ws and e.subscription_id=sid
  ) facts;
  if current_revision<>revision then return jsonb_build_object('status','stale_state'); end if;
  if action_name='apply' then
    fid:=gen_random_uuid();
    insert into public.subscription_freezes(id,workspace_id,subscription_id,applied_on,duration_days,applied_by)
    values(fid,ws,sid,(clock_timestamp() at time zone 'Africa/Cairo')::date,days,actor);
    receipt:=jsonb_build_object('status','applied','freeze_id',fid,'revision',current_revision+1);
  else
    if not exists(select 1 from public.subscription_freezes f where f.workspace_id=ws
      and f.subscription_id=sid and f.id=fid) then
      return jsonb_build_object('status','not_permitted');
    end if;
    insert into public.subscription_freeze_events(workspace_id,subscription_id,freeze_id,kind,effective_on,actor_user_id)
    values(ws,sid,fid,action_name,(clock_timestamp() at time zone 'Africa/Cairo')::date,actor);
    receipt:=jsonb_build_object('status',case action_name when 'stop' then 'stopped' else 'removed' end,
      'freeze_id',fid,'revision',current_revision+1);
  end if;
  insert into app_private.subscription_freeze_operations(workspace_id,client_id,subscription_id,
      actor_user_id,request_key,canonical_args_hash,result_receipt)
    values(ws,cid,sid,actor,key,args_hash,receipt);
  return receipt;
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('status','invalid_input');
end $$;
alter function public.subscription_freeze_operation(jsonb) owner to postgres;
revoke all on function public.subscription_freeze_operation(jsonb) from public,anon,service_role;
grant execute on function public.subscription_freeze_operation(jsonb) to authenticated;
