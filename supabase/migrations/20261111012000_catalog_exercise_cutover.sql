-- F16 T054/T062: retire PR #43 variation storage and delete every pre-cutover
-- exercise identity, version, video, lifecycle row and override on this replay.
-- The T068 Stack A inventory is rerun immediately before this migration is applied.

begin;

lock table public.exercises, public.workspace_exercises in exclusive mode;
lock table public.exercise_versions, public.workspace_exercise_versions,
  public.exercise_variations, public.exercise_variation_versions,
  public.exercise_lifecycle_events, public.workspace_exercise_lifecycle_events,
  public.exercise_overrides, public.exercise_override_versions,
  public.exercise_version_alternatives, public.workspace_exercise_version_alternatives,
  public.exercise_override_alternatives in share row exclusive mode;

-- These deferred pointer constraints form the reverse half of each identity /
-- version pair. Drop and recreate them inside this one transactional cutover.
alter table public.exercises drop constraint if exists exercises_current_version_fk;
alter table public.workspace_exercises drop constraint if exists workspace_exercises_current_version_fk;
alter table public.exercise_variations drop constraint if exists exercise_variations_current_version_fk;
alter table public.exercise_overrides drop constraint if exists exercise_overrides_current_version_fk;
alter table public.exercises drop constraint if exists exercises_superseded_by_fk;

alter table public.exercise_lifecycle_events disable trigger exercise_lifecycle_events_append_only;
alter table public.workspace_exercise_lifecycle_events disable trigger workspace_exercise_lifecycle_events_append_only;
alter table public.exercise_versions disable trigger exercise_versions_append_only;
alter table public.exercise_override_versions disable trigger exercise_override_versions_append_only;
alter table public.exercise_version_alternatives disable trigger exercise_version_alternatives_append_only;
alter table public.workspace_exercise_version_alternatives disable trigger workspace_exercise_version_alternatives_append_only;
alter table public.exercise_override_alternatives disable trigger exercise_override_alternatives_append_only;

delete from public.exercise_lifecycle_events;
delete from public.workspace_exercise_lifecycle_events;
delete from public.exercise_version_alternatives;
delete from public.workspace_exercise_version_alternatives;
delete from public.exercise_override_alternatives;
delete from public.exercise_variation_versions;
delete from public.exercise_variations;
delete from public.exercise_override_versions;
delete from public.exercise_overrides;
delete from public.exercise_versions;
delete from public.workspace_exercise_versions;

-- Remove superseding identities before the terminal survivor so the self-FK
-- ordering is explicit even when a Remove/Restore/Merge history is present.
do $$
declare identity_id uuid;
begin
  for identity_id in
    with recursive chain(id, superseded_by, depth, path) as (
      select e.id, e.superseded_by, 0, array[e.id]
      from public.exercises e
      union all
      select c.id, target.superseded_by, c.depth + 1, c.path || target.id
      from chain c
      join public.exercises target on target.id = c.superseded_by
      where not target.id = any(c.path)
    ), depths as (
      select id, max(depth) as depth from chain group by id
    )
    select e.id from public.exercises e
    join depths d on d.id = e.id
    order by d.depth desc, e.id
  loop
    delete from public.exercises where id = identity_id;
  end loop;
end;
$$;
delete from public.workspace_exercises;

alter table public.exercises add constraint exercises_superseded_by_fk
  foreign key (superseded_by) references public.exercises(id) on delete restrict;
alter table public.exercises add constraint exercises_current_version_fk
  foreign key (id, current_version) references public.exercise_versions(exercise_id, version)
  deferrable initially deferred;
alter table public.workspace_exercises add constraint workspace_exercises_current_version_fk
  foreign key (workspace_id, id, current_version)
  references public.workspace_exercise_versions(workspace_id, workspace_exercise_id, version)
  deferrable initially deferred;
alter table public.exercise_variations add constraint exercise_variations_current_version_fk
  foreign key (workspace_id, exercise_id, current_version)
  references public.exercise_variation_versions(workspace_id, exercise_id, version)
  deferrable initially deferred;
alter table public.exercise_overrides add constraint exercise_overrides_current_version_fk
  foreign key (workspace_id, exercise_id, current_version)
  references public.exercise_override_versions(workspace_id, exercise_id, version)
  deferrable initially deferred;

alter table public.exercise_lifecycle_events enable trigger exercise_lifecycle_events_append_only;
alter table public.workspace_exercise_lifecycle_events enable trigger workspace_exercise_lifecycle_events_append_only;
alter table public.exercise_versions enable trigger exercise_versions_append_only;
alter table public.exercise_override_versions enable trigger exercise_override_versions_append_only;
alter table public.exercise_version_alternatives enable trigger exercise_version_alternatives_append_only;
alter table public.workspace_exercise_version_alternatives enable trigger workspace_exercise_version_alternatives_append_only;
alter table public.exercise_override_alternatives enable trigger exercise_override_alternatives_append_only;

-- Relegate the old implementation to a private, owner-only function. The
-- public compatibility RPC below resolves variation reads using F16 overrides;
-- public catalog_write_variation/catalog_transition_variation are retired.
do $$
begin
  if pg_catalog.to_regprocedure('app_private.catalog_search_pre_cutover(text,text,jsonb,text,uuid)') is null then
    alter function public.catalog_search(text, text, jsonb, text, uuid) set schema app_private;
    alter function app_private.catalog_search(text, text, jsonb, text, uuid) rename to catalog_search_pre_cutover;
  end if;
end;
$$;
alter function app_private.catalog_search_pre_cutover(text, text, jsonb, text, uuid) owner to postgres;
revoke all on function app_private.catalog_search_pre_cutover(text, text, jsonb, text, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.catalog_search(
  kind text, query text default null, filters jsonb default '{}'::jsonb,
  "cursor" text default null, workspace_id uuid default null
) returns table (
  result_id uuid, result_workspace_id uuid, result_version integer,
  result_payload jsonb, result_created_by uuid, result_origin_workspace_id uuid
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if kind = 'variation' then
    if workspace_id is null or auth.uid() is null
      or (not app_private.is_platform_owner()
        and not app_private.has_workspace_access(workspace_id, 'coaching_work')) then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    return query
      select found.result_id, $5, override.current_version,
        found.result_payload, null::uuid, null::uuid
      from app_private.catalog_search_pre_cutover(
        'exercise', query, filters, "cursor", workspace_id
      ) found
      join public.exercise_overrides override
        on override.workspace_id = $5 and override.exercise_id = found.result_id
      where found.result_payload #>> '{effective_fields,video,source}' = 'override'
        or found.result_payload #>> '{effective_fields,notes,source}' = 'override';
    return;
  end if;
  if kind in ('exercise', 'food') then
    if not app_private.catalog_can_read_global() then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    if kind = 'exercise' and workspace_id is not null
      and not app_private.is_platform_owner()
      and not app_private.has_workspace_access(workspace_id, 'coaching_work') then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
  elsif kind = 'workspace_exercise' then
    if workspace_id is null or not app_private.has_workspace_access(workspace_id, 'coaching_work') then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
  else
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  return query select * from app_private.catalog_search_pre_cutover(kind, query, filters, "cursor", workspace_id);
end;
$$;
alter function public.catalog_search(text, text, jsonb, text, uuid) owner to postgres;
revoke all on function public.catalog_search(text, text, jsonb, text, uuid) from public, anon, service_role;
grant execute on function public.catalog_search(text, text, jsonb, text, uuid) to authenticated;

drop function if exists public.catalog_write_variation(uuid, uuid, integer, uuid, jsonb);
drop function if exists public.catalog_transition_variation(uuid, uuid, integer, text, uuid);

-- All pre-F16 exercise payloads, including dummy docs.google.com values and
-- any mock plan snapshot references, are removed with their owning identities.
-- No plan snapshot persistence tables exist in this branch's deployed schema.
-- Audit history is retained: this migration intentionally never deletes audit_events.

commit;
