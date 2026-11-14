-- F23 (spec 023) US1: freeze-aware weekly check-in occurrences on the F15 engine.
-- Anchor: the client's earliest authoritative F12/F13 activation fact
-- (public.subscription_activations.activated_at, Cairo date). Occurrence n is due on the
-- day the client reaches 7n non-frozen days after the anchor (FR-001, FR-002): frozen days
-- shift the cycle and nothing missed during a freeze is delivered later (no catch-up).

create function app_private.f23_client_checkin_anchor(p_workspace_id uuid, p_client_id uuid)
returns date language sql stable security definer set search_path = '' as $$
  select min((a.activated_at at time zone 'Africa/Cairo')::date)
  from public.subscription_activations a
  join public.subscriptions s on s.workspace_id = a.workspace_id and s.id = a.subscription_id
  where a.workspace_id = p_workspace_id and s.client_id = p_client_id
$$;

-- F13 effective frozen days: Apply day counted, Stop day excluded, Remove counts nothing.
create function app_private.f23_client_frozen_on(p_workspace_id uuid, p_client_id uuid, p_day date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subscription_freezes f
    join public.subscriptions s on s.workspace_id = f.workspace_id and s.id = f.subscription_id
    where f.workspace_id = p_workspace_id and s.client_id = p_client_id
      and f.applied_on <= p_day
      and p_day < f.applied_on + app_private.f13_freeze_contribution(f.workspace_id, f.subscription_id, f.id))
$$;

-- Returns the check-in index due on p_day, or null when none is due.
create function app_private.f23_checkin_due_index(p_workspace_id uuid, p_client_id uuid, p_day date)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare anchor date; active_days integer;
begin
  if p_day is null or not isfinite(p_day) then return null; end if;
  anchor := app_private.f23_client_checkin_anchor(p_workspace_id, p_client_id);
  if anchor is null or p_day <= anchor or app_private.f23_client_frozen_on(p_workspace_id, p_client_id, p_day) then
    return null;
  end if;
  select count(*)::integer into active_days
  from generate_series(anchor + 1, p_day, interval '1 day') d(day)
  where not app_private.f23_client_frozen_on(p_workspace_id, p_client_id, d.day::date);
  if active_days > 0 and mod(active_days, 7) = 0 then return active_days / 7; end if;
  return null;
end $$;

-- Owner-only daily materializer. Idempotent per workspace/policy/Cairo day (F15 occurrence key).
create function app_private.f23_weekly_checkin_run(p_today date default null)
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
  end loop;
  return total;
end $$;

create function app_private.f23_weekly_checkin_schedule_deactivate() returns void
language plpgsql security invoker set search_path = '' as $$
declare existing_job bigint;
begin
  if current_user <> 'postgres' then
    raise exception 'f23_checkin_owner_required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(11023, 1);
  for existing_job in select jobid from cron.job where jobname = 'lifter-f23-weekly-checkins' and username = current_user
  loop perform cron.unschedule(existing_job); end loop;
end $$;

-- Owner-only activation, never run by a migration (same gate as F15 T017).
create function app_private.f23_weekly_checkin_schedule_activate() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'postgres' then
    raise exception 'f23_checkin_owner_required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(11023, 1);
  perform app_private.f23_weekly_checkin_schedule_deactivate();
  perform cron.schedule('lifter-f23-weekly-checkins', '5 * * * *', 'select app_private.f23_weekly_checkin_run();');
end $$;

-- FR-008: KPI counts check-ins received (submitted), never check-ins sent.
create function public.progress_checkins_received_count(p_workspace_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare received integer;
begin
  if not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to < p_from then
    return '{"status":"invalid"}'::jsonb;
  end if;
  select count(*)::integer into received
  from app_private.form_submissions s
  join public.form_assignments a on a.workspace_id = s.workspace_id and a.id = s.assignment_id
  join app_private.form_assignment_policies p on p.workspace_id = a.workspace_id and p.id = a.policy_id
  where s.workspace_id = p_workspace_id and p.trigger_kind = 'weekly_checkin'
    and (s.submitted_at at time zone 'Africa/Cairo')::date between p_from and p_to;
  return jsonb_build_object('status', 'ok', 'received', received);
end $$;

alter function app_private.f23_client_checkin_anchor(uuid, uuid) owner to postgres;
alter function app_private.f23_client_frozen_on(uuid, uuid, date) owner to postgres;
alter function app_private.f23_checkin_due_index(uuid, uuid, date) owner to postgres;
alter function app_private.f23_weekly_checkin_run(date) owner to postgres;
alter function app_private.f23_weekly_checkin_schedule_deactivate() owner to postgres;
alter function app_private.f23_weekly_checkin_schedule_activate() owner to postgres;
alter function public.progress_checkins_received_count(uuid, date, date) owner to postgres;
revoke all on function app_private.f23_client_checkin_anchor(uuid, uuid), app_private.f23_client_frozen_on(uuid, uuid, date),
  app_private.f23_checkin_due_index(uuid, uuid, date), app_private.f23_weekly_checkin_run(date),
  app_private.f23_weekly_checkin_schedule_deactivate(), app_private.f23_weekly_checkin_schedule_activate()
  from public, anon, authenticated, service_role;
revoke all on function public.progress_checkins_received_count(uuid, date, date) from public, anon, authenticated, service_role;
grant execute on function public.progress_checkins_received_count(uuid, date, date) to authenticated;
