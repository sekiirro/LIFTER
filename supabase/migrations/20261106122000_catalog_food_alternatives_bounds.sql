-- Validate alternative cardinality and integer bounds before casts or inserts.
create or replace function app_private.apply_food_default_alternatives(
  p_food_id uuid, p_version integer, p_alternatives jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  item jsonb; source_basis text; alternative_basis text; current_version integer;
  alternative_id uuid; alternative_version integer; source_portion numeric; alternative_portion numeric;
  position integer := 0; pair_key text; seen_pairs text[] := '{}'; existing_count integer; requested_count integer;
begin
  if p_alternatives is null or jsonb_typeof(p_alternatives) <> 'array' then
    raise exception 'catalog_food_alternatives_invalid' using errcode = '22023';
  end if;
  requested_count := jsonb_array_length(p_alternatives);
  if requested_count > 3 then
    raise exception 'catalog_food_alternatives_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_alternatives) as alternatives(value)
    where case
      when jsonb_typeof(value -> 'alternative_version') = 'number' then
        case
          when (value ->> 'alternative_version')::numeric = trunc((value ->> 'alternative_version')::numeric)
            then (value ->> 'alternative_version')::numeric <= 0
              or (value ->> 'alternative_version')::numeric > 2147483647
          else true
        end
      else true
    end
  ) then
    raise exception 'catalog_food_alternatives_invalid' using errcode = '22023';
  end if;
  select count(*)::integer into existing_count from public.food_default_alternatives
    where food_id = p_food_id and food_version = p_version;
  if existing_count > 0 then
    if existing_count <> requested_count or exists (
      select 1 from jsonb_array_elements(p_alternatives) with ordinality item(value, position)
      left join public.food_default_alternatives current_rows
        on current_rows.food_id = p_food_id and current_rows.food_version = p_version
        and current_rows.position = item.position
      where current_rows.food_id is null
        or current_rows.alternative_food_id <> (item.value ->> 'alternative_food_id')::uuid
        or current_rows.alternative_version <> (item.value ->> 'alternative_version')::integer
        or current_rows.source_portion <> (item.value ->> 'source_portion')::numeric
        or current_rows.alternative_portion <> (item.value ->> 'alternative_portion')::numeric
    ) then
      raise exception 'operation_key_request_conflict' using errcode = '23505';
    end if;
    return;
  end if;
  if requested_count = 0 then return; end if;
  select basis into source_basis from public.food_versions where food_id = p_food_id and version = p_version;
  if source_basis is null then raise exception 'catalog_food_alternatives_invalid' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(p_alternatives) loop
    position := position + 1;
    if jsonb_typeof(item) <> 'object'
      or exists (select 1 from jsonb_object_keys(item) k(key)
        where key not in ('alternative_food_id','alternative_version','source_portion','alternative_portion'))
      or coalesce(item ->> 'alternative_food_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', true)
      or jsonb_typeof(item -> 'alternative_version') <> 'number'
      or coalesce((item ->> 'alternative_version')::numeric <= 0, true)
      or coalesce((item ->> 'alternative_version')::numeric <> trunc((item ->> 'alternative_version')::numeric), true)
      or coalesce((item ->> 'alternative_version')::numeric > 2147483647, true)
      or jsonb_typeof(item -> 'source_portion') <> 'number'
      or jsonb_typeof(item -> 'alternative_portion') <> 'number'
      or coalesce((item ->> 'source_portion')::numeric <= 0, true)
      or coalesce((item ->> 'alternative_portion')::numeric <= 0, true)
      or coalesce((item ->> 'source_portion')::numeric <> round((item ->> 'source_portion')::numeric, 3), true)
      or coalesce((item ->> 'alternative_portion')::numeric <> round((item ->> 'alternative_portion')::numeric, 3), true)
      or coalesce((item ->> 'source_portion')::numeric >= 1000000000, true)
      or coalesce((item ->> 'alternative_portion')::numeric >= 1000000000, true) then
      raise exception 'catalog_food_alternatives_invalid' using errcode = '22023';
    end if;
    alternative_id := (item ->> 'alternative_food_id')::uuid;
    alternative_version := (item ->> 'alternative_version')::integer;
    source_portion := (item ->> 'source_portion')::numeric;
    alternative_portion := (item ->> 'alternative_portion')::numeric;
    pair_key := alternative_id::text || ':' || alternative_version::text;
    if alternative_id = p_food_id or pair_key = any(seen_pairs) then
      raise exception 'catalog_food_alternatives_invalid' using errcode = '22023';
    end if;
    seen_pairs := array_append(seen_pairs, pair_key);
    select f.current_version, v.basis into current_version, alternative_basis
      from public.foods f join public.food_versions v
        on v.food_id = f.id and v.version = alternative_version
      where f.id = alternative_id and f.lifecycle_state = 'active'
      for share of f;
    if not found or current_version <> alternative_version or alternative_basis <> source_basis
      or not exists (select 1 from public.food_serving_units s where s.food_id = p_food_id
        and s.food_version = p_version and s.basis = source_basis and s.basis_qty = source_portion)
      or not exists (select 1 from public.food_serving_units s where s.food_id = alternative_id
        and s.food_version = alternative_version and s.basis = alternative_basis
        and s.basis_qty = alternative_portion) then
      raise exception 'catalog_food_alternatives_invalid' using errcode = '22023';
    end if;
    insert into public.food_default_alternatives(
      food_id, food_version, position, source_basis, source_portion,
      alternative_food_id, alternative_version, alternative_basis, alternative_portion
    ) values (
      p_food_id, p_version, position, source_basis, source_portion,
      alternative_id, alternative_version, alternative_basis, alternative_portion
    );
  end loop;
end;
$$;
alter function app_private.apply_food_default_alternatives(uuid, integer, jsonb) owner to postgres;
revoke all on function app_private.apply_food_default_alternatives(uuid, integer, jsonb) from public, anon, authenticated, service_role;
