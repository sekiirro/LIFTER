-- Include each upload generation in the immutable content-addressed path so
-- a stale GC worker can never delete a later upload of identical bytes.
alter table app_private.branding_gc_claims
  drop constraint branding_gc_claims_bucket_id_check,
  add constraint branding_gc_claims_bucket_id_check check (
    bucket_id='branding-validated'
    and object_name ~ ('^'||workspace_id::text||'/validated/(logo|banner)/[0-9a-f]{64}(-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})?[.](png|webp)$')
    or bucket_id='branding-staging'
      and object_name ~ ('^'||workspace_id::text||'/staging/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$')
  );

alter table app_private.branding_published_assets
  drop constraint branding_published_assets_object_path,
  add constraint branding_published_assets_object_path check (
    object_name ~ ('^'||workspace_id::text||'/[0-9a-f]{64}[.](png|webp)$')
    or object_name ~ ('^'||workspace_id::text||'/validated/'||slot||'/[0-9a-f]{64}(-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})?[.](png|webp)$')
  );

grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
do $migration$
declare definition text; patched text;
begin
  select pg_get_functiondef(
    'app_private.branding_validation_complete(uuid,text,text,text,text,bigint,text)'::regprocedure
  ) into definition;
  patched:=replace(
    definition,
    $$output_sha256||'[.](png|webp)$')$$,
    $$output_sha256||'-'||u.id::text||'[.](png|webp)$')$$
  );
  if patched=definition then
    raise exception 'branding_validation_complete path check did not match';
  end if;
  execute patched;

  select pg_get_functiondef('app_private.branding_gc_claim(integer)'::regprocedure)
    into definition;
  patched:=replace(
    definition,
    '[0-9a-f]{64}[.](png|webp)$',
    '[0-9a-f]{64}(-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})?[.](png|webp)$'
  );
  if patched=definition then
    raise exception 'branding_gc_claim path checks did not match';
  end if;
  execute patched;
end;
$migration$;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;

drop policy branding_validator_insert_validated on storage.objects;
create policy branding_validator_insert_validated on storage.objects
  for insert to branding_validator
  with check (
    bucket_id='branding-validated'
    and name ~ '^[0-9a-f-]{36}/validated/(logo|banner)/[0-9a-f]{64}-[0-9a-f-]{36}[.](png|webp)$'
    and app_private.branding_credential_allowed('branding_validator')
    and app_private.branding_validator_upload_binding_matches_gc(name)
  );
