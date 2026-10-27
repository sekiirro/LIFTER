create or replace function app_private.has_workspace_access(ws uuid, cap text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and (cap is null or app_private.role_has_capability(app_private.current_staff_role(), cap))
    and (
      app_private.is_platform_owner() or (
        app_private.current_staff_role() is not null
        and exists (
          select 1 from public.workspace_memberships
          where workspace_id = ws and user_id = auth.uid() and revoked_at is null
        )
      )
    );
$$;

alter function app_private.has_workspace_access(uuid, text) owner to postgres;
revoke execute on function app_private.has_workspace_access(uuid, text) from public, anon;
grant execute on function app_private.has_workspace_access(uuid, text) to authenticated;
