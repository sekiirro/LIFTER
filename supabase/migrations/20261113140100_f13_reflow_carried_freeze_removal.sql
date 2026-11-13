-- S54-R14: keep renewal date revisions aligned with the F13 projection after
-- removing an unconsumed freeze contribution carried into an upgraded term.
-- FR-039 / SC-037; no immutable lifecycle or payment facts are rewritten.

create or replace function app_private.f13_reflow_unstarted_renewal() returns trigger
language plpgsql security definer set search_path='' as $$
declare ws uuid; sid uuid; source_id uuid; renewal record; projection jsonb;
  predecessor_end date; next_start date; next_end date; old_start date; old_end date; next_revision integer:=0;
  sub public.subscriptions%rowtype; activation public.subscription_activations%rowtype;
  manual_adjustment public.subscription_manual_date_adjustments%rowtype; upgrade_row public.subscription_upgrades%rowtype;
  term_start date; term_end date; anchor_time timestamptz; previous_end date; base_end date;
  remove_floor date; contribution integer; term_days integer; last_end date;
  removal_day date; removal_recorded_at timestamptz; freeze_sum integer:=0; removed_days integer:=0;
  upgrade_anchor_selected boolean:=false;
  today_cairo date := (clock_timestamp() at time zone 'Africa/Cairo')::date;
begin
  ws:=new.workspace_id; sid:=new.subscription_id; source_id:=new.id;
  select * into strict sub from public.subscriptions s where s.workspace_id=ws and s.id=sid;
  select * into strict activation from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=sid;
  select * into manual_adjustment from public.subscription_manual_date_adjustments d
    where d.workspace_id=ws and d.subscription_id=sid order by d.recorded_at desc,d.id desc limit 1;
  select * into upgrade_row from public.subscription_upgrades u
    where u.workspace_id=ws and u.subscription_id=sid order by u.expected_revision desc,u.id desc limit 1;
  if upgrade_row.id is not null and (manual_adjustment.id is null or upgrade_row.recorded_at>manual_adjustment.recorded_at) then
    term_start:=coalesce(upgrade_row.service_start_date,(activation.activated_at at time zone 'Africa/Cairo')::date);
    term_end:=coalesce(upgrade_row.service_end_exclusive,term_start+upgrade_row.duration_days);
    anchor_time:=upgrade_row.recorded_at;
    upgrade_anchor_selected:=true;
  elsif manual_adjustment.id is not null then
    term_start:=manual_adjustment.new_service_start_date;
    term_end:=manual_adjustment.new_service_end_exclusive;
    anchor_time:=manual_adjustment.recorded_at;
  else
    term_start:=(activation.activated_at at time zone 'Africa/Cairo')::date;
    term_end:=term_start+sub.duration_days;
    anchor_time:=activation.activated_at;
  end if;
  if upgrade_anchor_selected then
    select max(e.recorded_at) into removal_recorded_at
      from public.subscription_freeze_events e
      where e.workspace_id=ws and e.subscription_id=sid and e.kind='remove'
        and e.recorded_at>anchor_time;
    removal_day:=(removal_recorded_at at time zone 'Africa/Cairo')::date;
    if removal_day is not null then
      select coalesce(sum(x.contribution),0)::integer into freeze_sum from (
        select f.id,case when stop_event.effective_on is null then f.duration_days
          else greatest(stop_event.effective_on-f.applied_on,1) end as contribution
        from public.subscription_freezes f
        left join lateral (select min(e.effective_on) as effective_on from public.subscription_freeze_events e
          where e.workspace_id=f.workspace_id and e.subscription_id=f.subscription_id
            and e.freeze_id=f.id and e.kind='stop') stop_event on true
        where f.workspace_id=ws and f.subscription_id=sid and f.recorded_at<=anchor_time
          and exists(select 1 from public.subscription_freeze_events e where e.workspace_id=f.workspace_id
            and e.subscription_id=f.subscription_id and e.freeze_id=f.id and e.kind='remove'
            and e.recorded_at>anchor_time)
      ) x;
      removed_days:=least(freeze_sum,greatest(0,upgrade_row.service_end_exclusive
        - greatest(upgrade_row.service_start_date+upgrade_row.duration_days,removal_day+1)));
      term_end:=term_end-removed_days;
    end if;
  end if;
  base_end:=term_end;
  loop
    previous_end:=term_end;
    contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer
      from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=sid
        and f.recorded_at>anchor_time and f.applied_on>=term_start and f.applied_on<term_end),0);
    select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor
      from public.subscription_freeze_events e
      where e.workspace_id=ws and e.subscription_id=sid and e.kind='remove' and e.recorded_at>anchor_time
        and (e.recorded_at at time zone 'Africa/Cairo')::date>=term_start
        and (e.recorded_at at time zone 'Africa/Cairo')::date < coalesce((
          select min(coalesce(d.service_start_date,r.service_start_date))
          from public.subscription_renewals r
          left join lateral (select x.service_start_date from public.subscription_renewal_date_revisions x
            where x.workspace_id=r.workspace_id and x.subscription_id=r.subscription_id and x.renewal_id=r.id
            order by x.revision desc limit 1) d on true
          where r.workspace_id=ws and r.subscription_id=sid and r.predecessor_subscription_id=sid
            and r.recorded_at>anchor_time
        ),'infinity'::date);
    term_end:=greatest(base_end+contribution,coalesce(remove_floor,base_end));
    exit when term_end=previous_end;
  end loop;
  predecessor_end:=term_end;
  for renewal in select r.*,coalesce(d.service_start_date,r.service_start_date) as prior_start,
      coalesce(d.service_end_exclusive,r.service_end_exclusive) as prior_end
    from public.subscription_renewals r left join lateral (
      select x.service_start_date,x.service_end_exclusive from public.subscription_renewal_date_revisions x
      where x.workspace_id=r.workspace_id and x.subscription_id=r.subscription_id and x.renewal_id=r.id
      order by x.revision desc limit 1) d on true
    where r.workspace_id=ws and r.subscription_id=sid and r.predecessor_subscription_id=sid
      and r.recorded_at>anchor_time order by r.expected_revision loop
    old_start:=renewal.prior_start; old_end:=renewal.prior_end;
    term_days:=renewal.service_end_exclusive-renewal.service_start_date;
    next_start:=case when old_start<=today_cairo then old_start
      else greatest(renewal.recording_date,predecessor_end) end;
    next_end:=next_start+term_days;
    if not isfinite(next_start) or not isfinite(next_end) or next_end<=next_start then
      raise exception 'invalid_projected_renewal_dates' using errcode='22023';
    end if;
    if next_start is distinct from old_start or next_end is distinct from old_end then
      if old_start<=today_cairo and next_start is distinct from old_start then
        raise exception 'renewal_reflow_started' using errcode='23514';
      end if;
      select coalesce(max(revision),0)+1 into next_revision
        from public.subscription_renewal_date_revisions where workspace_id=ws and subscription_id=sid;
      insert into public.subscription_renewal_date_revisions(workspace_id,subscription_id,renewal_id,revision,
        service_start_date,service_end_exclusive,cause_table,cause_id,recorded_by)
      values(ws,sid,renewal.id,next_revision,next_start,next_end,tg_table_name,source_id,auth.uid());
    end if;
    base_end:=next_end;
    loop
      previous_end:=next_end;
      contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer
        from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=sid
          and f.recorded_at>anchor_time and f.applied_on>=next_start and f.applied_on<next_end),0);
      select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor
        from public.subscription_freeze_events e where e.workspace_id=ws and e.subscription_id=sid
          and e.kind='remove' and e.recorded_at>anchor_time
          and (e.recorded_at at time zone 'Africa/Cairo')::date>=next_start
          and (e.recorded_at at time zone 'Africa/Cairo')::date < coalesce((
            select min(coalesce(d.service_start_date,r.service_start_date))
            from public.subscription_renewals r left join lateral (
              select x.service_start_date from public.subscription_renewal_date_revisions x
              where x.workspace_id=r.workspace_id and x.subscription_id=r.subscription_id and x.renewal_id=r.id
              order by x.revision desc limit 1) d on true
            where r.workspace_id=ws and r.subscription_id=sid and r.predecessor_subscription_id=sid
              and r.recorded_at>anchor_time and r.expected_revision>renewal.expected_revision
          ),'infinity'::date);
      next_end:=greatest(base_end+contribution,coalesce(remove_floor,base_end));
      exit when next_end=previous_end;
    end loop;
    predecessor_end:=next_end;
  end loop;
  return new;
end $$;

alter function app_private.f13_reflow_unstarted_renewal() owner to postgres;
revoke all on function app_private.f13_reflow_unstarted_renewal() from public,anon,authenticated,service_role;

