-- F17 B3: enforce workspace tenancy on workspace_private exercise/alternative references.

create or replace function app_private.f17_workout_has_foreign_private_reference(
  p_node jsonb,
  p_workspace_id uuid
)
returns boolean
language plpgsql immutable set search_path = '' as $$
declare pair record;
begin
  if jsonb_typeof(p_node) = 'object' then
    if p_node ->> 'source' = 'workspace_private'
      and (p_node ->> 'workspace_id') is distinct from p_workspace_id::text then
      return true;
    end if;
    for pair in select value from jsonb_each(p_node) loop
      if app_private.f17_workout_has_foreign_private_reference(pair.value, p_workspace_id) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_node) = 'array' then
    for pair in select value from jsonb_array_elements(p_node) loop
      if app_private.f17_workout_has_foreign_private_reference(pair.value, p_workspace_id) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end $$;
alter function app_private.f17_workout_has_foreign_private_reference(jsonb, uuid) owner to postgres;
revoke all on function app_private.f17_workout_has_foreign_private_reference(jsonb, uuid) from public, anon, authenticated, service_role;

create or replace function public.create_workout_workspace_template(p_workspace_id uuid,p_title text,p_document jsonb,p_operation_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); template_id uuid; request_hash text; result jsonb; replay jsonb;
begin
  if actor is null or p_workspace_id is null or not app_private.has_workspace_access(p_workspace_id,'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 200 or p_document is null
    or jsonb_typeof(p_document) <> 'object' or p_document ->> 'schema_version' <> '1'
    or jsonb_typeof(p_document -> 'days') <> 'array' or not app_private.f17_workout_document_valid(p_document) or p_operation_key is null
    or app_private.f17_workout_has_foreign_private_reference(p_document, p_workspace_id) then
    raise exception 'invalid_workout_template' using errcode = '22023'; end if;
  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','create_workspace_template','workspace_id',p_workspace_id,'title',p_title,'document',p_document
  )::text,'UTF8'),'sha256'),'hex');
  replay := app_private.f17_workout_template_start_operation(actor,'template.workout_workspace_write',p_operation_key,request_hash);
  if replay is not null then
    if not app_private.has_workspace_access(p_workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
    return replay;
  end if;
  if not app_private.has_workspace_access(p_workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
  set constraints all deferred;
  insert into public.workout_workspace_templates(workspace_id,created_by,current_version) values(p_workspace_id,actor,1) returning id into template_id;
  insert into public.workout_workspace_template_versions(workspace_id,template_id,version,title,schema_version,document,created_by)
    values(p_workspace_id,template_id,1,p_title,1,p_document,actor);
  result := jsonb_build_object('template_id',template_id,'version',1);
  perform app_private.f17_workout_template_finish_operation(actor,p_operation_key,result);
  perform app_private.f17_workout_template_write_audit(actor,'template.workout_workspace_created','workout_workspace_templates',template_id,p_workspace_id,1);
  return result;
end $$;

create or replace function public.version_workout_workspace_template(p_workspace_id uuid,p_template_id uuid,p_expected_version integer,p_title text,p_document jsonb,p_operation_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); root public.workout_workspace_templates%rowtype; request_hash text; result jsonb; replay jsonb; next_version integer;
begin
  if actor is null or p_workspace_id is null or p_template_id is null or not app_private.has_workspace_access(p_workspace_id,'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501'; end if;
  if p_expected_version is null or p_expected_version < 1 or p_title is null or length(btrim(p_title)) not between 1 and 200
    or p_document is null or jsonb_typeof(p_document) <> 'object' or p_document ->> 'schema_version' <> '1'
    or jsonb_typeof(p_document -> 'days') <> 'array' or not app_private.f17_workout_document_valid(p_document) or p_operation_key is null
    or app_private.f17_workout_has_foreign_private_reference(p_document, p_workspace_id) then
    raise exception 'invalid_workout_template' using errcode = '22023'; end if;
  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','version_workspace_template','workspace_id',p_workspace_id,'template_id',p_template_id,
    'expected_version',p_expected_version,'title',p_title,'document',p_document
  )::text,'UTF8'),'sha256'),'hex');
  replay := app_private.f17_workout_template_start_operation(actor,'template.workout_workspace_write',p_operation_key,request_hash);
  if replay is not null then
    if not app_private.has_workspace_access(p_workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
    return replay;
  end if;
  select * into root from public.workout_workspace_templates where workspace_id=p_workspace_id and id=p_template_id for update;
  if not found or not app_private.has_workspace_access(p_workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
  if root.current_version <> p_expected_version then raise exception 'stale_version' using errcode = '40001'; end if;
  if root.lifecycle_state <> 'active' then raise exception 'not_permitted' using errcode = '42501'; end if;
  next_version := root.current_version + 1;
  set constraints all deferred;
  insert into public.workout_workspace_template_versions(workspace_id,template_id,version,title,schema_version,document,created_by)
    values(p_workspace_id,p_template_id,next_version,p_title,1,p_document,actor);
  update public.workout_workspace_templates set current_version=next_version,updated_at=clock_timestamp() where workspace_id=p_workspace_id and id=p_template_id;
  result := jsonb_build_object('template_id',p_template_id,'version',next_version);
  perform app_private.f17_workout_template_finish_operation(actor,p_operation_key,result);
  perform app_private.f17_workout_template_write_audit(actor,'template.workout_workspace_versioned','workout_workspace_templates',p_template_id,p_workspace_id,next_version);
  return result;
end $$;
