-- P7 T004: narrow, append-only follow-up history on the existing F15 submission.
create table app_private.workforce_checkin_transitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  assignment_id uuid not null,
  status text not null check (status in ('Pending','Followed Up','Late','Disputed')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  occurred_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id, assignment_id)
    references app_private.form_submissions(workspace_id, assignment_id) on delete cascade,
  check (status <> 'Followed Up' or actor_user_id is not null)
);
alter table app_private.workforce_checkin_transitions owner to postgres;
alter table app_private.workforce_checkin_transitions enable row level security;
alter table app_private.workforce_checkin_transitions force row level security;
revoke all on app_private.workforce_checkin_transitions from public, anon, authenticated, service_role;
create policy workforce_checkin_transitions_postgres_only
  on app_private.workforce_checkin_transitions for all to postgres using (true) with check (true);
create unique index workforce_checkin_transitions_one_status
  on app_private.workforce_checkin_transitions(workspace_id, assignment_id, status);
create index workforce_checkin_transitions_history
  on app_private.workforce_checkin_transitions(workspace_id, assignment_id, occurred_at, id);

insert into app_private.retention_purge_allowlist(table_oid, can_delete, can_update, traverse)
values ('app_private.workforce_checkin_transitions'::regclass, true, false, true);

create function app_private.guard_workforce_checkin_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' and app_private.retention_purge_context_allows(tg_relid, 'DELETE') then
    return old;
  end if;
  raise exception 'workforce check-in transitions are append-only' using errcode = '23514';
end
$$;
alter function app_private.guard_workforce_checkin_transition() owner to postgres;
revoke all on function app_private.guard_workforce_checkin_transition() from public, anon, authenticated, service_role;
create trigger workforce_checkin_transitions_append_only
  before update or delete on app_private.workforce_checkin_transitions
  for each row execute function app_private.guard_workforce_checkin_transition();

create function app_private.guard_workforce_checkin_transition_truncate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'workforce check-in transitions are append-only' using errcode = '23514';
end
$$;
alter function app_private.guard_workforce_checkin_transition_truncate() owner to postgres;
revoke all on function app_private.guard_workforce_checkin_transition_truncate() from public, anon, authenticated, service_role;
create trigger workforce_checkin_transitions_no_truncate
  before truncate on app_private.workforce_checkin_transitions
  for each statement execute function app_private.guard_workforce_checkin_transition_truncate();

create function app_private.capture_workforce_checkin_pending() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.form_assignments a
    join app_private.form_assignment_policies p
      on p.workspace_id = a.workspace_id and p.id = a.policy_id
    where a.workspace_id = new.workspace_id and a.id = new.assignment_id
      and p.trigger_kind = 'weekly_checkin'
      and a.occurrence_key ~ '^weekly_checkin:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  ) then
    insert into app_private.workforce_checkin_transitions(
      workspace_id, assignment_id, status, occurred_at
    ) values (new.workspace_id, new.assignment_id, 'Pending', new.submitted_at)
    on conflict (workspace_id, assignment_id, status) do nothing;
  end if;
  return new;
end
$$;
alter function app_private.capture_workforce_checkin_pending() owner to postgres;
revoke all on function app_private.capture_workforce_checkin_pending() from public, anon, authenticated, service_role;
create trigger workforce_checkin_pending_on_submission
  after insert on app_private.form_submissions
  for each row execute function app_private.capture_workforce_checkin_pending();

create function public.get_trainer_checkins(
  p_workspace_id uuid, p_from date, p_to date,
  p_limit integer default 50, p_offset integer default 0
) returns table (
  client_id uuid, assignment_id uuid, client_name text, phone_e164 text,
  username_normalized text, telegram_username text, responsible_trainer_id uuid,
  scheduled_at timestamptz, submitted_at timestamptz, followup_due_at timestamptz,
  form_status text, followup_status text, followup_actor_id uuid, followup_at timestamptz,
  answer_history jsonb, followup_history jsonb
) language plpgsql volatile security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  role public.staff_role;
  reference_id uuid := gen_random_uuid();
begin
  role := app_private.current_staff_role();
  if actor is null or role is null or role not in ('platform_owner'::public.staff_role, 'trainer'::public.staff_role)
    or not app_private.has_workspace_access(p_workspace_id, 'read_form_answers') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_from is null or p_to is null
    or not isfinite(p_from) or not isfinite(p_to) or p_to < p_from or p_to - p_from > 400
    or p_limit is null or p_limit < 1 or p_limit > 100
    or p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  return query
  with checkins as (
    select a.workspace_id, a.id as assignment_id, a.client_id, a.occurrence_key,
      a.created_at as scheduled_at, a.client_deadline_at, c.name as client_name,
      c.phone_e164, c.username_normalized, c.telegram_username,
      app_private.current_assigned_trainer(a.workspace_id, a.client_id) as responsible_trainer_id,
      s.submitted_at,
      case
        when substring(a.occurrence_key from 16)::date > (clock_timestamp() at time zone 'Africa/Cairo')::date then 'Scheduled'
        when s.assignment_id is null and a.client_deadline_at is not null and a.client_deadline_at <= clock_timestamp() then 'Client Overdue'
        when s.assignment_id is null then 'Awaiting Client'
        else 'Submitted'
      end as form_status,
      s.submitted_at + interval '24 hours' as followup_due_at
    from public.form_assignments a
    join app_private.form_assignment_policies p
      on p.workspace_id = a.workspace_id and p.id = a.policy_id and p.trigger_kind = 'weekly_checkin'
    join public.clients c on c.workspace_id = a.workspace_id and c.id = a.client_id
    left join app_private.form_submissions s
      on s.workspace_id = a.workspace_id and s.assignment_id = a.id
    where a.workspace_id = p_workspace_id
      and a.occurrence_key ~ '^weekly_checkin:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and substring(a.occurrence_key from 16)::date between p_from and p_to
  ), projected as (
    select c.*,
      case
        when exists (select 1 from app_private.workforce_checkin_transitions t
          where t.workspace_id=c.workspace_id and t.assignment_id=c.assignment_id and t.status='Disputed') then 'Disputed'
        when exists (select 1 from app_private.workforce_checkin_transitions t
          where t.workspace_id=c.workspace_id and t.assignment_id=c.assignment_id and t.status='Followed Up') then 'Followed Up'
        when c.submitted_at is not null and clock_timestamp() > c.followup_due_at then 'Late'
        else 'Pending'
      end as followup_status,
      (select t.actor_user_id from app_private.workforce_checkin_transitions t
        where t.workspace_id=c.workspace_id and t.assignment_id=c.assignment_id and t.status='Followed Up'
        order by t.occurred_at desc, t.id desc limit 1) as followup_actor_id,
      (select t.occurred_at from app_private.workforce_checkin_transitions t
        where t.workspace_id=c.workspace_id and t.assignment_id=c.assignment_id and t.status='Followed Up'
        order by t.occurred_at desc, t.id desc limit 1) as followup_at,
      case when c.submitted_at is null then '[]'::jsonb
        else jsonb_build_array(jsonb_build_object(
          'answers', public.read_form_answer(c.workspace_id,c.assignment_id)))
      end as answer_history,
      (select jsonb_agg(jsonb_build_object('status',h.status,'actor_user_id',h.actor_user_id,'occurred_at',h.occurred_at)
        order by h.occurred_at,h.id)
       from (
         select t.status,t.actor_user_id,t.occurred_at,t.id
         from app_private.workforce_checkin_transitions t
         where t.workspace_id=c.workspace_id and t.assignment_id=c.assignment_id
         union all
         select 'Late',null::uuid,c.followup_due_at,gen_random_uuid()
         where c.submitted_at is not null and clock_timestamp() > c.followup_due_at
           and not exists (select 1 from app_private.workforce_checkin_transitions t
             where t.workspace_id=c.workspace_id and t.assignment_id=c.assignment_id and t.status='Late')
       ) h) as followup_history
    from checkins c
  )
  select p.client_id,p.assignment_id,p.client_name,p.phone_e164,p.username_normalized,
    p.telegram_username,p.responsible_trainer_id,p.scheduled_at,p.submitted_at,
    p.followup_due_at,p.form_status,p.followup_status,p.followup_actor_id,p.followup_at,
    p.answer_history,coalesce(p.followup_history,'[]'::jsonb)
  from projected p
  order by substring(p.occurrence_key from 16)::date,p.client_name,p.assignment_id
  offset p_offset limit p_limit;

  if actor is distinct from auth.uid() or app_private.current_staff_role() is distinct from role
    or not app_private.has_workspace_access(p_workspace_id, 'read_form_answers') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
  values (actor,'audit.opaque_reference','opaque_reference',reference_id,p_workspace_id,
    jsonb_build_object('reference_id',reference_id));
end
$$;
alter function public.get_trainer_checkins(uuid,date,date,integer,integer) owner to postgres;
revoke all on function public.get_trainer_checkins(uuid,date,date,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.get_trainer_checkins(uuid,date,date,integer,integer) to authenticated;

create function public.confirm_trainer_checkin_followup(p_workspace_id uuid,p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  role public.staff_role;
  submitted_at timestamptz;
  transition_id uuid;
  action_at timestamptz := clock_timestamp();
begin
  role := app_private.current_staff_role();
  if actor is null or role is null or role not in ('platform_owner'::public.staff_role,'trainer'::public.staff_role)
    or not app_private.has_workspace_access(p_workspace_id,'read_form_answers') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_assignment_id is null then
    return jsonb_build_object('status','invalid_input');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'p7-checkin-followup:'||p_workspace_id::text||':'||p_assignment_id::text,0));
  role := app_private.current_staff_role();
  if actor is distinct from auth.uid() or role is null or role not in ('platform_owner'::public.staff_role,'trainer'::public.staff_role)
    or not app_private.has_workspace_access(p_workspace_id,'read_form_answers') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select s.submitted_at into submitted_at
  from app_private.form_submissions s
  join public.form_assignments a on a.workspace_id=s.workspace_id and a.id=s.assignment_id
  join app_private.form_assignment_policies p
    on p.workspace_id=a.workspace_id and p.id=a.policy_id and p.trigger_kind='weekly_checkin'
  where s.workspace_id=p_workspace_id and s.assignment_id=p_assignment_id
    and a.occurrence_key ~ '^weekly_checkin:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  for update of s;
  if not found then raise exception 'not_permitted' using errcode = '42501'; end if;
  role := app_private.current_staff_role();
  if actor is distinct from auth.uid() or role is null or role not in ('platform_owner'::public.staff_role,'trainer'::public.staff_role)
    or not app_private.has_workspace_access(p_workspace_id,'read_form_answers') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select t.id into transition_id from app_private.workforce_checkin_transitions t
    where t.workspace_id=p_workspace_id and t.assignment_id=p_assignment_id and t.status='Followed Up';
  if transition_id is not null then
    return jsonb_build_object('status','ok','transition_id',transition_id);
  end if;
  if action_at > submitted_at + interval '24 hours' then
    insert into app_private.workforce_checkin_transitions(workspace_id,assignment_id,status,occurred_at)
      values(p_workspace_id,p_assignment_id,'Late',submitted_at + interval '24 hours')
      on conflict (workspace_id,assignment_id,status) do nothing;
  end if;
  insert into app_private.workforce_checkin_transitions(
    workspace_id,assignment_id,status,actor_user_id,occurred_at
  ) values(p_workspace_id,p_assignment_id,'Followed Up',actor,action_at)
  returning id into transition_id;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
  values (actor,'audit.opaque_reference','opaque_reference',transition_id,p_workspace_id,
    jsonb_build_object('reference_id',transition_id));
  return jsonb_build_object('status','ok','transition_id',transition_id);
end
$$;
alter function public.confirm_trainer_checkin_followup(uuid,uuid) owner to postgres;
revoke all on function public.confirm_trainer_checkin_followup(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.confirm_trainer_checkin_followup(uuid,uuid) to authenticated;
