-- F23 review fix (024 agent finding on PR #109): remove the database-owner bypass
-- (session_user = 'postgres') from the three spec 024 readers. No job calls them today,
-- and the bypass made every postgres-connected test session pass the wall. The only path
-- is now app_private.has_workspace_access(p_workspace_id, 'coaching_work'): a platform
-- owner, workspace owner or trainer with an active membership. A future job that needs
-- these values must get its own owner-only wrapper and its own review.
-- Signatures, columns, audit events and grants (authenticated only) are unchanged.

create or replace function public.progress_weekly_adherence(p_workspace_id uuid, p_from date, p_to date)
returns table (
  client_id uuid,
  assignment_id uuid,
  checkin_date date,
  submitted_at timestamptz,
  "workoutAdherence" smallint,
  "dietAdherence" smallint
) language plpgsql volatile security definer set search_path = '' as $$
declare returned integer;
begin
  if not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
    or p_to < p_from or p_to - p_from > 400 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return query
  select x.client_id, x.assignment_id, x.checkin_date, x.submitted_at, x.workout_adherence, x.diet_adherence
  from app_private.progress_checkin_adherence x
  where x.workspace_id = p_workspace_id and x.checkin_date between p_from and p_to
  order by x.client_id, x.checkin_date, x.assignment_id;
  get diagnostics returned = row_count;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), 'progress.adherence_read', 'workspaces', p_workspace_id, p_workspace_id,
    jsonb_build_object('from', p_from, 'to', p_to, 'rows', returned));
end $$;

create or replace function public.progress_measurement_history(p_workspace_id uuid, p_from date, p_to date)
returns table (
  client_id uuid, measurement_id uuid, measurement_type text, value numeric,
  unit_en text, unit_ar text, recorded_on date, source_kind text, source_assignment_id uuid
) language plpgsql volatile security definer set search_path = '' as $$
declare returned integer;
begin
  if not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
    or p_to < p_from or p_to - p_from > 3660 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return query
  select m.client_id, m.id, m.measurement_type, m.value, m.unit_en, m.unit_ar, m.recorded_on,
    m.source_kind, m.source_assignment_id
  from public.progress_measurements m
  where m.workspace_id = p_workspace_id and m.recorded_on between p_from and p_to
  order by m.client_id, m.measurement_type, m.recorded_on, m.id;
  get diagnostics returned = row_count;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), 'progress.measurement_history_read', 'workspaces', p_workspace_id, p_workspace_id,
    jsonb_build_object('from', p_from, 'to', p_to, 'rows', returned));
end $$;

create or replace function public.progress_measurement_baselines(p_workspace_id uuid, p_as_of date)
returns table (
  client_id uuid, measurement_type text,
  baseline_value numeric, baseline_unit_en text, baseline_unit_ar text, baseline_recorded_on date,
  latest_value numeric, latest_unit_en text, latest_unit_ar text, latest_recorded_on date,
  measurement_count integer
) language plpgsql volatile security definer set search_path = '' as $$
declare returned integer;
begin
  if not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_as_of is null or not isfinite(p_as_of) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return query
  with scoped as (
    select m.* from public.progress_measurements m
    where m.workspace_id = p_workspace_id and m.recorded_on <= p_as_of
  ), firsts as (
    select distinct on (x.client_id, x.measurement_type) x.client_id, x.measurement_type, x.value,
      x.unit_en, x.unit_ar, x.recorded_on
    from scoped x order by x.client_id, x.measurement_type, x.recorded_on asc, x.id
  ), lasts as (
    select distinct on (x.client_id, x.measurement_type) x.client_id, x.measurement_type, x.value,
      x.unit_en, x.unit_ar, x.recorded_on
    from scoped x order by x.client_id, x.measurement_type, x.recorded_on desc, x.id
  ), counts as (
    select x.client_id, x.measurement_type, count(*)::integer as n from scoped x
    group by x.client_id, x.measurement_type
  )
  select f.client_id, f.measurement_type, f.value, f.unit_en, f.unit_ar, f.recorded_on,
    l.value, l.unit_en, l.unit_ar, l.recorded_on, c.n
  from firsts f
  join lasts l on l.client_id = f.client_id and l.measurement_type = f.measurement_type
  join counts c on c.client_id = f.client_id and c.measurement_type = f.measurement_type
  order by f.client_id, f.measurement_type;
  get diagnostics returned = row_count;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), 'progress.measurement_baselines_read', 'workspaces', p_workspace_id, p_workspace_id,
    jsonb_build_object('as_of', p_as_of, 'rows', returned));
end $$;

alter function public.progress_weekly_adherence(uuid, date, date) owner to postgres;
alter function public.progress_measurement_history(uuid, date, date) owner to postgres;
alter function public.progress_measurement_baselines(uuid, date) owner to postgres;
revoke all on function public.progress_weekly_adherence(uuid, date, date),
  public.progress_measurement_history(uuid, date, date), public.progress_measurement_baselines(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.progress_weekly_adherence(uuid, date, date),
  public.progress_measurement_history(uuid, date, date), public.progress_measurement_baselines(uuid, date)
  to authenticated;
