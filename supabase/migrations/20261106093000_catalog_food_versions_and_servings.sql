-- F16 T009: structured per-reference food nutrition and same-basis servings.
alter table public.food_versions
  add column name_ar text,
  add column name_en text,
  add column basis text not null check (basis in ('g', 'ml')),
  add column product_identity_norm text not null check (btrim(product_identity_norm) <> ''),
  add column preparation_identity_norm text not null check (btrim(preparation_identity_norm) <> ''),
  add column weighing_state text not null check (weighing_state in ('raw', 'cooked', 'not_applicable')),
  add column kcal numeric(7,1) not null check (kcal >= 0),
  add column protein_g numeric(7,2) not null check (protein_g >= 0),
  add column carbohydrate_g numeric(7,2) not null check (carbohydrate_g >= 0),
  add column fat_g numeric(7,2) not null check (fat_g >= 0),
  add column fiber_g numeric(7,2) check (fiber_g is null or fiber_g >= 0),
  add constraint food_versions_name_language_check
    check (nullif(btrim(coalesce(name_ar, '')), '') is not null or nullif(btrim(coalesce(name_en, '')), '') is not null),
  add constraint food_versions_macro_sum_check
    check (protein_g + carbohydrate_g + fat_g <= 100),
  add constraint food_versions_food_version_basis_key unique (food_id, version, basis);

create table public.food_serving_units (
  food_id uuid not null,
  food_version integer not null,
  basis text not null check (basis in ('g', 'ml')),
  unit_key text not null check (btrim(unit_key) <> ''),
  label_ar text,
  label_en text,
  basis_qty numeric(12,3) not null check (basis_qty > 0),
  created_at timestamptz not null default now(),
  primary key (food_id, food_version, unit_key),
  foreign key (food_id, food_version, basis)
    references public.food_versions(food_id, version, basis) on delete restrict,
  check (nullif(btrim(coalesce(label_ar, '')), '') is not null or nullif(btrim(coalesce(label_en, '')), '') is not null)
);

create index food_serving_units_version_idx on public.food_serving_units(food_id, food_version);

create function app_private.require_food_version_serving()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.food_serving_units s
    where s.food_id = new.food_id and s.food_version = new.version
  ) then
    raise exception using errcode = '23514', message = 'food_version_requires_serving';
  end if;
  return null;
end;
$$;
alter function app_private.require_food_version_serving() owner to postgres;
revoke all on function app_private.require_food_version_serving() from public, anon, authenticated, service_role;

create constraint trigger food_version_requires_serving
  after insert on public.food_versions
  deferrable initially deferred
  for each row execute function app_private.require_food_version_serving();
create trigger food_serving_units_append_only before update or delete on public.food_serving_units
  for each row execute function app_private.reject_catalog_version_mutation();

alter table public.food_serving_units enable row level security;
alter table public.food_serving_units force row level security;
create policy food_serving_units_global_read on public.food_serving_units
  for select to authenticated using ((select app_private.catalog_can_read_global()));

revoke all on public.food_serving_units from public, anon, authenticated, service_role;
grant select on public.food_serving_units to authenticated;

create or replace view public.catalog_food_versions_safe with (security_barrier = true) as
  select v.food_id, v.version, v.payload, v.created_at,
    case when app_private.is_platform_owner() then f.created_by else null::uuid end as created_by,
    case when app_private.is_platform_owner() then f.origin_workspace_id else null::uuid end as origin_workspace_id,
    v.name_ar, v.name_en, v.basis, v.product_identity_norm, v.preparation_identity_norm,
    v.weighing_state, v.kcal, v.protein_g, v.carbohydrate_g, v.fat_g, v.fiber_g
  from public.food_versions v
  join public.foods f on f.id = v.food_id
  where app_private.catalog_can_read_global();

create view public.catalog_food_serving_units_safe with (security_barrier = true) as
  select s.food_id, s.food_version, s.basis, s.unit_key, s.label_ar, s.label_en, s.basis_qty
  from public.food_serving_units s
  where app_private.catalog_can_read_global();
alter view public.catalog_food_versions_safe owner to postgres;
alter view public.catalog_food_serving_units_safe owner to postgres;
revoke all on public.catalog_food_versions_safe, public.catalog_food_serving_units_safe from public, anon, service_role;
grant select on public.catalog_food_versions_safe, public.catalog_food_serving_units_safe to authenticated;
