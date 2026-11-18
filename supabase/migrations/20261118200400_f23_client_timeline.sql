-- F23 (spec 023) US4: curated client timeline (FR-029..FR-033).
-- A read-only projection over existing immutable F12/F13/F15/F19 facts: no timeline table,
-- no duplicated audit rows, and no new retention rule (FR-031/FR-033).
-- Not yet sourced (no upstream fact on main): trainerChange, replacement* (US3 blocked).

create function public.client_progress_timeline(p_workspace_id uuid, p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_events jsonb;
begin
  if auth.uid() is null or p_workspace_id is null or p_client_id is null then
    return '{"status":"not_found"}'::jsonb;
  end if;
  -- FR-030: the client (own) or trainers/workspace owners/platform owners (coaching_work); Sales denied.
  if not app_private.client_has_access(p_workspace_id, p_client_id)
    and not (app_private.has_workspace_access(p_workspace_id, 'coaching_work')
      and exists (select 1 from public.clients c where c.workspace_id = p_workspace_id and c.id = p_client_id)) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  with events(event_type, occurred_at, reference_id, detail, rank) as (
    select 'registration', e.approved_at, e.id, null::text, 1
    from app_private.registration_approval_events e
    where e.workspace_id = p_workspace_id and e.client_id = p_client_id
    union all
    select 'renewal', r.recorded_at, r.id, null, 2
    from public.subscription_renewals r
    where r.workspace_id = p_workspace_id and r.client_id = p_client_id
    union all
    select 'firstDelivery', d.delivered_at, d.id, d.plan_kind, 3
    from (select distinct on (x.plan_kind) x.* from public.plan_deliveries x
      where x.workspace_id = p_workspace_id and x.client_id = p_client_id
      order by x.plan_kind, x.delivered_at, x.id) d
    union all
    select 'freezeApply', f.recorded_at, f.id, null, 4
    from public.subscription_freezes f
    join public.subscriptions s on s.workspace_id = f.workspace_id and s.id = f.subscription_id
    where f.workspace_id = p_workspace_id and s.client_id = p_client_id
    union all
    select 'freezeRemove', fe.recorded_at, fe.id, null, 5
    from public.subscription_freeze_events fe
    join public.subscriptions s on s.workspace_id = fe.workspace_id and s.id = fe.subscription_id
    where fe.workspace_id = p_workspace_id and s.client_id = p_client_id and fe.kind = 'remove'
    union all
    select 'closure', o.recorded_at, o.id, null, 6
    from app_private.client_closure_operations o
    where o.workspace_id = p_workspace_id and o.client_id = p_client_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'event_type', ev.event_type, 'occurred_at', ev.occurred_at, 'reference_id', ev.reference_id,
      'plan_kind', ev.detail)
    order by ev.occurred_at, ev.rank, ev.reference_id), '[]'::jsonb)
  into v_events from events ev;
  return jsonb_build_object('status', 'ok', 'events', v_events);
end $$;

alter function public.client_progress_timeline(uuid, uuid) owner to postgres;
revoke all on function public.client_progress_timeline(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.client_progress_timeline(uuid, uuid) to authenticated;

-- Client self surface: resolves the signed-in client's own workspace/client id, then reuses
-- the walls above (client_has_access, F13 plan-access rule for measurements).
create function public.client_self_progress() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare client_row public.clients%rowtype; matches integer; v_measurements jsonb; v_timeline jsonb;
begin
  if auth.uid() is null then return '{"status":"not_found"}'::jsonb; end if;
  select count(*)::integer into matches from public.clients c
  where c.auth_user_id = auth.uid() and c.approval_state = 'approved' and c.deactivated_at is null;
  if matches <> 1 then raise exception 'not_permitted' using errcode = '42501'; end if;
  select c.* into client_row from public.clients c
  where c.auth_user_id = auth.uid() and c.approval_state = 'approved' and c.deactivated_at is null;
  -- FR-016: measurements only while the F13 plan-access rule allows; the timeline stays visible.
  if app_private.f23_client_progress_visible(client_row.workspace_id, client_row.id) then
    v_measurements := public.list_progress_measurements(client_row.workspace_id, client_row.id);
  else
    v_measurements := '{"status":"restricted"}'::jsonb;
  end if;
  v_timeline := public.client_progress_timeline(client_row.workspace_id, client_row.id);
  return jsonb_build_object('status', 'ok',
    'measurements_status', v_measurements->>'status',
    'measurements', coalesce(v_measurements->'measurements', '[]'::jsonb),
    'timeline', coalesce(v_timeline->'events', '[]'::jsonb));
end $$;
alter function public.client_self_progress() owner to postgres;
revoke all on function public.client_self_progress() from public, anon, authenticated, service_role;
grant execute on function public.client_self_progress() to authenticated;
