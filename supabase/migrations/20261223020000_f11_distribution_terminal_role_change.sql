-- T062: keep a system-ended PO override terminal after a Trainer role change.
-- A role-change trigger correctly records ended_by_system when there is no
-- signed-in actor. That system marker must not make the approval worker treat
-- the old manual assignment as eligible for automatic distribution.
create or replace function app_private.write_client_trainer_distribution(
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
  deletion_intent_created_at timestamptz;
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

  -- Shared with manual assignment and the Trainer-deletion intent transaction.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'f11.responsible_trainer.workspace:' || target_workspace::text, 0
    )
  );
  select c.* into client_row from public.clients c
  where c.workspace_id = target_workspace and c.id = p_client_id
  for update;
  if not found or client_row.approval_state <> 'approved'
    or client_row.deletion_state <> 'active'
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
      order by a.ended_at desc, a.id desc limit 1;
      if found then
        select i.created_at into deletion_intent_created_at
        from app_private.account_deletion_intents i
        where i.target_user_id = current_row.trainer_user_id
          and i.target_kind = 'staff'
        order by i.created_at desc limit 1;
        if deletion_intent_created_at is not null and current_row.ended_by_system
          and not exists (
            select 1 from public.audit_events e
            where e.occurred_at >= current_row.assigned_at
              and e.occurred_at < deletion_intent_created_at
              and (
                (e.action = 'staff_role.changed'
                  and e.target_table = 'staff_profiles'
                  and e.target_id = current_row.trainer_user_id
                  and e.details->>'from' = 'trainer'
                  and e.details->>'to' <> 'trainer')
                or (e.action = 'membership.revoked'
                  and e.target_table = 'workspace_memberships'
                  and e.target_id = current_row.workspace_membership_id)
              )
          ) then
          -- Step (B) already handled this Trainer's clients. A deletion with
          -- no eligible replacement is terminal; never create a late second
          -- assignment if another Trainer joins afterward.
          result_outcome := 'no_eligible';
        else
          -- Manual assignments ended by role change or membership departure
          -- stay unassigned and terminal, including system-actor transitions.
          result_outcome := 'no_op_po_override_exists';
        end if;
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
                and active_client.deletion_state = 'active'
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
          where m.workspace_id = target_workspace
            and m.revoked_at is null
            and not exists (
              select 1 from app_private.account_deletion_intents di
              where di.target_user_id = m.user_id
            )
        )
        select e.user_id, e.membership_id into trainer_id, membership_id
        from eligible e
        order by e.assigned_count, e.last_assigned_at nulls first,
          e.last_assigned_at, e.user_id
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
