-- F13 T044: trainer productivity point persistence, one point per new client.
-- FR-040/041; SC-019/026. At most one immutable point row exists per client
-- (`UNIQUE(client_id)`); `points = 1` encodes the specified single point.
-- No upgrade, renewal or plan-publication path writes to this table, and no
-- count limit is imposed on plan revisions/publications. The production
-- award entry point (which event and role records the point) is pending a PO
-- decision, so no public award RPC is added here; see PO-DECISION-NEEDED.
create table public.trainer_productivity_points (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  trainer_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  client_id uuid not null,
  points integer not null default 1 check (points = 1),
  awarded_at timestamptz not null default now(),
  recorded_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  unique(workspace_id,id),
  unique(client_id),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict
);

alter table public.trainer_productivity_points owner to postgres;
revoke all on table public.trainer_productivity_points from public,anon,authenticated,service_role;
alter table public.trainer_productivity_points enable row level security;
alter table public.trainer_productivity_points force row level security;
create trigger f13_no_update before update on public.trainer_productivity_points
  for each row execute function app_private.audit_events_immutable();
create trigger f13_no_delete before delete on public.trainer_productivity_points
  for each row execute function app_private.forbid_delete();
create trigger f13_no_truncate before truncate on public.trainer_productivity_points
  for each statement execute function app_private.forbid_delete();

create function app_private.f13_audit_productivity_point() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(auth.uid(),'trainer.productivity_point_awarded',tg_table_name,new.id,new.workspace_id,
      jsonb_build_object('trainer_user_id',new.trainer_user_id,'client_id',new.client_id,
        'points',new.points));
  return new;
end $$;
alter function app_private.f13_audit_productivity_point() owner to postgres;
revoke all on function app_private.f13_audit_productivity_point() from public,anon,authenticated,service_role;
create trigger f13_productivity_point_audit after insert on public.trainer_productivity_points
  for each row execute function app_private.f13_audit_productivity_point();
