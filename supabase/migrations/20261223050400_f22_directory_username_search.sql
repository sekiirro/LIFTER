-- S70-PO-2: normalized username search is available to every caller within the existing coaching_work row wall.
-- Client-code match/output and assignment filter/state remain behind the existing F11 owner wall.

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
begin
  if p_workspace_id is null
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  -- F11 FR-027 / S40-PO-10 item 5 wall, the same predicate as public.unassigned_clients:
  -- only a Platform Owner or this workspace's Workspace Owner may filter by, or see,
  -- assignment. For every other caller (Trainers) p_assignment is ignored entirely.
  can_assign := actor is not null and (
    app_private.is_platform_owner()
    or exists (
      select 1
      from public.workspace_memberships m
      join public.staff_profiles p on p.user_id = m.user_id
      where m.workspace_id = p_workspace_id
        and m.user_id = actor
        and m.revoked_at is null
        and p.role = 'workspace_owner'
    )
  );
  -- T034 (#264 client code): an exact normalized code match, never a prefix or pattern, and only
  -- for the same F11 owner-or-Platform-Owner wall (as find_client_by_code). A malformed or
  -- unknown code simply matches nothing; Trainers keep name, email and phone search only.
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
      ('awaiting_activation', 'future', 'active', 'frozen', 'expired', 'refunded')) then
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
      -- Evaluated only for an authorized caller; 'unassigned' matches F11 unassigned_clients
      -- (approved and no current responsible Trainer). Non-approved clients have no state.
      case when can_assign and c.approval_state = 'approved' then
        case when app_private.current_assigned_trainer(c.workspace_id, c.id) is null
          then 'unassigned' else 'assigned' end
      end as assignment,
      (select count(*)::integer from public.plan_roots p
        where p.workspace_id = c.workspace_id and p.client_id = c.id
          and not exists (select 1 from public.plan_revisions r
            where r.workspace_id = p.workspace_id and r.plan_id = p.id)) as plans_waiting,
      -- T036: F23 food replacement requests still open (status 'open', FR-027), a count only.
      (select count(*)::integer from public.food_replacement_requests q
        where q.workspace_id = c.workspace_id and q.client_id = c.id
          and q.status = 'open') as pending_replacements
    from public.clients c
    where c.workspace_id = p_workspace_id
      and (needle is null
        or c.name ilike needle
        or c.email_normalized ilike needle
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
      'plans_waiting_for_delivery', n.plans_waiting,
      'pending_food_replacements', n.pending_replacements)
      || case when can_assign then jsonb_build_object('assignment', n.assignment,
        'client_code', n.client_code) else '{}'::jsonb end
      order by n.rn)
      filter (where n.rn <= p_limit), '[]'::jsonb),
    count(*) > p_limit
    into rows, more
  from numbered n;
  return jsonb_build_object('status', 'ok', 'clients', rows, 'has_more', more);
end $$;

alter function public.staff_client_directory(uuid, text, text, text, integer, integer, text) owner to postgres;
revoke all on function public.staff_client_directory(uuid, text, text, text, integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.staff_client_directory(uuid, text, text, text, integer, integer, text) to authenticated;
comment on function public.staff_client_directory(uuid, text, text, text, integer, integer, text) is
  'F22 P4 staff directory: coaching_work workspace wall, F11 identity and normalized username search, F11/F13 filters, F19 draft indicator; assignment filter, state, and client-code search/output only for the F11 owner-or-Platform-Owner predicate.';

notify pgrst, 'reload schema';
