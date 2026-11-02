-- S25 T034: combine food identity equality with the 90% trigram predicate.
create extension if not exists btree_gin with schema extensions;

create index food_versions_near_duplicate_gin_idx
  on public.food_versions using gin (
    basis extensions.text_ops,
    product_identity_norm extensions.text_ops,
    preparation_identity_norm extensions.text_ops,
    weighing_state extensions.text_ops,
    name_norm_ar_v1 extensions.gin_trgm_ops,
    name_norm_en_v1 extensions.gin_trgm_ops
  );

create or replace function public.catalog_food_duplicate_candidates(
  p_name text, p_language text, p_basis text, p_product_identity text,
  p_preparation_identity text, p_weighing_state text, p_kcal numeric
) returns table (food_id uuid, version integer, match_type text, name_ar text, name_en text, kcal numeric)
language plpgsql stable security definer
set search_path = ''
set pg_trgm.similarity_threshold = '0.90'
as $$
declare normalized text; product_identity text; preparation_identity text;
begin
  if not app_private.catalog_can_read_global() then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  if p_language not in ('ar','en') or p_basis not in ('g','ml') or p_weighing_state not in ('raw','cooked','not_applicable')
    or nullif(btrim(p_name), '') is null or nullif(btrim(p_product_identity), '') is null
    or nullif(btrim(p_preparation_identity), '') is null or p_kcal is null or p_kcal < 0 then
    raise exception 'catalog_food_duplicate_input_invalid' using errcode = '22023';
  end if;
  normalized := app_private.normalize_catalog_food_identity_v1(p_name);
  product_identity := app_private.normalize_catalog_food_identity_v1(p_product_identity);
  preparation_identity := app_private.normalize_catalog_food_identity_v1(p_preparation_identity);
  return query
    select k.food_id, k.version, 'exact'::text, v.name_ar, v.name_en, v.kcal::numeric
    from public.catalog_food_name_keys k
    join public.foods f on f.id = k.food_id and f.lifecycle_state = 'active' and f.current_version = k.version
    join public.food_versions v on v.food_id = k.food_id and v.version = k.version
    where k.active and k.lang = p_language and k.name_norm = normalized and k.basis = p_basis
      and k.product_identity_norm = product_identity and k.preparation_identity_norm = preparation_identity
      and k.weighing_state = p_weighing_state
    order by k.food_id limit 50;

  if p_language = 'ar' then
    return query
      select f.id, v.version, 'near'::text, v.name_ar, v.name_en, v.kcal::numeric
      from public.foods f join public.food_versions v on v.food_id = f.id and v.version = f.current_version
      where f.lifecycle_state = 'active' and v.basis = p_basis
        and v.product_identity_norm = product_identity and v.preparation_identity_norm = preparation_identity
        and v.weighing_state = p_weighing_state
        and abs(v.kcal - p_kcal) <= greatest(10::numeric, abs(p_kcal) * 0.10)
        and v.name_norm_ar_v1 <> normalized
        and v.name_norm_ar_v1 OPERATOR(extensions.%) normalized
        and extensions.similarity(v.name_norm_ar_v1, normalized) >= 0.90
        and not exists (select 1 from public.catalog_food_name_keys k where k.active and k.food_id = f.id
          and k.lang = p_language and k.name_norm = normalized and k.basis = p_basis
          and k.product_identity_norm = product_identity and k.preparation_identity_norm = preparation_identity
          and k.weighing_state = p_weighing_state)
      order by f.id limit 50;
  else
    return query
      select f.id, v.version, 'near'::text, v.name_ar, v.name_en, v.kcal::numeric
      from public.foods f join public.food_versions v on v.food_id = f.id and v.version = f.current_version
      where f.lifecycle_state = 'active' and v.basis = p_basis
        and v.product_identity_norm = product_identity and v.preparation_identity_norm = preparation_identity
        and v.weighing_state = p_weighing_state
        and abs(v.kcal - p_kcal) <= greatest(10::numeric, abs(p_kcal) * 0.10)
        and v.name_norm_en_v1 <> normalized
        and v.name_norm_en_v1 OPERATOR(extensions.%) normalized
        and extensions.similarity(v.name_norm_en_v1, normalized) >= 0.90
        and not exists (select 1 from public.catalog_food_name_keys k where k.active and k.food_id = f.id
          and k.lang = p_language and k.name_norm = normalized and k.basis = p_basis
          and k.product_identity_norm = product_identity and k.preparation_identity_norm = preparation_identity
          and k.weighing_state = p_weighing_state)
      order by f.id limit 50;
  end if;
end;
$$;
alter function public.catalog_food_duplicate_candidates(text, text, text, text, text, text, numeric) owner to postgres;
revoke all on function public.catalog_food_duplicate_candidates(text, text, text, text, text, text, numeric) from public, anon, service_role;
grant execute on function public.catalog_food_duplicate_candidates(text, text, text, text, text, text, numeric) to authenticated;
