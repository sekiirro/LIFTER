create or replace function public.mark_form_alert_read(p_delivery_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor_id uuid := auth.uid(); inbox_row record;
begin
  if actor_id is null or not exists(select 1 from public.staff_profiles s where s.user_id=actor_id) then
    return null;
  end if;
  if p_delivery_id is null then return jsonb_build_object('status','not_found'); end if;
  select i.* into inbox_row from app_private.form_alert_inbox i
    where i.delivery_id=p_delivery_id and i.recipient_user_id=actor_id for update;
  if not found or not app_private.f15_alert_recipient_authorized(inbox_row.workspace_id,actor_id,inbox_row.stage) then
    return jsonb_build_object('status','not_found');
  end if;
  if inbox_row.read_at is null then
    update app_private.form_alert_inbox set read_at=clock_timestamp() where id=inbox_row.id;
    insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
      values(actor_id,'form.alert_inbox_marked_read','form_alert_inbox',inbox_row.id,
        inbox_row.workspace_id,jsonb_build_object('delivery_id',inbox_row.delivery_id,
          'source_assignment_id',inbox_row.source_assignment_id,'stage',inbox_row.stage));
  end if;
  return jsonb_build_object('status','read');
exception when others then
  raise exception 'form_alert_inbox_unavailable' using errcode='P0001';
end $$;
alter function public.mark_form_alert_read(uuid) owner to postgres;
revoke all on function public.mark_form_alert_read(uuid) from public,anon,authenticated,service_role;
grant execute on function public.mark_form_alert_read(uuid) to authenticated;
