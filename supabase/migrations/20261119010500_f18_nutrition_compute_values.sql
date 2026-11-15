-- F18 T008: Canonical exact-decimal nutrition compute and display functions (TS parity).

create function app_private.nutrition_parse_exact_decimal(p_value text) returns numeric
language plpgsql immutable security definer set search_path = '' as $$
begin
  if p_value is null or p_value !~ '^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$' then
    raise exception 'nutrition_invalid_decimal' using errcode = '22023';
  end if;
  return p_value::numeric;
end $$;

create function app_private.nutrition_percent_encode_unit_key(p_unit_key text) returns text
language plpgsql immutable security definer set search_path = '' as $$
declare
  v_bytes bytea;
  v_len integer;
  v_idx integer;
  v_byte integer;
  v_out text := '';
begin
  if p_unit_key is null then
    raise exception 'nutrition_invalid_unit_key' using errcode = '22023';
  end if;
  v_bytes := convert_to(p_unit_key, 'UTF8');
  v_len := octet_length(v_bytes);
  for v_idx in 0..(v_len - 1) loop
    v_byte := get_byte(v_bytes, v_idx);
    -- RFC 3986 unreserved: A-Z (65-90), a-z (97-122), 0-9 (48-57), '-' (45), '.' (46), '_' (95), '~' (126)
    if (v_byte between 65 and 90)
      or (v_byte between 97 and 122)
      or (v_byte between 48 and 57)
      or v_byte in (45, 46, 95, 126) then
      v_out := v_out || chr(v_byte);
    else
      v_out := v_out || '%' || upper(lpad(to_hex(v_byte), 2, '0'));
    end if;
  end loop;
  return v_out;
end $$;

create function app_private.nutrition_snapshot_map_key(
  p_food_id text,
  p_food_version integer,
  p_unit jsonb
) returns text
language plpgsql immutable security definer set search_path = '' as $$
declare
  v_kind text;
begin
  if p_food_id is null or p_food_version is null or p_unit is null or jsonb_typeof(p_unit) <> 'object' then
    raise exception 'nutrition_invalid_unit' using errcode = '22023';
  end if;
  v_kind := p_unit->>'kind';
  if v_kind = 'basis' then
    if coalesce(p_unit->>'value', '') not in ('g', 'ml') then
      raise exception 'nutrition_invalid_basis_unit' using errcode = '22023';
    end if;
    return 'food:' || p_food_id || '@' || p_food_version::text || '#basis:' || (p_unit->>'value');
  elsif v_kind = 'serving' then
    if coalesce(p_unit->>'unitKey', '') = '' then
      raise exception 'nutrition_invalid_serving_unit' using errcode = '22023';
    end if;
    return 'food:' || p_food_id || '@' || p_food_version::text || '#serving:'
      || app_private.nutrition_percent_encode_unit_key(p_unit->>'unitKey');
  end if;
  raise exception 'nutrition_invalid_unit_kind' using errcode = '22023';
end $$;

create function app_private.nutrition_display_calories(p_exact text) returns text
language plpgsql immutable security definer set search_path = '' as $$
declare
  v_val numeric;
begin
  v_val := app_private.nutrition_parse_exact_decimal(p_exact);
  return round(v_val, 0)::text;
end $$;

create function app_private.nutrition_display_macro_grams(p_exact text) returns text
language plpgsql immutable security definer set search_path = '' as $$
declare
  v_val numeric;
  v_rounded numeric;
begin
  v_val := app_private.nutrition_parse_exact_decimal(p_exact);
  if v_val >= 10 then
    return round(v_val, 0)::text;
  end if;
  v_rounded := round(v_val, 1);
  if v_rounded = 0 then
    return '0';
  end if;
  if v_rounded = 10.0 then
    return '10';
  end if;
  return v_rounded::text;
end $$;

create function app_private.nutrition_compute_values(
  p_document jsonb,
  p_snapshot_map jsonb,
  p_selection jsonb default null
) returns jsonb
language plpgsql immutable security definer set search_path = '' as $$
declare
  v_structure text;
  v_groups jsonb;
  v_group jsonb;
  v_day_index text;
  v_meal jsonb;
  v_meal_id text;
  v_item jsonb;
  v_item_id text;
  v_selected_alt_id text;
  v_alt jsonb;
  v_matched_alt jsonb;
  v_food_id text;
  v_food_version integer;
  v_qty_val text;
  v_unit jsonb;
  v_key text;
  v_entry jsonb;
  v_basis_qty numeric;
  v_per100 jsonb;
  v_item_kcal numeric;
  v_item_protein numeric;
  v_item_carbs numeric;
  v_item_fat numeric;
  v_meal_kcal numeric;
  v_meal_protein numeric;
  v_meal_carbs numeric;
  v_meal_fat numeric;
  v_day_kcal numeric;
  v_day_protein numeric;
  v_day_carbs numeric;
  v_day_fat numeric;
  v_total_kcal numeric := 0;
  v_total_protein numeric := 0;
  v_total_carbs numeric := 0;
  v_total_fat numeric := 0;
  v_items_out jsonb := '{}'::jsonb;
  v_meals_out jsonb := '{}'::jsonb;
  v_days_out jsonb := '{}'::jsonb;
begin
  if p_document is null or jsonb_typeof(p_document) <> 'object' then
    raise exception 'nutrition_invalid_document' using errcode = '22023';
  end if;
  if p_snapshot_map is null or jsonb_typeof(p_snapshot_map) <> 'object' then
    raise exception 'nutrition_invalid_snapshot_map' using errcode = '22023';
  end if;
  if p_selection is not null and jsonb_typeof(p_selection) <> 'object' then
    raise exception 'nutrition_invalid_selection' using errcode = '22023';
  end if;

  v_structure := p_document->>'structure';
  if v_structure = 'single_day' then
    v_groups := jsonb_build_array(
      jsonb_build_object('dayIndex', 0, 'meals', coalesce(p_document->'meals', '[]'::jsonb))
    );
  elsif v_structure = 'seven_day' then
    select coalesce(
      jsonb_agg(d order by (d->>'dayIndex')::integer asc),
      '[]'::jsonb
    )
    into v_groups
    from jsonb_array_elements(coalesce(p_document->'days', '[]'::jsonb)) as d;
  else
    raise exception 'nutrition_invalid_structure' using errcode = '22023';
  end if;

  for v_group in select value from jsonb_array_elements(v_groups) loop
    v_day_index := (v_group->>'dayIndex');
    v_day_kcal := 0;
    v_day_protein := 0;
    v_day_carbs := 0;
    v_day_fat := 0;

    for v_meal in select value from jsonb_array_elements(coalesce(v_group->'meals', '[]'::jsonb)) loop
      v_meal_id := v_meal->>'id';
      v_meal_kcal := 0;
      v_meal_protein := 0;
      v_meal_carbs := 0;
      v_meal_fat := 0;

      for v_item in select value from jsonb_array_elements(coalesce(v_meal->'items', '[]'::jsonb)) loop
        v_item_id := v_item->>'id';
        v_selected_alt_id := null;
        if p_selection is not null and p_selection ? v_item_id then
          v_selected_alt_id := p_selection->>v_item_id;
        end if;

        if v_selected_alt_id is not null then
          v_matched_alt := null;
          for v_alt in select value from jsonb_array_elements(coalesce(v_item->'alternatives', '[]'::jsonb)) loop
            if v_alt->>'id' = v_selected_alt_id then
              v_matched_alt := v_alt;
              exit;
            end if;
          end loop;
          if v_matched_alt is null then
            raise exception 'nutrition_alternative_not_found' using errcode = '22023';
          end if;
          v_food_id := v_matched_alt->>'foodId';
          v_food_version := (v_matched_alt->>'foodVersion')::integer;
          v_qty_val := v_matched_alt->'quantity'->>'value';
          v_unit := v_matched_alt->'quantity'->'unit';
        else
          v_food_id := v_item->>'foodId';
          v_food_version := (v_item->>'foodVersion')::integer;
          v_qty_val := v_item->'quantity'->>'value';
          v_unit := v_item->'quantity'->'unit';
        end if;

        v_key := app_private.nutrition_snapshot_map_key(v_food_id, v_food_version, v_unit);
        v_entry := p_snapshot_map -> v_key;
        if v_entry is null or jsonb_typeof(v_entry) <> 'object' then
          raise exception 'nutrition_missing_snapshot_entry' using errcode = '22023';
        end if;

        if (v_unit->>'kind') = 'basis' then
          if (v_entry->>'kind') <> 'basis' or (v_entry->>'basis') <> (v_unit->>'value') then
            raise exception 'nutrition_cross_basis_unit' using errcode = '22023';
          end if;
          v_basis_qty := app_private.nutrition_parse_exact_decimal(v_qty_val);
          v_per100 := v_entry->'per100';
        else
          if (v_entry->>'kind') <> 'serving'
            or (v_entry->>'unitKey') <> (v_unit->>'unitKey')
            or (v_entry->'snapshot'->'serving'->>'servingId') <> (v_unit->>'unitKey') then
            raise exception 'nutrition_invalid_serving_snapshot' using errcode = '22023';
          end if;
          v_basis_qty := app_private.nutrition_parse_exact_decimal(v_qty_val)
            * app_private.nutrition_parse_exact_decimal(v_entry->'snapshot'->'serving'->>'basisQuantity');
          v_per100 := v_entry->'snapshot';
        end if;

        v_item_kcal := app_private.nutrition_parse_exact_decimal(v_per100->>'kcal') * v_basis_qty * 0.01::numeric;
        v_item_protein := app_private.nutrition_parse_exact_decimal(v_per100->>'protein') * v_basis_qty * 0.01::numeric;
        v_item_carbs := app_private.nutrition_parse_exact_decimal(v_per100->>'carbs') * v_basis_qty * 0.01::numeric;
        v_item_fat := app_private.nutrition_parse_exact_decimal(v_per100->>'fat') * v_basis_qty * 0.01::numeric;

        v_items_out := jsonb_set(
          v_items_out,
          array[v_item_id],
          jsonb_build_object(
            'kcal', v_item_kcal::text,
            'protein', v_item_protein::text,
            'carbs', v_item_carbs::text,
            'fat', v_item_fat::text
          ),
          true
        );

        v_meal_kcal := v_meal_kcal + v_item_kcal;
        v_meal_protein := v_meal_protein + v_item_protein;
        v_meal_carbs := v_meal_carbs + v_item_carbs;
        v_meal_fat := v_meal_fat + v_item_fat;
      end loop;

      v_meals_out := jsonb_set(
        v_meals_out,
        array[v_meal_id],
        jsonb_build_object(
          'kcal', v_meal_kcal::text,
          'protein', v_meal_protein::text,
          'carbs', v_meal_carbs::text,
          'fat', v_meal_fat::text
        ),
        true
      );

      v_day_kcal := v_day_kcal + v_meal_kcal;
      v_day_protein := v_day_protein + v_meal_protein;
      v_day_carbs := v_day_carbs + v_meal_carbs;
      v_day_fat := v_day_fat + v_meal_fat;
    end loop;

    v_days_out := jsonb_set(
      v_days_out,
      array[v_day_index],
      jsonb_build_object(
        'kcal', v_day_kcal::text,
        'protein', v_day_protein::text,
        'carbs', v_day_carbs::text,
        'fat', v_day_fat::text
      ),
      true
    );

    v_total_kcal := v_total_kcal + v_day_kcal;
    v_total_protein := v_total_protein + v_day_protein;
    v_total_carbs := v_total_carbs + v_day_carbs;
    v_total_fat := v_total_fat + v_day_fat;
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'algorithmVersion', 1,
    'items', v_items_out,
    'meals', v_meals_out,
    'days', v_days_out,
    'totals', jsonb_build_object(
      'kcal', v_total_kcal::text,
      'protein', v_total_protein::text,
      'carbs', v_total_carbs::text,
      'fat', v_total_fat::text
    )
  );
end $$;

alter function app_private.nutrition_parse_exact_decimal(text) owner to postgres;
alter function app_private.nutrition_percent_encode_unit_key(text) owner to postgres;
alter function app_private.nutrition_snapshot_map_key(text, integer, jsonb) owner to postgres;
alter function app_private.nutrition_display_calories(text) owner to postgres;
alter function app_private.nutrition_display_macro_grams(text) owner to postgres;
alter function app_private.nutrition_compute_values(jsonb, jsonb, jsonb) owner to postgres;

revoke all on function app_private.nutrition_parse_exact_decimal(text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.nutrition_percent_encode_unit_key(text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.nutrition_snapshot_map_key(text, integer, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function app_private.nutrition_display_calories(text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.nutrition_display_macro_grams(text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.nutrition_compute_values(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
