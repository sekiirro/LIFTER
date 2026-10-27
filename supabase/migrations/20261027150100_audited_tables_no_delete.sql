-- Preserve governance rows and the history that refers to them, even for owners.
create function app_private.forbid_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Deletes are not allowed on audited governance tables' using errcode = '23514';
  return null;
end;
$$;
alter function app_private.forbid_delete() owner to postgres;
revoke execute on function app_private.forbid_delete() from public, anon, authenticated, service_role;

create trigger workspaces_no_delete before delete on public.workspaces
  for each row execute function app_private.forbid_delete();
create trigger workspaces_no_truncate before truncate on public.workspaces
  for each statement execute function app_private.forbid_delete();

create trigger staff_profiles_no_delete before delete on public.staff_profiles
  for each row execute function app_private.forbid_delete();
create trigger staff_profiles_no_truncate before truncate on public.staff_profiles
  for each statement execute function app_private.forbid_delete();

create trigger workspace_memberships_no_delete before delete on public.workspace_memberships
  for each row execute function app_private.forbid_delete();
create trigger workspace_memberships_no_truncate before truncate on public.workspace_memberships
  for each statement execute function app_private.forbid_delete();
