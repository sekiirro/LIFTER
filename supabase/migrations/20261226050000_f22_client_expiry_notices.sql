-- Spec 028 slice 2: client expiry stages reuse the F22 inbox and slice-1
-- evaluator. Stored kinds are message keys; localized copy is not stored here.

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
  add column source_stage text;
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
  if tg_op <> 'UPDATE' or old.read_at is not null or new.read_at is null
    or (new.id, new.workspace_id, new.client_id, new.notice_kind, new.source_key,
        new.source_revision, new.source_stage, new.created_at)
      is distinct from (old.id, old.workspace_id, old.client_id, old.notice_kind,
        old.source_key, old.source_revision, old.source_stage, old.created_at) then
    raise exception 'client_notice_immutable' using errcode = '23514';
  end if;
  return new;
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
              and n.notice_kind = 'subscription_expiring_t3' and n.source_revision = d.end_day::text)
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
    end if;

    if not exists (select 1 from public.subscription_renewals r
      where r.workspace_id = candidate.workspace_id
        and r.predecessor_subscription_id = candidate.subscription_id) then
    if projection->>'status' in ('future', 'active', 'frozen') and sampled < expiry_at then
      if sampled >= expiry_at - interval '72 hours' and not exists (
        select 1 from app_private.client_inbox_notices n
        where n.workspace_id = candidate.workspace_id and n.client_id = candidate.client_id
          and n.source_key = candidate.subscription_id and n.source_revision = end_day::text
          and n.source_stage = 't3') then
        client_stage := 't3';
        client_kind := case when sampled > expiry_at - interval '72 hours'
          then 'subscription_expiring_t3_short_lead' else 'subscription_expiring_t3' end;
        notice_id := app_private.f22_enqueue_client_notice(
          candidate.workspace_id, candidate.client_id, client_kind, candidate.subscription_id,
          end_day::text, client_stage);
        if notice_id is not null then total := total + 1; end if;
      end if;
      if sampled >= expiry_at - interval '24 hours' and not exists (
        select 1 from app_private.client_inbox_notices n
        where n.workspace_id = candidate.workspace_id and n.client_id = candidate.client_id
          and n.source_key = candidate.subscription_id and n.source_revision = end_day::text
          and n.source_stage = 't1') then
        notice_id := app_private.f22_enqueue_client_notice(
          candidate.workspace_id, candidate.client_id, 'subscription_expiring_t1',
          candidate.subscription_id, end_day::text, 't1');
        if notice_id is not null then total := total + 1; end if;
      end if;
    elsif projection->>'status' = 'expired' and sampled >= expiry_at and not exists (
      select 1 from app_private.client_inbox_notices n
      where n.workspace_id = candidate.workspace_id and n.client_id = candidate.client_id
        and n.source_key = candidate.subscription_id and n.source_revision = end_day::text
        and n.source_stage = 'expiry') then
      notice_id := app_private.f22_enqueue_client_notice(
        candidate.workspace_id, candidate.client_id, 'subscription_expired',
        candidate.subscription_id, end_day::text, 'expiry');
      if notice_id is not null then total := total + 1; end if;
    end if;
    end if;
  end loop;
  return total;
end $$;

alter function app_private.f22_enqueue_client_notice(uuid, uuid, text, uuid, text, text) owner to postgres;
alter function app_private.f22_enqueue_client_notice(uuid, uuid, text, uuid) owner to postgres;
alter function app_private.f23_subscription_expiry_notices_run(timestamptz, integer) owner to postgres;
revoke all on function app_private.f22_enqueue_client_notice(uuid, uuid, text, uuid, text, text),
  app_private.f22_enqueue_client_notice(uuid, uuid, text, uuid),
  app_private.f23_subscription_expiry_notices_run(timestamptz, integer)
  from public, anon, authenticated, service_role;
notify pgrst, 'reload schema';
