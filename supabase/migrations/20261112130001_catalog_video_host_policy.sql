-- F16 T061: align the SQL URL allowlist with D16-3 and the TypeScript host list.
create or replace function app_private.catalog_video_url_allowed(p_url text)
returns boolean
language sql immutable security definer set search_path = '' as $$
  select p_url is not null
    and p_url ~* '^https://(youtube\.com|www\.youtube\.com|youtu\.be|drive\.google\.com)(/|$)'
$$;
alter function app_private.catalog_video_url_allowed(text) owner to postgres;
revoke all on function app_private.catalog_video_url_allowed(text) from public, anon, authenticated, service_role;
grant execute on function app_private.catalog_video_url_allowed(text) to authenticated;
