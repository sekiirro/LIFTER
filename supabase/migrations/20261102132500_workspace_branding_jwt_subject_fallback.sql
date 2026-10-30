-- Supabase/PostgREST versions differ in whether the subject is split from claims.
grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
create or replace function app_private.branding_actor_id() returns uuid
language sql stable set search_path='' as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')
  )::uuid
$$;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;
