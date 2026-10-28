create or replace function app_private.recovery_target_workspace(target uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.workspace_id
  from public.clients as c
  where c.auth_user_id = target;
$$;
