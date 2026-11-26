-- P7 T028/T029: signed adjustments, immutable monthly snapshots and shared period fence.
-- The earned-fact producer takes source locks before p7_lock_period; adjustment routing
-- and finalization use this same workspace/month advisory key.
create table public.p7_adjustment_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  staff_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  points numeric(10,2) not null check (points <> 0),
  effective_month date not null check (extract(day from effective_month) = 1),
  original_month date check (original_month is null or extract(day from original_month) = 1),
  source_key uuid not null,
  source_hash text not null,
  reason_code text not null check (length(reason_code) between 1 and 80),
  recorded_at timestamptz not null default clock_timestamp() check (isfinite(recorded_at)),
  unique (workspace_id, source_key)
);
alter table public.p7_adjustment_entries owner to postgres;
alter table public.p7_adjustment_entries enable row level security;
alter table public.p7_adjustment_entries force row level security;
revoke all on public.p7_adjustment_entries from public, anon, authenticated, service_role;
create index p7_adjustment_entries_period_staff_idx
  on public.p7_adjustment_entries(workspace_id, effective_month, staff_user_id);

-- Preserve the activation month independently from the month in which a late
-- earned fact is recorded. Existing facts retain their original trigger month.
alter table public.p7_earned_points add column original_month date;
alter table public.p7_earned_points disable trigger p7_earned_points_immutable;
update public.p7_earned_points set original_month = effective_month;
alter table public.p7_earned_points enable trigger p7_earned_points_immutable;
alter table public.p7_earned_points alter column original_month set not null;
alter table public.p7_earned_points add constraint p7_earned_points_original_month_first_day
  check (extract(day from original_month) = 1);

create table public.p7_month_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  effective_month date not null check (extract(day from effective_month) = 1),
  snapshot_version smallint not null default 1 check (snapshot_version = 1),
  formula_version text not null check (formula_version = 'p7-net-points-v1'),
  source_watermark timestamptz not null check (isfinite(source_watermark)),
  totals jsonb not null check (jsonb_typeof(totals) = 'object'),
  finalized_by uuid not null references auth.users(id) on delete restrict,
  finalized_at timestamptz not null default clock_timestamp() check (isfinite(finalized_at)),
  unique (workspace_id, effective_month)
);
alter table public.p7_month_snapshots owner to postgres;
alter table public.p7_month_snapshots enable row level security;
alter table public.p7_month_snapshots force row level security;
revoke all on public.p7_month_snapshots from public, anon, authenticated, service_role;

create function app_private.p7_route_closed_period()
returns trigger language plpgsql set search_path = '' as $$
declare current_month date;
begin
  new.original_month := coalesce(new.original_month, new.effective_month);
  perform app_private.p7_lock_period(new.workspace_id, new.effective_month);
  if exists (
    select 1 from public.p7_month_snapshots s
    where s.workspace_id = new.workspace_id and s.effective_month = new.effective_month
  ) then
    current_month := app_private.p7_month_for_trigger(clock_timestamp());
    perform app_private.p7_lock_period(new.workspace_id, current_month);
    new.effective_month := current_month;
  end if;
  return new;
end
$$;

create trigger p7_adjustment_route_before_insert
  before insert on public.p7_adjustment_entries
  for each row execute function app_private.p7_route_closed_period();
create trigger p7_earned_points_route_before_insert
  before insert on public.p7_earned_points
  for each row execute function app_private.p7_route_closed_period();
create trigger p7_adjustment_entries_immutable
  before update or delete on public.p7_adjustment_entries
  for each row execute function app_private.p7_reject_mutation();
create trigger p7_adjustment_entries_no_truncate
  before truncate on public.p7_adjustment_entries
  for each statement execute function app_private.p7_reject_mutation();
create trigger p7_month_snapshots_immutable
  before update or delete on public.p7_month_snapshots
  for each row execute function app_private.p7_reject_mutation();
create trigger p7_month_snapshots_no_truncate
  before truncate on public.p7_month_snapshots
  for each statement execute function app_private.p7_reject_mutation();

create function public.p7_finalize_month(p_workspace_id uuid, p_month date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; snapshot_id uuid; totals jsonb; watermark timestamptz;
begin
  actor := auth.uid();
  if actor is null or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(p_workspace_id, null) then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  if p_month is null or extract(day from p_month) <> 1
    or p_month >= app_private.p7_month_for_trigger(statement_timestamp()) then
    return jsonb_build_object('status', 'invalid_period');
  end if;

  perform app_private.p7_lock_period(p_workspace_id, p_month);
  if actor is distinct from auth.uid() or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(p_workspace_id, null) then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  select s.id into snapshot_id from public.p7_month_snapshots s
    where s.workspace_id = p_workspace_id and s.effective_month = p_month for update;
  if snapshot_id is not null then
    return jsonb_build_object('status', 'finalized', 'snapshot_id', snapshot_id,
      'effective_month', p_month);
  end if;

  watermark := clock_timestamp();
  with entries as (
    select e.staff_user_id, e.points from public.p7_earned_points e
    where e.workspace_id = p_workspace_id and e.effective_month = p_month
      and e.recorded_at <= watermark
    union all
    select a.staff_user_id, a.points from public.p7_adjustment_entries a
    where a.workspace_id = p_workspace_id and a.effective_month = p_month
      and a.recorded_at <= watermark
  ), totals_by_staff as (
    select staff_user_id, sum(points)::numeric(10,2) as points
    from entries group by staff_user_id
  )
  select coalesce(pg_catalog.jsonb_object_agg(staff_user_id::text, points::text), '{}'::jsonb)
    into totals from totals_by_staff;

  insert into public.p7_month_snapshots(workspace_id, effective_month, formula_version,
    source_watermark, totals, finalized_by)
  values (p_workspace_id, p_month, 'p7-net-points-v1', watermark, totals, actor)
  returning id into snapshot_id;
  insert into public.audit_events(actor_user_id, action, target_table, target_id,
    workspace_id, details)
  values (actor, 'workforce.month_finalized', 'p7_month_snapshots', snapshot_id,
    p_workspace_id, jsonb_build_object('reference', 'p7-month:' || snapshot_id::text));
  return jsonb_build_object('status', 'finalized', 'snapshot_id', snapshot_id,
    'effective_month', p_month);
end
$$;

alter function app_private.p7_route_closed_period() owner to postgres;
alter function public.p7_finalize_month(uuid,date) owner to postgres;
revoke all on function app_private.p7_route_closed_period() from public, anon, authenticated, service_role;
revoke all on function public.p7_finalize_month(uuid,date) from public, anon, service_role;
grant execute on function public.p7_finalize_month(uuid,date) to authenticated;

comment on table public.p7_adjustment_entries is
  'Append-only signed PO adjustment lineage; closed-month entries route to the current open month.';
comment on table public.p7_month_snapshots is
  'Immutable PO-finalized monthly totals as exact decimal strings, keyed by workspace and Cairo month.';
