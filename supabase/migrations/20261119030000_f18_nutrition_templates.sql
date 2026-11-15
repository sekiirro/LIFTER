-- F18 T012/T013: isolated nutrition template identities, immutable versions,
-- audited version operations, retirement, and creation-time draft loading.

create table public.nutrition_global_templates (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  status text not null default 'active' check (status in ('active', 'retired')),
  current_version integer not null check (current_version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp() check (isfinite(created_at)),
  retired_at timestamptz,
  unique (id),
  check ((status = 'active' and retired_at is null) or (status = 'retired' and retired_at is not null))
);

create table public.nutrition_global_template_versions (
  template_id uuid not null,
  version integer not null check (version > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  schema_version integer not null check (schema_version > 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp() check (isfinite(created_at)),
  created_by uuid not null references auth.users(id) on delete restrict,
  primary key (template_id, version),
  foreign key (template_id) references public.nutrition_global_templates(id) on delete restrict
);

alter table public.nutrition_global_templates
  add constraint nutrition_global_templates_current_version_fk
  foreign key (id, current_version)
  references public.nutrition_global_template_versions(template_id, version)
  deferrable initially deferred;

create table public.nutrition_workspace_templates (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  id uuid not null default pg_catalog.gen_random_uuid(),
  status text not null default 'active' check (status in ('active', 'retired')),
  display_name text not null check (length(pg_catalog.btrim(display_name)) > 0),
  current_version integer not null check (current_version > 0),
  origin_global_template_id uuid,
  origin_global_template_version integer,
  created_at timestamptz not null default pg_catalog.clock_timestamp() check (isfinite(created_at)),
  created_by uuid not null references auth.users(id) on delete restrict,
  retired_at timestamptz,
  primary key (workspace_id, id),
  unique (workspace_id, id),
  unique (workspace_id, origin_global_template_id),
  check ((origin_global_template_id is null) = (origin_global_template_version is null)),
  check ((status = 'active' and retired_at is null) or (status = 'retired' and retired_at is not null)),
  foreign key (origin_global_template_id, origin_global_template_version)
    references public.nutrition_global_template_versions(template_id, version) on delete restrict
);

create table public.nutrition_workspace_template_versions (
  workspace_id uuid not null,
  template_id uuid not null,
  version integer not null check (version > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  schema_version integer not null check (schema_version > 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp() check (isfinite(created_at)),
  created_by uuid not null references auth.users(id) on delete restrict,
  primary key (workspace_id, template_id, version),
  foreign key (workspace_id, template_id)
    references public.nutrition_workspace_templates(workspace_id, id) on delete restrict
);

alter table public.nutrition_workspace_templates
  add constraint nutrition_workspace_templates_current_version_fk
  foreign key (workspace_id, id, current_version)
  references public.nutrition_workspace_template_versions(workspace_id, template_id, version)
  deferrable initially deferred;

create index nutrition_workspace_template_versions_workspace_idx
  on public.nutrition_workspace_template_versions(workspace_id, template_id);

alter table public.nutrition_global_templates enable row level security;
alter table public.nutrition_global_templates force row level security;
alter table public.nutrition_global_template_versions enable row level security;
alter table public.nutrition_global_template_versions force row level security;
alter table public.nutrition_workspace_templates enable row level security;
alter table public.nutrition_workspace_templates force row level security;
alter table public.nutrition_workspace_template_versions enable row level security;
alter table public.nutrition_workspace_template_versions force row level security;

create policy nutrition_global_templates_po_read on public.nutrition_global_templates
  for select to authenticated using ((select app_private.is_platform_owner()));
create policy nutrition_global_template_versions_po_read on public.nutrition_global_template_versions
  for select to authenticated using ((select app_private.is_platform_owner()));
create policy nutrition_workspace_templates_scope_read on public.nutrition_workspace_templates
  for select to authenticated using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
create policy nutrition_workspace_template_versions_scope_read on public.nutrition_workspace_template_versions
  for select to authenticated using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));

revoke all on public.nutrition_global_templates, public.nutrition_global_template_versions,
  public.nutrition_workspace_templates, public.nutrition_workspace_template_versions
  from public, anon, authenticated, service_role;
grant select (id, status, current_version, created_at, retired_at)
  on public.nutrition_global_templates to authenticated;
grant select (template_id, version, document, schema_version, created_at)
  on public.nutrition_global_template_versions to authenticated;
grant select (workspace_id, id, status, display_name, current_version, created_at, retired_at)
  on public.nutrition_workspace_templates to authenticated;
grant select (workspace_id, template_id, version, document, schema_version, created_at)
  on public.nutrition_workspace_template_versions to authenticated;

create function app_private.nutrition_template_guard_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'nutrition_template_restricted' using errcode = '23503';
  end if;
  if tg_table_name = 'nutrition_global_templates' then
    if (new.id, new.created_by, new.created_at) is distinct from (old.id, old.created_by, old.created_at) then
      raise exception 'nutrition_template_identity_immutable' using errcode = '23514';
    end if;
  else
    if (new.workspace_id, new.id, new.created_by, new.created_at,
        new.origin_global_template_id, new.origin_global_template_version)
      is distinct from
       (old.workspace_id, old.id, old.created_by, old.created_at,
        old.origin_global_template_id, old.origin_global_template_version) then
      raise exception 'nutrition_template_identity_immutable' using errcode = '23514';
    end if;
  end if;

  if new.status = old.status and new.retired_at is not distinct from old.retired_at then
    if old.status <> 'active' or new.current_version <> old.current_version + 1 then
      raise exception 'nutrition_template_version_conflict' using errcode = '40001';
    end if;
    if tg_table_name = 'nutrition_workspace_templates' then
      if length(pg_catalog.btrim(new.display_name)) = 0 then
        raise exception 'invalid_nutrition_template' using errcode = '22023';
      end if;
    end if;
  elsif old.status = 'active' and new.status = 'retired'
    and new.retired_at is not null and new.current_version = old.current_version then
    if tg_table_name = 'nutrition_workspace_templates' then
      if new.display_name is distinct from old.display_name then
        raise exception 'nutrition_template_retire_changed_name' using errcode = '23514';
      end if;
    end if;
  else
    raise exception 'nutrition_template_state_conflict' using errcode = '40001';
  end if;
  return new;
end $$;

create function app_private.nutrition_template_version_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'nutrition_template_version_immutable' using errcode = '23514';
end $$;

create trigger nutrition_global_templates_guard
  before update or delete on public.nutrition_global_templates
  for each row execute function app_private.nutrition_template_guard_identity();
create trigger nutrition_workspace_templates_guard
  before update or delete on public.nutrition_workspace_templates
  for each row execute function app_private.nutrition_template_guard_identity();
create trigger nutrition_global_template_versions_immutable
  before update or delete on public.nutrition_global_template_versions
  for each row execute function app_private.nutrition_template_version_immutable();
create trigger nutrition_global_template_versions_no_truncate
  before truncate on public.nutrition_global_template_versions
  for each statement execute function app_private.nutrition_template_version_immutable();
create trigger nutrition_workspace_template_versions_immutable
  before update or delete on public.nutrition_workspace_template_versions
  for each row execute function app_private.nutrition_template_version_immutable();
create trigger nutrition_workspace_template_versions_no_truncate
  before truncate on public.nutrition_workspace_template_versions
  for each statement execute function app_private.nutrition_template_version_immutable();

create function app_private.nutrition_template_start_operation(
  p_actor uuid, p_action text, p_operation_key uuid, p_request_hash text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare prior_result jsonb;
begin
  prior_result := app_private.operation_key_result(p_actor, p_action, p_operation_key, p_request_hash);
  if prior_result is not null then return prior_result; end if;
  insert into app_private.operation_keys(actor_user_id, action, operation_key, request_hash)
    values (p_actor, p_action, p_operation_key, p_request_hash)
    on conflict (actor_user_id, operation_key) do nothing;
  if not found then
    prior_result := app_private.operation_key_result(p_actor, p_action, p_operation_key, p_request_hash);
    if prior_result is not null then return prior_result; end if;
  end if;
  return null;
end $$;

create function app_private.nutrition_template_finish_operation(
  p_actor uuid, p_operation_key uuid, p_result jsonb
) returns void
language sql security definer set search_path = '' as $$
  update app_private.operation_keys
  set result = p_result
  where actor_user_id = p_actor and operation_key = p_operation_key and result is null
$$;

create function app_private.nutrition_template_write_audit(
  p_actor uuid, p_action text, p_table text, p_target uuid, p_workspace uuid, p_details jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (p_actor, p_action, p_table, p_target, p_workspace, p_details)
$$;

create function app_private.nutrition_template_collect_ids(p_node jsonb) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare result jsonb := '{}'::jsonb; pair record; entry jsonb;
begin
  if jsonb_typeof(p_node) = 'object' then
    for pair in select key, value from jsonb_each(p_node) loop
      if pair.key = 'id' and jsonb_typeof(pair.value) = 'string' then
        result := result || jsonb_build_object(pair.value #>> '{}', pg_catalog.gen_random_uuid()::text);
      end if;
      entry := app_private.nutrition_template_collect_ids(pair.value);
      result := result || entry;
    end loop;
  elsif jsonb_typeof(p_node) = 'array' then
    for entry in select value from jsonb_array_elements(p_node) loop
      result := result || app_private.nutrition_template_collect_ids(entry);
    end loop;
  end if;
  return result;
end $$;

create function app_private.nutrition_template_remap_ids(p_node jsonb, p_map jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare result jsonb; pair record; entry jsonb; text_value text;
begin
  if jsonb_typeof(p_node) = 'object' then
    result := '{}'::jsonb;
    for pair in select key, value from jsonb_each(p_node) loop
      if pair.key in ('id', 'dayTypeId', 'implicitDayTypeId') and jsonb_typeof(pair.value) = 'string'
        and p_map ? (pair.value #>> '{}') then
        entry := to_jsonb(p_map ->> (pair.value #>> '{}'));
      else
        entry := app_private.nutrition_template_remap_ids(pair.value, p_map);
      end if;
      result := result || jsonb_build_object(pair.key, entry);
    end loop;
    return result;
  elsif jsonb_typeof(p_node) = 'array' then
    select coalesce(jsonb_agg(app_private.nutrition_template_remap_ids(value, p_map)), '[]'::jsonb)
      into result from jsonb_array_elements(p_node);
    return result;
  elsif jsonb_typeof(p_node) = 'string' then
    return p_node;
  end if;
  return p_node;
end $$;

create function public.create_nutrition_global_template(
  p_document jsonb, p_schema_version integer, p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); template_id uuid; request_hash text; result jsonb; replay jsonb;
begin
  if actor is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_document is null or jsonb_typeof(p_document) <> 'object' or p_schema_version is null
    or p_schema_version < 1 or p_operation_key is null then
    raise exception 'invalid_nutrition_template' using errcode = '22023';
  end if;
  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','create_global_template','document',p_document,'schema_version',p_schema_version
  )::text,'UTF8'),'sha256'),'hex');
  replay := app_private.nutrition_template_start_operation(actor,'template.nutrition_global_write',p_operation_key,request_hash);
  if replay is not null then
    if not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
    return replay;
  end if;
  if not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
  set constraints all deferred;
  insert into public.nutrition_global_templates(created_by,current_version)
    values (actor,1) returning id into template_id;
  insert into public.nutrition_global_template_versions(template_id,version,document,schema_version,created_by)
    values (template_id,1,p_document,p_schema_version,actor);
  result := jsonb_build_object('template_id',template_id,'version',1);
  perform app_private.nutrition_template_finish_operation(actor,p_operation_key,result);
  perform app_private.nutrition_template_write_audit(actor,'template.nutrition_global_created',
    'nutrition_global_templates',template_id,null,jsonb_build_object('version',1));
  return result;
end $$;

create function public.version_nutrition_global_template(
  p_template_id uuid, p_expected_version integer, p_document jsonb, p_schema_version integer, p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); root public.nutrition_global_templates%rowtype;
  request_hash text; result jsonb; replay jsonb; next_version integer;
begin
  if actor is null or not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
  if p_template_id is null or p_expected_version is null or p_expected_version < 1
    or p_document is null or jsonb_typeof(p_document) <> 'object'
    or p_schema_version is null or p_schema_version < 1 or p_operation_key is null then
    raise exception 'invalid_nutrition_template' using errcode = '22023';
  end if;
  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','version_global_template','template_id',p_template_id,'expected_version',p_expected_version,
    'document',p_document,'schema_version',p_schema_version
  )::text,'UTF8'),'sha256'),'hex');
  replay := app_private.nutrition_template_start_operation(actor,'template.nutrition_global_write',p_operation_key,request_hash);
  if replay is not null then
    if not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
    return replay;
  end if;
  select * into root from public.nutrition_global_templates where id=p_template_id for update;
  if not found or not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
  if root.current_version <> p_expected_version then raise exception 'stale_version' using errcode = '40001'; end if;
  if root.status <> 'active' then raise exception 'not_permitted' using errcode = '42501'; end if;
  next_version := root.current_version + 1;
  set constraints all deferred;
  insert into public.nutrition_global_template_versions(template_id,version,document,schema_version,created_by)
    values (root.id,next_version,p_document,p_schema_version,actor);
  update public.nutrition_global_templates set current_version=next_version where id=root.id;
  result := jsonb_build_object('template_id',root.id,'version',next_version);
  perform app_private.nutrition_template_finish_operation(actor,p_operation_key,result);
  perform app_private.nutrition_template_write_audit(actor,'template.nutrition_global_versioned',
    'nutrition_global_templates',root.id,null,jsonb_build_object('version',next_version));
  return result;
end $$;

create function public.retire_nutrition_global_template(
  p_template_id uuid, p_expected_version integer, p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); root public.nutrition_global_templates%rowtype;
  request_hash text; result jsonb; replay jsonb;
begin
  if actor is null or not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
  if p_template_id is null or p_expected_version is null or p_expected_version < 1 or p_operation_key is null then
    raise exception 'invalid_nutrition_template' using errcode = '22023';
  end if;
  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','retire_global_template','template_id',p_template_id,'expected_version',p_expected_version
  )::text,'UTF8'),'sha256'),'hex');
  replay := app_private.nutrition_template_start_operation(actor,'template.nutrition_global_write',p_operation_key,request_hash);
  if replay is not null then
    if not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
    return replay;
  end if;
  select * into root from public.nutrition_global_templates where id=p_template_id for update;
  if not found or not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
  if root.current_version <> p_expected_version then raise exception 'stale_version' using errcode = '40001'; end if;
  if root.status <> 'active' then raise exception 'not_permitted' using errcode = '42501'; end if;
  update public.nutrition_global_templates set status='retired',retired_at=pg_catalog.clock_timestamp() where id=root.id;
  result := jsonb_build_object('template_id',root.id,'status','retired','version',root.current_version);
  perform app_private.nutrition_template_finish_operation(actor,p_operation_key,result);
  perform app_private.nutrition_template_write_audit(actor,'template.nutrition_global_retired',
    'nutrition_global_templates',root.id,null,jsonb_build_object('version',root.current_version));
  return result;
end $$;

create function public.create_nutrition_workspace_template(
  p_workspace_id uuid, p_display_name text, p_document jsonb, p_schema_version integer, p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); template_id uuid; request_hash text; result jsonb; replay jsonb;
begin
  if actor is null or p_workspace_id is null
    or not app_private.has_workspace_access(p_workspace_id,'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_display_name is null or length(btrim(p_display_name))=0 or p_document is null
    or jsonb_typeof(p_document)<>'object' or p_schema_version is null or p_schema_version<1
    or p_operation_key is null then raise exception 'invalid_nutrition_template' using errcode = '22023'; end if;
  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','create_workspace_template','workspace_id',p_workspace_id,'display_name',p_display_name,
    'document',p_document,'schema_version',p_schema_version
  )::text,'UTF8'),'sha256'),'hex');
  replay := app_private.nutrition_template_start_operation(actor,'template.nutrition_workspace_write',p_operation_key,request_hash);
  if replay is not null then
    if not app_private.has_workspace_access(p_workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
    return replay;
  end if;
  if not app_private.has_workspace_access(p_workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
  set constraints all deferred;
  insert into public.nutrition_workspace_templates(workspace_id,display_name,created_by,current_version)
    values (p_workspace_id,p_display_name,actor,1) returning id into template_id;
  insert into public.nutrition_workspace_template_versions(workspace_id,template_id,version,document,schema_version,created_by)
    values (p_workspace_id,template_id,1,p_document,p_schema_version,actor);
  result := jsonb_build_object('template_id',template_id,'version',1);
  perform app_private.nutrition_template_finish_operation(actor,p_operation_key,result);
  perform app_private.nutrition_template_write_audit(actor,'template.nutrition_workspace_created',
    'nutrition_workspace_templates',template_id,p_workspace_id,jsonb_build_object('version',1));
  return result;
end $$;

create function public.version_nutrition_workspace_template(
  p_workspace_id uuid, p_template_id uuid, p_expected_version integer,
  p_display_name text, p_document jsonb, p_schema_version integer, p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); root public.nutrition_workspace_templates%rowtype;
  request_hash text; result jsonb; replay jsonb; next_version integer;
begin
  if actor is null or p_workspace_id is null or p_template_id is null
    or not app_private.has_workspace_access(p_workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
  if p_expected_version is null or p_expected_version<1 or p_display_name is null
    or length(btrim(p_display_name))=0 or p_document is null or jsonb_typeof(p_document)<>'object'
    or p_schema_version is null or p_schema_version<1 or p_operation_key is null then
    raise exception 'invalid_nutrition_template' using errcode = '22023';
  end if;
  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','version_workspace_template','workspace_id',p_workspace_id,'template_id',p_template_id,
    'expected_version',p_expected_version,'display_name',p_display_name,'document',p_document,'schema_version',p_schema_version
  )::text,'UTF8'),'sha256'),'hex');
  replay := app_private.nutrition_template_start_operation(actor,'template.nutrition_workspace_write',p_operation_key,request_hash);
  if replay is not null then
    if not app_private.has_workspace_access(p_workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
    return replay;
  end if;
  select * into root from public.nutrition_workspace_templates
    where workspace_id=p_workspace_id and id=p_template_id for update;
  if not found or not app_private.has_workspace_access(p_workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
  if root.current_version<>p_expected_version then raise exception 'stale_version' using errcode = '40001'; end if;
  if root.status<>'active' then raise exception 'not_permitted' using errcode = '42501'; end if;
  next_version := root.current_version+1;
  set constraints all deferred;
  insert into public.nutrition_workspace_template_versions(workspace_id,template_id,version,document,schema_version,created_by)
    values(p_workspace_id,p_template_id,next_version,p_document,p_schema_version,actor);
  update public.nutrition_workspace_templates set current_version=next_version,display_name=p_display_name
    where workspace_id=p_workspace_id and id=p_template_id;
  result := jsonb_build_object('template_id',p_template_id,'version',next_version);
  perform app_private.nutrition_template_finish_operation(actor,p_operation_key,result);
  perform app_private.nutrition_template_write_audit(actor,'template.nutrition_workspace_versioned',
    'nutrition_workspace_templates',p_template_id,p_workspace_id,jsonb_build_object('version',next_version));
  return result;
end $$;

create function public.retire_nutrition_workspace_template(
  p_workspace_id uuid, p_template_id uuid, p_expected_version integer, p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); root public.nutrition_workspace_templates%rowtype;
  request_hash text; result jsonb; replay jsonb;
begin
  if actor is null or p_workspace_id is null or p_template_id is null
    or not app_private.has_workspace_access(p_workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
  if p_expected_version is null or p_expected_version<1 or p_operation_key is null then
    raise exception 'invalid_nutrition_template' using errcode = '22023'; end if;
  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','retire_workspace_template','workspace_id',p_workspace_id,'template_id',p_template_id,
    'expected_version',p_expected_version
  )::text,'UTF8'),'sha256'),'hex');
  replay := app_private.nutrition_template_start_operation(actor,'template.nutrition_workspace_retire',p_operation_key,request_hash);
  if replay is not null then
    if not app_private.has_workspace_access(p_workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
    return replay;
  end if;
  select * into root from public.nutrition_workspace_templates
    where workspace_id=p_workspace_id and id=p_template_id for update;
  if not found or not app_private.has_workspace_access(p_workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
  if root.current_version<>p_expected_version then raise exception 'stale_version' using errcode = '40001'; end if;
  if root.status<>'active' then raise exception 'not_permitted' using errcode = '42501'; end if;
  update public.nutrition_workspace_templates set status='retired',retired_at=pg_catalog.clock_timestamp()
    where workspace_id=p_workspace_id and id=p_template_id;
  result := jsonb_build_object('template_id',p_template_id,'status','retired','version',root.current_version);
  perform app_private.nutrition_template_finish_operation(actor,p_operation_key,result);
  perform app_private.nutrition_template_write_audit(actor,'template.nutrition_workspace_retired',
    'nutrition_workspace_templates',p_template_id,p_workspace_id,jsonb_build_object('version',root.current_version));
  return result;
end $$;

create function public.load_nutrition_template_version(
  p_plan_id uuid, p_template_kind text, p_template_id uuid, p_version integer, p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); root public.plan_roots%rowtype; draft public.plan_drafts%rowtype;
  source_document jsonb; copied_document jsonb; id_map jsonb; source_schema_version integer;
  request_hash text; result jsonb; replay jsonb; source_status text;
begin
  if actor is null or p_plan_id is null then raise exception 'not_permitted' using errcode = '42501'; end if;
  select * into root from public.plan_roots where id=p_plan_id;
  if not found or root.plan_kind<>'nutrition'
    or not app_private.has_workspace_access(root.workspace_id,'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_template_kind is null or p_template_kind not in ('global','workspace')
    or p_template_id is null or p_version is null or p_version<1 or p_operation_key is null then
    raise exception 'invalid_nutrition_template_load' using errcode = '22023';
  end if;
  if p_template_kind='global' and not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','load_template_version','plan_id',p_plan_id,'template_kind',p_template_kind,
    'template_id',p_template_id,'version',p_version
  )::text,'UTF8'),'sha256'),'hex');
  replay := app_private.nutrition_template_start_operation(actor,'plan.nutrition_template_load',p_operation_key,request_hash);
  if replay is not null then
    select * into root from public.plan_roots where id=p_plan_id;
    if not found or root.plan_kind<>'nutrition'
      or not app_private.has_workspace_access(root.workspace_id,'coaching_work')
      or (p_template_kind='global' and not app_private.is_platform_owner()) then
      raise exception 'not_permitted' using errcode = '42501';
    end if;
    return replay;
  end if;

  select * into root from public.plan_roots where id=p_plan_id for update;
  if not found or root.plan_kind<>'nutrition'
    or not app_private.has_workspace_access(root.workspace_id,'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select * into draft from public.plan_drafts
    where workspace_id=root.workspace_id and plan_id=root.id for update;
  if not found or not app_private.has_workspace_access(root.workspace_id,'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if draft.content <> '{}'::jsonb then raise exception 'nutrition_draft_not_empty' using errcode = '22023'; end if;

  if p_template_kind='global' then
    select t.status,v.document,v.schema_version into source_status,source_document,source_schema_version
      from public.nutrition_global_templates t
      join public.nutrition_global_template_versions v on v.template_id=t.id
      where t.id=p_template_id and v.version=p_version
      for key share of t;
  else
    select t.status,v.document,v.schema_version into source_status,source_document,source_schema_version
      from public.nutrition_workspace_templates t
      join public.nutrition_workspace_template_versions v
        on v.workspace_id=t.workspace_id and v.template_id=t.id
      where t.workspace_id=root.workspace_id and t.id=p_template_id and v.version=p_version
      for key share of t;
  end if;
  if not found or source_status<>'active' then raise exception 'not_permitted' using errcode = '42501'; end if;
  if p_template_kind='global' and not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode = '42501'; end if;
  if not app_private.has_workspace_access(root.workspace_id,'coaching_work') then raise exception 'not_permitted' using errcode = '42501'; end if;
  id_map := app_private.nutrition_template_collect_ids(source_document);
  copied_document := app_private.nutrition_template_remap_ids(source_document,id_map);
  update public.plan_drafts set draft_version=draft.draft_version+1,content=copied_document,
    updated_by=actor,updated_at=greatest(pg_catalog.clock_timestamp(),draft.updated_at+interval '1 microsecond')
    where workspace_id=root.workspace_id and plan_id=root.id;
  result := jsonb_build_object('loaded',true,'draft_version',draft.draft_version+1,
    'template_kind',p_template_kind,'template_id',p_template_id,'version',p_version);
  perform app_private.nutrition_template_finish_operation(actor,p_operation_key,result);
  perform app_private.nutrition_template_write_audit(actor,'plan.nutrition_template_load',
    'plan_drafts',p_plan_id,root.workspace_id,jsonb_build_object('version',p_version,'template_kind',p_template_kind));
  return result;
end $$;

alter function app_private.nutrition_template_guard_identity() owner to postgres;
alter function app_private.nutrition_template_version_immutable() owner to postgres;
alter function app_private.nutrition_template_start_operation(uuid,text,uuid,text) owner to postgres;
alter function app_private.nutrition_template_finish_operation(uuid,uuid,jsonb) owner to postgres;
alter function app_private.nutrition_template_write_audit(uuid,text,text,uuid,uuid,jsonb) owner to postgres;
alter function app_private.nutrition_template_collect_ids(jsonb) owner to postgres;
alter function app_private.nutrition_template_remap_ids(jsonb,jsonb) owner to postgres;
alter function public.create_nutrition_global_template(jsonb,integer,uuid) owner to postgres;
alter function public.version_nutrition_global_template(uuid,integer,jsonb,integer,uuid) owner to postgres;
alter function public.retire_nutrition_global_template(uuid,integer,uuid) owner to postgres;
alter function public.create_nutrition_workspace_template(uuid,text,jsonb,integer,uuid) owner to postgres;
alter function public.version_nutrition_workspace_template(uuid,uuid,integer,text,jsonb,integer,uuid) owner to postgres;
alter function public.retire_nutrition_workspace_template(uuid,uuid,integer,uuid) owner to postgres;
alter function public.load_nutrition_template_version(uuid,text,uuid,integer,uuid) owner to postgres;

revoke all on function app_private.nutrition_template_guard_identity() from public,anon,authenticated,service_role;
revoke all on function app_private.nutrition_template_version_immutable() from public,anon,authenticated,service_role;
revoke all on function app_private.nutrition_template_start_operation(uuid,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function app_private.nutrition_template_finish_operation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function app_private.nutrition_template_write_audit(uuid,text,text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function app_private.nutrition_template_collect_ids(jsonb) from public,anon,authenticated,service_role;
revoke all on function app_private.nutrition_template_remap_ids(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.create_nutrition_global_template(jsonb,integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.version_nutrition_global_template(uuid,integer,jsonb,integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.retire_nutrition_global_template(uuid,integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.create_nutrition_workspace_template(uuid,text,jsonb,integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.version_nutrition_workspace_template(uuid,uuid,integer,text,jsonb,integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.retire_nutrition_workspace_template(uuid,uuid,integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.load_nutrition_template_version(uuid,text,uuid,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_nutrition_global_template(jsonb,integer,uuid) to authenticated;
grant execute on function public.version_nutrition_global_template(uuid,integer,jsonb,integer,uuid) to authenticated;
grant execute on function public.retire_nutrition_global_template(uuid,integer,uuid) to authenticated;
grant execute on function public.create_nutrition_workspace_template(uuid,text,jsonb,integer,uuid) to authenticated;
grant execute on function public.version_nutrition_workspace_template(uuid,uuid,integer,text,jsonb,integer,uuid) to authenticated;
grant execute on function public.retire_nutrition_workspace_template(uuid,uuid,integer,uuid) to authenticated;
grant execute on function public.load_nutrition_template_version(uuid,text,uuid,integer,uuid) to authenticated;
