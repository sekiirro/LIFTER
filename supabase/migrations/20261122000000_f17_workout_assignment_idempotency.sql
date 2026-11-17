-- F17 T026: persist the exact assignment receipt and serialize operation-key retries.

alter table public.workout_template_assignment_runs add column result jsonb;

create or replace function public.assign_workout_templates(
  p_template_mode text,
  p_template_ids uuid[],
  p_exclude_ids uuid[],
  p_workspace_mode text,
  p_workspace_ids uuid[],
  p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  run_id uuid;
  request_hash text;
  template_ids uuid[];
  workspace_ids uuid[];
  v_template_id uuid;
  v_workspace_id uuid;
  template_row record;
  workspace_assigned boolean;
  copy_id uuid;
  copy_ids uuid[];
  held_template_ids uuid[];
  skipped_count integer := 0;
  no_copies_count integer := 0;
  assigned_count integer := 0;
  copy_count integer := 0;
  item_rows jsonb := '[]'::jsonb;
  copy_rows jsonb := '[]'::jsonb;
  source_rows jsonb := '[]'::jsonb;
  result jsonb;
  prior_run public.workout_template_assignment_runs%rowtype;
begin
  if actor is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_template_mode is null or p_template_mode not in ('all', 'specific', 'all_except')
    or p_workspace_mode is null or p_workspace_mode not in ('all_workspaces', 'specific_workspaces')
    or p_operation_key is null
    or (p_template_mode = 'specific' and coalesce(pg_catalog.cardinality(p_template_ids), 0) = 0)
    or (p_template_mode = 'all_except' and p_exclude_ids is null)
    or (p_template_mode <> 'specific' and p_template_ids is not null)
    or (p_template_mode <> 'all_except' and p_exclude_ids is not null)
    or (p_workspace_mode = 'specific_workspaces' and coalesce(pg_catalog.cardinality(p_workspace_ids), 0) = 0)
    or (p_workspace_mode = 'all_workspaces' and p_workspace_ids is not null) then
    raise exception 'invalid_selection' using errcode = '22023';
  end if;

  if p_template_mode = 'specific' and
    pg_catalog.cardinality(p_template_ids) <> (select count(distinct x) from pg_catalog.unnest(p_template_ids) x) then
    raise exception 'invalid_selection' using errcode = '22023';
  end if;
  if p_template_mode = 'all_except' and
    pg_catalog.cardinality(p_exclude_ids) <> (select count(distinct x) from pg_catalog.unnest(p_exclude_ids) x) then
    raise exception 'invalid_selection' using errcode = '22023';
  end if;
  if p_workspace_mode = 'specific_workspaces' and
    pg_catalog.cardinality(p_workspace_ids) <> (select count(distinct x) from pg_catalog.unnest(p_workspace_ids) x) then
    raise exception 'invalid_selection' using errcode = '22023';
  end if;

  request_hash := 'sha256:' || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operation', 'assign_workout_templates',
      'template_mode', p_template_mode,
      'template_ids', case when p_template_ids is null then null else
        pg_catalog.to_jsonb((select pg_catalog.array_agg(x order by x) from pg_catalog.unnest(p_template_ids) x)) end,
      'exclude_ids', case when p_exclude_ids is null then null else
        pg_catalog.to_jsonb((select pg_catalog.array_agg(x order by x) from pg_catalog.unnest(p_exclude_ids) x)) end,
      'workspace_mode', p_workspace_mode,
      'workspace_ids', case when p_workspace_ids is null then null else
        pg_catalog.to_jsonb((select pg_catalog.array_agg(x order by x) from pg_catalog.unnest(p_workspace_ids) x)) end
    )::text, 'UTF8'), 'sha256'), 'hex');

  -- Authorize before this point; then serialize this actor/key pair so same-key
  -- concurrent calls observe the committed receipt rather than racing into writes.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text || ':' || p_operation_key::text, 0)
  );
  select * into prior_run
  from public.workout_template_assignment_runs r
  where r.actor_id = actor and r.operation_key = p_operation_key;
  if found then
    if prior_run.request_hash <> request_hash then
      raise exception 'operation_key_conflict' using errcode = '22023';
    end if;
    if prior_run.result is null then
      raise exception 'operation_result_unavailable' using errcode = '55000';
    end if;
    return prior_run.result;
  end if;

  if p_template_mode = 'specific' then
    if exists (
      select 1 from pg_catalog.unnest(p_template_ids) x
      left join public.workout_global_templates t on t.id = x
      where t.id is null or t.lifecycle_state <> 'active'
    ) then raise exception 'invalid_selection' using errcode = '22023'; end if;
    select pg_catalog.array_agg(x order by x) into template_ids from pg_catalog.unnest(p_template_ids) x;
  elsif p_template_mode = 'all' then
    select pg_catalog.array_agg(t.id order by t.id) into template_ids
    from public.workout_global_templates t where t.lifecycle_state = 'active';
  else
    if exists (
      select 1 from pg_catalog.unnest(p_exclude_ids) x
      left join public.workout_global_templates t on t.id = x
      where t.id is null or t.lifecycle_state <> 'active'
    ) then raise exception 'invalid_selection' using errcode = '22023'; end if;
    select pg_catalog.array_agg(t.id order by t.id) into template_ids
    from public.workout_global_templates t
    where t.lifecycle_state = 'active' and not (t.id = any(p_exclude_ids));
  end if;
  if coalesce(pg_catalog.cardinality(template_ids), 0) = 0 then
    raise exception 'invalid_selection' using errcode = '22023';
  end if;

  if p_workspace_mode = 'specific_workspaces' then
    if exists (
      select 1 from pg_catalog.unnest(p_workspace_ids) x
      left join public.workspaces w on w.id = x where w.id is null
    ) then raise exception 'invalid_selection' using errcode = '22023'; end if;
    select pg_catalog.array_agg(x order by x) into workspace_ids from pg_catalog.unnest(p_workspace_ids) x;
  else
    select pg_catalog.array_agg(w.id order by w.id) into workspace_ids from public.workspaces w;
  end if;
  if coalesce(pg_catalog.cardinality(workspace_ids), 0) = 0 then
    raise exception 'zero_copies' using errcode = '22023';
  end if;

  -- Snapshot each selected current immutable version before waiting on locks. A version
  -- committed concurrently after this read cannot join this run.
  for v_template_id in select unnest(template_ids) order by 1 loop
    select t.current_version, t.lifecycle_state, v.title, v.schema_version, v.document
    into template_row
    from public.workout_global_templates t
    join public.workout_global_template_versions v on v.template_id = t.id and v.version = t.current_version
    where t.id = v_template_id for key share of t;
    if not found or template_row.lifecycle_state <> 'active' then
      raise exception 'invalid_selection' using errcode = '22023';
    end if;
    source_rows := source_rows || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'template_id', v_template_id, 'version', template_row.current_version,
      'title', template_row.title, 'schema_version', template_row.schema_version,
      'document', template_row.document
    ));
  end loop;

  -- Lock selected global roots, then every candidate workspace in stable order.
  -- The workspace row lock serializes the eligibility read and monotonic flag write.
  perform 1 from public.workout_global_templates t where t.id = any(template_ids) order by t.id for update;
  perform 1 from public.workspaces w where w.id = any(workspace_ids) order by w.id for update;
  if exists (
    select 1 from public.workout_global_templates t
    where t.id = any(template_ids) and t.lifecycle_state <> 'active'
  ) then raise exception 'invalid_selection' using errcode = '22023'; end if;

  -- Build the full receipt/copy plan without writes so a total zero-copy request is rejected cleanly.
  for v_workspace_id in select unnest(workspace_ids) order by 1 loop
    select coalesce(s.ever_received_global_assignment, false) into workspace_assigned
    from public.workspaces w
    left join public.workout_template_distribution_state s on s.workspace_id = w.id
    where w.id = v_workspace_id;
    copy_ids := '{}';
    held_template_ids := '{}';
    if p_workspace_mode = 'all_workspaces' and workspace_assigned then
      select coalesce(pg_catalog.array_agg(c.origin_global_template_id order by c.origin_global_template_id), '{}')
      into held_template_ids
      from public.workout_workspace_templates c
      where c.workspace_id = v_workspace_id
        and c.origin_global_template_id = any(template_ids);
      skipped_count := skipped_count + 1;
      item_rows := item_rows || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'workspace_id', v_workspace_id, 'outcome', 'skipped_already_assigned',
        'created_copy_ids', '[]'::jsonb, 'skipped_template_ids', pg_catalog.to_jsonb(held_template_ids)
      ));
    else
      for v_template_id in select unnest(template_ids) order by 1 loop
        select (entry.value->>'version')::integer as current_version,
          entry.value->>'title' as title, (entry.value->>'schema_version')::integer as schema_version,
          entry.value->'document' as document
        into template_row
        from pg_catalog.jsonb_array_elements(source_rows) entry(value)
        where entry.value->>'template_id' = v_template_id::text;
        if exists (
          select 1 from public.workout_workspace_templates c
          where c.workspace_id = v_workspace_id and c.origin_global_template_id = v_template_id
        ) then
          held_template_ids := pg_catalog.array_append(held_template_ids, v_template_id);
        else
          copy_id := pg_catalog.gen_random_uuid();
          copy_ids := pg_catalog.array_append(copy_ids, copy_id);
          copy_count := copy_count + 1;
          copy_rows := copy_rows || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'workspace_id', v_workspace_id, 'copy_id', copy_id, 'global_template_id', v_template_id,
            'global_template_version', template_row.current_version, 'title', template_row.title,
            'schema_version', template_row.schema_version, 'document', template_row.document
          ));
        end if;
      end loop;
      if pg_catalog.cardinality(copy_ids) > 0 then
        assigned_count := assigned_count + 1;
        item_rows := item_rows || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'workspace_id', v_workspace_id, 'outcome', 'assigned', 'created_copy_ids', pg_catalog.to_jsonb(copy_ids),
          'skipped_template_ids', pg_catalog.to_jsonb(held_template_ids)
        ));
      else
        no_copies_count := no_copies_count + 1;
        item_rows := item_rows || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'workspace_id', v_workspace_id, 'outcome', 'no_copies', 'created_copy_ids', '[]'::jsonb,
          'skipped_template_ids', pg_catalog.to_jsonb(held_template_ids)
        ));
      end if;
    end if;
  end loop;
  if copy_count = 0 then raise exception 'zero_copies' using errcode = '22023'; end if;

  run_id := pg_catalog.gen_random_uuid();
  result := pg_catalog.jsonb_build_object(
    'run_id', run_id, 'assigned_workspace_count', assigned_count,
    'skipped_already_assigned_count', skipped_count, 'no_copies_workspace_count', no_copies_count,
    'created_copies_count', copy_count, 'items', item_rows
  );
  insert into public.workout_template_assignment_runs (
    id, actor_id, operation_key, request_hash, template_selection_mode, selected_template_ids,
    excluded_template_ids, target_mode, selected_workspace_ids, assigned_workspace_count, result,
    skipped_already_assigned_count, no_copies_workspace_count, created_copies_count
  ) values (
    run_id, actor, p_operation_key, request_hash, p_template_mode, p_template_ids,
    p_exclude_ids, p_workspace_mode, p_workspace_ids, assigned_count, result,
    skipped_count, no_copies_count, copy_count
  );

  for template_row in select value from pg_catalog.jsonb_array_elements(copy_rows) loop
    insert into public.workout_workspace_templates (
      workspace_id, id, current_version, origin_global_template_id,
      origin_global_template_version, origin_assignment_id, created_by
    ) values (
      (template_row.value->>'workspace_id')::uuid, (template_row.value->>'copy_id')::uuid, 1,
      (template_row.value->>'global_template_id')::uuid, (template_row.value->>'global_template_version')::integer,
      run_id, actor
    );
    insert into public.workout_workspace_template_versions (
      workspace_id, template_id, version, title, schema_version, document, created_by
    ) values (
      (template_row.value->>'workspace_id')::uuid, (template_row.value->>'copy_id')::uuid, 1,
      template_row.value->>'title', (template_row.value->>'schema_version')::integer,
      template_row.value->'document', actor
    );
  end loop;

  insert into public.workout_template_assignment_items (run_id, workspace_id, outcome, created_copy_ids)
  select run_id, (entry.value->>'workspace_id')::uuid, entry.value->>'outcome',
    array(select value::uuid from pg_catalog.jsonb_array_elements_text(entry.value->'created_copy_ids'))
  from pg_catalog.jsonb_array_elements(item_rows) entry(value);

  insert into public.workout_template_assignment_copies (
    run_id, workspace_id, global_template_id, global_template_version,
    workspace_template_id, workspace_template_version
  )
  select run_id, (entry.value->>'workspace_id')::uuid, (entry.value->>'global_template_id')::uuid,
    (entry.value->>'global_template_version')::integer, (entry.value->>'copy_id')::uuid, 1
  from pg_catalog.jsonb_array_elements(copy_rows) entry(value);

  for v_workspace_id in
    select distinct (entry.value->>'workspace_id')::uuid
    from pg_catalog.jsonb_array_elements(copy_rows) entry(value)
    order by 1
  loop
    insert into public.workout_template_distribution_state (
      workspace_id, ever_received_global_assignment, first_assigned_at,
      first_assignment_id, last_assignment_id
    ) values (v_workspace_id, true, pg_catalog.clock_timestamp(), run_id, run_id)
    on conflict (workspace_id) do update set
      ever_received_global_assignment = true,
      first_assigned_at = coalesce(public.workout_template_distribution_state.first_assigned_at, excluded.first_assigned_at),
      first_assignment_id = coalesce(public.workout_template_distribution_state.first_assignment_id, excluded.first_assignment_id),
      last_assignment_id = excluded.last_assignment_id,
      updated_at = pg_catalog.clock_timestamp();
  end loop;

  perform app_private.f17_workout_template_write_audit(
    actor, 'template.workout_templates_assigned', 'workout_template_assignment_runs', run_id, null, copy_count
  );
  return result;
end;
$$;

alter function public.assign_workout_templates(text, uuid[], uuid[], text, uuid[], uuid) owner to postgres;
revoke all on function public.assign_workout_templates(text, uuid[], uuid[], text, uuid[], uuid) from public, anon, service_role;
grant execute on function public.assign_workout_templates(text, uuid[], uuid[], text, uuid[], uuid) to authenticated;
