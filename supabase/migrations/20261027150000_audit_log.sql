-- FR-001, FR-004: structured audit history contains only explicitly allowed data.
create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_table text not null,
  target_id uuid not null,
  workspace_id uuid references public.workspaces(id),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object')
);
alter table public.audit_events owner to postgres;
create index audit_events_workspace_occurred_at_idx
  on public.audit_events (workspace_id, occurred_at desc);

-- FR-002, FR-005: API callers can only read their authorized slice.
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
revoke all on public.audit_events from public, anon, authenticated, service_role;
grant select on public.audit_events to authenticated;
create policy audit_events_select_scoped on public.audit_events for select to authenticated
  using (app_private.is_platform_owner() or (
    workspace_id is not null
    and app_private.current_staff_role() = 'workspace_owner'::public.staff_role
    and app_private.has_workspace_access(workspace_id, null)
  ));

-- FR-002: guards apply even to postgres, independently of grants and RLS.
create function app_private.audit_events_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Audit events are immutable' using errcode = '23514';
  return null;
end;
$$;
alter function app_private.audit_events_immutable() owner to postgres;
revoke execute on function app_private.audit_events_immutable() from public, anon, authenticated, service_role;
create trigger audit_events_immutable before update or delete on public.audit_events
  for each row execute function app_private.audit_events_immutable();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function app_private.audit_events_immutable();

-- FR-003, FR-004, FR-006: extend this mapping and allow-list in a new migration
-- before attaching the AFTER INSERT OR UPDATE trigger to another table.
create function app_private.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  event_action text;
  event_target uuid;
  event_workspace uuid;
  event_details jsonb := '{}'::jsonb;
  changed jsonb := '{}'::jsonb;
begin
  if tg_table_schema = 'public' and tg_table_name = 'workspaces' then
    event_target := new.id;
    event_workspace := new.id;
    if tg_op = 'INSERT' then
      event_action := 'workspace.created';
    elsif tg_op = 'UPDATE' then
      if new.name is distinct from old.name then
        changed := changed || jsonb_build_object('name', jsonb_build_object('from', old.name, 'to', new.name));
      end if;
      if new.slug is distinct from old.slug then
        changed := changed || jsonb_build_object('slug', jsonb_build_object('from', old.slug, 'to', new.slug));
      end if;
      if changed = '{}'::jsonb then return new; end if;
      event_action := 'workspace.updated';
      event_details := jsonb_build_object('changed', changed);
    end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'staff_profiles' then
    event_target := new.user_id;
    if tg_op = 'INSERT' then
      event_action := 'staff_role.assigned';
      event_details := jsonb_build_object('role', new.role);
    elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
      event_action := 'staff_role.changed';
      event_details := jsonb_build_object('from', old.role, 'to', new.role);
    else
      return new;
    end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'workspace_memberships' then
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('user_id', new.user_id);
    if tg_op = 'INSERT' then
      event_action := 'membership.granted';
    elsif tg_op = 'UPDATE' and old.revoked_at is null and new.revoked_at is not null then
      event_action := 'membership.revoked';
    else
      return new;
    end if;
  else
    raise exception 'No audit mapping for %.%', tg_table_schema, tg_table_name;
  end if;

  insert into public.audit_events (actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), event_action, tg_table_name, event_target, event_workspace, event_details);
  return new;
end;
$$;
alter function app_private.audit_row_change() owner to postgres;
revoke execute on function app_private.audit_row_change() from public, anon, authenticated, service_role;

-- FR-003: AFTER sees final guarded values; audit insertion shares the source transaction.
create trigger audit_workspaces after insert or update on public.workspaces
  for each row execute function app_private.audit_row_change();
create trigger audit_staff_profiles after insert or update on public.staff_profiles
  for each row execute function app_private.audit_row_change();
create trigger audit_workspace_memberships after insert or update on public.workspace_memberships
  for each row execute function app_private.audit_row_change();
