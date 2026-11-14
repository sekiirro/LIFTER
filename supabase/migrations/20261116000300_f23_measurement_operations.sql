-- F23 (spec 023) US2: auto-extraction from weekly check-in submissions (FR-010/011/014),
-- client manual entry with same-day duplicate rejection (FR-012/015), trainer correction
-- with background audit only (FR-013), and the measurement read surface (FR-016).

create function app_private.f23_write_measurement_correction(
  p_workspace_id uuid, p_measurement public.progress_measurements, p_change_kind text, p_actor uuid,
  p_new_value numeric, p_new_unit_en text, p_new_unit_ar text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare correction_id uuid;
begin
  insert into app_private.progress_measurement_corrections(workspace_id, measurement_id, change_kind, actor_user_id,
    previous_value, new_value, previous_unit_en, previous_unit_ar, new_unit_en, new_unit_ar)
  values (p_workspace_id, p_measurement.id, p_change_kind, p_actor, p_measurement.value, p_new_value,
    p_measurement.unit_en, p_measurement.unit_ar, p_new_unit_en, p_new_unit_ar)
  returning id into correction_id;
  -- Audit rows carry ids/codes only; values stay in the private correction table.
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (p_actor, 'progress.measurement_corrected', 'progress_measurements', p_measurement.id, p_workspace_id,
    jsonb_build_object('correction_id', correction_id, 'change_kind', p_change_kind));
  return correction_id;
end $$;

-- AFTER INSERT on F15 form_submissions: map numeric questions with a unit to measurements.
create function app_private.f23_extract_checkin_measurements() returns trigger
language plpgsql security definer set search_path = '' as $$
declare assignment public.form_assignments%rowtype; answers jsonb; q jsonb; recorded date;
  existing public.progress_measurements%rowtype; v_value numeric; v_unit_en text; v_unit_ar text; actor uuid;
begin
  select a.* into assignment from public.form_assignments a
  join app_private.form_assignment_policies p on p.workspace_id = a.workspace_id and p.id = a.policy_id
  where a.workspace_id = new.workspace_id and a.id = new.assignment_id and p.trigger_kind = 'weekly_checkin';
  if not found then return null; end if;
  select r.answer_values into answers from public.form_answer_revisions r
  where r.workspace_id = new.workspace_id and r.assignment_id = new.assignment_id and r.revision = new.revision;
  if answers is null then return null; end if;
  select c.auth_user_id into actor from public.clients c
  where c.workspace_id = assignment.workspace_id and c.id = assignment.client_id;
  actor := coalesce(auth.uid(), actor, assignment.configured_by);
  recorded := (new.submitted_at at time zone 'Africa/Cairo')::date;
  for q in
    select x from jsonb_array_elements(
      case when jsonb_typeof(assignment.version_snapshot->'questions') = 'array'
        then assignment.version_snapshot->'questions' else '[]'::jsonb end) x
    where app_private.f23_measurement_question(assignment.version_snapshot, x->>'id') is not null
      and x->>'id' ~ '^[A-Za-z0-9_.-]{1,64}$'
      and jsonb_typeof(answers->(x->>'id')) = 'number'
  loop
    v_value := (answers->>(q->>'id'))::numeric;
    if not app_private.f23_measurement_value_fits(q, v_value) then continue; end if;
    v_unit_en := app_private.f23_unit_text(q, 'en');
    v_unit_ar := app_private.f23_unit_text(q, 'ar');
    select m.* into existing from public.progress_measurements m
    where m.workspace_id = assignment.workspace_id and m.client_id = assignment.client_id
      and m.measurement_type = q->>'id' and m.recorded_on = recorded
    for update;
    if not found then
      insert into public.progress_measurements(workspace_id, client_id, measurement_type, value, unit_en, unit_ar,
        recorded_on, source_kind, source_assignment_id, source_form_id, source_version_number, entered_by, updated_by)
      values (assignment.workspace_id, assignment.client_id, q->>'id', v_value, v_unit_en, v_unit_ar, recorded,
        'checkin', assignment.id, assignment.form_id, assignment.version_number, actor, actor);
    elsif existing.value is distinct from v_value or existing.unit_en is distinct from v_unit_en
      or existing.unit_ar is distinct from v_unit_ar then
      -- FR-012: same-day conflict updates in place; background audit only.
      perform app_private.f23_write_measurement_correction(assignment.workspace_id, existing, 'checkin_update', actor,
        v_value, v_unit_en, v_unit_ar);
      update public.progress_measurements m set value = v_value, unit_en = v_unit_en, unit_ar = v_unit_ar,
        source_kind = 'checkin', source_assignment_id = assignment.id, source_form_id = assignment.form_id,
        source_version_number = assignment.version_number, updated_at = clock_timestamp(), updated_by = actor
      where m.workspace_id = existing.workspace_id and m.id = existing.id;
    end if;
  end loop;
  return null;
end $$;

create trigger f23_extract_checkin_measurements after insert on app_private.form_submissions
  for each row execute function app_private.f23_extract_checkin_measurements();

-- Client manual entry (FR-012/FR-015): types/units from the current weekly check-in form only.
create function public.record_progress_measurement(
  p_workspace_id uuid, p_client_id uuid, p_measurement_type text, p_value numeric, p_recorded_on date
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); v_definition jsonb; q jsonb; existing_id uuid; created_id uuid;
begin
  if actor is null or p_workspace_id is null or p_client_id is null or p_measurement_type is null
    or p_value is null or p_recorded_on is null or not isfinite(p_recorded_on) then
    return '{"status":"invalid"}'::jsonb;
  end if;
  if not app_private.f23_client_progress_visible(p_workspace_id, p_client_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  perform 1 from public.clients c where c.workspace_id = p_workspace_id and c.id = p_client_id for update;
  if p_recorded_on > (clock_timestamp() at time zone 'Africa/Cairo')::date then
    return '{"status":"invalid"}'::jsonb;
  end if;
  select v.definition into v_definition
  from app_private.form_assignment_policies p
  join public.form_versions v on v.workspace_id = p.workspace_id and v.form_id = p.form_id
    and v.version_number = p.version_number and v.status = 'published'
  where p.workspace_id = p_workspace_id and p.trigger_kind = 'weekly_checkin';
  q := app_private.f23_measurement_question(v_definition, p_measurement_type);
  if q is null or not app_private.f23_measurement_value_fits(q, p_value) then
    return '{"status":"invalid"}'::jsonb;
  end if;
  select m.id into existing_id from public.progress_measurements m
  where m.workspace_id = p_workspace_id and m.client_id = p_client_id
    and m.measurement_type = p_measurement_type and m.recorded_on = p_recorded_on;
  if existing_id is not null then
    return jsonb_build_object('status', 'duplicate_same_day', 'measurement_id', existing_id);
  end if;
  insert into public.progress_measurements(workspace_id, client_id, measurement_type, value, unit_en, unit_ar,
    recorded_on, source_kind, entered_by, updated_by)
  values (p_workspace_id, p_client_id, p_measurement_type, p_value, app_private.f23_unit_text(q, 'en'),
    app_private.f23_unit_text(q, 'ar'), p_recorded_on, 'manual', actor, actor)
  returning id into created_id;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (actor, 'progress.measurement_recorded', 'progress_measurements', created_id, p_workspace_id,
    jsonb_build_object('client_id', p_client_id, 'source_kind', 'manual'));
  return jsonb_build_object('status', 'recorded', 'measurement_id', created_id);
end $$;

-- Trainer correction (FR-013): any authorized coaching staff; direct in-place update.
create function public.correct_progress_measurement(
  p_workspace_id uuid, p_measurement_id uuid, p_value numeric, p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing public.progress_measurements%rowtype; q jsonb;
begin
  if actor is null or p_workspace_id is null or p_measurement_id is null or p_value is null
    or p_expected_updated_at is null then
    return '{"status":"invalid"}'::jsonb;
  end if;
  if not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select m.* into existing from public.progress_measurements m
  where m.workspace_id = p_workspace_id and m.id = p_measurement_id for update;
  if not found then return '{"status":"not_found"}'::jsonb; end if;
  if not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    return '{"status":"not_found"}'::jsonb;
  end if;
  if existing.updated_at is distinct from p_expected_updated_at then
    return '{"status":"conflict"}'::jsonb;
  end if;
  if existing.source_assignment_id is not null then
    select app_private.f23_measurement_question(a.version_snapshot, existing.measurement_type) into q
    from public.form_assignments a where a.workspace_id = existing.workspace_id and a.id = existing.source_assignment_id;
  end if;
  if (q is not null and not app_private.f23_measurement_value_fits(q, p_value))
    or p_value <= -1000000 or p_value >= 1000000 then
    return '{"status":"invalid"}'::jsonb;
  end if;
  if existing.value = p_value then
    return jsonb_build_object('status', 'unchanged', 'updated_at', existing.updated_at);
  end if;
  perform app_private.f23_write_measurement_correction(p_workspace_id, existing, 'trainer_correction', actor,
    p_value, existing.unit_en, existing.unit_ar);
  update public.progress_measurements m set value = p_value, updated_at = clock_timestamp(), updated_by = actor
  where m.workspace_id = p_workspace_id and m.id = p_measurement_id
  returning m.* into existing;
  return jsonb_build_object('status', 'corrected', 'updated_at', existing.updated_at);
end $$;

-- Read surface for staff (coaching_work) and the client (own, F13 plan-access rule).
create function public.list_progress_measurements(p_workspace_id uuid, p_client_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if auth.uid() is null or p_workspace_id is null or p_client_id is null then
    return '{"status":"not_found"}'::jsonb;
  end if;
  if not (app_private.has_workspace_access(p_workspace_id, 'coaching_work')
      and exists (select 1 from public.clients c where c.workspace_id = p_workspace_id and c.id = p_client_id))
    and not app_private.f23_client_progress_visible(p_workspace_id, p_client_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'measurement_type', m.measurement_type, 'value', m.value,
      'unit_en', m.unit_en, 'unit_ar', m.unit_ar, 'recorded_on', m.recorded_on,
      'source_kind', m.source_kind, 'updated_at', m.updated_at,
      'label', (select q->'label' from jsonb_array_elements(
        case when jsonb_typeof(a.version_snapshot->'questions') = 'array' then a.version_snapshot->'questions' else '[]'::jsonb end) q
        where q->>'id' = m.measurement_type limit 1))
      order by m.recorded_on desc, m.measurement_type, m.id), '[]'::jsonb)
    into v_rows
  from public.progress_measurements m
  left join public.form_assignments a on a.workspace_id = m.workspace_id and a.id = m.source_assignment_id
  where m.workspace_id = p_workspace_id and m.client_id = p_client_id;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), 'progress.measurements_read', 'clients', p_client_id, p_workspace_id, '{}'::jsonb);
  return jsonb_build_object('status', 'ok', 'measurements', v_rows);
end $$;

alter function app_private.f23_write_measurement_correction(uuid, public.progress_measurements, text, uuid, numeric, text, text) owner to postgres;
alter function app_private.f23_extract_checkin_measurements() owner to postgres;
alter function public.record_progress_measurement(uuid, uuid, text, numeric, date) owner to postgres;
alter function public.correct_progress_measurement(uuid, uuid, numeric, timestamptz) owner to postgres;
alter function public.list_progress_measurements(uuid, uuid) owner to postgres;
revoke all on function app_private.f23_write_measurement_correction(uuid, public.progress_measurements, text, uuid, numeric, text, text),
  app_private.f23_extract_checkin_measurements() from public, anon, authenticated, service_role;
revoke all on function public.record_progress_measurement(uuid, uuid, text, numeric, date),
  public.correct_progress_measurement(uuid, uuid, numeric, timestamptz),
  public.list_progress_measurements(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_progress_measurement(uuid, uuid, text, numeric, date),
  public.correct_progress_measurement(uuid, uuid, numeric, timestamptz),
  public.list_progress_measurements(uuid, uuid) to authenticated;
