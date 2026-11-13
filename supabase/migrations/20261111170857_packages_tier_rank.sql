-- Task: T077. FR: FR-002, FR-034, FR-036.
-- Add immutable offer rank without defaults or historical rank assignment.
alter table public.package_offers add column tier_rank smallint;

do $$
begin
  if exists (select 1 from public.package_offers where tier_rank is null) then
    raise exception 'unranked_package_offers' using errcode = '23514';
  end if;
end;
$$;

alter table public.package_offers alter column tier_rank set not null;
alter table public.package_offers add constraint package_offers_tier_rank_check check (tier_rank in (1,2,3));
alter table public.package_offers drop constraint package_offers_workspace_id_package_id_duration_days_key;
alter table public.package_offers add constraint package_offers_identity_key
  unique (workspace_id, package_id, duration_days, tier_rank);

create or replace function app_private.guard_package_offer_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id
    or new.package_id is distinct from old.package_id or new.duration_days is distinct from old.duration_days
    or new.duration_months is distinct from old.duration_months or new.tier_rank is distinct from old.tier_rank then
    raise exception 'immutable' using errcode = '23514';
  end if;
  if auth.uid() is null or not app_private.has_workspace_access(old.workspace_id, 'set_package_pricing') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  return new;
end;
$$;
alter function app_private.guard_package_offer_update() owner to postgres;
revoke execute on function app_private.guard_package_offer_update() from public, anon, authenticated, service_role;

-- Keep the old RPC signature as a fail-closed tombstone; callers must send rank.
create or replace function public.publish_package_version(workspace_id uuid, package_id uuid, duration_months smallint,
  duration_days integer, name_ar text, name_en text, price_minor bigint, currency text, commission_rate_bp integer) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'tier_rank_required' using errcode = '22023';
end;
$$;
alter function public.publish_package_version(uuid,uuid,smallint,integer,text,text,bigint,text,integer) owner to postgres;
revoke execute on function public.publish_package_version(uuid,uuid,smallint,integer,text,text,bigint,text,integer)
  from public, anon, authenticated, service_role;

create function public.publish_package_version(workspace_id uuid, package_id uuid, duration_months smallint,
  duration_days integer, tier_rank smallint, name_ar text, name_en text, price_minor bigint, currency text,
  commission_rate_bp integer) returns uuid
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
  if tier_rank is null or tier_rank not between 1 and 3
    or duration_days is null or duration_days < 1
    or (duration_months is not null and (duration_months not in (1,3,6,8,12) or duration_days <> duration_months * 30))
    or name_ar is null or char_length(name_ar) not between 1 and 120 or char_length(btrim(name_ar)) < 1 or name_ar !~ '[^[:space:]]'
    or name_en is null or char_length(name_en) not between 1 and 120 or char_length(btrim(name_en)) < 1 or name_en !~ '[^[:space:]]'
    or price_minor is null or price_minor <= 0 or currency is null or currency !~ '^[A-Z]{3}$'
    or commission_rate_bp is null or commission_rate_bp not between 0 and 10000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'packages:' || workspace_id::text || ':' || package_id::text || ':' || duration_days::text || ':' || tier_rank::text, 0));
  if not exists (select 1 from public.workspaces w where w.id = publish_package_version.workspace_id)
    or not exists (select 1 from public.packages p where p.id = publish_package_version.package_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
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
  -- Only CURRENT equality is replay. Older payloads are intentional append-only reverts.
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
alter function public.publish_package_version(uuid,uuid,smallint,integer,smallint,text,text,bigint,text,integer) owner to postgres;
revoke execute on function public.publish_package_version(uuid,uuid,smallint,integer,smallint,text,text,bigint,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_package_version(uuid,uuid,smallint,integer,smallint,text,text,bigint,text,integer)
  to authenticated;
