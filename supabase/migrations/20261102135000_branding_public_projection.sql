-- Extend the existing F10 open response with a minimal, version-bound F14
-- identity projection. Keep F10 validity, consumption and handle issuance in
-- the renamed base function so this layer cannot weaken its contract.
grant create on schema public to branding_definer;
grant branding_definer to postgres;
set role branding_definer;

alter function public.registration_link_open(text)
  rename to registration_link_open_f10_base;
revoke all on function public.registration_link_open_f10_base(text)
  from public,anon,authenticated,service_role,branding_proxy,branding_validator,
    branding_definer;

create function public.registration_link_open(token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; render_handle text; identity jsonb;
begin
  result:=public.registration_link_open_f10_base(token);
  if result->>'status' is distinct from 'valid'
    or result->>'render_handle' is null then
    return result;
  end if;
  render_handle:=result->>'render_handle';
  select jsonb_build_object(
      'name',v.fields->'name',
      'color',v.fields->'color',
      'bannerAlt',v.fields->'bannerAlt',
      'logo',exists(select 1 from app_private.branding_published_assets a
        where a.workspace_id=v.workspace_id and a.version_id=v.id and a.slot='logo'),
      'banner',exists(select 1 from app_private.branding_published_assets a
        where a.workspace_id=v.workspace_id and a.version_id=v.id and a.slot='banner')
    )
    into identity
    from app_private.branding_render_handles h
    join public.registration_links l on l.id=h.link_id and l.workspace_id=h.workspace_id
    join app_private.branding_published_versions v
      on v.workspace_id=h.workspace_id and v.id=h.version_id
    where l.token_hash=encode(extensions.digest(token,'sha256'),'hex')
      and h.handle_hash=encode(extensions.digest(render_handle,'sha256'),'hex')
      and h.expires_at>statement_timestamp();
  if identity is null then return result-'render_handle'; end if;
  return result||jsonb_build_object('branding',identity);
end;
$$;

reset role;
revoke branding_definer from postgres;
revoke create on schema public from branding_definer;
revoke all on function public.registration_link_open(text)
  from public,anon,authenticated,service_role,branding_proxy,branding_validator,
    branding_definer;
grant execute on function public.registration_link_open(text)
  to anon,authenticated;
