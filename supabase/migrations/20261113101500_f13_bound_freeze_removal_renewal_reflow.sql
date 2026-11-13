-- S53-R38: only reflow renewal terms that existed when removed upgrade freeze days were still included.
-- FR-039; preserves the MCQ-16B unconsumed-coverage rule and paid post-removal renewals.

CREATE OR REPLACE FUNCTION app_private.f13_project_entitlement(ws uuid, sid uuid, as_of date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sub public.subscriptions%rowtype; activation public.subscription_activations%rowtype;
  manual_adjustment public.subscription_manual_date_adjustments%rowtype; upgrade_row public.subscription_upgrades%rowtype;
  term record; term_start date; term_end date; next_start date; next_end date; term_days integer;
  last_end date; first_start date; has_current boolean:=false; coverage_end date;
  frozen boolean:=false; projected text; remove_floor date; contribution integer;
  anchor_time timestamptz; previous_end date; base_end date; removed_days integer:=0; removal_day date; removal_recorded_at timestamptz; freeze_sum integer:=0; upgrade_anchor_selected boolean:=false;
begin
  if as_of is null or not isfinite(as_of) then raise exception 'invalid_input' using errcode='22023'; end if;
  select * into sub from public.subscriptions s where s.workspace_id=ws and s.id=sid;
  if not found then raise exception 'not_permitted' using errcode='42501'; end if;
  if exists(select 1 from public.refund_operations r where r.workspace_id=ws and r.subscription_id=sid) then
    return jsonb_build_object('status','refunded','effective_end_exclusive',null,'coverage_end_exclusive',null); end if;
  select * into activation from public.subscription_activations a where a.workspace_id=ws and a.subscription_id=sid;
  if sub.kind='initial' and not found then return jsonb_build_object('status','awaiting_activation','effective_end_exclusive',null,'coverage_end_exclusive',null); end if;
  if sub.kind<>'initial' then return jsonb_build_object('status','expired','effective_end_exclusive',null,'coverage_end_exclusive',null); end if;
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
  end if;  base_end:=term_end;
  loop
    previous_end:=term_end;
    contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer
      from public.subscription_freezes f
      where f.workspace_id=ws and f.subscription_id=sid and f.recorded_at>anchor_time
        and f.applied_on>=term_start and f.applied_on<term_end),0);
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
  first_start:=term_start; last_end:=term_end;
  if as_of>=term_start and as_of<term_end then has_current:=true; coverage_end:=term_end; end if;
  for term in select r.*,coalesce(d.service_start_date,r.service_start_date) as projected_start,
      coalesce(d.service_end_exclusive,r.service_end_exclusive) as projected_end
    from public.subscription_renewals r
    left join lateral (select x.service_start_date,x.service_end_exclusive from public.subscription_renewal_date_revisions x
      where x.workspace_id=r.workspace_id and x.subscription_id=r.subscription_id and x.renewal_id=r.id
      order by x.revision desc limit 1) d on true
    where r.workspace_id=ws and r.subscription_id=sid and r.predecessor_subscription_id=sid
      and r.recorded_at>anchor_time order by r.expected_revision loop
    term_days:=term.projected_end-term.projected_start;
    if removed_days>0 and removal_recorded_at is not null and term.recorded_at<=removal_recorded_at
      and term.projected_start>removal_day then
      next_start:=greatest(term.projected_start-removed_days,last_end,term.recording_date);
    else
      next_start:=greatest(term.projected_start,last_end,term.recording_date);
    end if;
    next_end:=next_start+term_days;
    base_end:=next_end;
    loop
      previous_end:=next_end;
      contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer
        from public.subscription_freezes f
        where f.workspace_id=ws and f.subscription_id=sid and f.recorded_at>anchor_time
          and f.applied_on>=next_start and f.applied_on<next_end),0);
      select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor
        from public.subscription_freeze_events e
        where e.workspace_id=ws and e.subscription_id=sid and e.kind='remove' and e.recorded_at>anchor_time
          and (e.recorded_at at time zone 'Africa/Cairo')::date>=next_start
          and (e.recorded_at at time zone 'Africa/Cairo')::date < coalesce((
            select min(coalesce(d.service_start_date,r.service_start_date))
            from public.subscription_renewals r
            left join lateral (select x.service_start_date from public.subscription_renewal_date_revisions x
              where x.workspace_id=r.workspace_id and x.subscription_id=r.subscription_id and x.renewal_id=r.id
              order by x.revision desc limit 1) d on true
            where r.workspace_id=ws and r.subscription_id=sid and r.predecessor_subscription_id=sid
              and r.recorded_at>anchor_time and r.expected_revision>term.expected_revision
          ),'infinity'::date);
      next_end:=greatest(base_end+contribution,coalesce(remove_floor,base_end));
      exit when next_end=previous_end;
    end loop;
    if as_of>=next_start and as_of<next_end then has_current:=true; coverage_end:=next_end;
    elsif has_current and next_start<=coverage_end then coverage_end:=greatest(coverage_end,next_end);
    end if;
    last_end:=next_end;
  end loop;
  if not has_current and as_of<first_start then projected:='future';
  elsif not has_current then projected:='expired';
  else
    select exists(select 1 from public.subscription_freezes f where f.workspace_id=ws and f.subscription_id=sid
      and f.recorded_at>anchor_time and app_private.f13_freeze_contribution(ws,sid,f.id)>0
      and as_of>=f.applied_on and as_of<f.applied_on+app_private.f13_freeze_contribution(ws,sid,f.id)) into frozen;
    projected:=case when frozen then 'frozen' else 'active' end;
  end if;
  return jsonb_build_object('status',projected,'effective_end_exclusive',last_end,'coverage_end_exclusive',coverage_end);
end $function$;

alter function app_private.f13_project_entitlement(uuid,uuid,date) owner to postgres;
revoke all on function app_private.f13_project_entitlement(uuid,uuid,date) from public,anon,authenticated,service_role;
grant execute on function app_private.f13_project_entitlement(uuid,uuid,date) to service_role;
