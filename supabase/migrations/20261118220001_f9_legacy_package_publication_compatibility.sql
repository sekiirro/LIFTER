-- Keep the pre-F9 unclassified package flow working without inferring
-- market/type from a currency. New workspace-owned categories stay guarded.
create or replace function app_private.guard_package_version_market() returns trigger
language plpgsql security definer set search_path = '' as $$
declare category public.packages%rowtype;
begin
  select p.* into category from public.packages p
    join public.package_offers o on o.package_id = p.id
      and (p.workspace_id is null or o.workspace_id = p.workspace_id)
    where o.workspace_id = new.workspace_id and o.id = new.offer_id;
  if not found then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if category.workspace_id is null then
    if category.market is not null or category.type is not null then
      raise exception 'not_permitted' using errcode = '42501';
    end if;
    new.market := null;
    new.type := null;
    return new;
  end if;
  if category.market is null or category.type is null then
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

-- The pre-market publisher remains the contract for unclassified mock rows.
-- Preserve its workspace offer scoping while applying the matrix only to
-- workspace-owned category rows.
create or replace function public.publish_package_version(workspace_id uuid, package_id uuid, duration_months smallint,
  duration_days integer, tier_rank smallint, name_ar text, name_en text, price_minor bigint, currency text,
  commission_rate_bp integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  offer public.package_offers%rowtype;
  category public.packages%rowtype;
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
  select p.* into category from public.packages p
    where p.id = publish_package_version.package_id
      and (p.workspace_id is null or p.workspace_id = publish_package_version.workspace_id);
  if not found then raise exception 'not_permitted' using errcode = '42501'; end if;
  if category.workspace_id is null then
    if category.market is not null or category.type is not null then
      raise exception 'not_permitted' using errcode = '42501';
    end if;
  else
    if category.market is null or category.type is null then
      raise exception 'not_permitted' using errcode = '42501';
    end if;
    if not ((category.market = 'Egypt' and currency = 'EGP')
      or (category.market = 'International' and currency in ('EGP', 'USD', 'SAR'))) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
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
    and v.market is not distinct from category.market and v.type is not distinct from category.type;
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
