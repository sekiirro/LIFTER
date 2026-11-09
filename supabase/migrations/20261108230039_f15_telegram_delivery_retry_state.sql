alter table app_private.form_alert_deliveries
  drop constraint form_alert_deliveries_status_check;
alter table app_private.form_alert_deliveries
  add constraint form_alert_deliveries_status_check
  check(status in ('queued','sending','delivered','dead'));

create or replace function public.claim_f15_telegram_delivery(p_delivery_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare chat text; d record;
begin
  select x.workspace_id,x.recipient_user_id,x.stage into d from app_private.form_alert_deliveries x
    where x.id=p_delivery_id and x.channel='telegram' and x.status='queued' for update;
  if not found or not app_private.f15_alert_recipient_authorized(d.workspace_id,d.recipient_user_id,d.stage) then return null; end if;
  select l.chat_id into chat from app_private.f15_telegram_links l
    where l.user_id=d.recipient_user_id and l.revoked_at is null for share;
  if chat is null then return null; end if;
  update app_private.form_alert_deliveries set status='sending' where id=p_delivery_id;
  return chat;
end $$;
alter function public.claim_f15_telegram_delivery(uuid) owner to postgres;
revoke all on function public.claim_f15_telegram_delivery(uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_f15_telegram_delivery(uuid) to service_role;

create or replace function public.prepare_f15_telegram_delivery(p_alert_id uuid,p_recipient_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o record; d_id uuid; chat text; d_status text;
begin
  select x.id,x.workspace_id,x.stage,x.recipient_user_id into o
    from app_private.form_alert_occurrences x
    where x.id=p_alert_id and x.recipient_user_id=p_recipient_id;
  if not found or not app_private.f15_alert_recipient_authorized(o.workspace_id,p_recipient_id,o.stage) then
    return jsonb_build_object('status','unavailable');
  end if;
  select l.chat_id into chat from app_private.f15_telegram_links l
    where l.user_id=p_recipient_id and l.revoked_at is null;
  if chat is null then return jsonb_build_object('status','unlinked'); end if;
  insert into app_private.form_alert_deliveries(workspace_id,alert_occurrence_id,stage,recipient_user_id,channel,status)
    values(o.workspace_id,o.id,o.stage,p_recipient_id,'telegram','queued')
    on conflict(workspace_id,alert_occurrence_id,stage,recipient_user_id,channel) do nothing;
  select id,status into d_id,d_status from app_private.form_alert_deliveries
    where workspace_id=o.workspace_id and alert_occurrence_id=o.id and stage=o.stage
      and recipient_user_id=p_recipient_id and channel='telegram';
  if d_status is distinct from 'queued' then
    return jsonb_build_object('status',case when d_status='sending' then 'already_processing' else 'already_delivered' end);
  end if;
  return jsonb_build_object('status','ready','delivery_id',d_id,'chat_id',chat);
end $$;
alter function public.prepare_f15_telegram_delivery(uuid,uuid) owner to postgres;
revoke all on function public.prepare_f15_telegram_delivery(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_f15_telegram_delivery(uuid,uuid) to service_role;

create function public.finish_f15_telegram_delivery(p_delivery_id uuid,p_status text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('queued','delivered','dead') then return false; end if;
  update app_private.form_alert_deliveries set status=p_status,
    delivered_at=case when p_status='delivered' then clock_timestamp() else null end
  where id=p_delivery_id and channel='telegram' and status='sending';
  return found;
end $$;
alter function public.finish_f15_telegram_delivery(uuid,text) owner to postgres;
revoke all on function public.finish_f15_telegram_delivery(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.finish_f15_telegram_delivery(uuid,text) to service_role;
