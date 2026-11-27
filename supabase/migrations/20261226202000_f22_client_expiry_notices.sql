-- Spec 028 slice 2: client expiry stages reuse the F22 inbox and slice-1
-- evaluator. Stored kinds are message keys; localized copy is not stored here.

alter table app_private.staff_inbox_notices
  drop constraint staff_inbox_notices_kind_check;
alter table app_private.staff_inbox_notices
  add constraint staff_inbox_notices_kind_check check (notice_kind in (
    'food_replacement_open', 'monthly_quality_reminder',
    'subscription_expiring_t3', 'subscription_expiring_t3_short_lead',
    'subscription_expired'
  ));
alter table app_private.staff_inbox_notices
  add column client_id uuid,
  add column source_stage text not null default 'source'
    check (source_stage in ('source', 't3', 'expiry')),
  add column dismissed_at timestamptz check (
    dismissed_at is null or (isfinite(dismissed_at) and dismissed_at >= created_at)
  );
update app_private.staff_inbox_notices
set source_stage = case when notice_kind in (
  'subscription_expiring_t3', 'subscription_expiring_t3_short_lead'
) then 't3' when notice_kind = 'subscription_expired' then 'expiry' else 'source' end;
update app_private.staff_inbox_notices n
set client_id = s.client_id
from public.subscriptions s
where n.workspace_id = s.workspace_id and n.source_key = s.id
  and n.notice_kind in (
    'subscription_expiring_t3', 'subscription_expiring_t3_short_lead', 'subscription_expired'
  );
alter table app_private.staff_inbox_notices
  add constraint staff_inbox_notices_client_fk
    foreign key (workspace_id, client_id)
    references public.clients(workspace_id, id) on delete restrict;
insert into app_private.retention_purge_allowlist(table_oid, can_delete, can_update, traverse)
values ('app_private.staff_inbox_notices'::regclass, true, false, true)
on conflict (table_oid) do update set can_delete = true, traverse = true;
-- Keep the legacy key so existing F23/P7 inbox producers can continue using
-- their established ON CONFLICT targets. The stage key adds cross-kind T-3
-- deduplication without invalidating those writers.
alter table app_private.staff_inbox_notices
  add constraint staff_inbox_notices_revision_stage_dedup
  unique (workspace_id, recipient_user_id, source_key, source_revision, source_stage);

create or replace function app_private.f23_guard_staff_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE'
    and app_private.retention_purge_context_allows(tg_relid, 'DELETE') then
    return old;
  end if;
  if tg_op = 'UPDATE'
    and (
      (old.read_at is null and new.read_at is not null
        and new.dismissed_at is not distinct from old.dismissed_at
        and (to_jsonb(new) - 'read_at') = (to_jsonb(old) - 'read_at'))
      or (old.dismissed_at is null and new.dismissed_at is not null
        and new.read_at is not distinct from old.read_at
        and (to_jsonb(new) - 'dismissed_at') = (to_jsonb(old) - 'dismissed_at'))
    ) then
    return new;
  end if;
  raise exception 'staff_notice_immutable' using errcode = '23514';
end $$;

alter table app_private.client_inbox_notices
  drop constraint client_inbox_notices_kind_check;
alter table app_private.client_inbox_notices
  add constraint client_inbox_notices_kind_check check (notice_kind in (
    'workout_delivered', 'nutrition_delivered', 'subscription_activated',
    'workout_delivered_activated', 'nutrition_delivered_activated',
    'checkin_reminder_day_of', 'checkin_reminder_followup',
    'food_replacement_resolved', 'subscription_expiring_t3',
    'subscription_expiring_t3_short_lead', 'subscription_expiring_t1',
    'subscription_expired'
  ));

alter table app_private.client_inbox_notices
  add column source_revision text not null default 'source'
    check (source_revision = 'source' or source_revision ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  add column source_stage text,
  add column dismissed_at timestamptz check (
    dismissed_at is null or (isfinite(dismissed_at) and dismissed_at >= created_at)
  );
update app_private.client_inbox_notices set source_stage = notice_kind;
alter table app_private.client_inbox_notices
  alter column source_stage set not null,
  add constraint client_inbox_notices_stage_check check (source_stage in (
    'workout_delivered', 'nutrition_delivered', 'subscription_activated',
    'workout_delivered_activated', 'nutrition_delivered_activated',
    'checkin_reminder_day_of', 'checkin_reminder_followup',
    'food_replacement_resolved', 't3', 't1', 'expiry'
  ));

do $$
declare old_constraint text;
begin
  select c.conname into old_constraint
  from pg_catalog.pg_constraint c
  where c.conrelid = 'app_private.client_inbox_notices'::regclass
    and c.contype = 'u'
    and pg_catalog.pg_get_constraintdef(c.oid) =
      'UNIQUE (workspace_id, client_id, notice_kind, source_key)';
  if old_constraint is null then raise exception 'client_notice_dedup_constraint_missing'; end if;
  execute pg_catalog.format('alter table app_private.client_inbox_notices drop constraint %I', old_constraint);
end $$;
alter table app_private.client_inbox_notices
  add constraint client_inbox_notices_revision_stage_dedup
  unique (workspace_id, client_id, source_key, source_revision, source_stage);

create or replace function app_private.f22_guard_client_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE'
    and app_private.retention_purge_context_allows(tg_relid, 'DELETE') then
    return old;
  end if;
  if tg_op = 'UPDATE'
    and (
      (old.read_at is null and new.read_at is not null
        and new.dismissed_at is not distinct from old.dismissed_at
        and (to_jsonb(new) - 'read_at') = (to_jsonb(old) - 'read_at'))
      or (old.dismissed_at is null and new.dismissed_at is not null
        and new.read_at is not distinct from old.read_at
        and (to_jsonb(new) - 'dismissed_at') = (to_jsonb(old) - 'dismissed_at'))
    ) then
    return new;
  end if;
  raise exception 'client_notice_immutable' using errcode = '23514';
  return old;
end $$;

create function app_private.f22_enqueue_client_notice(
  p_workspace_id uuid, p_client_id uuid, p_notice_kind text, p_source_key uuid,
  p_source_revision text, p_source_stage text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare notice_id uuid; expiry_kind boolean;
begin
  expiry_kind := p_notice_kind in (
    'subscription_expiring_t3', 'subscription_expiring_t3_short_lead',
    'subscription_expiring_t1', 'subscription_expired'
  );
  if p_workspace_id is null or p_client_id is null or p_source_key is null
    or p_notice_kind is null or p_source_revision is null or p_source_stage is null
    or p_source_revision !~ '^(source|[0-9]{4}-[0-9]{2}-[0-9]{2})$'
    or (expiry_kind and not (
      (p_source_stage = 't3' and p_notice_kind in (
        'subscription_expiring_t3', 'subscription_expiring_t3_short_lead'))
      or (p_source_stage = 't1' and p_notice_kind = 'subscription_expiring_t1')
      or (p_source_stage = 'expiry' and p_notice_kind = 'subscription_expired')
    ))
    or (not expiry_kind and (
      p_source_revision <> 'source' or p_source_stage <> p_notice_kind
      or p_notice_kind not in (
        'workout_delivered', 'nutrition_delivered', 'subscription_activated',
        'workout_delivered_activated', 'nutrition_delivered_activated',
        'checkin_reminder_day_of', 'checkin_reminder_followup',
        'food_replacement_resolved'
      )
    )) then
    raise exception 'invalid_client_notice' using errcode = '22023';
  end if;
  if expiry_kind and p_source_revision = 'source' then
    raise exception 'invalid_client_notice' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.clients c
    where c.workspace_id = p_workspace_id and c.id = p_client_id
      and c.approval_state = 'approved' and c.deactivated_at is null
  ) then
    return null;
  end if;
  insert into app_private.client_inbox_notices(
    workspace_id, client_id, notice_kind, source_key, source_revision, source_stage
  ) values (
    p_workspace_id, p_client_id, p_notice_kind, p_source_key,
    p_source_revision, p_source_stage
  ) on conflict (workspace_id, client_id, source_key, source_revision, source_stage) do nothing
  returning id into notice_id;
  if notice_id is null then
    select n.id into notice_id from app_private.client_inbox_notices n
    where n.workspace_id = p_workspace_id and n.client_id = p_client_id
      and n.source_key = p_source_key and n.source_revision = p_source_revision
      and n.source_stage = p_source_stage;
    return notice_id;
  end if;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), 'client_notice.enqueued', 'client_inbox_notices', notice_id,
    p_workspace_id, jsonb_build_object('client_id', p_client_id, 'notice_kind', p_notice_kind));
  return notice_id;
end $$;

-- Preserve all existing F22 callers while routing them through the extended,
-- revision-aware producer seam.
create or replace function app_private.f22_enqueue_client_notice(
  p_workspace_id uuid, p_client_id uuid, p_notice_kind text, p_source_key uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  return app_private.f22_enqueue_client_notice(
    p_workspace_id, p_client_id, p_notice_kind, p_source_key, 'source', p_notice_kind);
end $$;

create or replace function app_private.f23_subscription_expiry_notices_run(
  p_now timestamptz default null, p_limit integer default 250
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  scan_now timestamptz := coalesce(p_now, clock_timestamp());
  sampled timestamptz;
  today_cairo date;
  candidate record;
  client_row public.clients%rowtype;
  subscription public.subscriptions%rowtype;
  canonical_subscription_id uuid;
  projection jsonb;
  end_day date;
  expiry_at timestamptz;
  stage_kind text;
  client_kind text;
  client_stage text;
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
      where p.end_day is not null and p.status in ('future', 'active', 'frozen', 'expired')
    )
    select d.workspace_id, d.client_id, d.subscription_id, d.end_day, d.status, d.expiry_at
    from due d
    where (
      (d.status in ('future', 'active', 'frozen')
        and scan_now < d.expiry_at and scan_now >= d.expiry_at - interval '72 hours'
        and (
          not exists (select 1 from app_private.staff_inbox_notices n
            where n.workspace_id = d.workspace_id and n.source_key = d.subscription_id
              and n.source_stage = 't3' and n.source_revision = d.end_day::text)
          or not exists (select 1 from app_private.client_inbox_notices n
            where n.workspace_id = d.workspace_id and n.client_id = d.client_id
              and n.source_key = d.subscription_id and n.source_revision = d.end_day::text
              and n.source_stage = 't3'
              and not exists (select 1 from public.subscription_renewals r
                where r.workspace_id = d.workspace_id
                  and r.predecessor_subscription_id = d.subscription_id))
        ))
      or (d.status in ('future', 'active', 'frozen')
        and scan_now < d.expiry_at and scan_now >= d.expiry_at - interval '24 hours'
        and not exists (select 1 from app_private.client_inbox_notices n
          where n.workspace_id = d.workspace_id and n.client_id = d.client_id
            and n.source_key = d.subscription_id and n.source_revision = d.end_day::text
            and n.source_stage = 't1'
            and not exists (select 1 from public.subscription_renewals r
              where r.workspace_id = d.workspace_id
                and r.predecessor_subscription_id = d.subscription_id)))
      or (d.status = 'expired' and scan_now >= d.expiry_at
        and (
          not exists (select 1 from app_private.staff_inbox_notices n
            where n.workspace_id = d.workspace_id and n.source_key = d.subscription_id
              and n.notice_kind = 'subscription_expired' and n.source_revision = d.end_day::text)
          or not exists (select 1 from app_private.client_inbox_notices n
            where n.workspace_id = d.workspace_id and n.client_id = d.client_id
              and n.source_key = d.subscription_id and n.source_revision = d.end_day::text
              and n.source_stage = 'expiry'
              and not exists (select 1 from public.subscription_renewals r
                where r.workspace_id = d.workspace_id
                  and r.predecessor_subscription_id = d.subscription_id))
        ))
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
    canonical_subscription_id := app_private.f19_resolve_subscription_id(
      candidate.workspace_id, candidate.subscription_id);
    if canonical_subscription_id is null then continue; end if;
    select s.* into subscription from public.subscriptions s
    where s.workspace_id = candidate.workspace_id and s.client_id = candidate.client_id
      and s.id = canonical_subscription_id
    for update;
    if not found then continue; end if;

    -- Re-sample and re-project after both lifecycle locks have been acquired.
    sampled := case when p_now is null then clock_timestamp() else p_now end;
    today_cairo := (sampled at time zone 'Africa/Cairo')::date;
    projection := app_private.f13_project_entitlement(
      candidate.workspace_id, canonical_subscription_id, today_cairo);
    end_day := nullif(projection->>'effective_end_exclusive', '')::date;
    if end_day is null then continue; end if;
    expiry_at := app_private.f23_cairo_date_start(end_day);
    stage_kind := null;
    if projection->>'status' in ('future', 'active', 'frozen')
      and sampled < expiry_at and sampled >= expiry_at - interval '72 hours' then
      stage_kind := case when sampled > expiry_at - interval '72 hours'
        then 'subscription_expiring_t3_short_lead' else 'subscription_expiring_t3' end;
    elsif projection->>'status' = 'expired' and sampled >= expiry_at then
      stage_kind := 'subscription_expired';
    end if;

    if stage_kind is not null then
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
          workspace_id, recipient_user_id, notice_kind, source_key, source_revision,
          client_id, source_stage
        ) values (
          candidate.workspace_id, recipient, stage_kind, canonical_subscription_id, end_day::text,
          candidate.client_id,
          case when stage_kind = 'subscription_expired' then 'expiry' else 't3' end
        ) on conflict (workspace_id, recipient_user_id, source_key, source_revision, source_stage) do nothing
        returning id into notice_id;
        if notice_id is not null then
          total := total + 1;
          insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
          values (auth.uid(), 'staff_notice.enqueued', 'staff_inbox_notices', notice_id,
            candidate.workspace_id, jsonb_build_object(
              'notice_kind', stage_kind, 'subscription_id', canonical_subscription_id,
              'effective_expiry_revision', end_day::text));
        end if;
      end loop;
    end if;

    if not exists (select 1 from public.subscription_renewals r
      where r.workspace_id = candidate.workspace_id
        and r.predecessor_subscription_id = canonical_subscription_id) then
    if projection->>'status' in ('future', 'active', 'frozen') and sampled < expiry_at then
      if sampled >= expiry_at - interval '72 hours' and not exists (
        select 1 from app_private.client_inbox_notices n
        where n.workspace_id = candidate.workspace_id and n.client_id = candidate.client_id
          and n.source_key = canonical_subscription_id and n.source_revision = end_day::text
          and n.source_stage = 't3') then
        client_stage := 't3';
        client_kind := case when sampled > expiry_at - interval '72 hours'
          then 'subscription_expiring_t3_short_lead' else 'subscription_expiring_t3' end;
        notice_id := app_private.f22_enqueue_client_notice(
          candidate.workspace_id, candidate.client_id, client_kind, canonical_subscription_id,
          end_day::text, client_stage);
        if notice_id is not null then total := total + 1; end if;
      end if;
      if sampled >= expiry_at - interval '24 hours' and not exists (
        select 1 from app_private.client_inbox_notices n
        where n.workspace_id = candidate.workspace_id and n.client_id = candidate.client_id
          and n.source_key = canonical_subscription_id and n.source_revision = end_day::text
          and n.source_stage = 't1') then
        notice_id := app_private.f22_enqueue_client_notice(
          candidate.workspace_id, candidate.client_id, 'subscription_expiring_t1',
          canonical_subscription_id, end_day::text, 't1');
        if notice_id is not null then total := total + 1; end if;
      end if;
    elsif projection->>'status' = 'expired' and sampled >= expiry_at and not exists (
      select 1 from app_private.client_inbox_notices n
      where n.workspace_id = candidate.workspace_id and n.client_id = candidate.client_id
        and n.source_key = canonical_subscription_id and n.source_revision = end_day::text
        and n.source_stage = 'expiry') then
      notice_id := app_private.f22_enqueue_client_notice(
        candidate.workspace_id, candidate.client_id, 'subscription_expired',
        canonical_subscription_id, end_day::text, 'expiry');
      if notice_id is not null then total := total + 1; end if;
    end if;
    end if;
  end loop;
  return total;
end $$;

alter function app_private.f22_enqueue_client_notice(uuid, uuid, text, uuid, text, text) owner to postgres;
alter function app_private.f22_enqueue_client_notice(uuid, uuid, text, uuid) owner to postgres;
alter function app_private.f23_subscription_expiry_notices_run(timestamptz, integer) owner to postgres;

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
      (select count(*)::integer from app_private.form_submissions s
       join public.form_assignments a
         on a.workspace_id = s.workspace_id and a.id = s.assignment_id
       join app_private.form_assignment_policies p
         on p.workspace_id = a.workspace_id and p.id = a.policy_id and p.trigger_kind = 'weekly_checkin'
       where s.workspace_id = c.workspace_id and a.client_id = c.id
         and s.submitted_at >= now() - interval '7 days') as new_check_ins
    from public.clients c
    where c.workspace_id = p_workspace_id
      and (needle is null or c.name ilike needle or c.email_normalized ilike needle
        or c.phone_e164 like needle or c.username_normalized ilike username_needle
        or (code_needle is not null and c.client_code = code_needle))
      and (p_approval_state is null or c.approval_state = p_approval_state)
  ), bucketed as (
    select m.*,
      case
        when m.summary->>'status' = 'expired' then 'expired'
        when m.summary->>'status' in ('future', 'active', 'frozen')
          and app_private.f23_cairo_date_start(
            nullif(m.summary->>'effective_end_exclusive', '')::date) >= sampled
          and app_private.f23_cairo_date_start(
            nullif(m.summary->>'effective_end_exclusive', '')::date) < sampled + interval '72 hours'
          then 'expiring'
        else null
      end as expiry_bucket
    from matched m
  ), assigned as (
    select m.* from bucketed m
    where not can_assign or p_assignment is null or m.assignment = p_assignment
  ), filtered as (
    select m.* from assigned m
    where p_subscription_status is null
      or (p_subscription_status = 'expiring' and m.expiry_bucket = 'expiring')
      or (p_subscription_status <> 'expiring'
        and m.summary->>'status' = p_subscription_status
        and (p_subscription_status <> 'refunded' or m.summary->>'refund_scope' = 'full'))
    order by m.name, m.id offset p_offset limit p_limit + 1
  ), numbered as (
    select row_number() over (order by f.name, f.id) as rn, f.* from filtered f
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'client_id', n.id, 'name', n.name, 'approval_state', n.approval_state,
      'subscription_status', n.summary->>'status', 'refund_scope', n.summary->>'refund_scope',
      'expiry_bucket', n.expiry_bucket,
      'plans_waiting_for_delivery', n.plans_waiting,
      'pending_food_replacements', n.pending_replacements,
      'new_check_ins', n.new_check_ins)
      || case when can_assign then jsonb_build_object('assignment', n.assignment,
        'client_code', n.client_code) else '{}'::jsonb end order by n.rn)
      filter (where n.rn <= p_limit), '[]'::jsonb), count(*) > p_limit
    into rows, more from numbered n;
  return jsonb_build_object('status', 'ok', 'clients', rows, 'has_more', more);
end $$;

create or replace function public.read_staff_notices(p_limit integer default 50, p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); notices jsonb;
begin
  if actor is null or not exists (
    select 1 from public.staff_profiles p where p.user_id = actor
  ) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
    or (p_before is not null and not isfinite(p_before)) then
    return '{"status":"invalid_input"}'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'notice_id', x.id, 'workspace_id', x.workspace_id, 'notice_kind', x.notice_kind,
      'source_key', x.source_key, 'created_at', x.created_at, 'read_at', x.read_at,
      'client_name', case when x.notice_kind in (
        'subscription_expiring_t3', 'subscription_expiring_t3_short_lead', 'subscription_expired'
      ) then x.client_name else null end,
      'expiry_date', case when x.notice_kind in (
        'subscription_expiring_t3', 'subscription_expiring_t3_short_lead', 'subscription_expired'
      ) then x.source_revision::date else null end,
      'dismissed_at', x.dismissed_at)
      order by x.created_at desc, x.id desc), '[]'::jsonb) into notices
  from (
    select n.*, c.name as client_name from app_private.staff_inbox_notices n
    left join public.clients c on c.workspace_id = n.workspace_id and c.id = n.client_id
    where n.recipient_user_id = actor and n.dismissed_at is null
      and app_private.has_workspace_access(n.workspace_id, 'coaching_work')
      and (p_before is null or n.created_at < p_before)
    order by n.created_at desc, n.id desc limit p_limit
  ) x;
  return jsonb_build_object('status', 'ok', 'notices', notices);
end $$;

create or replace function public.read_client_notices(p_limit integer default 50, p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare client_row record; notices jsonb;
begin
  select * into client_row from app_private.f22_portal_client();
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
    or (p_before is not null and not isfinite(p_before)) then
    return jsonb_build_object('status', 'invalid_input');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'notice_id', x.id, 'notice_kind', x.notice_kind,
      'created_at', x.created_at, 'read_at', x.read_at,
      'expiry_date', case when x.notice_kind in (
        'subscription_expiring_t3', 'subscription_expiring_t3_short_lead',
        'subscription_expiring_t1', 'subscription_expired'
      ) then x.source_revision::date else null end,
      'dismissed_at', x.dismissed_at)
      order by x.created_at desc, x.id desc), '[]'::jsonb) into notices
  from (
    select n.id, n.notice_kind, n.created_at, n.read_at, n.source_revision, n.dismissed_at
    from app_private.client_inbox_notices n
    where n.workspace_id = client_row.workspace_id and n.client_id = client_row.client_id
      and n.dismissed_at is null
      and (p_before is null or n.created_at < p_before)
    order by n.created_at desc, n.id desc limit p_limit
  ) x;
  return jsonb_build_object('status', 'ok', 'notices', notices);
end $$;

create function public.dismiss_client_notice(p_notice_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare client_row record; notice app_private.client_inbox_notices%rowtype;
begin
  select * into client_row from app_private.f22_portal_client();
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if p_notice_id is null then return '{"status":"not_found"}'::jsonb; end if;
  select * into notice from app_private.client_inbox_notices n
  where n.workspace_id = client_row.workspace_id and n.client_id = client_row.client_id
    and n.id = p_notice_id for update;
  if not found then return '{"status":"not_found"}'::jsonb; end if;
  if notice.dismissed_at is null then
    update app_private.client_inbox_notices set dismissed_at = clock_timestamp()
    where workspace_id = notice.workspace_id and id = notice.id;
    insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
    values (auth.uid(), 'client_notice.dismissed', 'client_inbox_notices', notice.id,
      notice.workspace_id, jsonb_build_object('notice_kind', notice.notice_kind));
  end if;
  return '{"status":"dismissed"}'::jsonb;
end $$;

create function public.dismiss_staff_notice(p_notice_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); notice app_private.staff_inbox_notices%rowtype;
begin
  if actor is null or not exists (
    select 1 from public.staff_profiles p where p.user_id = actor
  ) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_notice_id is null then return '{"status":"not_found"}'::jsonb; end if;
  select n.* into notice from app_private.staff_inbox_notices n
  where n.id = p_notice_id and n.recipient_user_id = actor
    and app_private.has_workspace_access(n.workspace_id, 'coaching_work')
  for update;
  if not found then return '{"status":"not_found"}'::jsonb; end if;
  if notice.dismissed_at is null then
    update app_private.staff_inbox_notices set dismissed_at = clock_timestamp()
    where workspace_id = notice.workspace_id and id = notice.id;
    insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
    values (actor, 'staff_notice.dismissed', 'staff_inbox_notices', notice.id,
      notice.workspace_id, jsonb_build_object('notice_kind', notice.notice_kind));
  end if;
  return '{"status":"dismissed"}'::jsonb;
end $$;

alter function public.read_staff_notices(integer, timestamptz) owner to postgres;
alter function public.read_client_notices(integer, timestamptz) owner to postgres;
alter function public.staff_client_directory(uuid, text, text, text, integer, integer, text) owner to postgres;
alter function public.dismiss_staff_notice(uuid) owner to postgres;
alter function public.dismiss_client_notice(uuid) owner to postgres;
revoke all on function app_private.f22_enqueue_client_notice(uuid, uuid, text, uuid, text, text),
  app_private.f22_enqueue_client_notice(uuid, uuid, text, uuid),
  app_private.f23_subscription_expiry_notices_run(timestamptz, integer),
  app_private.f23_guard_staff_notice(), app_private.f22_guard_client_notice(),
  public.read_staff_notices(integer, timestamptz),
  public.read_client_notices(integer, timestamptz),
  public.dismiss_staff_notice(uuid), public.dismiss_client_notice(uuid),
  public.staff_client_directory(uuid, text, text, text, integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.read_staff_notices(integer, timestamptz),
  public.read_client_notices(integer, timestamptz),
  public.dismiss_staff_notice(uuid), public.dismiss_client_notice(uuid),
  public.staff_client_directory(uuid, text, text, text, integer, integer, text)
  to authenticated;
notify pgrst, 'reload schema';
