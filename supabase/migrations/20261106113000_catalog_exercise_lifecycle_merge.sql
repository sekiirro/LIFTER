-- F16 T021: immutable global exercise lifecycle markers and flattened aliases.
alter table public.exercises add column lifecycle_revision integer not null default 0 check (lifecycle_revision >= 0);
alter table public.exercises add constraint exercises_superseded_by_fk
  foreign key (superseded_by) references public.exercises(id) on delete restrict;
alter table public.exercises add constraint exercises_no_self_merge check (superseded_by is null or superseded_by <> id);

create table public.exercise_lifecycle_events (
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  revision integer not null check (revision > 0),
  lifecycle_state text not null check (lifecycle_state in ('active','removed','merged')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (exercise_id, revision)
);
alter table public.exercise_lifecycle_events enable row level security;
alter table public.exercise_lifecycle_events force row level security;
create policy exercise_lifecycle_events_global_read on public.exercise_lifecycle_events
  for select to authenticated using ((select app_private.catalog_can_read_global()));
revoke all on public.exercise_lifecycle_events from public, anon, authenticated, service_role;
grant select on public.exercise_lifecycle_events to authenticated;
create trigger exercise_lifecycle_events_append_only before update or delete on public.exercise_lifecycle_events
  for each row execute function app_private.reject_catalog_version_mutation();

create function public.catalog_transition_exercise(
  p_exercise_id uuid, p_expected_revision integer, p_transition text, p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); current_revision integer; current_state text;
  action_name text; request_hash text; replay jsonb; next_revision integer; next_state text; result jsonb;
begin
  if actor is null or not app_private.is_platform_owner() then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  select e.lifecycle_revision, e.lifecycle_state into current_revision, current_state
    from public.exercises e where e.id = p_exercise_id for update;
  if not found then raise exception 'catalog_exercise_not_found' using errcode = 'P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('catalog.exercise.lifecycle:' || p_exercise_id::text, 0));
  action_name := case p_transition when 'remove' then 'catalog.exercise_removed'
    when 'restore' then 'catalog.exercise_restored' else null end;
  request_hash := 'sha256:' || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_array(p_exercise_id, p_expected_revision, p_transition)::text, 'UTF8'), 'sha256'), 'hex');
  replay := app_private.claim_catalog_operation(actor, action_name, p_operation_key, request_hash);
  if not app_private.is_platform_owner() then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  if replay is not null then return replay; end if;
  if p_expected_revision is null or current_revision <> p_expected_revision then
    raise exception 'catalog_exercise_lifecycle_conflict' using errcode = '40001';
  end if;
  if (p_transition = 'remove' and current_state <> 'active') or (p_transition = 'restore' and current_state <> 'removed') then
    raise exception 'catalog_exercise_lifecycle_conflict' using errcode = '23514';
  end if;
  if p_transition not in ('remove','restore') then raise exception 'catalog_transition_invalid' using errcode = '22023'; end if;
  next_revision := current_revision + 1;
  next_state := case p_transition when 'remove' then 'removed' else 'active' end;
  insert into public.exercise_lifecycle_events(exercise_id, revision, lifecycle_state, actor_user_id)
    values (p_exercise_id, next_revision, next_state, actor);
  update public.exercises set lifecycle_state = next_state, lifecycle_revision = next_revision where id = p_exercise_id;
  result := jsonb_build_object('exercise_id', p_exercise_id, 'lifecycle_revision', next_revision, 'lifecycle_state', next_state);
  perform app_private.catalog_write_audit(actor, action_name, 'exercises', p_exercise_id, null,
    jsonb_build_object('identity_id', p_exercise_id, 'version', next_revision, 'changed_fields', jsonb_build_array('lifecycle')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;
alter function public.catalog_transition_exercise(uuid, integer, text, uuid) owner to postgres;
revoke all on function public.catalog_transition_exercise(uuid, integer, text, uuid) from public, anon, service_role;
grant execute on function public.catalog_transition_exercise(uuid, integer, text, uuid) to authenticated;

create function public.catalog_merge_exercise(
  p_source_id uuid, p_target_id uuid, p_expected_source_revision integer, p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); source_state text; source_revision integer; terminal_id uuid;
  request_hash text; replay jsonb; result jsonb; lock_id uuid; chain_ids uuid[]; terminal_state text; cycle_found boolean;
begin
  if actor is null or not app_private.is_platform_owner() then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('catalog.exercise.merge.global', 0));
  with recursive chain(id, superseded_by, lifecycle_state, path, cycle) as (
    select e.id, e.superseded_by, e.lifecycle_state, array[e.id], false
    from public.exercises e where e.id = p_target_id
    union all
    select e.id, e.superseded_by, e.lifecycle_state, c.path || e.id, e.id = any(c.path)
    from chain c join public.exercises e on e.id = c.superseded_by
    where c.superseded_by is not null and not c.cycle
  )
  select coalesce(array_agg(distinct id), '{}'::uuid[]), coalesce(bool_or(cycle), false)
    into chain_ids, cycle_found from chain;
  if cycle_found or cardinality(chain_ids) = 0 then raise exception 'catalog_merge_target_invalid' using errcode = '23514'; end if;
  for lock_id in
    select e.id from public.exercises e
    where e.id = p_source_id or e.id = any(chain_ids) or e.superseded_by = p_source_id or e.superseded_by = any(chain_ids)
    order by e.id
  loop
    perform 1 from public.exercises e where e.id = lock_id for update;
  end loop;
  select e.lifecycle_state, e.lifecycle_revision into source_state, source_revision
    from public.exercises e where e.id = p_source_id;
  if not found then raise exception 'catalog_exercise_not_found' using errcode = 'P0002'; end if;
  with recursive chain(id, superseded_by, lifecycle_state, path, cycle) as (
    select e.id, e.superseded_by, e.lifecycle_state, array[e.id], false
    from public.exercises e where e.id = p_target_id
    union all
    select e.id, e.superseded_by, e.lifecycle_state, c.path || e.id, e.id = any(c.path)
    from chain c join public.exercises e on e.id = c.superseded_by
    where c.superseded_by is not null and not c.cycle
  )
  select id, lifecycle_state into terminal_id, terminal_state
  from chain where superseded_by is null and not cycle order by cardinality(path) desc limit 1;
  if terminal_id is null or terminal_state <> 'active' or p_source_id = terminal_id or p_source_id = any(chain_ids) then
    raise exception 'catalog_merge_target_invalid' using errcode = '23514';
  end if;
  request_hash := 'sha256:' || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_array(p_source_id, p_target_id, p_expected_source_revision)::text, 'UTF8'), 'sha256'), 'hex');
  replay := app_private.claim_catalog_operation(actor, 'catalog.exercise_merged', p_operation_key, request_hash);
  if not app_private.is_platform_owner() then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  if replay is not null then return replay; end if;
  if source_state <> 'active' then raise exception 'catalog_merge_source_not_active' using errcode = '23514'; end if;
  if p_expected_source_revision is null or source_revision <> p_expected_source_revision then
    raise exception 'catalog_exercise_lifecycle_conflict' using errcode = '40001';
  end if;
  update public.exercises set superseded_by = terminal_id, lifecycle_state = 'merged', lifecycle_revision = lifecycle_revision + 1
    where id = p_source_id;
  insert into public.exercise_lifecycle_events(exercise_id, revision, lifecycle_state, actor_user_id)
    values (p_source_id, source_revision + 1, 'merged', actor);
  update public.exercises set superseded_by = terminal_id
    where lifecycle_state = 'merged' and id <> terminal_id and (superseded_by = p_source_id or superseded_by = any(chain_ids));
  result := jsonb_build_object('exercise_id', p_source_id, 'superseded_by', terminal_id);
  perform app_private.catalog_write_audit(actor, 'catalog.exercise_merged', 'exercises', p_source_id, null,
    jsonb_build_object('identity_id', p_source_id, 'related_id', terminal_id,
      'version', source_revision + 1, 'changed_fields', jsonb_build_array('lifecycle')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;
alter function public.catalog_merge_exercise(uuid, uuid, integer, uuid) owner to postgres;
revoke all on function public.catalog_merge_exercise(uuid, uuid, integer, uuid) from public, anon, service_role;
grant execute on function public.catalog_merge_exercise(uuid, uuid, integer, uuid) to authenticated;

create function public.catalog_resolve_exercise_selection(p_exercise_id uuid)
returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare terminal_id uuid; terminal_state text; cycle_found boolean;
begin
  if not app_private.catalog_can_read_global() then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  with recursive chain(id, superseded_by, lifecycle_state, path, cycle) as (
    select e.id, e.superseded_by, e.lifecycle_state, array[e.id], false
    from public.exercises e where e.id = p_exercise_id
    union all
    select e.id, e.superseded_by, e.lifecycle_state, c.path || e.id, e.id = any(c.path)
    from chain c join public.exercises e on e.id = c.superseded_by
    where c.superseded_by is not null and not c.cycle
  )
  select id, lifecycle_state, coalesce(bool_or(cycle) over (), false)
    into terminal_id, terminal_state, cycle_found
  from chain where superseded_by is null order by cardinality(path) desc limit 1;
  if cycle_found or terminal_state <> 'active' then return null; end if;
  return terminal_id;
end;
$$;
alter function public.catalog_resolve_exercise_selection(uuid) owner to postgres;
revoke all on function public.catalog_resolve_exercise_selection(uuid) from public, anon, service_role;
grant execute on function public.catalog_resolve_exercise_selection(uuid) to authenticated;
