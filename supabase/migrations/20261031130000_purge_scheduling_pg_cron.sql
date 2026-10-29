-- H5 / PO 2026-10-29: pg_cron selected; ACTIVATION DEFERRED TO PRE-PRODUCTION.
-- Supabase installs the extension in pg_catalog; its objects live in cron.
-- Fail rather than silently skip if the target image cannot support pg_cron.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant select on table cron.job to postgres;
revoke all on schema cron from public,anon,authenticated,service_role;
revoke all on all tables in schema cron from public,anon,authenticated,service_role;

-- No SECURITY DEFINER: scheduling must retain the explicit owning caller role.
-- The same transaction lock serializes activation and deactivation.
create function app_private.purge_schedule_deactivate() returns void
language plpgsql security invoker set search_path='' as $$
declare existing_job bigint;
begin
  if current_user <> 'postgres' then
    raise exception 'purge_schedule_owner_required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(11011, 305);
  for existing_job in
    select jobid from cron.job
    where jobname='lifter-f11-purge-signup' and username=current_user
  loop
    perform cron.unschedule(existing_job);
  end loop;
end $$;
alter function app_private.purge_schedule_deactivate() owner to postgres;
revoke all on function app_private.purge_schedule_deactivate() from public,anon,authenticated,service_role;

create function app_private.purge_schedule_activate() returns void
language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'postgres' then
    raise exception 'purge_schedule_owner_required' using errcode='42501';
  end if;
  perform app_private.purge_schedule_deactivate();
  perform cron.schedule(
    'lifter-f11-purge-signup',
    '0 * * * *',
    'select app_private.purge_client_signup_attempts();'
  );
end $$;
alter function app_private.purge_schedule_activate() owner to postgres;
revoke all on function app_private.purge_schedule_activate() from public,anon,authenticated,service_role;

-- Deliberately no activation call, inactive placeholder, or new deletion logic.
-- Owner-only activation/deactivation steps: research/purge-scheduling.md.
