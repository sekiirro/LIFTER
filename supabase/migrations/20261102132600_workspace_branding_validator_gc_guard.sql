-- T050: validator Storage inserts must not recreate bytes under a deleting claim.
grant usage on schema app_private to branding_definer;
grant select on app_private.branding_gc_claims to branding_definer;
grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
create function app_private.branding_validator_upload_binding_matches_gc(object_name text)
returns boolean language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare claims jsonb; credential_hash text; ws_id uuid;
begin
  if not app_private.branding_credential_allowed('branding_validator') then return false; end if;
  claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
  credential_hash:=encode(extensions.digest(claims->>'credential_id','sha256'),'hex');
  begin ws_id:=split_part(branding_validator_upload_binding_matches_gc.object_name,'/',1)::uuid;
  exception when invalid_text_representation then return false;
  end;
  return exists(select 1 from app_private.branding_uploads u where u.workspace_id=ws_id
    and split_part(branding_validator_upload_binding_matches_gc.object_name,'/',2)='validated'
    and u.role=split_part(branding_validator_upload_binding_matches_gc.object_name,'/',3)
    and u.status='validating' and u.validator_credential_hash=credential_hash)
    and not exists(select 1 from app_private.branding_gc_claims g
      where g.workspace_id=ws_id and g.bucket_id='branding-validated'
        and g.object_name=branding_validator_upload_binding_matches_gc.object_name and g.lease_until>statement_timestamp());
end;
$$;
revoke all on function app_private.branding_validator_upload_binding_matches_gc(text)
  from public,anon,authenticated,service_role,branding_proxy,branding_validator,branding_definer,branding_upload_check_definer;
grant execute on function app_private.branding_validator_upload_binding_matches_gc(text) to branding_validator;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;
drop policy branding_validator_insert_validated on storage.objects;
create policy branding_validator_insert_validated on storage.objects for insert to branding_validator
  with check(bucket_id='branding-validated' and name ~ '^[0-9a-f-]{36}/validated/(logo|banner)/[0-9a-f]{64}[.](png|webp)$'
    and app_private.branding_credential_allowed('branding_validator')
    and app_private.branding_validator_upload_binding_matches_gc(name));
