-- F16 T016: resolve the selected workspace mapping at read time.
create function app_private.catalog_video_url_allowed(p_url text)
returns boolean
language sql immutable security definer set search_path = '' as $$
  select p_url is not null and p_url ~* '^https://(www\.)?(youtube\.com|youtu\.be|drive\.google\.com|docs\.google\.com)(/|$)'
$$;
alter function app_private.catalog_video_url_allowed(text) owner to postgres;
revoke all on function app_private.catalog_video_url_allowed(text) from public, anon, authenticated, service_role;
grant execute on function app_private.catalog_video_url_allowed(text) to authenticated;

create function public.catalog_resolve_exercise_video(p_exercise_id uuid, p_workspace_id uuid)
returns table (exercise_id uuid, workspace_id uuid, video_url text)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or p_workspace_id is null
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  return query
    select e.id, v.workspace_id, vv.payload ->> 'video_url'
    from public.exercise_variations v
    join public.exercises e on e.id = v.exercise_id
    join public.exercise_variation_versions vv
      on vv.workspace_id = v.workspace_id
      and vv.exercise_id = v.exercise_id
      and vv.version = v.current_version
    where v.exercise_id = p_exercise_id
      and v.workspace_id = p_workspace_id
      and v.lifecycle_state = 'active'
      and e.lifecycle_state = 'active'
      and app_private.catalog_video_url_allowed(vv.payload ->> 'video_url');
end;
$$;
alter function public.catalog_resolve_exercise_video(uuid, uuid) owner to postgres;
revoke all on function public.catalog_resolve_exercise_video(uuid, uuid) from public, anon, service_role;
grant execute on function public.catalog_resolve_exercise_video(uuid, uuid) to authenticated;
