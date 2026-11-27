-- S72 S2: preserve event-time check-in attribution and suppress false late history.
create or replace function public.get_trainer_checkins(
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
      case when s.submitted_at is null then app_private.current_assigned_trainer(a.workspace_id, a.client_id) else (select h.trainer_user_id from public.client_trainer_assignments h where h.workspace_id=a.workspace_id and h.client_id=a.client_id and h.assigned_at <= s.submitted_at and (h.ended_at is null or h.ended_at > s.submitted_at) order by h.assigned_at desc,h.id desc limit 1) end as responsible_trainer_id,
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
           and not exists (select 1 from app_private.workforce_checkin_transitions t
             where t.workspace_id=c.workspace_id and t.assignment_id=c.assignment_id
               and t.status='Followed Up' and t.occurred_at <= c.followup_due_at)
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
