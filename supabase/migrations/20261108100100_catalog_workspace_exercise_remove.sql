-- F16 T042-T043 / S31-PO-1 Q3: expose lifecycle revisions and add the
-- explicitly scoped, non-destructive workspace exercise Remove operation.

alter table public.workspace_exercises
  add column lifecycle_revision integer not null default 0
  check (lifecycle_revision >= 0);

create table public.workspace_exercise_lifecycle_events (
  workspace_id uuid not null,
  workspace_exercise_id uuid not null,
  revision integer not null check (revision > 0),
  lifecycle_state text not null check (lifecycle_state in ('removed')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (workspace_id, workspace_exercise_id, revision),
  foreign key (workspace_id, workspace_exercise_id)
    references public.workspace_exercises(workspace_id, id) on delete restrict
);
alter table public.workspace_exercise_lifecycle_events enable row level security;
alter table public.workspace_exercise_lifecycle_events force row level security;
create policy workspace_exercise_lifecycle_events_scope_read
  on public.workspace_exercise_lifecycle_events for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
revoke all on public.workspace_exercise_lifecycle_events from public, anon, authenticated, service_role;
grant select on public.workspace_exercise_lifecycle_events to authenticated;
create trigger workspace_exercise_lifecycle_events_append_only
  before update or delete on public.workspace_exercise_lifecycle_events
  for each row execute function app_private.reject_catalog_version_mutation();

create function public.catalog_remove_workspace_exercise(
  p_workspace_id uuid, p_exercise_id uuid, p_expected_revision integer, p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  current_revision integer;
  current_state text;
  request_hash text;
  replay jsonb;
  next_revision integer;
  result jsonb;
begin
  if actor is null or p_workspace_id is null
    or (not app_private.is_platform_owner()
      and not app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  select e.lifecycle_revision, e.lifecycle_state
    into current_revision, current_state
    from public.workspace_exercises e
    where e.workspace_id = p_workspace_id and e.id = p_exercise_id
    for update;
  if not found then raise exception 'catalog_exercise_not_found' using errcode = 'P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'catalog.workspace_exercise.lifecycle:' || p_workspace_id::text || ':' || p_exercise_id::text, 0));

  if p_operation_key is null or p_operation_key::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then raise exception 'catalog_operation_key_invalid' using errcode = '22023'; end if;
  request_hash := 'sha256:' || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_array(p_workspace_id, p_exercise_id, p_expected_revision)::text, 'UTF8'), 'sha256'), 'hex');
  replay := app_private.claim_catalog_operation(actor, 'catalog.workspace_exercise_removed', p_operation_key, request_hash);
  if not app_private.is_platform_owner()
    and not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if replay is not null then return replay; end if;
  if p_expected_revision is null or current_revision <> p_expected_revision then
    raise exception 'catalog_exercise_lifecycle_conflict' using errcode = '40001';
  end if;
  if current_state <> 'active' then
    raise exception 'catalog_exercise_lifecycle_conflict' using errcode = '23514';
  end if;

  next_revision := current_revision + 1;
  insert into public.workspace_exercise_lifecycle_events(
    workspace_id, workspace_exercise_id, revision, lifecycle_state, actor_user_id
  ) values (p_workspace_id, p_exercise_id, next_revision, 'removed', actor);
  update public.workspace_exercises
    set lifecycle_state = 'removed', lifecycle_revision = next_revision
    where workspace_id = p_workspace_id and id = p_exercise_id;
  result := jsonb_build_object('workspace_id', p_workspace_id, 'exercise_id', p_exercise_id,
    'lifecycle_revision', next_revision, 'lifecycle_state', 'removed');
  perform app_private.catalog_write_audit(actor, 'catalog.workspace_exercise_removed',
    'workspace_exercises', p_exercise_id, p_workspace_id,
    jsonb_build_object('identity_id', p_exercise_id, 'version', next_revision,
      'changed_fields', jsonb_build_array('lifecycle')));
  perform app_private.set_catalog_operation_result(actor, p_operation_key, result);
  return result;
end;
$$;
alter function public.catalog_remove_workspace_exercise(uuid, uuid, integer, uuid) owner to postgres;
revoke all on function public.catalog_remove_workspace_exercise(uuid, uuid, integer, uuid) from public, anon, service_role;
grant execute on function public.catalog_remove_workspace_exercise(uuid, uuid, integer, uuid) to authenticated;

create or replace view public.catalog_exercises_safe with (security_barrier = true) as
  select e.id, e.current_version, e.lifecycle_state, e.created_at,
    case when (select app_private.is_platform_owner()) then e.created_by else null::uuid end as created_by,
    null::uuid as origin_workspace_id, e.lifecycle_revision
  from public.exercises e
  where (select app_private.catalog_can_read_global());
alter view public.catalog_exercises_safe owner to postgres;
revoke all on public.catalog_exercises_safe from public, anon, service_role;
grant select on public.catalog_exercises_safe to authenticated;

drop function public.catalog_exercise_detail(uuid, uuid);
create function public.catalog_exercise_detail(p_exercise_id uuid, p_workspace_id uuid default null)
returns table (
  exercise_id uuid, version integer, payload jsonb, created_at timestamptz,
  created_by uuid, origin_workspace_id uuid, name_ar text, name_en text,
  requested_id uuid, survivor_id uuid, lifecycle_state text, variation jsonb,
  lifecycle_revision integer
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  requested public.catalog_exercises_safe%rowtype;
  survivor_id_value uuid;
  survivor public.catalog_exercises_safe%rowtype;
  variation_value jsonb;
begin
  if p_exercise_id is null or not app_private.catalog_can_read_global() then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  select e.* into requested from public.catalog_exercises_safe e where e.id = p_exercise_id;
  if not found then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  survivor_id_value := public.catalog_resolve_exercise_selection(p_exercise_id);
  if survivor_id_value is null and requested.lifecycle_state = 'removed' then survivor_id_value := requested.id; end if;
  if survivor_id_value is null then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  select e.* into survivor from public.catalog_exercises_safe e where e.id = survivor_id_value;
  if not found then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  if p_workspace_id is not null then
    begin
      select jsonb_build_object('workspace_id', v.workspace_id, 'video_url', v.video_url)
        into variation_value
        from public.catalog_resolve_exercise_video(survivor_id_value, p_workspace_id) v
        where v.exercise_id = survivor_id_value and v.workspace_id = p_workspace_id;
    exception when sqlstate '42501' then variation_value := null;
    end;
  end if;
  return query
    select v.exercise_id, v.version, v.payload, v.created_at, v.created_by,
      v.origin_workspace_id, v.name_ar, v.name_en, p_exercise_id, survivor_id_value,
      survivor.lifecycle_state, variation_value, survivor.lifecycle_revision
    from public.catalog_exercise_versions_safe v
    where v.exercise_id = survivor_id_value and v.version = survivor.current_version;
end;
$$;
alter function public.catalog_exercise_detail(uuid, uuid) owner to postgres;
revoke all on function public.catalog_exercise_detail(uuid, uuid) from public, anon, service_role;
grant execute on function public.catalog_exercise_detail(uuid, uuid) to authenticated;

create function public.catalog_workspace_exercise_detail(p_workspace_id uuid, p_exercise_id uuid)
returns table (
  exercise_id uuid, version integer, payload jsonb, created_at timestamptz,
  created_by uuid, origin_workspace_id uuid, name_ar text, name_en text,
  requested_id uuid, survivor_id uuid, lifecycle_state text, variation jsonb,
  lifecycle_revision integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  current_version integer;
  state_value text;
  revision_value integer;
  payload_value jsonb;
  created_value timestamptz;
begin
  if auth.uid() is null or p_workspace_id is null or p_exercise_id is null
    or (not app_private.is_platform_owner()
      and not app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  select e.current_version, e.lifecycle_state, e.lifecycle_revision
    into current_version, state_value, revision_value
    from public.workspace_exercises e
    where e.workspace_id = p_workspace_id and e.id = p_exercise_id;
  if not found then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  select v.payload, v.created_at into payload_value, created_value
    from public.workspace_exercise_versions v
    where v.workspace_id = p_workspace_id and v.workspace_exercise_id = p_exercise_id
      and v.version = current_version;
  if not found then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  return query select p_exercise_id, current_version, payload_value, created_value,
    null::uuid, null::uuid, payload_value ->> 'name_ar', payload_value ->> 'name_en',
    p_exercise_id, p_exercise_id, state_value, null::jsonb, revision_value;
end;
$$;
alter function public.catalog_workspace_exercise_detail(uuid, uuid) owner to postgres;
revoke all on function public.catalog_workspace_exercise_detail(uuid, uuid) from public, anon, service_role;
grant execute on function public.catalog_workspace_exercise_detail(uuid, uuid) to authenticated;
