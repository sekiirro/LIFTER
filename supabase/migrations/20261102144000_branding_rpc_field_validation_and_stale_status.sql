grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
do $migration$
declare definition text; patched text;
begin
  select pg_get_functiondef(
    'app_private.branding_draft_save(uuid,bigint,jsonb)'::regprocedure
  ) into definition;
  patched:=replace(
    definition,
    $old$or jsonb_typeof(fields->'name')<>'object' or jsonb_typeof(fields->'bannerAlt')<>'object'$old$,
    $new$or jsonb_typeof(fields->'name') is distinct from 'object'
    or jsonb_typeof(fields->'name'->'ar') is distinct from 'string'
    or jsonb_typeof(fields->'name'->'en') is distinct from 'string'
    or char_length(fields->'name'->>'ar')>1000
    or char_length(fields->'name'->>'en')>1000
    or (fields ? 'bannerAlt' and (
      jsonb_typeof(fields->'bannerAlt') is distinct from 'object'
      or jsonb_typeof(fields->'bannerAlt'->'ar') is distinct from 'string'
      or jsonb_typeof(fields->'bannerAlt'->'en') is distinct from 'string'
      or char_length(fields->'bannerAlt'->>'ar')>1000
      or char_length(fields->'bannerAlt'->>'en')>1000
    ))$new$
  );
  if patched=definition then
    raise exception 'branding_draft_save validation target not found';
  end if;
  execute patched;

  select pg_get_functiondef(
    'app_private.branding_asset_attach(uuid,bigint)'::regprocedure
  ) into definition;
  patched:=replace(
    definition,
    $old$update app_private.branding_uploads set status='attachment_failed_stale',updated_at=statement_timestamp() where id=u.id;$old$,
    ''
  );
  if patched=definition then
    raise exception 'branding_asset_attach stale status target not found';
  end if;
  execute patched;
end;
$migration$;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;
