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
    $old$or char_length(fields->'name'->>'en')>1000$old$,
    $new$or char_length(fields->'name'->>'en')>1000
    or ((fields->'name'->>'ar') !~ '[^[:space:]]'
      and (fields->'name'->>'en') !~ '[^[:space:]]')$new$
  );
  if patched=definition then
    raise exception 'branding_draft_save nonblank-name target not found';
  end if;
  execute patched;
end;
$migration$;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;
