-- F11 S56: one authoritative manual responsible-Trainer assignment per client.
create table public.client_trainer_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  trainer_user_id uuid not null,
  assignment_source text not null default 'po_manual' check (assignment_source = 'po_manual'),
  assigned_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  assigned_at timestamptz not null default statement_timestamp(),
  workspace_membership_id uuid not null,
  ended_at timestamptz,
  ended_by uuid references public.staff_profiles(user_id) on delete restrict,
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete restrict,
  foreign key (workspace_id, workspace_membership_id) references public.workspace_memberships(workspace_id, id) on delete restrict,
  check ((ended_at is null) = (ended_by is null))
);
create unique index client_trainer_assignments_one_current
  on public.client_trainer_assignments(workspace_id, client_id) where ended_at is null;
create index client_trainer_assignments_client_history
  on public.client_trainer_assignments(workspace_id, client_id, assigned_at desc);
alter table public.client_trainer_assignments owner to postgres;
alter table public.client_trainer_assignments enable row level security;
alter table public.client_trainer_assignments force row level security;
revoke all on public.client_trainer_assignments from public, anon, authenticated, service_role;
grant select on public.client_trainer_assignments to authenticated;
create policy client_trainer_assignments_select_workspace_owner
  on public.client_trainer_assignments for select to authenticated
  using (app_private.is_platform_owner() or exists (
    select 1 from public.workspace_memberships m join public.staff_profiles p on p.user_id = m.user_id
    where m.workspace_id = client_trainer_assignments.workspace_id and m.user_id = auth.uid()
      and m.revoked_at is null and p.role = 'workspace_owner'::public.staff_role
  ));

create function app_private.guard_client_trainer_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and (
      new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id
      or new.client_id is distinct from old.client_id or new.trainer_user_id is distinct from old.trainer_user_id
      or new.assignment_source is distinct from old.assignment_source or new.assigned_by is distinct from old.assigned_by
      or new.assigned_at is distinct from old.assigned_at
      or new.workspace_membership_id is distinct from old.workspace_membership_id
      or old.ended_at is not null or new.ended_at is null or new.ended_by is null)) then
    raise exception 'client_trainer_assignment_immutable' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.ended_at := coalesce(new.ended_at, statement_timestamp());
  end if;
  return new;
end $$;
alter function app_private.guard_client_trainer_assignment() owner to postgres;
revoke all on function app_private.guard_client_trainer_assignment() from public, anon, authenticated, service_role;
create trigger client_trainer_assignments_immutable
  before update or delete on public.client_trainer_assignments
  for each row execute function app_private.guard_client_trainer_assignment();
create function app_private.guard_client_trainer_assignment_truncate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin raise exception 'client_trainer_assignment_immutable' using errcode = '23514'; end $$;
alter function app_private.guard_client_trainer_assignment_truncate() owner to postgres;
revoke all on function app_private.guard_client_trainer_assignment_truncate() from public, anon, authenticated, service_role;
create trigger client_trainer_assignments_no_truncate before truncate on public.client_trainer_assignments
  for each statement execute function app_private.guard_client_trainer_assignment_truncate();

create or replace function app_private.current_assigned_trainer(p_workspace_id uuid, p_client_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select a.trainer_user_id
  from public.client_trainer_assignments a
  join public.workspace_memberships m on m.workspace_id = a.workspace_id
    and m.id = a.workspace_membership_id and m.user_id = a.trainer_user_id and m.revoked_at is null
  join public.staff_profiles p on p.user_id = a.trainer_user_id and p.role = 'trainer'::public.staff_role
  where a.workspace_id = p_workspace_id and a.client_id = p_client_id and a.ended_at is null
  order by a.assigned_at desc, a.id desc limit 1
$$;
alter function app_private.current_assigned_trainer(uuid, uuid) owner to postgres;
revoke all on function app_private.current_assigned_trainer(uuid, uuid) from public, anon, authenticated, service_role;

create function app_private.end_client_trainer_assignments(p_workspace_id uuid, p_user_id uuid, p_ended_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.client_trainer_assignments a
  set ended_at = statement_timestamp(), ended_by = p_ended_by
  where a.workspace_id = p_workspace_id and a.trainer_user_id = p_user_id and a.ended_at is null;
end $$;
alter function app_private.end_client_trainer_assignments(uuid, uuid, uuid) owner to postgres;
revoke all on function app_private.end_client_trainer_assignments(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create function app_private.end_assignments_on_membership_revocation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.revoked_at is null and new.revoked_at is not null then
    perform 1 from public.clients c join public.client_trainer_assignments a
      on a.workspace_id = c.workspace_id and a.client_id = c.id
      where a.workspace_id = new.workspace_id and a.trainer_user_id = new.user_id and a.ended_at is null
      order by c.id for update of c;
    perform app_private.end_client_trainer_assignments(new.workspace_id, new.user_id, new.revoked_by);
  end if;
  return new;
end $$;
alter function app_private.end_assignments_on_membership_revocation() owner to postgres;
revoke all on function app_private.end_assignments_on_membership_revocation() from public, anon, authenticated, service_role;
create trigger memberships_end_trainer_assignments after update on public.workspace_memberships
  for each row execute function app_private.end_assignments_on_membership_revocation();

create function app_private.end_assignments_on_trainer_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'trainer'::public.staff_role and new.role <> 'trainer'::public.staff_role then
    perform 1 from public.clients c join public.client_trainer_assignments a
      on a.workspace_id = c.workspace_id and a.client_id = c.id
      where a.trainer_user_id = new.user_id and a.ended_at is null
      order by c.workspace_id, c.id for update of c;
    update public.client_trainer_assignments a
    set ended_at = statement_timestamp(), ended_by = auth.uid()
    where a.trainer_user_id = new.user_id and a.ended_at is null;
  end if;
  return new;
end $$;
alter function app_private.end_assignments_on_trainer_role_change() owner to postgres;
revoke all on function app_private.end_assignments_on_trainer_role_change() from public, anon, authenticated, service_role;
create trigger staff_profiles_end_trainer_assignments after update of role on public.staff_profiles
  for each row execute function app_private.end_assignments_on_trainer_role_change();

create function public.assign_client_responsible_trainer(
  p_workspace_id uuid, p_client_id uuid, p_trainer_user_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); client_row public.clients%rowtype; membership_id uuid; current_row public.client_trainer_assignments%rowtype;
begin
  if actor is null or not app_private.has_workspace_access(p_workspace_id, 'manage_staff_access') then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  if p_workspace_id is null or p_client_id is null or p_trainer_user_id is null then
    return jsonb_build_object('status', 'invalid_input');
  end if;
  select * into client_row from public.clients c
    where c.workspace_id = p_workspace_id and c.id = p_client_id for update;
  if not found or not app_private.has_workspace_access(p_workspace_id, 'manage_staff_access') then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  if client_row.approval_state <> 'approved' then return jsonb_build_object('status', 'not_permitted'); end if;
  select m.id into membership_id from public.workspace_memberships m
    join public.staff_profiles p on p.user_id = m.user_id and p.role = 'trainer'::public.staff_role
    where m.workspace_id = p_workspace_id and m.user_id = p_trainer_user_id and m.revoked_at is null;
  if membership_id is null then return jsonb_build_object('status', 'not_permitted'); end if;
  select * into current_row from public.client_trainer_assignments a
    where a.workspace_id = p_workspace_id and a.client_id = p_client_id and a.ended_at is null for update;
  if found and current_row.trainer_user_id = p_trainer_user_id then
    return jsonb_build_object('status', 'ok', 'assignment_id', current_row.id);
  end if;
  if found then
    update public.client_trainer_assignments set ended_at = statement_timestamp(), ended_by = actor
      where id = current_row.id;
  end if;
  insert into public.client_trainer_assignments(workspace_id, client_id, trainer_user_id, assigned_by, workspace_membership_id)
    values(p_workspace_id, p_client_id, p_trainer_user_id, actor, membership_id) returning * into current_row;
  return jsonb_build_object('status', 'ok', 'assignment_id', current_row.id);
end $$;
alter function public.assign_client_responsible_trainer(uuid, uuid, uuid) owner to postgres;
revoke all on function public.assign_client_responsible_trainer(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.assign_client_responsible_trainer(uuid, uuid, uuid) to authenticated;

create function public.client_responsible_trainer(p_workspace_id uuid, p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); trainer_id uuid;
begin
  if actor is null or not (app_private.is_platform_owner() or exists (
    select 1 from public.workspace_memberships m join public.staff_profiles p on p.user_id = m.user_id
    where m.workspace_id = p_workspace_id and m.user_id = actor and m.revoked_at is null and p.role = 'workspace_owner'
  )) then return jsonb_build_object('status', 'not_permitted'); end if;
  if p_workspace_id is null or p_client_id is null then return jsonb_build_object('status', 'invalid_input'); end if;
  if not exists(select 1 from public.clients c where c.workspace_id = p_workspace_id and c.id = p_client_id) then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  trainer_id := app_private.current_assigned_trainer(p_workspace_id, p_client_id);
  return jsonb_build_object('status', 'ok', 'trainer_user_id', trainer_id);
end $$;
alter function public.client_responsible_trainer(uuid, uuid) owner to postgres;
revoke all on function public.client_responsible_trainer(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.client_responsible_trainer(uuid, uuid) to authenticated;

create function public.unassigned_clients(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); clients jsonb;
begin
  if actor is null or not (app_private.is_platform_owner() or exists (
    select 1 from public.workspace_memberships m join public.staff_profiles p on p.user_id = m.user_id
    where m.workspace_id = p_workspace_id and m.user_id = actor and m.revoked_at is null and p.role = 'workspace_owner'
  )) then return jsonb_build_object('status', 'not_permitted'); end if;
  if p_workspace_id is null then return jsonb_build_object('status', 'invalid_input'); end if;
  select coalesce(jsonb_agg(c.id order by c.id), '[]'::jsonb) into clients
    from public.clients c where c.workspace_id = p_workspace_id and c.approval_state = 'approved'
      and app_private.current_assigned_trainer(c.workspace_id, c.id) is null;
  return jsonb_build_object('status', 'ok', 'client_ids', clients);
end $$;
alter function public.unassigned_clients(uuid) owner to postgres;
revoke all on function public.unassigned_clients(uuid) from public, anon, authenticated, service_role;
grant execute on function public.unassigned_clients(uuid) to authenticated;

comment on table public.client_trainer_assignments is 'F11 authoritative append-only current responsible-Trainer assignments; assignment conveys no client access.';
comment on function app_private.current_assigned_trainer(uuid, uuid) is 'F19 recipient seam: current active same-workspace Trainer assignment, or NULL.';
