-- F23 review fixes (PR #109 CI):
-- 1. F15 privacy wall: no public RPC other than read_form_answer may read raw F15 answers.
--    The two FR-037 adherence values are captured into a dedicated private store when a
--    weekly check-in is submitted (and refreshed by later F15 answer revisions/corrections);
--    the spec 024 contract reads that store instead of form_answer_revisions.
-- 2. The spec 024 readers are no longer granted to service_role (jobs run as the database
--    owner), so no new service_role -> app_private call path exists.

create table app_private.progress_checkin_adherence (
  workspace_id uuid not null,
  assignment_id uuid not null,
  client_id uuid not null,
  checkin_date date not null check (isfinite(checkin_date)),
  submitted_at timestamptz not null,
  revision integer not null check (revision > 0),
  workout_adherence smallint check (workout_adherence between 0 and 10),
  diet_adherence smallint check (diet_adherence between 0 and 10),
  primary key (workspace_id, assignment_id),
  foreign key (workspace_id, assignment_id) references app_private.form_submissions(workspace_id, assignment_id) on delete cascade,
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete restrict
);
create index progress_checkin_adherence_window_idx
  on app_private.progress_checkin_adherence(workspace_id, checkin_date, client_id);
alter table app_private.progress_checkin_adherence enable row level security;
alter table app_private.progress_checkin_adherence force row level security;
revoke all on app_private.progress_checkin_adherence from public, anon, authenticated, service_role;

-- Upserts the values for one weekly check-in submission from a given answer revision.
create function app_private.f23_store_checkin_adherence(p_workspace_id uuid, p_assignment_id uuid, p_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare assignment public.form_assignments%rowtype; submission app_private.form_submissions%rowtype; answers jsonb;
begin
  select a.* into assignment from public.form_assignments a
  join app_private.form_assignment_policies p on p.workspace_id = a.workspace_id and p.id = a.policy_id
  where a.workspace_id = p_workspace_id and a.id = p_assignment_id and p.trigger_kind = 'weekly_checkin'
    and a.occurrence_key ~ '^weekly_checkin:[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  if not found then return; end if;
  select s.* into submission from app_private.form_submissions s
  where s.workspace_id = p_workspace_id and s.assignment_id = p_assignment_id;
  if not found or p_revision < submission.revision then return; end if;
  select r.answer_values into answers from public.form_answer_revisions r
  where r.workspace_id = p_workspace_id and r.assignment_id = p_assignment_id and r.revision = p_revision;
  if answers is null then return; end if;
  insert into app_private.progress_checkin_adherence(workspace_id, assignment_id, client_id, checkin_date,
    submitted_at, revision, workout_adherence, diet_adherence)
  values (p_workspace_id, p_assignment_id, assignment.client_id, substring(assignment.occurrence_key from 16)::date,
    submission.submitted_at, p_revision,
    app_private.f23_adherence_value(answers, 'workoutAdherence'), app_private.f23_adherence_value(answers, 'dietAdherence'))
  on conflict (workspace_id, assignment_id) do update set revision = excluded.revision,
    workout_adherence = excluded.workout_adherence, diet_adherence = excluded.diet_adherence
  where app_private.progress_checkin_adherence.revision <= excluded.revision;
end $$;

create function app_private.f23_capture_checkin_adherence() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.f23_store_checkin_adherence(new.workspace_id, new.assignment_id, new.revision);
  return null;
end $$;

create trigger f23_capture_checkin_adherence after insert on app_private.form_submissions
  for each row execute function app_private.f23_capture_checkin_adherence();
-- Later F15 answer revisions (corrections) refresh the stored values; before submission it is a no-op.
create trigger f23_refresh_checkin_adherence after insert on public.form_answer_revisions
  for each row execute function app_private.f23_capture_checkin_adherence();

-- Backfill any weekly check-ins submitted before this migration (latest revision wins).
insert into app_private.progress_checkin_adherence(workspace_id, assignment_id, client_id, checkin_date,
  submitted_at, revision, workout_adherence, diet_adherence)
select a.workspace_id, a.id, a.client_id, substring(a.occurrence_key from 16)::date, s.submitted_at, r.revision,
  app_private.f23_adherence_value(r.answer_values, 'workoutAdherence'),
  app_private.f23_adherence_value(r.answer_values, 'dietAdherence')
from public.form_assignments a
join app_private.form_assignment_policies p on p.workspace_id = a.workspace_id and p.id = a.policy_id and p.trigger_kind = 'weekly_checkin'
join app_private.form_submissions s on s.workspace_id = a.workspace_id and s.assignment_id = a.id
join lateral (
  select x.revision, x.answer_values from public.form_answer_revisions x
  where x.workspace_id = a.workspace_id and x.assignment_id = a.id and x.revision >= s.revision
  order by x.revision desc limit 1
) r on true
where a.occurrence_key ~ '^weekly_checkin:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
on conflict (workspace_id, assignment_id) do nothing;

-- Same signature and columns as before; reads only the dedicated adherence store.
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
  if not (session_user = 'postgres' or app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
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
  if not (session_user = 'postgres' or app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
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
  if not (session_user = 'postgres' or app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
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

alter table app_private.progress_checkin_adherence owner to postgres;
alter function app_private.f23_store_checkin_adherence(uuid, uuid, integer) owner to postgres;
alter function app_private.f23_capture_checkin_adherence() owner to postgres;
alter function public.progress_weekly_adherence(uuid, date, date) owner to postgres;
alter function public.progress_measurement_history(uuid, date, date) owner to postgres;
alter function public.progress_measurement_baselines(uuid, date) owner to postgres;
revoke all on function app_private.f23_store_checkin_adherence(uuid, uuid, integer),
  app_private.f23_capture_checkin_adherence() from public, anon, authenticated, service_role;
revoke all on function public.progress_weekly_adherence(uuid, date, date),
  public.progress_measurement_history(uuid, date, date), public.progress_measurement_baselines(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.progress_weekly_adherence(uuid, date, date),
  public.progress_measurement_history(uuid, date, date), public.progress_measurement_baselines(uuid, date)
  to authenticated;
