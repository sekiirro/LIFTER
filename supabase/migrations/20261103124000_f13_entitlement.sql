-- Internal entitlement projection. Access decisions always derive from source facts;
-- this table is an idempotent operational snapshot for expiry processing only.
create table app_private.subscription_entitlement_projection (
  workspace_id uuid not null,
  subscription_id uuid not null,
  status text not null check (status in ('awaiting_activation','future','active','frozen','expired','refunded')),
  effective_end_exclusive date,
  as_of_date date not null check (isfinite(as_of_date)),
  materialized_at timestamptz not null default clock_timestamp() check (isfinite(materialized_at)),
  primary key (workspace_id, subscription_id),
  foreign key (workspace_id, subscription_id)
    references public.subscriptions(workspace_id, id) on delete restrict
);
alter table app_private.subscription_entitlement_projection owner to postgres;
revoke all on app_private.subscription_entitlement_projection from public, anon, authenticated, service_role;
alter table app_private.subscription_entitlement_projection enable row level security;
alter table app_private.subscription_entitlement_projection force row level security;

create function app_private.f13_project_entitlement(ws uuid, sid uuid, as_of date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  sub public.subscriptions%rowtype;
  activation public.subscription_activations%rowtype;
  service_start date;
  service_end date;
  is_frozen boolean;
  projected_status text;
begin
  if as_of is null or not isfinite(as_of) then
    raise exception 'invalid_input' using errcode='22023';
  end if;
  select * into sub from public.subscriptions s
    where s.workspace_id=ws and s.id=sid;
  if not found then raise exception 'not_permitted' using errcode='42501'; end if;

  if exists (select 1 from public.refund_operations r
    where r.workspace_id=ws and r.subscription_id=sid) then
    return jsonb_build_object('status','refunded','effective_end_exclusive',null);
  end if;
  select * into activation from public.subscription_activations a
    where a.workspace_id=ws and a.subscription_id=sid;
  if not found then
    return jsonb_build_object('status','awaiting_activation','effective_end_exclusive',null);
  end if;

  service_start := (activation.activated_at at time zone 'Africa/Cairo')::date;
  select service_start + sub.duration_days + coalesce(sum(app_private.f13_freeze_contribution(ws,sid,f.id)),0)::integer
    into service_end
    from public.subscription_freezes f
    where f.workspace_id=ws and f.subscription_id=sid;
  if service_end is null then service_end := service_start + sub.duration_days; end if;
  if as_of < service_start then projected_status := 'future';
  elsif as_of >= service_end then projected_status := 'expired';
  else
    select exists (
      select 1 from public.subscription_freezes f
      where f.workspace_id=ws and f.subscription_id=sid
        and app_private.f13_freeze_contribution(ws,sid,f.id)>0
        and as_of>=f.applied_on
        and as_of<f.applied_on+app_private.f13_freeze_contribution(ws,sid,f.id)
    ) into is_frozen;
    projected_status := case when is_frozen then 'frozen' else 'active' end;
  end if;
  return jsonb_build_object('status',projected_status,'effective_end_exclusive',service_end);
end $$;

create function app_private.f13_materialize_entitlement(ws uuid, sid uuid, as_of date)
returns void
language plpgsql security definer set search_path = '' as $$
declare projection jsonb;
begin
  projection := app_private.f13_project_entitlement(ws,sid,as_of);
  insert into app_private.subscription_entitlement_projection(
    workspace_id,subscription_id,status,effective_end_exclusive,as_of_date
  ) values (
    ws,sid,projection->>'status',(projection->>'effective_end_exclusive')::date,as_of
  ) on conflict (workspace_id,subscription_id) do update
    set status=excluded.status,
        effective_end_exclusive=excluded.effective_end_exclusive,
        as_of_date=excluded.as_of_date,
        materialized_at=case
          when (app_private.subscription_entitlement_projection.status,
                app_private.subscription_entitlement_projection.effective_end_exclusive,
                app_private.subscription_entitlement_projection.as_of_date)
            is distinct from (excluded.status,excluded.effective_end_exclusive,excluded.as_of_date)
          then clock_timestamp()
          else app_private.subscription_entitlement_projection.materialized_at
        end;
end $$;

alter function app_private.f13_project_entitlement(uuid,uuid,date) owner to postgres;
alter function app_private.f13_materialize_entitlement(uuid,uuid,date) owner to postgres;
revoke all on function app_private.f13_project_entitlement(uuid,uuid,date) from public,anon,authenticated,service_role;
revoke all on function app_private.f13_materialize_entitlement(uuid,uuid,date) from public,anon,authenticated,service_role;
grant execute on function app_private.f13_project_entitlement(uuid,uuid,date) to service_role;
grant execute on function app_private.f13_materialize_entitlement(uuid,uuid,date) to service_role;
