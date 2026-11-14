-- F19 T020: immutable continuity re-attachments, atomic delivery, and client projection.
create table app_private.subscription_reattachments (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  successor_subscription_id uuid primary key,
  continuous_subscription_id uuid not null,
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  created_at timestamptz not null default clock_timestamp() check (isfinite(created_at)),
  dry_run_evidence_hash bytea not null check (octet_length(dry_run_evidence_hash) = 32),
  unique (workspace_id, successor_subscription_id),
  foreign key (workspace_id, successor_subscription_id) references public.subscriptions(workspace_id, id) on delete restrict,
  foreign key (workspace_id, continuous_subscription_id) references public.subscriptions(workspace_id, id) on delete restrict,
  check (successor_subscription_id <> continuous_subscription_id)
);

create function app_private.f19_immutable_reattachment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'subscription_reattachment_immutable' using errcode = '23514';
end $$;

create trigger subscription_reattachments_immutable before update or delete on app_private.subscription_reattachments
  for each row execute function app_private.f19_immutable_reattachment();
create trigger subscription_reattachments_no_truncate before truncate on app_private.subscription_reattachments
  for each statement execute function app_private.f19_immutable_reattachment();
revoke all on app_private.subscription_reattachments from public, anon, authenticated, service_role;

create function app_private.f19_resolve_subscription_id(p_workspace_id uuid, p_subscription_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  with recursive chain(id, path) as (
    select p_subscription_id, array[p_subscription_id]::uuid[] where p_subscription_id is not null
    union all
    select a.continuous_subscription_id, c.path || a.continuous_subscription_id
    from chain c join app_private.subscription_reattachments a
      on a.workspace_id = p_workspace_id and a.successor_subscription_id = c.id
    where not a.continuous_subscription_id = any(c.path)
  )
  select id from chain order by cardinality(path) desc limit 1
$$;

create function app_private.f19_reattachment_candidates()
returns table(workspace_id uuid, successor_subscription_id uuid, continuous_subscription_id uuid,
  service_start_date date, service_end_exclusive date)
language sql stable security definer set search_path = '' as $$
  select s.workspace_id, s.id, app_private.f19_resolve_subscription_id(s.workspace_id, s.predecessor_subscription_id),
    coalesce(d.service_start_date, r.service_start_date), coalesce(d.service_end_exclusive, r.service_end_exclusive)
  from public.subscriptions s
  join public.subscription_renewals r on r.workspace_id = s.workspace_id and r.subscription_id = s.id
  left join lateral (select x.service_start_date, x.service_end_exclusive
    from public.subscription_renewal_date_revisions x where x.workspace_id = r.workspace_id and x.renewal_id = r.id
    order by x.revision desc limit 1) d on true
  cross join lateral app_private.f13_project_entitlement(s.workspace_id,
    app_private.f19_resolve_subscription_id(s.workspace_id, s.predecessor_subscription_id),
    (statement_timestamp() at time zone 'Africa/Cairo')::date) as ent(value)
  where s.kind = 'renewal' and s.predecessor_subscription_id is not null
    and s.id <> app_private.f19_resolve_subscription_id(s.workspace_id, s.predecessor_subscription_id)
    and coalesce(d.service_start_date, r.service_start_date) < nullif(ent.value->>'effective_end_exclusive', '')::date
    and coalesce(d.service_end_exclusive, r.service_end_exclusive) > coalesce(d.service_start_date, r.service_start_date)
$$;

create function public.f19_cleanup_subscription_reattachments(p_apply boolean, p_dry_run_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role public.staff_role;
  expected_hash bytea;
  candidate_count integer;
  written integer := 0;
begin
  if actor is null then raise exception 'not_permitted' using errcode = '42501'; end if;
  select s.role into actor_role from public.staff_profiles s where s.user_id = actor;
  if actor_role is distinct from 'platform_owner'::public.staff_role then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_apply is null then return jsonb_build_object('status', 'invalid_input'); end if;
  select extensions.digest(convert_to(coalesce(jsonb_agg(jsonb_build_array(c.workspace_id,
      c.successor_subscription_id, c.continuous_subscription_id, c.service_start_date, c.service_end_exclusive)
      order by c.workspace_id, c.successor_subscription_id), '[]'::jsonb)::text, 'UTF8'), 'sha256'), count(*)::integer
    into expected_hash, candidate_count from app_private.f19_reattachment_candidates() c;
  if not p_apply then return jsonb_build_object('status', 'dry_run', 'candidate_count', candidate_count,
    'dry_run_hash', encode(expected_hash, 'hex')); end if;
  if p_dry_run_hash is null or p_dry_run_hash !~ '^[0-9a-f]{64}$'
    or decode(p_dry_run_hash, 'hex') <> expected_hash then return jsonb_build_object('status', 'stale_dry_run'); end if;
  if exists (select 1 from app_private.f19_reattachment_candidates() c
    join app_private.subscription_reattachments a using (successor_subscription_id)
    where a.continuous_subscription_id <> c.continuous_subscription_id) then
    return jsonb_build_object('status', 'stale_dry_run');
  end if;
  insert into app_private.subscription_reattachments(workspace_id, successor_subscription_id,
    continuous_subscription_id, actor_user_id, dry_run_evidence_hash)
  select c.workspace_id, c.successor_subscription_id, c.continuous_subscription_id, actor, expected_hash
    from app_private.f19_reattachment_candidates() c on conflict (successor_subscription_id) do nothing;
  get diagnostics written = row_count;
  return jsonb_build_object('status', 'ok', 'candidate_count', candidate_count,
    'reattachments_written', written, 'dry_run_hash', encode(expected_hash, 'hex'));
end $$;

-- F13 projections resolve successor references without rewriting renewal/payment history.
create or replace function app_private.f13_freeze_contribution(ws uuid, sid uuid, fid uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select case
    when exists(select 1 from public.subscription_freeze_events e where e.workspace_id = ws and e.freeze_id = fid
      and app_private.f19_resolve_subscription_id(e.workspace_id, e.subscription_id) = app_private.f19_resolve_subscription_id(ws, sid)
      and e.kind = 'remove') then 0
    when exists(select 1 from public.subscription_freeze_events e where e.workspace_id = ws and e.freeze_id = fid
      and app_private.f19_resolve_subscription_id(e.workspace_id, e.subscription_id) = app_private.f19_resolve_subscription_id(ws, sid)
      and e.kind = 'stop') then greatest((select min(e.effective_on) -
        (select f.applied_on from public.subscription_freezes f where f.id = fid and f.workspace_id = ws)
        from public.subscription_freeze_events e where e.workspace_id = ws and e.freeze_id = fid
          and app_private.f19_resolve_subscription_id(e.workspace_id, e.subscription_id) = app_private.f19_resolve_subscription_id(ws, sid)
          and e.kind = 'stop'), 1)
    else (select f.duration_days from public.subscription_freezes f where f.workspace_id = ws and f.id = fid
      and app_private.f19_resolve_subscription_id(f.workspace_id, f.subscription_id) = app_private.f19_resolve_subscription_id(ws, sid))
  end
$$;

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
  anchor_time timestamptz; previous_end date; base_end date; removed_days integer:=0; removal_day date; removal_recorded_at timestamptz; upgrade_anchor_selected boolean:=false; carried_freeze record;
begin
  if as_of is null or not isfinite(as_of) then raise exception 'invalid_input' using errcode='22023'; end if;
  sid := app_private.f19_resolve_subscription_id(ws, sid);
  select * into sub from public.subscriptions s where s.workspace_id=ws and s.id=sid;
  if not found then raise exception 'not_permitted' using errcode='42501'; end if;
  if exists(select 1 from public.refund_operations r where r.workspace_id=ws and app_private.f19_resolve_subscription_id(r.workspace_id,r.subscription_id)=sid) then
    return jsonb_build_object('status','refunded','effective_end_exclusive',null,'coverage_end_exclusive',null); end if;
  select * into activation from public.subscription_activations a where a.workspace_id=ws and app_private.f19_resolve_subscription_id(a.workspace_id,a.subscription_id)=sid;
  if sub.kind='initial' and not found then return jsonb_build_object('status','awaiting_activation','effective_end_exclusive',null,'coverage_end_exclusive',null); end if;
  if sub.kind<>'initial' then return jsonb_build_object('status','expired','effective_end_exclusive',null,'coverage_end_exclusive',null); end if;
  select * into manual_adjustment from public.subscription_manual_date_adjustments d
    where d.workspace_id=ws and app_private.f19_resolve_subscription_id(d.workspace_id,d.subscription_id)=sid order by d.recorded_at desc,d.id desc limit 1;
  select * into upgrade_row from public.subscription_upgrades u
    where u.workspace_id=ws and app_private.f19_resolve_subscription_id(u.workspace_id,u.subscription_id)=sid order by u.expected_revision desc,u.id desc limit 1;
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
    for carried_freeze in
      select f.id,
        case when stop_event.effective_on is null then f.duration_days
          else greatest(stop_event.effective_on-f.applied_on,1) end as contribution,
        removal.recorded_at as removed_at
      from public.subscription_freezes f
      join lateral (
        select e.recorded_at from public.subscription_freeze_events e
        where e.workspace_id=f.workspace_id and e.subscription_id=f.subscription_id
          and e.freeze_id=f.id and e.kind='remove' and e.recorded_at>anchor_time
        order by e.recorded_at,e.id limit 1
      ) removal on true
      left join lateral (
        select min(e.effective_on) as effective_on from public.subscription_freeze_events e
        where e.workspace_id=f.workspace_id and e.subscription_id=f.subscription_id
          and e.freeze_id=f.id and e.kind='stop'
      ) stop_event on true
      where f.workspace_id=ws and app_private.f19_resolve_subscription_id(f.workspace_id,f.subscription_id)=sid and f.recorded_at<=anchor_time
      order by removal.recorded_at,f.id
    loop
      removal_recorded_at:=carried_freeze.removed_at;
      removal_day:=(removal_recorded_at at time zone 'Africa/Cairo')::date;
      removed_days:=removed_days+least(carried_freeze.contribution,greatest(0,
        upgrade_row.service_end_exclusive
          - greatest(coalesce(upgrade_row.service_start_date,term_start)+upgrade_row.duration_days,removal_day+1)
          - removed_days));
    end loop;
    if removal_recorded_at is not null then term_end:=term_end-removed_days; end if;
  end if;  base_end:=term_end;
  loop
    previous_end:=term_end;
    contribution:=coalesce((select sum(app_private.f13_freeze_contribution(ws,sid,f.id))::integer
      from public.subscription_freezes f
      where f.workspace_id=ws and app_private.f19_resolve_subscription_id(f.workspace_id,f.subscription_id)=sid and f.recorded_at>anchor_time
        and f.applied_on>=term_start and f.applied_on<term_end),0);
    select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor
      from public.subscription_freeze_events e
      where e.workspace_id=ws and app_private.f19_resolve_subscription_id(e.workspace_id,e.subscription_id)=sid and e.kind='remove' and e.recorded_at>anchor_time
        and exists(select 1 from public.subscription_freezes f where f.workspace_id=e.workspace_id
          and f.subscription_id=e.subscription_id and f.id=e.freeze_id
          and (f.applied_on>=term_start and f.applied_on<term_end or not exists(
            select 1 from public.subscription_renewals r
            where r.workspace_id=ws and app_private.f19_resolve_subscription_id(r.workspace_id,r.subscription_id)=sid and app_private.f19_resolve_subscription_id(r.workspace_id,r.predecessor_subscription_id)=sid
              and r.recorded_at>anchor_time
          )))
        and (e.recorded_at at time zone 'Africa/Cairo')::date>=term_start
        and (e.recorded_at at time zone 'Africa/Cairo')::date < coalesce((
          select min(coalesce(d.service_start_date,r.service_start_date))
          from public.subscription_renewals r
          left join lateral (select x.service_start_date from public.subscription_renewal_date_revisions x
            where x.workspace_id=r.workspace_id and x.subscription_id=r.subscription_id and x.renewal_id=r.id
            order by x.revision desc limit 1) d on true
          where r.workspace_id=ws and app_private.f19_resolve_subscription_id(r.workspace_id,r.subscription_id)=sid and app_private.f19_resolve_subscription_id(r.workspace_id,r.predecessor_subscription_id)=sid
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
    where r.workspace_id=ws and app_private.f19_resolve_subscription_id(r.workspace_id,r.subscription_id)=sid and app_private.f19_resolve_subscription_id(r.workspace_id,r.predecessor_subscription_id)=sid
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
        where f.workspace_id=ws and app_private.f19_resolve_subscription_id(f.workspace_id,f.subscription_id)=sid and f.recorded_at>anchor_time
          and f.applied_on>=next_start and f.applied_on<next_end),0);
      select max((e.recorded_at at time zone 'Africa/Cairo')::date+1) into remove_floor
        from public.subscription_freeze_events e
        where e.workspace_id=ws and app_private.f19_resolve_subscription_id(e.workspace_id,e.subscription_id)=sid and e.kind='remove' and e.recorded_at>anchor_time
          and exists(select 1 from public.subscription_freezes f where f.workspace_id=e.workspace_id
            and f.subscription_id=e.subscription_id and f.id=e.freeze_id
            and f.applied_on>=next_start and f.applied_on<next_end)
          and (e.recorded_at at time zone 'Africa/Cairo')::date>=next_start
          and (e.recorded_at at time zone 'Africa/Cairo')::date < coalesce((
            select min(coalesce(d.service_start_date,r.service_start_date))
            from public.subscription_renewals r
            left join lateral (select x.service_start_date from public.subscription_renewal_date_revisions x
              where x.workspace_id=r.workspace_id and x.subscription_id=r.subscription_id and x.renewal_id=r.id
              order by x.revision desc limit 1) d on true
            where r.workspace_id=ws and app_private.f19_resolve_subscription_id(r.workspace_id,r.subscription_id)=sid and app_private.f19_resolve_subscription_id(r.workspace_id,r.predecessor_subscription_id)=sid
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
    select exists(select 1 from public.subscription_freezes f where f.workspace_id=ws and app_private.f19_resolve_subscription_id(f.workspace_id,f.subscription_id)=sid
      and f.recorded_at>anchor_time and app_private.f13_freeze_contribution(ws,sid,f.id)>0
      and as_of>=f.applied_on and as_of<f.applied_on+app_private.f13_freeze_contribution(ws,sid,f.id)) into frozen;
    projected:=case when frozen then 'frozen' else 'active' end;
  end if;
  return jsonb_build_object('status',projected,'effective_end_exclusive',last_end,'coverage_end_exclusive',coverage_end);
end $function$;

create or replace function app_private.f13_materialize_entitlement(ws uuid, sid uuid, as_of date)
returns void language plpgsql security definer set search_path = '' as $$
declare projection jsonb;
begin
  sid := app_private.f19_resolve_subscription_id(ws, sid);
  projection := app_private.f13_project_entitlement(ws, sid, as_of);
  insert into app_private.subscription_entitlement_projection(
    workspace_id, subscription_id, status, effective_end_exclusive, as_of_date
  ) values (ws, sid, projection->>'status', (projection->>'effective_end_exclusive')::date, as_of)
  on conflict (workspace_id, subscription_id) do update
    set status = excluded.status, effective_end_exclusive = excluded.effective_end_exclusive,
      as_of_date = excluded.as_of_date,
      materialized_at = case
        when (app_private.subscription_entitlement_projection.status,
          app_private.subscription_entitlement_projection.effective_end_exclusive,
          app_private.subscription_entitlement_projection.as_of_date)
          is distinct from (excluded.status, excluded.effective_end_exclusive, excluded.as_of_date)
        then clock_timestamp() else app_private.subscription_entitlement_projection.materialized_at end;
end $$;

create table public.plan_deliveries (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, subscription_id uuid not null,
  client_id uuid not null, plan_id uuid not null, plan_kind text not null check (plan_kind in ('workout', 'nutrition')),
  revision_id uuid not null, delivery_event_id uuid not null,
  delivered_at timestamptz not null default clock_timestamp() check (isfinite(delivered_at)),
  delivered_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  unique (workspace_id, id), unique (workspace_id, subscription_id, plan_id, revision_id),
  unique (workspace_id, delivered_by, delivery_event_id),
  foreign key (workspace_id, subscription_id, client_id) references public.subscriptions(workspace_id, id, client_id) on delete restrict,
  foreign key (workspace_id, plan_id) references public.plan_roots(workspace_id, id) on delete restrict,
  foreign key (workspace_id, plan_id, revision_id) references public.plan_revisions(workspace_id, plan_id, id) on delete restrict
);
create index plan_deliveries_client on public.plan_deliveries(workspace_id, client_id, plan_kind, plan_id, delivered_at desc);

alter table public.plan_roots add constraint plan_roots_delivery_binding
  unique (workspace_id, id, client_id, plan_kind);
alter table public.plan_revisions add constraint plan_revisions_delivery_binding
  unique (workspace_id, plan_id, id, plan_kind);

create table app_private.plan_delivery_operations (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  operation_key uuid not null, request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  plan_id uuid not null, receipt jsonb,
  recorded_at timestamptz not null default clock_timestamp() check (isfinite(recorded_at)),
  primary key (workspace_id, actor_user_id, operation_key),
  foreign key (workspace_id, plan_id) references public.plan_roots(workspace_id, id) on delete restrict,
  check (receipt is null or jsonb_typeof(receipt) = 'object')
);
alter table public.plan_deliveries add constraint plan_deliveries_root_binding
  foreign key (workspace_id, plan_id, client_id, plan_kind)
  references public.plan_roots(workspace_id, id, client_id, plan_kind) on delete restrict;
alter table public.plan_deliveries add constraint plan_deliveries_revision_binding
  foreign key (workspace_id, plan_id, revision_id, plan_kind)
  references public.plan_revisions(workspace_id, plan_id, id, plan_kind) on delete restrict;
alter table public.plan_deliveries add constraint plan_deliveries_operation_binding
  foreign key (workspace_id, delivered_by, delivery_event_id)
  references app_private.plan_delivery_operations(workspace_id, actor_user_id, operation_key) on delete restrict;

create function app_private.f19_guard_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'plan_delivery_immutable' using errcode = '23514';
end $$;
create function app_private.f19_guard_delivery_operation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.receipt is not null or
    (new.workspace_id, new.actor_user_id, new.operation_key, new.request_fingerprint, new.plan_id, new.recorded_at)
      is distinct from (old.workspace_id, old.actor_user_id, old.operation_key, old.request_fingerprint, old.plan_id, old.recorded_at) then
    raise exception 'plan_delivery_operation_immutable' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger plan_deliveries_immutable before update or delete on public.plan_deliveries
  for each row execute function app_private.f19_guard_delivery();
create trigger plan_deliveries_no_truncate before truncate on public.plan_deliveries
  for each statement execute function app_private.f19_guard_delivery();
create trigger plan_delivery_operations_immutable before update or delete on app_private.plan_delivery_operations
  for each row execute function app_private.f19_guard_delivery_operation();

alter table public.plan_deliveries enable row level security;
alter table public.plan_deliveries force row level security;
create policy plan_deliveries_staff_read on public.plan_deliveries for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
revoke all on public.plan_deliveries from public, anon, authenticated, service_role;
grant select on public.plan_deliveries to authenticated;
revoke all on app_private.plan_delivery_operations from public, anon, authenticated, service_role;

create function public.ready_and_publish_plan(
  p_plan_id uuid, p_expected_draft_version bigint, p_expected_published_version bigint, p_operation_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); root public.plan_roots%rowtype; draft public.plan_drafts%rowtype;
  client_row public.clients%rowtype; prior app_private.plan_delivery_operations%rowtype;
  target_id uuid; eligible_count integer; active_count integer; invalid_successor boolean;
  current_version bigint; new_revision uuid; new_delivery uuid; fingerprint bytea; v_receipt jsonb; entitlement jsonb;
begin
  if actor is null then return jsonb_build_object('status', 'not_permitted'); end if;
  if p_plan_id is null or p_operation_key is null or p_expected_draft_version is null or p_expected_draft_version < 1
    or p_expected_published_version is null or p_expected_published_version < 0 then return jsonb_build_object('status', 'invalid_input'); end if;
  select * into root from public.plan_roots p where p.id = p_plan_id;
  if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then return jsonb_build_object('status', 'not_permitted'); end if;
  fingerprint := extensions.digest(convert_to(jsonb_build_object('plan_id', p_plan_id,
    'draft_version', p_expected_draft_version, 'published_version', p_expected_published_version)::text, 'UTF8'), 'sha256');
  select * into client_row from public.clients c where c.workspace_id = root.workspace_id and c.id = root.client_id for update;
  if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then return jsonb_build_object('status', 'not_permitted'); end if;

  -- Authenticated exact replay is resolved before current entitlement checks.
  select * into prior from app_private.plan_delivery_operations o
    where o.workspace_id = root.workspace_id and o.actor_user_id = actor and o.operation_key = p_operation_key;
  if found then
    if prior.request_fingerprint <> fingerprint or prior.plan_id <> root.id then return jsonb_build_object('status', 'key_conflict'); end if;
    if prior.receipt is null then return jsonb_build_object('status', 'unavailable'); end if;
    perform 1 from public.subscriptions s where s.workspace_id = root.workspace_id
      and s.id = (prior.receipt->>'subscription_id')::uuid for update;
    select * into root from public.plan_roots p where p.workspace_id = root.workspace_id and p.id = p_plan_id for update;
    if not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then return jsonb_build_object('status', 'not_permitted'); end if;
    return prior.receipt;
  end if;

  select exists(select 1 from app_private.f19_reattachment_candidates() c
    join public.subscriptions s on s.workspace_id = c.workspace_id and s.id = c.successor_subscription_id
    where s.workspace_id = root.workspace_id and s.client_id = root.client_id
      and not exists(select 1 from app_private.subscription_reattachments a where a.successor_subscription_id = s.id))
    into invalid_successor;
  if invalid_successor then return jsonb_build_object('status', 'not_permitted'); end if;
  select count(distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id))::integer into active_count
    from public.subscriptions s cross join lateral app_private.f13_project_entitlement(s.workspace_id, s.id,
      (statement_timestamp() at time zone 'Africa/Cairo')::date) as e(value)
    where s.workspace_id = root.workspace_id and s.client_id = root.client_id and e.value->>'status' in ('active', 'frozen');
  if active_count > 1 then return jsonb_build_object('status', 'not_permitted'); end if;
  select count(distinct resolved_id)::integer, (array_agg(resolved_id order by resolved_id))[1]
    into eligible_count, target_id from (
    select distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id) as resolved_id
    from public.subscriptions s cross join lateral app_private.f13_project_entitlement(s.workspace_id, s.id,
      (statement_timestamp() at time zone 'Africa/Cairo')::date) as e(value)
    where s.workspace_id = root.workspace_id and s.client_id = root.client_id
      and e.value->>'status' in ('awaiting_activation', 'active', 'frozen')
  ) eligible;
  if eligible_count <> 1 or target_id is null then return jsonb_build_object('status', 'not_permitted'); end if;
  perform 1 from public.subscriptions s where s.workspace_id = root.workspace_id and s.id = target_id for update;
  if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then return jsonb_build_object('status', 'not_permitted'); end if;
  select * into root from public.plan_roots p where p.workspace_id = root.workspace_id and p.id = p_plan_id for update;
  select * into draft from public.plan_drafts d where d.workspace_id = root.workspace_id and d.plan_id = root.id for update;
  if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then return jsonb_build_object('status', 'not_permitted'); end if;
  select coalesce(max(r.revision_number), 0) into current_version from public.plan_revisions r
    where r.workspace_id = root.workspace_id and r.plan_id = root.id;
  if draft.draft_version <> p_expected_draft_version or current_version <> p_expected_published_version then
    return jsonb_build_object('status', 'stale_version');
  end if;
  entitlement := app_private.f13_project_entitlement(root.workspace_id, target_id, (statement_timestamp() at time zone 'Africa/Cairo')::date);
  if entitlement->>'status' not in ('awaiting_activation', 'active', 'frozen') then return jsonb_build_object('status', 'not_permitted'); end if;

  insert into app_private.plan_delivery_operations(workspace_id, actor_user_id, operation_key, request_fingerprint, plan_id)
    values(root.workspace_id, actor, p_operation_key, fingerprint, root.id) on conflict do nothing;
  if not found then
    select * into prior from app_private.plan_delivery_operations o
      where o.workspace_id = root.workspace_id and o.actor_user_id = actor and o.operation_key = p_operation_key for update;
    if prior.request_fingerprint <> fingerprint or prior.plan_id <> root.id then return jsonb_build_object('status', 'key_conflict'); end if;
    if prior.receipt is null then return jsonb_build_object('status', 'unavailable'); end if;
    return prior.receipt;
  end if;
  new_revision := gen_random_uuid();
  insert into public.plan_revisions(id, workspace_id, plan_id, revision_number, source_draft_version, plan_kind, content, authored_by)
    values(new_revision, root.workspace_id, root.id, current_version + 1, draft.draft_version, root.plan_kind, draft.content, actor);
  new_delivery := gen_random_uuid();
  insert into public.plan_deliveries(id, workspace_id, subscription_id, client_id, plan_id, plan_kind, revision_id, delivery_event_id, delivered_by)
    values(new_delivery, root.workspace_id, target_id, root.client_id, root.id, root.plan_kind, new_revision, p_operation_key, actor);
  v_receipt := jsonb_build_object('status', 'ok', 'plan_id', root.id, 'revision_id', new_revision,
    'revision_number', current_version + 1, 'delivery_id', new_delivery, 'subscription_id', target_id);
  update app_private.plan_delivery_operations o set receipt = v_receipt
    where o.workspace_id = root.workspace_id and o.actor_user_id = actor and o.operation_key = p_operation_key;
  return v_receipt;
end $$;

create function public.client_plan_projection() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare client_row public.clients%rowtype; result jsonb; active_count integer;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'invalid'); end if;
  select * into client_row from public.clients c where c.auth_user_id = auth.uid() and c.approval_state = 'approved';
  if not found or (select count(*) from public.clients c where c.auth_user_id = auth.uid() and c.approval_state = 'approved') <> 1
    then return jsonb_build_object('status', 'invalid'); end if;
  select count(distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id))::integer into active_count
    from public.subscriptions s cross join lateral app_private.f13_project_entitlement(s.workspace_id, s.id,
      (statement_timestamp() at time zone 'Africa/Cairo')::date) as e(value)
    where s.workspace_id = client_row.workspace_id and s.client_id = client_row.id and e.value->>'status' in ('active', 'frozen');
  if active_count <> 1 then return jsonb_build_object('status', 'invalid'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('plan_id', x.plan_id, 'plan_kind', x.plan_kind,
    'revision_number', x.revision_number, 'published_at', x.published_at, 'content', x.content)
    order by x.plan_kind, x.plan_id), '[]'::jsonb) into result from (
      select distinct on (d.plan_id) d.plan_id, d.plan_kind, r.revision_number, r.published_at, r.content
      from public.plan_deliveries d join public.plan_revisions r
        on r.workspace_id = d.workspace_id and r.plan_id = d.plan_id and r.id = d.revision_id
      where d.workspace_id = client_row.workspace_id and d.client_id = client_row.id
        and app_private.f19_resolve_subscription_id(d.workspace_id, d.subscription_id) in (
          select distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id)
          from public.subscriptions s cross join lateral app_private.f13_project_entitlement(s.workspace_id, s.id,
            (statement_timestamp() at time zone 'Africa/Cairo')::date) as e(value)
          where s.workspace_id = client_row.workspace_id and s.client_id = client_row.id and e.value->>'status' in ('active', 'frozen'))
      order by d.plan_id, r.revision_number desc, d.delivered_at desc
    ) x;
  return jsonb_build_object('status', 'ok', 'plans', result);
end $$;

alter function app_private.f19_immutable_reattachment() owner to postgres;
alter function app_private.f19_resolve_subscription_id(uuid, uuid) owner to postgres;
alter function app_private.f19_reattachment_candidates() owner to postgres;
alter function public.f19_cleanup_subscription_reattachments(boolean, text) owner to postgres;
alter function app_private.f13_freeze_contribution(uuid, uuid, uuid) owner to postgres;
alter function app_private.f13_project_entitlement(uuid, uuid, date) owner to postgres;
alter function app_private.f13_materialize_entitlement(uuid, uuid, date) owner to postgres;
alter function app_private.f19_guard_delivery() owner to postgres;
alter function app_private.f19_guard_delivery_operation() owner to postgres;
alter function public.ready_and_publish_plan(uuid, bigint, bigint, uuid) owner to postgres;
alter function public.client_plan_projection() owner to postgres;
revoke all on function app_private.f19_immutable_reattachment(), app_private.f19_guard_delivery(), app_private.f19_guard_delivery_operation()
  from public, anon, authenticated, service_role;
revoke all on function app_private.f19_resolve_subscription_id(uuid, uuid), app_private.f19_reattachment_candidates()
  from public, anon, authenticated, service_role;
revoke all on function public.f19_cleanup_subscription_reattachments(boolean, text) from public, anon, authenticated, service_role;
revoke all on function app_private.f13_freeze_contribution(uuid, uuid, uuid), app_private.f13_project_entitlement(uuid, uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function app_private.f13_materialize_entitlement(uuid, uuid, date) from public, anon, authenticated, service_role;
grant execute on function app_private.f13_project_entitlement(uuid, uuid, date) to service_role;
grant execute on function app_private.f13_materialize_entitlement(uuid, uuid, date) to service_role;
grant execute on function public.f19_cleanup_subscription_reattachments(boolean, text) to authenticated;
revoke all on function public.ready_and_publish_plan(uuid, bigint, bigint, uuid) from public, anon, authenticated, service_role;
grant execute on function public.ready_and_publish_plan(uuid, bigint, bigint, uuid) to authenticated;
revoke all on function public.client_plan_projection() from public, anon, authenticated, service_role;
grant execute on function public.client_plan_projection() to authenticated;
comment on table app_private.subscription_reattachments is 'F19 R20 immutable identity redirection; original renewal/payment history is preserved.';
comment on table public.plan_deliveries is 'F19 T020 immutable Ready & Publish delivery records, subscription-bound at publication.';
