-- F16 T048: freeze workspace alternative targets with each immutable override version.
create table public.exercise_override_alternatives (
  workspace_id uuid not null,
  exercise_id uuid not null,
  override_version integer not null check (override_version > 0),
  position smallint not null check (position between 1 and 3),
  global_exercise_id uuid,
  workspace_exercise_id uuid,
  primary key (workspace_id, exercise_id, override_version, position),
  constraint exercise_override_alternatives_one_target_check
    check (num_nonnulls(global_exercise_id, workspace_exercise_id) = 1),
  constraint exercise_override_alternatives_version_fk
    foreign key (workspace_id, exercise_id, override_version)
    references public.exercise_override_versions(workspace_id, exercise_id, version) on delete restrict,
  constraint exercise_override_alternatives_global_target_fk
    foreign key (global_exercise_id) references public.exercises(id) on delete restrict,
  constraint exercise_override_alternatives_private_target_fk
    foreign key (workspace_id, workspace_exercise_id)
    references public.workspace_exercises(workspace_id, id) on delete restrict,
  constraint exercise_override_alternatives_unique_global
    unique (workspace_id, exercise_id, override_version, global_exercise_id),
  constraint exercise_override_alternatives_unique_private
    unique (workspace_id, exercise_id, override_version, workspace_exercise_id)
);

comment on table public.exercise_override_alternatives is
  'Immutable workspace alternative targets captured with one override version (F16 FR-025).';

create index exercise_override_alternatives_private_target_idx
  on public.exercise_override_alternatives(workspace_id, workspace_exercise_id)
  where workspace_exercise_id is not null;

create function app_private.validate_exercise_override_alternative()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  global_state text;
  private_state text;
  has_alternatives boolean;
begin
  select v.alternatives_present into has_alternatives
    from public.exercise_override_versions v
    where v.workspace_id = new.workspace_id
      and v.exercise_id = new.exercise_id
      and v.version = new.override_version;
  if not found or not has_alternatives then
    raise exception 'catalog_exercise_alternatives_invalid' using errcode = '23514';
  end if;

  if new.global_exercise_id is not null then
    select e.lifecycle_state into global_state
      from public.exercises e where e.id = new.global_exercise_id;
    if global_state is distinct from 'active' then
      raise exception 'catalog_exercise_alternatives_invalid' using errcode = '23514';
    end if;
  else
    select e.lifecycle_state into private_state
      from public.workspace_exercises e
      where e.workspace_id = new.workspace_id and e.id = new.workspace_exercise_id;
    if private_state is distinct from 'active' then
      raise exception 'catalog_exercise_alternatives_invalid' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
alter function app_private.validate_exercise_override_alternative() owner to postgres;
revoke all on function app_private.validate_exercise_override_alternative() from public, anon, authenticated, service_role;

create trigger exercise_override_alternatives_active_target
  before insert on public.exercise_override_alternatives
  for each row execute function app_private.validate_exercise_override_alternative();
create trigger exercise_override_alternatives_append_only
  before update or delete on public.exercise_override_alternatives
  for each row execute function app_private.reject_catalog_version_mutation();
create trigger exercise_override_alternatives_no_truncate
  before truncate on public.exercise_override_alternatives
  for each statement execute function app_private.reject_catalog_version_mutation();

alter table public.exercise_override_alternatives enable row level security;
alter table public.exercise_override_alternatives force row level security;
create policy exercise_override_alternatives_scope_read
  on public.exercise_override_alternatives for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
revoke all on public.exercise_override_alternatives from public, anon, authenticated, service_role;
grant select on public.exercise_override_alternatives to authenticated;

create function public.catalog_exercise_override_alternatives(p_workspace_id uuid, p_exercise_id uuid)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_current_version integer;
  present boolean := false;
  items jsonb;
begin
  if p_workspace_id is null or p_exercise_id is null
    or not app_private.catalog_can_read_global()
    or not (app_private.is_platform_owner()
      or app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  select o.current_version into v_current_version
    from public.exercise_overrides o
    where o.workspace_id = p_workspace_id and o.exercise_id = p_exercise_id;
  if found then
    select v.alternatives_present into present
      from public.exercise_override_versions v
      where v.workspace_id = p_workspace_id and v.exercise_id = p_exercise_id
        and v.version = v_current_version;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('position', a.position,
      'global_exercise_id', a.global_exercise_id,
      'workspace_exercise_id', a.workspace_exercise_id)
    order by a.position
  ) filter (where
      (a.global_exercise_id is not null and g.lifecycle_state = 'active')
      or (a.workspace_exercise_id is not null and w.lifecycle_state = 'active')
    ), '[]'::jsonb)
    into items
    from public.exercise_override_alternatives a
    left join public.exercises g on g.id = a.global_exercise_id
    left join public.workspace_exercises w
      on w.workspace_id = a.workspace_id and w.id = a.workspace_exercise_id
    where a.workspace_id = p_workspace_id and a.exercise_id = p_exercise_id
      and a.override_version = v_current_version;

  return jsonb_build_object('present', coalesce(present, false), 'items', items);
end;
$$;
alter function public.catalog_exercise_override_alternatives(uuid, uuid) owner to postgres;
revoke all on function public.catalog_exercise_override_alternatives(uuid, uuid) from public, anon, service_role;
grant execute on function public.catalog_exercise_override_alternatives(uuid, uuid) to authenticated;
