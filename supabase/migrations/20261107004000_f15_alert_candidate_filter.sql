-- T016: exclude finished schedules before the bounded evaluator selection.
create or replace function app_private.evaluate_forms_alerts_core(
  p_evaluation_at timestamptz,p_workspace_id uuid,p_batch integer default 250
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
    where (p_workspace_id is null or s.workspace_id=p_workspace_id)
      and s.deadline_at <= p_evaluation_at
      and (
        (s.alert_kind='client_late'
          and not exists (
            select 1 from app_private.form_submissions fs
            where fs.workspace_id=s.workspace_id
              and fs.assignment_id=s.source_assignment_id
          )
          and not (
            s.deadline_at + interval '48 hours' <= p_evaluation_at
            and not exists (
              select 1 from public.staff_profiles sp
              where (
                (sp.role='platform_owner'::public.staff_role and exists (
                  select 1 from public.workspaces w
                  where w.id=s.workspace_id and w.created_by=sp.user_id
                ))
                or (sp.role='workspace_owner'::public.staff_role and exists (
                  select 1 from public.workspace_memberships wm
                  where wm.workspace_id=s.workspace_id
                    and wm.user_id=sp.user_id and wm.revoked_at is null
                ))
              )
                and not exists (
                  select 1 from app_private.form_alert_occurrences o
                  where o.workspace_id=s.workspace_id and o.schedule_id=s.id
                    and o.stage='client_owners_48h'
                    and o.recipient_user_id=sp.user_id
                )
            )
          )
        )
        or (s.alert_kind='trainer_late'
          and (s.delivered_at is null or s.delivered_at > p_evaluation_at)
          and s.deadline_at + interval '7 days' >= p_evaluation_at)
      )
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
            (sp.role='platform_owner'::public.staff_role and exists (
              select 1 from public.workspaces w
              where w.id=schedule_row.workspace_id and w.created_by=sp.user_id
            ))
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
alter function app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer) owner to postgres;
revoke all on function app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer)
  from public,anon,authenticated,service_role;


