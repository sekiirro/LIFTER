-- F23 (spec 023) US4/US3: the curated client timeline now also projects the replacement request
-- lifecycle facts (FR-029): open, approved, rejected and stale-closed. A client cancellation is not
-- one of the fixed meaningful events and is not projected. Projection only: no table, no extra audit row.
-- Still not sourced: trainerChange (F11 current_assigned_trainer is deferred).

create or replace function public.client_progress_timeline(p_workspace_id uuid, p_client_id uuid)
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
    union all
    select 'replacementOpen', q.created_at, q.id, null, 7
    from public.food_replacement_requests q
    where q.workspace_id = p_workspace_id and q.client_id = p_client_id
    union all
    select 'replacementApproved', q.resolved_at, q.id, null, 8
    from public.food_replacement_requests q
    where q.workspace_id = p_workspace_id and q.client_id = p_client_id and q.status = 'approved'
    union all
    select 'replacementRejected', q.resolved_at, q.id, null, 9
    from public.food_replacement_requests q
    where q.workspace_id = p_workspace_id and q.client_id = p_client_id and q.status = 'rejected'
    union all
    select 'replacementStale', q.resolved_at, q.id, null, 10
    from public.food_replacement_requests q
    where q.workspace_id = p_workspace_id and q.client_id = p_client_id and q.status = 'stale_closed'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'event_type', ev.event_type, 'occurred_at', ev.occurred_at, 'reference_id', ev.reference_id,
      'plan_kind', ev.detail)
    order by ev.occurred_at, ev.rank, ev.reference_id), '[]'::jsonb)
  into v_events from events ev;
  return jsonb_build_object('status', 'ok', 'events', v_events);
end $$;
