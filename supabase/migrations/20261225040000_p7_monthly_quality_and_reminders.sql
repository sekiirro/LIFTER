-- Migration: 20261225040000_p7_monthly_quality_and_reminders.sql
-- Lane: s70-gemini-p7quality
-- Tasks: T014, T015, T016 (FR-009, FR-020, FR-023)
-- P7 Monthly Quality Revisions (Transformation & Feedback), Latest-Effective Projections,
-- Per-Trainer Weights Defaults, and Monthly PO Reminder Outbox.

-- 1. Table: public.p7_monthly_quality_revisions (Append-only immutable revisions)
create table public.p7_monthly_quality_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  trainer_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  month text not null constraint p7_quality_month_format check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  category text not null constraint p7_quality_category_check check (category in ('transformation', 'feedback')),
  revision integer not null default 1 constraint p7_quality_revision_positive check (revision >= 1),
  positive_count integer not null default 0 constraint p7_quality_pos_count_check check (positive_count >= 0),
  negative_count integer not null default 0 constraint p7_quality_neg_count_check check (negative_count >= 0),
  positive_weight numeric(10,2) not null default 1.00 constraint p7_quality_pos_weight_scale check (scale(positive_weight) <= 2),
  negative_weight numeric(10,2) not null default 0.00 constraint p7_quality_neg_weight_scale check (scale(negative_weight) <= 2),
  net_points numeric(10,2) not null constraint p7_quality_net_points_check check (
    net_points = round((positive_count * positive_weight) + (negative_count * negative_weight), 2)
  ),
  idempotency_key text not null,
  created_at timestamptz not null default clock_timestamp() check (isfinite(created_at)),
  created_by uuid not null references auth.users(id) on delete restrict,
  unique (workspace_id, trainer_id, month, category, revision),
  unique (workspace_id, idempotency_key)
);

create index p7_quality_revisions_lookup_idx
  on public.p7_monthly_quality_revisions (workspace_id, trainer_id, month, category, revision desc);

-- Physical immutability triggers (strictly append-only)
create or replace function app_private.guard_p7_quality_revisions_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'p7_quality_revisions_immutable' using errcode = '23514';
end $$;

create trigger p7_monthly_quality_revisions_no_update
  before update on public.p7_monthly_quality_revisions
  for each row execute function app_private.guard_p7_quality_revisions_immutable();

create trigger p7_monthly_quality_revisions_no_delete
  before delete on public.p7_monthly_quality_revisions
  for each row execute function app_private.guard_p7_quality_revisions_immutable();

create trigger p7_monthly_quality_revisions_no_truncate
  before truncate on public.p7_monthly_quality_revisions
  for each statement execute function app_private.guard_p7_quality_revisions_immutable();

alter table public.p7_monthly_quality_revisions owner to postgres;
alter table public.p7_monthly_quality_revisions enable row level security;
alter table public.p7_monthly_quality_revisions force row level security;
revoke all on public.p7_monthly_quality_revisions from public, anon, authenticated, service_role;
grant select on public.p7_monthly_quality_revisions to authenticated;

-- RLS: PO reads all in authorized workspaces
create policy p7_quality_revisions_select_po on public.p7_monthly_quality_revisions
  for select to authenticated
  using (
    app_private.is_platform_owner()
    and app_private.has_workspace_access(workspace_id)
  );

-- 2. Table: public.p7_trainer_quality_settings (Per-Trainer customizable defaults, append-only revisions)
create table public.p7_trainer_quality_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  trainer_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  category text not null constraint p7_settings_category_check check (category in ('transformation', 'feedback')),
  revision integer not null default 1 constraint p7_settings_revision_positive check (revision >= 1),
  positive_weight numeric(10,2) not null constraint p7_settings_pos_weight_scale check (scale(positive_weight) <= 2),
  negative_weight numeric(10,2) not null constraint p7_settings_neg_weight_scale check (scale(negative_weight) <= 2),
  idempotency_key text not null,
  created_at timestamptz not null default clock_timestamp() check (isfinite(created_at)),
  created_by uuid not null references auth.users(id) on delete restrict,
  unique (workspace_id, trainer_id, category, revision),
  unique (workspace_id, idempotency_key)
);

create index p7_trainer_settings_lookup_idx
  on public.p7_trainer_quality_settings (workspace_id, trainer_id, category, revision desc);

-- Physical immutability triggers (strictly append-only)
create trigger p7_trainer_quality_settings_no_update
  before update on public.p7_trainer_quality_settings
  for each row execute function app_private.guard_p7_quality_revisions_immutable();

create trigger p7_trainer_quality_settings_no_delete
  before delete on public.p7_trainer_quality_settings
  for each row execute function app_private.guard_p7_quality_revisions_immutable();

create trigger p7_trainer_quality_settings_no_truncate
  before truncate on public.p7_trainer_quality_settings
  for each statement execute function app_private.guard_p7_quality_revisions_immutable();

alter table public.p7_trainer_quality_settings owner to postgres;
alter table public.p7_trainer_quality_settings enable row level security;
alter table public.p7_trainer_quality_settings force row level security;
revoke all on public.p7_trainer_quality_settings from public, anon, authenticated, service_role;
grant select on public.p7_trainer_quality_settings to authenticated;

-- RLS: PO reads all in authorized workspaces
create policy p7_trainer_settings_select_po on public.p7_trainer_quality_settings
  for select to authenticated
  using (
    app_private.is_platform_owner()
    and app_private.has_workspace_access(workspace_id)
  );


-- 3. View: public.p7_monthly_quality_effective (Latest-effective projection)
create or replace view public.p7_monthly_quality_effective with (security_invoker = true) as
select distinct on (workspace_id, trainer_id, month, category)
  id,
  workspace_id,
  trainer_id,
  month,
  category,
  revision,
  positive_count,
  negative_count,
  positive_weight,
  negative_weight,
  net_points,
  idempotency_key,
  created_at,
  created_by
from public.p7_monthly_quality_revisions
order by workspace_id, trainer_id, month, category, revision desc;

alter view public.p7_monthly_quality_effective owner to postgres;
grant select on public.p7_monthly_quality_effective to authenticated;


-- 4. Table: public.p7_monthly_reminder_outbox (Unique workspace+month dedup)
create table public.p7_monthly_reminder_outbox (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  month text not null constraint p7_reminder_month_format check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  notification_kind text not null default 'monthly_quality_reminder' constraint p7_reminder_kind_check check (notification_kind in ('monthly_quality_reminder')),
  dedup_key text not null unique,
  job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'enqueued' constraint p7_reminder_status_check check (status in ('enqueued', 'sent', 'failed')),
  placeholder_copy_key text not null default 'p7.monthly_reminder.placeholder',
  created_at timestamptz not null default clock_timestamp() check (isfinite(created_at)),
  unique (workspace_id, month)
);

alter table public.p7_monthly_reminder_outbox owner to postgres;
alter table public.p7_monthly_reminder_outbox enable row level security;
alter table public.p7_monthly_reminder_outbox force row level security;
revoke all on public.p7_monthly_reminder_outbox from public, anon, authenticated, service_role;
grant select on public.p7_monthly_reminder_outbox to authenticated;

create policy p7_reminder_outbox_select_po on public.p7_monthly_reminder_outbox
  for select to authenticated
  using (
    app_private.is_platform_owner()
    and app_private.has_workspace_access(workspace_id)
  );


-- 5. RPC: public.record_monthly_quality
create or replace function public.record_monthly_quality(
  p_workspace_id uuid,
  p_trainer_id uuid,
  p_month text,
  p_category text,
  p_positive_count integer,
  p_negative_count integer default 0,
  p_positive_weight numeric default null,
  p_negative_weight numeric default null,
  p_idempotency_key text default null,
  p_expected_revision integer default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v_pos_weight numeric(10,2);
  v_neg_weight numeric(10,2);
  v_net_points numeric(10,2);
  v_current_rev integer;
  v_next_rev integer;
  v_key text;
  v_existing record;
  v_row record;
begin
  -- 1. Authorization: Platform Owner only in an authorized workspace
  if actor is null or not app_private.is_platform_owner() or not app_private.has_workspace_access(p_workspace_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  -- 2. Input validations
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid_month_format' using errcode = '22023';
  end if;

  if p_category is null or p_category not in ('transformation', 'feedback') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;

  if p_positive_count is null or p_positive_count < 0 then
    raise exception 'invalid_count' using errcode = '22023';
  end if;

  if p_negative_count is null or p_negative_count < 0 then
    raise exception 'invalid_count' using errcode = '22023';
  end if;

  if p_category = 'transformation' and p_negative_count <> 0 then
    raise exception 'transformation_negative_count_forbidden' using errcode = '22023';
  end if;

  -- 3. Check trainer exists and is assigned/staff
  if not exists (
    select 1 from public.staff_profiles sp
    where sp.user_id = p_trainer_id and sp.role = 'trainer'
  ) then
    raise exception 'trainer_not_found' using errcode = '22023';
  end if;

  -- 4. Check scale of supplied weights
  if p_positive_weight is not null and scale(p_positive_weight) > 2 then
    raise exception 'positive_weight_scale_exceeded' using errcode = '22023';
  end if;

  if p_negative_weight is not null and scale(p_negative_weight) > 2 then
    raise exception 'negative_weight_scale_exceeded' using errcode = '22023';
  end if;

  -- 5. Resolve weights (input -> settings -> defaults)
  if p_category = 'transformation' then
    if p_positive_weight is not null then
      v_pos_weight := round(p_positive_weight, 2);
    else
      select positive_weight into v_pos_weight
      from public.p7_trainer_quality_settings
      where workspace_id = p_workspace_id and trainer_id = p_trainer_id and category = 'transformation'
      order by revision desc
      limit 1;
      if v_pos_weight is null then
        v_pos_weight := 1.00;
      end if;
    end if;
    v_neg_weight := 0.00;
  else -- feedback
    if p_positive_weight is not null then
      v_pos_weight := round(p_positive_weight, 2);
    else
      select positive_weight into v_pos_weight
      from public.p7_trainer_quality_settings
      where workspace_id = p_workspace_id and trainer_id = p_trainer_id and category = 'feedback'
      order by revision desc
      limit 1;
      if v_pos_weight is null then
        v_pos_weight := 1.00;
      end if;
    end if;

    if p_negative_weight is not null then
      v_neg_weight := round(p_negative_weight, 2);
    else
      select negative_weight into v_neg_weight
      from public.p7_trainer_quality_settings
      where workspace_id = p_workspace_id and trainer_id = p_trainer_id and category = 'feedback'
      order by revision desc
      limit 1;
      if v_neg_weight is null then
        v_neg_weight := -1.00;
      end if;
    end if;
  end if;

  -- Compute net points
  v_net_points := round((p_positive_count * v_pos_weight) + (p_negative_count * v_neg_weight), 2);

  v_key := coalesce(p_idempotency_key, gen_random_uuid()::text);

  -- 6. Idempotency check
  select * into v_existing
  from public.p7_monthly_quality_revisions
  where workspace_id = p_workspace_id and idempotency_key = v_key;

  if v_existing.id is not null then
    if v_existing.trainer_id = p_trainer_id
      and v_existing.month = p_month
      and v_existing.category = p_category
      and v_existing.positive_count = p_positive_count
      and v_existing.negative_count = p_negative_count
      and v_existing.positive_weight = v_pos_weight
      and v_existing.negative_weight = v_neg_weight
      and v_existing.net_points = v_net_points then
      return jsonb_build_object(
        'id', v_existing.id,
        'workspace_id', v_existing.workspace_id,
        'trainer_id', v_existing.trainer_id,
        'month', v_existing.month,
        'category', v_existing.category,
        'revision', v_existing.revision,
        'positive_count', v_existing.positive_count,
        'negative_count', v_existing.negative_count,
        'positive_weight', to_char(v_existing.positive_weight, 'FM999999990.00'),
        'negative_weight', to_char(v_existing.negative_weight, 'FM999999990.00'),
        'net_points', to_char(v_existing.net_points, 'FM999999990.00'),
        'idempotency_key', v_existing.idempotency_key,
        'created_at', v_existing.created_at,
        'created_by', v_existing.created_by
      );
    else
      raise exception 'idempotency_conflict: arguments diverged for key %', v_key using errcode = '23505';
    end if;
  end if;

  -- 7. Advisory transactional lock on (workspace, trainer, month, category)
  perform pg_catalog.pg_advisory_xact_lock(
    hashtext('p7_quality'),
    hashtext(format('%s:%s:%s:%s', p_workspace_id, p_trainer_id, p_month, p_category))
  );

  select coalesce(max(revision), 0) into v_current_rev
  from public.p7_monthly_quality_revisions
  where workspace_id = p_workspace_id
    and trainer_id = p_trainer_id
    and month = p_month
    and category = p_category;

  -- Optimistic concurrency check
  if p_expected_revision is not null then
    if v_current_rev <> p_expected_revision then
      raise exception 'stale_revision: expected % but current is %', p_expected_revision, v_current_rev using errcode = '40001';
    end if;
  end if;

  v_next_rev := v_current_rev + 1;

  -- 8. Insert new revision
  insert into public.p7_monthly_quality_revisions (
    workspace_id, trainer_id, month, category, revision,
    positive_count, negative_count, positive_weight, negative_weight, net_points,
    idempotency_key, created_by
  ) values (
    p_workspace_id, p_trainer_id, p_month, p_category, v_next_rev,
    p_positive_count, p_negative_count, v_pos_weight, v_neg_weight, v_net_points,
    v_key, actor
  ) returning * into v_row;

  -- 9. Audit event with opaque reference ONLY (FR-020, SOL-03)
  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    actor,
    'quality.revision_recorded',
    'p7_monthly_quality_revisions',
    v_row.id,
    p_workspace_id,
    jsonb_build_object(
      'revision_id', v_row.id,
      'revision', v_next_rev,
      'month', p_month,
      'category', p_category
    )
  );

  return jsonb_build_object(
    'id', v_row.id,
    'workspace_id', v_row.workspace_id,
    'trainer_id', v_row.trainer_id,
    'month', v_row.month,
    'category', v_row.category,
    'revision', v_row.revision,
    'positive_count', v_row.positive_count,
    'negative_count', v_row.negative_count,
    'positive_weight', to_char(v_row.positive_weight, 'FM999999990.00'),
    'negative_weight', to_char(v_row.negative_weight, 'FM999999990.00'),
    'net_points', to_char(v_row.net_points, 'FM999999990.00'),
    'idempotency_key', v_row.idempotency_key,
    'created_at', v_row.created_at,
    'created_by', v_row.created_by
  );
end $$;


-- 6. RPC: public.set_trainer_quality_settings
create or replace function public.set_trainer_quality_settings(
  p_workspace_id uuid,
  p_trainer_id uuid,
  p_category text,
  p_positive_weight numeric,
  p_negative_weight numeric,
  p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v_pos_weight numeric(10,2);
  v_neg_weight numeric(10,2);
  v_key text;
  v_existing record;
  v_current_rev integer;
  v_next_rev integer;
  v_row record;
begin
  if actor is null or not app_private.is_platform_owner() or not app_private.has_workspace_access(p_workspace_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if p_category is null or p_category not in ('transformation', 'feedback') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;

  if p_positive_weight is null or scale(p_positive_weight) > 2 then
    raise exception 'invalid_positive_weight' using errcode = '22023';
  end if;

  if p_negative_weight is null or scale(p_negative_weight) > 2 then
    raise exception 'invalid_negative_weight' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.staff_profiles sp
    where sp.user_id = p_trainer_id and sp.role = 'trainer'
  ) then
    raise exception 'trainer_not_found' using errcode = '22023';
  end if;

  v_pos_weight := round(p_positive_weight, 2);
  v_neg_weight := round(p_negative_weight, 2);
  v_key := coalesce(p_idempotency_key, gen_random_uuid()::text);

  -- 1. Idempotency check
  select * into v_existing
  from public.p7_trainer_quality_settings
  where workspace_id = p_workspace_id and idempotency_key = v_key;

  if v_existing.id is not null then
    if v_existing.trainer_id = p_trainer_id
      and v_existing.category = p_category
      and v_existing.positive_weight = v_pos_weight
      and v_existing.negative_weight = v_neg_weight then
      return jsonb_build_object(
        'id', v_existing.id,
        'workspace_id', v_existing.workspace_id,
        'trainer_id', v_existing.trainer_id,
        'category', v_existing.category,
        'revision', v_existing.revision,
        'positive_weight', to_char(v_existing.positive_weight, 'FM999999990.00'),
        'negative_weight', to_char(v_existing.negative_weight, 'FM999999990.00'),
        'idempotency_key', v_existing.idempotency_key,
        'created_at', v_existing.created_at,
        'created_by', v_existing.created_by
      );
    else
      raise exception 'idempotency_conflict: arguments diverged for key %', v_key using errcode = '23505';
    end if;
  end if;

  -- 2. Advisory transactional lock on (workspace, trainer, category)
  perform pg_catalog.pg_advisory_xact_lock(
    hashtext('p7_settings'),
    hashtext(format('%s:%s:%s', p_workspace_id, p_trainer_id, p_category))
  );

  select coalesce(max(revision), 0) into v_current_rev
  from public.p7_trainer_quality_settings
  where workspace_id = p_workspace_id
    and trainer_id = p_trainer_id
    and category = p_category;

  v_next_rev := v_current_rev + 1;

  insert into public.p7_trainer_quality_settings (
    workspace_id, trainer_id, category, revision,
    positive_weight, negative_weight, idempotency_key, created_by
  ) values (
    p_workspace_id, p_trainer_id, p_category, v_next_rev,
    v_pos_weight, v_neg_weight, v_key, actor
  ) returning * into v_row;

  -- 3. Audit event with opaque details ONLY (FR-020, S70-R105)
  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    actor,
    'quality.settings_revision_recorded',
    'p7_trainer_quality_settings',
    v_row.id,
    p_workspace_id,
    jsonb_build_object(
      'settings_id', v_row.id,
      'trainer_id', p_trainer_id,
      'category', p_category,
      'revision', v_next_rev
    )
  );

  return jsonb_build_object(
    'id', v_row.id,
    'workspace_id', v_row.workspace_id,
    'trainer_id', v_row.trainer_id,
    'category', v_row.category,
    'revision', v_row.revision,
    'positive_weight', to_char(v_row.positive_weight, 'FM999999990.00'),
    'negative_weight', to_char(v_row.negative_weight, 'FM999999990.00'),
    'idempotency_key', v_row.idempotency_key,
    'created_at', v_row.created_at,
    'created_by', v_row.created_by
  );
end $$;


-- 7. RPC: public.get_trainer_quality_settings
create or replace function public.get_trainer_quality_settings(
  p_workspace_id uuid,
  p_trainer_id uuid default null
) returns table (
  id uuid,
  workspace_id uuid,
  trainer_id uuid,
  category text,
  revision integer,
  positive_weight text,
  negative_weight text,
  created_at timestamptz,
  created_by uuid
) language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not app_private.is_platform_owner() or not app_private.has_workspace_access(p_workspace_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  return query
  select distinct on (s.trainer_id, s.category)
    s.id,
    s.workspace_id,
    s.trainer_id,
    s.category,
    s.revision,
    to_char(s.positive_weight, 'FM999999990.00'),
    to_char(s.negative_weight, 'FM999999990.00'),
    s.created_at,
    s.created_by
  from public.p7_trainer_quality_settings s
  where s.workspace_id = p_workspace_id
    and (p_trainer_id is null or s.trainer_id = p_trainer_id)
  order by s.trainer_id, s.category, s.revision desc;
end $$;


-- 8. RPC: public.get_monthly_quality_revisions
create or replace function public.get_monthly_quality_revisions(
  p_workspace_id uuid,
  p_month text,
  p_trainer_id uuid default null,
  p_category text default null
) returns table (
  id uuid,
  workspace_id uuid,
  trainer_id uuid,
  month text,
  category text,
  revision integer,
  positive_count integer,
  negative_count integer,
  positive_weight text,
  negative_weight text,
  net_points text,
  idempotency_key text,
  created_at timestamptz,
  created_by uuid
) language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not app_private.is_platform_owner() or not app_private.has_workspace_access(p_workspace_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.workspace_id,
    r.trainer_id,
    r.month,
    r.category,
    r.revision,
    r.positive_count,
    r.negative_count,
    to_char(r.positive_weight, 'FM999999990.00'),
    to_char(r.negative_weight, 'FM999999990.00'),
    to_char(r.net_points, 'FM999999990.00'),
    r.idempotency_key,
    r.created_at,
    r.created_by
  from public.p7_monthly_quality_revisions r
  where r.workspace_id = p_workspace_id
    and r.month = p_month
    and (p_trainer_id is null or r.trainer_id = p_trainer_id)
    and (p_category is null or r.category = p_category)
  order by r.trainer_id, r.category, r.revision;
end $$;


-- 9. RPC: public.get_monthly_quality_effective
create or replace function public.get_monthly_quality_effective(
  p_workspace_id uuid,
  p_month text,
  p_trainer_id uuid default null,
  p_category text default null
) returns table (
  id uuid,
  workspace_id uuid,
  trainer_id uuid,
  month text,
  category text,
  revision integer,
  positive_count integer,
  negative_count integer,
  positive_weight text,
  negative_weight text,
  net_points text,
  idempotency_key text,
  created_at timestamptz,
  created_by uuid
) language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not app_private.is_platform_owner() or not app_private.has_workspace_access(p_workspace_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.workspace_id,
    e.trainer_id,
    e.month,
    e.category,
    e.revision,
    e.positive_count,
    e.negative_count,
    to_char(e.positive_weight, 'FM999999990.00'),
    to_char(e.negative_weight, 'FM999999990.00'),
    to_char(e.net_points, 'FM999999990.00'),
    e.idempotency_key,
    e.created_at,
    e.created_by
  from public.p7_monthly_quality_effective e
  where e.workspace_id = p_workspace_id
    and e.month = p_month
    and (p_trainer_id is null or e.trainer_id = p_trainer_id)
    and (p_category is null or e.category = p_category)
  order by e.trainer_id, e.category;
end $$;


-- 10. Private functions: Monthly PO Reminder Outbox & Scheduler Gate
create or replace function app_private.enqueue_monthly_reminder(
  p_workspace_id uuid,
  p_month text,
  p_run_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_dedup_key text;
  v_outbox_id uuid;
  v_job_id uuid;
begin
  if p_workspace_id is null or p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid_reminder_params' using errcode = '22023';
  end if;

  v_dedup_key := format('p7-reminder:%s:%s', p_workspace_id, p_month);

  -- 1. Check if reminder already enqueued for this workspace and month
  select id into v_outbox_id
  from public.p7_monthly_reminder_outbox
  where workspace_id = p_workspace_id and month = p_month;

  if v_outbox_id is not null then
    return v_outbox_id;
  end if;

  -- 2. Enqueue job into existing outbox (public.jobs) via app_private.enqueue_job
  -- Payload contains NO sensitive P7 details! (FR-009, FR-020)
  v_job_id := app_private.enqueue_job(
    'quality.monthly_reminder',
    p_workspace_id,
    jsonb_build_object(
      'workspace_id', p_workspace_id,
      'month', p_month,
      'placeholder_copy_key', 'p7.monthly_reminder.placeholder'
    ),
    v_dedup_key,
    coalesce(p_run_at, clock_timestamp()),
    5
  );

  -- 3. Insert into p7_monthly_reminder_outbox
  insert into public.p7_monthly_reminder_outbox (
    workspace_id, month, notification_kind, dedup_key, job_id, status, placeholder_copy_key
  ) values (
    p_workspace_id, p_month, 'monthly_quality_reminder', v_dedup_key, v_job_id, 'enqueued', 'p7.monthly_reminder.placeholder'
  )
  on conflict (workspace_id, month) do nothing
  returning id into v_outbox_id;

  if v_outbox_id is null then
    select id into v_outbox_id
    from public.p7_monthly_reminder_outbox
    where workspace_id = p_workspace_id and month = p_month;
    return v_outbox_id;
  end if;

  -- 4. Audit event with opaque reference only (FR-020)
  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    auth.uid(),
    'quality.reminder_enqueued',
    'p7_monthly_reminder_outbox',
    v_outbox_id,
    p_workspace_id,
    jsonb_build_object(
      'workspace_id', p_workspace_id,
      'month', p_month,
      'reminder_id', v_outbox_id
    )
  );

  return v_outbox_id;
end $$;

create or replace function app_private.p7_monthly_reminders_run(p_month text default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  target_month text;
  ws record;
  enqueued_count integer := 0;
begin
  if p_month is not null then
    target_month := p_month;
  else
    target_month := to_char(timezone('Africa/Cairo', clock_timestamp()), 'YYYY-MM');
  end if;

  for ws in
    select id from public.workspaces
    where deactivated_at is null
  loop
    perform app_private.enqueue_monthly_reminder(ws.id, target_month);
    enqueued_count := enqueued_count + 1;
  end loop;

  return enqueued_count;
end $$;

-- Scheduler activation gate (pg_cron)
create or replace function app_private.p7_monthly_reminder_schedule_activate()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if current_user <> 'postgres' then
    raise exception 'p7_owner_required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(11027, 1);
  perform app_private.p7_monthly_reminder_schedule_deactivate();
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('lifter-p7-monthly-quality-reminders', '0 7 1 * *',
      'select app_private.p7_monthly_reminders_run();');
  end if;
end $$;

create or replace function app_private.p7_monthly_reminder_schedule_deactivate()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if current_user <> 'postgres' then
    raise exception 'p7_owner_required' using errcode = '42501';
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('lifter-p7-monthly-quality-reminders')
    where exists (
      select 1 from cron.job where jobname = 'lifter-p7-monthly-quality-reminders'
    );
  end if;
end $$;

-- Ownership and grants
alter function app_private.guard_p7_quality_revisions_immutable() owner to postgres;
alter function public.record_monthly_quality(uuid, uuid, text, text, integer, integer, numeric, numeric, text, integer) owner to postgres;
alter function public.set_trainer_quality_settings(uuid, uuid, text, numeric, numeric, text) owner to postgres;
alter function public.get_trainer_quality_settings(uuid, uuid) owner to postgres;
alter function public.get_monthly_quality_revisions(uuid, text, uuid, text) owner to postgres;
alter function public.get_monthly_quality_effective(uuid, text, uuid, text) owner to postgres;
alter function app_private.enqueue_monthly_reminder(uuid, text, timestamptz) owner to postgres;
alter function app_private.p7_monthly_reminders_run(text) owner to postgres;
alter function app_private.p7_monthly_reminder_schedule_activate() owner to postgres;
alter function app_private.p7_monthly_reminder_schedule_deactivate() owner to postgres;

revoke all on function app_private.guard_p7_quality_revisions_immutable() from public, anon, authenticated, service_role;
revoke all on function app_private.enqueue_monthly_reminder(uuid, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function app_private.p7_monthly_reminders_run(text) from public, anon, authenticated, service_role;
revoke all on function app_private.p7_monthly_reminder_schedule_activate() from public, anon, authenticated, service_role;
revoke all on function app_private.p7_monthly_reminder_schedule_deactivate() from public, anon, authenticated, service_role;

revoke all on function public.record_monthly_quality(uuid, uuid, text, text, integer, integer, numeric, numeric, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.set_trainer_quality_settings(uuid, uuid, text, numeric, numeric, text) from public, anon, authenticated, service_role;
revoke all on function public.get_trainer_quality_settings(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_monthly_quality_revisions(uuid, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.get_monthly_quality_effective(uuid, text, uuid, text) from public, anon, authenticated, service_role;

grant execute on function public.record_monthly_quality(uuid, uuid, text, text, integer, integer, numeric, numeric, text, integer) to authenticated;
grant execute on function public.set_trainer_quality_settings(uuid, uuid, text, numeric, numeric, text) to authenticated;
grant execute on function public.get_trainer_quality_settings(uuid, uuid) to authenticated;
grant execute on function public.get_monthly_quality_revisions(uuid, text, uuid, text) to authenticated;
grant execute on function public.get_monthly_quality_effective(uuid, text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
