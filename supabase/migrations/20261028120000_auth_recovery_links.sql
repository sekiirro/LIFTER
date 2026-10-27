-- FR-006: PO and WO only; ND-F4-1 keeps Trainers denied.
create or replace function app_private.role_has_capability(r public.staff_role, cap text) returns boolean
language sql immutable security definer set search_path = '' as $$
  select coalesce(case
    when cap in ('set_package_pricing', 'record_refund', 'delete_client',
                 'export_client_dataset', 'manage_workspaces', 'manage_staff_access')
      then r = 'platform_owner'::public.staff_role
    when cap = 'generate_registration_link'
      then r in ('platform_owner', 'workspace_owner', 'sales', 'trainer')
    when cap in ('configure_installment_schedule', 'approve_registration', 'record_payment', 'manage_freeze')
      then r in ('platform_owner', 'workspace_owner', 'sales')
    when cap = 'generate_recovery_link'
      then r in ('platform_owner', 'workspace_owner')
    when cap = 'coaching_work'
      then r in ('platform_owner', 'workspace_owner', 'trainer')
    else false
  end, false);
$$;

alter function app_private.role_has_capability(public.staff_role, text) owner to postgres;
revoke execute on function app_private.role_has_capability(public.staff_role, text) from public, anon;
grant execute on function app_private.role_has_capability(public.staff_role, text) to authenticated;

-- FR-009, FR-010, FR-011: append-only attribution; no secrets are stored.
create table public.recovery_link_issuances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  target_user_id uuid not null references auth.users(id) on delete restrict,
  issued_by uuid not null references public.staff_profiles(user_id),
  issued_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index recovery_link_issuances_actor_time on public.recovery_link_issuances (issued_by, issued_at desc);
create index recovery_link_issuances_target_time on public.recovery_link_issuances (target_user_id, issued_at desc);
alter table public.recovery_link_issuances enable row level security;
alter table public.recovery_link_issuances force row level security;
revoke all on public.recovery_link_issuances from public, anon, authenticated, service_role;

create trigger recovery_link_issuances_no_update before update on public.recovery_link_issuances
  for each row execute function app_private.audit_events_immutable();
create trigger recovery_link_issuances_no_delete before delete on public.recovery_link_issuances
  for each row execute function app_private.forbid_delete();
create trigger recovery_link_issuances_no_truncate before truncate on public.recovery_link_issuances
  for each statement execute function app_private.forbid_delete();

-- FR-009: preserve all latest F5/F6 mappings and emit exactly one event per insert.
create or replace function app_private.audit_row_change() returns trigger
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
  elsif tg_table_schema = 'public' and tg_table_name = 'recovery_link_issuances' then
    if tg_op <> 'INSERT' then return new; end if;
    event_action := 'recovery_link.generated';
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('target_user_id', new.target_user_id);
  elsif tg_table_schema = 'public' and tg_table_name = 'jobs' then
    if tg_op = 'UPDATE' and new.status = 'dead' and old.status is distinct from new.status then
      event_action := 'job.dead_lettered';
      event_target := new.id;
      event_workspace := new.workspace_id;
      event_details := jsonb_build_object('kind', new.kind, 'error', new.last_error, 'attempts', new.attempts);
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

create trigger audit_recovery_link_issuances after insert on public.recovery_link_issuances
  for each row execute function app_private.audit_row_change();

-- FR-007: ND-F4-5: P1 replaces this.
create function app_private.recovery_target_workspace(target uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select null::uuid;
$$;

-- FR-010: ND-F4-4 placeholders.
create function app_private.recovery_link_limits() returns table(per_actor int, per_target int, win interval)
language sql immutable set search_path = '' as $$
  select 20, 3, interval '1 hour';
$$;

-- FR-006, FR-007, FR-010: identical denials avoid disclosing target existence.
create function app_private.recovery_link_guard(target uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ws uuid;
  limits record;
begin
  if auth.uid() is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  ws := app_private.recovery_target_workspace(target);
  if ws is null
    or not app_private.has_workspace_access(ws, 'generate_recovery_link')
    or target = auth.uid()
    or exists (select 1 from public.staff_profiles where user_id = target) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select * into limits from app_private.recovery_link_limits();
  if (select count(*) from public.recovery_link_issuances where issued_by = auth.uid() and issued_at >= now() - limits.win) >= limits.per_actor
    or (select count(*) from public.recovery_link_issuances where target_user_id = target and issued_at >= now() - limits.win) >= limits.per_target then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return ws;
end;
$$;

-- FR-007: user-JWT preflight before any privileged provider call.
create function public.recovery_link_authorize(target uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  return app_private.recovery_link_guard(target);
end;
$$;

-- FR-009, FR-010: serialize by target and actor before repeating all checks.
create function public.recovery_link_record(target uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ws uuid;
  issuance uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(target::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  ws := app_private.recovery_link_guard(target);
  insert into public.recovery_link_issuances (workspace_id, target_user_id, issued_by)
    values (ws, target, auth.uid()) returning id into issuance;
  return issuance;
end;
$$;
alter function app_private.recovery_target_workspace(uuid) owner to postgres;
revoke execute on function app_private.recovery_target_workspace(uuid) from public, anon, authenticated, service_role;
alter function app_private.recovery_link_limits() owner to postgres;
revoke execute on function app_private.recovery_link_limits() from public, anon, authenticated, service_role;
alter function app_private.recovery_link_guard(uuid) owner to postgres;
revoke execute on function app_private.recovery_link_guard(uuid) from public, anon, authenticated, service_role;
alter function public.recovery_link_authorize(uuid) owner to postgres;
revoke execute on function public.recovery_link_authorize(uuid) from public, anon, authenticated, service_role;
alter function public.recovery_link_record(uuid) owner to postgres;
revoke execute on function public.recovery_link_record(uuid) from public, anon, authenticated, service_role;
grant execute on function public.recovery_link_authorize(uuid), public.recovery_link_record(uuid) to authenticated;
