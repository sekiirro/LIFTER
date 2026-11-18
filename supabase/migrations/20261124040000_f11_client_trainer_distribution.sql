-- T062: durable leased approval distribution through the existing jobs worker.
alter table public.jobs
  add column outcome text,
  add column completed_at timestamptz,
  add constraint jobs_distribution_outcome_check check (
    outcome is null or outcome in (
      'assigned', 'no_eligible', 'no_op_client_not_approved',
      'no_op_active_assignment_exists', 'no_op_po_override_exists'
    )
  ),
  add constraint jobs_distribution_completion_check check (
    (outcome is null) = (completed_at is null)
  );

alter table public.client_trainer_assignments
  drop constraint client_trainer_assignments_assignment_source_check,
  alter column assigned_by drop not null,
  add column source_approval_id uuid,
  add column source_deletion_intent_id uuid,
  add column ended_by_system boolean not null default false,
  add constraint client_trainer_assignments_source_check check (
    (assignment_source = 'po_manual' and assigned_by is not null
      and source_approval_id is null and source_deletion_intent_id is null)
    or (assignment_source = 'system_distribution' and assigned_by is null
      and source_approval_id is not null and source_deletion_intent_id is null)
    or (assignment_source = 'trainer_deletion' and assigned_by is null
      and source_approval_id is null and source_deletion_intent_id is not null)
  ),
  add constraint client_trainer_assignments_end_actor_check check (
    (ended_at is null and ended_by is null and not ended_by_system)
    or (ended_at is not null and ((ended_by is not null) <> ended_by_system))
  ),
  add foreign key (workspace_id, source_approval_id)
    references app_private.registration_approval_events(workspace_id, id) on delete restrict;

-- Preserve every immutable-history guard from the latest main definition, adding
-- the new source fields to its immutable set.
create or replace function app_private.guard_client_trainer_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and (
      new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id
      or new.client_id is distinct from old.client_id or new.trainer_user_id is distinct from old.trainer_user_id
      or new.assignment_source is distinct from old.assignment_source or new.assigned_by is distinct from old.assigned_by
      or new.assigned_at is distinct from old.assigned_at
      or new.workspace_membership_id is distinct from old.workspace_membership_id
      or new.source_approval_id is distinct from old.source_approval_id
      or new.source_deletion_intent_id is distinct from old.source_deletion_intent_id
      or new.ended_by_system is distinct from old.ended_by_system
      or old.ended_at is not null or new.ended_at is null
      or (new.ended_by is null and not new.ended_by_system))) then
    raise exception 'client_trainer_assignment_immutable' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.ended_at := coalesce(new.ended_at, statement_timestamp());
  end if;
  return new;
end $$;
alter function app_private.guard_client_trainer_assignment() owner to postgres;
revoke all on function app_private.guard_client_trainer_assignment() from public, anon, authenticated, service_role;

create function app_private.enqueue_client_trainer_distribution_job(
  p_workspace_id uuid, p_client_id uuid, p_approval_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare job_id uuid;
begin
  if not exists (
    select 1 from app_private.registration_approval_events e
    where e.workspace_id = p_workspace_id and e.client_id = p_client_id
      and e.id = p_approval_id
  ) then
    raise exception 'approval_fact_missing' using errcode = '23514';
  end if;
  select app_private.enqueue_job(
    'client.distribution', p_workspace_id,
    pg_catalog.jsonb_build_object('client_id', p_client_id, 'approval_id', p_approval_id),
    'client.distribution:' || p_client_id::text || ':' || p_approval_id::text,
    pg_catalog.statement_timestamp(), 5
  ) into job_id;
  return job_id;
end $$;
alter function app_private.enqueue_client_trainer_distribution_job(uuid, uuid, uuid) owner to postgres;
revoke all on function app_private.enqueue_client_trainer_distribution_job(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create function app_private.write_client_trainer_distribution(
  p_job_id uuid, p_lease_token uuid, p_client_id uuid
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  work public.jobs%rowtype;
  target_workspace uuid;
  approval_id uuid;
  client_row public.clients%rowtype;
  current_row public.client_trainer_assignments%rowtype;
  trainer_id uuid;
  membership_id uuid;
  result_outcome text;
begin
  select j.* into work from public.jobs j
  where j.id = p_job_id and j.kind = 'client.distribution'
    and j.status = 'running' and j.lease_token = p_lease_token
    and j.lease_expires_at > pg_catalog.statement_timestamp()
  for update;
  if not found then return null; end if;
  if work.outcome is not null then return work.outcome; end if;
  if jsonb_typeof(work.payload) <> 'object'
    or work.payload->>'client_id' is distinct from p_client_id::text
    or work.payload->>'approval_id' is null
    or work.workspace_id is null then
    raise exception 'invalid_distribution_job' using errcode = '22023';
  end if;
  target_workspace := work.workspace_id;
  approval_id := (work.payload->>'approval_id')::uuid;

  -- Shared with the manual writer and step-0 Trainer deletion intent; always
  -- acquire this workspace lock before the client row and balance reads.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'f11.responsible_trainer.workspace:' || target_workspace::text, 0
    )
  );
  select c.* into client_row from public.clients c
  where c.workspace_id = target_workspace and c.id = p_client_id
  for update;
  if not found or client_row.approval_state <> 'approved'
    or client_row.deactivated_at is not null
    or not exists (
      select 1 from app_private.registration_approval_events e
      where e.id = approval_id and e.workspace_id = target_workspace
        and e.client_id = p_client_id
    ) then
    result_outcome := 'no_op_client_not_approved';
  else
    select a.* into current_row from public.client_trainer_assignments a
    where a.workspace_id = target_workspace and a.client_id = p_client_id
      and a.ended_at is null
    for update;
    if found then
      result_outcome := case when current_row.assignment_source = 'po_manual'
        then 'no_op_po_override_exists'
        else 'no_op_active_assignment_exists' end;
    else
      select a.* into current_row from public.client_trainer_assignments a
      where a.workspace_id = target_workspace and a.client_id = p_client_id
        and a.assignment_source = 'po_manual' and a.ended_at is not null
        and not a.ended_by_system
      order by a.ended_at desc, a.id desc limit 1;
      if found then
        result_outcome := 'no_op_po_override_exists';
      else
        with eligible as (
          select m.user_id, m.id as membership_id,
            (
              select count(*)::bigint
              from public.client_trainer_assignments active
              join public.clients active_client
                on active_client.workspace_id = active.workspace_id
                and active_client.id = active.client_id
              where active.workspace_id = m.workspace_id
                and active.trainer_user_id = m.user_id
                and active.ended_at is null
                and active_client.approval_state = 'approved'
                and active_client.deactivated_at is null
            ) as assigned_count,
            (
              select max(history.assigned_at)
              from public.client_trainer_assignments history
              where history.workspace_id = m.workspace_id
                and history.trainer_user_id = m.user_id
            ) as last_assigned_at
          from public.workspace_memberships m
          join public.staff_profiles p on p.user_id = m.user_id
            and p.role = 'trainer'::public.staff_role
          where m.workspace_id = target_workspace and m.revoked_at is null
        )
        select e.user_id, e.membership_id into trainer_id, membership_id
        from eligible e
        order by e.assigned_count, e.last_assigned_at nulls first, e.last_assigned_at, e.user_id
        limit 1;
        if trainer_id is null then
          result_outcome := 'no_eligible';
        else
          insert into public.client_trainer_assignments(
            workspace_id, client_id, trainer_user_id, assignment_source,
            assigned_by, workspace_membership_id, source_approval_id
          ) values (
            target_workspace, p_client_id, trainer_id, 'system_distribution',
            null, membership_id, approval_id
          );
          result_outcome := 'assigned';
        end if;
      end if;
    end if;
  end if;

  update public.jobs j set outcome = result_outcome,
    completed_at = pg_catalog.statement_timestamp()
  where j.id = p_job_id and j.lease_token = p_lease_token and j.status = 'running';
  if not found then raise exception 'distribution_lease_lost' using errcode = '40001'; end if;
  return result_outcome;
end $$;
alter function app_private.write_client_trainer_distribution(uuid, uuid, uuid) owner to postgres;
revoke all on function app_private.write_client_trainer_distribution(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.handle_client_trainer_distribution(
  p_job_id uuid, p_lease_token uuid
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare target_client uuid;
begin
  if p_job_id is null or p_lease_token is null then return false; end if;
  select (j.payload->>'client_id')::uuid into target_client
  from public.jobs j where j.id = p_job_id and j.kind = 'client.distribution'
    and j.status = 'running' and j.lease_token = p_lease_token
    and j.lease_expires_at > pg_catalog.statement_timestamp();
  if target_client is null then return false; end if;
  return app_private.write_client_trainer_distribution(
    p_job_id, p_lease_token, target_client
  ) is not null;
end $$;
alter function public.handle_client_trainer_distribution(uuid, uuid) owner to postgres;
revoke all on function public.handle_client_trainer_distribution(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.handle_client_trainer_distribution(uuid, uuid) to service_role;
