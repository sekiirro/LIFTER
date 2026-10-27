-- P1-F9: canonical identity, immutable publications and scoped reads. No catalog seed data.
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.staff_profiles(user_id) on delete restrict
);
create table public.package_offers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  package_id uuid not null references public.packages(id) on delete restrict,
  duration_days integer not null check (duration_days >= 1),
  duration_months smallint,
  available boolean not null default false,
  current_version_id uuid,
  unique (workspace_id, package_id, duration_days),
  unique (workspace_id, id),
  check ((duration_months in (1,3,6,8,12) and duration_days = duration_months * 30)
    or (duration_months is null and duration_days >= 1))
);
create index package_offers_package_workspace on public.package_offers(package_id, workspace_id);
create table public.package_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  offer_id uuid not null,
  version integer not null check (version >= 1),
  name_ar text not null check (char_length(name_ar) between 1 and 120 and char_length(btrim(name_ar)) >= 1 and name_ar ~ '[^[:space:]]'),
  name_en text not null check (char_length(name_en) between 1 and 120 and char_length(btrim(name_en)) >= 1 and name_en ~ '[^[:space:]]'),
  price_minor bigint not null check (price_minor > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  commission_rate_bp integer not null check (commission_rate_bp between 0 and 10000),
  duration_days integer not null check (duration_days >= 1),
  duration_months smallint,
  published_at timestamptz not null default now(),
  published_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  unique (workspace_id, id),
  unique (workspace_id, id, offer_id),
  unique (offer_id, version),
  foreign key (workspace_id, offer_id) references public.package_offers(workspace_id, id) on delete restrict,
  check ((duration_months in (1,3,6,8,12) and duration_days = duration_months * 30)
    or (duration_months is null and duration_days >= 1))
);
alter table public.package_offers add constraint package_offers_current_workspace_fk
  foreign key (workspace_id, current_version_id) references public.package_versions(workspace_id,id) on delete restrict;
alter table public.package_offers add constraint package_offers_current_same_offer_fk
  foreign key (workspace_id, current_version_id, id) references public.package_versions(workspace_id,id,offer_id) on delete restrict;
alter table public.packages enable row level security;
alter table public.packages force row level security;
revoke all on public.packages from public, anon, authenticated, service_role;
create trigger packages_no_delete before delete on public.packages
  for each row execute function app_private.forbid_delete();
create trigger packages_no_truncate before truncate on public.packages
  for each statement execute function app_private.forbid_delete();
alter table public.package_offers enable row level security;
alter table public.package_offers force row level security;
revoke all on public.package_offers from public, anon, authenticated, service_role;
create trigger package_offers_no_delete before delete on public.package_offers
  for each row execute function app_private.forbid_delete();
create trigger package_offers_no_truncate before truncate on public.package_offers
  for each statement execute function app_private.forbid_delete();
alter table public.package_versions enable row level security;
alter table public.package_versions force row level security;
revoke all on public.package_versions from public, anon, authenticated, service_role;
create trigger package_versions_no_delete before delete on public.package_versions
  for each row execute function app_private.forbid_delete();
create trigger package_versions_no_truncate before truncate on public.package_versions
  for each statement execute function app_private.forbid_delete();
create trigger packages_no_update before update on public.packages
  for each row execute function app_private.audit_events_immutable();
create trigger package_versions_no_update before update on public.package_versions
  for each row execute function app_private.audit_events_immutable();

create function app_private.guard_package_offer_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id
    or new.package_id is distinct from old.package_id or new.duration_days is distinct from old.duration_days
    or new.duration_months is distinct from old.duration_months then
    raise exception 'immutable' using errcode = '23514';
  end if;
  if auth.uid() is null or not app_private.has_workspace_access(old.workspace_id, 'set_package_pricing') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  return new;
end;
$$;
create function app_private.guard_package_version_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.is_platform_owner()
    or not app_private.has_workspace_access(new.workspace_id, 'set_package_pricing') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if new.name_ar is null or char_length(new.name_ar) not between 1 and 120
    or char_length(btrim(new.name_ar)) < 1 or new.name_ar !~ '[^[:space:]]'
    or new.name_en is null or char_length(new.name_en) not between 1 and 120
    or char_length(btrim(new.name_en)) < 1 or new.name_en !~ '[^[:space:]]'
    or new.price_minor is null or new.price_minor <= 0
    or new.currency is null or new.currency !~ '^[A-Z]{3}$'
    or new.commission_rate_bp is null or new.commission_rate_bp not between 0 and 10000
    or new.duration_days is null or new.duration_days < 1
    or (new.duration_months is not null and (new.duration_months not in (1,3,6,8,12)
      or new.duration_days <> new.duration_months * 30)) then
    raise exception 'invalid_input' using errcode = '23514';
  end if;
  if new.published_by is distinct from auth.uid() or not exists (
    select 1 from public.package_offers o where o.workspace_id = new.workspace_id and o.id = new.offer_id
      and o.duration_days = new.duration_days and o.duration_months is not distinct from new.duration_months
  ) then raise exception 'invalid_input' using errcode = '23514'; end if;
  -- NOT NULL and CHECK constraints independently enforce the same row-local ranges.
  return new;
end;
$$;
alter function app_private.guard_package_offer_update() owner to postgres;
alter function app_private.guard_package_version_insert() owner to postgres;
revoke execute on function app_private.guard_package_offer_update(), app_private.guard_package_version_insert()
  from public, anon, authenticated, service_role;
create trigger package_offers_guard before update on public.package_offers
  for each row execute function app_private.guard_package_offer_update();
create trigger package_versions_insert_guard before insert on public.package_versions
  for each row execute function app_private.guard_package_version_insert();

create or replace function app_private.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  event_action text;
  event_target uuid;
  event_workspace uuid;
  event_details jsonb := '{}'::jsonb;
  changed jsonb := '{}'::jsonb;
begin
  if tg_table_schema = 'public' and tg_table_name = 'workspaces' then
    event_target := new.id;
    event_workspace := new.id;
    if tg_op = 'INSERT' then
      event_action := 'workspace.created';
    elsif tg_op = 'UPDATE' then
      if new.name is distinct from old.name then
        changed := changed || jsonb_build_object('name', jsonb_build_object('from', old.name, 'to', new.name));
      end if;
      if new.slug is distinct from old.slug then
        changed := changed || jsonb_build_object('slug', jsonb_build_object('from', old.slug, 'to', new.slug));
      end if;
      if changed = '{}'::jsonb then return new; end if;
      event_action := 'workspace.updated';
      event_details := jsonb_build_object('changed', changed);
    end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'staff_profiles' then
    event_target := new.user_id;
    if tg_op = 'INSERT' then
      event_action := 'staff_role.assigned';
      event_details := jsonb_build_object('role', new.role);
    elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
      event_action := 'staff_role.changed';
      event_details := jsonb_build_object('from', old.role, 'to', new.role);
    else
      return new;
    end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'workspace_memberships' then
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('user_id', new.user_id);
    if tg_op = 'INSERT' then
      event_action := 'membership.granted';
    elsif tg_op = 'UPDATE' and old.revoked_at is null and new.revoked_at is not null then
      event_action := 'membership.revoked';
    else
      return new;
    end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'recovery_link_issuances' then
    if tg_op <> 'INSERT' then return new; end if;
    event_action := 'recovery_link.generated';
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('target_user_id', new.target_user_id);
  elsif tg_table_schema = 'public' and tg_table_name = 'packages' then
    event_action := 'package.created';
    event_target := new.id;
    event_details := jsonb_build_object('code', new.code);
  elsif tg_table_schema = 'public' and tg_table_name = 'package_versions' then
    event_action := 'package_version.published';
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('offer_id', new.offer_id,
      'package_id', (select o.package_id from public.package_offers o where o.workspace_id = new.workspace_id and o.id = new.offer_id),
      'version', new.version, 'price_minor', new.price_minor::text, 'currency', new.currency,
      'commission_rate_bp', new.commission_rate_bp, 'duration_days', new.duration_days);
  elsif tg_table_schema = 'public' and tg_table_name = 'package_offers' then
    if tg_op <> 'UPDATE' or new.available is not distinct from old.available then return new; end if;
    event_action := 'package_offer.availability_changed';
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('available', new.available);
  elsif tg_table_schema = 'public' and tg_table_name = 'jobs' then
    if tg_op = 'UPDATE' and new.status = 'dead' and old.status is distinct from new.status then
      event_action := 'job.dead_lettered';
      event_target := new.id;
      event_workspace := new.workspace_id;
      event_details := jsonb_build_object('kind', new.kind, 'error', new.last_error, 'attempts', new.attempts);
    else
      return new;
    end if;
  else
    raise exception 'No audit mapping for %.%', tg_table_schema, tg_table_name;
  end if;

  insert into public.audit_events (actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), event_action, tg_table_name, event_target, event_workspace, event_details);
  return new;
end;
$$;
alter function app_private.audit_row_change() owner to postgres;
revoke execute on function app_private.audit_row_change() from public, anon, authenticated, service_role;

create trigger audit_packages after insert on public.packages
  for each row execute function app_private.audit_row_change();
create trigger audit_package_versions after insert on public.package_versions
  for each row execute function app_private.audit_row_change();
create trigger audit_package_offers after update on public.package_offers
  for each row execute function app_private.audit_row_change();

create function public.create_package(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null or not app_private.is_platform_owner()
    or not app_private.role_has_capability(app_private.current_staff_role(), 'set_package_pricing') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if code is null or code !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  insert into public.packages(code) values (create_package.code)
    on conflict on constraint packages_code_key do nothing returning id into result;
  if result is null then select p.id into result from public.packages p where p.code = create_package.code; end if;
  return result;
end;
$$;

create function public.publish_package_version(workspace_id uuid, package_id uuid, duration_months smallint,
  duration_days integer, name_ar text, name_en text, price_minor bigint, currency text, commission_rate_bp integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  offer public.package_offers%rowtype;
  result uuid;
  next_version integer;
begin
  if auth.uid() is null or not app_private.is_platform_owner() or workspace_id is null
    or not app_private.has_workspace_access(workspace_id, 'set_package_pricing') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if duration_days is null or duration_days < 1
    or (duration_months is not null and (duration_months not in (1,3,6,8,12) or duration_days <> duration_months * 30))
    or name_ar is null or char_length(name_ar) not between 1 and 120 or char_length(btrim(name_ar)) < 1 or name_ar !~ '[^[:space:]]'
    or name_en is null or char_length(name_en) not between 1 and 120 or char_length(btrim(name_en)) < 1 or name_en !~ '[^[:space:]]'
    or price_minor is null or price_minor <= 0 or currency is null or currency !~ '^[A-Z]{3}$'
    or commission_rate_bp is null or commission_rate_bp not between 0 and 10000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'packages:' || workspace_id::text || ':' || package_id::text || ':' || duration_days::text, 0));
  if not exists (select 1 from public.workspaces w where w.id = publish_package_version.workspace_id)
    or not exists (select 1 from public.packages p where p.id = publish_package_version.package_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select o.* into offer from public.package_offers o
    where o.workspace_id = publish_package_version.workspace_id and o.package_id = publish_package_version.package_id
      and o.duration_days = publish_package_version.duration_days for update;
  if not found then
    insert into public.package_offers(workspace_id,package_id,duration_days,duration_months)
      values (workspace_id,package_id,duration_days,duration_months) returning * into offer;
    -- New row belongs exclusively to this transaction; advisory lock serializes first publication.
  end if;
  if offer.duration_months is distinct from duration_months then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  -- R1: only CURRENT equality is replay. Older payloads are intentional, append-only reverts.
  select v.id into result from public.package_versions v where v.id = offer.current_version_id
    and v.workspace_id = offer.workspace_id and v.offer_id = offer.id
    and v.name_ar = publish_package_version.name_ar and v.name_en = publish_package_version.name_en
    and v.price_minor = publish_package_version.price_minor and v.currency = publish_package_version.currency
    and v.commission_rate_bp = publish_package_version.commission_rate_bp
    and v.duration_days = offer.duration_days and v.duration_months is not distinct from offer.duration_months;
  if result is not null then return result; end if;
  select coalesce(max(v.version),0)+1 into next_version from public.package_versions v where v.offer_id = offer.id;
  insert into public.package_versions(workspace_id,offer_id,version,name_ar,name_en,price_minor,currency,
    commission_rate_bp,duration_days,duration_months,published_by)
  values (offer.workspace_id,offer.id,next_version,name_ar,name_en,price_minor,currency,
    commission_rate_bp,offer.duration_days,offer.duration_months,auth.uid()) returning id into result;
  update public.package_offers o set current_version_id = result where o.id = offer.id;
  return result;
end;
$$;

create function public.set_package_offer_available(workspace_id uuid, offer_id uuid, available boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare offer public.package_offers%rowtype;
begin
  if auth.uid() is null or not app_private.is_platform_owner() or workspace_id is null
    or not app_private.has_workspace_access(workspace_id, 'set_package_pricing') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if available is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  select o.* into offer from public.package_offers o
    where o.workspace_id = set_package_offer_available.workspace_id and o.id = set_package_offer_available.offer_id for update;
  if not found then raise exception 'not_permitted' using errcode = '42501'; end if;
  if offer.available is distinct from available then
    update public.package_offers o set available = set_package_offer_available.available where o.id = offer.id;
  end if;
  return offer.id;
end;
$$;

create policy packages_select_scoped on public.packages for select to authenticated
  using (app_private.is_platform_owner() or exists (select 1 from public.package_offers o
    where o.package_id = packages.id and app_private.has_workspace_access(o.workspace_id, 'generate_registration_link')));
create policy package_offers_select_scoped on public.package_offers for select to authenticated
  using (app_private.has_workspace_access(workspace_id, 'generate_registration_link'));
create policy package_versions_select_scoped on public.package_versions for select to authenticated
  using (app_private.has_workspace_access(workspace_id, 'generate_registration_link'));
grant select on public.packages, public.package_offers to authenticated;
grant select (workspace_id,id,offer_id,version,name_ar,name_en,price_minor,currency,duration_days,duration_months,published_at,published_by)
  on public.package_versions to authenticated;
create view public.package_versions_safe with (security_invoker = true) as
  select workspace_id,id,offer_id,version,name_ar,name_en,price_minor::text as price_minor,
    currency,duration_days,duration_months,published_at,published_by from public.package_versions;
revoke all on public.package_versions_safe from public, anon, authenticated, service_role;
grant select on public.package_versions_safe to authenticated;

create function public.get_package_version_commissions(workspace_id uuid)
returns table(version_id uuid, commission_rate_bp integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or workspace_id is null
    or not app_private.has_workspace_access(workspace_id, 'generate_registration_link')
    or not (app_private.is_platform_owner() or app_private.current_staff_role() = 'workspace_owner'::public.staff_role)
    or not exists (select 1 from public.workspaces w where w.id = get_package_version_commissions.workspace_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  return query select v.id, v.commission_rate_bp from public.package_versions v
    where v.workspace_id = get_package_version_commissions.workspace_id;
end;
$$;
alter function public.create_package(text) owner to postgres;
revoke execute on function public.create_package(text) from public, anon, authenticated, service_role;
grant execute on function public.create_package(text) to authenticated;
alter function public.publish_package_version(uuid,uuid,smallint,integer,text,text,bigint,text,integer) owner to postgres;
revoke execute on function public.publish_package_version(uuid,uuid,smallint,integer,text,text,bigint,text,integer) from public, anon, authenticated, service_role;
grant execute on function public.publish_package_version(uuid,uuid,smallint,integer,text,text,bigint,text,integer) to authenticated;
alter function public.set_package_offer_available(uuid,uuid,boolean) owner to postgres;
revoke execute on function public.set_package_offer_available(uuid,uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_package_offer_available(uuid,uuid,boolean) to authenticated;
alter function public.get_package_version_commissions(uuid) owner to postgres;
revoke execute on function public.get_package_version_commissions(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_package_version_commissions(uuid) to authenticated;
