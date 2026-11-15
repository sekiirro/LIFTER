-- F11 S57-R2 B1: serialize manual assignment and Trainer departures per workspace.
-- Lock order for manual assignment: workspace advisory lock, clients row, then the
-- current assignment row. F19 activation and override keep their clients-row lock;
-- they do not acquire this workspace advisory key, so the shared client row remains
-- the mutual serialization point without a lock cycle.

create or replace function public.assign_client_responsible_trainer(
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

  -- All F11 assignment writers and departures use this transaction-scoped workspace key.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('f11.responsible_trainer.workspace:' || p_workspace_id::text, 0)
  );
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

create or replace function app_private.end_assignments_on_membership_revocation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Lock before examining the revocation transition or touching assignment history.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('f11.responsible_trainer.workspace:' || new.workspace_id::text, 0)
  );
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

create or replace function app_private.end_assignments_on_trainer_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lock_workspace uuid;
begin
  -- The set includes historical memberships and active rows so every affected workspace is covered.
  -- Acquire every workspace key before assignment reads/writes, in ascending UUID order.
  for lock_workspace in
    select affected.workspace_id from (
      select m.workspace_id from public.workspace_memberships m where m.user_id = new.user_id
      union
      select a.workspace_id from public.client_trainer_assignments a
        where a.trainer_user_id = new.user_id and a.ended_at is null
    ) affected
    order by affected.workspace_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('f11.responsible_trainer.workspace:' || lock_workspace::text, 0)
    );
  end loop;

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
