-- F23 (spec 023) notifications on the F22 client inbox seam and a minimal staff sibling:
--  * T010/T014 weekly check-in reminders (FR-006, FR-007, FR-009): 10:00 Cairo on the due day and
--    24 hours later while unanswered, never for a frozen or non-active client, idempotent.
--  * T033/T040 food replacement notices (FR-027, FR-036): staff notice when a request opens,
--    client notice when it is approved or rejected.
-- Reuses app_private.f22_enqueue_client_notice (F22 inbox). The F15 inbox tables are form-alert
-- specific (stage and assignment bound), so staff notices use a sibling table with the same rules
-- (ids only, producer-keyed dedup, read_at, audit) mirroring the F22 client table.

-- 1. New client notice kind for resolved food replacement requests (F22 table and seam, extended).
alter table app_private.client_inbox_notices drop constraint client_inbox_notices_kind_check;
alter table app_private.client_inbox_notices add constraint client_inbox_notices_kind_check
  check (notice_kind in (
    'workout_delivered', 'nutrition_delivered', 'subscription_activated',
    'workout_delivered_activated', 'nutrition_delivered_activated',
    'checkin_reminder_day_of', 'checkin_reminder_followup', 'food_replacement_resolved'
  ));

create or replace function app_private.f22_enqueue_client_notice(
  p_workspace_id uuid, p_client_id uuid, p_notice_kind text, p_source_key uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare notice_id uuid;
begin
  if p_workspace_id is null or p_client_id is null or p_source_key is null
    or p_notice_kind is null or p_notice_kind not in (
      'workout_delivered', 'nutrition_delivered', 'subscription_activated',
      'workout_delivered_activated', 'nutrition_delivered_activated',
      'checkin_reminder_day_of', 'checkin_reminder_followup', 'food_replacement_resolved') then
    raise exception 'invalid_client_notice' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.clients c
    where c.workspace_id = p_workspace_id and c.id = p_client_id
      and c.approval_state = 'approved' and c.deactivated_at is null
  ) then
    return null;
  end if;
  insert into app_private.client_inbox_notices(workspace_id, client_id, notice_kind, source_key)
    values (p_workspace_id, p_client_id, p_notice_kind, p_source_key)
    on conflict (workspace_id, client_id, notice_kind, source_key) do nothing
    returning id into notice_id;
  if notice_id is null then
    select n.id into notice_id from app_private.client_inbox_notices n
      where n.workspace_id = p_workspace_id and n.client_id = p_client_id
        and n.notice_kind = p_notice_kind and n.source_key = p_source_key;
    return notice_id;
  end if;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
    values (auth.uid(), 'client_notice.enqueued', 'client_inbox_notices', notice_id, p_workspace_id,
      jsonb_build_object('client_id', p_client_id, 'notice_kind', p_notice_kind));
  return notice_id;
end $$;

-- 2. Staff notice sibling table.
create table app_private.staff_inbox_notices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  recipient_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  notice_kind text not null constraint staff_inbox_notices_kind_check check (notice_kind in ('food_replacement_open')),
  -- Producer idempotency key (the food replacement request id).
  source_key uuid not null,
  created_at timestamptz not null default clock_timestamp() check (isfinite(created_at)),
  read_at timestamptz check (read_at is null or (isfinite(read_at) and read_at >= created_at)),
  unique (workspace_id, id),
  unique (workspace_id, recipient_user_id, notice_kind, source_key)
);
create index staff_inbox_notices_recipient_idx
  on app_private.staff_inbox_notices (recipient_user_id, created_at desc, id desc);
alter table app_private.staff_inbox_notices owner to postgres;
alter table app_private.staff_inbox_notices enable row level security;
alter table app_private.staff_inbox_notices force row level security;
revoke all on app_private.staff_inbox_notices from public, anon, authenticated, service_role;

create function app_private.f23_guard_staff_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'UPDATE' or old.read_at is not null or new.read_at is null
    or (new.id, new.workspace_id, new.recipient_user_id, new.notice_kind, new.source_key, new.created_at)
      is distinct from (old.id, old.workspace_id, old.recipient_user_id, old.notice_kind, old.source_key, old.created_at) then
    raise exception 'staff_notice_immutable' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger staff_inbox_notices_guard before update or delete on app_private.staff_inbox_notices
  for each row execute function app_private.f23_guard_staff_notice();
create trigger staff_inbox_notices_no_truncate before truncate on app_private.staff_inbox_notices
  for each statement execute function app_private.f23_guard_staff_notice();

-- Staff reads only their own notices, and only for workspaces where they still have coaching access.
create function public.read_staff_notices(p_limit integer default 50, p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); notices jsonb;
begin
  if actor is null or not exists (select 1 from public.staff_profiles p where p.user_id = actor) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or (p_before is not null and not isfinite(p_before)) then
    return '{"status":"invalid_input"}'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'notice_id', x.id, 'workspace_id', x.workspace_id, 'notice_kind', x.notice_kind,
      'source_key', x.source_key, 'created_at', x.created_at, 'read_at', x.read_at)
      order by x.created_at desc, x.id desc), '[]'::jsonb) into notices
  from (
    select n.* from app_private.staff_inbox_notices n
    where n.recipient_user_id = actor
      and app_private.has_workspace_access(n.workspace_id, 'coaching_work')
      and (p_before is null or n.created_at < p_before)
    order by n.created_at desc, n.id desc limit p_limit
  ) x;
  return jsonb_build_object('status', 'ok', 'notices', notices);
end $$;

create function public.mark_staff_notice_read(p_notice_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); notice app_private.staff_inbox_notices%rowtype;
begin
  if actor is null or not exists (select 1 from public.staff_profiles p where p.user_id = actor) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  -- Another recipient's, a foreign-workspace and an unknown id share `not_found`.
  select n.* into notice from app_private.staff_inbox_notices n
  where n.id = p_notice_id and n.recipient_user_id = actor
    and app_private.has_workspace_access(n.workspace_id, 'coaching_work')
  for update;
  if not found then return '{"status":"not_found"}'::jsonb; end if;
  if notice.read_at is null then
    update app_private.staff_inbox_notices set read_at = clock_timestamp()
      where workspace_id = notice.workspace_id and id = notice.id;
    insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
      values (actor, 'staff_notice.marked_read', 'staff_inbox_notices', notice.id, notice.workspace_id,
        jsonb_build_object('notice_kind', notice.notice_kind));
  end if;
  return '{"status":"read"}'::jsonb;
end $$;

-- 3. Food replacement producers: triggers on the request table cover every write path.
create function app_private.f23_notify_food_request_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare recipient uuid; notice_id uuid;
begin
  if tg_op = 'INSERT' then
    -- FR-027: the responsible trainer (F11) and the workspace owners are told when a request opens.
    for recipient in
      select distinct u.id from (
        select app_private.current_assigned_trainer(new.workspace_id, new.client_id) as id
        union
        select m.user_id from public.workspace_memberships m
        join public.staff_profiles p on p.user_id = m.user_id and p.role = 'workspace_owner'::public.staff_role
        where m.workspace_id = new.workspace_id and m.revoked_at is null
      ) u where u.id is not null
    loop
      insert into app_private.staff_inbox_notices(workspace_id, recipient_user_id, notice_kind, source_key)
      values (new.workspace_id, recipient, 'food_replacement_open', new.id)
      on conflict (workspace_id, recipient_user_id, notice_kind, source_key) do nothing
      returning id into notice_id;
      if notice_id is not null then
        insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
        values (auth.uid(), 'staff_notice.enqueued', 'staff_inbox_notices', notice_id, new.workspace_id,
          jsonb_build_object('notice_kind', 'food_replacement_open'));
      end if;
    end loop;
  elsif old.status = 'open' and new.status in ('approved', 'rejected') then
    -- FR-027: the client is told on rejection and on approval (stale closure and cancel are silent).
    perform app_private.f22_enqueue_client_notice(new.workspace_id, new.client_id, 'food_replacement_resolved', new.id);
  end if;
  return null;
end $$;
create trigger f23_notify_food_request_insert after insert on public.food_replacement_requests
  for each row execute function app_private.f23_notify_food_request_change();
create trigger f23_notify_food_request_update after update on public.food_replacement_requests
  for each row when (old.status is distinct from new.status)
  execute function app_private.f23_notify_food_request_change();

-- 4. Weekly check-in reminders (FR-006, FR-007, FR-009).
-- A reminder is owed when its 10:00 Cairo instant has passed, the check-in is unanswered, the client
-- is not frozen today and still has an active entitlement. Only the due day and the day after are
-- considered (no catch-up). The F22 enqueue key (workspace, client, kind, assignment id) dedupes.
create function app_private.f23_checkin_reminders_run(p_now timestamptz default null)
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

-- Hourly job runs the occurrence materializer and then the reminders (replaces the F23 activation).
create or replace function app_private.f23_weekly_checkin_schedule_activate() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'postgres' then
    raise exception 'f23_checkin_owner_required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(11023, 1);
  perform app_private.f23_weekly_checkin_schedule_deactivate();
  perform cron.schedule('lifter-f23-weekly-checkins', '5 * * * *',
    'select app_private.f23_weekly_checkin_run(); select app_private.f23_checkin_reminders_run();');
end $$;

alter function app_private.f23_guard_staff_notice() owner to postgres;
alter function app_private.f23_notify_food_request_change() owner to postgres;
alter function app_private.f23_checkin_reminders_run(timestamptz) owner to postgres;
alter function app_private.f23_weekly_checkin_schedule_activate() owner to postgres;
alter function public.read_staff_notices(integer, timestamptz) owner to postgres;
alter function public.mark_staff_notice_read(uuid) owner to postgres;
revoke all on function app_private.f23_guard_staff_notice(), app_private.f23_notify_food_request_change(),
  app_private.f23_checkin_reminders_run(timestamptz), app_private.f23_weekly_checkin_schedule_activate()
  from public, anon, authenticated, service_role;
revoke all on function public.read_staff_notices(integer, timestamptz), public.mark_staff_notice_read(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_staff_notices(integer, timestamptz) to authenticated;
grant execute on function public.mark_staff_notice_read(uuid) to authenticated;
comment on table app_private.staff_inbox_notices is
  'F23 staff-recipient sibling of the F15/F22 in-app inbox: ids only, producer-keyed dedup, read_at.';

notify pgrst, 'reload schema';
