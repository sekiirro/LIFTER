-- F15 purge consumer: owner-only, inactive until an explicit operational activation.
create function app_private.purge_ended_form_answers_at(
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
  delete from app_private.form_correction_intents i where i.workspace_id=p_workspace_id and i.assignment_id in (
    select a.id from public.form_assignments a where a.workspace_id=p_workspace_id and a.client_id=p_client_id);
  delete from app_private.form_corrections c where c.workspace_id=p_workspace_id and c.assignment_id in (
    select a.id from public.form_assignments a where a.workspace_id=p_workspace_id and a.client_id=p_client_id);
  delete from app_private.form_submission_intents i where i.workspace_id=p_workspace_id and i.assignment_id in (
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
  insert into app_private.form_answer_erasure_controls(outcome,answer_count,draft_count)
  values('purged',deleted_answers,deleted_drafts);
  return jsonb_build_object('status','purged','revisions',deleted_answers,'drafts',deleted_drafts);
end $$;
alter function app_private.purge_ended_form_answers_at(uuid,uuid,timestamptz) owner to postgres;
revoke all on function app_private.purge_ended_form_answers_at(uuid,uuid,timestamptz)
  from public,anon,authenticated,service_role;

create or replace function app_private.purge_ended_form_answers(p_workspace_id uuid,p_client_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select app_private.purge_ended_form_answers_at(p_workspace_id,p_client_id,pg_catalog.clock_timestamp())
$$;
alter function app_private.purge_ended_form_answers(uuid,uuid) owner to postgres;
revoke all on function app_private.purge_ended_form_answers(uuid,uuid) from public,anon,authenticated,service_role;

create function app_private.f15_forms_purge_run() returns integer
language plpgsql security invoker set search_path = '' as $$
declare item record; purged integer:=0;
begin
  if current_user<>'postgres' then raise exception 'f15_forms_purge_owner_required' using errcode='42501'; end if;
  for item in
    select w.workspace_id,w.client_id from app_private.form_retention_windows w
    where w.purge_after<=pg_catalog.clock_timestamp()
    group by w.workspace_id,w.client_id order by min(w.purge_after),w.workspace_id,w.client_id limit 250
  loop
    perform app_private.purge_ended_form_answers(item.workspace_id,item.client_id);
    purged:=purged+1;
  end loop;
  return purged;
end $$;
alter function app_private.f15_forms_purge_run() owner to postgres;
revoke all on function app_private.f15_forms_purge_run() from public,anon,authenticated,service_role;

create function app_private.f15_forms_purge_schedule_deactivate() returns void
language plpgsql security invoker set search_path = '' as $$
declare existing_job bigint;
begin
  if current_user<>'postgres' then raise exception 'f15_forms_purge_owner_required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(11011,318);
  for existing_job in select jobid from cron.job
    where jobname='lifter-f15-forms-purge' and username=current_user
  loop perform cron.unschedule(existing_job); end loop;
end $$;
alter function app_private.f15_forms_purge_schedule_deactivate() owner to postgres;
revoke all on function app_private.f15_forms_purge_schedule_deactivate() from public,anon,authenticated,service_role;

create function app_private.f15_forms_purge_schedule_activate() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user<>'postgres' then raise exception 'f15_forms_purge_owner_required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(11011,318);
  perform app_private.f15_forms_purge_schedule_deactivate();
  perform cron.schedule('lifter-f15-forms-purge','0 * * * *','select app_private.f15_forms_purge_run();');
end $$;
alter function app_private.f15_forms_purge_schedule_activate() owner to postgres;
revoke all on function app_private.f15_forms_purge_schedule_activate() from public,anon,authenticated,service_role;
-- Activation is intentionally never called by a migration or by tests.
