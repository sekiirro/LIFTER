-- S41 round-16 forward-only fixes for builder validation, alert lifecycle, and candidate batching.
create or replace function app_private.save_workspace_form_draft(
  p_workspace_id uuid,p_form_id uuid,p_expected_revision integer,
  p_definition jsonb,p_request_id uuid,p_actor_user_id uuid,p_name text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_version public.form_versions%rowtype;
  next_revision integer;
  hash text;
  cached jsonb;
  result jsonb;
  policy_version text;
  is_new boolean := false;
begin
  if p_workspace_id is null or p_form_id is null or p_expected_revision is null or p_request_id is null
    or p_actor_user_id is null or p_name is null or btrim(p_name)='' or char_length(p_name)>160
    or not app_private.f15_valid_builder_definition(p_definition,false) then
    return jsonb_build_object('status','invalid');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'f15-builder-request:'||p_workspace_id::text||':'||p_actor_user_id::text||':'||p_request_id::text,0));
  if auth.uid() is not null and (
    app_private.current_staff_role() is null
    or not app_private.role_has_capability(app_private.current_staff_role(),'author_forms')
    or not app_private.has_workspace_access(p_workspace_id,'author_forms')
  ) then return null; end if;
  hash:=pg_catalog.md5(p_expected_revision::text||':'||p_name||':'||p_definition::text);
  cached:=app_private.f15_builder_cached_result(p_workspace_id,p_actor_user_id,p_request_id,'save',hash);
  if cached is not null then return cached; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'f15-form:'||p_workspace_id::text||':'||p_form_id::text,0));
  if auth.uid() is not null and (
    app_private.current_staff_role() is null
    or not app_private.role_has_capability(app_private.current_staff_role(),'author_forms')
    or not app_private.has_workspace_access(p_workspace_id,'author_forms')
  ) then return null; end if;
  select v.* into current_version from public.form_versions v
    where v.workspace_id=p_workspace_id and v.form_id=p_form_id
    order by v.version_number desc limit 1 for update;
  if not found then
    if p_expected_revision<>0 then return jsonb_build_object('status','missing'); end if;
    select p.version into policy_version from app_private.terms_policy_versions p
      where p.policy_kind='terms' and p.status='published'
      order by p.created_at desc,p.version desc limit 1;
    if policy_version is null then return jsonb_build_object('status','policy_required'); end if;
    insert into public.forms(workspace_id,id,name) values(p_workspace_id,p_form_id,p_name);
    insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
      values(p_workspace_id,p_form_id,1,policy_version,p_definition,'draft');
    select v.* into current_version from public.form_versions v
      where v.workspace_id=p_workspace_id and v.form_id=p_form_id and v.version_number=1 for update;
    is_new:=true;
  end if;
  if not is_new and current_version.version_number<>p_expected_revision then return jsonb_build_object('status','conflict'); end if;
  if current_version.status='retired' then return jsonb_build_object('status','forbidden'); end if;
  if is_new then
    next_revision:=1;
  else
    next_revision:=current_version.version_number+1;
    if current_version.status='draft' then
      update public.form_versions set version_number=next_revision,definition=p_definition
        where workspace_id=p_workspace_id and form_id=p_form_id and version_number=current_version.version_number;
    else
      insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
        values(p_workspace_id,p_form_id,next_revision,current_version.terms_policy_version,p_definition,'draft');
    end if;
  end if;
  update public.forms set name=p_name where workspace_id=p_workspace_id and id=p_form_id;
  result:=jsonb_build_object('status','ok','formId',p_form_id,'revision',next_revision,
    'definition',p_definition,'name',p_name,'formStatus','draft');
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(p_actor_user_id,'form.draft_saved','forms',p_form_id,p_workspace_id,
      jsonb_build_object('form_id',p_form_id,'revision',next_revision));
  perform app_private.f15_builder_store_result(p_workspace_id,p_actor_user_id,p_request_id,'save',hash,result);
  return result;
end
$$;
alter function app_private.save_workspace_form_draft(uuid,uuid,integer,jsonb,uuid,uuid,text) owner to postgres;
revoke all on function app_private.save_workspace_form_draft(uuid,uuid,integer,jsonb,uuid,uuid,text) from public,anon,authenticated,service_role;

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
            where fs.workspace_id=s.workspace_id and fs.assignment_id=s.source_assignment_id
          )
        )
        and not (
          s.alert_kind='client_late'
          and not exists (
            select 1 from public.staff_profiles sp
            where (
              (sp.role='platform_owner'::public.staff_role and exists (select 1 from public.workspaces w where w.id=s.workspace_id and w.created_by=sp.user_id))
              or (sp.role='workspace_owner'::public.staff_role and exists (select 1 from public.workspace_memberships wm where wm.workspace_id=s.workspace_id and wm.user_id=sp.user_id and wm.revoked_at is null))
            )
            and not exists (
              select 1 from app_private.form_alert_occurrences o
              where o.workspace_id=s.workspace_id and o.schedule_id=s.id and o.stage='client_owners_immediate' and o.recipient_user_id=sp.user_id
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
          stage_row.stage='trainer_initial'
          and sp.user_id=schedule_row.trainer_user_id
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
revoke all on function app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer) from public,anon,authenticated,service_role;

create or replace function app_private.f15_client_alert_lifecycle_active(p_workspace_id uuid,p_assignment_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.form_assignments a
    join public.clients c on c.workspace_id=a.workspace_id and c.id=a.client_id
    where a.workspace_id=p_workspace_id and a.id=p_assignment_id
      and c.deactivated_at is null
      and not exists (
        select 1 from app_private.form_retention_windows w
        where w.workspace_id=a.workspace_id and w.client_id=a.client_id
      )
  )
$$;
alter function app_private.f15_client_alert_lifecycle_active(uuid,uuid) owner to postgres;
revoke all on function app_private.f15_client_alert_lifecycle_active(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function app_private.f15_valid_slider_label(p_label jsonb)
returns boolean
language sql immutable set search_path = '' as $$
  select case jsonb_typeof(p_label)
    when 'string' then octet_length(p_label #>> '{}') between 1 and 4096
    when 'object' then
      (select count(*) from jsonb_object_keys(p_label)) = 2
      and jsonb_typeof(p_label->'en') is not distinct from 'string'
      and jsonb_typeof(p_label->'ar') is not distinct from 'string'
      and length(btrim(p_label->>'en')) > 0
      and octet_length(p_label->>'en') between 1 and 4096
      and length(btrim(p_label->>'ar')) > 0
      and octet_length(p_label->>'ar') between 1 and 4096
    else false
  end
$$;
alter function app_private.f15_valid_slider_label(jsonb) owner to postgres;
revoke all on function app_private.f15_valid_slider_label(jsonb) from public,anon,authenticated,service_role;

-- Backfill only deactivations attributable to their immutable refund operation.
-- The existing retention-window triggers stamp purge_after and cancel client alerts.
insert into app_private.form_retention_windows(
  workspace_id,client_id,source_event_id,source_kind,ended_at
)
select c.workspace_id,c.id,r.id,'refund',c.deactivated_at
from public.clients c
join public.refund_operations r
  on r.workspace_id=c.workspace_id and r.client_id=c.id and r.recorded_at=c.deactivated_at
where c.deactivated_at is not null and c.deactivation_reason='refund'
on conflict (workspace_id,client_id,source_event_id) do nothing;
