-- F23 (spec 023) US1/FR-037: weekly check-in form policy on the F15 assignment
-- engine, plus the read-only adherence contract consumed by spec 024.
-- Reuses F15 policies/occurrences/assignments; no new scheduler or occurrence table (FR-003).

alter table app_private.form_assignment_policies
  drop constraint form_assignment_policies_trigger_kind_check;
alter table app_private.form_assignment_policies
  add constraint form_assignment_policies_trigger_kind_check
  check (trigger_kind in ('manual','joining','onboarding','renewal','recurring','weekly_checkin'));

-- One weekly check-in policy per workspace.
create unique index form_assignment_policies_one_weekly_checkin
  on app_private.form_assignment_policies(workspace_id) where trigger_kind = 'weekly_checkin';

-- FR-037: the two self-report questions use the F15 0-10 integer handling (N11 pattern).
create function app_private.f23_adherence_question_valid(p_definition jsonb, p_question_id text)
returns boolean language sql immutable security definer set search_path = '' as $$
  select coalesce((
    select bool_and(
      q->>'type' in ('slider','number')
      and jsonb_typeof(q->'validation') = 'object'
      and (q->'validation'->>'min') = '0'
      and (q->'validation'->>'max') = '10'
      and (q->'validation'->>'step') = '1')
      and count(*) = 1
    from jsonb_array_elements(
      case when jsonb_typeof(p_definition->'questions') = 'array' then p_definition->'questions' else '[]'::jsonb end
    ) q
    where q->>'id' = p_question_id
  ), false)
$$;

create function app_private.f23_checkin_definition_valid(p_definition jsonb)
returns boolean language sql immutable security definer set search_path = '' as $$
  select p_definition is not null and jsonb_typeof(p_definition) = 'object'
    and app_private.f23_adherence_question_valid(p_definition, 'workoutAdherence')
    and app_private.f23_adherence_question_valid(p_definition, 'dietAdherence')
$$;

-- Reads an adherence answer as a 0-10 integer; anything else is null.
create function app_private.f23_adherence_value(p_answers jsonb, p_question_id text)
returns smallint language sql immutable security definer set search_path = '' as $$
  select case
    when jsonb_typeof(p_answers->p_question_id) = 'number'
      and (p_answers->>p_question_id) ~ '^(10|[0-9])(\.0+)?$'
      then trunc((p_answers->>p_question_id)::numeric)::smallint
    else null end
$$;

create function public.configure_weekly_checkin_form(
  p_workspace_id uuid, p_form_id uuid, p_version_number integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); role public.staff_role; policy_id uuid; latest_status text;
begin
  role := app_private.current_staff_role();
  if actor is null or role is null or not app_private.role_has_capability(role, 'assign_intake_form')
    or not app_private.has_workspace_access(p_workspace_id, 'assign_intake_form') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_form_id is null or p_version_number is null then
    return '{"status":"invalid"}'::jsonb;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('f15-form:'||p_workspace_id::text||':'||p_form_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('f23-checkin:'||p_workspace_id::text, 0));
  role := app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role, 'assign_intake_form')
    or not app_private.has_workspace_access(p_workspace_id, 'assign_intake_form') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select v.status into latest_status from public.form_versions v
    where v.workspace_id = p_workspace_id and v.form_id = p_form_id
    order by v.version_number desc limit 1;
  if latest_status is null or latest_status = 'retired' or not exists (
    select 1 from public.form_versions v
    where v.workspace_id = p_workspace_id and v.form_id = p_form_id and v.version_number = p_version_number
      and v.status = 'published' and app_private.f15_current_terms_policy(v.terms_policy_version)) then
    return '{"status":"not_found"}'::jsonb;
  end if;
  if not app_private.f23_checkin_definition_valid((select v.definition from public.form_versions v
      where v.workspace_id = p_workspace_id and v.form_id = p_form_id and v.version_number = p_version_number)) then
    return '{"status":"invalid"}'::jsonb;
  end if;
  -- Another form already serves as the weekly check-in, or this form has a different F15 trigger.
  if exists (select 1 from app_private.form_assignment_policies p
      where p.workspace_id = p_workspace_id and p.trigger_kind = 'weekly_checkin' and p.form_id <> p_form_id)
    or exists (select 1 from app_private.form_assignment_policies p
      where p.workspace_id = p_workspace_id and p.form_id = p_form_id and p.trigger_kind <> 'weekly_checkin') then
    return '{"status":"conflict"}'::jsonb;
  end if;
  insert into app_private.form_assignment_policies(workspace_id, form_id, version_number, audience_kind,
    specific_client_ids, trigger_kind, timing, stop_conditions, configured_by)
  values (p_workspace_id, p_form_id, p_version_number, 'all_active_clients', '{}', 'weekly_checkin',
    '{"client_deadline_days":3}'::jsonb, '{"frozen":true,"inactive":true}'::jsonb, actor)
  on conflict (workspace_id, form_id) do update set version_number = excluded.version_number,
    configured_by = excluded.configured_by, updated_at = transaction_timestamp()
  returning id into policy_id;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (actor, 'progress.checkin_form_configured', 'form_assignment_policies', policy_id, p_workspace_id,
    jsonb_build_object('form_id', p_form_id, 'version_number', p_version_number));
  return jsonb_build_object('status', 'configured', 'policy_id', policy_id);
end $$;

-- Spec 024 contract: per weekly check-in submission, the two adherence values only.
-- Authorization: database owner/service jobs, or staff holding coaching_work in the workspace.
create function public.progress_weekly_adherence(p_workspace_id uuid, p_from date, p_to date)
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
  if not (session_user = 'postgres' or current_setting('role', true) = 'service_role'
    or app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
    or p_to < p_from or p_to - p_from > 400 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return query
  select a.client_id, a.id,
    substring(a.occurrence_key from 16)::date,
    s.submitted_at,
    app_private.f23_adherence_value(r.answer_values, 'workoutAdherence'),
    app_private.f23_adherence_value(r.answer_values, 'dietAdherence')
  from public.form_assignments a
  join app_private.form_assignment_policies p
    on p.workspace_id = a.workspace_id and p.id = a.policy_id and p.trigger_kind = 'weekly_checkin'
  join app_private.form_submissions s on s.workspace_id = a.workspace_id and s.assignment_id = a.id
  join lateral (
    select x.answer_values from public.form_answer_revisions x
    where x.workspace_id = a.workspace_id and x.assignment_id = a.id and x.revision >= s.revision
    order by x.revision desc limit 1
  ) r on true
  where a.workspace_id = p_workspace_id
    and a.occurrence_key ~ '^weekly_checkin:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and substring(a.occurrence_key from 16)::date between p_from and p_to
  order by a.client_id, substring(a.occurrence_key from 16)::date, a.id;
  get diagnostics returned = row_count;
  -- Constitution VII / F15 audited reads: one ids-and-counts-only event per call.
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), 'progress.adherence_read', 'workspaces', p_workspace_id, p_workspace_id,
    jsonb_build_object('from', p_from, 'to', p_to, 'rows', returned));
end $$;

alter function app_private.f23_adherence_question_valid(jsonb, text) owner to postgres;
alter function app_private.f23_checkin_definition_valid(jsonb) owner to postgres;
alter function app_private.f23_adherence_value(jsonb, text) owner to postgres;
alter function public.configure_weekly_checkin_form(uuid, uuid, integer) owner to postgres;
alter function public.progress_weekly_adherence(uuid, date, date) owner to postgres;
revoke all on function app_private.f23_adherence_question_valid(jsonb, text),
  app_private.f23_checkin_definition_valid(jsonb), app_private.f23_adherence_value(jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function public.configure_weekly_checkin_form(uuid, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.configure_weekly_checkin_form(uuid, uuid, integer) to authenticated;
revoke all on function public.progress_weekly_adherence(uuid, date, date) from public, anon, authenticated, service_role;
grant execute on function public.progress_weekly_adherence(uuid, date, date) to authenticated, service_role;
comment on function public.progress_weekly_adherence(uuid, date, date) is
  'Spec 023 -> 024 read-only contract: workoutAdherence/dietAdherence (0-10 integer or null) per weekly check-in submission.';
