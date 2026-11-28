-- CR-030-01 (S74): record_po_export_retrieval must fail closed when the done
-- job's payload has no (or an unusable) expires_at. The original condition
-- `false OR NULL` is NULL, which PL/pgSQL treats as false, so a repaired /
-- partial done job leaked the private artifact path and wrote a retrieval
-- audit row even though read_po_client_export_status reported 'expired'.
-- This forward migration copies the latest function body byte-for-byte except
-- that condition, which now uses the same coalesce(..., true) fail-closed form
-- as read_po_client_export_status.
create or replace function public.record_po_export_retrieval(p_job_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare job public.jobs%rowtype; actor uuid := auth.uid(); ws uuid; object_path text;
begin
  if actor is null or not app_private.is_platform_owner() then
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
  perform app_private.po_export_audit(p_job_id,'po_export.retrieved',actor,ws,'downloaded');
  return object_path;
end;
$$;
alter function public.record_po_export_retrieval(uuid) owner to postgres;
revoke all on function public.record_po_export_retrieval(uuid) from public, anon, service_role;
grant execute on function public.record_po_export_retrieval(uuid) to authenticated;
