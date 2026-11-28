-- NB-030-04 follow-up: only the server-side download route can append a failed
-- retrieval outcome after private storage delivery reports a failure.
create or replace function public.record_po_export_retrieval_failure(p_job_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare job public.jobs%rowtype; actor uuid := auth.uid(); ws uuid; object_path text;
begin
  -- Service-role callers derive the audited actor from the done export job.
  -- Authenticated callers retain the original current-PO guard, but have no
  -- EXECUTE grant after this migration.
  if auth.role() = 'service_role' then
    select (j.payload->>'actor_user_id')::uuid into actor from public.jobs j
      where j.id=p_job_id and j.kind='po.export' and j.status='done';
    if actor is null then raise exception 'not_found' using errcode = '42501'; end if;
  elsif actor is null or not app_private.is_platform_owner() then
    raise exception 'not_found' using errcode = '42501';
  end if;
  select * into job from public.jobs j where j.id=p_job_id and j.kind='po.export'
    and j.status='done' and (j.payload->>'actor_user_id')::uuid=actor;
  if not found or coalesce((job.payload->>'expires_at')::timestamptz <= clock_timestamp(), true) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  ws := nullif(job.payload->>'scope_workspace_id','')::uuid;
  object_path := job.payload->>'artifact_path';
  if object_path is null then raise exception 'not_found' using errcode = '42501'; end if;
  perform app_private.po_export_audit(p_job_id,'po_export.retrieved',actor,ws,'failed');
end;
$$;
alter function public.record_po_export_retrieval_failure(uuid) owner to postgres;
revoke all on function public.record_po_export_retrieval_failure(uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_po_export_retrieval_failure(uuid) to service_role;
