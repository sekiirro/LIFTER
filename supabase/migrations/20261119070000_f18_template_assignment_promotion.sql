-- F18 T014/T015: PO-only atomic template distribution and safe promotion.

create table public.nutrition_template_assignment_batches (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  template_selection_mode text not null check (template_selection_mode in ('all','specific','all_except')),
  template_ids uuid[],
  excluded_template_ids uuid[],
  workspace_selection_mode text not null check (workspace_selection_mode in ('all','specific')),
  workspace_ids uuid[],
  operation_receipt_id uuid not null unique,
  created_at timestamptz not null default pg_catalog.clock_timestamp() check (isfinite(created_at)),
  created_by uuid not null references auth.users(id) on delete restrict,
  assigned_count integer not null check (assigned_count > 0),
  skipped_count integer not null check (skipped_count >= 0),
  check ((template_selection_mode='specific') = (template_ids is not null)),
  check ((template_selection_mode='all_except') = (excluded_template_ids is not null)),
  check ((workspace_selection_mode='specific') = (workspace_ids is not null))
);

create table public.nutrition_template_assignment_items (
  batch_id uuid not null references public.nutrition_template_assignment_batches(id) on delete restrict,
  seq integer not null check (seq > 0),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  global_template_id uuid not null,
  global_template_version integer not null check (global_template_version > 0),
  outcome text not null check (outcome in ('assigned','skipped_existing','skipped_ineligible')),
  created_workspace_template_id uuid,
  created_at timestamptz not null default pg_catalog.clock_timestamp() check (isfinite(created_at)),
  primary key (batch_id, seq),
  unique (batch_id, workspace_id, global_template_id),
  check ((outcome='assigned') = (created_workspace_template_id is not null)),
  foreign key (global_template_id, global_template_version)
    references public.nutrition_global_template_versions(template_id,version) on delete restrict,
  foreign key (workspace_id, created_workspace_template_id)
    references public.nutrition_workspace_templates(workspace_id,id) on delete restrict
);

alter table public.nutrition_template_assignment_batches enable row level security;
alter table public.nutrition_template_assignment_batches force row level security;
alter table public.nutrition_template_assignment_items enable row level security;
alter table public.nutrition_template_assignment_items force row level security;
create policy nutrition_template_assignment_batches_po on public.nutrition_template_assignment_batches
  for select to authenticated using ((select app_private.is_platform_owner()));
create policy nutrition_template_assignment_items_po on public.nutrition_template_assignment_items
  for select to authenticated using ((select app_private.is_platform_owner()));
revoke all on public.nutrition_template_assignment_batches, public.nutrition_template_assignment_items
  from public,anon,authenticated,service_role;
grant select on public.nutrition_template_assignment_batches, public.nutrition_template_assignment_items to authenticated;

create function app_private.nutrition_template_assign_guard() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'nutrition_template_assignment_immutable' using errcode='23514'; end $$;
create trigger nutrition_template_assignment_batches_immutable before update or delete on public.nutrition_template_assignment_batches
  for each row execute function app_private.nutrition_template_assign_guard();
create trigger nutrition_template_assignment_batches_no_truncate before truncate on public.nutrition_template_assignment_batches
  for each statement execute function app_private.nutrition_template_assign_guard();
create trigger nutrition_template_assignment_items_immutable before update or delete on public.nutrition_template_assignment_items
  for each row execute function app_private.nutrition_template_assign_guard();
create trigger nutrition_template_assignment_items_no_truncate before truncate on public.nutrition_template_assignment_items
  for each statement execute function app_private.nutrition_template_assign_guard();

create function public.assign_nutrition_templates(
  p_template_mode text, p_template_ids uuid[], p_exclude_ids uuid[],
  p_workspace_mode text, p_workspace_ids uuid[], p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); request_hash text; replay jsonb; batch_id uuid; receipt_id uuid;
  template_ids uuid[]; workspace_ids uuid[]; v_global_template_id uuid; v_target_workspace_id uuid;
  template_row record; copy_id uuid; display_name text;
  seq_no integer := 0; assigned integer := 0; skipped integer := 0;
  skipped_existing integer := 0; skipped_ineligible integer := 0;
  result jsonb; items jsonb := '[]'::jsonb; outcome text; assigned_ids jsonb := '[]'::jsonb; id_map jsonb;
begin
  if actor is null or not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode='42501'; end if;
  if p_template_mode is null or p_workspace_mode is null
    or p_template_mode not in ('all','specific','all_except') or p_workspace_mode not in ('all','specific') or p_operation_key is null
    or (p_template_mode='specific' and coalesce(cardinality(p_template_ids),0)=0)
    or (p_template_mode='all_except' and p_exclude_ids is null)
    or (p_workspace_mode='specific' and coalesce(cardinality(p_workspace_ids),0)=0)
    or (p_template_mode<>'specific' and p_template_ids is not null)
    or (p_template_mode<>'all_except' and p_exclude_ids is not null)
    or (p_workspace_mode<>'specific' and p_workspace_ids is not null) then
    raise exception 'invalid_selection' using errcode='22023';
  end if;
  request_hash := 'sha256:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'operation','assign_nutrition_templates','template_mode',p_template_mode,
    'template_ids',case when p_template_ids is null then null else to_jsonb((select array_agg(x order by x) from unnest(p_template_ids) x)) end,
    'exclude_ids',case when p_exclude_ids is null then null else to_jsonb((select array_agg(x order by x) from unnest(p_exclude_ids) x)) end,
    'workspace_mode',p_workspace_mode,
    'workspace_ids',case when p_workspace_ids is null then null else to_jsonb((select array_agg(x order by x) from unnest(p_workspace_ids) x)) end
  )::text,'UTF8'),'sha256'),'hex');
  -- Key/hash lookup precedes resolving live target sets and the zero-copy guard.
  replay := app_private.nutrition_template_start_operation(actor,'template.nutrition_assign',p_operation_key,request_hash);
  if replay is not null then
    if not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode='42501'; end if;
    return replay;
  end if;

  if p_template_mode='specific' then
    if cardinality(p_template_ids)<>(select count(distinct x) from unnest(p_template_ids) x) then raise exception 'invalid_selection' using errcode='22023'; end if;
    foreach v_global_template_id in array p_template_ids loop
      select * into template_row from public.nutrition_global_templates where id=v_global_template_id;
      if not found or template_row.status<>'active' then raise exception 'invalid_selection' using errcode='22023'; end if;
    end loop;
    select array_agg(x order by x) into template_ids from unnest(p_template_ids) x;
  elsif p_template_mode='all' then
    select array_agg(id order by id) into template_ids from public.nutrition_global_templates where status='active';
  else
    if cardinality(p_exclude_ids)<>(select count(distinct x) from unnest(p_exclude_ids) x) then raise exception 'invalid_selection' using errcode='22023'; end if;
    foreach v_global_template_id in array p_exclude_ids loop
      select * into template_row from public.nutrition_global_templates where id=v_global_template_id;
      if not found or template_row.status<>'active' then raise exception 'invalid_selection' using errcode='22023'; end if;
    end loop;
    select array_agg(id order by id) into template_ids from public.nutrition_global_templates
      where status='active' and not (id=any(p_exclude_ids));
  end if;
  if coalesce(cardinality(template_ids),0)=0 then raise exception 'invalid_selection' using errcode='22023'; end if;
  if p_workspace_mode='specific' then
    if cardinality(p_workspace_ids)<>(select count(distinct x) from unnest(p_workspace_ids) x) then raise exception 'invalid_selection' using errcode='22023'; end if;
    if exists(select 1 from unnest(p_workspace_ids) x left join public.workspaces w on w.id=x where w.id is null) then raise exception 'invalid_selection' using errcode='22023'; end if;
    select array_agg(x order by x) into workspace_ids from unnest(p_workspace_ids) x;
  else
    select array_agg(w.id order by w.id) into workspace_ids from public.workspaces w
      where not exists (select 1 from public.nutrition_template_assignment_items i
        where i.workspace_id=w.id and i.outcome='assigned');
  end if;
  if coalesce(cardinality(workspace_ids),0)=0 then raise exception 'zero_copies' using errcode='22023'; end if;

  -- Lock global roots, then workspace roots in stable order before examining held copies.
  perform 1 from public.nutrition_global_templates t where t.id=any(template_ids) order by t.id for update;
  perform 1 from public.workspaces w where w.id=any(workspace_ids) order by w.id for update;
  if p_workspace_mode='all' then
    -- A concurrent batch may have initialized targets while this operation waited for their locks.
    -- Keep the original operation-time workspace universe, but exclude newly initialized rows.
     select array_agg(x order by x) into workspace_ids from unnest(workspace_ids) x
       where not exists(select 1 from public.nutrition_template_assignment_items i
         where i.workspace_id=x and i.outcome='assigned');
    if coalesce(cardinality(workspace_ids),0)=0 then raise exception 'zero_copies' using errcode='22023'; end if;
  end if;
  -- Re-read template status and current immutable version under the locks.
  -- Lock existing copies in workspace-id/global-id order; unique origin key arbitrates absent-row races.
  perform 1 from public.nutrition_workspace_templates c
    where c.workspace_id=any(workspace_ids) and c.origin_global_template_id=any(template_ids)
    order by c.workspace_id,c.origin_global_template_id for update;
  for v_target_workspace_id in select unnest(workspace_ids) order by 1 loop
    select name into display_name from public.workspaces where id=v_target_workspace_id;
    for v_global_template_id in select unnest(template_ids) order by 1 loop
      seq_no := seq_no+1;
      select t.current_version,v.document,v.schema_version,t.status
        into template_row from public.nutrition_global_templates t
        join public.nutrition_global_template_versions v on v.template_id=t.id and v.version=t.current_version
        where t.id=v_global_template_id for key share of t;
      if not found then outcome:='skipped_ineligible';
      elsif template_row.status<>'active' then outcome:='skipped_ineligible';
      elsif exists(select 1 from public.nutrition_workspace_templates c where c.workspace_id=v_target_workspace_id and c.origin_global_template_id=v_global_template_id) then outcome:='skipped_existing';
      else
        copy_id := pg_catalog.gen_random_uuid();
        id_map:=app_private.nutrition_template_collect_ids(template_row.document);
        template_row.document:=app_private.nutrition_template_remap_ids(template_row.document,id_map);
        set constraints all deferred;
        insert into public.nutrition_workspace_templates(workspace_id,id,display_name,current_version,
          origin_global_template_id,origin_global_template_version,created_by)
        values(v_target_workspace_id,copy_id,display_name || coalesce(
          ' — ' || nullif(pg_catalog.btrim(template_row.document #>> '{title,en}'),''),
          ' — ' || nullif(pg_catalog.btrim(template_row.document #>> '{title,ar}'),''),''),1,
          v_global_template_id,template_row.current_version,actor);
        insert into public.nutrition_workspace_template_versions(workspace_id,template_id,version,document,schema_version,created_by)
        values(v_target_workspace_id,copy_id,1,template_row.document,template_row.schema_version,actor);
        outcome:='assigned'; assigned:=assigned+1;
        assigned_ids:=assigned_ids || jsonb_build_array(copy_id);
      end if;
      if outcome='skipped_existing' then skipped:=skipped+1; skipped_existing:=skipped_existing+1; end if;
      if outcome='skipped_ineligible' then skipped:=skipped+1; skipped_ineligible:=skipped_ineligible+1; end if;
      items:=items || jsonb_build_array(jsonb_build_object('workspace_id',v_target_workspace_id,'global_template_id',v_global_template_id,
        'global_template_version',coalesce(template_row.current_version,1),'outcome',outcome,
        'created_workspace_template_id',case when outcome='assigned' then copy_id else null end));
    end loop;
  end loop;
  if assigned=0 then raise exception 'zero_copies' using errcode='22023'; end if;
  batch_id:=pg_catalog.gen_random_uuid();
  receipt_id:=pg_catalog.gen_random_uuid();
  insert into public.nutrition_template_assignment_batches(id,template_selection_mode,template_ids,excluded_template_ids,
    workspace_selection_mode,workspace_ids,operation_receipt_id,created_by,assigned_count,skipped_count)
  values(batch_id,p_template_mode,p_template_ids,p_exclude_ids,p_workspace_mode,p_workspace_ids,receipt_id,actor,assigned,skipped);
  insert into public.nutrition_template_assignment_items(batch_id,seq,workspace_id,global_template_id,global_template_version,
    outcome,created_workspace_template_id)
  select batch_id,(entry.ordinality)::integer,(entry.value->>'workspace_id')::uuid,(entry.value->>'global_template_id')::uuid,
    (entry.value->>'global_template_version')::integer,entry.value->>'outcome',nullif(entry.value->>'created_workspace_template_id','')::uuid
  from jsonb_array_elements(items) with ordinality entry(value,ordinality);
  result:=jsonb_build_object('batch_id',batch_id,'receipt_id',receipt_id,'assigned_count',assigned,'skipped_count',skipped,'items',items);
  perform app_private.nutrition_template_finish_operation(actor,p_operation_key,result);
  perform app_private.nutrition_template_write_audit(actor,'template.nutrition_assign','nutrition_template_assignment_batches',batch_id,null,
    jsonb_build_object('assigned_count',assigned,'skipped_count',skipped,'skipped_existing_count',skipped_existing,
      'skipped_ineligible_count',skipped_ineligible,'copy_ids',assigned_ids,'workspace_ids',to_jsonb(workspace_ids)));
  return result;
end $$;

-- Make the global promotion privacy detector deterministic and return field-code paths only.
create function app_private.nutrition_template_private_fields(
  p_node jsonb, p_path text default '$', p_workspace_id uuid default null, p_workspace_name text default null
) returns text[]
language plpgsql immutable set search_path = '' as $$
declare r text[] := '{}'; pair record; idx integer; child text[]; key_code text;
begin
  if jsonb_typeof(p_node)='object' then
    for pair in select key,value from jsonb_each(p_node) loop
      key_code:=pg_catalog.regexp_replace(pg_catalog.lower(pair.key),'[^a-z0-9]','','g');
      if key_code ~ '(client|customer|patient|workspace|tenant|internal|createdby|updatedby|authuserid|email|phone|user.?id|staff.?id|trainer.?id|member.?id|owner.?id)' then
        r:=array_append(r,p_path||'.'||pair.key);
      end if;
      child:=app_private.nutrition_template_private_fields(pair.value,p_path||'.'||pair.key,p_workspace_id,p_workspace_name);
      r:=r||child;
    end loop;
  elsif jsonb_typeof(p_node)='array' then
    idx:=0;
    for pair in select value from jsonb_array_elements(p_node) loop
      idx:=idx+1; child:=app_private.nutrition_template_private_fields(pair.value,p_path||'['||idx||']',p_workspace_id,p_workspace_name); r:=r||child;
    end loop;
  elsif jsonb_typeof(p_node)='string' then
    if p_node #>> '{}' ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
      or p_node #>> '{}' ~ '(^|[^0-9])[+]?[0-9][0-9() .-]{7,}[0-9]([^0-9]|$)'
      or (p_workspace_id is not null and pg_catalog.strpos(pg_catalog.lower(p_node #>> '{}'),p_workspace_id::text)>0)
      or (p_workspace_name is not null and length(pg_catalog.btrim(p_workspace_name))>=4
        and pg_catalog.strpos(pg_catalog.lower(p_node #>> '{}'),pg_catalog.lower(p_workspace_name))>0) then
      r:=array_append(r,p_path);
    end if;
  end if;
  select coalesce(array_agg(distinct x order by x),'{}') into r from unnest(r) x;
  return r;
end $$;

create function public.make_nutrition_template_global(
  p_workspace_id uuid, p_workspace_template_id uuid, p_expected_version integer, p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); source_row record; request_hash text; replay jsonb; result jsonb; global_id uuid; fields text[]; promoted_document jsonb; id_map jsonb;
begin
  if actor is null or not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode='42501'; end if;
  if p_workspace_id is null or p_workspace_template_id is null or p_expected_version is null or p_expected_version<1 or p_operation_key is null then
    raise exception 'invalid_nutrition_template' using errcode='22023';
  end if;
  request_hash:='sha256:'||encode(extensions.digest(convert_to(jsonb_build_object('operation','make_nutrition_template_global',
    'workspace_id',p_workspace_id,'workspace_template_id',p_workspace_template_id,'expected_version',p_expected_version)::text,'UTF8'),'sha256'),'hex');
  replay:=app_private.nutrition_template_start_operation(actor,'template.nutrition_make_global',p_operation_key,request_hash);
  if replay is not null then if not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode='42501'; end if; return replay; end if;
  select t.status,t.current_version,v.document,v.schema_version,t.workspace_id,w.name into source_row
    from public.nutrition_workspace_templates t join public.nutrition_workspace_template_versions v
      on v.workspace_id=t.workspace_id and v.template_id=t.id and v.version=t.current_version
    join public.workspaces w on w.id=t.workspace_id
    where t.workspace_id=p_workspace_id and t.id=p_workspace_template_id for update of t;
  if not found or not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode='42501'; end if;
  if source_row.status<>'active' then raise exception 'template_ineligible' using errcode='42501'; end if;
  if source_row.current_version<>p_expected_version then raise exception 'stale_version' using errcode='40001'; end if;
  fields:=app_private.nutrition_template_private_fields(source_row.document,'$',source_row.workspace_id,source_row.name);
  if cardinality(fields)>0 then raise exception 'private_nutrition_template_fields' using errcode='22023', detail=array_to_string(fields,','); end if;
  if not app_private.is_platform_owner() then raise exception 'not_permitted' using errcode='42501'; end if;
  set constraints all deferred;
  global_id:=pg_catalog.gen_random_uuid();
  insert into public.nutrition_global_templates(id,current_version,created_by) values(global_id,1,actor);
  id_map:=app_private.nutrition_template_collect_ids(source_row.document);
  promoted_document:=app_private.nutrition_template_remap_ids(source_row.document,id_map);
  insert into public.nutrition_global_template_versions(template_id,version,document,schema_version,created_by)
    values(global_id,1,promoted_document,source_row.schema_version,actor);
  result:=jsonb_build_object('template_id',global_id,'version',1);
  perform app_private.nutrition_template_finish_operation(actor,p_operation_key,result);
  perform app_private.nutrition_template_write_audit(actor,'template.nutrition_make_global','nutrition_global_templates',global_id,p_workspace_id,
    jsonb_build_object('source_template_id',p_workspace_template_id,'version',p_expected_version));
  return result;
end $$;

alter function app_private.nutrition_template_assign_guard() owner to postgres;
alter function app_private.nutrition_template_private_fields(jsonb,text,uuid,text) owner to postgres;
alter function public.assign_nutrition_templates(text,uuid[],uuid[],text,uuid[],uuid) owner to postgres;
alter function public.make_nutrition_template_global(uuid,uuid,integer,uuid) owner to postgres;
revoke all on function app_private.nutrition_template_assign_guard() from public,anon,authenticated,service_role;
revoke all on function app_private.nutrition_template_private_fields(jsonb,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.assign_nutrition_templates(text,uuid[],uuid[],text,uuid[],uuid) from public,anon,authenticated,service_role;
revoke all on function public.make_nutrition_template_global(uuid,uuid,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.assign_nutrition_templates(text,uuid[],uuid[],text,uuid[],uuid) to authenticated;
grant execute on function public.make_nutrition_template_global(uuid,uuid,integer,uuid) to authenticated;
