-- Code review corrections. All shipped F13 migrations remain immutable.
create or replace function app_private.f13_freeze_guard() returns trigger
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
  if exists (select 1 from public.refund_operations r
      where r.workspace_id=new.workspace_id and r.subscription_id=new.subscription_id)
    or new.applied_by is distinct from auth.uid()
    or not app_private.f12_actor_allowed(new.workspace_id,'manage_freeze',false)
    or not exists (select 1 from public.subscription_activations a
      where a.workspace_id=new.workspace_id and a.subscription_id=new.subscription_id)
    or new.recorded_at < statement_timestamp() or new.recorded_at > clock_timestamp() then
    raise exception 'invalid_freeze_actor_or_state' using errcode='23514';
  end if;
  return new;
end $$;

create or replace function app_private.f13_freeze_event_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f public.subscription_freezes%rowtype;
begin
  select * into f from public.subscription_freezes x
    where x.workspace_id=new.workspace_id and x.subscription_id=new.subscription_id and x.id=new.freeze_id
    for update;
  if not found or exists (select 1 from public.refund_operations r
      where r.workspace_id=new.workspace_id and r.subscription_id=new.subscription_id)
    or new.actor_user_id is distinct from auth.uid()
    or not app_private.f12_actor_allowed(new.workspace_id,'manage_freeze',false)
    or new.effective_on < f.applied_on
    or new.effective_on > f.applied_on + f.duration_days then
    raise exception 'invalid_freeze_event' using errcode='23514';
  end if;
  return new;
end $$;

alter function app_private.f13_freeze_guard() owner to postgres;
alter function app_private.f13_freeze_event_guard() owner to postgres;
revoke all on function app_private.f13_freeze_guard() from public,anon,authenticated,service_role;
revoke all on function app_private.f13_freeze_event_guard() from public,anon,authenticated,service_role;

create or replace function app_private.f13_project_entitlement(ws uuid,sid uuid,as_of date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sub public.subscriptions%rowtype; activation public.subscription_activations%rowtype;
  own_start date; own_end date; covered_end date; first_start date; frozen boolean; projected text;
  has_current boolean; remove_floor date;
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
        where d.workspace_id=r.workspace_id and d.subscription_id=r.subscription_id order by d.revision desc limit 1),r.service_end_exclusive)
        into own_end from public.subscription_renewals r where r.workspace_id=ws and r.subscription_id=sid;
    end if;
  else
    own_start:=(activation.activated_at at time zone 'Africa/Cairo')::date;
    select own_start+sub.duration_days+coalesce(sum(app_private.f13_freeze_contribution(ws,sid,f.id)),0)::integer
      into own_end from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=sid;
    if own_end is null then own_end:=own_start+sub.duration_days; end if;
  end if;
  -- A Remove may erase its freeze contribution, but cannot erase service already
  -- delivered through the Cairo day on which the immutable Remove was recorded.
  select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor
    from public.subscription_freeze_events e
    where e.workspace_id=ws and e.subscription_id=sid and e.kind='remove';
  if remove_floor is not null then own_end:=greatest(own_end,remove_floor); end if;
  with recursive chain(subscription_id,predecessor_subscription_id,service_start_date,service_end_exclusive) as (
    select sid,null::uuid,own_start,own_end
    union all
    select r.subscription_id,r.predecessor_subscription_id,
      coalesce((select d.service_start_date from public.subscription_renewal_date_revisions d
        where d.workspace_id=r.workspace_id and d.subscription_id=r.subscription_id order by d.revision desc limit 1),r.service_start_date),
      greatest(
        coalesce((select d.service_end_exclusive from public.subscription_renewal_date_revisions d
          where d.workspace_id=r.workspace_id and d.subscription_id=r.subscription_id order by d.revision desc limit 1),r.service_end_exclusive)
          +coalesce((select sum(app_private.f13_freeze_contribution(ws,r.subscription_id,f.id))::integer
            from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=r.subscription_id),0),
        coalesce((select max((e.recorded_at at time zone 'Africa/Cairo')::date+1)
          from public.subscription_freeze_events e where e.workspace_id=ws and e.subscription_id=r.subscription_id and e.kind='remove'),
          coalesce((select d.service_end_exclusive from public.subscription_renewal_date_revisions d
            where d.workspace_id=r.workspace_id and d.subscription_id=r.subscription_id order by d.revision desc limit 1),r.service_end_exclusive)))
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

create or replace function app_private.f13_reflow_unstarted_renewal() returns trigger
language plpgsql security definer set search_path='' as $$
declare ws uuid; predecessor_id uuid; source_id uuid; renewal record; projection jsonb;
  predecessor_end date; next_start date; next_end date; old_start date; old_end date; latest_revision integer;
  today_cairo date := (clock_timestamp() at time zone 'Africa/Cairo')::date;
begin
  ws:=new.workspace_id; predecessor_id:=new.subscription_id; source_id:=new.id;
  for renewal in
    select r.*,s.duration_days from public.subscription_renewals r
    join public.subscriptions s on s.workspace_id=r.workspace_id and s.id=r.subscription_id
    where r.workspace_id=ws and r.predecessor_subscription_id=predecessor_id
      and not exists(select 1 from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=r.subscription_id)
    order by r.expected_revision
  loop
    projection:=app_private.f13_project_entitlement(ws,predecessor_id,today_cairo);
    predecessor_end:=(projection->>'effective_end_exclusive')::date;
    if predecessor_end is null then continue; end if;
    select d.service_start_date,d.service_end_exclusive,d.revision into old_start,old_end,latest_revision
      from public.subscription_renewal_date_revisions d where d.workspace_id=ws and d.subscription_id=renewal.subscription_id
      order by d.revision desc limit 1;
    if not found then old_start:=renewal.service_start_date; old_end:=renewal.service_end_exclusive; latest_revision:=0; end if;
    next_start:=greatest(renewal.recording_date,predecessor_end);
    next_end:=next_start+renewal.duration_days;
    if next_start is distinct from old_start or next_end is distinct from old_end then
      if old_start<=today_cairo and next_start is distinct from old_start then
        raise exception 'renewal_reflow_started' using errcode='23514';
      end if;
      insert into public.subscription_renewal_date_revisions(workspace_id,subscription_id,revision,
        service_start_date,service_end_exclusive,cause_table,cause_id,recorded_by)
      values(ws,renewal.subscription_id,latest_revision+1,next_start,next_end,tg_table_name,source_id,auth.uid());
    end if;
  end loop;
  return new;
end $$;
alter function app_private.f13_reflow_unstarted_renewal() owner to postgres;
revoke all on function app_private.f13_reflow_unstarted_renewal() from public,anon,authenticated,service_role;

create or replace function public.subscription_payment_status(workspace_id uuid,client_id uuid,subscription_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not app_private.f12_u5_authorized(workspace_id,'record_payment') then
    return jsonb_build_object('status','not_permitted');
  end if;
  select jsonb_agg(jsonb_build_object(
      'obligation_id',i.id,'seq',i.seq,'amount_minor',i.amount_minor::text,'currency',i.currency,
      'revision',coalesce(t.revision,0),'tail_event_id',t.id,'kind',t.kind,
      'paid',coalesce(t.kind='collection',false),'refunded_minor',coalesce(r.principal_minor,0)::text,
      'refund_state',case when coalesce(r.principal_minor,0)=0 then 'none'
        when coalesce(r.principal_minor,0)>=coalesce(t.amount_minor,0) then 'refunded' else 'partial' end,
      'due_on',case when s.kind='renewal' then i.due_on
        when i.seq=1 or a.activated_at is null then null
        else (a.activated_at at time zone 'Africa/Cairo')::date+i.issued_day_offset end,
      'collected_on',t.collected_on,'effective_on',t.effective_on,'recorded_by',t.recorded_by
    ) order by i.seq) into result
  from public.clients c join public.subscriptions s on s.workspace_id=c.workspace_id and s.client_id=c.id
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
alter function public.subscription_payment_status(uuid,uuid,uuid) owner to postgres;
revoke all on function public.subscription_payment_status(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.subscription_payment_status(uuid,uuid,uuid) to authenticated;
