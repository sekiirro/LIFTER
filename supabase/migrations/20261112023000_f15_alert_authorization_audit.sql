-- Recheck and lock recipient authority at enqueue, and audit alert schedule
-- changes with IDs-only details. This remains channel-neutral and P4-gated.

create function app_private.f15_alert_recipient_authorized(
  p_workspace_id uuid,p_recipient_user_id uuid,p_stage text
) returns boolean
language plpgsql security definer set search_path='' as $$
declare
  recipient_role public.staff_role;
  membership_id uuid;
  workspace_creator uuid;
begin
  select sp.role into recipient_role
  from public.staff_profiles sp
  where sp.user_id=p_recipient_user_id
  for share;
  if recipient_role is null then return false; end if;

  if p_stage in ('client_trainer_24h','trainer_initial') then
    if recipient_role <> 'trainer'::public.staff_role then return false; end if;
    select wm.id into membership_id
    from public.workspace_memberships wm
    where wm.workspace_id=p_workspace_id and wm.user_id=p_recipient_user_id
      and wm.revoked_at is null
    for share;
    return membership_id is not null;
  end if;

  if recipient_role='platform_owner'::public.staff_role then
    select w.created_by into workspace_creator
    from public.workspaces w
    where w.id=p_workspace_id and w.created_by=p_recipient_user_id
    for share;
    return workspace_creator is not null;
  end if;
  if recipient_role='workspace_owner'::public.staff_role then
    select wm.id into membership_id
    from public.workspace_memberships wm
    where wm.workspace_id=p_workspace_id and wm.user_id=p_recipient_user_id
      and wm.revoked_at is null
    for share;
    return membership_id is not null;
  end if;
  return false;
end
$$;
alter function app_private.f15_alert_recipient_authorized(uuid,uuid,text) owner to postgres;
revoke all on function app_private.f15_alert_recipient_authorized(uuid,uuid,text)
  from public,anon,authenticated,service_role;

create function app_private.f15_alert_occurrence_authorize_insert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not app_private.f15_alert_recipient_authorized(
    new.workspace_id,new.recipient_user_id,new.stage
  ) then
    return null;
  end if;
  return new;
end
$$;
alter function app_private.f15_alert_occurrence_authorize_insert() owner to postgres;
revoke all on function app_private.f15_alert_occurrence_authorize_insert() from public,anon,authenticated,service_role;
create trigger form_alert_occurrence_authorize_insert
  before insert on app_private.form_alert_occurrences
  for each row execute function app_private.f15_alert_occurrence_authorize_insert();

create function app_private.f15_alert_schedule_audit() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  audit_action text;
begin
  if tg_op='INSERT' then
    audit_action := 'form.alert_scheduled';
  elsif new.trainer_user_id is distinct from old.trainer_user_id
     or new.delivered_at is distinct from old.delivered_at then
    audit_action := 'form.alert_source_updated';
  else
    return new;
  end if;
  insert into public.audit_events(
    actor_user_id,action,target_table,target_id,workspace_id,details
  ) values (
    null,audit_action,'form_alert_schedules',new.id,new.workspace_id,
    jsonb_build_object('schedule_id',new.id,'source_assignment_id',new.source_assignment_id,
      'kind',new.alert_kind)
  );
  return new;
end
$$;
alter function app_private.f15_alert_schedule_audit() owner to postgres;
revoke all on function app_private.f15_alert_schedule_audit() from public,anon,authenticated,service_role;
create trigger form_alert_schedule_audit
  after insert or update on app_private.form_alert_schedules
  for each row execute function app_private.f15_alert_schedule_audit();
