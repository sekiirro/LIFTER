-- S70-PO-1 item 5: route the existing client-late in-app occurrence to the current F11 responsible Trainer.
-- The evaluator remains directly invocable; no pg_cron job is created or activated.
create unique index form_alert_occurrences_one_client_trainer_deadline
  on app_private.form_alert_occurrences(workspace_id,schedule_id)
  where stage='client_trainer_24h';

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
  client_id uuid;
  trainer_id uuid;
begin
  if p_evaluation_at is null or p_batch is null or p_batch < 1 or p_batch > 1000 then
    return jsonb_build_object('status','invalid_input');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(11011,318);

  for schedule_row in
    select s.* from app_private.form_alert_schedules s
    where (p_workspace_id is null or s.workspace_id=p_workspace_id)
      and s.deadline_at <= p_evaluation_at
      and (s.alert_kind <> 'client_late' or s.deadline_at + interval '7 days' >= p_evaluation_at)
      and (s.alert_kind <> 'client_late' or not exists (
        select 1 from app_private.form_alert_occurrences legacy
        where legacy.workspace_id=s.workspace_id and legacy.schedule_id=s.id
          and legacy.stage in ('client_owners_24h','client_owners_48h')
      ))
      and (s.alert_kind <> 'client_late' or app_private.f15_client_alert_lifecycle_active(s.workspace_id,s.source_assignment_id))
      and (
        (
          s.alert_kind='client_late'
          and not exists (
            select 1 from app_private.form_submissions fs
            where fs.workspace_id=s.workspace_id and fs.assignment_id=s.source_assignment_id
          )
          and (
            exists (
              select 1 from public.staff_profiles sp
              where (
                (sp.role='platform_owner'::public.staff_role and exists (
                  select 1 from public.workspaces w
                  where w.id=s.workspace_id and w.created_by=sp.user_id
                ))
                or (sp.role='workspace_owner'::public.staff_role and exists (
                  select 1 from public.workspace_memberships wm
                  where wm.workspace_id=s.workspace_id and wm.user_id=sp.user_id and wm.revoked_at is null
                ))
              )
              and not exists (
                select 1 from app_private.form_alert_occurrences o
                where o.workspace_id=s.workspace_id and o.schedule_id=s.id
                  and o.stage='client_owners_immediate' and o.recipient_user_id=sp.user_id
              )
            )
            or (
              s.deadline_at + interval '24 hours' <= p_evaluation_at
              and exists (
                select 1 from public.form_assignments a
                where a.workspace_id=s.workspace_id and a.id=s.source_assignment_id
                  and app_private.current_assigned_trainer(a.workspace_id,a.client_id) is not null
              )
              and not exists (
                select 1 from app_private.form_alert_occurrences o
                where o.workspace_id=s.workspace_id and o.schedule_id=s.id
                  and o.stage='client_trainer_24h'
              )
            )
          )
        )
        or (s.alert_kind='trainer_late'
          and (s.delivered_at is null or s.delivered_at > p_evaluation_at)
          and s.deadline_at + interval '7 days' >= p_evaluation_at)
      )
    and (
      s.alert_kind <> 'trainer_late'
      or (
        s.deadline_at <= p_evaluation_at
        and s.trainer_user_id is not null
        and exists (
          select 1 from public.staff_profiles trainer
          join public.workspace_memberships membership
            on membership.workspace_id=s.workspace_id
            and membership.user_id=trainer.user_id and membership.revoked_at is null
          where trainer.user_id=s.trainer_user_id and trainer.role='trainer'::public.staff_role
        )
        and not exists (
          select 1 from app_private.form_alert_occurrences occurrence
          where occurrence.workspace_id=s.workspace_id and occurrence.schedule_id=s.id
            and occurrence.stage='trainer_initial'
            and occurrence.recipient_user_id=s.trainer_user_id
        )
      )
      or (
        s.deadline_at + interval '24 hours' <= p_evaluation_at
        and exists (
          select 1 from public.staff_profiles owner_profile
          where (
            (owner_profile.role='platform_owner'::public.staff_role and exists (
              select 1 from public.workspaces owner_workspace
              where owner_workspace.id=s.workspace_id and owner_workspace.created_by=owner_profile.user_id
            ))
            or (owner_profile.role='workspace_owner'::public.staff_role and exists (
              select 1 from public.workspace_memberships owner_membership
              where owner_membership.workspace_id=s.workspace_id
                and owner_membership.user_id=owner_profile.user_id and owner_membership.revoked_at is null
            ))
          )
          and not exists (
            select 1 from app_private.form_alert_occurrences occurrence
            where occurrence.workspace_id=s.workspace_id and occurrence.schedule_id=s.id
              and occurrence.stage='trainer_owners_24h'
              and occurrence.recipient_user_id=owner_profile.user_id
          )
        )
      )
    )
    order by s.deadline_at,s.id
    limit p_batch
    for update of s skip locked
  loop
    catch_up_until := schedule_row.deadline_at + interval '7 days';
    if schedule_row.alert_kind='client_late' then
      perform 1 from public.clients c
      join public.form_assignments a
        on a.workspace_id=c.workspace_id and a.client_id=c.id
      where a.workspace_id=schedule_row.workspace_id
        and a.id=schedule_row.source_assignment_id
      for share of c;
      select a.client_id into client_id from public.form_assignments a
      where a.workspace_id=schedule_row.workspace_id
        and a.id=schedule_row.source_assignment_id;
      trainer_id := app_private.current_assigned_trainer(
        schedule_row.workspace_id,client_id
      );
      perform 1 from public.workspace_memberships wm
      join public.staff_profiles sp on sp.user_id=wm.user_id
      where wm.workspace_id=schedule_row.workspace_id and wm.revoked_at is null
        and sp.role='workspace_owner'::public.staff_role
      order by wm.user_id
      for update of wm;
    end if;
    for stage_row in
      select stage,stage_at from (
        select 'client_owners_immediate'::text as stage,
          schedule_row.deadline_at as stage_at
        where schedule_row.alert_kind='client_late'
        union all
        select 'client_trainer_24h',schedule_row.deadline_at + interval '24 hours'
        where schedule_row.alert_kind='client_late'
          and trainer_id is not null
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
          and sp.user_id=case when stage_row.stage='client_trainer_24h'
            then trainer_id else schedule_row.trainer_user_id end
          and sp.role='trainer'::public.staff_role
          and exists (
            select 1 from public.workspace_memberships wm
            where wm.workspace_id=schedule_row.workspace_id
              and wm.user_id=sp.user_id and wm.revoked_at is null
          )
        ) or (
          stage_row.stage in ('client_owners_immediate','trainer_owners_24h')
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
        ) on conflict do nothing
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

create function app_private.f15_alert_trainer_assignment_visible(
  p_workspace_id uuid,p_assignment_id uuid,p_recipient_user_id uuid
) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare client_id uuid;
begin
  if p_recipient_user_id is null or p_recipient_user_id is distinct from auth.uid() then
    return false;
  end if;
  select a.client_id into client_id from public.form_assignments a
  where a.workspace_id=p_workspace_id and a.id=p_assignment_id;
  return found and app_private.current_assigned_trainer(p_workspace_id,client_id)=p_recipient_user_id;
end
$$;
alter function app_private.f15_alert_trainer_assignment_visible(uuid,uuid,uuid) owner to postgres;
revoke all on function app_private.f15_alert_trainer_assignment_visible(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function app_private.f15_alert_trainer_assignment_visible(uuid,uuid,uuid)
  to authenticated;

drop policy form_alert_inbox_recipient_only on app_private.form_alert_inbox;
create policy form_alert_inbox_recipient_only on app_private.form_alert_inbox
  for select to authenticated using (
    recipient_user_id=(select auth.uid())
    and (stage<>'client_trainer_24h' or app_private.f15_alert_trainer_assignment_visible(
      workspace_id,source_assignment_id,recipient_user_id
    ))
  );

create or replace function public.read_form_alert_inbox(
  p_limit integer default 50,p_before timestamptz default null
) returns table(delivery_id uuid,workspace_id uuid,source_assignment_id uuid,
  stage text,created_at timestamptz,read_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := auth.uid();
  inbox_row record;
begin
  if actor_id is null or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'form_alert_inbox_unavailable' using errcode='P0001';
  end if;
  for inbox_row in
    select i.* from app_private.form_alert_inbox i
    where i.recipient_user_id=actor_id
      and (p_before is null or i.created_at<p_before)
      and (i.stage<>'client_trainer_24h' or app_private.f15_alert_trainer_assignment_visible(
        i.workspace_id,i.source_assignment_id,actor_id
      ))
      and app_private.f15_alert_recipient_authorized(
        i.workspace_id,actor_id,i.stage
      )
    order by i.created_at desc,i.id desc limit p_limit
  loop
    insert into public.audit_events(
      actor_user_id,action,target_table,target_id,workspace_id,details
    ) values (
      actor_id,'form.alert_inbox_read','form_alert_inbox',inbox_row.id,
      inbox_row.workspace_id,jsonb_build_object('delivery_id',inbox_row.delivery_id,
        'source_assignment_id',inbox_row.source_assignment_id,'stage',inbox_row.stage)
    );
    delivery_id:=inbox_row.delivery_id;
    workspace_id:=inbox_row.workspace_id;
    source_assignment_id:=inbox_row.source_assignment_id;
    stage:=inbox_row.stage;
    created_at:=inbox_row.created_at;
    read_at:=inbox_row.read_at;
    return next;
  end loop;
exception when others then
  raise exception 'form_alert_inbox_unavailable' using errcode='P0001';
end
$$;
alter function public.read_form_alert_inbox(integer,timestamptz) owner to postgres;
revoke all on function public.read_form_alert_inbox(integer,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.read_form_alert_inbox(integer,timestamptz) to authenticated;

create or replace function public.mark_form_alert_read(p_delivery_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := auth.uid();
  inbox_row record;
begin
  if actor_id is null or p_delivery_id is null then
    return jsonb_build_object('status','not_found');
  end if;
  select i.* into inbox_row from app_private.form_alert_inbox i
  where i.delivery_id=p_delivery_id and i.recipient_user_id=actor_id
  for update;
  if not found or not app_private.f15_alert_recipient_authorized(
    inbox_row.workspace_id,actor_id,inbox_row.stage
  ) or (inbox_row.stage='client_trainer_24h'
    and not app_private.f15_alert_trainer_assignment_visible(
      inbox_row.workspace_id,inbox_row.source_assignment_id,actor_id
    )) then return jsonb_build_object('status','not_found'); end if;
  if inbox_row.read_at is null then
    update app_private.form_alert_inbox set read_at=clock_timestamp()
    where id=inbox_row.id;
    insert into public.audit_events(
      actor_user_id,action,target_table,target_id,workspace_id,details
    ) values (
      actor_id,'form.alert_inbox_marked_read','form_alert_inbox',inbox_row.id,
      inbox_row.workspace_id,jsonb_build_object('delivery_id',inbox_row.delivery_id,
        'source_assignment_id',inbox_row.source_assignment_id,'stage',inbox_row.stage)
    );
  end if;
  return jsonb_build_object('status','read');
exception when others then
  raise exception 'form_alert_inbox_unavailable' using errcode='P0001';
end
$$;
alter function public.mark_form_alert_read(uuid) owner to postgres;
revoke all on function public.mark_form_alert_read(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mark_form_alert_read(uuid) to authenticated;
