-- Remove the upload-binding privilege path superseded by migration 20261102125000.
drop policy if exists branding_upload_binding_definer_internal
  on app_private.branding_uploads;

drop function if exists app_private.branding_validator_upload_matches(text);

revoke all on app_private.branding_uploads
  from branding_upload_binding_definer;
revoke all on schema app_private, extensions
  from branding_upload_binding_definer;
revoke all on function extensions.digest(text, text)
  from branding_upload_binding_definer;
revoke create on schema app_private
  from branding_upload_binding_definer;

do $$
declare
  binding_role oid;
begin
  select oid into binding_role
  from pg_catalog.pg_roles
  where rolname = 'branding_upload_binding_definer';

  if binding_role is null then
    return;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_shdepend d
    where d.refclassid = 'pg_catalog.pg_authid'::regclass
      and d.refobjid = binding_role
      and d.deptype = 'o'
  ) then
    raise exception 'Superseded branding upload binding role still owns objects';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_auth_members m
    where m.roleid = binding_role or m.member = binding_role
  ) then
    raise exception 'Superseded branding upload binding role still has memberships';
  end if;
end;
$$;

drop role if exists branding_upload_binding_definer;
