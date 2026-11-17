-- F19 T012 fix round 1 (B1, B2):
-- B1: Refuse retired workout templates (workspace and global) with not_permitted.
-- B2: Store the template version's schema-v1 workout document itself as plan_drafts.content.

create or replace function public.copy_plan_to_draft(
  p_workspace_id uuid,
  p_target_client_id uuid,
  p_create_mode text,
  p_source_id uuid,
  p_operation_key uuid,
  p_template_version integer default null
) returns uuid
language plpgsql
security definer
set search_path = '' as $$
declare
  actor uuid := auth.uid();
  fingerprint bytea;
  prior app_private.plan_operation_keys%rowtype;
  v_plan_kind text;
  v_source_content jsonb;
  v_copied_content jsonb;
  v_new_plan_id uuid;
  v_tpl_current_ver integer;
  v_target_version integer;
  v_doc jsonb;
begin
  if actor is null or p_workspace_id is null
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if p_target_client_id is null
    or p_source_id is null
    or p_operation_key is null
    or p_create_mode is null
    or p_create_mode not in ('template', 'existing_plan')
    or (p_create_mode = 'existing_plan' and p_template_version is not null)
    or (p_template_version is not null and p_template_version < 1) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  perform 1 from public.clients c
    where c.workspace_id = p_workspace_id and c.id = p_target_client_id
    for key share;
  if not found then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', 'copy_plan',
        'workspace_id', p_workspace_id,
        'target_client_id', p_target_client_id,
        'create_mode', p_create_mode,
        'source_id', p_source_id,
        'template_version', p_template_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  insert into app_private.plan_operation_keys (
    workspace_id, actor_user_id, operation_key, operation_type, request_fingerprint
  ) values (
    p_workspace_id, actor, p_operation_key, 'create_plan', fingerprint
  )
  on conflict (workspace_id, actor_user_id, operation_key) do nothing;

  if not found then
    select * into prior
    from app_private.plan_operation_keys k
    where k.workspace_id = p_workspace_id
      and k.actor_user_id = actor
      and k.operation_key = p_operation_key
    for update;

    if prior.operation_type <> 'create_plan'
      or prior.request_fingerprint <> fingerprint then
      raise exception 'key_conflict' using errcode = '23505';
    end if;
    if prior.plan_id is null then
      raise exception 'unavailable' using errcode = '55000';
    end if;
    return prior.plan_id;
  end if;

  if p_create_mode = 'existing_plan' then
    perform 1 from public.plan_roots r
      where r.workspace_id = p_workspace_id and r.id = p_source_id
      for key share;
    if not found then
      raise exception 'not_permitted' using errcode = '42501';
    end if;

    select rev.plan_kind, rev.content
    into v_plan_kind, v_source_content
    from public.plan_revisions rev
    where rev.workspace_id = p_workspace_id
      and rev.plan_id = p_source_id
    order by rev.revision_number desc
    limit 1;

    if not found then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  else
    select t.current_version
    into v_tpl_current_ver
    from public.workout_workspace_templates t
    where t.workspace_id = p_workspace_id
      and t.id = p_source_id
      and t.lifecycle_state = 'active'
    for key share;

    if found then
      v_target_version := coalesce(p_template_version, v_tpl_current_ver);
      select v.document
      into v_doc
      from public.workout_workspace_template_versions v
      where v.workspace_id = p_workspace_id
        and v.template_id = p_source_id
        and v.version = v_target_version;

      if not found then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
    elsif app_private.is_platform_owner() then
      select t.current_version
      into v_tpl_current_ver
      from public.workout_global_templates t
      where t.id = p_source_id
        and t.lifecycle_state = 'active'
      for key share;

      if not found then
        raise exception 'not_permitted' using errcode = '42501';
      end if;

      v_target_version := coalesce(p_template_version, v_tpl_current_ver);
      select v.document
      into v_doc
      from public.workout_global_template_versions v
      where v.template_id = p_source_id
        and v.version = v_target_version;

      if not found then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
    else
      raise exception 'not_permitted' using errcode = '42501';
    end if;

    v_plan_kind := 'workout';
    v_source_content := v_doc;
  end if;

  v_copied_content := app_private.f19_sanitize_copied_content(v_source_content);

  insert into public.plan_roots (
    workspace_id, client_id, plan_kind, created_by
  ) values (
    p_workspace_id, p_target_client_id, v_plan_kind, actor
  )
  returning id into v_new_plan_id;

  insert into public.plan_drafts (
    workspace_id, plan_id, content, created_by, updated_by
  ) values (
    p_workspace_id, v_new_plan_id, v_copied_content, actor, actor
  );

  update app_private.plan_operation_keys k
  set plan_id = v_new_plan_id
  where k.workspace_id = p_workspace_id
    and k.actor_user_id = actor
    and k.operation_key = p_operation_key;

  return v_new_plan_id;
end;
$$;

alter function public.copy_plan_to_draft(uuid, uuid, text, uuid, uuid, integer) owner to postgres;

revoke all on function public.copy_plan_to_draft(uuid, uuid, text, uuid, uuid, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.copy_plan_to_draft(uuid, uuid, text, uuid, uuid, integer)
  to authenticated;
