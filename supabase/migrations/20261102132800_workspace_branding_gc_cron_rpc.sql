-- T050: expose only the bounded GC operations to the service-role cron worker.
grant usage on schema app_private to service_role;

create or replace function public.branding_gc_claim(batch_size integer)
returns table(id uuid,workspace_id uuid,bucket_id text,object_name text,lease_until timestamptz)
language sql security invoker set search_path='' as $$
  select * from app_private.branding_gc_claim(batch_size);
$$;

create or replace function public.branding_gc_finalize(claim_id uuid)
returns boolean
language sql security invoker set search_path='' as $$
  select app_private.branding_gc_finalize(claim_id);
$$;

revoke all on function public.branding_gc_claim(integer),public.branding_gc_finalize(uuid) from public,anon,authenticated;
grant execute on function public.branding_gc_claim(integer),public.branding_gc_finalize(uuid) to service_role;
