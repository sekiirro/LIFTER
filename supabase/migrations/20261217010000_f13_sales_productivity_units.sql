-- S68 T044a: capture Sales eligibility when a registration link is issued,
-- then award one immutable unit in the new-client approval transaction.

alter table public.registration_links
  add column created_by_role_snapshot public.staff_role;

create or replace function app_private.guard_registration_link_insert()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v public.package_versions%rowtype;
  o public.package_offers%rowtype;
begin
  if auth.uid() is null or not app_private.has_workspace_access(new.workspace_id, 'generate_registration_link') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select s.role into new.created_by_role_snapshot
  from public.staff_profiles s where s.user_id = auth.uid() for share;
  if not found then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select * into v from public.package_versions where workspace_id = new.workspace_id and id = new.package_version_id;
  if not found then raise exception 'not_permitted' using errcode = '42501'; end if;
  select * into o from public.package_offers where workspace_id = new.workspace_id and id = v.offer_id for update;
  if not found or not o.available or o.current_version_id is distinct from new.package_version_id then
    raise exception 'stale_terms' using errcode = '22023';
  end if;
  if new.created_by is distinct from auth.uid() or new.created_at is distinct from now()
    or new.expires_at is distinct from now() + interval '24 hours' or new.opened_at is not null or new.consumed_at is not null
    or new.price_minor is distinct from v.price_minor or new.currency is distinct from v.currency
    or new.duration_days is distinct from v.duration_days or new.duration_months is distinct from v.duration_months
    or new.commission_rate_bp is distinct from v.commission_rate_bp then
    raise exception 'invalid_snapshot' using errcode = '23514';
  end if;
  return new;
end $$;
alter function app_private.guard_registration_link_insert() owner to postgres;
revoke all on function app_private.guard_registration_link_insert() from public, anon, authenticated, service_role;

create table public.sales_productivity_units (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  registration_link_id uuid not null,
  approval_event_id uuid not null,
  recipient_sales_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  unit_count integer not null default 1 check (unit_count = 1),
  recorded_at timestamptz not null default clock_timestamp() check (isfinite(recorded_at)),
  unique (workspace_id, id),
  unique (workspace_id, client_id),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete restrict,
  foreign key (workspace_id, registration_link_id) references public.registration_links(workspace_id, id) on delete restrict,
  foreign key (workspace_id, approval_event_id) references app_private.registration_approval_events(workspace_id, id) on delete restrict
);
alter table public.sales_productivity_units owner to postgres;
alter table public.sales_productivity_units enable row level security;
alter table public.sales_productivity_units force row level security;
revoke all on public.sales_productivity_units from public, anon, authenticated, service_role;

create function app_private.f13_guard_sales_productivity_unit()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'sales_productivity_unit_immutable' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.registration_links l
    join public.clients c on c.workspace_id = l.workspace_id
      and c.registration_link_id = l.id
    join app_private.registration_approval_events a on a.workspace_id = c.workspace_id
      and a.client_id = c.id and a.id = new.approval_event_id
    join app_private.registration_decisions d on d.workspace_id = c.workspace_id
      and d.client_id = c.id and d.transaction_id = pg_current_xact_id()
      and d.kind = 'approve' and d.to_state = 'approved'
    where l.workspace_id = new.workspace_id and l.id = new.registration_link_id
      and c.id = new.client_id and l.created_by = new.recipient_sales_user_id
      and l.created_by_role_snapshot = 'sales'::public.staff_role
  ) then
    raise exception 'invalid_sales_productivity_unit' using errcode = '23514';
  end if;
  return new;
end $$;
alter function app_private.f13_guard_sales_productivity_unit() owner to postgres;
revoke all on function app_private.f13_guard_sales_productivity_unit() from public, anon, authenticated, service_role;
create trigger sales_productivity_units_immutable
  before insert or update or delete on public.sales_productivity_units
  for each row execute function app_private.f13_guard_sales_productivity_unit();
create trigger sales_productivity_units_no_truncate
  before truncate on public.sales_productivity_units
  for each statement execute function app_private.f13_guard_sales_productivity_unit();

create function app_private.f13_award_sales_productivity_unit()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  link public.registration_links%rowtype;
  unit_id uuid;
begin
  select l.* into link
  from public.clients c
  join public.registration_links l on l.workspace_id = c.workspace_id and l.id = c.registration_link_id
  where c.workspace_id = new.workspace_id and c.id = new.client_id;
  if not found or link.created_by_role_snapshot is distinct from 'sales'::public.staff_role then
    return new;
  end if;
  if not exists (
    select 1 from app_private.registration_decisions d
    where d.workspace_id = new.workspace_id and d.client_id = new.client_id
      and d.transaction_id = pg_current_xact_id() and d.kind = 'approve' and d.to_state = 'approved'
  ) then
    return new;
  end if;
  insert into public.sales_productivity_units(
    workspace_id, client_id, registration_link_id, approval_event_id, recipient_sales_user_id
  ) values (new.workspace_id, new.client_id, link.id, new.id, link.created_by)
  on conflict (workspace_id, client_id) do nothing
  returning id into unit_id;
  if unit_id is not null then
    insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
    select d.actor_user_id, 'sales.productivity_point_awarded', 'sales_productivity_units', unit_id,
      new.workspace_id, jsonb_build_object(
        'client_id', new.client_id,
        'registration_link_id', link.id,
        'recipient_sales_user_id', link.created_by,
        'unit_count', 1
      )
    from app_private.registration_decisions d
    where d.workspace_id = new.workspace_id and d.client_id = new.client_id
      and d.transaction_id = pg_current_xact_id() and d.kind = 'approve' and d.to_state = 'approved';
  end if;
  return new;
end $$;
alter function app_private.f13_award_sales_productivity_unit() owner to postgres;
revoke all on function app_private.f13_award_sales_productivity_unit() from public, anon, authenticated, service_role;
create trigger registration_approval_sales_productivity
  after insert on app_private.registration_approval_events
  for each row execute function app_private.f13_award_sales_productivity_unit();

comment on column public.registration_links.created_by_role_snapshot is
  'Immutable issuer role captured by the registration link issuance guard; NULL is retained for legacy links and earns no Sales point.';
comment on table public.sales_productivity_units is
  'F13 immutable once-per-new-client Sales productivity unit awarded at initial registration approval.';
