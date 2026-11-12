-- F16 T050: keep Video resolution on the immutable F16 versions and behind
-- the staff detail or authorized client-plan projection boundary.

create function app_private.catalog_resolve_exercise_video(
  p_exercise_id uuid, p_workspace_id uuid, p_plan_authorized boolean default false
) returns table (
  exercise_id uuid, workspace_id uuid, video_url text, source text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  override_video text;
  canonical_video text;
begin
  if p_exercise_id is null or p_workspace_id is null
    or (not p_plan_authorized and (auth.uid() is null
      or not app_private.catalog_can_read_global()
      or (not app_private.is_platform_owner()
        and not app_private.has_workspace_access(p_workspace_id, 'coaching_work')))) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  select v.payload ->> 'video_url' into override_video
    from public.exercise_overrides o
    join public.exercise_override_versions v
      on v.workspace_id = o.workspace_id
      and v.exercise_id = o.exercise_id
      and v.version = o.current_version
    where o.workspace_id = p_workspace_id
      and o.exercise_id = p_exercise_id;
  if not app_private.catalog_video_url_allowed(override_video) then
    override_video := null;
  end if;

  select v.payload ->> 'video_url' into canonical_video
    from public.exercises e
    join public.exercise_versions v
      on v.exercise_id = e.id and v.version = e.current_version
    where e.id = p_exercise_id;
  if not found then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if not app_private.catalog_video_url_allowed(canonical_video) then
    canonical_video := null;
  end if;

  return query select p_exercise_id, p_workspace_id,
    coalesce(override_video, canonical_video),
    case when override_video is not null then 'override'
      when canonical_video is not null then 'canonical' else 'none' end;
end;
$$;
alter function app_private.catalog_resolve_exercise_video(uuid, uuid, boolean) owner to postgres;
revoke all on function app_private.catalog_resolve_exercise_video(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

create function app_private.catalog_resolve_workspace_exercise_video(
  p_workspace_id uuid, p_workspace_exercise_id uuid, p_plan_authorized boolean default false
) returns table (
  workspace_exercise_id uuid, workspace_id uuid, video_url text, source text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  private_video text;
begin
  if p_workspace_id is null or p_workspace_exercise_id is null
    or (not p_plan_authorized and (auth.uid() is null
      or not app_private.is_platform_owner()
      and not app_private.has_workspace_access(p_workspace_id, 'coaching_work'))) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  select v.payload ->> 'video_url' into private_video
    from public.workspace_exercises e
    join public.workspace_exercise_versions v
      on v.workspace_id = e.workspace_id
      and v.workspace_exercise_id = e.id
      and v.version = e.current_version
    where e.workspace_id = p_workspace_id
      and e.id = p_workspace_exercise_id;
  if not found then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  if not app_private.catalog_video_url_allowed(private_video) then
    private_video := null;
  end if;
  return query select p_workspace_exercise_id, p_workspace_id, private_video,
    case when private_video is null then 'none' else 'workspace_private' end;
end;
$$;
alter function app_private.catalog_resolve_workspace_exercise_video(uuid, uuid, boolean) owner to postgres;
revoke all on function app_private.catalog_resolve_workspace_exercise_video(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.catalog_exercise_detail(p_exercise_id uuid, p_workspace_id uuid default null)
returns table (
  exercise_id uuid, version integer, payload jsonb, created_at timestamptz,
  created_by uuid, origin_workspace_id uuid, name_ar text, name_en text,
  requested_id uuid, survivor_id uuid, lifecycle_state text, variation jsonb,
  lifecycle_revision integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  requested public.catalog_exercises_safe%rowtype;
  survivor_id_value uuid;
  survivor public.catalog_exercises_safe%rowtype;
  variation_value jsonb;
begin
  if p_exercise_id is null or not app_private.catalog_can_read_global()
    or (p_workspace_id is not null and not app_private.is_platform_owner()
      and not app_private.has_workspace_access(p_workspace_id, 'coaching_work')) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;
  select e.* into requested from public.catalog_exercises_safe e where e.id = p_exercise_id;
  if not found then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  survivor_id_value := public.catalog_resolve_exercise_selection(p_exercise_id);
  if survivor_id_value is null and requested.lifecycle_state = 'removed' then
    survivor_id_value := requested.id;
  end if;
  if survivor_id_value is null then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  select e.* into survivor from public.catalog_exercises_safe e where e.id = survivor_id_value;
  if not found then raise exception using errcode = '42501', message = 'not_permitted'; end if;
  if p_workspace_id is not null then
    select jsonb_build_object(
      'workspace_id', v.workspace_id,
      'video_url', v.video_url,
      'source', v.source
    ) into variation_value
    from app_private.catalog_resolve_exercise_video(survivor_id_value, p_workspace_id, false) v
    where v.exercise_id = survivor_id_value and v.workspace_id = p_workspace_id;
  end if;
  return query
    select v.exercise_id, v.version,
      v.payload || jsonb_build_object('effective_fields', app_private.catalog_effective_exercise_fields(p_workspace_id, survivor_id_value)),
      v.created_at, v.created_by, v.origin_workspace_id, v.name_ar, v.name_en, p_exercise_id,
      survivor_id_value, survivor.lifecycle_state, variation_value, survivor.lifecycle_revision
    from public.catalog_exercise_versions_safe v
    where v.exercise_id = survivor_id_value and v.version = survivor.current_version;
end;
$$;
alter function public.catalog_exercise_detail(uuid, uuid) owner to postgres;
revoke all on function public.catalog_exercise_detail(uuid, uuid) from public, anon, service_role;
grant execute on function public.catalog_exercise_detail(uuid, uuid) to authenticated;

drop function public.catalog_resolve_exercise_video(uuid, uuid);
