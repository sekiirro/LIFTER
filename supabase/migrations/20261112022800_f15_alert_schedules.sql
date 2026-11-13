-- F15 T016/T017: channel-neutral alert schedules and owner-controlled cron.
-- Alert delivery remains P4-gated. No activation call belongs in a migration.

create table app_private.form_alert_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  source_assignment_id uuid not null,
  alert_kind text not null check (alert_kind in ('client_late','trainer_late')),
  deadline_at timestamptz not null,
  trainer_user_id uuid references public.staff_profiles(user_id) on delete restrict,
  delivered_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (workspace_id,id),
  unique (workspace_id,alert_kind,source_assignment_id),
  foreign key (workspace_id,source_assignment_id)
    references public.form_assignments(workspace_id,id) on delete restrict
);
create index form_alert_schedules_pending_idx
  on app_private.form_alert_schedules(alert_kind,deadline_at)
  where delivered_at is null;

create table app_private.form_alert_occurrences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  schedule_id uuid not null,
  stage text not null check (stage in ('client_trainer_24h','client_owners_24h','client_owners_48h','trainer_initial','trainer_owners_24h')),
  recipient_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  job_id uuid unique references public.jobs(id) on delete restrict,
  enqueued_at timestamptz not null,
  unique (workspace_id,schedule_id,stage,recipient_user_id),
  foreign key (workspace_id,schedule_id)
    references app_private.form_alert_schedules(workspace_id,id) on delete restrict
);

alter table app_private.form_alert_schedules enable row level security;
alter table app_private.form_alert_schedules force row level security;
alter table app_private.form_alert_occurrences enable row level security;
alter table app_private.form_alert_occurrences force row level security;
revoke all on app_private.form_alert_schedules,app_private.form_alert_occurrences
  from public,anon,authenticated,service_role;

create function app_private.f15_client_alert_schedule_insert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.client_deadline_at is not null then
    insert into app_private.form_alert_schedules(
      workspace_id,source_assignment_id,alert_kind,deadline_at
    ) values (
      new.workspace_id,new.id,'client_late',new.client_deadline_at
    );
  end if;
  return new;
end
$$;
alter function app_private.f15_client_alert_schedule_insert() owner to postgres;
revoke all on function app_private.f15_client_alert_schedule_insert() from public,anon,authenticated,service_role;
create trigger f15_client_alert_schedule_after_assignment
  after insert on public.form_assignments
  for each row execute function app_private.f15_client_alert_schedule_insert();

-- P4 is not present in this branch. Its future authoritative producer may
-- call this owner-only registrar with IDs and the actual D-03 delivery fact.
-- The function is also used by synthetic Stack D fixtures; it creates no
-- workout/nutrition fact and stores no answer data.
create function app_private.register_f15_trainer_alert_schedule(
  p_workspace_id uuid,p_assignment_id uuid,p_trainer_user_id uuid,p_delivered_at timestamptz
) returns uuid
language plpgsql security invoker set search_path='' as $$
declare
  delivery_deadline timestamptz;
  schedule_id uuid;
begin
  if current_user <> 'postgres' then
    raise exception 'f15_alert_owner_required' using errcode='42501';
  end if;
  select s.deadline_at into delivery_deadline
  from app_private.form_submission_slas s
  where s.workspace_id=p_workspace_id and s.assignment_id=p_assignment_id;
  if delivery_deadline is null then
    raise exception 'f15_alert_source_unavailable' using errcode='P0002';
  end if;
  insert into app_private.form_alert_schedules(
    workspace_id,source_assignment_id,alert_kind,deadline_at,trainer_user_id,delivered_at
  ) values (
    p_workspace_id,p_assignment_id,'trainer_late',delivery_deadline,p_trainer_user_id,p_delivered_at
  )
  on conflict (workspace_id,alert_kind,source_assignment_id) do update
    set trainer_user_id=excluded.trainer_user_id,
        delivered_at=excluded.delivered_at
  returning id into schedule_id;
  return schedule_id;
end
$$;
alter function app_private.register_f15_trainer_alert_schedule(uuid,uuid,uuid,timestamptz) owner to postgres;
revoke all on function app_private.register_f15_trainer_alert_schedule(uuid,uuid,uuid,timestamptz)
  from public,anon,authenticated,service_role;

create function app_private.f15_alert_schedule_immutable() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.source_assignment_id is distinct from old.source_assignment_id
    or new.alert_kind is distinct from old.alert_kind
    or new.deadline_at is distinct from old.deadline_at
    or new.created_at is distinct from old.created_at then
    raise exception 'f15_alert_schedule_immutable' using errcode='23514';
  end if;
  return new;
end
$$;
alter function app_private.f15_alert_schedule_immutable() owner to postgres;
revoke all on function app_private.f15_alert_schedule_immutable() from public,anon,authenticated,service_role;
create trigger form_alert_schedule_immutable
  before update on app_private.form_alert_schedules
  for each row execute function app_private.f15_alert_schedule_immutable();

create function app_private.evaluate_forms_alerts_core(
  p_evaluation_at timestamptz,p_batch integer default 250
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  schedule_row record;
  stage_row record;
  recipient_row record;
  occurrence_id uuid;
  enqueued integer := 0;
  catch_up_until timestamptz;
begin
  if p_evaluation_at is null or p_batch is null or p_batch < 1 or p_batch > 1000 then
    return jsonb_build_object('status','invalid_input');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(11011,318);

  for schedule_row in
    select s.* from app_private.form_alert_schedules s
    where s.deadline_at <= p_evaluation_at
      and (s.alert_kind='client_late'
        or s.delivered_at is null or s.delivered_at > s.deadline_at)
    order by s.deadline_at,s.id
    limit p_batch
    for update of s skip locked
  loop
    catch_up_until := schedule_row.deadline_at + interval '7 days';
    for stage_row in
      select stage,stage_at from (
        select 'client_trainer_24h'::text as stage,
          schedule_row.deadline_at + interval '24 hours' as stage_at
        where schedule_row.alert_kind='client_late'
        union all
        select 'client_owners_24h',schedule_row.deadline_at + interval '24 hours'
        where schedule_row.alert_kind='client_late'
          and not exists (
            select 1 from public.staff_profiles sp
            join public.workspace_memberships wm
              on wm.user_id=sp.user_id and wm.workspace_id=schedule_row.workspace_id
            where sp.user_id=schedule_row.trainer_user_id
              and sp.role='trainer'::public.staff_role and wm.revoked_at is null
          )
        union all
        select 'client_owners_48h',schedule_row.deadline_at + interval '48 hours'
        where schedule_row.alert_kind='client_late'
        union all
        select 'trainer_initial',schedule_row.deadline_at
        where schedule_row.alert_kind='trainer_late'
          and schedule_row.trainer_user_id is not null
          and p_evaluation_at <= catch_up_until
        union all
        select 'trainer_owners_24h',schedule_row.deadline_at + interval '24 hours'
        where schedule_row.alert_kind='trainer_late'
          and p_evaluation_at <= catch_up_until
      ) stages
      where stage_at <= p_evaluation_at
      order by stage_at,stage
    loop
      for recipient_row in
        select sp.user_id
        from public.staff_profiles sp
        where (
          stage_row.stage in ('client_trainer_24h','trainer_initial')
          and sp.user_id=schedule_row.trainer_user_id
          and sp.role='trainer'::public.staff_role
          and exists (
            select 1 from public.workspace_memberships wm
            where wm.workspace_id=schedule_row.workspace_id
              and wm.user_id=sp.user_id and wm.revoked_at is null
          )
        ) or (
          stage_row.stage in ('client_owners_24h','client_owners_48h','trainer_owners_24h')
          and (
            sp.role='platform_owner'::public.staff_role
            or (sp.role='workspace_owner'::public.staff_role and exists (
              select 1 from public.workspace_memberships wm
              where wm.workspace_id=schedule_row.workspace_id
                and wm.user_id=sp.user_id and wm.revoked_at is null
            ))
          )
        )
        order by sp.user_id
      loop
        if schedule_row.alert_kind='client_late' and exists (
          select 1 from app_private.form_submissions fs
          where fs.workspace_id=schedule_row.workspace_id
            and fs.assignment_id=schedule_row.source_assignment_id
        ) then
          continue;
        end if;
        if schedule_row.alert_kind='trainer_late'
          and schedule_row.delivered_at is not null
          and schedule_row.delivered_at <= p_evaluation_at then
          continue;
        end if;
        insert into app_private.form_alert_occurrences(
          workspace_id,schedule_id,stage,recipient_user_id,job_id,enqueued_at
        ) values (
          schedule_row.workspace_id,schedule_row.id,stage_row.stage,
          recipient_row.user_id,null,p_evaluation_at
        ) on conflict (workspace_id,schedule_id,stage,recipient_user_id) do nothing
        returning id into occurrence_id;
        if occurrence_id is null then continue; end if;
        update app_private.form_alert_occurrences o
        set job_id=app_private.enqueue_job(
          'forms.alert',schedule_row.workspace_id,
          jsonb_build_object(
            'alert_id',o.id,'recipient_id',recipient_row.user_id,'stage',stage_row.stage
          ),
          format('f15-alert:%s:%s:%s',schedule_row.id,stage_row.stage,recipient_row.user_id),
          p_evaluation_at,5
        )
        where o.id=occurrence_id;
        insert into public.audit_events(
          actor_user_id,action,target_table,target_id,workspace_id,details
        ) values (
          null,'form.alert_enqueued','form_alert_occurrences',occurrence_id,
          schedule_row.workspace_id,
          jsonb_build_object('schedule_id',schedule_row.id,'stage',stage_row.stage,
            'recipient_id',recipient_row.user_id)
        );
        enqueued := enqueued + 1;
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('status','ok','enqueued',enqueued);
exception when others then
  raise exception 'f15_alert_evaluation_failed' using errcode='P0001';
end
$$;
alter function app_private.evaluate_forms_alerts_core(timestamptz,integer) owner to postgres;
revoke all on function app_private.evaluate_forms_alerts_core(timestamptz,integer)
  from public,anon,authenticated,service_role;

-- The scheduler's callable path remains owner-only and channel-neutral.
create function app_private.f15_alert_schedule_run() returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'postgres' then
    raise exception 'f15_alert_owner_required' using errcode='42501';
  end if;
  return app_private.evaluate_forms_alerts_core(pg_catalog.clock_timestamp(),250);
end
$$;
alter function app_private.f15_alert_schedule_run() owner to postgres;
revoke all on function app_private.f15_alert_schedule_run() from public,anon,authenticated,service_role;

-- F11 pg_cron owner-only pattern. The migration intentionally does not call
-- the activation function; P4 authorization and release gates remain required.
grant usage on schema cron to postgres;
grant select on table cron.job to postgres;
revoke all on schema cron from public,anon,authenticated,service_role;
revoke all on all tables in schema cron from public,anon,authenticated,service_role;

create function app_private.f15_alert_schedule_deactivate() returns void
language plpgsql security invoker set search_path='' as $$
declare existing_job bigint;
begin
  if current_user <> 'postgres' then
    raise exception 'f15_alert_owner_required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(11011,317);
  for existing_job in
    select jobid from cron.job
    where jobname='lifter-f15-alerts' and username=current_user
  loop
    perform cron.unschedule(existing_job);
  end loop;
end
$$;
alter function app_private.f15_alert_schedule_deactivate() owner to postgres;
revoke all on function app_private.f15_alert_schedule_deactivate() from public,anon,authenticated,service_role;

create function app_private.f15_alert_schedule_activate() returns void
language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'postgres' then
    raise exception 'f15_alert_owner_required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(11011,317);
  perform app_private.f15_alert_schedule_deactivate();
  perform cron.schedule(
    'lifter-f15-alerts','*/5 * * * *',
    'select app_private.f15_alert_schedule_run();'
  );
end
$$;
alter function app_private.f15_alert_schedule_activate() owner to postgres;
revoke all on function app_private.f15_alert_schedule_activate() from public,anon,authenticated,service_role;

-- No cron.schedule call, activation, or external delivery adapter is run here.
