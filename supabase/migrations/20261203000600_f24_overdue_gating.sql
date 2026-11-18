-- F24 S66-PO-2 (PO ruling): an overdue client (F13 FR-028 input, reused as
-- app_private.f13_client_overdue_state; no new overdue logic) is not rankable,
-- is hidden from the public Top 5, and does not see the Top 5 or the private
-- rank (treated like a restricted client). Forward-only; every function keeps
-- its signature, owner and grants (create or replace).

-- Facts gain `overdue` so the PO pool and the database walls agree.
create or replace function app_private.f24_eligibility_facts(ws uuid, cid uuid, as_of date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.clients%rowtype; sid uuid; projected text; days integer := 0;
begin
  select * into c from public.clients x where x.workspace_id=ws and x.id=cid;
  if not found then return null; end if;
  sid := app_private.f24_initial_subscription(ws, cid);
  if sid is not null then
    projected := app_private.f13_project_entitlement(ws, sid, as_of)->>'status';
    if projected = 'active' then days := app_private.f24_active_days(ws, sid, as_of, 14); end if;
  end if;
  return jsonb_build_object(
    'client_id', c.id,
    'entitlement_status', projected,
    'active_days', days,
    'opted_out', exists(select 1 from public.client_leaderboard_opt_outs o
      where o.workspace_id=ws and o.client_id=cid),
    'has_username', coalesce(c.username_normalized ~ '^[a-z0-9_.]{3,20}$', false),
    'goal_type', (select g.goal_type from public.client_goal_types g
      where g.workspace_id=ws and g.client_id=cid),
    'registration_approved_at', (select min(e.approved_at) from app_private.registration_approval_events e
      where e.workspace_id=ws and e.client_id=cid),
    'overdue', coalesce((app_private.f13_client_overdue_state(ws, cid, as_of)->>'overdue')::boolean, false));
end $$;

-- Rankable: eligible apart from the opt-out AND not overdue. f24_client_eligible
-- delegates to this function, so the notice, self state, candidate creation
-- and the private rank all inherit the overdue wall.
create or replace function app_private.f24_client_rankable(ws uuid, cid uuid, as_of date) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((
    select c.approval_state='approved' and c.deactivated_at is null
      and f.facts->>'entitlement_status' = 'active'
      and (f.facts->>'active_days')::integer >= 14
      and (f.facts->>'has_username')::boolean
      and f.facts->>'goal_type' is not null
      and not (f.facts->>'overdue')::boolean
    from public.clients c
    cross join lateral (select app_private.f24_eligibility_facts(ws, cid, as_of) as facts) f
    where c.workspace_id=ws and c.id=cid), false)
$$;

-- Public visibility: an overdue client is not public.
create or replace function app_private.f24_visible_username(ws uuid, cid uuid) returns text
language sql stable security definer set search_path='' as $$
  select c.username_normalized from public.clients c
  where c.workspace_id=ws and c.id=cid
    and c.approval_state='approved' and c.deactivated_at is null
    and c.username_normalized ~ '^[a-z0-9_.]{3,20}$'
    and not exists(select 1 from public.client_leaderboard_opt_outs o
      where o.workspace_id=ws and o.client_id=cid)
    and not coalesce((app_private.f13_client_overdue_state(c.workspace_id, c.id, app_private.f24_cairo_today())->>'overdue')::boolean, false)
$$;

-- Client viewer: an overdue client does not see the Top 5 (restricted).
create or replace function public.client_leaderboard_read() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.clients%rowtype;
begin
  if auth.uid() is null then return '{"status":"not_permitted"}'::jsonb; end if;
  select * into c from public.clients x
    where x.auth_user_id=auth.uid() and x.approval_state='approved' and x.deactivated_at is null;
  if not found then return '{"status":"not_permitted"}'::jsonb; end if;
  if coalesce((app_private.f13_client_overdue_state(c.workspace_id, c.id, app_private.f24_cairo_today())->>'overdue')::boolean, false)
  then return '{"status":"not_permitted"}'::jsonb; end if;
  return app_private.f24_current_view(c.workspace_id);
end $$;
