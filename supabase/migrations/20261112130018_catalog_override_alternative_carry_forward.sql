-- Preserve removed targets in immutable override history when another field changes.
create or replace function app_private.validate_exercise_override_alternative()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_active boolean; carried_forward boolean;
begin
  if not exists (
    select 1 from public.exercise_override_versions v
    where v.workspace_id=new.workspace_id and v.exercise_id=new.exercise_id
      and v.version=new.override_version and v.alternatives_present
  ) then raise exception 'catalog_exercise_alternatives_invalid' using errcode='23514'; end if;
  if new.global_exercise_id is not null then
    select e.lifecycle_state='active' into target_active from public.exercises e where e.id=new.global_exercise_id;
  else
    select e.lifecycle_state='active' into target_active from public.workspace_exercises e
      where e.workspace_id=new.workspace_id and e.id=new.workspace_exercise_id;
  end if;
  if coalesce(target_active,false) then return new; end if;
  select exists (
    select 1 from public.exercise_overrides o
    join public.exercise_override_alternatives a on a.workspace_id=o.workspace_id
      and a.exercise_id=o.exercise_id and a.override_version=o.current_version
      and a.position=new.position
      and a.global_exercise_id is not distinct from new.global_exercise_id
      and a.workspace_exercise_id is not distinct from new.workspace_exercise_id
    where o.workspace_id=new.workspace_id and o.exercise_id=new.exercise_id
      and o.current_version=new.override_version-1
  ) into carried_forward;
  if not carried_forward then raise exception 'catalog_exercise_alternatives_invalid' using errcode='23514'; end if;
  return new;
end;
$$;
alter function app_private.validate_exercise_override_alternative() owner to postgres;
revoke all on function app_private.validate_exercise_override_alternative() from public, anon, authenticated, service_role;

-- Patch the approved RPC definition from its installed body so the forward
-- migration keeps its existing CAS, authorization, audit, and grant behavior.
do $patch$
declare definition text; old_copy text; new_copy text; old_target text; new_target text;
begin
  old_copy := $old$
      left join public.exercises g on g.id=a.global_exercise_id
      left join public.workspace_exercises w on w.workspace_id=a.workspace_id and w.id=a.workspace_exercise_id
      where a.workspace_id=p_workspace_id and a.exercise_id=p_exercise_id and a.override_version=current_version
        and ((a.global_exercise_id is not null and g.lifecycle_state='active')
          or (a.workspace_exercise_id is not null and w.lifecycle_state='active'));
$old$;
  new_copy := $new$
      where a.workspace_id=p_workspace_id and a.exercise_id=p_exercise_id and a.override_version=current_version;
$new$;
  old_target := $old$      target_private := nullif(item->>'workspace_exercise_id','')::uuid;
      if target_global is not null then target_key := 'g:' || target_global::text;
      else target_key := 'w:' || target_private::text; end if;
$old$;
  new_target := $new$      target_private := nullif(item->>'workspace_exercise_id','')::uuid;
      if target_global is not null then
        if target_global=p_exercise_id or not exists (select 1 from public.exercises e where e.id=target_global and e.lifecycle_state='active') then
          raise exception 'catalog_exercise_alternatives_invalid' using errcode='22023'; end if;
        target_key := 'g:' || target_global::text;
      else
        if target_private=p_exercise_id or not exists (select 1 from public.workspace_exercises e where e.workspace_id=p_workspace_id and e.id=target_private and e.lifecycle_state='active') then
          raise exception 'catalog_exercise_alternatives_invalid' using errcode='22023'; end if;
        target_key := 'w:' || target_private::text;
      end if;
$new$;
  definition := pg_catalog.pg_get_functiondef('public.catalog_write_exercise_override(uuid,uuid,integer,uuid,jsonb)'::regprocedure);
  if pg_catalog.strpos(definition, old_copy)=0 or pg_catalog.strpos(definition, old_target)=0 then
    raise exception 'catalog_write_exercise_override source pattern changed';
  end if;
  definition := pg_catalog.replace(definition,old_copy,new_copy);
  definition := pg_catalog.replace(definition,old_target,new_target);
  execute definition;
end;
$patch$;

-- Compare UUID values rather than textual renderings for self-reference.
do $patch$
declare definition text;
begin
  definition := pg_catalog.pg_get_functiondef('public.catalog_version_exercise(uuid,integer,uuid,jsonb)'::regprocedure);
  if pg_catalog.strpos(definition, 'where a.target_id = p_exercise_id::text')=0 then
    raise exception 'catalog_version_exercise source pattern changed';
  end if;
  definition := pg_catalog.replace(definition,'where a.target_id = p_exercise_id::text','where a.target_id::uuid = p_exercise_id');
  execute definition;
end;
$patch$;
