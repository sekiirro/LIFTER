-- F23 (spec 023) US2: dedicated Progress measurement store (FR-010..FR-016),
-- background correction audit (FR-013), and the spec 024 baseline/history contract.
-- Measurement types/units come from the F15 weekly check-in question snapshot (FR-014):
-- a numeric (number/slider) question that carries a unit; type = F15 question id.

create table public.progress_measurements (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  measurement_type text not null check (measurement_type ~ '^[A-Za-z0-9_.-]{1,64}$'),
  value numeric not null check (value > -1000000 and value < 1000000),
  unit_en text check (unit_en is null or char_length(unit_en) between 1 and 40),
  unit_ar text check (unit_ar is null or char_length(unit_ar) between 1 and 40),
  recorded_on date not null check (isfinite(recorded_on)),
  source_kind text not null check (source_kind in ('checkin','manual')),
  source_assignment_id uuid,
  source_form_id uuid,
  source_version_number integer,
  entered_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references auth.users(id) on delete restrict,
  primary key (workspace_id, id),
  unique (id),
  -- FR-012/FR-015/SC-005: one record per client/type/day.
  unique (workspace_id, client_id, measurement_type, recorded_on),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete restrict,
  foreign key (workspace_id, source_assignment_id) references public.form_assignments(workspace_id, id) on delete restrict,
  check ((source_kind = 'checkin') = (source_assignment_id is not null)),
  check ((source_assignment_id is null) = (source_form_id is null)
    and (source_assignment_id is null) = (source_version_number is null))
);
create index progress_measurements_client_idx
  on public.progress_measurements(workspace_id, client_id, recorded_on desc, measurement_type);

-- MeasurementCorrection: background audit only; no user-facing read surface (FR-013).
create table app_private.progress_measurement_corrections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  measurement_id uuid not null,
  change_kind text not null check (change_kind in ('trainer_correction','checkin_update')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  previous_value numeric not null,
  new_value numeric not null,
  previous_unit_en text, previous_unit_ar text, new_unit_en text, new_unit_ar text,
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id, measurement_id) references public.progress_measurements(workspace_id, id) on delete restrict
);
create index progress_measurement_corrections_measurement_idx
  on app_private.progress_measurement_corrections(workspace_id, measurement_id, recorded_at);
create trigger f23_correction_no_update before update on app_private.progress_measurement_corrections
  for each row execute function app_private.audit_events_immutable();
create trigger f23_correction_no_delete before delete on app_private.progress_measurement_corrections
  for each row execute function app_private.forbid_delete();
create trigger f23_correction_no_truncate before truncate on app_private.progress_measurement_corrections
  for each statement execute function app_private.forbid_delete();

alter table public.progress_measurements enable row level security;
alter table public.progress_measurements force row level security;
alter table app_private.progress_measurement_corrections enable row level security;
alter table app_private.progress_measurement_corrections force row level security;
revoke all on public.progress_measurements from public, anon, authenticated, service_role;
revoke all on app_private.progress_measurement_corrections from public, anon, authenticated, service_role;

-- FR-016: the client sees own measurements while an F13 entitlement is active or frozen
-- (the same plan-access rule used by F19 client_plan_projection).
create function app_private.f23_client_progress_visible(p_workspace_id uuid, p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.client_has_access(p_workspace_id, p_client_id) and exists (
    select 1 from public.subscriptions s
    cross join lateral app_private.f13_project_entitlement(s.workspace_id, s.id,
      (statement_timestamp() at time zone 'Africa/Cairo')::date) as e(value)
    where s.workspace_id = p_workspace_id and s.client_id = p_client_id
      and e.value->>'status' in ('active','frozen'))
$$;

create policy progress_measurements_staff_read on public.progress_measurements for select to authenticated
  using (app_private.has_workspace_access(workspace_id, 'coaching_work'));
create policy progress_measurements_client_read on public.progress_measurements for select to authenticated
  using (app_private.f23_client_progress_visible(workspace_id, client_id));
grant select on public.progress_measurements to authenticated;

-- Measurement question lookup in an F15 snapshot: numeric question with a unit, excluding adherence.
create function app_private.f23_measurement_question(p_definition jsonb, p_question_id text)
returns jsonb language sql immutable security definer set search_path = '' as $$
  select q from jsonb_array_elements(
    case when jsonb_typeof(p_definition->'questions') = 'array' then p_definition->'questions' else '[]'::jsonb end
  ) q
  where q->>'id' = p_question_id
    and q->>'id' not in ('workoutAdherence','dietAdherence')
    and q->>'type' in ('number','slider')
    and jsonb_typeof(q->'unit') = 'object'
  limit 1
$$;

create function app_private.f23_measurement_value_fits(p_question jsonb, p_value numeric)
returns boolean language sql immutable security definer set search_path = '' as $$
  select p_question is not null and p_value is not null
    and p_value > -1000000 and p_value < 1000000
    and (jsonb_typeof(p_question->'validation'->'min') is distinct from 'number'
      or p_value >= (p_question->'validation'->>'min')::numeric)
    and (jsonb_typeof(p_question->'validation'->'max') is distinct from 'number'
      or p_value <= (p_question->'validation'->>'max')::numeric)
$$;

create function app_private.f23_unit_text(p_question jsonb, p_locale text)
returns text language sql immutable security definer set search_path = '' as $$
  select nullif(left(p_question->'unit'->>p_locale, 40), '')
$$;

-- Spec 024 contract: full measurement history for a workspace window (values only, no labels).
create function public.progress_measurement_history(p_workspace_id uuid, p_from date, p_to date)
returns table (
  client_id uuid, measurement_id uuid, measurement_type text, value numeric,
  unit_en text, unit_ar text, recorded_on date, source_kind text, source_assignment_id uuid
) language plpgsql volatile security definer set search_path = '' as $$
declare returned integer;
begin
  if not (session_user = 'postgres' or current_setting('role', true) = 'service_role'
    or app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
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
  -- Constitution VII / F15 audited reads: one ids-and-counts-only event per call.
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), 'progress.measurement_history_read', 'workspaces', p_workspace_id, p_workspace_id,
    jsonb_build_object('from', p_from, 'to', p_to, 'rows', returned));
end $$;

-- Spec 024 contract: per client/type the first-ever (baseline) and latest value as of a date.
create function public.progress_measurement_baselines(p_workspace_id uuid, p_as_of date)
returns table (
  client_id uuid, measurement_type text,
  baseline_value numeric, baseline_unit_en text, baseline_unit_ar text, baseline_recorded_on date,
  latest_value numeric, latest_unit_en text, latest_unit_ar text, latest_recorded_on date,
  measurement_count integer
) language plpgsql volatile security definer set search_path = '' as $$
declare returned integer;
begin
  if not (session_user = 'postgres' or current_setting('role', true) = 'service_role'
    or app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
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
  -- Constitution VII / F15 audited reads: one ids-and-counts-only event per call.
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), 'progress.measurement_baselines_read', 'workspaces', p_workspace_id, p_workspace_id,
    jsonb_build_object('as_of', p_as_of, 'rows', returned));
end $$;

alter table public.progress_measurements owner to postgres;
alter table app_private.progress_measurement_corrections owner to postgres;
alter function app_private.f23_client_progress_visible(uuid, uuid) owner to postgres;
alter function app_private.f23_measurement_question(jsonb, text) owner to postgres;
alter function app_private.f23_measurement_value_fits(jsonb, numeric) owner to postgres;
alter function app_private.f23_unit_text(jsonb, text) owner to postgres;
alter function public.progress_measurement_history(uuid, date, date) owner to postgres;
alter function public.progress_measurement_baselines(uuid, date) owner to postgres;
revoke all on function app_private.f23_client_progress_visible(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function app_private.f23_client_progress_visible(uuid, uuid) to authenticated;
revoke all on function app_private.f23_measurement_question(jsonb, text), app_private.f23_measurement_value_fits(jsonb, numeric),
  app_private.f23_unit_text(jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.progress_measurement_history(uuid, date, date), public.progress_measurement_baselines(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.progress_measurement_history(uuid, date, date), public.progress_measurement_baselines(uuid, date)
  to authenticated, service_role;
comment on table public.progress_measurements is
  'Spec 023 Progress measurement store; types/units derived from F15 weekly check-in question snapshots.';
comment on function public.progress_measurement_baselines(uuid, date) is
  'Spec 023 -> 024 read-only contract: baseline (first) and latest measurement per client/type as of a date.';
