-- Any platform owner may edit workspace details; attribution stays immutable.
drop policy workspaces_update_po on public.workspaces;
create policy workspaces_update_po on public.workspaces for update to authenticated
  using (app_private.is_platform_owner())
  with check (app_private.is_platform_owner());

revoke update on public.workspaces from authenticated;
grant update (name, slug) on public.workspaces to authenticated;
