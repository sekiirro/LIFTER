-- P7 T011: one immutable, workspace-scoped penalty per successful check-in.
-- Lock order: check-in advisory key, F15 submission row, F11 assignment workspace,
-- then the shared P7 workspace/month fence. No scheduler is activated here.

create function app_private.p7_record_checkin_delay_penalty(
  p_workspace_id uuid,
  p_assignment_id uuid
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := auth.role();
  role public.staff_role;
  submitted_at timestamptz;
  due_at timestamptz;
  v_client_id uuid;
  trainer_id uuid;
  trigger_month date;
  source_hash text;
  entry_id uuid;
  prior_hash text;
begin
  if actor_role = 'authenticated' then
    role := app_private.current_staff_role();
    if auth.uid() is null or role is null
      or role not in ('platform_owner'::public.staff_role,'trainer'::public.staff_role)
      or not app_private.has_workspace_access(p_workspace_id,'read_form_answers') then
      raise exception 'not_permitted' using errcode = '42501';
    end if;
  elsif actor_role is distinct from 'service_role' then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  select s.submitted_at, a.client_id into submitted_at, v_client_id
  from app_private.form_submissions s
  join public.form_assignments a
    on a.workspace_id=s.workspace_id and a.id=s.assignment_id
  join app_private.form_assignment_policies p
    on p.workspace_id=a.workspace_id and p.id=a.policy_id and p.trigger_kind='weekly_checkin'
  where s.workspace_id=p_workspace_id and s.assignment_id=p_assignment_id
    and a.occurrence_key ~ '^weekly_checkin:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  for update of s;
  if not found then return false; end if;

  due_at := submitted_at + interval '24 hours';
  if due_at > statement_timestamp() or exists (
    select 1 from app_private.workforce_checkin_transitions t
    where t.workspace_id=p_workspace_id and t.assignment_id=p_assignment_id
      and t.status='Followed Up' and t.occurred_at <= due_at
  ) then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'f11.responsible_trainer.workspace:' || p_workspace_id::text,0
  ));
  if actor_role = 'authenticated' and (
    auth.uid() is null or app_private.current_staff_role() not in
      ('platform_owner'::public.staff_role,'trainer'::public.staff_role)
    or not app_private.has_workspace_access(p_workspace_id,'read_form_answers')
  ) then
    raise exception 'not_permitted' using errcode = '42501';
  elsif actor_role is distinct from 'authenticated' and actor_role is distinct from 'service_role' then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  select a.trainer_user_id into trainer_id
  from public.client_trainer_assignments a
  where a.workspace_id=p_workspace_id and a.client_id=v_client_id
    and a.assigned_at <= due_at and (a.ended_at is null or a.ended_at > due_at)
  order by a.assigned_at desc, a.id desc limit 1;
  if trainer_id is null then return false; end if;

  trigger_month := app_private.p7_month_for_trigger(due_at);
  perform app_private.p7_lock_period(p_workspace_id,trigger_month);
  source_hash := pg_catalog.md5(
    p_workspace_id::text || '|' || p_assignment_id::text || '|' || trainer_id::text ||
    '|-0.50|' || pg_catalog.to_char(due_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') ||
    '|p7-checkin-delay-v1'
  );

  select e.source_hash into prior_hash
  from public.p7_adjustment_entries e
  where e.workspace_id=p_workspace_id and e.source_key=p_assignment_id;
  if found then
    if prior_hash is distinct from source_hash then
      raise exception 'p7_checkin_idempotency_conflict' using errcode = '23505';
    end if;
    return false;
  end if;

  insert into public.p7_adjustment_entries(
    workspace_id,staff_user_id,points,effective_month,source_key,source_hash,reason_code
  ) values (
    p_workspace_id,trainer_id,-0.50,trigger_month,p_assignment_id,source_hash,'checkin_delay'
  ) on conflict (workspace_id,source_key) do nothing
  returning id into entry_id;
  if entry_id is null then
    select e.source_hash into prior_hash
    from public.p7_adjustment_entries e
    where e.workspace_id=p_workspace_id and e.source_key=p_assignment_id;
    if prior_hash is distinct from source_hash then
      raise exception 'p7_checkin_idempotency_conflict' using errcode = '23505';
    end if;
    return false;
  end if;

  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
  values (auth.uid(),'workforce.checkin_delay_penalty_recorded','p7_adjustment_entries',entry_id,
    p_workspace_id,jsonb_build_object('reference',p_assignment_id::text));
  return true;
end
$$;
alter function app_private.p7_record_checkin_delay_penalty(uuid,uuid) owner to postgres;
revoke all on function app_private.p7_record_checkin_delay_penalty(uuid,uuid)
  from public,anon,authenticated,service_role;

create function app_private.p7_checkin_late_penalty_after_insert()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor_role text := auth.role(); role public.staff_role;
begin
  if new.status <> 'Late' then return new; end if;
  if actor_role = 'authenticated' then
    role := app_private.current_staff_role();
    if auth.uid() is null or role is null
      or role not in ('platform_owner'::public.staff_role,'trainer'::public.staff_role)
      or not app_private.has_workspace_access(new.workspace_id,'read_form_answers') then
      raise exception 'not_permitted' using errcode = '42501';
    end if;
  elsif actor_role is distinct from 'service_role' then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  perform app_private.p7_record_checkin_delay_penalty(new.workspace_id,new.assignment_id);
  return new;
end
$$;
alter function app_private.p7_checkin_late_penalty_after_insert() owner to postgres;
revoke all on function app_private.p7_checkin_late_penalty_after_insert()
  from public,anon,authenticated,service_role;
create trigger p7_checkin_late_penalty_after_insert
  after insert on app_private.workforce_checkin_transitions
  for each row execute function app_private.p7_checkin_late_penalty_after_insert();

create function public.run_p7_checkin_delay_evaluator(p_workspace_id uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  occurrence record;
  submitted_at timestamptz;
  due_at timestamptz;
  processed integer := 0;
begin
  if auth.role() is distinct from 'service_role' or p_workspace_id is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if not exists(select 1 from public.workspaces w where w.id=p_workspace_id) then
    return 0;
  end if;

  for occurrence in
    select s.assignment_id
    from app_private.form_submissions s
    join public.form_assignments a
      on a.workspace_id=s.workspace_id and a.id=s.assignment_id
    join app_private.form_assignment_policies p
      on p.workspace_id=a.workspace_id and p.id=a.policy_id and p.trigger_kind='weekly_checkin'
    where s.workspace_id=p_workspace_id
      and s.submitted_at + interval '24 hours' <= statement_timestamp()
      and a.occurrence_key ~ '^weekly_checkin:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    order by s.submitted_at + interval '24 hours',s.assignment_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'p7-checkin-followup:' || p_workspace_id::text || ':' || occurrence.assignment_id::text,0
    ));
    if auth.role() is distinct from 'service_role' then
      raise exception 'not_permitted' using errcode = '42501';
    end if;

    select s.submitted_at into submitted_at
    from app_private.form_submissions s
    join public.form_assignments a
      on a.workspace_id=s.workspace_id and a.id=s.assignment_id
    join app_private.form_assignment_policies p
      on p.workspace_id=a.workspace_id and p.id=a.policy_id and p.trigger_kind='weekly_checkin'
    where s.workspace_id=p_workspace_id and s.assignment_id=occurrence.assignment_id
      and a.occurrence_key ~ '^weekly_checkin:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    for update of s;
    if not found then continue; end if;
    due_at := submitted_at + interval '24 hours';
    if due_at > statement_timestamp() or exists (
      select 1 from app_private.workforce_checkin_transitions t
      where t.workspace_id=p_workspace_id and t.assignment_id=occurrence.assignment_id
        and t.status='Followed Up' and t.occurred_at <= due_at
    ) then
      continue;
    end if;

    insert into app_private.workforce_checkin_transitions(workspace_id,assignment_id,status,occurred_at)
    values(p_workspace_id,occurrence.assignment_id,'Late',due_at)
    on conflict (workspace_id,assignment_id,status) do nothing;
    if app_private.p7_record_checkin_delay_penalty(p_workspace_id,occurrence.assignment_id) then
      processed := processed + 1;
    end if;
  end loop;
  return processed;
end
$$;
alter function public.run_p7_checkin_delay_evaluator(uuid) owner to postgres;
revoke all on function public.run_p7_checkin_delay_evaluator(uuid) from public,anon,authenticated,service_role;
grant execute on function public.run_p7_checkin_delay_evaluator(uuid) to service_role;

comment on function public.run_p7_checkin_delay_evaluator(uuid) is
  'Trusted workspace-scoped operator catch-up for successful weekly check-in submissions; scheduler activation remains disabled.';
