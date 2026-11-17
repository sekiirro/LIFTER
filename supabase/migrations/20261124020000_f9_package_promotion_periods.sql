-- T056/T057: bound promotional category availability without rewriting package terms.
create table public.package_promotion_periods (
  workspace_id uuid not null,
  package_id uuid not null,
  starts_at date,
  ends_at date,
  changed_at timestamptz not null default clock_timestamp(),
  changed_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  primary key (workspace_id, package_id),
  foreign key (workspace_id, package_id)
    references public.packages(workspace_id, id) on delete restrict,
  check (starts_at is null or ends_at is null or starts_at < ends_at)
);
alter table public.package_promotion_periods enable row level security;
alter table public.package_promotion_periods force row level security;
revoke all on public.package_promotion_periods from public, anon, authenticated, service_role;

create function app_private.guard_package_promotion_period()
returns trigger language plpgsql security definer set search_path = '' as $$
declare category public.packages%rowtype;
begin
  if tg_op = 'UPDATE' and (new.workspace_id is distinct from old.workspace_id
      or new.package_id is distinct from old.package_id) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if auth.uid() is null or not app_private.is_platform_owner()
    or not app_private.role_has_capability(app_private.current_staff_role(), 'set_package_pricing')
    or not app_private.has_workspace_access(new.workspace_id, 'set_package_pricing')
    or new.changed_by is distinct from auth.uid() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if new.starts_at is not null and new.ends_at is not null and new.starts_at >= new.ends_at then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select p.* into category from public.packages p
    where p.workspace_id = new.workspace_id and p.id = new.package_id for key share;
  if not found or category.type is distinct from 'Promotional' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  new.changed_at := clock_timestamp();
  return new;
end;
$$;
alter function app_private.guard_package_promotion_period() owner to postgres;
revoke execute on function app_private.guard_package_promotion_period() from public, anon, authenticated, service_role;
create trigger package_promotion_period_guard
  before insert or update on public.package_promotion_periods
  for each row execute function app_private.guard_package_promotion_period();

create function app_private.audit_package_promotion_period()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.starts_at is not distinct from old.starts_at
    and new.ends_at is not distinct from old.ends_at then
    return new;
  end if;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (
    auth.uid(),
    'package.promotion_period_changed',
    'package_promotion_periods',
    new.package_id,
    new.workspace_id,
    jsonb_build_object('starts_at', new.starts_at, 'ends_at', new.ends_at)
  );
  return new;
end;
$$;
alter function app_private.audit_package_promotion_period() owner to postgres;
revoke execute on function app_private.audit_package_promotion_period() from public, anon, authenticated, service_role;
create trigger audit_package_promotion_period
  after insert or update on public.package_promotion_periods
  for each row execute function app_private.audit_package_promotion_period();

create function app_private.package_promotion_period_active(target_package_id uuid, at_time timestamptz)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare category public.packages%rowtype; period public.package_promotion_periods%rowtype; cairo_day date;
begin
  if target_package_id is null or at_time is null then return false; end if;
  select p.* into category from public.packages p where p.id = target_package_id;
  if not found then return false; end if;
  if category.type is distinct from 'Promotional' then return true; end if;
  select pp.* into period from public.package_promotion_periods pp
    where pp.workspace_id = category.workspace_id and pp.package_id = category.id;
  cairo_day := (at_time at time zone 'Africa/Cairo')::date;
  return (period.starts_at is null and at_time >= category.created_at
      or period.starts_at is not null and cairo_day >= period.starts_at)
    and (period.ends_at is null or cairo_day < period.ends_at);
end;
$$;
alter function app_private.package_promotion_period_active(uuid, timestamptz) owner to postgres;
revoke execute on function app_private.package_promotion_period_active(uuid, timestamptz) from public, anon, authenticated, service_role;

create function app_private.guard_registration_link_promotion_period()
returns trigger language plpgsql security definer set search_path = '' as $$
declare category public.packages%rowtype;
begin
  select p.* into category
    from public.package_versions v
    join public.package_offers o on o.workspace_id = v.workspace_id and o.id = v.offer_id
    join public.packages p on p.workspace_id = o.workspace_id and p.id = o.package_id
    where v.workspace_id = new.workspace_id and v.id = new.package_version_id
    for key share of p;
  if found and category.type = 'Promotional'
    and not app_private.package_promotion_period_active(category.id, clock_timestamp()) then
    raise exception 'stale_terms' using errcode = '22023';
  end if;
  return new;
end;
$$;
alter function app_private.guard_registration_link_promotion_period() owner to postgres;
revoke execute on function app_private.guard_registration_link_promotion_period() from public, anon, authenticated, service_role;
create trigger registration_links_promotion_period_guard
  before insert on public.registration_links
  for each row execute function app_private.guard_registration_link_promotion_period();

create function public.set_package_promotion_period(
  workspace_id uuid, package_id uuid, starts_at date, ends_at date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid; category public.packages%rowtype;
begin
  if auth.uid() is null or not app_private.is_platform_owner()
    or not app_private.role_has_capability(app_private.current_staff_role(), 'set_package_pricing') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if workspace_id is null or package_id is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not app_private.has_workspace_access(set_package_promotion_period.workspace_id, 'set_package_pricing') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if starts_at is not null and ends_at is not null and starts_at >= ends_at then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select p.* into category from public.packages p
    where p.workspace_id = set_package_promotion_period.workspace_id
      and p.id = set_package_promotion_period.package_id for update;
  if not found or category.type is distinct from 'Promotional' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  insert into public.package_promotion_periods as existing_period(workspace_id, package_id, starts_at, ends_at, changed_by)
    values (set_package_promotion_period.workspace_id, set_package_promotion_period.package_id,
      set_package_promotion_period.starts_at, set_package_promotion_period.ends_at, auth.uid())
    on conflict on constraint package_promotion_periods_pkey do update
      set starts_at = excluded.starts_at,
          ends_at = excluded.ends_at,
          changed_by = excluded.changed_by
      where existing_period.starts_at is distinct from excluded.starts_at
        or existing_period.ends_at is distinct from excluded.ends_at
    returning existing_period.package_id into result;
  return coalesce(result, set_package_promotion_period.package_id);
end;
$$;
alter function public.set_package_promotion_period(uuid, uuid, date, date) owner to postgres;
revoke all on function public.set_package_promotion_period(uuid, uuid, date, date) from public, anon, service_role;
grant execute on function public.set_package_promotion_period(uuid, uuid, date, date) to authenticated;
