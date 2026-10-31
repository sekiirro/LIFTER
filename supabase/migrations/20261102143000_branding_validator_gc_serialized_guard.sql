drop policy branding_validator_insert_validated on storage.objects;
create policy branding_validator_insert_validated on storage.objects
  for insert to branding_validator
  with check (
    bucket_id='branding-validated'
    and name ~ '^[0-9a-f-]{36}/validated/(logo|banner)/[0-9a-f]{64}-[0-9a-f-]{36}[.](png|webp)$'
    and app_private.branding_credential_allowed('branding_validator')
    and app_private.branding_validator_upload_binding_matches_gc_serialized(name)
  );
