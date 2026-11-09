-- S25-PO-8: in-app is the mandatory alert channel. Rows stay IDs-only.
alter table app_private.form_alert_occurrences
  add constraint form_alert_occurrences_workspace_id_id_key unique (workspace_id,id);

create table app_private.form_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  alert_occurrence_id uuid not null,
  stage text not null check (stage in (
    'client_trainer_24h','client_owners_24h','client_owners_48h',
    'trainer_initial','trainer_owners_24h'
  )),
  recipient_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  channel text not null check (channel in ('in_app','telegram')),
  status text not null default 'queued' check (status in ('queued','delivered','dead')),
  created_at timestamptz not null default clock_timestamp(),
  delivered_at timestamptz,
  last_error text check (last_error is null or last_error ~ '^[a-z0-9_.:-]{1,64}$'),
  unique (workspace_id,id),
  unique (workspace_id,alert_occurrence_id,stage,recipient_user_id,channel),
  foreign key (workspace_id,alert_occurrence_id)
    references app_private.form_alert_occurrences(workspace_id,id) on delete restrict
);

create table app_private.form_alert_inbox (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  delivery_id uuid not null,
  recipient_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  source_assignment_id uuid not null,
  stage text not null check (stage in (
    'client_trainer_24h','client_owners_24h','client_owners_48h',
    'trainer_initial','trainer_owners_24h'
  )),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique (workspace_id,id),
  unique (workspace_id,delivery_id),
  foreign key (workspace_id,delivery_id)
    references app_private.form_alert_deliveries(workspace_id,id) on delete restrict,
  foreign key (workspace_id,source_assignment_id)
    references public.form_assignments(workspace_id,id) on delete restrict
);

alter table app_private.form_alert_deliveries enable row level security;
alter table app_private.form_alert_deliveries force row level security;
alter table app_private.form_alert_inbox enable row level security;
alter table app_private.form_alert_inbox force row level security;
create policy form_alert_inbox_recipient_only on app_private.form_alert_inbox
  for select to authenticated using (recipient_user_id = (select auth.uid()));
revoke all on app_private.form_alert_deliveries,app_private.form_alert_inbox
  from public,anon,authenticated,service_role;

create function app_private.write_f15_in_app_alert(p_occurrence_id uuid)
returns uuid
language plpgsql security definer set search_path='' as $$
declare
  source_row record;
  delivery_id uuid;
begin
  select o.workspace_id,o.id,o.stage,o.recipient_user_id,s.source_assignment_id
    into source_row
  from app_private.form_alert_occurrences o
  join app_private.form_alert_schedules s
    on s.workspace_id=o.workspace_id and s.id=o.schedule_id
  where o.id=p_occurrence_id;
  if not found then return null; end if;

  insert into app_private.form_alert_deliveries(
    workspace_id,alert_occurrence_id,stage,recipient_user_id,channel,status,delivered_at
  ) values (
    source_row.workspace_id,source_row.id,source_row.stage,
    source_row.recipient_user_id,'in_app','delivered',clock_timestamp()
  ) on conflict (workspace_id,alert_occurrence_id,stage,recipient_user_id,channel)
    do nothing returning id into delivery_id;
  if delivery_id is null then
    select d.id into delivery_id from app_private.form_alert_deliveries d
    where d.workspace_id=source_row.workspace_id
      and d.alert_occurrence_id=source_row.id and d.stage=source_row.stage
      and d.recipient_user_id=source_row.recipient_user_id and d.channel='in_app';
  end if;
  insert into app_private.form_alert_inbox(
    workspace_id,delivery_id,recipient_user_id,source_assignment_id,stage
  ) values (
    source_row.workspace_id,delivery_id,source_row.recipient_user_id,
    source_row.source_assignment_id,source_row.stage
  ) on conflict on constraint form_alert_inbox_workspace_id_delivery_id_key
    do nothing;
  return delivery_id;
end
$$;
alter function app_private.write_f15_in_app_alert(uuid) owner to postgres;
revoke all on function app_private.write_f15_in_app_alert(uuid)
  from public,anon,authenticated,service_role;

create function app_private.f15_alert_inbox_after_occurrence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.write_f15_in_app_alert(new.id);
  return new;
end
$$;
alter function app_private.f15_alert_inbox_after_occurrence() owner to postgres;
revoke all on function app_private.f15_alert_inbox_after_occurrence()
  from public,anon,authenticated,service_role;
create trigger f15_alert_inbox_after_occurrence
  after insert on app_private.form_alert_occurrences
  for each row execute function app_private.f15_alert_inbox_after_occurrence();

create function public.read_form_alert_inbox(p_limit integer default 50,p_before timestamptz default null)
returns table(delivery_id uuid,workspace_id uuid,source_assignment_id uuid,
  stage text,created_at timestamptz,read_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := auth.uid();
  inbox_row record;
begin
  if actor_id is null or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'form_alert_inbox_unavailable' using errcode='P0001';
  end if;
  for inbox_row in
    select i.* from app_private.form_alert_inbox i
    where i.recipient_user_id=actor_id
      and (p_before is null or i.created_at<p_before)
      and app_private.f15_alert_recipient_authorized(
        i.workspace_id,actor_id,i.stage
      )
    order by i.created_at desc,i.id desc limit p_limit
  loop
    insert into public.audit_events(
      actor_user_id,action,target_table,target_id,workspace_id,details
    ) values (
      actor_id,'form.alert_inbox_read','form_alert_inbox',inbox_row.id,
      inbox_row.workspace_id,jsonb_build_object('delivery_id',inbox_row.delivery_id,
        'source_assignment_id',inbox_row.source_assignment_id,'stage',inbox_row.stage)
    );
    delivery_id:=inbox_row.delivery_id;
    workspace_id:=inbox_row.workspace_id;
    source_assignment_id:=inbox_row.source_assignment_id;
    stage:=inbox_row.stage;
    created_at:=inbox_row.created_at;
    read_at:=inbox_row.read_at;
    return next;
  end loop;
exception when others then
  raise exception 'form_alert_inbox_unavailable' using errcode='P0001';
end
$$;
alter function public.read_form_alert_inbox(integer,timestamptz) owner to postgres;
revoke all on function public.read_form_alert_inbox(integer,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.read_form_alert_inbox(integer,timestamptz) to authenticated;

create function public.mark_form_alert_read(p_delivery_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := auth.uid();
  inbox_row record;
begin
  if actor_id is null or p_delivery_id is null then
    return jsonb_build_object('status','not_found');
  end if;
  select i.* into inbox_row from app_private.form_alert_inbox i
  where i.delivery_id=p_delivery_id and i.recipient_user_id=actor_id
  for update;
  if not found or not app_private.f15_alert_recipient_authorized(
    inbox_row.workspace_id,actor_id,inbox_row.stage
  ) then return jsonb_build_object('status','not_found'); end if;
  if inbox_row.read_at is null then
    update app_private.form_alert_inbox set read_at=clock_timestamp()
    where id=inbox_row.id;
    insert into public.audit_events(
      actor_user_id,action,target_table,target_id,workspace_id,details
    ) values (
      actor_id,'form.alert_inbox_marked_read','form_alert_inbox',inbox_row.id,
      inbox_row.workspace_id,jsonb_build_object('delivery_id',inbox_row.delivery_id,
        'source_assignment_id',inbox_row.source_assignment_id,'stage',inbox_row.stage)
    );
  end if;
  return jsonb_build_object('status','read');
exception when others then
  raise exception 'form_alert_inbox_unavailable' using errcode='P0001';
end
$$;
alter function public.mark_form_alert_read(uuid) owner to postgres;
revoke all on function public.mark_form_alert_read(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mark_form_alert_read(uuid) to authenticated;
