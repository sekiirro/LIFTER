-- F23 (spec 023) T028 / FR-016: client measurements follow the F13 plan-access rule on expiry AND
-- overdue. The entitlement half (active or frozen) already existed; the overdue half now consumes
-- F13's independent overdue input (app_private.f13_client_overdue_state, migration
-- 20261125020000). Overdue is read, never recomputed here, and staff access is unchanged.
-- Every caller of this predicate (RLS policy, record/update/correct RPCs, client_self_progress,
-- the client timeline restriction flag) inherits the restriction without a code change.
create or replace function app_private.f23_client_progress_visible(p_workspace_id uuid, p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.client_has_access(p_workspace_id, p_client_id) and exists (
    select 1 from public.subscriptions s
    cross join lateral app_private.f13_project_entitlement(s.workspace_id, s.id,
      (statement_timestamp() at time zone 'Africa/Cairo')::date) as e(value)
    where s.workspace_id = p_workspace_id and s.client_id = p_client_id
      and e.value->>'status' in ('active','frozen'))
  and not coalesce((
    case when exists (select 1 from public.clients c where c.workspace_id = p_workspace_id and c.id = p_client_id)
      then (app_private.f13_client_overdue_state(p_workspace_id, p_client_id,
        (statement_timestamp() at time zone 'Africa/Cairo')::date)->>'overdue')::boolean
    end), false)
$$;
