create function app_private.f18_is_canonical_uuid_v4(p_value text)
returns boolean
language sql immutable
set search_path = '' as $$
  select coalesce(
    p_value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    false
  );
$$;

alter function app_private.f18_is_canonical_uuid_v4(text) owner to postgres;
revoke all on function app_private.f18_is_canonical_uuid_v4(text)
  from public, anon, authenticated, service_role;

create function app_private.f18_invalid_uuid_alias(p_value text)
returns text
language sql immutable
set search_path = '' as $$
  with digest as (select md5(coalesce(p_value, '<null>')) as value)
  select substr(value, 1, 8) || '-' || substr(value, 9, 4) || '-4' ||
    substr(value, 14, 3) || '-8' || substr(value, 18, 3) || '-' || substr(value, 21, 12)
  from digest;
$$;

alter function app_private.f18_invalid_uuid_alias(text) owner to postgres;
revoke all on function app_private.f18_invalid_uuid_alias(text)
  from public, anon, authenticated, service_role;

create function app_private.f18_guard_nutrition_document_ids()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_day jsonb;
  v_meal jsonb;
  v_item jsonb;
  v_alt jsonb;
  v_meals jsonb;
begin
  if jsonb_typeof(new.document) <> 'object' then
    raise exception 'nutrition_invalid_document' using errcode = '22023';
  end if;

  if new.document->>'structure' = 'single_day' then
    v_meals := coalesce(new.document->'meals', '[]'::jsonb);
    for v_meal in select value from jsonb_array_elements(v_meals) loop
      for v_item in select value from jsonb_array_elements(coalesce(v_meal->'items', '[]'::jsonb)) loop
        if not app_private.f18_is_canonical_uuid_v4(v_item->>'id') then
          raise exception 'nutrition_invalid_document' using errcode = '22023';
        end if;
        for v_alt in select value from jsonb_array_elements(coalesce(v_item->'alternatives', '[]'::jsonb)) loop
          if not app_private.f18_is_canonical_uuid_v4(v_alt->>'id') then
            raise exception 'nutrition_invalid_document' using errcode = '22023';
          end if;
        end loop;
      end loop;
    end loop;
  elsif new.document->>'structure' = 'seven_day' then
    for v_day in select value from jsonb_array_elements(coalesce(new.document->'days', '[]'::jsonb)) loop
      for v_meal in select value from jsonb_array_elements(coalesce(v_day->'meals', '[]'::jsonb)) loop
        for v_item in select value from jsonb_array_elements(coalesce(v_meal->'items', '[]'::jsonb)) loop
          if not app_private.f18_is_canonical_uuid_v4(v_item->>'id') then
            raise exception 'nutrition_invalid_document' using errcode = '22023';
          end if;
          for v_alt in select value from jsonb_array_elements(coalesce(v_item->'alternatives', '[]'::jsonb)) loop
            if not app_private.f18_is_canonical_uuid_v4(v_alt->>'id') then
              raise exception 'nutrition_invalid_document' using errcode = '22023';
            end if;
          end loop;
        end loop;
      end loop;
    end loop;
  else
    raise exception 'nutrition_invalid_document' using errcode = '22023';
  end if;
  return new;
end;
$$;

alter function app_private.f18_guard_nutrition_document_ids() owner to postgres;
revoke all on function app_private.f18_guard_nutrition_document_ids()
  from public, anon, authenticated, service_role;

create trigger nutrition_plan_version_contents_uuid_ids
  before insert or update on public.nutrition_plan_version_contents
  for each row execute function app_private.f18_guard_nutrition_document_ids();

alter table public.client_nutrition_alternative_selections
  add constraint client_nutrition_selection_item_uuid
    check (app_private.f18_is_canonical_uuid_v4(item_id)),
  add constraint client_nutrition_selection_alternative_uuid
    check (app_private.f18_is_canonical_uuid_v4(alternative_id));

alter function public.select_nutrition_alternative(uuid, text, text, uuid)
  rename to select_nutrition_alternative_unchecked;
revoke all on function public.select_nutrition_alternative_unchecked(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;

create function public.select_nutrition_alternative(
  p_plan_version_id uuid,
  p_item_id text,
  p_alternative_id text,
  p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item_id text := case
    when app_private.f18_is_canonical_uuid_v4(p_item_id) then p_item_id
    else app_private.f18_invalid_uuid_alias(p_item_id)
  end;
  v_alternative_id text := case
    when p_alternative_id is null then null
    when app_private.f18_is_canonical_uuid_v4(p_alternative_id) then p_alternative_id
    else app_private.f18_invalid_uuid_alias(p_alternative_id)
  end;
begin
  return public.select_nutrition_alternative_unchecked(
    p_plan_version_id, v_item_id, v_alternative_id, p_operation_key
  );
end;
$$;

alter function public.select_nutrition_alternative(uuid, text, text, uuid) owner to postgres;
revoke all on function public.select_nutrition_alternative(uuid, text, text, uuid)
  from public, anon, service_role;
grant execute on function public.select_nutrition_alternative(uuid, text, text, uuid)
  to authenticated;

create or replace function app_private.f18_audit_allowlist_guard()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  allowed_keys text[];
  expected_table text;
  key text;
  value jsonb;
  code text;
begin
  if new.action not like 'plan.nutrition_%'
    and new.action not like 'template.nutrition_%'
    and new.action not like 'client.nutrition_%' then
    return new;
  end if;

  allowed_keys := case new.action
    when 'template.nutrition_global_created' then array['version']
    when 'template.nutrition_global_versioned' then array['version']
    when 'template.nutrition_global_retired' then array['version']
    when 'template.nutrition_workspace_created' then array['version']
    when 'template.nutrition_workspace_versioned' then array['version']
    when 'template.nutrition_workspace_retired' then array['version']
    when 'template.nutrition_assign' then array[
      'assigned_count', 'skipped_count', 'skipped_existing_count',
      'skipped_ineligible_count', 'copy_ids', 'workspace_ids'
    ]
    when 'template.nutrition_make_global' then array['source_template_id', 'version']
    when 'plan.nutrition_template_load' then array['version', 'template_kind']
    when 'plan.nutrition_publish' then array[
      'plan_id', 'revision_id', 'revision_number', 'delivery_id', 'changed_fields'
    ]
    when 'client.nutrition_select' then array[
      'plan_id', 'revision_id', 'item_id', 'alternative_id', 'outcome', 'reason',
      'selection_revision', 'changed_fields'
    ]
    else null
  end;

  if allowed_keys is null then
    raise exception 'nutrition_audit_action_not_allowlisted' using errcode = '23514';
  end if;
  expected_table := case
    when new.action in ('template.nutrition_global_created', 'template.nutrition_global_versioned',
                        'template.nutrition_global_retired', 'template.nutrition_make_global')
      then 'nutrition_global_templates'
    when new.action in ('template.nutrition_workspace_created', 'template.nutrition_workspace_versioned',
                        'template.nutrition_workspace_retired')
      then 'nutrition_workspace_templates'
    when new.action = 'template.nutrition_assign' then 'nutrition_template_assignment_batches'
    when new.action = 'plan.nutrition_template_load' then 'plan_drafts'
    when new.action = 'plan.nutrition_publish' then 'nutrition_plan_version_contents'
    when new.action = 'client.nutrition_select' then 'client_nutrition_alternative_selections'
  end;
  if new.target_table is distinct from expected_table or new.actor_user_id is null then
    raise exception 'nutrition_audit_target_not_allowlisted' using errcode = '23514';
  end if;
  if jsonb_typeof(new.details) <> 'object' then
    raise exception 'nutrition_audit_details_not_object' using errcode = '23514';
  end if;
  for key, value in select e.key, e.value from jsonb_each(new.details) e loop
    if not key = any(allowed_keys) then
      raise exception 'nutrition_audit_field_not_allowlisted' using errcode = '23514';
    end if;
    if key in ('version', 'assigned_count', 'skipped_count', 'skipped_existing_count',
               'skipped_ineligible_count', 'revision_number', 'selection_revision') then
      if jsonb_typeof(value) <> 'number' or value #>> '{}' !~ '^[0-9]+$' then
        raise exception 'nutrition_audit_count_invalid' using errcode = '23514';
      end if;
    elsif key in ('plan_id', 'revision_id', 'delivery_id', 'source_template_id') then
      if jsonb_typeof(value) <> 'string' or value #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'nutrition_audit_id_invalid' using errcode = '23514';
      end if;
    elsif key in ('copy_ids', 'workspace_ids') then
      if jsonb_typeof(value) <> 'array' then
        raise exception 'nutrition_audit_ids_invalid' using errcode = '23514';
      end if;
      for code in select jsonb_array_elements_text(value) loop
        if code !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'nutrition_audit_id_invalid' using errcode = '23514';
        end if;
      end loop;
    elsif key = 'changed_fields' then
      if jsonb_typeof(value) <> 'array' then
        raise exception 'nutrition_audit_codes_invalid' using errcode = '23514';
      end if;
      for code in select jsonb_array_elements_text(value) loop
        if code not in ('document', 'day_types', 'meals', 'items', 'alternatives',
                        'notes', 'recipe_url', 'targets', 'status', 'name', 'selection') then
          raise exception 'nutrition_audit_code_invalid' using errcode = '23514';
        end if;
      end loop;
    elsif key = 'template_kind' then
      if value #>> '{}' not in ('global', 'workspace') then
        raise exception 'nutrition_audit_code_invalid' using errcode = '23514';
      end if;
    elsif key = 'outcome' then
      if value #>> '{}' not in ('denied', 'selected', 'cleared') then
        raise exception 'nutrition_audit_code_invalid' using errcode = '23514';
      end if;
    elsif key = 'reason' then
      if value #>> '{}' not in ('invalid_operation_key', 'not_client', 'inactive_subscription',
                                'missing_revision', 'not_permitted', 'foreign_plan',
                                'key_conflict', 'stale_version', 'invalid_selection') then
        raise exception 'nutrition_audit_code_invalid' using errcode = '23514';
      end if;
    elsif key in ('item_id', 'alternative_id') then
      if jsonb_typeof(value) <> 'string' or not app_private.f18_is_canonical_uuid_v4(value #>> '{}') then
        raise exception 'nutrition_audit_id_invalid' using errcode = '23514';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

alter function app_private.f18_audit_allowlist_guard() owner to postgres;
revoke all on function app_private.f18_audit_allowlist_guard()
  from public, anon, authenticated, service_role;
