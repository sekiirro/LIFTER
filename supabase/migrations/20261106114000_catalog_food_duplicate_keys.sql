-- F16 T025: exact-key reservations and normalized exact/near-match candidates.
create table public.catalog_food_name_keys (
  id bigint generated always as identity primary key,
  lang text not null check (lang in ('ar','en')),
  name_norm text not null check (name_norm <> ''),
  basis text not null check (basis in ('g','ml')),
  product_identity_norm text not null,
  preparation_identity_norm text not null,
  weighing_state text not null check (weighing_state in ('raw','cooked','not_applicable')),
  food_id uuid not null,
  version integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (food_id, version) references public.food_versions(food_id, version) on delete restrict
);
create unique index catalog_food_name_keys_active_identity_uq on public.catalog_food_name_keys(
  lang, name_norm, basis, product_identity_norm, preparation_identity_norm, weighing_state
) where active;
create index catalog_food_name_keys_food_active_idx on public.catalog_food_name_keys(food_id) where active;
alter table public.catalog_food_name_keys enable row level security;
alter table public.catalog_food_name_keys force row level security;
revoke all on public.catalog_food_name_keys from public, anon, authenticated, service_role;

create function app_private.reserve_catalog_food_keys(p_food_id uuid, p_version integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare food_version public.food_versions%rowtype; lock_value text; normalized text;
begin
  select * into food_version from public.food_versions v
    where v.food_id = p_food_id and v.version = p_version;
  if not found then raise exception 'catalog_food_version_not_found' using errcode = 'P0002'; end if;
  for lock_value in
    select lang || ':' || name_norm || ':' || food_version.basis || ':' || food_version.product_identity_norm || ':' || food_version.preparation_identity_norm || ':' || food_version.weighing_state
    from (
      select 'ar'::text as lang, app_private.normalize_ar_en_v1(food_version.name_ar) as name_norm where nullif(btrim(food_version.name_ar), '') is not null
      union all
      select 'en', app_private.normalize_ar_en_v1(food_version.name_en) where nullif(btrim(food_version.name_en), '') is not null
    ) names
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lock_value, 0));
  end loop;
  update public.catalog_food_name_keys set active = false where food_id = p_food_id and active;
  begin
    insert into public.catalog_food_name_keys(
      lang, name_norm, basis, product_identity_norm, preparation_identity_norm,
      weighing_state, food_id, version, active
    )
    select lang, name_norm, food_version.basis, food_version.product_identity_norm,
      food_version.preparation_identity_norm, food_version.weighing_state, p_food_id, p_version, true
    from (
      select 'ar'::text as lang, app_private.normalize_ar_en_v1(food_version.name_ar) as name_norm where nullif(btrim(food_version.name_ar), '') is not null
      union all
      select 'en', app_private.normalize_ar_en_v1(food_version.name_en) where nullif(btrim(food_version.name_en), '') is not null
    ) names;
  exception when unique_violation then
    raise exception 'catalog_food_duplicate' using errcode = '23505';
  end;
end;
$$;
alter function app_private.reserve_catalog_food_keys(uuid, integer) owner to postgres;
revoke all on function app_private.reserve_catalog_food_keys(uuid, integer) from public, anon, authenticated, service_role;

create function app_private.release_catalog_food_keys(p_food_id uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.catalog_food_name_keys set active = false where food_id = p_food_id and active
$$;
alter function app_private.release_catalog_food_keys(uuid) owner to postgres;
revoke all on function app_private.release_catalog_food_keys(uuid) from public, anon, authenticated, service_role;

create function public.catalog_food_duplicate_candidates(
  p_name text, p_language text, p_basis text, p_product_identity text,
  p_preparation_identity text, p_weighing_state text, p_kcal numeric
) returns table (food_id uuid, version integer, match_type text, name_ar text, name_en text, kcal numeric)
language plpgsql stable security definer set search_path = '' as $$
declare normalized text;
begin
  if not app_private.catalog_can_read_global() then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  if p_language not in ('ar','en') or p_basis not in ('g','ml') or p_weighing_state not in ('raw','cooked','not_applicable')
    or nullif(btrim(p_name), '') is null or p_product_identity is null or p_preparation_identity is null or p_kcal is null or p_kcal < 0 then
    raise exception 'catalog_food_duplicate_input_invalid' using errcode = '22023';
  end if;
  normalized := app_private.normalize_ar_en_v1(p_name);
  return query
    select k.food_id, k.version, 'exact'::text, v.name_ar, v.name_en, v.kcal::numeric
    from public.catalog_food_name_keys k
    join public.foods f on f.id = k.food_id and f.lifecycle_state = 'active' and f.current_version = k.version
    join public.food_versions v on v.food_id = k.food_id and v.version = k.version
    where k.active and k.lang = p_language and k.name_norm = normalized and k.basis = p_basis
      and k.product_identity_norm = p_product_identity and k.preparation_identity_norm = p_preparation_identity
      and k.weighing_state = p_weighing_state
    order by k.food_id limit 50;
  return query
    select f.id, v.version, 'near'::text, v.name_ar, v.name_en, v.kcal::numeric
    from public.foods f join public.food_versions v on v.food_id = f.id and v.version = f.current_version
    where f.lifecycle_state = 'active' and v.basis = p_basis
      and v.product_identity_norm = p_product_identity and v.preparation_identity_norm = p_preparation_identity
      and v.weighing_state = p_weighing_state
      and abs(v.kcal - p_kcal) <= greatest(10::numeric, abs(p_kcal) * 0.10)
      and ((p_language = 'ar' and v.name_norm_ar_v1 <> normalized
          and v.name_norm_ar_v1 OPERATOR(extensions.%) normalized
          and extensions.similarity(v.name_norm_ar_v1, normalized) >= 0.90)
        or (p_language = 'en' and v.name_norm_en_v1 <> normalized
          and v.name_norm_en_v1 OPERATOR(extensions.%) normalized
          and extensions.similarity(v.name_norm_en_v1, normalized) >= 0.90))
      and not exists (select 1 from public.catalog_food_name_keys k where k.active and k.food_id = f.id
        and k.lang = p_language and k.name_norm = normalized and k.basis = p_basis
        and k.product_identity_norm = p_product_identity and k.preparation_identity_norm = p_preparation_identity
        and k.weighing_state = p_weighing_state)
    order by f.id limit 50;
end;
$$;
alter function public.catalog_food_duplicate_candidates(text, text, text, text, text, text, numeric) owner to postgres;
revoke all on function public.catalog_food_duplicate_candidates(text, text, text, text, text, text, numeric) from public, anon, service_role;
grant execute on function public.catalog_food_duplicate_candidates(text, text, text, text, text, text, numeric) to authenticated;
