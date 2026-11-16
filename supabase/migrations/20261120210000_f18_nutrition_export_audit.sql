-- F18 T023: audit allowlist update and SECURITY DEFINER recorder for plan.nutrition_export

create or replace function app_private.f18_audit_allowlist_guard() returns trigger
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
    when 'plan.nutrition_export' then array[
      'plan_id', 'revision_id', 'outcome', 'reason'
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
    when new.action = 'plan.nutrition_export' then 'plan_revisions'
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
      if value #>> '{}' not in ('denied', 'selected', 'cleared', 'success') then
        raise exception 'nutrition_audit_code_invalid' using errcode = '23514';
      end if;
    elsif key = 'reason' then
      if value #>> '{}' not in ('invalid_operation_key', 'not_client', 'inactive_subscription',
                                'missing_revision', 'not_permitted', 'foreign_plan',
                                'key_conflict', 'stale_version', 'invalid_selection',
                                'foreign_workspace', 'not_found') then
        raise exception 'nutrition_audit_code_invalid' using errcode = '23514';
      end if;
    elsif key in ('item_id', 'alternative_id') then
      if jsonb_typeof(value) <> 'string' or length(value #>> '{}') = 0 then
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

create or replace function public.record_nutrition_export_audit(
  p_workspace_id uuid,
  p_plan_id uuid,
  p_revision_id uuid,
  p_outcome text,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid;
  v_workspace_id uuid;
  v_client_id uuid;
begin
  v_actor_user_id := auth.uid();

  if p_outcome is null or p_outcome not in ('success', 'denied')
    or (p_outcome = 'success' and p_reason is not null)
    or (p_outcome = 'denied' and (
      p_reason is null or p_reason not in ('not_permitted', 'not_found')
    )) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  select pr.workspace_id, pr.client_id
    into v_workspace_id, v_client_id
  from public.plan_roots pr
  where pr.id = p_plan_id;

  if not found or v_actor_user_id is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if p_revision_id is not null and not exists (
    select 1
    from public.plan_revisions r
    where r.id = p_revision_id and r.plan_id = p_plan_id
  ) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if not coalesce(app_private.is_platform_owner(), false)
    and not exists (
      select 1
      from public.workspace_memberships wm
      join public.staff_profiles sp on sp.user_id = wm.user_id
      where wm.user_id = v_actor_user_id
        and wm.workspace_id = v_workspace_id
        and wm.revoked_at is null
        and coalesce(app_private.role_has_capability(sp.role, 'coaching_work'), false)
    )
    and not exists (
      select 1 from public.clients c
      where c.id = v_client_id
        and c.workspace_id = v_workspace_id
        and c.auth_user_id = v_actor_user_id
        and c.approval_state = 'approved'
    ) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  insert into public.audit_events (
    actor_user_id,
    action,
    target_table,
    target_id,
    workspace_id,
    details
  ) values (
    v_actor_user_id,
    'plan.nutrition_export',
    'plan_revisions',
    coalesce(p_revision_id, p_plan_id, '00000000-0000-0000-0000-000000000000'::uuid),
    v_workspace_id,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'plan_id', p_plan_id,
      'revision_id', p_revision_id,
      'outcome', p_outcome,
      'reason', p_reason
    ))
  );
end;
$$;

alter function public.record_nutrition_export_audit(uuid, uuid, uuid, text, text) owner to postgres;
revoke all on function public.record_nutrition_export_audit(uuid, uuid, uuid, text, text) from public, anon, service_role;
grant execute on function public.record_nutrition_export_audit(uuid, uuid, uuid, text, text) to authenticated;
