-- F22 T016/T035 (S57-PO-12): "Refunded" is shown only when the subscription
-- was fully refunded. F13 projects `refunded` for any refund (a refund is a
-- terminal exit even when partial, F13 US1) and owns no subscription-level
-- full/partial flag. Its per-obligation fact is `refund_state` in
-- `public.subscription_payment_status`: refunded principal (sum of
-- `refund_allocation_events`) >= the obligation's latest collection amount.
-- This read-only helper applies that same F13 rule to every obligation of the
-- continuous subscription (F19 continuity resolution, as F13's projection
-- does). It adds no status, writes nothing and changes no F13 object.

-- 'full' when every collected obligation is refunded in full, 'partial' when a
-- refund exists but some collected principal remains, null when no refund.
create function app_private.f22_refund_scope(p_workspace_id uuid, p_subscription_id uuid)
returns text
language sql stable security definer set search_path = '' as $$
  with continuous as (
    select s.id from public.subscriptions s
    where s.workspace_id = p_workspace_id
      and app_private.f19_resolve_subscription_id(s.workspace_id, s.id) = p_subscription_id
  ), obligations as (
    select coalesce(t.amount_minor, 0) as collected_minor,
      coalesce((select sum(-x.amount_minor) from public.refund_allocation_events x
        where x.workspace_id = i.workspace_id and x.subscription_id = i.subscription_id
          and x.obligation_id = i.id), 0) as refunded_minor
    from public.subscription_installments i
    join continuous c on c.id = i.subscription_id
    left join lateral (
      select e.kind, e.amount_minor from public.payment_events e
      where e.workspace_id = i.workspace_id and e.obligation_id = i.id
      order by e.revision desc limit 1
    ) t on true
    where i.workspace_id = p_workspace_id and t.kind = 'collection'
  )
  select case
    when not exists (
      select 1 from public.refund_operations r
      join continuous c on c.id = r.subscription_id
      where r.workspace_id = p_workspace_id
    ) then null
    when exists (select 1 from obligations o where o.refunded_minor < o.collected_minor) then 'partial'
    else 'full'
  end
$$;

-- Same contract as before plus `refund_scope` ('full' | 'partial') when F13
-- projects `refunded`. Callers strip `subscription_id` before returning it.
create or replace function app_private.f22_subscription_summary(p_workspace_id uuid, p_client_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
  current_count integer;
  resolved_count integer;
  chosen uuid;
  projection jsonb;
  summary jsonb;
begin
  with resolved as (
    select distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id) as sid
    from public.subscriptions s
    where s.workspace_id = p_workspace_id and s.client_id = p_client_id
  ), projected as (
    select r.sid, app_private.f13_project_entitlement(p_workspace_id, r.sid, today) as value
    from resolved r
  )
  select count(*) filter (where p.value->>'status' in ('active', 'frozen'))::integer,
    count(*)::integer,
    coalesce(
      (array_agg(p.sid order by p.sid) filter (where p.value->>'status' in ('active', 'frozen')))[1],
      (array_agg(p.sid order by p.sid))[1])
    into current_count, resolved_count, chosen
  from projected p;
  if current_count > 1 or (current_count = 0 and resolved_count <> 1) or chosen is null then
    return null;
  end if;
  projection := app_private.f13_project_entitlement(p_workspace_id, chosen, today);
  summary := jsonb_build_object(
    'subscription_id', chosen,
    'status', projection->>'status',
    'effective_end_exclusive', projection->>'effective_end_exclusive');
  if projection->>'status' = 'refunded' then
    summary := summary || jsonb_build_object('refund_scope',
      coalesce(app_private.f22_refund_scope(p_workspace_id, chosen), 'partial'));
  end if;
  return summary;
end $$;

-- Directory: rows carry `refund_scope`; the `refunded` filter matches full
-- refunds only (S57-PO-12). Otherwise unchanged from 20261118100000.
create or replace function public.staff_client_directory(
  p_workspace_id uuid,
  p_search text default null,
  p_approval_state text default null,
  p_subscription_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  needle text;
  rows jsonb;
  more boolean;
begin
  if p_workspace_id is null
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
    or p_offset is null or p_offset < 0 or p_offset > 10000
    or (p_search is not null and char_length(p_search) > 100)
    or (p_approval_state is not null
      and p_approval_state not in ('pending-approval', 'approved', 'rejected'))
    or (p_subscription_status is not null and p_subscription_status not in
      ('awaiting_activation', 'future', 'active', 'frozen', 'expired', 'refunded')) then
    return jsonb_build_object('status', 'invalid_input');
  end if;
  needle := nullif(btrim(p_search), '');
  if needle is not null then
    needle := '%' || replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with matched as (
    select c.id, c.name, c.approval_state,
      app_private.f22_subscription_summary(c.workspace_id, c.id) as summary,
      (select count(*)::integer from public.plan_roots p
        where p.workspace_id = c.workspace_id and p.client_id = c.id
          and not exists (select 1 from public.plan_revisions r
            where r.workspace_id = p.workspace_id and r.plan_id = p.id)) as plans_waiting
    from public.clients c
    where c.workspace_id = p_workspace_id
      and (needle is null
        or c.name ilike needle
        or c.email_normalized ilike needle
        or c.phone_e164 like needle)
      and (p_approval_state is null or c.approval_state = p_approval_state)
  ), filtered as (
    select m.* from matched m
    where p_subscription_status is null
      or (m.summary->>'status' = p_subscription_status
        and (p_subscription_status <> 'refunded' or m.summary->>'refund_scope' = 'full'))
    order by m.name, m.id
    offset p_offset limit p_limit + 1
  ), numbered as (
    select row_number() over (order by f.name, f.id) as rn, f.* from filtered f
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'client_id', n.id, 'name', n.name, 'approval_state', n.approval_state,
      'subscription_status', n.summary->>'status',
      'refund_scope', n.summary->>'refund_scope',
      'plans_waiting_for_delivery', n.plans_waiting) order by n.rn)
      filter (where n.rn <= p_limit), '[]'::jsonb),
    count(*) > p_limit
    into rows, more
  from numbered n;
  return jsonb_build_object('status', 'ok', 'clients', rows, 'has_more', more);
end $$;

alter function app_private.f22_refund_scope(uuid, uuid) owner to postgres;
alter function app_private.f22_subscription_summary(uuid, uuid) owner to postgres;
alter function public.staff_client_directory(uuid, text, text, text, integer, integer) owner to postgres;
revoke all on function app_private.f22_refund_scope(uuid, uuid),
  app_private.f22_subscription_summary(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_client_directory(uuid, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.staff_client_directory(uuid, text, text, text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
