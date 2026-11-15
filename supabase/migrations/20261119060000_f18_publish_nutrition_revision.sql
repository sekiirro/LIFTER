-- F18 T009 + T022: publish_nutrition_revision RPC and per-version tagged-unit snapshot builder.

create function app_private.nutrition_validate_document(p_document jsonb) returns void
language plpgsql immutable security definer set search_path = '' as $$
declare
  v_key text;
  v_structure text;
  v_day_type_ids text[] := '{}';
  v_seen_ids text[] := '{}';
  v_seen_days integer[] := '{}';
  v_dt jsonb;
  v_day jsonb;
  v_meal jsonb;
  v_item jsonb;
  v_alt jsonb;
  v_meals_arr jsonb;
  v_day_idx integer;
  v_qty_val text;
  v_unit jsonb;
  v_recipe_url text;
  v_host text;
  v_food_id uuid;
  v_food_ver integer;
begin
  if p_document is null or jsonb_typeof(p_document) <> 'object' then
    raise exception 'nutrition_invalid_document' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_document) loop
    if v_key not in ('schemaVersion', 'structure', 'implicitDayTypeId', 'dayTypes', 'days', 'meals', 'title', 'notes') then
      raise exception 'nutrition_unknown_key' using errcode = '22023';
    end if;
  end loop;

  if jsonb_typeof(p_document->'schemaVersion') <> 'number' or (p_document->>'schemaVersion')::numeric <> 1 then
    raise exception 'nutrition_invalid_schema_version' using errcode = '22023';
  end if;

  v_structure := p_document->>'structure';
  if v_structure not in ('single_day', 'seven_day') then
    raise exception 'nutrition_invalid_structure' using errcode = '22023';
  end if;

  if jsonb_typeof(p_document->'dayTypes') <> 'array' or jsonb_array_length(p_document->'dayTypes') = 0 then
    raise exception 'nutrition_invalid_day_types' using errcode = '22023';
  end if;

  for v_dt in select value from jsonb_array_elements(p_document->'dayTypes') loop
    if jsonb_typeof(v_dt) <> 'object'
      or coalesce(btrim(v_dt->>'id'), '') = ''
      or (v_dt->>'id') = any(v_day_type_ids)
      or jsonb_typeof(v_dt->'trainingDay') <> 'boolean'
      or jsonb_typeof(v_dt->'name') <> 'object'
      or coalesce(btrim(v_dt->'name'->>'ar'), '') = ''
      or coalesce(btrim(v_dt->'name'->>'en'), '') = '' then
      raise exception 'nutrition_invalid_day_type' using errcode = '22023';
    end if;
    if v_dt->'targets' is not null and jsonb_typeof(v_dt->'targets') <> 'null' then
      if jsonb_typeof(v_dt->'targets') <> 'object'
        or coalesce(v_dt->'targets'->>'kcal', '') !~ '^[0-9]+(\.[0-9]{1,3})?$'
        or coalesce(v_dt->'targets'->>'protein', '') !~ '^[0-9]+(\.[0-9]{1,3})?$'
        or coalesce(v_dt->'targets'->>'carbs', '') !~ '^[0-9]+(\.[0-9]{1,3})?$'
        or coalesce(v_dt->'targets'->>'fat', '') !~ '^[0-9]+(\.[0-9]{1,3})?$' then
        raise exception 'nutrition_invalid_targets' using errcode = '22023';
      end if;
    end if;
    v_day_type_ids := array_append(v_day_type_ids, v_dt->>'id');
  end loop;

  if v_structure = 'single_day' then
    if coalesce(btrim(p_document->>'implicitDayTypeId'), '') = ''
      or not ((p_document->>'implicitDayTypeId') = any(v_day_type_ids))
      or jsonb_typeof(p_document->'meals') <> 'array'
      or (p_document ? 'days' and jsonb_typeof(p_document->'days') <> 'null') then
      raise exception 'nutrition_invalid_single_day' using errcode = '22023';
    end if;
    v_meals_arr := p_document->'meals';
  else
    if jsonb_typeof(p_document->'days') <> 'array'
      or jsonb_array_length(p_document->'days') <> 7
      or (p_document ? 'meals' and jsonb_typeof(p_document->'meals') <> 'null')
      or (p_document ? 'implicitDayTypeId' and jsonb_typeof(p_document->'implicitDayTypeId') <> 'null') then
      raise exception 'nutrition_invalid_seven_day' using errcode = '22023';
    end if;
    v_meals_arr := '[]'::jsonb;
    for v_day in select value from jsonb_array_elements(p_document->'days') loop
      if jsonb_typeof(v_day) <> 'object'
        or jsonb_typeof(v_day->'dayIndex') <> 'number'
        or (v_day->>'dayIndex') !~ '^[0-6]$'
        or coalesce(btrim(v_day->>'dayTypeId'), '') = ''
        or not ((v_day->>'dayTypeId') = any(v_day_type_ids))
        or jsonb_typeof(v_day->'meals') <> 'array' then
        raise exception 'nutrition_invalid_day' using errcode = '22023';
      end if;
      v_day_idx := (v_day->>'dayIndex')::integer;
      if v_day_idx = any(v_seen_days) then
        raise exception 'nutrition_duplicate_day_index' using errcode = '22023';
      end if;
      v_seen_days := array_append(v_seen_days, v_day_idx);
      v_meals_arr := v_meals_arr || (v_day->'meals');
    end loop;
  end if;

  for v_meal in select value from jsonb_array_elements(v_meals_arr) loop
    if jsonb_typeof(v_meal) <> 'object'
      or coalesce(btrim(v_meal->>'id'), '') = ''
      or (v_meal->>'id') = any(v_seen_ids)
      or jsonb_typeof(v_meal->'name') <> 'object'
      or coalesce(btrim(v_meal->'name'->>'ar'), '') = ''
      or coalesce(btrim(v_meal->'name'->>'en'), '') = ''
      or jsonb_typeof(v_meal->'items') <> 'array' then
      raise exception 'nutrition_invalid_meal' using errcode = '22023';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_meal->>'id');

    if v_meal ? 'recipeUrl' and jsonb_typeof(v_meal->'recipeUrl') <> 'null' then
      if jsonb_typeof(v_meal->'recipeUrl') <> 'string' then
        raise exception 'nutrition_invalid_recipe_url' using errcode = '22023';
      end if;
      v_recipe_url := v_meal->>'recipeUrl';
      if v_recipe_url !~ '^https://([^/?#]+)' then
        raise exception 'nutrition_invalid_recipe_url' using errcode = '22023';
      end if;
      v_host := lower(substring(v_recipe_url from '^https://([^/:?#]+)'));
      if v_host not in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'drive.google.com') then
        raise exception 'nutrition_invalid_recipe_url' using errcode = '22023';
      end if;
    end if;

    for v_item in select value from jsonb_array_elements(v_meal->'items') loop
      if jsonb_typeof(v_item) <> 'object'
        or coalesce(btrim(v_item->>'id'), '') = ''
        or (v_item->>'id') = any(v_seen_ids)
        or jsonb_typeof(v_item->'foodVersion') <> 'number'
        or (v_item->>'foodVersion') !~ '^[1-9][0-9]*$'
        or jsonb_typeof(v_item->'quantity') <> 'object'
        or jsonb_typeof(v_item->'alternatives') <> 'array'
        or jsonb_array_length(v_item->'alternatives') > 5 then
        raise exception 'nutrition_invalid_item' using errcode = '22023';
      end if;
      v_food_id := (v_item->>'foodId')::uuid;
      v_food_ver := (v_item->>'foodVersion')::integer;
      v_seen_ids := array_append(v_seen_ids, v_item->>'id');

      v_qty_val := v_item->'quantity'->>'value';
      if v_qty_val is null or v_qty_val !~ '^[0-9]+(\.[0-9]{1,3})?$' or v_qty_val !~ '[1-9]' then
        raise exception 'nutrition_invalid_quantity' using errcode = '22023';
      end if;
      v_unit := v_item->'quantity'->'unit';
      if jsonb_typeof(v_unit) <> 'object' then
        raise exception 'nutrition_invalid_unit' using errcode = '22023';
      end if;

      for v_alt in select value from jsonb_array_elements(v_item->'alternatives') loop
        if jsonb_typeof(v_alt) <> 'object'
          or coalesce(btrim(v_alt->>'id'), '') = ''
          or (v_alt->>'id') = any(v_seen_ids)
          or jsonb_typeof(v_alt->'foodVersion') <> 'number'
          or (v_alt->>'foodVersion') !~ '^[1-9][0-9]*$'
          or jsonb_typeof(v_alt->'quantity') <> 'object' then
          raise exception 'nutrition_invalid_alternative' using errcode = '22023';
        end if;
        v_food_id := (v_alt->>'foodId')::uuid;
        v_food_ver := (v_alt->>'foodVersion')::integer;
        v_seen_ids := array_append(v_seen_ids, v_alt->>'id');

        v_qty_val := v_alt->'quantity'->>'value';
        if v_qty_val is null or v_qty_val !~ '^[0-9]+(\.[0-9]{1,3})?$' or v_qty_val !~ '[1-9]' then
          raise exception 'nutrition_invalid_quantity' using errcode = '22023';
        end if;
        if jsonb_typeof(v_alt->'quantity'->'unit') <> 'object' then
          raise exception 'nutrition_invalid_unit' using errcode = '22023';
        end if;
      end loop;
    end loop;
  end loop;
end $$;

alter function app_private.nutrition_validate_document(jsonb) owner to postgres;
revoke all on function app_private.nutrition_validate_document(jsonb)
  from public, anon, authenticated, service_role;

create function app_private.nutrition_build_snapshot_map(p_document jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_meals_arr jsonb := '[]'::jsonb;
  v_day jsonb;
  v_meal jsonb;
  v_item jsonb;
  v_alt jsonb;
  v_refs jsonb := '[]'::jsonb;
  v_ref jsonb;
  v_food_id_text text;
  v_food_id uuid;
  v_food_version integer;
  v_unit jsonb;
  v_key text;
  v_food public.food_versions%rowtype;
  v_serving public.food_serving_units%rowtype;
  v_map jsonb := '{}'::jsonb;
begin
  if p_document->>'structure' = 'single_day' then
    v_meals_arr := coalesce(p_document->'meals', '[]'::jsonb);
  else
    for v_day in select value from jsonb_array_elements(coalesce(p_document->'days', '[]'::jsonb)) loop
      v_meals_arr := v_meals_arr || coalesce(v_day->'meals', '[]'::jsonb);
    end loop;
  end if;

  for v_meal in select value from jsonb_array_elements(v_meals_arr) loop
    for v_item in select value from jsonb_array_elements(coalesce(v_meal->'items', '[]'::jsonb)) loop
      v_refs := v_refs || jsonb_build_array(
        jsonb_build_object(
          'foodId', v_item->>'foodId',
          'foodVersion', (v_item->>'foodVersion')::integer,
          'unit', v_item->'quantity'->'unit'
        )
      );
      for v_alt in select value from jsonb_array_elements(coalesce(v_item->'alternatives', '[]'::jsonb)) loop
        v_refs := v_refs || jsonb_build_array(
          jsonb_build_object(
            'foodId', v_alt->>'foodId',
            'foodVersion', (v_alt->>'foodVersion')::integer,
            'unit', v_alt->'quantity'->'unit'
          )
        );
      end loop;
    end loop;
  end loop;

  for v_ref in select value from jsonb_array_elements(v_refs) loop
    v_food_id_text := v_ref->>'foodId';
    v_food_id := v_food_id_text::uuid;
    v_food_version := (v_ref->>'foodVersion')::integer;
    v_unit := v_ref->'unit';
    v_key := app_private.nutrition_snapshot_map_key(v_food_id_text, v_food_version, v_unit);

    if v_map ? v_key then
      continue;
    end if;

    select * into v_food
    from public.food_versions fv
    where fv.food_id = v_food_id
      and fv.version = v_food_version;
    if not found then
      raise exception 'nutrition_missing_food_version' using errcode = '22023';
    end if;

    if (v_unit->>'kind') = 'basis' then
      if (v_unit->>'value') <> v_food.basis then
        raise exception 'nutrition_cross_basis_unit' using errcode = '22023';
      end if;
      v_map := jsonb_set(
        v_map,
        array[v_key],
        jsonb_build_object(
          'kind', 'basis',
          'foodId', v_food_id_text,
          'version', v_food_version,
          'names', jsonb_strip_nulls(jsonb_build_object('ar', v_food.name_ar, 'en', v_food.name_en)),
          'basis', v_food.basis,
          'productIdentity', v_food.product_identity_norm,
          'preparationIdentity', v_food.preparation_identity_norm,
          'weighingState', v_food.weighing_state,
          'per100', jsonb_build_object(
            'kcal', v_food.kcal::text,
            'protein', v_food.protein_g::text,
            'carbs', v_food.carbohydrate_g::text,
            'fat', v_food.fat_g::text,
            'fiber', case when v_food.fiber_g is null then null else v_food.fiber_g::text end
          )
        ),
        true
      );
    else
      select * into v_serving
      from public.food_serving_units s
      where s.food_id = v_food_id
        and s.food_version = v_food_version
        and s.unit_key = (v_unit->>'unitKey');
      if not found then
        raise exception 'nutrition_undeclared_serving_unit' using errcode = '22023';
      end if;
      v_map := jsonb_set(
        v_map,
        array[v_key],
        jsonb_build_object(
          'kind', 'serving',
          'unitKey', v_serving.unit_key,
          'snapshot', jsonb_build_object(
            'foodId', v_food_id_text,
            'version', v_food_version,
            'names', jsonb_strip_nulls(jsonb_build_object('ar', v_food.name_ar, 'en', v_food.name_en)),
            'basis', v_food.basis,
            'productIdentity', v_food.product_identity_norm,
            'preparationIdentity', v_food.preparation_identity_norm,
            'weighingState', v_food.weighing_state,
            'kcal', v_food.kcal::text,
            'protein', v_food.protein_g::text,
            'carbs', v_food.carbohydrate_g::text,
            'fat', v_food.fat_g::text,
            'fiber', case when v_food.fiber_g is null then null else v_food.fiber_g::text end,
            'serving', jsonb_build_object(
              'servingId', v_serving.unit_key,
              'labels', jsonb_strip_nulls(jsonb_build_object('ar', v_serving.label_ar, 'en', v_serving.label_en)),
              'basisQuantity', v_serving.basis_qty::text
            )
          )
        ),
        true
      );
    end if;
  end loop;

  return v_map;
end $$;

alter function app_private.nutrition_build_snapshot_map(jsonb) owner to postgres;
revoke all on function app_private.nutrition_build_snapshot_map(jsonb)
  from public, anon, authenticated, service_role;

create function public.publish_nutrition_revision(
  p_plan_id uuid,
  p_expected_draft_version bigint,
  p_expected_published_version bigint,
  p_operation_key uuid,
  p_caller_payload jsonb default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  root public.plan_roots%rowtype;
  v_receipt jsonb;
  v_revision_id uuid;
  v_document jsonb;
  v_snapshot_map jsonb;
  v_computed_values jsonb;
begin
  -- p_caller_payload is intentionally ignored: caller-supplied snapshots, totals, or documents are never trusted.
  if actor is null then
    return jsonb_build_object('status', 'not_permitted');
  end if;

  select * into root
  from public.plan_roots p
  where p.id = p_plan_id;
  if not found
    or root.plan_kind <> 'nutrition'
    or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then
    return jsonb_build_object('status', 'not_permitted');
  end if;

  v_receipt := public.ready_and_publish_plan(
    p_plan_id,
    p_expected_draft_version,
    p_expected_published_version,
    p_operation_key
  );

  if coalesce(v_receipt->>'status', '') <> 'ok' then
    return v_receipt;
  end if;

  v_revision_id := (v_receipt->>'revision_id')::uuid;

  -- Exact authorized replay: content and audit already exist for this revision.
  if exists (
    select 1
    from public.nutrition_plan_version_contents c
    where c.workspace_id = root.workspace_id
      and c.revision_id = v_revision_id
  ) then
    return v_receipt;
  end if;

  select r.content into v_document
  from public.plan_revisions r
  where r.workspace_id = root.workspace_id
    and r.plan_id = root.id
    and r.id = v_revision_id;

  perform app_private.nutrition_validate_document(v_document);
  v_snapshot_map := app_private.nutrition_build_snapshot_map(v_document);
  v_computed_values := app_private.nutrition_compute_values(v_document, v_snapshot_map, null);

  insert into public.nutrition_plan_version_contents (
    workspace_id, plan_id, revision_id, schema_version, algorithm_version,
    document, snapshot_map, computed_values, created_by
  ) values (
    root.workspace_id, root.id, v_revision_id, 1, 1,
    v_document, v_snapshot_map, v_computed_values, actor
  );

  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    actor,
    'plan.nutrition_publish',
    'nutrition_plan_version_contents',
    v_revision_id,
    root.workspace_id,
    jsonb_build_object(
      'plan_id', root.id,
      'revision_id', v_revision_id,
      'revision_number', (v_receipt->>'revision_number')::bigint,
      'delivery_id', (v_receipt->>'delivery_id')::uuid,
      'changed_fields', jsonb_build_array('document')
    )
  );

  return v_receipt;
end $$;

alter function public.publish_nutrition_revision(uuid, bigint, bigint, uuid, jsonb) owner to postgres;
revoke all on function public.publish_nutrition_revision(uuid, bigint, bigint, uuid, jsonb)
  from public, anon, service_role;
grant execute on function public.publish_nutrition_revision(uuid, bigint, bigint, uuid, jsonb)
  to authenticated;
