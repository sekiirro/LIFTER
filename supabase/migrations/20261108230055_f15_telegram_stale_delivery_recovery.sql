-- S33 review: recover crashed Telegram deliveries after the worker/job lease expires.
alter table app_private.form_alert_deliveries
  add column claimed_at timestamptz;

create or replace function public.claim_f15_telegram_delivery(p_delivery_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare chat text; d record;
begin
  select x.workspace_id,x.recipient_user_id,x.stage
    into d from app_private.form_alert_deliveries x
    where x.id=p_delivery_id and x.channel='telegram' and x.status='queued'
    for update;
  if not found or not app_private.f15_alert_recipient_authorized(
    d.workspace_id,d.recipient_user_id,d.stage
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
revoke all on function public.claim_f15_telegram_delivery(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_f15_telegram_delivery(uuid) to service_role;

create or replace function public.prepare_f15_telegram_delivery(
  p_alert_id uuid,p_recipient_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare o record; d_id uuid; chat text; d_status text; d_claimed_at timestamptz;
begin
  select x.id,x.workspace_id,x.stage,x.recipient_user_id into o
    from app_private.form_alert_occurrences x
    where x.id=p_alert_id and x.recipient_user_id=p_recipient_id;
  if not found or not app_private.f15_alert_recipient_authorized(
    o.workspace_id,p_recipient_id,o.stage
  ) then
    return jsonb_build_object('status','unavailable');
  end if;
  select l.chat_id into chat from app_private.f15_telegram_links l
    where l.user_id=p_recipient_id and l.revoked_at is null;
  if chat is null then return jsonb_build_object('status','unlinked'); end if;
  insert into app_private.form_alert_deliveries(
    workspace_id,alert_occurrence_id,stage,recipient_user_id,channel,status
  ) values(o.workspace_id,o.id,o.stage,p_recipient_id,'telegram','queued')
    on conflict(workspace_id,alert_occurrence_id,stage,recipient_user_id,channel)
    do nothing;
  select id,status,claimed_at into d_id,d_status,d_claimed_at
    from app_private.form_alert_deliveries
    where workspace_id=o.workspace_id and alert_occurrence_id=o.id
      and stage=o.stage and recipient_user_id=p_recipient_id and channel='telegram'
    for update;
  if d_status='sending' and (
    d_claimed_at is null
    or d_claimed_at<=clock_timestamp()-interval '30 seconds'
  ) then
    update app_private.form_alert_deliveries
      set status='queued',claimed_at=null where id=d_id;
    d_status:='queued';
  end if;
  if d_status is distinct from 'queued' then
    return jsonb_build_object(
      'status',case when d_status='sending' then 'already_processing'
                    else 'already_delivered' end
    );
  end if;
  return jsonb_build_object('status','ready','delivery_id',d_id,'chat_id',chat);
end $$;
alter function public.prepare_f15_telegram_delivery(uuid,uuid) owner to postgres;
revoke all on function public.prepare_f15_telegram_delivery(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_f15_telegram_delivery(uuid,uuid) to service_role;

create or replace function public.finish_f15_telegram_delivery(
  p_delivery_id uuid,p_status text
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('queued','delivered','dead') then return false; end if;
  update app_private.form_alert_deliveries set status=p_status,
    delivered_at=case when p_status='delivered' then clock_timestamp() else null end,
    claimed_at=null
  where id=p_delivery_id and channel='telegram' and status='sending';
  return found;
end $$;
alter function public.finish_f15_telegram_delivery(uuid,text) owner to postgres;
revoke all on function public.finish_f15_telegram_delivery(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.finish_f15_telegram_delivery(uuid,text) to service_role;

create or replace function public.claim_f15_form_alert_jobs(
  p_batch integer default 25,p_lease_seconds integer default 300
) returns setof public.jobs
language plpgsql security definer set search_path='' as $$
begin
  if p_batch is null or p_batch<1 or p_lease_seconds is null or p_lease_seconds<1 then
    raise exception 'Invalid claim parameters' using errcode='22023';
  end if;
  with exhausted as (
    select j.id from public.jobs j where j.kind='forms.alert'
      and j.status='running' and j.lease_expires_at<now()
      and j.attempts>=j.max_attempts for update skip locked
  ), dead_jobs as (
    update public.jobs j set status='dead',last_error='lease_expired',finished_at=now(),
      lease_token=null,lease_expires_at=null
    from exhausted e where j.id=e.id returning j.payload
  )
  update app_private.form_alert_deliveries d set status='dead',claimed_at=null
  from dead_jobs e
  where d.channel='telegram' and d.status in ('queued','sending')
    and d.alert_occurrence_id::text=e.payload->>'alert_id'
    and d.recipient_user_id::text=e.payload->>'recipient_id';

  return query with picked as (
    select j.id from public.jobs j where j.kind='forms.alert' and
      ((j.status='pending' and j.run_at<=now())
        or (j.status='running' and j.lease_expires_at<now()))
    order by j.run_at limit least(p_batch,100) for update skip locked
  ) update public.jobs j set status='running',attempts=j.attempts+1,
      lease_token=gen_random_uuid(),lease_expires_at=now()+p_lease_seconds*interval '1 second'
    from picked where j.id=picked.id returning j.*;
end $$;
alter function public.claim_f15_form_alert_jobs(integer,integer) owner to postgres;
revoke all on function public.claim_f15_form_alert_jobs(integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_f15_form_alert_jobs(integer,integer) to service_role;
