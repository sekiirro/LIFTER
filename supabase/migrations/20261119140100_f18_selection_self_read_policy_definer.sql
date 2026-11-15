-- F18 T010: Use SECURITY DEFINER helpers for client self-read RLS policies so authenticated queries never touch public.clients directly.

create function app_private.f18_is_self_approved_client(
  p_workspace_id uuid,
  p_client_id uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.clients c
    where c.workspace_id = p_workspace_id
      and c.id = p_client_id
      and c.auth_user_id = (select auth.uid())
      and c.approval_state = 'approved'
  );
$$;

alter function app_private.f18_is_self_approved_client(uuid, uuid) owner to postgres;
revoke all on function app_private.f18_is_self_approved_client(uuid, uuid)
  from public, anon, service_role;
grant execute on function app_private.f18_is_self_approved_client(uuid, uuid)
  to authenticated;

create function app_private.f18_is_self_approved_plan_client(
  p_workspace_id uuid,
  p_plan_id uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.plan_roots p
    join public.clients c
      on c.workspace_id = p.workspace_id
     and c.id = p.client_id
    where p.workspace_id = p_workspace_id
      and p.id = p_plan_id
      and c.auth_user_id = (select auth.uid())
      and c.approval_state = 'approved'
  );
$$;

alter function app_private.f18_is_self_approved_plan_client(uuid, uuid) owner to postgres;
revoke all on function app_private.f18_is_self_approved_plan_client(uuid, uuid)
  from public, anon, service_role;
grant execute on function app_private.f18_is_self_approved_plan_client(uuid, uuid)
  to authenticated;

drop policy client_nutrition_selections_self_read on public.client_nutrition_alternative_selections;
create policy client_nutrition_selections_self_read
  on public.client_nutrition_alternative_selections
  for select to authenticated
  using ((select app_private.f18_is_self_approved_client(workspace_id, client_id)));

drop policy client_nutrition_selection_counters_self_read on public.client_nutrition_selection_revision_counters;
create policy client_nutrition_selection_counters_self_read
  on public.client_nutrition_selection_revision_counters
  for select to authenticated
  using ((select app_private.f18_is_self_approved_plan_client(workspace_id, plan_id)));
