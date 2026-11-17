-- F17 T023/T024: authorized, idempotent template CRUD with append-only versions.

alter table public.workout_global_template_versions
  add constraint workout_global_template_versions_schema_v1 check (
    schema_version = 1
    and (document ->> 'schema_version' = '1') is true
    and (jsonb_typeof(document -> 'days') = 'array') is true
  );
alter table public.workout_workspace_template_versions
  add constraint workout_workspace_template_versions_schema_v1 check (
    schema_version = 1
    and (document ->> 'schema_version' = '1') is true
    and (jsonb_typeof(document -> 'days') = 'array') is true
  );

create function app_private.f17_workout_has_private_reference(p_node jsonb)
returns boolean
language plpgsql immutable set search_path = '' as $$
declare pair record;
begin
  if jsonb_typeof(p_node) = 'object' then
    if p_node ->> 'source' = 'workspace_private' then return true; end if;
    for pair in select value from jsonb_each(p_node) loop
      if app_private.f17_workout_has_private_reference(pair.value) then return true; end if;
    end loop;
  elsif jsonb_typeof(p_node) = 'array' then
    for pair in select value from jsonb_array_elements(p_node) loop
      if app_private.f17_workout_has_private_reference(pair.value) then return true; end if;
    end loop;
  end if;
  return false;
end $$;
alter function app_private.f17_workout_has_private_reference(jsonb) owner to postgres;
revoke all on function app_private.f17_workout_has_private_reference(jsonb) from public, anon, authenticated, service_role;

create function app_private.f17_workout_json_keys_allowed(p_node jsonb,p_allowed text[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p_node) = 'object'
    and not exists(select 1 from jsonb_object_keys(p_node) as k(key) where not (k.key = any(p_allowed))),false)
$$;
alter function app_private.f17_workout_json_keys_allowed(jsonb,text[]) owner to postgres;
revoke all on function app_private.f17_workout_json_keys_allowed(jsonb,text[]) from public, anon, authenticated, service_role;

create function app_private.f17_workout_uuid_valid(p_value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p_value) = 'string'
    and p_value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
$$;
alter function app_private.f17_workout_uuid_valid(jsonb) owner to postgres;
revoke all on function app_private.f17_workout_uuid_valid(jsonb) from public, anon, authenticated, service_role;

create function app_private.f17_workout_reference_valid(p_ref jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare source_name text; override_value jsonb;
begin
  if not (p_ref ?& array['source','identity_id','version'])
    or not app_private.f17_workout_json_keys_allowed(p_ref,array['source','identity_id','version','overrideVersion','overrideWorkspaceId','workspace_id'])
    or not app_private.f17_workout_uuid_valid(p_ref -> 'identity_id')
    or jsonb_typeof(p_ref -> 'version') <> 'number' or (p_ref ->> 'version')::numeric <= 0 or trunc((p_ref ->> 'version')::numeric) <> (p_ref ->> 'version')::numeric then
    return false;
  end if;
  source_name := p_ref ->> 'source';
  if source_name = 'global' then
    if p_ref ? 'workspace_id' then return false; end if;
    if p_ref ? 'overrideVersion' then
      override_value := p_ref -> 'overrideVersion';
      if jsonb_typeof(override_value) <> 'null' then
        if jsonb_typeof(override_value) <> 'number' or (override_value #>> '{}')::numeric <= 0
          or trunc((override_value #>> '{}')::numeric) <> (override_value #>> '{}')::numeric or not app_private.f17_workout_uuid_valid(p_ref -> 'overrideWorkspaceId') then return false; end if;
      elsif p_ref ? 'overrideWorkspaceId' then return false;
      end if;
    elsif p_ref ? 'overrideWorkspaceId' then return false;
    end if;
    return true;
  elsif source_name = 'workspace_private' then
    return app_private.f17_workout_uuid_valid(p_ref -> 'workspace_id')
      and not (p_ref ? 'overrideVersion') and not (p_ref ? 'overrideWorkspaceId');
  end if;
  return false;
end $$;
alter function app_private.f17_workout_reference_valid(jsonb) owner to postgres;
revoke all on function app_private.f17_workout_reference_valid(jsonb) from public, anon, authenticated, service_role;

create function app_private.f17_workout_document_valid(p_doc jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare day_node jsonb; item_node jsonb; set_node jsonb; load_node jsonb; ref_node jsonb; alt_node jsonb;
  all_ids text[] := array[]::text[]; alt_keys text[]; current_id text; ref_key text; reps jsonb; val jsonb;
begin
  if not (p_doc ?& array['schema_version','days']) or not app_private.f17_workout_json_keys_allowed(p_doc,array['schema_version','notes','days'])
    or jsonb_typeof(p_doc -> 'schema_version') <> 'number' or p_doc ->> 'schema_version' <> '1'
    or jsonb_typeof(p_doc -> 'days') <> 'array' then return false; end if;
  if p_doc ? 'notes' and jsonb_typeof(p_doc -> 'notes') <> 'string' then return false; end if;
  for day_node in select value from jsonb_array_elements(p_doc -> 'days') loop
    if not (day_node ?& array['id','kind','items']) or not app_private.f17_workout_json_keys_allowed(day_node,array['id','kind','title','notes','items'])
      or not app_private.f17_workout_uuid_valid(day_node -> 'id') or jsonb_typeof(day_node -> 'items') <> 'array'
      or day_node ->> 'kind' not in ('session','rest') then return false; end if;
    current_id := day_node ->> 'id';
    if current_id = any(all_ids) then return false; end if;
    all_ids := array_append(all_ids,current_id);
    if (day_node ? 'title' and jsonb_typeof(day_node -> 'title') <> 'string')
      or (day_node ? 'notes' and jsonb_typeof(day_node -> 'notes') <> 'string')
      or (day_node ->> 'kind' = 'rest' and jsonb_array_length(day_node -> 'items') <> 0) then return false; end if;
    for item_node in select value from jsonb_array_elements(day_node -> 'items') loop
      if not (item_node ?& array['id','exercise','name','alternatives','sets']) or not app_private.f17_workout_json_keys_allowed(item_node,array['id','exercise','name','description','reps','restSec','rir','notes','alternatives','sets'])
        or not app_private.f17_workout_uuid_valid(item_node -> 'id') or jsonb_typeof(item_node -> 'name') <> 'string'
        or jsonb_typeof(item_node -> 'alternatives') <> 'array' or jsonb_typeof(item_node -> 'sets') <> 'array'
        or not app_private.f17_workout_reference_valid(item_node -> 'exercise') then return false; end if;
      current_id := item_node ->> 'id';
      if current_id = any(all_ids) then return false; end if;
      all_ids := array_append(all_ids,current_id);
      if (item_node ? 'description' and jsonb_typeof(item_node -> 'description') <> 'string')
        or (item_node ? 'notes' and jsonb_typeof(item_node -> 'notes') <> 'string') then return false; end if;
      if item_node ? 'reps' then
        reps := item_node -> 'reps';
        if jsonb_typeof(reps) <> 'object' then return false; end if;
        if app_private.f17_workout_json_keys_allowed(reps,array['value']) then
          if jsonb_typeof(reps -> 'value') <> 'number' or (reps ->> 'value')::numeric not between 1 and 100 or trunc((reps ->> 'value')::numeric) <> (reps ->> 'value')::numeric then return false; end if;
        elsif app_private.f17_workout_json_keys_allowed(reps,array['min','max']) then
          if (select count(*) from jsonb_object_keys(reps)) <> 2 or jsonb_typeof(reps -> 'min') <> 'number' or jsonb_typeof(reps -> 'max') <> 'number'
            or (reps ->> 'min')::numeric < 1 or (reps ->> 'max')::numeric > 100
            or trunc((reps ->> 'min')::numeric) <> (reps ->> 'min')::numeric or trunc((reps ->> 'max')::numeric) <> (reps ->> 'max')::numeric
            or (reps ->> 'min')::numeric > (reps ->> 'max')::numeric then return false; end if;
        else return false; end if;
      end if;
      if item_node ? 'restSec' and (jsonb_typeof(item_node -> 'restSec') <> 'number'
        or (item_node ->> 'restSec')::numeric not between 0 and 600 or trunc((item_node ->> 'restSec')::numeric) <> (item_node ->> 'restSec')::numeric
        or mod((item_node ->> 'restSec')::numeric,15) <> 0) then return false; end if;
      if item_node ? 'rir' and (jsonb_typeof(item_node -> 'rir') <> 'number'
        or (item_node ->> 'rir')::numeric not between 0 and 5 or trunc((item_node ->> 'rir')::numeric) <> (item_node ->> 'rir')::numeric) then return false; end if;
      if jsonb_array_length(item_node -> 'alternatives') > 3 then return false; end if;
      alt_keys := array[]::text[];
      for alt_node in select value from jsonb_array_elements(item_node -> 'alternatives') loop
        if not app_private.f17_workout_reference_valid(alt_node) then return false; end if;
        ref_key := (alt_node ->> 'source') || ':' || coalesce(alt_node ->> 'workspace_id','') || ':' || (alt_node ->> 'identity_id');
        if ref_key = any(alt_keys) then return false; end if;
        alt_keys := array_append(alt_keys,ref_key);
      end loop;
      for set_node in select value from jsonb_array_elements(item_node -> 'sets') loop
        if not (set_node ?& array['id','type','load']) or not app_private.f17_workout_json_keys_allowed(set_node,array['id','type','load']) or not app_private.f17_workout_uuid_valid(set_node -> 'id')
          or set_node ->> 'type' not in ('warmup','working') or jsonb_typeof(set_node -> 'load') <> 'object' then return false; end if;
        current_id := set_node ->> 'id';
        if current_id = any(all_ids) then return false; end if;
        all_ids := array_append(all_ids,current_id);
        load_node := set_node -> 'load';
        if load_node ->> 'mode' = 'bodyweight' then
          if not app_private.f17_workout_json_keys_allowed(load_node,array['mode']) or (select count(*) from jsonb_object_keys(load_node)) <> 1 then return false; end if;
        elsif load_node ->> 'mode' in ('added_weight','assisted') then
          if not app_private.f17_workout_json_keys_allowed(load_node,array['mode','value','unit']) or (select count(*) from jsonb_object_keys(load_node)) <> 3
            or jsonb_typeof(load_node -> 'value') <> 'string' or (load_node ->> 'value') !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
            or (load_node ->> 'value')::numeric <= 0 or load_node ->> 'unit' not in ('kg','lb') then return false; end if;
        else return false; end if;
      end loop;
    end loop;
  end loop;
  return true;
end $$;
alter function app_private.f17_workout_document_valid(jsonb) owner to postgres;
revoke all on function app_private.f17_workout_document_valid(jsonb) from public, anon, authenticated, service_role;

create function app_private.f17_workout_template_start_operation(
  p_actor uuid, p_action text, p_key uuid, p_hash text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare prior_result jsonb;
begin
  prior_result := app_private.operation_key_result(p_actor, p_action, p_key, p_hash);
  if prior_result is not null then return prior_result; end if;
  insert into app_private.operation_keys(actor_user_id, action, operation_key, request_hash)
    values (p_actor, p_action, p_key, p_hash)
    on conflict (actor_user_id, operation_key) do nothing;
  if not found then
    prior_result := app_private.operation_key_result(p_actor, p_action, p_key, p_hash);
    if prior_result is not null then return prior_result; end if;
  end if;
  return null;
end $$;
alter function app_private.f17_workout_template_start_operation(uuid,text,uuid,text) owner to postgres;
revoke all on function app_private.f17_workout_template_start_operation(uuid,text,uuid,text) from public, anon, authenticated, service_role;

create function app_private.f17_workout_template_finish_operation(p_actor uuid, p_key uuid, p_result jsonb)
returns void language sql security definer set search_path = '' as $$
  update app_private.operation_keys set result = p_result
  where actor_user_id = p_actor and operation_key = p_key and result is null
$$;
alter function app_private.f17_workout_template_finish_operation(uuid,uuid,jsonb) owner to postgres;
revoke all on function app_private.f17_workout_template_finish_operation(uuid,uuid,jsonb) from public, anon, authenticated, service_role;

create function app_private.f17_workout_template_write_audit(
  p_actor uuid, p_action text, p_table text, p_target uuid, p_workspace uuid, p_version integer
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (p_actor, p_action, p_table, p_target, p_workspace, jsonb_build_object('version', p_version))
$$;
alter function app_private.f17_workout_template_write_audit(uuid,text,text,uuid,uuid,integer) owner to postgres;
revoke all on function app_private.f17_workout_template_write_audit(uuid,text,text,uuid,uuid,integer) from public, anon, authenticated, service_role;

create function public.create_workout_global_template(p_title text,p_document jsonb,p_operation_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); template_id uuid; request_hash text; result jsonb; replay jsonb;
begin
  if actor is null or not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 200 or p_document is null or jsonb_typeof(p_document) <> 'object'
    or p_document ->> 'schema_version' <> '1' or jsonb_typeof(p_document -> 'days') <> 'array'
    or not app_private.f17_workout_document_valid(p_document) or p_operation_key is null
    or app_private.f17_workout_has_private_reference(p_document) then
    raise exception 'invalid_workout_template' using errcode = '22023';
  end if;
  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','create_global_template','title',p_title,'document',p_document
  )::text,'UTF8'),'sha256'),'hex');
  replay := app_private.f17_workout_template_start_operation(actor,'template.workout_global_write',p_operation_key,request_hash);
  if replay is not null then
    if not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
    return replay;
  end if;
  if not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
  set constraints all deferred;
  insert into public.workout_global_templates(created_by,current_version) values (actor,1) returning id into template_id;
  insert into public.workout_global_template_versions(template_id,version,title,schema_version,document,created_by)
    values (template_id,1,p_title,1,p_document,actor);
  result := jsonb_build_object('template_id',template_id,'version',1);
  perform app_private.f17_workout_template_finish_operation(actor,p_operation_key,result);
  perform app_private.f17_workout_template_write_audit(actor,'template.workout_global_created','workout_global_templates',template_id,null,1);
  return result;
end $$;

create function public.version_workout_global_template(p_template_id uuid,p_expected_version integer,p_title text,p_document jsonb,p_operation_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); root public.workout_global_templates%rowtype; request_hash text; result jsonb; replay jsonb; next_version integer;
begin
  if actor is null or not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
  if p_template_id is null or p_expected_version is null or p_expected_version < 1 or p_document is null
    or p_title is null or length(btrim(p_title)) not between 1 and 200 or jsonb_typeof(p_document) <> 'object' or p_document ->> 'schema_version' <> '1'
    or jsonb_typeof(p_document -> 'days') <> 'array' or p_operation_key is null
    or not app_private.f17_workout_document_valid(p_document) or app_private.f17_workout_has_private_reference(p_document) then
    raise exception 'invalid_workout_template' using errcode = '22023';
  end if;
  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','version_global_template','template_id',p_template_id,'expected_version',p_expected_version,'title',p_title,'document',p_document
  )::text,'UTF8'),'sha256'),'hex');
  replay := app_private.f17_workout_template_start_operation(actor,'template.workout_global_write',p_operation_key,request_hash);
  if replay is not null then
    if not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
    return replay;
  end if;
  select * into root from public.workout_global_templates where id=p_template_id for update;
  if not found or not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
  if root.current_version <> p_expected_version then raise exception 'stale_version' using errcode = '40001'; end if;
  if root.lifecycle_state <> 'active' then raise exception 'not_permitted' using errcode = '42501'; end if;
  next_version := root.current_version + 1;
  set constraints all deferred;
  insert into public.workout_global_template_versions(template_id,version,title,schema_version,document,created_by)
    values(root.id,next_version,p_title,1,p_document,actor);
  update public.workout_global_templates set current_version=next_version,updated_at=clock_timestamp() where id=root.id;
  result := jsonb_build_object('template_id',root.id,'version',next_version);
  perform app_private.f17_workout_template_finish_operation(actor,p_operation_key,result);
  perform app_private.f17_workout_template_write_audit(actor,'template.workout_global_versioned','workout_global_templates',root.id,null,next_version);
  return result;
end $$;

create function public.retire_workout_global_template(p_template_id uuid,p_expected_version integer,p_operation_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); root public.workout_global_templates%rowtype; request_hash text; result jsonb; replay jsonb;
begin
  if actor is null or not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
  if p_template_id is null or p_expected_version is null or p_expected_version < 1 or p_operation_key is null then
    raise exception 'invalid_workout_template' using errcode = '22023'; end if;
  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','retire_global_template','template_id',p_template_id,'expected_version',p_expected_version
  )::text,'UTF8'),'sha256'),'hex');
  replay := app_private.f17_workout_template_start_operation(actor,'template.workout_global_write',p_operation_key,request_hash);
  if replay is not null then
    if not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
    return replay;
  end if;
  select * into root from public.workout_global_templates where id=p_template_id for update;
  if not found or not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
  if root.current_version <> p_expected_version then raise exception 'stale_version' using errcode = '40001'; end if;
  if root.lifecycle_state <> 'active' then raise exception 'not_permitted' using errcode = '42501'; end if;
  update public.workout_global_templates set lifecycle_state='retired',retired_at=clock_timestamp(),retired_by=actor,updated_at=clock_timestamp() where id=root.id;
  result := jsonb_build_object('template_id',root.id,'status','retired','version',root.current_version);
  perform app_private.f17_workout_template_finish_operation(actor,p_operation_key,result);
  perform app_private.f17_workout_template_write_audit(actor,'template.workout_global_retired','workout_global_templates',root.id,null,root.current_version);
  return result;
end $$;

create function public.create_workout_workspace_template(p_workspace_id uuid,p_title text,p_document jsonb,p_operation_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); template_id uuid; request_hash text; result jsonb; replay jsonb;
begin
  if actor is null or p_workspace_id is null or not app_private.has_workspace_access(p_workspace_id,'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 200 or p_document is null
    or jsonb_typeof(p_document) <> 'object' or p_document ->> 'schema_version' <> '1'
    or jsonb_typeof(p_document -> 'days') <> 'array' or not app_private.f17_workout_document_valid(p_document) or p_operation_key is null then
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

create function public.version_workout_workspace_template(p_workspace_id uuid,p_template_id uuid,p_expected_version integer,p_title text,p_document jsonb,p_operation_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); root public.workout_workspace_templates%rowtype; request_hash text; result jsonb; replay jsonb; next_version integer;
begin
  if actor is null or p_workspace_id is null or p_template_id is null or not app_private.has_workspace_access(p_workspace_id,'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501'; end if;
  if p_expected_version is null or p_expected_version < 1 or p_title is null or length(btrim(p_title)) not between 1 and 200
    or p_document is null or jsonb_typeof(p_document) <> 'object' or p_document ->> 'schema_version' <> '1'
    or jsonb_typeof(p_document -> 'days') <> 'array' or not app_private.f17_workout_document_valid(p_document) or p_operation_key is null then
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

create function public.retire_workout_workspace_template(p_workspace_id uuid,p_template_id uuid,p_expected_version integer,p_operation_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); root public.workout_workspace_templates%rowtype; request_hash text; result jsonb; replay jsonb;
begin
  if actor is null or p_workspace_id is null or p_template_id is null or not app_private.has_workspace_access(p_workspace_id,'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501'; end if;
  if p_expected_version is null or p_expected_version < 1 or p_operation_key is null then
    raise exception 'invalid_workout_template' using errcode = '22023'; end if;
  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','retire_workspace_template','workspace_id',p_workspace_id,'template_id',p_template_id,'expected_version',p_expected_version
  )::text,'UTF8'),'sha256'),'hex');
  replay := app_private.f17_workout_template_start_operation(actor,'template.workout_workspace_retire',p_operation_key,request_hash);
  if replay is not null then
    if not app_private.has_workspace_access(p_workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
    return replay;
  end if;
  select * into root from public.workout_workspace_templates where workspace_id=p_workspace_id and id=p_template_id for update;
  if not found or not app_private.has_workspace_access(p_workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
  if root.current_version <> p_expected_version then raise exception 'stale_version' using errcode = '40001'; end if;
  if root.lifecycle_state <> 'active' then raise exception 'not_permitted' using errcode = '42501'; end if;
  update public.workout_workspace_templates set lifecycle_state='retired',retired_at=clock_timestamp(),retired_by=actor,updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and id=p_template_id;
  result := jsonb_build_object('template_id',p_template_id,'status','retired','version',root.current_version);
  perform app_private.f17_workout_template_finish_operation(actor,p_operation_key,result);
  perform app_private.f17_workout_template_write_audit(actor,'template.workout_workspace_retired','workout_workspace_templates',p_template_id,p_workspace_id,root.current_version);
  return result;
end $$;

alter function public.create_workout_global_template(text,jsonb,uuid) owner to postgres;
alter function public.version_workout_global_template(uuid,integer,text,jsonb,uuid) owner to postgres;
alter function public.retire_workout_global_template(uuid,integer,uuid) owner to postgres;
alter function public.create_workout_workspace_template(uuid,text,jsonb,uuid) owner to postgres;
alter function public.version_workout_workspace_template(uuid,uuid,integer,text,jsonb,uuid) owner to postgres;
alter function public.retire_workout_workspace_template(uuid,uuid,integer,uuid) owner to postgres;
revoke all on function public.create_workout_global_template(text,jsonb,uuid) from public, anon, service_role;
revoke all on function public.version_workout_global_template(uuid,integer,text,jsonb,uuid) from public, anon, service_role;
revoke all on function public.retire_workout_global_template(uuid,integer,uuid) from public, anon, service_role;
revoke all on function public.create_workout_workspace_template(uuid,text,jsonb,uuid) from public, anon, service_role;
revoke all on function public.version_workout_workspace_template(uuid,uuid,integer,text,jsonb,uuid) from public, anon, service_role;
revoke all on function public.retire_workout_workspace_template(uuid,uuid,integer,uuid) from public, anon, service_role;
grant execute on function public.create_workout_global_template(text,jsonb,uuid) to authenticated;
grant execute on function public.version_workout_global_template(uuid,integer,text,jsonb,uuid) to authenticated;
grant execute on function public.retire_workout_global_template(uuid,integer,uuid) to authenticated;
grant execute on function public.create_workout_workspace_template(uuid,text,jsonb,uuid) to authenticated;
grant execute on function public.version_workout_workspace_template(uuid,uuid,integer,text,jsonb,uuid) to authenticated;
grant execute on function public.retire_workout_workspace_template(uuid,uuid,integer,uuid) to authenticated;
