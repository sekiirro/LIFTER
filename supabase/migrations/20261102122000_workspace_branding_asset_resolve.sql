-- T046 read-side asset metadata. No validation receipt/promotion/publish API.
create table app_private.branding_published_assets (
  workspace_id uuid not null,
  version_id uuid not null,
  slot text not null check(slot in ('logo','banner')),
  bucket_id text not null check(bucket_id='branding-validated'),
  object_name text not null,
  content_type text not null check(content_type in ('image/png','image/webp')),
  byte_size bigint not null check(byte_size>0),
  primary key(workspace_id,version_id,slot),
  foreign key(workspace_id,version_id) references app_private.branding_published_versions(workspace_id,id) on delete restrict,
  check(object_name ~ ('^'||workspace_id::text||'/[0-9a-f]{64}\.(png|webp)$'))
);
alter table app_private.branding_published_assets enable row level security;
alter table app_private.branding_published_assets force row level security;
revoke all on app_private.branding_published_assets from public,anon,authenticated,service_role,branding_proxy,branding_validator;

create function app_private.branding_asset_context(token text,render_handle text,slot text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r record; at_time timestamptz:=statement_timestamp();
begin
  if not app_private.branding_credential_allowed('branding_proxy') or token is null or render_handle is null or slot is null
    or token !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'
    or render_handle !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' or slot not in ('logo','banner')
    then return '{"status":"invalid"}'::jsonb; end if;
  select a.bucket_id,a.object_name,a.content_type,a.byte_size into r
    from public.registration_links l
    join public.workspaces w on w.id=l.workspace_id
    join app_private.branding_render_handles h on h.link_id=l.id and h.workspace_id=l.workspace_id
    join app_private.branding_current_publications p on p.workspace_id=h.workspace_id and p.version_id=h.version_id
    join app_private.branding_published_assets a on a.workspace_id=p.workspace_id and a.version_id=p.version_id and a.slot=branding_asset_context.slot
    where l.token_hash=encode(extensions.digest(token,'sha256'),'hex')
      and h.handle_hash=encode(extensions.digest(render_handle,'sha256'),'hex') and h.expires_at>at_time
      and app_private.registration_link_is_valid(l.expires_at,l.opened_at,l.consumed_at,at_time);
  if not found then return '{"status":"invalid"}'::jsonb; end if;
  return jsonb_build_object('status','ok','bucket',r.bucket_id,'object',r.object_name,'content_type',r.content_type,'byte_size',r.byte_size);
end $$;
alter function app_private.branding_asset_context(text,text,text) owner to postgres;
revoke all on function app_private.branding_asset_context(text,text,text) from public,anon,authenticated,service_role,branding_proxy,branding_validator;

create function public.registration_brand_asset_resolve(token text,render_handle text,slot text) returns jsonb
language sql stable security definer set search_path='' as $$
  select app_private.branding_asset_context(token,render_handle,slot)
$$;
alter function public.registration_brand_asset_resolve(text,text,text) owner to postgres;
revoke all on function public.registration_brand_asset_resolve(text,text,text) from public,anon,authenticated,service_role,branding_proxy,branding_validator;
grant execute on function public.registration_brand_asset_resolve(text,text,text) to branding_proxy;

create function app_private.branding_storage_read_allowed(bucket text,object_name text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare h jsonb; r jsonb;
begin
  if bucket is distinct from 'branding-validated' or object_name is null
    or current_setting('storage.operation',true) is distinct from 'storage.object.get_authenticated'
    or current_setting('request.method',true) is distinct from 'GET'
    or current_setting('request.path',true) is distinct from '/object/authenticated/'||bucket||'/'||object_name then return false; end if;
  h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  r:=app_private.branding_asset_context(h->>'x-lifter-registration-token',h->>'x-lifter-render-handle',h->>'x-lifter-brand-slot');
  return coalesce(r->>'status'='ok' and r->>'bucket'=bucket and r->>'object'=object_name,false);
exception when invalid_text_representation then return false;
end $$;
alter function app_private.branding_storage_read_allowed(text,text) owner to postgres;
revoke all on function app_private.branding_storage_read_allowed(text,text) from public,anon,authenticated,service_role,branding_proxy,branding_validator;
grant execute on function app_private.branding_storage_read_allowed(text,text) to branding_proxy;

insert into storage.buckets(id,name,public) values('branding-validated','branding-validated',false) on conflict(id) do nothing;
do $$ begin
  if exists(select 1 from storage.buckets b where b.id='branding-validated' and b.public) then
    raise exception 'Branding validated bucket must be private'; end if;
end $$;
grant usage on schema storage to branding_proxy;
grant select on storage.objects to branding_proxy;
create policy branding_proxy_object_read on storage.objects for select to branding_proxy
  using(app_private.branding_storage_read_allowed(bucket_id,name));
