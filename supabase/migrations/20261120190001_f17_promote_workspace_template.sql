-- F17 T028: promote a workspace template as a separate PO-owned global copy.

create function app_private.f17_workout_template_unresolved_refs(
  p_document jsonb,
  p_source_workspace_id uuid
) returns jsonb
language sql stable security definer set search_path = '' as $$
  with recursive nodes(node, path) as (
    select p_document, '$'::text
    union all
    select child.node, nodes.path || child.path_part
    from nodes
    cross join lateral (
      select value as node, '.' || key as path_part
      from jsonb_each(case when jsonb_typeof(nodes.node) = 'object' then nodes.node else '{}'::jsonb end)
      union all
      select value as node, '[' || (ordinality - 1)::text || ']' as path_part
      from jsonb_array_elements(case when jsonb_typeof(nodes.node) = 'array' then nodes.node else '[]'::jsonb end)
        with ordinality as elements(value, ordinality)
    ) child
  ), refs as (
    select node, path
    from nodes
    where node ->> 'source' in ('global', 'workspace_private')
      and node ? 'identity_id' and node ? 'version'
  ), unresolved as (
    select path
    from refs
    where case node ->> 'source'
      when 'workspace_private' then
        node ->> 'workspace_id' is distinct from p_source_workspace_id::text
        or not exists (
          select 1 from public.workspace_exercises e
          join public.workspace_exercise_versions v
            on v.workspace_id = e.workspace_id and v.workspace_exercise_id = e.id
          where e.workspace_id = p_source_workspace_id
            and e.id = (node ->> 'identity_id')::uuid
            and v.version = (node ->> 'version')::integer
            and e.lifecycle_state = 'active'
        )
      when 'global' then
        not exists (
          select 1 from public.exercises e
          join public.exercise_versions v on v.exercise_id = e.id
          where e.id = (node ->> 'identity_id')::uuid
            and v.version = (node ->> 'version')::integer
            and e.lifecycle_state = 'active'
        )
        or (node ? 'overrideVersion' and jsonb_typeof(node -> 'overrideVersion') = 'number'
          and not exists (
            select 1 from public.exercise_override_versions ov
            where ov.workspace_id = coalesce(nullif(node ->> 'overrideWorkspaceId', '')::uuid, p_source_workspace_id)
              and ov.exercise_id = (node ->> 'identity_id')::uuid
              and ov.version = (node ->> 'overrideVersion')::integer
          ))
      else true
    end
  )
  select coalesce(jsonb_agg(jsonb_build_object('path', path, 'status', 'RED') order by path), '[]'::jsonb)
  from unresolved
$$;
alter function app_private.f17_workout_template_unresolved_refs(jsonb,uuid) owner to postgres;
revoke all on function app_private.f17_workout_template_unresolved_refs(jsonb,uuid)
  from public, anon, authenticated, service_role;

create function public.promote_workout_workspace_template(
  p_workspace_id uuid,
  p_template_id uuid,
  p_expected_version integer,
  p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  source_root public.workout_workspace_templates%rowtype;
  source_version public.workout_workspace_template_versions%rowtype;
  promoted_id uuid;
  request_hash text;
  result jsonb;
  replay jsonb;
begin
  if actor is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_template_id is null or p_expected_version is null
    or p_expected_version < 1 or p_operation_key is null then
    raise exception 'invalid_workout_template' using errcode = '22023';
  end if;

  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','promote_workspace_template','workspace_id',p_workspace_id,
    'template_id',p_template_id,'expected_version',p_expected_version
  )::text,'UTF8'),'sha256'),'hex');
  replay := app_private.f17_workout_template_start_operation(
    actor,'template.workout_global_promote',p_operation_key,request_hash
  );
  if replay is not null then
    if not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
    return replay;
  end if;

  select * into source_root
  from public.workout_workspace_templates
  where workspace_id = p_workspace_id and id = p_template_id
  for share;
  if not found or source_root.lifecycle_state <> 'active' then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if source_root.current_version <> p_expected_version then
    raise exception 'stale_version' using errcode = '40001';
  end if;
  select * into source_version
  from public.workout_workspace_template_versions
  where workspace_id = p_workspace_id and template_id = p_template_id and version = p_expected_version;
  if not found or source_version.schema_version <> 1
    or not app_private.f17_workout_document_valid(source_version.document) then
    raise exception 'invalid_workout_template' using errcode = '22023';
  end if;

  set constraints all deferred;
  insert into public.workout_global_templates(
    created_by,current_version,origin_workspace_id,origin_workspace_template_id,origin_workspace_template_version
  ) values (
    actor,1,p_workspace_id,p_template_id,p_expected_version
  ) returning id into promoted_id;
  insert into public.workout_global_template_versions(
    template_id,version,title,schema_version,document,created_by
  ) values (
    promoted_id,1,source_version.title,1,source_version.document,actor
  );

  result := jsonb_build_object(
    'template_id',promoted_id,
    'version',1,
    'unresolved_references',app_private.f17_workout_template_unresolved_refs(source_version.document,p_workspace_id)
  );
  perform app_private.f17_workout_template_finish_operation(actor,p_operation_key,result);
  perform app_private.f17_workout_template_write_audit(
    actor,'template.workout_global_promoted','workout_global_templates',promoted_id,p_workspace_id,1
  );
  return result;
end $$;

alter function public.promote_workout_workspace_template(uuid,uuid,integer,uuid) owner to postgres;
revoke all on function public.promote_workout_workspace_template(uuid,uuid,integer,uuid)
  from public, anon, service_role;
grant execute on function public.promote_workout_workspace_template(uuid,uuid,integer,uuid)
  to authenticated;
