-- Give the purge scheduler a dedicated lock; alert evaluator locks remain unchanged.
create or replace function app_private.f15_forms_purge_schedule_deactivate() returns void
language plpgsql security invoker set search_path = '' as $$
declare existing_job bigint;
begin
  if current_user<>'postgres' then raise exception 'f15_forms_purge_owner_required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(11011,319);
  for existing_job in select jobid from cron.job
    where jobname='lifter-f15-forms-purge' and username=current_user
  loop perform cron.unschedule(existing_job); end loop;
end $$;
alter function app_private.f15_forms_purge_schedule_deactivate() owner to postgres;
revoke all on function app_private.f15_forms_purge_schedule_deactivate() from public,anon,authenticated,service_role;
create or replace function app_private.f15_forms_purge_schedule_activate() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user<>'postgres' then raise exception 'f15_forms_purge_owner_required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(11011,319);
  perform app_private.f15_forms_purge_schedule_deactivate();
  perform cron.schedule('lifter-f15-forms-purge','0 * * * *','select app_private.f15_forms_purge_run();');
end $$;
alter function app_private.f15_forms_purge_schedule_activate() owner to postgres;
revoke all on function app_private.f15_forms_purge_schedule_activate() from public,anon,authenticated,service_role;
