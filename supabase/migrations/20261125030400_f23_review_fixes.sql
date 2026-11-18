-- F23 (spec 023) review fixes (two independent reviews of PR #109). Forward-only; every function is
-- redefined with create or replace and keeps its signature, walls and grants.
--  A1  record_progress_measurement: a date floor (366 Cairo days back) so an absurd past date cannot
--      become the spec 024 baseline; future dates were already refused.
--  A2  f23_extract_checkin_measurements takes the same clients row lock as record_progress_measurement
--      so a concurrent manual entry and check-in submit serialize instead of one hitting the unique key.
--  A3  f23_weekly_checkin_run isolates each policy in a subtransaction and audits a skipped policy, so
--      one workspace cannot abort the job for all. The day's audience is a snapshot (A4).
--  A9  correct_progress_measurement validates a manual row against the current weekly check-in question.
--  B1  cancel_food_replacement_request refuses once approval prepared a draft (history and audit stay).
--  B2  f23_checkin_reminders_run skips the day-of reminder when the follow-up instant has already passed.

create or replace function app_private.f23_extract_checkin_measurements() returns trigger
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
  -- Serialize with record_progress_measurement (same clients row lock) so the same-day unique key cannot race.
  perform 1 from public.clients c where c.workspace_id = assignment.workspace_id and c.id = assignment.client_id for update;
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

create or replace function public.record_progress_measurement(
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
  if p_recorded_on > (clock_timestamp() at time zone 'Africa/Cairo')::date
    or p_recorded_on < (clock_timestamp() at time zone 'Africa/Cairo')::date - 366 then
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

create or replace function public.correct_progress_measurement(
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
  else
    -- Manual rows have no snapshot: validate against the current weekly check-in question, the source
    -- record_progress_measurement validated them against.
    select app_private.f23_measurement_question(v.definition, existing.measurement_type) into q
    from app_private.form_assignment_policies p
    join public.form_versions v on v.workspace_id = p.workspace_id and v.form_id = p.form_id
      and v.version_number = p.version_number and v.status = 'published'
    where p.workspace_id = existing.workspace_id and p.trigger_kind = 'weekly_checkin';
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

create or replace function app_private.f23_weekly_checkin_run(p_today date default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare today date := coalesce(p_today, (clock_timestamp() at time zone 'Africa/Cairo')::date);
  policy app_private.form_assignment_policies%rowtype; form_version public.form_versions%rowtype;
  snapshot_at timestamptz := transaction_timestamp(); checkin_key text; client_ids uuid[]; deadline_days integer;
  assigned record; total integer := 0; latest_status text;
begin
  if current_user <> 'postgres' then
    raise exception 'f23_checkin_owner_required' using errcode = '42501';
  end if;
  if not isfinite(today) then raise exception 'invalid_input' using errcode = '22023'; end if;
  checkin_key := 'weekly_checkin:' || today::text;
  for policy in
    select p.* from app_private.form_assignment_policies p where p.trigger_kind = 'weekly_checkin'
    order by p.workspace_id
  loop
    begin
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('f15-form:'||policy.workspace_id::text||':'||policy.form_id::text, 0));
      if exists (select 1 from app_private.form_assignment_occurrences o
        where o.workspace_id = policy.workspace_id and o.policy_id = policy.id and o.occurrence_key = checkin_key) then
        continue;
      end if;
      select v.status into latest_status from public.form_versions v
        where v.workspace_id = policy.workspace_id and v.form_id = policy.form_id
        order by v.version_number desc limit 1;
      select v.* into form_version from public.form_versions v
        where v.workspace_id = policy.workspace_id and v.form_id = policy.form_id
          and v.version_number = policy.version_number and v.status = 'published'
          and app_private.f15_current_terms_policy(v.terms_policy_version);
      if not found or latest_status = 'retired' or not app_private.f23_checkin_definition_valid(form_version.definition) then
        continue;
      end if;
      deadline_days := coalesce((policy.timing->>'client_deadline_days')::integer, 3);
      -- FR-009: only clients with an active (not frozen, not expired) entitlement today.
      select coalesce(array_agg(c.id order by c.id), '{}'::uuid[]) into client_ids
      from public.clients c
      where c.workspace_id = policy.workspace_id and c.approval_state = 'approved' and c.deactivated_at is null
        and exists (select 1 from public.subscriptions s
          where s.workspace_id = c.workspace_id and s.client_id = c.id
            and app_private.f13_project_entitlement(s.workspace_id, s.id, today)->>'status' = 'active')
        and app_private.f23_checkin_due_index(c.workspace_id, c.id, today) is not null;
      insert into app_private.form_assignment_occurrences(workspace_id, policy_id, occurrence_key, snapshot_at,
        audience_client_ids, version_number, trigger_kind, created_by)
      values (policy.workspace_id, policy.id, checkin_key, snapshot_at, client_ids, policy.version_number,
        'weekly_checkin', policy.configured_by)
      on conflict (workspace_id, policy_id, occurrence_key) do nothing;
      for assigned in
        insert into public.form_assignments(workspace_id, client_id, form_id, version_number, terms_policy_version,
          policy_kind, version_snapshot, occurrence_key, audience_snapshot_at, client_deadline_at, policy_id, configured_by)
        select policy.workspace_id, x.id, form_version.form_id, form_version.version_number, form_version.terms_policy_version,
          form_version.policy_kind, form_version.definition, checkin_key, snapshot_at,
          (((today + deadline_days + 1)::timestamp at time zone 'Africa/Cairo') - interval '1 millisecond'),
          policy.id, policy.configured_by
        from unnest(client_ids) x(id)
        on conflict (workspace_id, client_id, form_id, occurrence_key) do nothing
        returning id, client_id
      loop
        total := total + 1;
        insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
        values (null, 'form.assignment_occurrence_materialized', 'form_assignments', assigned.id, policy.workspace_id,
          jsonb_build_object('client_id', assigned.client_id, 'form_id', form_version.form_id, 'occurrence_key', checkin_key,
            'version_number', form_version.version_number, 'trigger_kind', 'weekly_checkin'));
      end loop;
    exception when others then
      -- A3: one failing policy never aborts the job for the other workspaces; the skip is audited.
      insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
      values (null, 'form.weekly_checkin_policy_skipped', 'form_assignment_policies', policy.id, policy.workspace_id,
        jsonb_build_object('sqlstate', sqlstate, 'occurrence_key', checkin_key));
    end;
  end loop;
  return total;
end $$;

create or replace function app_private.f23_checkin_reminders_run(p_now timestamptz default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  now_ts timestamptz := coalesce(p_now, clock_timestamp());
  today date;
  due record;
  reminder record;
  total integer := 0;
  notice_id uuid;
begin
  if current_user <> 'postgres' then
    raise exception 'f23_checkin_owner_required' using errcode = '42501';
  end if;
  if not isfinite(now_ts) then raise exception 'invalid_input' using errcode = '22023'; end if;
  today := (now_ts at time zone 'Africa/Cairo')::date;
  for due in
    select a.workspace_id, a.id as assignment_id, a.client_id,
      substring(a.occurrence_key from 'weekly_checkin:([0-9]{4}-[0-9]{2}-[0-9]{2})$')::date as due_on
    from public.form_assignments a
    join app_private.form_assignment_policies p
      on p.workspace_id = a.workspace_id and p.id = a.policy_id and p.trigger_kind = 'weekly_checkin'
    where a.occurrence_key ~ '^weekly_checkin:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and substring(a.occurrence_key from 'weekly_checkin:([0-9]{4}-[0-9]{2}-[0-9]{2})$')::date between today - 1 and today
      and not exists (select 1 from app_private.form_submissions s
        where s.workspace_id = a.workspace_id and s.assignment_id = a.id)
    order by a.workspace_id, a.id
  loop
    if app_private.f23_client_frozen_on(due.workspace_id, due.client_id, today)
      or not exists (select 1 from public.subscriptions s
        where s.workspace_id = due.workspace_id and s.client_id = due.client_id
          and app_private.f13_project_entitlement(s.workspace_id, s.id, today)->>'status' = 'active') then
      continue;
    end if;
    for reminder in
      select * from (values
        ('checkin_reminder_day_of', due.due_on),
        ('checkin_reminder_followup', due.due_on + 1)
      ) r(kind, send_day)
    loop
      if now_ts < ((reminder.send_day::timestamp + interval '10 hours') at time zone 'Africa/Cairo') then
        continue;
      end if;
      -- B2: a day-of reminder is pointless once the follow-up instant has passed (late start or outage).
      if reminder.kind = 'checkin_reminder_day_of'
        and now_ts >= (((due.due_on + 1)::timestamp + interval '10 hours') at time zone 'Africa/Cairo') then
        continue;
      end if;
      if exists (select 1 from app_private.client_inbox_notices n
        where n.workspace_id = due.workspace_id and n.client_id = due.client_id
          and n.notice_kind = reminder.kind and n.source_key = due.assignment_id) then
        continue;
      end if;
      notice_id := app_private.f22_enqueue_client_notice(due.workspace_id, due.client_id, reminder.kind, due.assignment_id);
      if notice_id is not null then total := total + 1; end if;
    end loop;
  end loop;
  return total;
end $$;

create or replace function public.cancel_food_replacement_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); v_request public.food_replacement_requests%rowtype;
begin
  if actor is null or p_request_id is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select q.* into v_request from public.food_replacement_requests q where q.id = p_request_id;
  -- Another client's (or workspace's) request is indistinguishable from a missing one.
  if not found or not exists (
    select 1 from public.clients c
    where c.workspace_id = v_request.workspace_id and c.id = v_request.client_id
      and c.auth_user_id = actor and c.approval_state = 'approved' and c.deactivated_at is null
  ) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select q.* into v_request from public.food_replacement_requests q
  where q.workspace_id = v_request.workspace_id and q.id = p_request_id for update;
  if v_request.status <> 'open' then
    return jsonb_build_object('status', 'not_open');
  end if;
  -- B1: once a trainer approved (a draft carries the alternative) the client cannot withdraw it.
  if v_request.prepared_alternative_id is not null then
    return jsonb_build_object('status', 'already_prepared');
  end if;
  perform pg_catalog.set_config('app.f23_food_request_write', 'on', true);
  update public.food_replacement_requests q
  set status = 'cancelled', resolved_at = clock_timestamp(), resolved_by = actor
  where q.workspace_id = v_request.workspace_id and q.id = v_request.id
  returning * into v_request;
  perform app_private.f23_food_request_audit(actor, 'progress.food_replacement_cancelled', v_request, 'cancelled');
  perform pg_catalog.set_config('app.f23_food_request_write', '', true);
  return jsonb_build_object('status', 'cancelled');
end $$;
