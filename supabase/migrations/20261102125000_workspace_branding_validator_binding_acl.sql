-- Keep credential eligibility in the policy and limit this definer to upload lookup.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'branding_upload_check_definer'
  ) then
    create role branding_upload_check_definer
      nologin nosuperuser nobypassrls noinherit nocreatedb nocreaterole;
  end if;
  if exists (
    select 1 from pg_catalog.pg_roles r
    where r.rolname = 'branding_upload_check_definer'
      and (r.rolcanlogin or r.rolsuper or r.rolbypassrls or r.rolinherit
        or r.rolcreatedb or r.rolcreaterole)
  ) or exists (
    select 1 from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles r on r.oid = m.member
    where r.rolname = 'branding_upload_check_definer'
  ) then
    raise exception 'Branding upload check definer role privilege drift';
  end if;
end;
$$;

grant usage on schema app_private, extensions to branding_upload_check_definer;
grant select on app_private.branding_uploads to branding_upload_check_definer;
create policy branding_upload_check_definer_internal on app_private.branding_uploads
  to branding_upload_check_definer using (true) with check (true);
grant execute on function extensions.digest(text, text) to branding_upload_check_definer;

create function app_private.branding_validator_upload_binding_matches(object_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  credential_hash text;
begin
  claims := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  credential_hash := encode(
    extensions.digest(claims->>'credential_id', 'sha256'),
    'hex'
  );

  return exists (
    select 1
    from app_private.branding_uploads u
    where u.workspace_id::text = split_part(object_name, '/', 1)
      and split_part(object_name, '/', 2) = 'validated'
      and u.role = split_part(object_name, '/', 3)
      and u.status = 'validating'
      and u.validator_credential_hash = credential_hash
  );
end;
$$;

grant create on schema app_private to branding_upload_check_definer;
grant branding_upload_check_definer to postgres;
alter function app_private.branding_validator_upload_binding_matches(text)
  owner to branding_upload_check_definer;
set role branding_upload_check_definer;
revoke all on function app_private.branding_validator_upload_binding_matches(text)
  from public, anon, authenticated, service_role, branding_proxy,
    branding_validator, branding_definer, branding_upload_check_definer;
grant execute on function app_private.branding_validator_upload_binding_matches(text)
  to branding_validator;
reset role;
revoke branding_upload_check_definer from postgres;
revoke create on schema app_private from branding_upload_check_definer;

drop policy branding_validator_insert_validated on storage.objects;
create policy branding_validator_insert_validated on storage.objects
  for insert to branding_validator
  with check (
    bucket_id = 'branding-validated'
    and name ~ '^[0-9a-f-]{36}/validated/(logo|banner)/[0-9a-f]{64}[.](png|webp)$'
    and app_private.branding_credential_allowed('branding_validator')
    and app_private.branding_validator_upload_binding_matches(name)
  );
