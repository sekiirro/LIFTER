-- F14b: owner-scoped terminalization of failed branding uploads (S65-R42).
-- Every failure after beginUpload must leave no live staging row behind: the
-- originating workspace owner marks the upload 'failed' and the staged
-- storage object row is removed in the same call. Owners have no storage
-- DELETE policy, so the function runs as postgres (RLS bypass) with the
-- exact workspace-owner authorization of the existing upload RPCs. Terminal
-- states are idempotent no-ops; sibling upload RPCs write no audit events,
-- so this writes none either.

create function app_private.branding_upload_terminalize(upload_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare u app_private.branding_uploads%rowtype;
begin
  if current_setting('role',true) is distinct from 'authenticated'
    or auth.uid() is null then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select * into u from app_private.branding_uploads
    where id=branding_upload_terminalize.upload_id for update;
  if not found or u.started_by is distinct from auth.uid()
    or not app_private.has_workspace_access(u.workspace_id,'manage_branding') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  if u.status in ('attached','attachment_failed_stale','failed','cleaned') then
    return true;
  end if;
  if u.staging_bucket is not distinct from 'branding-staging'
    and u.staging_object=u.workspace_id::text||'/staging/'||u.id::text then
    -- storage.objects carries a BEFORE DELETE guard (storage.protect_delete)
    -- that rejects direct SQL deletes; Supabase's own server-side cleanup
    -- opts in transaction-locally via storage.allow_delete_query.
    perform set_config('storage.allow_delete_query','true',true);
    delete from storage.objects
      where bucket_id=u.staging_bucket and name=u.staging_object;
  end if;
  update app_private.branding_uploads set status='failed',
    updated_at=statement_timestamp() where id=u.id;
  return true;
end;
$$;

alter function app_private.branding_upload_terminalize(uuid) owner to postgres;
revoke all on function app_private.branding_upload_terminalize(uuid)
  from public,anon,authenticated,service_role,branding_proxy,branding_validator;
grant execute on function app_private.branding_upload_terminalize(uuid)
  to authenticated;

create function public.branding_upload_terminalize(upload_id uuid)
returns boolean language sql set search_path='' as $$
  select app_private.branding_upload_terminalize(upload_id)
$$;

revoke all on function public.branding_upload_terminalize(uuid)
  from public,anon,service_role;
grant execute on function public.branding_upload_terminalize(uuid)
  to authenticated;
