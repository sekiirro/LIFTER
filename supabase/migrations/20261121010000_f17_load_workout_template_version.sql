-- F17 T029: load one pinned workout template version into an empty draft.

create function app_private.f17_remap_workout_template_ids(p_document jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  result jsonb := p_document;
  day_row record;
  item_row record;
  set_row record;
  day_copy jsonb;
  item_copy jsonb;
  sets_copy jsonb;
  items_copy jsonb;
  days_copy jsonb := '[]'::jsonb;
begin
  for day_row in
    select value, ordinality from jsonb_array_elements(p_document -> 'days') with ordinality
  loop
    day_copy := jsonb_set(day_row.value, '{id}', to_jsonb(pg_catalog.gen_random_uuid()::text), true);
    items_copy := '[]'::jsonb;
    for item_row in
      select value, ordinality from jsonb_array_elements(coalesce(day_row.value -> 'items', '[]'::jsonb)) with ordinality
    loop
      item_copy := jsonb_set(item_row.value, '{id}', to_jsonb(pg_catalog.gen_random_uuid()::text), true);
      sets_copy := '[]'::jsonb;
      for set_row in
        select value, ordinality from jsonb_array_elements(coalesce(item_row.value -> 'sets', '[]'::jsonb)) with ordinality
      loop
        sets_copy := sets_copy || jsonb_build_array(
          jsonb_set(set_row.value, '{id}', to_jsonb(pg_catalog.gen_random_uuid()::text), true)
        );
      end loop;
      item_copy := jsonb_set(item_copy, '{sets}', sets_copy, true);
      items_copy := items_copy || jsonb_build_array(item_copy);
    end loop;
    day_copy := jsonb_set(day_copy, '{items}', items_copy, true);
    days_copy := days_copy || jsonb_build_array(day_copy);
  end loop;
  result := jsonb_set(result, '{days}', days_copy, true);
  return result;
end
$$;
alter function app_private.f17_remap_workout_template_ids(jsonb) owner to postgres;
revoke all on function app_private.f17_remap_workout_template_ids(jsonb) from public, anon, authenticated, service_role;

create function public.load_workout_template_version(
  p_plan_id uuid,
  p_template_kind text,
  p_template_id uuid,
  p_version integer,
  p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  root public.plan_roots%rowtype;
  draft public.plan_drafts%rowtype;
  source_status text;
  source_workspace uuid;
  source_document jsonb;
  source_schema_version integer;
  copied_document jsonb;
  unresolved jsonb;
  request_hash text;
  result jsonb;
  replay jsonb;
begin
  if actor is null or p_plan_id is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select * into root from public.plan_roots where id = p_plan_id;
  if not found or root.plan_kind <> 'workout'
    or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_template_kind is null or p_template_kind not in ('global', 'workspace') or p_template_id is null
    or p_version is null or p_version < 1 or p_operation_key is null then
    raise exception 'invalid_workout_template_load' using errcode = '22023';
  end if;
  if p_template_kind = 'global' and not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation', 'load_workout_template_version', 'plan_id', p_plan_id,
    'template_kind', p_template_kind, 'template_id', p_template_id, 'version', p_version
  )::text, 'UTF8'), 'sha256'), 'hex');
  replay := app_private.f17_workout_template_start_operation(
    actor, 'plan.workout_template_load', p_operation_key, request_hash
  );
  if replay is not null then
    select * into root from public.plan_roots where id = p_plan_id;
    if not found or root.plan_kind <> 'workout'
      or not app_private.has_workspace_access(root.workspace_id, 'coaching_work')
      or (p_template_kind = 'global' and not app_private.is_platform_owner()) then
      raise exception 'not_permitted' using errcode = '42501';
    end if;
    return replay;
  end if;

  select * into root from public.plan_roots where id = p_plan_id for update;
  if not found or root.plan_kind <> 'workout'
    or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select * into draft from public.plan_drafts
    where workspace_id = root.workspace_id and plan_id = root.id for update;
  if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if draft.content <> jsonb_build_object('schema_version', 1, 'days', '[]'::jsonb) then
    raise exception 'workout_draft_not_empty' using errcode = '22023';
  end if;

  if p_template_kind = 'workspace' then
    select t.lifecycle_state, t.workspace_id, v.document, v.schema_version
    into source_status, source_workspace, source_document, source_schema_version
    from public.workout_workspace_templates t
    join public.workout_workspace_template_versions v
      on v.workspace_id = t.workspace_id and v.template_id = t.id
    where t.workspace_id = root.workspace_id and t.id = p_template_id and v.version = p_version
    for key share of t;
  else
    select t.lifecycle_state, t.origin_workspace_id, v.document, v.schema_version
    into source_status, source_workspace, source_document, source_schema_version
    from public.workout_global_templates t
    join public.workout_global_template_versions v on v.template_id = t.id
    where t.id = p_template_id and v.version = p_version
    for key share of t;
  end if;
  if not found or source_status <> 'active' then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_template_kind = 'global' and not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  unresolved := app_private.f17_workout_template_unresolved_refs(source_document, source_workspace);
  if jsonb_array_length(unresolved) > 0 then
    raise exception 'unresolved_workout_template_references' using errcode = '22023', detail = unresolved::text;
  end if;
  copied_document := app_private.f17_remap_workout_template_ids(source_document);
  update public.plan_drafts
  set draft_version = draft.draft_version + 1,
      content = copied_document,
      updated_by = actor,
      updated_at = greatest(pg_catalog.clock_timestamp(), draft.updated_at + interval '1 microsecond')
  where workspace_id = root.workspace_id and plan_id = root.id;
  result := jsonb_build_object(
    'loaded', true, 'draft_version', draft.draft_version + 1,
    'template_kind', p_template_kind, 'template_id', p_template_id, 'version', p_version
  );
  perform app_private.f17_workout_template_finish_operation(actor, p_operation_key, result);
  perform app_private.f17_workout_template_write_audit(
    actor, 'plan.workout_template_loaded', 'plan_drafts', p_plan_id, root.workspace_id, p_version
  );
  return result;
end
$$;

alter function public.load_workout_template_version(uuid, text, uuid, integer, uuid) owner to postgres;
revoke all on function public.load_workout_template_version(uuid, text, uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.load_workout_template_version(uuid, text, uuid, integer, uuid)
  to authenticated;
