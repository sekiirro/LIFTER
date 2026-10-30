-- T049/T050 restricted owner needs verified actor identity and byte-existence checks.
grant usage on schema storage to branding_definer;
grant select on storage.objects to branding_definer;
create policy branding_gc_definer_read on storage.objects for select to branding_definer
  using(bucket_id='branding-validated');
