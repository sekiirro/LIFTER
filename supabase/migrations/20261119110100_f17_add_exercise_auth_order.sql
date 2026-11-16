-- F17 T031: Authorize staff coaching_work capability before input validation in f17_add_workout_exercise
-- so non-staff / pending-client callers receive 42501 (not_permitted) regardless of dummy arguments.

create or replace function public.f17_add_workout_exercise(
  p_plan_id uuid,
  p_day_id uuid,
  p_source text,
  p_exercise_id uuid,
  p_expected_draft_version bigint,
  p_operation_key uuid,
  p_item_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  root public.plan_roots%rowtype;
  draft public.plan_drafts%rowtype;
  v_fingerprint bytea;
  prior app_private.f17_workout_operation_keys%rowtype;
  v_version integer;
  v_override_version integer;
  v_effective jsonb;
  v_ref jsonb;
  v_name text;
  v_description text;
  v_notes text;
  v_rest_sec integer;
  v_rir integer;
  v_reps_raw jsonb;
  v_reps jsonb;
  v_alts jsonb := '[]'::jsonb;
  alt_el jsonb;
  alt_global_id uuid;
  alt_ws_id uuid;
  alt_ver integer;
  alt_ovr_ver integer;
  alt_ref jsonb;
  v_item_id uuid;
  v_item jsonb;
  v_day_found boolean := false;
  v_day_kind text;
  v_new_days jsonb := '[]'::jsonb;
  day_el jsonb;
  v_new_content jsonb;
  v_new_draft_version bigint;
  v_receipt jsonb;
begin
  if actor is null
    or (not app_private.is_platform_owner()
      and not app_private.role_has_capability(app_private.current_staff_role(), 'coaching_work')) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if p_plan_id is null or p_day_id is null or p_exercise_id is null
    or p_expected_draft_version is null or p_expected_draft_version < 1
    or p_operation_key is null or p_source not in ('global', 'workspace_private') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into root
  from public.plan_roots p
  where p.id = p_plan_id and p.plan_kind = 'workout';

  if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  v_fingerprint := extensions.digest(convert_to(jsonb_build_object(
    'operation', 'add_exercise',
    'plan_id', p_plan_id,
    'day_id', p_day_id,
    'source', p_source,
    'exercise_id', p_exercise_id,
    'expected_draft_version', p_expected_draft_version,
    'item_id', p_item_id
  )::text, 'UTF8'), 'sha256');

  insert into app_private.f17_workout_operation_keys (
    workspace_id, actor_user_id, operation_key, operation_type,
    request_fingerprint, plan_id
  ) values (
    root.workspace_id, actor, p_operation_key, 'add_exercise',
    v_fingerprint, root.id
  )
  on conflict (workspace_id, actor_user_id, operation_key) do nothing;

  if not found then
    select * into prior
    from app_private.f17_workout_operation_keys k
    where k.workspace_id = root.workspace_id
      and k.actor_user_id = actor
      and k.operation_key = p_operation_key
    for update;

    if prior.operation_type <> 'add_exercise'
      or prior.request_fingerprint <> v_fingerprint then
      raise exception 'key_conflict' using errcode = '23505';
    end if;

    -- Re-check authorization after replay.
    if not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then
      raise exception 'not_permitted' using errcode = '42501';
    end if;

    if prior.receipt is null then
      raise exception 'unavailable' using errcode = '55000';
    end if;

    return prior.receipt;
  end if;

  select * into draft
  from public.plan_drafts d
  where d.workspace_id = root.workspace_id and d.plan_id = root.id
  for update;

  if not found then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if draft.draft_version <> p_expected_draft_version then
    raise exception 'stale_version' using errcode = '40001';
  end if;

  if pg_catalog.jsonb_typeof(draft.content -> 'days') <> 'array' then
    raise exception 'invalid_document' using errcode = '23514';
  end if;

  for day_el in select value from pg_catalog.jsonb_array_elements(draft.content -> 'days')
  loop
    if day_el ->> 'id' = p_day_id::text then
      v_day_found := true;
      v_day_kind := day_el ->> 'kind';
    end if;
  end loop;

  if not v_day_found or v_day_kind is distinct from 'session' then
    raise exception 'invalid_document' using errcode = '23514';
  end if;

  if p_source = 'global' then
    if not app_private.catalog_can_read_global() then
      raise exception 'not_permitted' using errcode = '42501';
    end if;

    select e.current_version into v_version
    from public.exercises e
    where e.id = p_exercise_id and e.lifecycle_state = 'active';
    if not found then
      raise exception 'not_permitted' using errcode = '42501';
    end if;

    select o.current_version into v_override_version
    from public.exercise_overrides o
    where o.workspace_id = root.workspace_id and o.exercise_id = p_exercise_id;

    v_effective := app_private.catalog_effective_exercise_fields(root.workspace_id, p_exercise_id);

    v_ref := jsonb_build_object(
      'source', 'global',
      'identity_id', p_exercise_id,
      'version', v_version
    );
    if v_override_version is not null then
      v_ref := v_ref || jsonb_build_object(
        'overrideVersion', v_override_version,
        'overrideWorkspaceId', root.workspace_id
      );
    end if;
  else
    select e.current_version into v_version
    from public.workspace_exercises e
    where e.workspace_id = root.workspace_id
      and e.id = p_exercise_id
      and e.lifecycle_state = 'active';
    if not found then
      raise exception 'not_permitted' using errcode = '42501';
    end if;

    v_effective := app_private.catalog_effective_workspace_exercise_fields(root.workspace_id, p_exercise_id);
    v_ref := jsonb_build_object(
      'source', 'workspace_private',
      'identity_id', p_exercise_id,
      'version', v_version,
      'workspace_id', root.workspace_id
    );
  end if;

  v_name := coalesce(
    nullif(v_effective -> 'name' -> 'value' ->> 'name_en', ''),
    nullif(v_effective -> 'name' -> 'value' ->> 'en', '')
  );
  if v_name is null then
    raise exception 'invalid_document' using errcode = '23514';
  end if;

  if pg_catalog.jsonb_typeof(v_effective -> 'description' -> 'value') = 'string' then
    v_description := v_effective -> 'description' ->> 'value';
  end if;

  if pg_catalog.jsonb_typeof(v_effective -> 'notes' -> 'value') = 'string' then
    v_notes := v_effective -> 'notes' ->> 'value';
  end if;

  if pg_catalog.jsonb_typeof(v_effective -> 'default_rest_time' -> 'value') = 'number' then
    v_rest_sec := (v_effective -> 'default_rest_time' ->> 'value')::integer;
  end if;

  if pg_catalog.jsonb_typeof(v_effective -> 'default_rir' -> 'value') = 'number' then
    v_rir := (v_effective -> 'default_rir' ->> 'value')::integer;
  end if;

  v_reps_raw := v_effective -> 'default_reps' -> 'value';
  if v_reps_raw is not null and v_reps_raw <> 'null'::jsonb then
    if pg_catalog.jsonb_typeof(v_reps_raw) = 'number' then
      v_reps := jsonb_build_object('value', (v_reps_raw #>> '{}')::integer);
    elsif pg_catalog.jsonb_typeof(v_reps_raw) = 'object' then
      if v_reps_raw ? 'value' then
        v_reps := jsonb_build_object('value', (v_reps_raw ->> 'value')::integer);
      elsif v_reps_raw ? 'min' and v_reps_raw ? 'max' then
        v_reps := jsonb_build_object(
          'min', (v_reps_raw ->> 'min')::integer,
          'max', (v_reps_raw ->> 'max')::integer
        );
      end if;
    end if;
  end if;

  if pg_catalog.jsonb_typeof(v_effective -> 'alternatives' -> 'value') = 'array' then
    for alt_el in select value from pg_catalog.jsonb_array_elements(v_effective -> 'alternatives' -> 'value') limit 3
    loop
      alt_global_id := nullif(alt_el ->> 'global_exercise_id', '')::uuid;
      alt_ws_id := nullif(alt_el ->> 'workspace_exercise_id', '')::uuid;
      if alt_global_id is not null then
        select e.current_version into alt_ver
        from public.exercises e
        where e.id = alt_global_id and e.lifecycle_state = 'active';
        if found then
          select o.current_version into alt_ovr_ver
          from public.exercise_overrides o
          where o.workspace_id = root.workspace_id and o.exercise_id = alt_global_id;
          alt_ref := jsonb_build_object(
            'source', 'global',
            'identity_id', alt_global_id,
            'version', alt_ver
          );
          if alt_ovr_ver is not null then
            alt_ref := alt_ref || jsonb_build_object(
              'overrideVersion', alt_ovr_ver,
              'overrideWorkspaceId', root.workspace_id
            );
          end if;
          v_alts := v_alts || jsonb_build_array(alt_ref);
        end if;
      elsif alt_ws_id is not null then
        select e.current_version into alt_ver
        from public.workspace_exercises e
        where e.workspace_id = root.workspace_id
          and e.id = alt_ws_id
          and e.lifecycle_state = 'active';
        if found then
          v_alts := v_alts || jsonb_build_array(jsonb_build_object(
            'source', 'workspace_private',
            'identity_id', alt_ws_id,
            'version', alt_ver,
            'workspace_id', root.workspace_id
          ));
        end if;
      end if;
    end loop;
  end if;

  v_item_id := coalesce(p_item_id, gen_random_uuid());
  v_item := jsonb_build_object(
    'id', v_item_id,
    'exercise', v_ref,
    'name', v_name,
    'alternatives', v_alts,
    'sets', '[]'::jsonb
  );
  if v_description is not null then
    v_item := v_item || jsonb_build_object('description', v_description);
  end if;
  if v_notes is not null then
    v_item := v_item || jsonb_build_object('notes', v_notes);
  end if;
  if v_rest_sec is not null then
    v_item := v_item || jsonb_build_object('restSec', v_rest_sec);
  end if;
  if v_rir is not null then
    v_item := v_item || jsonb_build_object('rir', v_rir);
  end if;
  if v_reps is not null then
    v_item := v_item || jsonb_build_object('reps', v_reps);
  end if;

  for day_el in select value from pg_catalog.jsonb_array_elements(draft.content -> 'days')
  loop
    if day_el ->> 'id' = p_day_id::text then
      day_el := jsonb_set(
        day_el,
        '{items}',
        coalesce(day_el -> 'items', '[]'::jsonb) || jsonb_build_array(v_item)
      );
    end if;
    v_new_days := v_new_days || jsonb_build_array(day_el);
  end loop;

  v_new_content := jsonb_set(draft.content, '{days}', v_new_days);

  update public.plan_drafts
  set draft_version = draft.draft_version + 1,
      content = v_new_content,
      updated_by = actor,
      updated_at = greatest(clock_timestamp(), draft.updated_at + interval '1 microsecond')
  where workspace_id = root.workspace_id and plan_id = root.id
  returning draft_version into v_new_draft_version;

  v_receipt := jsonb_build_object(
    'draft_version', v_new_draft_version,
    'item_id', v_item_id,
    'item', v_item
  );

  update app_private.f17_workout_operation_keys k
  set receipt = v_receipt
  where k.workspace_id = root.workspace_id
    and k.actor_user_id = actor
    and k.operation_key = p_operation_key;

  return v_receipt;
end
$function$;
