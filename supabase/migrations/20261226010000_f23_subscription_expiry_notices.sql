-- Spec 028 slice 1: add expiry stages to the existing F23 staff inbox and
-- evaluate them from the authoritative F13 projection on the existing cron.

alter table app_private.staff_inbox_notices
  drop constraint staff_inbox_notices_kind_check;
alter table app_private.staff_inbox_notices
  add constraint staff_inbox_notices_kind_check check (notice_kind in (
    'food_replacement_open', 'monthly_quality_reminder',
    'subscription_expiring_t3', 'subscription_expired'
  ));

-- source_key remains the subscription id. source_revision is F13's effective
-- exclusive-end date; notice_kind is the stage. Keep food-request deliveries
-- under the same uniqueness rule with the stable 'source' revision.
alter table app_private.staff_inbox_notices
  add column source_revision text not null default 'source'
    check (source_revision = 'source' or source_revision ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
do $$
declare old_constraint text;
begin
  select c.conname into old_constraint
  from pg_catalog.pg_constraint c
  where c.conrelid = 'app_private.staff_inbox_notices'::regclass
    and c.contype = 'u'
    and pg_catalog.pg_get_constraintdef(c.oid) =
      'UNIQUE (workspace_id, recipient_user_id, notice_kind, source_key)';
  if old_constraint is null then raise exception 'staff_notice_dedup_constraint_missing'; end if;
  execute pg_catalog.format('alter table app_private.staff_inbox_notices drop constraint %I', old_constraint);
end $$;
alter table app_private.staff_inbox_notices
  add constraint staff_inbox_notices_revision_dedup
  unique (workspace_id, recipient_user_id, notice_kind, source_key, source_revision);

-- P7 shares this existing inbox. Keep its producer on the new revision-aware
-- dedup key so its established monthly reminder contract continues to work.
create or replace function public.handle_quality_monthly_reminder(
  p_job_id uuid,
  p_lease_token uuid
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs%rowtype;
  v_reminder public.p7_monthly_reminder_outbox%rowtype;
  v_recipient uuid;
  v_inserted integer := 0;
begin
  if p_job_id is null or p_lease_token is null then return false; end if;
  select * into v_job
  from public.jobs j
  where j.id = p_job_id and j.kind = 'quality.monthly_reminder'
    and j.status = 'running' and j.lease_token = p_lease_token
    and j.lease_expires_at > pg_catalog.statement_timestamp()
  for update;
  if not found then return false; end if;

  select * into v_reminder
  from public.p7_monthly_reminder_outbox r
  where r.job_id = p_job_id and r.workspace_id = v_job.workspace_id
  for update;
  if not found or v_reminder.notification_kind <> 'monthly_quality_reminder'
    or v_job.payload->>'workspace_id' is distinct from v_job.workspace_id::text
    or v_job.payload->>'month' is distinct from v_reminder.month
    or v_reminder.status = 'failed' then
    return false;
  end if;
  if v_reminder.status = 'sent' then return true; end if;

  if not exists (select 1 from public.staff_profiles p where p.role = 'platform_owner') then
    raise exception 'quality_reminder_recipient_unavailable' using errcode = '40001';
  end if;
  for v_recipient in
    select p.user_id from public.staff_profiles p
    where p.role = 'platform_owner' order by p.user_id
  loop
    insert into app_private.staff_inbox_notices (
      workspace_id, recipient_user_id, notice_kind, source_key, source_revision
    ) values (
      v_reminder.workspace_id, v_recipient, 'monthly_quality_reminder', v_reminder.id, 'source'
    )
    on conflict (workspace_id, recipient_user_id, notice_kind, source_key, source_revision) do nothing;
    if found then v_inserted := v_inserted + 1; end if;
  end loop;

  update public.p7_monthly_reminder_outbox
  set status = 'sent'
  where id = v_reminder.id and status = 'enqueued';
  if not found then
    raise exception 'quality_reminder_state_invalid' using errcode = '40001';
  end if;

  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    auth.uid(), 'quality.reminder_delivered', 'p7_monthly_reminder_outbox',
    v_reminder.id, v_reminder.workspace_id, jsonb_build_object('reminder_id', v_reminder.id)
  );
  return true;
end $$;

create or replace function app_private.f23_guard_staff_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'UPDATE' or old.read_at is not null or new.read_at is null
    or (new.id, new.workspace_id, new.recipient_user_id, new.notice_kind, new.source_key,
        new.source_revision, new.created_at)
      is distinct from (old.id, old.workspace_id, old.recipient_user_id, old.notice_kind,
        old.source_key, old.source_revision, old.created_at) then
    raise exception 'staff_notice_immutable' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function app_private.f23_notify_food_request_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare recipient uuid; notice_id uuid;
begin
  if tg_op = 'INSERT' then
    for recipient in
      select distinct u.id from (
        select app_private.current_assigned_trainer(new.workspace_id, new.client_id) as id
        union
        select m.user_id from public.workspace_memberships m
        join public.staff_profiles p on p.user_id = m.user_id
          and p.role = 'workspace_owner'::public.staff_role
        where m.workspace_id = new.workspace_id and m.revoked_at is null
      ) u where u.id is not null
    loop
      insert into app_private.staff_inbox_notices(
        workspace_id, recipient_user_id, notice_kind, source_key, source_revision
      ) values (new.workspace_id, recipient, 'food_replacement_open', new.id, 'source')
      on conflict (workspace_id, recipient_user_id, notice_kind, source_key, source_revision) do nothing
      returning id into notice_id;
      if notice_id is not null then
        insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
        values (auth.uid(), 'staff_notice.enqueued', 'staff_inbox_notices', notice_id, new.workspace_id,
          jsonb_build_object('notice_kind', 'food_replacement_open'));
      end if;
    end loop;
  elsif old.status = 'open' and new.status in ('approved', 'rejected') then
    perform app_private.f22_enqueue_client_notice(new.workspace_id, new.client_id, 'food_replacement_resolved', new.id);
  end if;
  return null;
end $$;

-- Return the first existing instant of a Cairo date. PostgreSQL resolves a
-- midnight gap forward. If midnight is ambiguous, its normal zone conversion
-- selects the later instant, so select the earlier occurrence when it maps to
-- the same Cairo date.
create function app_private.f23_cairo_date_start(p_day date) returns timestamptz
language plpgsql immutable strict security definer set search_path = '' as $$
declare boundary timestamptz := p_day::timestamp at time zone 'Africa/Cairo';
begin
  if ((boundary - interval '1 hour') at time zone 'Africa/Cairo')::date = p_day then
    return boundary - interval '1 hour';
  end if;
  return boundary;
end $$;

create function app_private.f23_subscription_expiry_notices_run(
  p_now timestamptz default null,
  p_limit integer default 250
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  scan_now timestamptz := coalesce(p_now, clock_timestamp());
  sampled timestamptz;
  today_cairo date;
  candidate record;
  client_row public.clients%rowtype;
  subscription public.subscriptions%rowtype;
  projection jsonb;
  end_day date;
  expiry_at timestamptz;
  stage_kind text;
  recipient uuid;
  notice_id uuid;
  total integer := 0;
begin
  if current_user <> 'postgres' then
    raise exception 'f23_expiry_owner_required' using errcode = '42501';
  end if;
  if (p_now is not null and not isfinite(p_now)) or p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  for candidate in
    with resolved as (
      select distinct s.workspace_id, s.client_id,
        app_private.f19_resolve_subscription_id(s.workspace_id, s.id) as subscription_id
      from public.subscriptions s
      join public.clients c on c.workspace_id = s.workspace_id and c.id = s.client_id
      where c.approval_state = 'approved' and c.deactivated_at is null
    ), projected as (
      select r.*, e.value->>'status' as status,
        nullif(e.value->>'effective_end_exclusive', '')::date as end_day
      from resolved r
      cross join lateral (select app_private.f13_project_entitlement(
        r.workspace_id, r.subscription_id, (scan_now at time zone 'Africa/Cairo')::date) as value) e
    ), due as (
      select p.*, app_private.f23_cairo_date_start(p.end_day) as expiry_at
      from projected p
      where p.end_day is not null
        and p.status in ('future', 'active', 'frozen', 'expired')
    )
    select d.workspace_id, d.client_id, d.subscription_id, d.end_day, d.status, d.expiry_at
    from due d
    where (
      d.status in ('future', 'active', 'frozen')
      and scan_now < d.expiry_at
      and scan_now >= d.expiry_at - interval '72 hours'
      and not exists (select 1 from app_private.staff_inbox_notices n
        where n.workspace_id = d.workspace_id and n.source_key = d.subscription_id
          and n.notice_kind = 'subscription_expiring_t3' and n.source_revision = d.end_day::text)
    ) or (
      d.status = 'expired' and scan_now >= d.expiry_at
      and not exists (select 1 from app_private.staff_inbox_notices n
        where n.workspace_id = d.workspace_id and n.source_key = d.subscription_id
          and n.notice_kind = 'subscription_expired' and n.source_revision = d.end_day::text)
    )
    order by d.workspace_id, d.subscription_id
    limit p_limit
  loop
    -- Same F13 writer order: client row first, then the canonical subscription.
    select c.* into client_row from public.clients c
    where c.workspace_id = candidate.workspace_id and c.id = candidate.client_id
    for update;
    if not found or client_row.approval_state <> 'approved' or client_row.deactivated_at is not null then
      continue;
    end if;
    select s.* into subscription from public.subscriptions s
    where s.workspace_id = candidate.workspace_id and s.client_id = candidate.client_id
      and s.id = candidate.subscription_id
    for update;
    if not found then continue; end if;

    -- Re-sample and re-project after both lifecycle locks have been acquired.
    sampled := case when p_now is null then clock_timestamp() else p_now end;
    today_cairo := (sampled at time zone 'Africa/Cairo')::date;
    projection := app_private.f13_project_entitlement(
      candidate.workspace_id, candidate.subscription_id, today_cairo);
    end_day := nullif(projection->>'effective_end_exclusive', '')::date;
    if end_day is null then continue; end if;
    expiry_at := app_private.f23_cairo_date_start(end_day);
    stage_kind := null;
    if projection->>'status' in ('future', 'active', 'frozen')
      and sampled < expiry_at and sampled >= expiry_at - interval '72 hours' then
      stage_kind := 'subscription_expiring_t3';
    elsif projection->>'status' = 'expired' and sampled >= expiry_at then
      stage_kind := 'subscription_expired';
    end if;
    if stage_kind is null then continue; end if;

    for recipient in
      select distinct recipients.user_id from (
        select p.user_id from public.staff_profiles p
          where p.role = 'platform_owner'::public.staff_role
        union
        select m.user_id from public.workspace_memberships m
          join public.staff_profiles p on p.user_id = m.user_id
          where m.workspace_id = candidate.workspace_id and m.revoked_at is null
            and p.role = 'workspace_owner'::public.staff_role
        union
        select m.user_id from public.workspace_memberships m
          join public.staff_profiles p on p.user_id = m.user_id
          where m.workspace_id = candidate.workspace_id and m.revoked_at is null
            and p.role = 'trainer'::public.staff_role
            and app_private.role_has_capability(p.role, 'coaching_work')
      ) recipients
    loop
      notice_id := null;
      insert into app_private.staff_inbox_notices(
        workspace_id, recipient_user_id, notice_kind, source_key, source_revision
      ) values (
        candidate.workspace_id, recipient, stage_kind, candidate.subscription_id, end_day::text
      ) on conflict (workspace_id, recipient_user_id, notice_kind, source_key, source_revision) do nothing
      returning id into notice_id;
      if notice_id is not null then
        total := total + 1;
        insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
        values (auth.uid(), 'staff_notice.enqueued', 'staff_inbox_notices', notice_id,
          candidate.workspace_id, jsonb_build_object(
            'notice_kind', stage_kind, 'subscription_id', candidate.subscription_id,
            'effective_expiry_revision', end_day::text));
      end if;
    end loop;
  end loop;
  return total;
end $$;

create function public.run_subscription_expiry_notices() returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  return app_private.f23_subscription_expiry_notices_run(null, 250);
end $$;

-- Extend the existing F22 directory filter. The existing 'expired' status is
-- retained; 'expiring' is a current F13 boundary within the next 72 elapsed hours.
create or replace function public.staff_client_directory(
  p_workspace_id uuid,
  p_search text default null,
  p_approval_state text default null,
  p_subscription_status text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_assignment text default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  needle text;
  rows jsonb;
  more boolean;
  actor uuid := auth.uid();
  can_assign boolean;
  code_needle text;
  username_needle text;
  sampled timestamptz := statement_timestamp();
begin
  if p_workspace_id is null
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  can_assign := actor is not null and (
    app_private.is_platform_owner()
    or exists (
      select 1 from public.workspace_memberships m
      join public.staff_profiles p on p.user_id = m.user_id
      where m.workspace_id = p_workspace_id and m.user_id = actor
        and m.revoked_at is null and p.role = 'workspace_owner'
    )
  );
  code_needle := case when can_assign then app_private.normalize_client_code(p_search) end;
  if can_assign and p_assignment is not null
    and p_assignment not in ('assigned', 'unassigned') then
    return jsonb_build_object('status', 'invalid_input');
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
    or p_offset is null or p_offset < 0 or p_offset > 10000
    or (p_search is not null and char_length(p_search) > 100)
    or (p_approval_state is not null
      and p_approval_state not in ('pending-approval', 'approved', 'rejected'))
    or (p_subscription_status is not null and p_subscription_status not in
      ('awaiting_activation', 'future', 'active', 'frozen', 'expired', 'refunded', 'expiring')) then
    return jsonb_build_object('status', 'invalid_input');
  end if;
  needle := nullif(btrim(p_search), '');
  if needle is not null then
    needle := '%' || replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  username_needle := case when nullif(btrim(p_search), '') is not null then
    '%' || replace(replace(replace(lower(normalize(btrim(p_search), NFKC)), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%'
  end;
  with matched as (
    select c.id, c.name, c.approval_state,
      app_private.f22_subscription_core(c.workspace_id, c.id) as summary,
      case when can_assign then app_private.format_client_code(c.client_code) end as client_code,
      case when can_assign and c.approval_state = 'approved' then
        case when app_private.current_assigned_trainer(c.workspace_id, c.id) is null
          then 'unassigned' else 'assigned' end
      end as assignment,
      (select count(*)::integer from public.plan_roots p
        where p.workspace_id = c.workspace_id and p.client_id = c.id
          and not exists (select 1 from public.plan_revisions r
            where r.workspace_id = p.workspace_id and r.plan_id = p.id)) as plans_waiting,
      (select count(*)::integer from public.food_replacement_requests q
        where q.workspace_id = c.workspace_id and q.client_id = c.id
          and q.status = 'open') as pending_replacements,
      (select count(*)::integer
       from app_private.form_submissions s
       join public.form_assignments a
         on a.workspace_id = s.workspace_id and a.id = s.assignment_id
       join app_private.form_assignment_policies p
         on p.workspace_id = a.workspace_id and p.id = a.policy_id and p.trigger_kind = 'weekly_checkin'
       where s.workspace_id = c.workspace_id
         and a.client_id = c.id
         and s.submitted_at >= now() - interval '7 days') as new_check_ins
    from public.clients c
    where c.workspace_id = p_workspace_id
      and (needle is null or c.name ilike needle or c.email_normalized ilike needle
        or c.phone_e164 like needle
        or c.username_normalized ilike username_needle
        or (code_needle is not null and c.client_code = code_needle))
      and (p_approval_state is null or c.approval_state = p_approval_state)
  ), assigned as (
    select m.* from matched m
    where not can_assign or p_assignment is null or m.assignment = p_assignment
  ), filtered as (
    select m.* from assigned m
    where p_subscription_status is null
      or (p_subscription_status <> 'expiring'
        and m.summary->>'status' = p_subscription_status
        and (p_subscription_status <> 'refunded' or m.summary->>'refund_scope' = 'full'))
      or (p_subscription_status = 'expiring'
        and m.summary->>'status' in ('future', 'active', 'frozen')
        and app_private.f23_cairo_date_start(
          nullif(m.summary->>'effective_end_exclusive', '')::date) >= sampled
        and app_private.f23_cairo_date_start(
          nullif(m.summary->>'effective_end_exclusive', '')::date) < sampled + interval '72 hours')
    order by m.name, m.id offset p_offset limit p_limit + 1
  ), numbered as (
    select row_number() over (order by f.name, f.id) as rn, f.* from filtered f
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'client_id', n.id, 'name', n.name, 'approval_state', n.approval_state,
      'subscription_status', n.summary->>'status', 'refund_scope', n.summary->>'refund_scope',
      'plans_waiting_for_delivery', n.plans_waiting,
      'pending_food_replacements', n.pending_replacements,
      'new_check_ins', n.new_check_ins)
      || case when can_assign then jsonb_build_object('assignment', n.assignment,
        'client_code', n.client_code) else '{}'::jsonb end order by n.rn)
      filter (where n.rn <= p_limit), '[]'::jsonb), count(*) > p_limit
    into rows, more from numbered n;
  return jsonb_build_object('status', 'ok', 'clients', rows, 'has_more', more);
end $$;

alter function app_private.f23_cairo_date_start(date) owner to postgres;
alter function app_private.f23_subscription_expiry_notices_run(timestamptz, integer) owner to postgres;
alter function public.run_subscription_expiry_notices() owner to postgres;
alter function public.staff_client_directory(uuid, text, text, text, integer, integer, text) owner to postgres;
revoke all on function app_private.f23_cairo_date_start(date),
  app_private.f23_subscription_expiry_notices_run(timestamptz, integer),
  public.run_subscription_expiry_notices(),
  public.staff_client_directory(uuid, text, text, text, integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.run_subscription_expiry_notices() to service_role;
grant execute on function public.staff_client_directory(uuid, text, text, text, integer, integer, text) to authenticated;

comment on function app_private.f23_subscription_expiry_notices_run(timestamptz, integer) is
  'Spec 028: idempotently evaluates staff expiry stages from F13 under the client/subscription lifecycle lock order.';
notify pgrst, 'reload schema';
