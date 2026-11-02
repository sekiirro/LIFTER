-- F16 T015: one provenance-safe projection path for catalog detail, history and export.
create or replace view public.catalog_food_export_safe with (security_barrier = true) as
  select f.id as food_id, f.current_version, f.lifecycle_state,
    v.version, v.payload, v.created_at, v.name_ar, v.name_en, v.basis,
    v.product_identity_norm, v.preparation_identity_norm, v.weighing_state,
    v.kcal, v.protein_g, v.carbohydrate_g, v.fat_g, v.fiber_g,
    v.created_by, v.origin_workspace_id
  from public.catalog_foods_safe f
  join public.catalog_food_versions_safe v on v.food_id = f.id;
alter view public.catalog_food_export_safe owner to postgres;
revoke all on public.catalog_food_export_safe from public, anon, service_role;
grant select on public.catalog_food_export_safe to authenticated;

create function public.catalog_food_detail(p_food_id uuid, p_version integer default null)
returns table (
  food_id uuid,
  version integer,
  payload jsonb,
  created_at timestamptz,
  created_by uuid,
  origin_workspace_id uuid,
  name_ar text,
  name_en text,
  basis text,
  kcal numeric,
  protein_g numeric,
  carbohydrate_g numeric,
  fat_g numeric,
  fiber_g numeric
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_food_id is null or not app_private.catalog_can_read_global() then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  return query
    select v.food_id, v.version, v.payload, v.created_at, v.created_by, v.origin_workspace_id,
      v.name_ar, v.name_en, v.basis, v.kcal, v.protein_g, v.carbohydrate_g, v.fat_g, v.fiber_g
    from public.catalog_food_versions_safe v
    where v.food_id = p_food_id and (p_version is null or v.version = p_version);
end;
$$;
alter function public.catalog_food_detail(uuid, integer) owner to postgres;
revoke all on function public.catalog_food_detail(uuid, integer) from public, anon, service_role;
grant execute on function public.catalog_food_detail(uuid, integer) to authenticated;

create function public.catalog_food_history(p_food_id uuid)
returns table (
  food_id uuid,
  version integer,
  payload jsonb,
  created_at timestamptz,
  created_by uuid,
  origin_workspace_id uuid,
  name_ar text,
  name_en text,
  basis text,
  kcal numeric,
  protein_g numeric,
  carbohydrate_g numeric,
  fat_g numeric,
  fiber_g numeric
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_food_id is null or not app_private.catalog_can_read_global() then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  return query
    select v.food_id, v.version, v.payload, v.created_at, v.created_by, v.origin_workspace_id,
      v.name_ar, v.name_en, v.basis, v.kcal, v.protein_g, v.carbohydrate_g, v.fat_g, v.fiber_g
    from public.catalog_food_versions_safe v
    where v.food_id = p_food_id
    order by v.version desc;
end;
$$;
alter function public.catalog_food_history(uuid) owner to postgres;
revoke all on function public.catalog_food_history(uuid) from public, anon, service_role;
grant execute on function public.catalog_food_history(uuid) to authenticated;
