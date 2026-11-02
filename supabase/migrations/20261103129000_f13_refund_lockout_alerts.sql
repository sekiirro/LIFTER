-- F13 T015 runtime: durable, deduplicated lockout alerts with an atomic audit row.
create table app_private.refund_auth_lockout_alerts (
  id uuid primary key default gen_random_uuid(),
  lockout_id uuid not null unique references app_private.refund_auth_lockouts(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  recipient_user_ids uuid[] not null,
  reason text not null check (reason in ('failure_threshold', 'time_threshold')),
  safe_error_code text not null check (safe_error_code in ('provider_unavailable', 'auth_admin_unavailable')),
  attempts integer not null check (attempts >= 0),
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz
);
revoke all on app_private.refund_auth_lockout_alerts from public, anon, authenticated, service_role;
alter table app_private.refund_auth_lockout_alerts enable row level security;
alter table app_private.refund_auth_lockout_alerts force row level security;

create function app_private.f13_create_refund_lockout_alert(p_lockout_id uuid, p_reason text)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  lockout_row record;
  client_workspace uuid;
  recipients uuid[];
  alert_id uuid;
begin
  if p_reason not in ('failure_threshold', 'time_threshold') then return false; end if;
  select q.id,q.client_id,q.attempts,q.safe_error_code,q.status
    into lockout_row
    from app_private.refund_auth_lockouts q
    where q.id=p_lockout_id
    for update;
  if not found or lockout_row.status='succeeded' then return false; end if;
  if exists(select 1 from app_private.refund_auth_lockout_alerts a where a.lockout_id=p_lockout_id) then
    return false;
  end if;
  if p_reason='failure_threshold' and lockout_row.attempts<3 then return false; end if;
  if p_reason='time_threshold' and lockout_row.attempts>=3 then return false; end if;

  select c.workspace_id into client_workspace
    from public.clients c where c.id=lockout_row.client_id;
  if client_workspace is null then return false; end if;

  select coalesce(array_agg(distinct candidates.user_id), '{}'::uuid[])
    into recipients
    from (
      select p.user_id from public.staff_profiles p
        where p.role='platform_owner'::public.staff_role
      union
      select m.user_id from public.workspace_memberships m
        join public.staff_profiles p on p.user_id=m.user_id
        where m.workspace_id=client_workspace and m.revoked_at is null
          and p.role='workspace_owner'::public.staff_role
    ) candidates;

  insert into app_private.refund_auth_lockout_alerts(
    lockout_id,workspace_id,recipient_user_ids,reason,safe_error_code,attempts
  ) values (
    p_lockout_id,client_workspace,recipients,p_reason,
    coalesce(lockout_row.safe_error_code,'auth_admin_unavailable'),lockout_row.attempts
  ) on conflict(lockout_id) do nothing returning id into alert_id;
  if alert_id is null then return false; end if;

  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
  values (
    null,'refund_auth_lockout.alerted','refund_auth_lockout_alerts',alert_id,client_workspace,
    jsonb_build_object(
      'lockout_id',p_lockout_id,
      'reason',p_reason,
      'attempts',lockout_row.attempts,
      'safe_error_code',coalesce(lockout_row.safe_error_code,'auth_admin_unavailable')
    )
  );
  return true;
end $$;

create or replace function public.retry_refund_auth_lockout_job(
  p_id uuid,p_attempt integer,p_retry_at timestamptz,p_safe_error_code text
) returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare updated boolean;
begin
  if p_attempt is null or p_attempt<1 or p_retry_at is null or p_safe_error_code is null
    or p_safe_error_code not in ('provider_unavailable','auth_admin_unavailable') then return false; end if;
  update app_private.refund_auth_lockouts q set status='retry',attempts=p_attempt,
    next_attempt_at=p_retry_at,safe_error_code=p_safe_error_code
    where q.id=p_id and q.status<>'succeeded' and p_attempt=q.attempts+1;
  updated:=found;
  if updated then
    if p_attempt>=3 then perform app_private.f13_create_refund_lockout_alert(p_id,'failure_threshold'); end if;
    return true;
  end if;
  return exists(select 1 from app_private.refund_auth_lockouts q where q.id=p_id
    and q.status='retry' and q.attempts=p_attempt and q.next_attempt_at=p_retry_at
    and q.safe_error_code=p_safe_error_code);
end $$;

create or replace function public.alert_expired_refund_auth_lockouts(p_limit integer,p_checked_at timestamptz)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare item record; created_count integer:=0; processed integer:=0;
begin
  if p_checked_at is null then return 0; end if;
  for item in
    select q.id from app_private.refund_auth_lockouts q
      join app_private.client_deactivation_state d on d.client_id=q.client_id
      where q.status in ('pending','retry') and q.attempts<3
        and d.deactivated_at<=p_checked_at-interval '5 minutes'
        and not exists(select 1 from app_private.refund_auth_lockout_alerts a where a.lockout_id=q.id)
      order by d.deactivated_at,q.id
      for update of q skip locked
      limit greatest(1,least(coalesce(p_limit,1),100))
  loop
    processed:=processed+1;
    if app_private.f13_create_refund_lockout_alert(item.id,'time_threshold') then
      created_count:=created_count+1;
    end if;
  end loop;
  return created_count;
end $$;

create or replace function public.complete_refund_auth_lockout_job(p_id uuid,p_completed_at timestamptz)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update app_private.refund_auth_lockouts q set status='succeeded',completed_at=p_completed_at,
    safe_error_code=null where q.id=p_id and q.status<>'succeeded';
  if found then
    update app_private.refund_auth_lockout_alerts a set resolved_at=coalesce(p_completed_at,clock_timestamp())
      where a.lockout_id=p_id and a.resolved_at is null;
    return true;
  end if;
  return exists(select 1 from app_private.refund_auth_lockouts q where q.id=p_id and q.status='succeeded');
end $$;

create function public.read_refund_auth_lockout_alerts(p_limit integer default 50)
returns table(
  alert_id uuid,lockout_id uuid,workspace_id uuid,reason text,safe_error_code text,
  attempts integer,created_at timestamptz,resolved_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); actor_role public.staff_role;
begin
  if actor is null then return; end if;
  select p.role into actor_role from public.staff_profiles p where p.user_id=actor;
  if actor_role not in ('platform_owner'::public.staff_role,'workspace_owner'::public.staff_role) then return; end if;
  return query
    select a.id,a.lockout_id,a.workspace_id,a.reason,a.safe_error_code,a.attempts,a.created_at,a.resolved_at
    from app_private.refund_auth_lockout_alerts a
    where actor=any(a.recipient_user_ids)
      and (actor_role='platform_owner'::public.staff_role or exists(
        select 1 from public.workspace_memberships m
        where m.workspace_id=a.workspace_id and m.user_id=actor and m.revoked_at is null
      ))
      and a.resolved_at is null
    order by a.created_at desc,a.id
    limit greatest(1,least(coalesce(p_limit,50),100));
end $$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'app_private.f13_create_refund_lockout_alert(uuid,text)',
    'public.retry_refund_auth_lockout_job(uuid,integer,timestamp with time zone,text)',
    'public.alert_expired_refund_auth_lockouts(integer,timestamp with time zone)',
    'public.complete_refund_auth_lockout_job(uuid,timestamp with time zone)',
    'public.read_refund_auth_lockout_alerts(integer)'
  ] loop
    execute format('alter function %s owner to postgres',signature);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',signature);
  end loop;
end $$;
grant execute on function public.retry_refund_auth_lockout_job(uuid,integer,timestamptz,text) to service_role;
grant execute on function public.alert_expired_refund_auth_lockouts(integer,timestamptz) to service_role;
grant execute on function public.complete_refund_auth_lockout_job(uuid,timestamptz) to service_role;
grant execute on function public.read_refund_auth_lockout_alerts(integer) to authenticated;
