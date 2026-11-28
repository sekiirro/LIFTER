-- S73-367-MIN: choose the earliest activation across F19 reattachments.
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
  first_eligible_at timestamptz;
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

    -- F13 starts the initial term on the activation's Cairo date. Use that
    -- first-existing instant, not this scan's sample, to identify short lead.
    select app_private.f23_cairo_date_start(
      (min(a.activated_at) at time zone 'Africa/Cairo')::date)
    into first_eligible_at
    from public.subscription_activations a
    where a.workspace_id = candidate.workspace_id
      and app_private.f19_resolve_subscription_id(
        a.workspace_id, a.subscription_id) = canonical_subscription_id;

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
      stage_kind := case when first_eligible_at > expiry_at - interval '72 hours'
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
        client_kind := case when first_eligible_at > expiry_at - interval '72 hours'
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

alter function app_private.f23_subscription_expiry_notices_run(timestamptz, integer) owner to postgres;
revoke all on function app_private.f23_subscription_expiry_notices_run(timestamptz, integer) from public, anon, authenticated, service_role;
