-- F22 (P4) client portal read boundary and staff client directory.
-- Composes existing F11 client identity, F13 entitlement projection and F19
-- plan_deliveries/plan_revisions. Adds no table, status, lifecycle rule,
-- delivery entity or activation writer (F19 T021 remains F19-owned).

-- The authenticated, approved and not deactivated client row (F11/F13 wall).
create function app_private.f22_portal_client()
returns table(workspace_id uuid, client_id uuid)
language sql stable security definer set search_path = '' as $$
  select c.workspace_id, c.id
  from public.clients c
  where auth.uid() is not null
    and c.auth_user_id = auth.uid()
    and c.approval_state = 'approved'
    and c.deactivated_at is null
$$;

-- F13 authoritative subscription summary for one client. Returns null (fail
-- closed) unless exactly one continuous subscription is resolvable: the single
-- active/frozen one, otherwise the client's only resolved subscription.
create function app_private.f22_subscription_summary(p_workspace_id uuid, p_client_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
  current_count integer;
  resolved_count integer;
  chosen uuid;
  projection jsonb;
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
  return jsonb_build_object(
    'subscription_id', chosen,
    'status', projection->>'status',
    'effective_end_exclusive', projection->>'effective_end_exclusive');
end $$;

-- Client dashboard: delivered plans (latest delivered revision per stable plan)
-- plus subscription status/end date. F13-FR-028: only `active` grants plan
-- access; every other projected state returns the restricted projection.
create function public.client_portal_overview()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  client_row record;
  summary jsonb;
  plans jsonb;
begin
  select * into client_row from app_private.f22_portal_client();
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  summary := app_private.f22_subscription_summary(client_row.workspace_id, client_row.client_id);
  if summary is null then return jsonb_build_object('status', 'invalid'); end if;
  if summary->>'status' is distinct from 'active' then
    return jsonb_build_object('status', 'restricted',
      'subscription', summary - 'subscription_id');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'plan_id', x.plan_id, 'plan_kind', x.plan_kind,
      'revision_number', x.revision_number, 'published_at', x.published_at)
      order by x.plan_kind, x.published_at desc, x.plan_id), '[]'::jsonb)
    into plans
  from (
    select distinct on (d.plan_id) d.plan_id, d.plan_kind, r.revision_number, r.published_at
    from public.plan_deliveries d
    join public.plan_revisions r
      on r.workspace_id = d.workspace_id and r.plan_id = d.plan_id and r.id = d.revision_id
    where d.workspace_id = client_row.workspace_id
      and d.client_id = client_row.client_id
      and app_private.f19_resolve_subscription_id(d.workspace_id, d.subscription_id)
        = (summary->>'subscription_id')::uuid
    order by d.plan_id, r.revision_number desc
  ) x;
  return jsonb_build_object('status', 'ok',
    'subscription', summary - 'subscription_id', 'plans', plans);
end $$;

-- Delivered revisions of one plan for one client under its resolved subscription.
create function app_private.f22_delivered_revisions(
  p_workspace_id uuid, p_client_id uuid, p_plan_id uuid, p_subscription_id uuid
) returns table(plan_kind text, revision_number bigint, published_at timestamptz, content jsonb)
language sql stable security definer set search_path = '' as $$
  select distinct d.plan_kind, r.revision_number, r.published_at, r.content
  from public.plan_deliveries d
  join public.plan_revisions r
    on r.workspace_id = d.workspace_id and r.plan_id = d.plan_id and r.id = d.revision_id
  where d.workspace_id = p_workspace_id
    and d.client_id = p_client_id
    and d.plan_id = p_plan_id
    and app_private.f19_resolve_subscription_id(d.workspace_id, d.subscription_id) = p_subscription_id
$$;

-- One own delivered plan at a selected delivered revision (latest by default).
-- Foreign, draft-only, undelivered or unknown targets share one `not_found`.
create function public.client_portal_plan(p_plan_id uuid, p_revision_number integer default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  client_row record;
  summary jsonb;
  revisions jsonb;
  selected record;
begin
  select * into client_row from app_private.f22_portal_client();
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  summary := app_private.f22_subscription_summary(client_row.workspace_id, client_row.client_id);
  if summary is null then return jsonb_build_object('status', 'invalid'); end if;
  if summary->>'status' is distinct from 'active' then
    return jsonb_build_object('status', 'restricted',
      'subscription', summary - 'subscription_id');
  end if;
  if p_plan_id is null or (p_revision_number is not null and p_revision_number < 1) then
    return jsonb_build_object('status', 'not_found');
  end if;
  select v.* into selected
  from app_private.f22_delivered_revisions(client_row.workspace_id, client_row.client_id,
    p_plan_id, (summary->>'subscription_id')::uuid) v
  where p_revision_number is null or v.revision_number = p_revision_number
  order by v.revision_number desc limit 1;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'revision_number', v.revision_number, 'published_at', v.published_at)
      order by v.revision_number desc), '[]'::jsonb)
    into revisions
  from app_private.f22_delivered_revisions(client_row.workspace_id, client_row.client_id,
    p_plan_id, (summary->>'subscription_id')::uuid) v;
  return jsonb_build_object('status', 'ok',
    'subscription', summary - 'subscription_id',
    'plan', jsonb_build_object('plan_id', p_plan_id, 'plan_kind', selected.plan_kind,
      'revision_number', selected.revision_number, 'published_at', selected.published_at,
      'content', selected.content),
    'revisions', revisions);
end $$;

-- Staff directory over F11 identity fields with existing F11 approval and F13
-- subscription filters and the F19 readiness=draft indicator. Workspace
-- authorization uses the existing coaching_work wall (F20 Client Details).
create function public.staff_client_directory(
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
      app_private.f22_subscription_summary(c.workspace_id, c.id)->>'status' as subscription_status,
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
    where p_subscription_status is null or m.subscription_status = p_subscription_status
    order by m.name, m.id
    offset p_offset limit p_limit + 1
  ), numbered as (
    select row_number() over (order by f.name, f.id) as rn, f.* from filtered f
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'client_id', n.id, 'name', n.name, 'approval_state', n.approval_state,
      'subscription_status', n.subscription_status,
      'plans_waiting_for_delivery', n.plans_waiting) order by n.rn)
      filter (where n.rn <= p_limit), '[]'::jsonb),
    count(*) > p_limit
    into rows, more
  from numbered n;
  return jsonb_build_object('status', 'ok', 'clients', rows, 'has_more', more);
end $$;

alter function app_private.f22_portal_client() owner to postgres;
alter function app_private.f22_subscription_summary(uuid, uuid) owner to postgres;
alter function app_private.f22_delivered_revisions(uuid, uuid, uuid, uuid) owner to postgres;
alter function public.client_portal_overview() owner to postgres;
alter function public.client_portal_plan(uuid, integer) owner to postgres;
alter function public.staff_client_directory(uuid, text, text, text, integer, integer) owner to postgres;
revoke all on function app_private.f22_portal_client(), app_private.f22_subscription_summary(uuid, uuid),
  app_private.f22_delivered_revisions(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.client_portal_overview(), public.client_portal_plan(uuid, integer),
  public.staff_client_directory(uuid, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.client_portal_overview() to authenticated;
grant execute on function public.client_portal_plan(uuid, integer) to authenticated;
grant execute on function public.staff_client_directory(uuid, text, text, text, integer, integer) to authenticated;
comment on function public.client_portal_overview() is
  'F22 P4 client self-read: delivered plans and F13 status/end date; restricted unless F13 projects active.';
comment on function public.client_portal_plan(uuid, integer) is
  'F22 P4 client self-read of one own delivered plan at a delivered revision; restricted unless F13 projects active.';
comment on function public.staff_client_directory(uuid, text, text, text, integer, integer) is
  'F22 P4 staff directory: coaching_work workspace wall, F11 identity search, F11/F13 filters, F19 draft indicator.';

notify pgrst, 'reload schema';
