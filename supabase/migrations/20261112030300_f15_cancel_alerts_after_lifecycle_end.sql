-- S34-PO-3: stop client-late alerts as soon as the relationship ends, and purge alert rows with the answer lifecycle.
create or replace function app_private.f15_client_alert_lifecycle_active(p_workspace_id uuid,p_assignment_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.form_assignments a
    where a.workspace_id=p_workspace_id and a.id=p_assignment_id
      and not exists (
        select 1 from app_private.form_retention_windows w
        where w.workspace_id=a.workspace_id and w.client_id=a.client_id
      )
  )
$$;
alter function app_private.f15_client_alert_lifecycle_active(uuid,uuid) owner to postgres;
revoke all on function app_private.f15_client_alert_lifecycle_active(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function app_private.cancel_f15_client_alerts(p_workspace_id uuid,p_client_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(11011,318);
  delete from app_private.form_alert_inbox i using app_private.form_alert_deliveries d,
    app_private.form_alert_occurrences o,app_private.form_alert_schedules s,public.form_assignments a
  where i.workspace_id=d.workspace_id and i.delivery_id=d.id
    and d.workspace_id=o.workspace_id and d.alert_occurrence_id=o.id
    and o.workspace_id=s.workspace_id and o.schedule_id=s.id
    and s.workspace_id=a.workspace_id and s.source_assignment_id=a.id
    and s.alert_kind='client_late' and a.workspace_id=p_workspace_id and a.client_id=p_client_id;
  delete from app_private.form_alert_deliveries d using app_private.form_alert_occurrences o,
    app_private.form_alert_schedules s,public.form_assignments a
  where d.workspace_id=o.workspace_id and d.alert_occurrence_id=o.id
    and o.workspace_id=s.workspace_id and o.schedule_id=s.id
    and s.workspace_id=a.workspace_id and s.source_assignment_id=a.id
    and s.alert_kind='client_late' and a.workspace_id=p_workspace_id and a.client_id=p_client_id;
  update app_private.form_alert_occurrences o set job_id=null
  from app_private.form_alert_schedules s,public.form_assignments a
  where o.workspace_id=s.workspace_id and o.schedule_id=s.id
    and s.workspace_id=a.workspace_id and s.source_assignment_id=a.id
    and s.alert_kind='client_late' and a.workspace_id=p_workspace_id and a.client_id=p_client_id;
  delete from public.jobs j using app_private.form_alert_occurrences o,
    app_private.form_alert_schedules s,public.form_assignments a
  where j.kind='forms.alert' and j.payload->>'alert_id'=o.id::text
    and o.workspace_id=s.workspace_id and o.schedule_id=s.id
    and s.workspace_id=a.workspace_id and s.source_assignment_id=a.id
    and s.alert_kind='client_late' and a.workspace_id=p_workspace_id and a.client_id=p_client_id;
  delete from app_private.form_alert_occurrences o using app_private.form_alert_schedules s,public.form_assignments a
  where o.workspace_id=s.workspace_id and o.schedule_id=s.id
    and s.workspace_id=a.workspace_id and s.source_assignment_id=a.id
    and s.alert_kind='client_late' and a.workspace_id=p_workspace_id and a.client_id=p_client_id;
  delete from app_private.form_alert_schedules s using public.form_assignments a
  where s.workspace_id=a.workspace_id and s.source_assignment_id=a.id
    and s.alert_kind='client_late' and a.workspace_id=p_workspace_id and a.client_id=p_client_id;
end $$;
alter function app_private.cancel_f15_client_alerts(uuid,uuid) owner to postgres;
revoke all on function app_private.cancel_f15_client_alerts(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function app_private.f15_cancel_client_alerts_after_relationship_end()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform app_private.cancel_f15_client_alerts(new.workspace_id,new.client_id);
  return new;
end $$;
alter function app_private.f15_cancel_client_alerts_after_relationship_end() owner to postgres;
revoke all on function app_private.f15_cancel_client_alerts_after_relationship_end() from public,anon,authenticated,service_role;
create trigger f15_cancel_client_alerts_after_relationship_end
  after insert on app_private.form_retention_windows
  for each row execute function app_private.f15_cancel_client_alerts_after_relationship_end();

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
      and (s.alert_kind <> 'client_late' or app_private.f15_client_alert_lifecycle_active(s.workspace_id,s.source_assignment_id))
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
        if schedule_row.alert_kind='client_late' and (
          not app_private.f15_client_alert_lifecycle_active(schedule_row.workspace_id,schedule_row.source_assignment_id)
          or exists (
          select 1 from app_private.form_submissions fs
          where fs.workspace_id=schedule_row.workspace_id
            and fs.assignment_id=schedule_row.source_assignment_id
          )
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



create or replace function public.claim_f15_telegram_delivery(p_delivery_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare chat text; d record;
begin
  select x.workspace_id,x.recipient_user_id,x.stage,x.alert_occurrence_id
    into d from app_private.form_alert_deliveries x
    where x.id=p_delivery_id and x.channel='telegram' and x.status='queued'
    for update;
  if not found or not app_private.f15_alert_recipient_authorized(
    d.workspace_id,d.recipient_user_id,d.stage
  ) or exists (
    select 1 from app_private.form_alert_occurrences o
    join app_private.form_alert_schedules s on s.workspace_id=o.workspace_id and s.id=o.schedule_id
    where o.id=d.alert_occurrence_id and s.alert_kind='client_late'
      and not app_private.f15_client_alert_lifecycle_active(s.workspace_id,s.source_assignment_id)
  ) then
    return null;
  end if;
  select l.chat_id into chat from app_private.f15_telegram_links l
    where l.user_id=d.recipient_user_id and l.revoked_at is null for share;
  if chat is null then return null; end if;
  update app_private.form_alert_deliveries
    set status='sending',claimed_at=clock_timestamp()
    where id=p_delivery_id;
  return chat;
end $$;
alter function public.claim_f15_telegram_delivery(uuid) owner to postgres;
revoke all on function public.claim_f15_telegram_delivery(uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_f15_telegram_delivery(uuid) to service_role;

create or replace function app_private.purge_ended_form_answers_at(
  p_workspace_id uuid, p_client_id uuid, p_as_of timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  due_at timestamptz;
  deleted_answers integer := 0;
  deleted_drafts integer := 0;
begin
  if p_workspace_id is null or p_client_id is null or p_as_of is null then
    return '{"status":"invalid"}'::jsonb;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_client_id::text, 0)
  );
  select max(w.purge_after) into due_at
  from app_private.form_retention_windows w
  where w.workspace_id=p_workspace_id and w.client_id=p_client_id;
  if due_at is null or due_at > p_as_of then return '{"status":"not_due"}'::jsonb; end if;
  if exists(select 1 from app_private.form_legal_holds h
    where h.workspace_id=p_workspace_id and h.client_id=p_client_id and h.released_at is null) then
    insert into app_private.form_answer_erasure_controls(outcome,answer_count,draft_count)
    values('deferred_legal_hold',0,0);
    return '{"status":"deferred_legal_hold"}'::jsonb;
  end if;

  perform pg_catalog.set_config('app_private.f15_retention_purge',p_workspace_id::text||':'||p_client_id::text,true);
  perform app_private.cancel_f15_client_alerts(p_workspace_id,p_client_id);
  delete from app_private.form_correction_intents i where i.workspace_id=p_workspace_id and i.assignment_id in (
    select a.id from public.form_assignments a where a.workspace_id=p_workspace_id and a.client_id=p_client_id);
  delete from app_private.form_corrections c where c.workspace_id=p_workspace_id and c.assignment_id in (
    select a.id from public.form_assignments a where a.workspace_id=p_workspace_id and a.client_id=p_client_id);
  delete from app_private.form_submission_intents i where i.workspace_id=p_workspace_id and i.assignment_id in (
    select a.id from public.form_assignments a where a.workspace_id=p_workspace_id and a.client_id=p_client_id);
  delete from app_private.form_draft_intents i where i.workspace_id=p_workspace_id and i.assignment_id in (
    select a.id from public.form_assignments a where a.workspace_id=p_workspace_id and a.client_id=p_client_id);
  delete from app_private.form_submission_slas s where s.workspace_id=p_workspace_id and s.assignment_id in (
    select a.id from public.form_assignments a where a.workspace_id=p_workspace_id and a.client_id=p_client_id);
  delete from app_private.form_submissions s where s.workspace_id=p_workspace_id and s.assignment_id in (
    select a.id from public.form_assignments a where a.workspace_id=p_workspace_id and a.client_id=p_client_id);
  delete from public.form_answer_drafts d where d.workspace_id=p_workspace_id and d.assignment_id in (
    select a.id from public.form_assignments a where a.workspace_id=p_workspace_id and a.client_id=p_client_id);
  get diagnostics deleted_drafts=row_count;
  delete from public.form_answer_revisions r where r.workspace_id=p_workspace_id and r.assignment_id in (
    select a.id from public.form_assignments a where a.workspace_id=p_workspace_id and a.client_id=p_client_id);
  get diagnostics deleted_answers=row_count;
  insert into app_private.form_purge_completions(workspace_id,client_id)
    values(p_workspace_id,p_client_id) on conflict do nothing;
  insert into app_private.form_answer_erasure_controls(outcome,answer_count,draft_count)
    values('purged',deleted_answers,deleted_drafts);
  return jsonb_build_object('status','purged','revisions',deleted_answers,'drafts',deleted_drafts);
end $$;
alter function app_private.purge_ended_form_answers_at(uuid,uuid,timestamptz) owner to postgres;
revoke all on function app_private.purge_ended_form_answers_at(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
