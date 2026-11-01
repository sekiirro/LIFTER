-- Keep service-role execution limited to the public GC API while the
-- SECURITY DEFINER wrappers cross into the private schema as branding_definer.
revoke usage on schema app_private from service_role;

grant create on schema public to branding_definer;
grant branding_definer to postgres;
alter function public.branding_gc_claim(integer) owner to branding_definer;
alter function public.branding_gc_finalize(uuid) owner to branding_definer;

set role branding_definer;

create or replace function public.branding_gc_claim(batch_size integer)
returns table(id uuid,workspace_id uuid,bucket_id text,object_name text,lease_until timestamptz)
language sql security definer set search_path='' as $$
  select * from app_private.branding_gc_claim(
    greatest(1,least(coalesce(batch_size,10),50))
  );
$$;

create or replace function public.branding_gc_finalize(claim_id uuid)
returns boolean
language sql security definer set search_path='' as $$
  select app_private.branding_gc_finalize(claim_id);
$$;

reset role;
revoke branding_definer from postgres;
revoke create on schema public from branding_definer;

revoke all on function public.branding_gc_claim(integer),public.branding_gc_finalize(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.branding_gc_claim(integer),public.branding_gc_finalize(uuid)
  to service_role;
