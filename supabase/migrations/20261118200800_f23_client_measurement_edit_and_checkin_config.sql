-- F23 (spec 023) round 2, PO answers 2026-11-14:
-- 1. T026 "Add + edit own": a client edits their OWN manual measurements in place
--    (optimistic version, background audit). Check-in-extracted rows stay
--    trainer-only (correct_progress_measurement).
-- 2. The client self surface also returns the entry options the client page needs
--    (own ids, the current check-in measurement types, today's Cairo date).
-- 3. A staff read of the weekly check-in configuration for the configuration screen.
-- The spec 024 readers are untouched.

alter table app_private.progress_measurement_corrections
  drop constraint progress_measurement_corrections_change_kind_check;
alter table app_private.progress_measurement_corrections
  add constraint progress_measurement_corrections_change_kind_check
  check (change_kind in ('trainer_correction','checkin_update','client_edit'));

-- Client-only edit of the caller's own manual measurement (FR-012 "edit existing").
create function public.update_own_progress_measurement(
  p_workspace_id uuid, p_measurement_id uuid, p_value numeric, p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); own_client uuid; existing public.progress_measurements%rowtype;
  v_definition jsonb; q jsonb;
begin
  if actor is null or p_workspace_id is null or p_measurement_id is null or p_value is null
    or p_expected_updated_at is null or not isfinite(p_expected_updated_at) then
    return '{"status":"invalid"}'::jsonb;
  end if;
  -- Wall: the caller must be an approved, active client of this workspace with
  -- F13 plan access. Staff, pending clients and foreign-workspace callers fail here.
  select c.id into own_client from public.clients c
  where c.workspace_id = p_workspace_id and c.auth_user_id = actor
    and c.approval_state = 'approved' and c.deactivated_at is null;
  if own_client is null or not app_private.f23_client_progress_visible(p_workspace_id, own_client) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  perform 1 from public.clients c where c.workspace_id = p_workspace_id and c.id = own_client for update;
  -- Another client's row (same or other workspace) is indistinguishable from a missing one.
  select m.* into existing from public.progress_measurements m
  where m.workspace_id = p_workspace_id and m.id = p_measurement_id and m.client_id = own_client
  for update;
  if not found then return '{"status":"not_found"}'::jsonb; end if;
  if existing.source_kind <> 'manual' then
    return '{"status":"not_editable"}'::jsonb;
  end if;
  if existing.updated_at is distinct from p_expected_updated_at then
    return '{"status":"conflict"}'::jsonb;
  end if;
  select v.definition into v_definition
  from app_private.form_assignment_policies p
  join public.form_versions v on v.workspace_id = p.workspace_id and v.form_id = p.form_id
    and v.version_number = p.version_number and v.status = 'published'
  where p.workspace_id = p_workspace_id and p.trigger_kind = 'weekly_checkin';
  q := app_private.f23_measurement_question(v_definition, existing.measurement_type);
  if (q is not null and not app_private.f23_measurement_value_fits(q, p_value))
    or p_value <= -1000000 or p_value >= 1000000 then
    return '{"status":"invalid"}'::jsonb;
  end if;
  if existing.value = p_value then
    return jsonb_build_object('status', 'unchanged', 'updated_at', existing.updated_at);
  end if;
  perform app_private.f23_write_measurement_correction(p_workspace_id, existing, 'client_edit', actor,
    p_value, existing.unit_en, existing.unit_ar);
  update public.progress_measurements m set value = p_value, updated_at = clock_timestamp(), updated_by = actor
  where m.workspace_id = p_workspace_id and m.id = p_measurement_id
  returning m.* into existing;
  return jsonb_build_object('status', 'updated', 'updated_at', existing.updated_at);
end $$;

-- Client self surface: same keys as 20261118200400 plus entry options.
create or replace function public.client_self_progress() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare client_row public.clients%rowtype; matches integer; v_measurements jsonb; v_timeline jsonb;
  v_definition jsonb; v_types jsonb := '[]'::jsonb; visible boolean;
begin
  if auth.uid() is null then return '{"status":"not_found"}'::jsonb; end if;
  select count(*)::integer into matches from public.clients c
  where c.auth_user_id = auth.uid() and c.approval_state = 'approved' and c.deactivated_at is null;
  if matches <> 1 then raise exception 'not_permitted' using errcode = '42501'; end if;
  select c.* into client_row from public.clients c
  where c.auth_user_id = auth.uid() and c.approval_state = 'approved' and c.deactivated_at is null;
  visible := app_private.f23_client_progress_visible(client_row.workspace_id, client_row.id);
  -- FR-016: measurements only while the F13 plan-access rule allows; the timeline stays visible.
  if visible then
    v_measurements := public.list_progress_measurements(client_row.workspace_id, client_row.id);
    select v.definition into v_definition
    from app_private.form_assignment_policies p
    join public.form_versions v on v.workspace_id = p.workspace_id and v.form_id = p.form_id
      and v.version_number = p.version_number and v.status = 'published'
    where p.workspace_id = client_row.workspace_id and p.trigger_kind = 'weekly_checkin';
    -- FR-014: entry types are the current check-in's measurement questions only.
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', q->>'id',
        'label', case when jsonb_typeof(q->'title') = 'object' then q->'title' else q->'label' end,
        'unit_en', app_private.f23_unit_text(q, 'en'),
        'unit_ar', app_private.f23_unit_text(q, 'ar'),
        'min', q->'validation'->'min', 'max', q->'validation'->'max', 'step', q->'validation'->'step')
        order by x.ordinality), '[]'::jsonb)
      into v_types
    from jsonb_array_elements(
      case when jsonb_typeof(v_definition->'questions') = 'array' then v_definition->'questions' else '[]'::jsonb end
    ) with ordinality x(q, ordinality)
    where app_private.f23_measurement_question(v_definition, q->>'id') is not null
      and q->>'id' ~ '^[A-Za-z0-9_.-]{1,64}$';
  else
    v_measurements := '{"status":"restricted"}'::jsonb;
  end if;
  v_timeline := public.client_progress_timeline(client_row.workspace_id, client_row.id);
  return jsonb_build_object('status', 'ok',
    'measurements_status', v_measurements->>'status',
    'measurements', coalesce(v_measurements->'measurements', '[]'::jsonb),
    'timeline', coalesce(v_timeline->'events', '[]'::jsonb),
    'workspace_id', client_row.workspace_id,
    'client_id', client_row.id,
    'today', (clock_timestamp() at time zone 'Africa/Cairo')::date,
    'entry_types', v_types);
end $$;

-- Staff read for the weekly check-in configuration screen (same wall as
-- configure_weekly_checkin_form). Lists each form's latest published version under
-- the current terms, and whether it carries the two FR-037 adherence questions.
create function public.weekly_checkin_configuration(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare role public.staff_role; v_current jsonb; v_forms jsonb;
begin
  role := app_private.current_staff_role();
  if auth.uid() is null or role is null or not app_private.role_has_capability(role, 'assign_intake_form')
    or p_workspace_id is null or not app_private.has_workspace_access(p_workspace_id, 'assign_intake_form') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select jsonb_build_object('form_id', p.form_id, 'version_number', p.version_number) into v_current
  from app_private.form_assignment_policies p
  where p.workspace_id = p_workspace_id and p.trigger_kind = 'weekly_checkin';
  select coalesce(jsonb_agg(jsonb_build_object(
      'form_id', f.id, 'name', f.name,
      'title', case when jsonb_typeof(v.definition->'title') = 'object' then v.definition->'title' end,
      'version_number', v.version_number,
      'valid', app_private.f23_checkin_definition_valid(v.definition))
      order by f.name, f.id), '[]'::jsonb)
    into v_forms
  from public.forms f
  join lateral (
    select x.* from public.form_versions x
    where x.workspace_id = f.workspace_id and x.form_id = f.id
    order by x.version_number desc limit 1
  ) latest on true
  join public.form_versions v on v.workspace_id = latest.workspace_id and v.form_id = latest.form_id
    and v.version_number = (
      select max(y.version_number) from public.form_versions y
      where y.workspace_id = f.workspace_id and y.form_id = f.id and y.status = 'published')
  where f.workspace_id = p_workspace_id and latest.status <> 'retired'
    and app_private.f15_current_terms_policy(v.terms_policy_version)
    and not exists (select 1 from app_private.form_assignment_policies p
      where p.workspace_id = f.workspace_id and p.form_id = f.id and p.trigger_kind <> 'weekly_checkin');
  return jsonb_build_object('status', 'ok', 'current', v_current, 'forms', v_forms);
end $$;

alter function public.update_own_progress_measurement(uuid, uuid, numeric, timestamptz) owner to postgres;
alter function public.client_self_progress() owner to postgres;
alter function public.weekly_checkin_configuration(uuid) owner to postgres;
revoke all on function public.update_own_progress_measurement(uuid, uuid, numeric, timestamptz),
  public.client_self_progress(), public.weekly_checkin_configuration(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.update_own_progress_measurement(uuid, uuid, numeric, timestamptz),
  public.client_self_progress(), public.weekly_checkin_configuration(uuid) to authenticated;
