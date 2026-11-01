-- A Stop ends a live freeze within its planned interval. Remove remains valid
-- after the planned interval so its zero-contribution reversal can be recorded.
create or replace function app_private.f13_freeze_event_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f public.subscription_freezes%rowtype;
begin
  select * into f from public.subscription_freezes x
    where x.workspace_id=new.workspace_id and x.subscription_id=new.subscription_id and x.id=new.freeze_id
    for update;
  if not found or exists (select 1 from public.refund_operations r
      where r.workspace_id=new.workspace_id and r.subscription_id=new.subscription_id)
    or (new.kind='stop' and exists (
      select 1 from public.subscription_freeze_events e
      where e.workspace_id=new.workspace_id and e.subscription_id=new.subscription_id
        and e.freeze_id=new.freeze_id and e.kind='remove'))
    or new.actor_user_id is distinct from auth.uid()
    or not app_private.f12_actor_allowed(new.workspace_id,'manage_freeze',false)
    or new.effective_on < f.applied_on
    or (new.kind='stop' and new.effective_on >= f.applied_on + f.duration_days) then
    raise exception 'invalid_freeze_event' using errcode='23514';
  end if;
  return new;
end $$;

alter function app_private.f13_freeze_event_guard() owner to postgres;
revoke all on function app_private.f13_freeze_event_guard() from public,anon,authenticated,service_role;
