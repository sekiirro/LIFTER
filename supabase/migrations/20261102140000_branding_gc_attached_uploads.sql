-- Attached uploads that become unreferenced must remain eligible for GC.
-- Extend the already-deployed GC functions without changing their guards.
grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
do $migration$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef('app_private.branding_gc_claim(integer)'::regprocedure)
    into definition;
  patched := regexp_replace(
    definition,
    $$('staging','validating','validated','promoted','attaching',\s*)'attachment_failed_stale'$$,
    E'\\1''attached'',''attachment_failed_stale''',
    'g'
  );
  patched := regexp_replace(
    patched,
    $$('validated','promoted','attaching',\s*)'attachment_failed_stale'$$,
    E'\\1''attached'',''attachment_failed_stale''',
    'g'
  );
  if patched = definition then
    raise exception 'branding_gc_claim definition did not match expected status lists';
  end if;
  execute patched;

  select pg_get_functiondef('app_private.branding_gc_finalize(uuid)'::regprocedure)
    into definition;
  patched := regexp_replace(
    definition,
    $$('staging','validating','validated','promoted','attaching',\s*)'attachment_failed_stale'$$,
    E'\\1''attached'',''attachment_failed_stale''',
    'g'
  );
  if patched = definition then
    raise exception 'branding_gc_finalize definition did not match expected status lists';
  end if;
  execute patched;
end;
$migration$;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;
