-- T051. Keep F14 SECURITY DEFINER code under a non-login, non-bypass owner.
do $$ begin
  if not exists(select 1 from pg_catalog.pg_roles where rolname='branding_definer') then
    create role branding_definer nologin nosuperuser nobypassrls noinherit nocreatedb nocreaterole;
  end if;
  if exists(select 1 from pg_catalog.pg_roles r where r.rolname='branding_definer'
    and (r.rolcanlogin or r.rolsuper or r.rolbypassrls or r.rolinherit or r.rolcreatedb or r.rolcreaterole))
    or exists(select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid=m.member
      where r.rolname='branding_definer') then
    raise exception 'Branding definer role privilege drift';
  end if;
end $$;

-- The role is deliberately not granted to authenticator or any API role.
grant usage on schema public, app_private, extensions to branding_definer;
grant create on schema public, app_private to branding_definer;

-- Forced RLS remains active for the definer. These private policies are
-- reachable only from functions owned by the role; callers have no membership.
create policy branding_definer_internal on app_private.branding_credentials
  to branding_definer using (true) with check (true);
create policy branding_definer_internal on app_private.branding_credential_events
  to branding_definer using (true) with check (true);
create policy branding_definer_internal on app_private.branding_published_versions
  to branding_definer using (true) with check (true);
create policy branding_definer_internal on app_private.branding_current_publications
  to branding_definer using (true) with check (true);
create policy branding_definer_internal on app_private.branding_render_handles
  to branding_definer using (true) with check (true);
create policy branding_definer_internal on app_private.branding_published_assets
  to branding_definer using (true) with check (true);
create policy branding_definer_registration_link_internal on public.registration_links
  to branding_definer using (true) with check (true);
create policy branding_definer_workspace_internal on public.workspaces
  to branding_definer using (true) with check (true);

grant select,insert,update,delete on app_private.branding_credentials to branding_definer;
grant insert on app_private.branding_credential_events to branding_definer;
grant usage,select on sequence app_private.branding_credential_events_id_seq to branding_definer;
grant select,insert,update,delete on app_private.branding_render_handles to branding_definer;
grant select on app_private.branding_current_publications,app_private.branding_published_assets to branding_definer;
grant select on public.registration_links,public.workspaces to branding_definer;
grant update (opened_at) on public.registration_links to branding_definer;
grant execute on function app_private.registration_link_is_valid(timestamptz,timestamptz,timestamptz,timestamptz) to branding_definer;
grant execute on function extensions.digest(text,text),extensions.digest(bytea,text),extensions.gen_random_bytes(integer) to branding_definer;

-- Set exact function ACLs while postgres still owns the existing functions.
revoke all on function app_private.branding_credential_event_immutable() from public,anon,authenticated,service_role,branding_proxy,branding_validator,branding_definer;
revoke all on function app_private.branding_credential_register(text,text,timestamptz) from public,anon,authenticated,service_role,branding_proxy,branding_validator,branding_definer;
revoke all on function app_private.branding_credential_set_enabled(text,boolean,boolean) from public,anon,authenticated,service_role,branding_proxy,branding_validator,branding_definer;
revoke all on function app_private.branding_credential_allowed(text) from public,anon,authenticated,service_role,branding_proxy,branding_validator,branding_definer;
revoke all on function public.registration_link_open(text) from public,anon,authenticated,service_role,branding_proxy,branding_validator,branding_definer;
revoke all on function app_private.branding_render_handles_cleanup(integer) from public,anon,authenticated,service_role,branding_proxy,branding_validator,branding_definer;
revoke all on function app_private.branding_asset_context(text,text,text) from public,anon,authenticated,service_role,branding_proxy,branding_validator,branding_definer;
revoke all on function public.registration_brand_asset_resolve(text,text,text) from public,anon,authenticated,service_role,branding_proxy,branding_validator,branding_definer;
revoke all on function app_private.branding_storage_read_allowed(text,text) from public,anon,authenticated,service_role,branding_proxy,branding_validator,branding_definer;
grant execute on function app_private.branding_credential_allowed(text) to branding_proxy,branding_validator,branding_definer;
grant execute on function app_private.branding_asset_context(text,text,text) to branding_definer;
grant execute on function public.registration_link_open(text) to anon,authenticated;
grant execute on function public.registration_brand_asset_resolve(text,text,text) to branding_proxy;
grant execute on function app_private.branding_storage_read_allowed(text,text) to branding_proxy;

-- Supabase migrations run as postgres. Grant SET ROLE only during ownership transfer.
grant branding_definer to postgres;
alter function app_private.branding_credential_event_immutable() owner to branding_definer;
alter function app_private.branding_credential_register(text,text,timestamptz) owner to branding_definer;
alter function app_private.branding_credential_set_enabled(text,boolean,boolean) owner to branding_definer;
alter function app_private.branding_credential_allowed(text) owner to branding_definer;
alter function public.registration_link_open(text) owner to branding_definer;
alter function app_private.branding_render_handles_cleanup(integer) owner to branding_definer;
alter function app_private.branding_asset_context(text,text,text) owner to branding_definer;
alter function public.registration_brand_asset_resolve(text,text,text) owner to branding_definer;
alter function app_private.branding_storage_read_allowed(text,text) owner to branding_definer;
set role branding_definer;
grant execute on function app_private.branding_credential_register(text,text,timestamptz) to postgres;
grant execute on function app_private.branding_credential_set_enabled(text,boolean,boolean) to postgres;
grant execute on function app_private.branding_render_handles_cleanup(integer) to postgres;
reset role;
revoke branding_definer from postgres;

revoke create on schema public, app_private from branding_definer;
revoke all on app_private.branding_credentials,app_private.branding_credential_events,
  app_private.branding_render_handles,app_private.branding_current_publications,
  app_private.branding_published_assets from public,anon,authenticated,service_role,
  branding_proxy,branding_validator;
revoke all on sequence app_private.branding_credential_events_id_seq from public,anon,
  authenticated,service_role,branding_proxy,branding_validator;
revoke all on public.registration_links,public.workspaces from branding_definer;
grant select,update (opened_at) on public.registration_links to branding_definer;
grant select on public.workspaces to branding_definer;

-- T049 durable validation operations. These tables are not directly exposed to API roles.
create table app_private.branding_uploads (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  role text not null check (role in ('logo','banner')),
  draft_revision bigint not null check (draft_revision >= 0),
  staging_bucket text not null check (staging_bucket = 'branding-staging'),
  staging_object text not null,
  status text not null check (status in ('staging','validating','validated','promoted','attaching','attached','attachment_failed_stale','interrupted','reconciliation_pending','failed','cleaned')),
  validated_bucket text,
  validated_object text,
  validated_sha256 text check (validated_sha256 is null or validated_sha256 ~ '^[0-9a-f]{64}$'),
  validated_size bigint check (validated_size is null or validated_size > 0),
  validator_credential_hash text check (validator_credential_hash is null or validator_credential_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (workspace_id,id),
  unique (staging_bucket,staging_object),
  check ((status in ('validated','promoted','attaching','attached','attachment_failed_stale')) = (validated_object is not null and validated_sha256 is not null and validated_size is not null and validator_credential_hash is not null))
);

create table app_private.branding_validation_receipts (
  id uuid primary key,
  workspace_id uuid not null,
  upload_id uuid not null unique references app_private.branding_uploads(id) on delete restrict,
  staging_bucket text not null,
  staging_object text not null,
  validated_bucket text not null,
  validated_object text not null,
  output_sha256 text not null check (output_sha256 ~ '^[0-9a-f]{64}$'),
  output_size bigint not null check (output_size > 0),
  content_type text not null check (content_type in ('image/png','image/webp')),
  credential_hash text not null check (credential_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  foreign key (workspace_id,upload_id) references app_private.branding_uploads(workspace_id,id) on delete restrict,
  unique (workspace_id,validated_bucket,validated_object)
);

alter table app_private.branding_uploads enable row level security;
alter table app_private.branding_uploads force row level security;
alter table app_private.branding_validation_receipts enable row level security;
alter table app_private.branding_validation_receipts force row level security;
create policy branding_definer_internal on app_private.branding_uploads to branding_definer using (true) with check (true);
create policy branding_definer_internal on app_private.branding_validation_receipts to branding_definer using (true) with check (true);
create policy branding_operator_internal on app_private.branding_uploads to postgres using (true) with check (true);
create policy branding_operator_internal on app_private.branding_validation_receipts to postgres using (true) with check (true);
grant select,insert,update,delete on app_private.branding_uploads,app_private.branding_validation_receipts to branding_definer;
grant select,insert,update,delete on app_private.branding_uploads,app_private.branding_validation_receipts to postgres;
revoke all on app_private.branding_uploads,app_private.branding_validation_receipts from public,anon,authenticated,service_role,branding_proxy,branding_validator;

create function app_private.branding_validation_prepare(upload_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u app_private.branding_uploads%rowtype; h text; claims jsonb;
begin
  if not app_private.branding_credential_allowed('branding_validator') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
  h:=encode(extensions.digest(claims->>'credential_id','sha256'),'hex');
  select * into u from app_private.branding_uploads where id=branding_validation_prepare.upload_id for update;
  if not found then raise exception using errcode='42501',message='not_permitted'; end if;
  if u.status='validating' and u.validator_credential_hash=h then return; end if;
  if u.status<>'staging' or u.staging_object<>u.workspace_id::text||'/staging/'||u.id::text then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  update app_private.branding_uploads set status='validating',validator_credential_hash=h,updated_at=statement_timestamp()
    where id=u.id;
end;
$$;
grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
alter function app_private.branding_validation_prepare(uuid) owner to branding_definer;
set role branding_definer;
revoke all on function app_private.branding_validation_prepare(uuid) from public,anon,authenticated,service_role,branding_proxy,branding_validator;
grant execute on function app_private.branding_validation_prepare(uuid) to branding_validator;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;

create function app_private.branding_validation_complete(upload_id uuid,staging_object text,validated_bucket text,validated_object text,output_sha256 text,output_size bigint,content_type text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u app_private.branding_uploads%rowtype; c jsonb; h text; receipt_id uuid;
begin
  if not app_private.branding_credential_allowed('branding_validator') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  c:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
  h:=encode(extensions.digest(c->>'credential_id','sha256'),'hex');
  if output_sha256 is null or output_sha256 !~ '^[0-9a-f]{64}$' or output_size is null or output_size<=0
    or content_type is null or content_type not in ('image/png','image/webp') or validated_bucket is distinct from 'branding-validated' then
    raise exception using errcode='22023',message='invalid_validation_receipt';
  end if;
  select * into u from app_private.branding_uploads where id=branding_validation_complete.upload_id for update;
  if not found or staging_object is distinct from u.staging_object or u.staging_object<>u.workspace_id::text||'/staging/'||u.id::text
    or u.status not in ('validating','validated') or u.validator_credential_hash is distinct from h
    or validated_object !~ ('^'||u.workspace_id::text||'/validated/'||u.role||'/'||output_sha256||'[.](png|webp)$')
    or (content_type='image/png' and right(validated_object,4)<>'.png')
    or (content_type='image/webp' and right(validated_object,5)<>'.webp') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select r.id into receipt_id from app_private.branding_validation_receipts r where r.upload_id=u.id;
  if found then
    if exists(select 1 from app_private.branding_validation_receipts r where r.id=receipt_id and r.staging_object=branding_validation_complete.staging_object
      and r.validated_bucket=branding_validation_complete.validated_bucket and r.validated_object=branding_validation_complete.validated_object
      and r.output_sha256=branding_validation_complete.output_sha256 and r.output_size=branding_validation_complete.output_size
      and r.content_type=branding_validation_complete.content_type and r.credential_hash=h) then return receipt_id; end if;
    raise exception using errcode='23505',message='validation_receipt_conflict';
  end if;
  receipt_id:=extensions.gen_random_uuid();
  insert into app_private.branding_validation_receipts(id,workspace_id,upload_id,staging_bucket,staging_object,validated_bucket,validated_object,output_sha256,output_size,content_type,credential_hash)
    values(receipt_id,u.workspace_id,u.id,u.staging_bucket,u.staging_object,validated_bucket,validated_object,output_sha256,output_size,content_type,h);
  update app_private.branding_uploads set status='validated',validated_bucket=branding_validation_complete.validated_bucket,
    validated_object=branding_validation_complete.validated_object,validated_sha256=branding_validation_complete.output_sha256,
    validated_size=branding_validation_complete.output_size,updated_at=statement_timestamp() where id=u.id;
  return receipt_id;
end;
$$;
grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
alter function app_private.branding_validation_complete(uuid,text,text,text,text,bigint,text) owner to branding_definer;
set role branding_definer;
revoke all on function app_private.branding_validation_complete(uuid,text,text,text,text,bigint,text) from public,anon,authenticated,service_role,branding_proxy,branding_validator;
grant execute on function app_private.branding_validation_complete(uuid,text,text,text,text,bigint,text) to branding_validator;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;

-- The validator can create immutable validated objects; it has no read, update, or delete policy.
grant usage on schema storage to branding_validator;
grant insert on storage.objects to branding_validator;
create policy branding_validator_insert_validated on storage.objects for insert to branding_validator
  with check (bucket_id='branding-validated' and name ~ '^[0-9a-f-]{36}/validated/(logo|banner)/[0-9a-f]{64}[.](png|webp)$'
    and app_private.branding_credential_allowed('branding_validator'));
