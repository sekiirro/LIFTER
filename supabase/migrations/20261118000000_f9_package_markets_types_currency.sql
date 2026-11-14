-- F9 slice 1: workspace category identity and market-conditional currency.
-- Legacy mock package/version rows stay untouched and remain unclassified.

alter table public.packages
  alter column code drop not null,
  add column workspace_id uuid references public.workspaces(id) on delete restrict,
  add column market text,
  add column type text,
  add constraint packages_category_identity_complete check (
    (workspace_id is null and market is null and type is null)
    or (workspace_id is not null and market is not null and type is not null)
  ),
  add constraint packages_market_check check (market is null or market in ('Egypt', 'International')),
  add constraint packages_type_check check (type is null or type in ('Year-round', 'Promotional')),
  add constraint packages_workspace_market_type_key unique (workspace_id, market, type),
  add constraint packages_workspace_id_key unique (workspace_id, id);

alter table public.package_versions
  add column market text,
  add column type text,
  add constraint package_versions_market_type_complete check (
    (market is null and type is null) or (market is not null and type is not null)
  ),
  add constraint package_versions_market_check check (market is null or market in ('Egypt', 'International')),
  add constraint package_versions_type_check check (type is null or type in ('Year-round', 'Promotional'));

-- Existing offers remain attached to untouched mock rows. New or re-targeted
-- offers must reference a category owned by the same workspace.
create function app_private.guard_package_offer_category() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  category_workspace uuid;
  category_market text;
  category_type text;
begin
  select p.workspace_id,p.market,p.type into category_workspace,category_market,category_type
    from public.packages p where p.id = new.package_id;
  if not found or (category_workspace is not null and
    (category_workspace is distinct from new.workspace_id or category_market is null or category_type is null)) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  return new;
end;
$$;
alter function app_private.guard_package_offer_category() owner to postgres;
revoke execute on function app_private.guard_package_offer_category() from public, anon, authenticated, service_role;
create trigger package_offers_z_category_guard
  before insert or update of workspace_id, package_id on public.package_offers
  for each row execute function app_private.guard_package_offer_category();

-- Snapshot market/type from the immutable package row, never from the caller.
create function app_private.guard_package_version_market() returns trigger
language plpgsql security definer set search_path = '' as $$
declare category public.packages%rowtype;
begin
  select p.* into category from public.packages p
    join public.package_offers o on o.package_id = p.id and o.workspace_id = p.workspace_id
    where o.workspace_id = new.workspace_id and o.id = new.offer_id;
  if not found or category.market is null or category.type is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if not ((category.market = 'Egypt' and new.currency = 'EGP')
    or (category.market = 'International' and new.currency in ('EGP', 'USD', 'SAR'))) then
    raise exception 'invalid_input' using errcode = '23514';
  end if;
  new.market := category.market;
  new.type := category.type;
  return new;
end;
$$;
alter function app_private.guard_package_version_market() owner to postgres;
revoke execute on function app_private.guard_package_version_market() from public, anon, authenticated, service_role;
create trigger package_versions_market_guard
  before insert on public.package_versions
  for each row execute function app_private.guard_package_version_market();

-- One package.created event for legacy code rows and new category rows.
drop trigger audit_packages on public.packages;
create function app_private.audit_package_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  details jsonb;
begin
  if new.workspace_id is null then
    details := jsonb_build_object('code', new.code);
  else
    details := jsonb_build_object('market', new.market, 'type', new.type);
  end if;
  insert into public.audit_events (actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), 'package.created', 'packages', new.id, new.workspace_id, details);
  return new;
end;
$$;
alter function app_private.audit_package_created() owner to postgres;
revoke execute on function app_private.audit_package_created() from public, anon, authenticated, service_role;
create trigger audit_packages after insert on public.packages
  for each row execute function app_private.audit_package_created();

-- Category creation is idempotent by the workspace/category natural key.
create function public.create_package_category(workspace_id uuid, market text, category_type text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null or not app_private.is_platform_owner()
    or not app_private.role_has_capability(app_private.current_staff_role(), 'set_package_pricing') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if workspace_id is null
    or market is null or market not in ('Egypt', 'International')
    or category_type is null or category_type not in ('Year-round', 'Promotional') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = create_package_category.workspace_id)
    or not app_private.has_workspace_access(create_package_category.workspace_id, 'set_package_pricing') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  insert into public.packages (workspace_id, market, type, created_by)
    values (create_package_category.workspace_id, create_package_category.market,
      create_package_category.category_type, auth.uid())
    on conflict on constraint packages_workspace_market_type_key do nothing returning id into result;
  if result is null then
    select p.id into result from public.packages p
      where p.workspace_id = create_package_category.workspace_id
        and p.market = create_package_category.market and p.type = create_package_category.category_type;
  end if;
  return result;
end;
$$;
alter function public.create_package_category(uuid,text,text) owner to postgres;
revoke execute on function public.create_package_category(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.create_package_category(uuid,text,text) to authenticated;

-- The old rank-aware publisher remains the single wire contract. It resolves
-- immutable market/type before locking or creating an offer, then lets the
-- insert guard write the version snapshot atomically.
create or replace function public.publish_package_version(workspace_id uuid, package_id uuid, duration_months smallint,
  duration_days integer, tier_rank smallint, name_ar text, name_en text, price_minor bigint, currency text,
  commission_rate_bp integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  offer public.package_offers%rowtype;
  category_market text;
  result uuid;
  next_version integer;
begin
  if auth.uid() is null or not app_private.is_platform_owner() or workspace_id is null
    or not app_private.has_workspace_access(workspace_id, 'set_package_pricing') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if tier_rank is null or tier_rank not between 1 and 3
    or duration_days is null or duration_days < 1
    or (duration_months is not null and (duration_months not in (1,3,6,8,12) or duration_days <> duration_months * 30))
    or name_ar is null or char_length(name_ar) not between 1 and 120 or char_length(btrim(name_ar)) < 1 or name_ar !~ '[^[:space:]]'
    or name_en is null or char_length(name_en) not between 1 and 120 or char_length(btrim(name_en)) < 1 or name_en !~ '[^[:space:]]'
    or price_minor is null or price_minor <= 0 or currency is null or currency !~ '^[A-Z]{3}$'
    or commission_rate_bp is null or commission_rate_bp not between 0 and 10000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select p.market into category_market from public.packages p
    where p.id = publish_package_version.package_id
      and p.workspace_id = publish_package_version.workspace_id and p.type is not null;
  if not found then raise exception 'not_permitted' using errcode = '42501'; end if;
  if not ((category_market = 'Egypt' and currency = 'EGP')
    or (category_market = 'International' and currency in ('EGP', 'USD', 'SAR'))) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'packages:' || workspace_id::text || ':' || package_id::text || ':' || duration_days::text || ':' || tier_rank::text, 0));
  select o.* into offer from public.package_offers o
    where o.workspace_id = publish_package_version.workspace_id and o.package_id = publish_package_version.package_id
      and o.duration_days = publish_package_version.duration_days and o.tier_rank = publish_package_version.tier_rank for update;
  if not found then
    insert into public.package_offers(workspace_id,package_id,duration_days,duration_months,tier_rank)
      values (workspace_id,package_id,duration_days,duration_months,tier_rank) returning * into offer;
  end if;
  if offer.duration_months is distinct from duration_months then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select v.id into result from public.package_versions v where v.id = offer.current_version_id
    and v.workspace_id = offer.workspace_id and v.offer_id = offer.id
    and v.name_ar = publish_package_version.name_ar and v.name_en = publish_package_version.name_en
    and v.price_minor = publish_package_version.price_minor and v.currency = publish_package_version.currency
    and v.commission_rate_bp = publish_package_version.commission_rate_bp
    and v.duration_days = offer.duration_days and v.duration_months is not distinct from offer.duration_months
    and v.market = category_market and v.type = (select p.type from public.packages p where p.id = package_id);
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
alter function public.publish_package_version(uuid,uuid,smallint,integer,smallint,text,text,bigint,text,integer) owner to postgres;
revoke execute on function public.publish_package_version(uuid,uuid,smallint,integer,smallint,text,text,bigint,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_package_version(uuid,uuid,smallint,integer,smallint,text,text,bigint,text,integer)
  to authenticated;
