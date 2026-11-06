-- S33 convergence: use complete intended function bodies, never regex patching.
-- Preserve the existing function owner and ACL by replacing functions as their owner.
-- The temporary membership is removed in this transaction before it can persist.
grant create on schema app_private to branding_definer;
grant branding_definer to postgres with set true;
set local role branding_definer;
CREATE OR REPLACE FUNCTION app_private.branding_asset_attach(upload_id uuid, expected_revision bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare u app_private.branding_uploads%rowtype; d app_private.branding_drafts%rowtype;
  receipt app_private.branding_validation_receipts%rowtype; next_fields jsonb; actor uuid:=app_private.branding_actor_id();
begin
  if current_setting('role',true) is distinct from 'authenticated' or actor is null then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select * into u from app_private.branding_uploads where id=branding_asset_attach.upload_id for update;
  if not found or u.started_by is distinct from actor or not app_private.has_workspace_access(u.workspace_id,'manage_branding') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select * into d from app_private.branding_drafts where workspace_id=u.workspace_id for update;
  if not found or d.revision<>expected_revision or u.draft_revision<>expected_revision or u.status<>'validated' then
    
    raise exception using errcode='40001',message='stale_branding_upload';
  end if;
  select * into receipt from app_private.branding_validation_receipts where upload_id=u.id;
  if not found or receipt.workspace_id<>u.workspace_id or receipt.staging_object<>u.staging_object
    or receipt.validated_bucket<>u.validated_bucket or receipt.validated_object<>u.validated_object
    or receipt.output_sha256<>u.validated_sha256 or receipt.output_size<>u.validated_size then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  perform app_private.branding_gc_lock_object(u.validated_bucket,u.validated_object);
  if exists(select 1 from app_private.branding_gc_claims g where g.bucket_id=u.validated_bucket
      and g.object_name=u.validated_object) then
    raise exception using errcode='40001',message='branding_deletion_in_progress';
  end if;
  next_fields:=jsonb_set(d.fields,array[u.role],jsonb_build_object('bucket',u.validated_bucket,'object',u.validated_object,
    'sha256',u.validated_sha256,'byte_size',u.validated_size,'content_type',receipt.content_type),true);
  update app_private.branding_drafts set fields=next_fields,revision=revision+1,updated_by=actor,updated_at=statement_timestamp()
    where workspace_id=d.workspace_id;
  update app_private.branding_uploads set status='attached',updated_at=statement_timestamp() where id=u.id;
  return d.revision+1;
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.branding_gc_claim(batch_size integer)
 RETURNS TABLE(id uuid, workspace_id uuid, bucket_id text, object_name text, lease_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare candidate record; claimed app_private.branding_gc_claims%rowtype;
begin
  if (session_user<>'postgres' and current_setting('role',true) is distinct from 'service_role')
    or batch_size is null or batch_size<1 or batch_size>50 then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  for candidate in
    select x.workspace_id,x.bucket_id,x.object_name
    from (
      select a.workspace_id,a.bucket_id,a.object_name,
        coalesce(v.published_at,statement_timestamp()) as candidate_at
      from app_private.branding_published_assets a
      join app_private.branding_published_versions v on v.workspace_id=a.workspace_id and v.id=a.version_id
      left join app_private.branding_current_publications c on c.workspace_id=v.workspace_id and c.version_id=v.id
      left join app_private.branding_drafts d on d.workspace_id=a.workspace_id
      where a.bucket_id='branding-validated'
        and a.object_name ~ ('^'||a.workspace_id::text||'/validated/(logo|banner)/[0-9a-f]{64}(-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})?[.](png|webp)$')
        and c.version_id is null
        and not exists(select 1 from jsonb_each(case when jsonb_typeof(d.fields)='object' then d.fields else '{}'::jsonb end) f
          where f.value->>'bucket'=a.bucket_id and f.value->>'object'=a.object_name)
        and not exists(select 1 from app_private.branding_uploads u where u.workspace_id=a.workspace_id
          and u.validated_bucket=a.bucket_id and u.validated_object=a.object_name
          and u.status in ('validating','validated','promoted','attaching','reconciliation_pending','interrupted'))
      group by a.workspace_id,a.bucket_id,a.object_name,v.published_at

      union

      select u.workspace_id,u.staging_bucket,u.staging_object,u.updated_at
      from app_private.branding_uploads u
      where u.status in ('staging','validating','validated','promoted','attaching',
          'attached','attachment_failed_stale','interrupted','failed')
        and u.updated_at<=statement_timestamp()-interval '30 minutes'
        and u.staging_bucket='branding-staging'
        and u.staging_object=u.workspace_id::text||'/staging/'||u.id::text
        and (
          exists(select 1 from storage.objects o
            where o.bucket_id=u.staging_bucket and o.name=u.staging_object)
          or u.validated_bucket is null or u.validated_object is null
          or not exists(select 1 from storage.objects o
            where o.bucket_id=u.validated_bucket and o.name=u.validated_object)
        )
        and not exists(select 1 from app_private.branding_drafts d,jsonb_each(case when jsonb_typeof(d.fields)='object' then d.fields else '{}'::jsonb end) f
          where d.workspace_id=u.workspace_id and f.value->>'bucket'=u.validated_bucket
            and f.value->>'object'=u.validated_object)
        and not exists(select 1 from app_private.branding_published_assets a
          where a.workspace_id=u.workspace_id and a.bucket_id=u.validated_bucket
            and a.object_name=u.validated_object)

      union

      select u.workspace_id,u.validated_bucket,u.validated_object,u.updated_at
      from app_private.branding_uploads u
      where u.status in ('validated','promoted','attaching','attached','attachment_failed_stale','interrupted')
        and u.updated_at<=statement_timestamp()-interval '30 minutes'
        and u.validated_bucket='branding-validated'
        and u.validated_object ~ ('^'||u.workspace_id::text||'/validated/'||u.role||'/[0-9a-f]{64}(-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})?[.](png|webp)$')
        and not exists(select 1 from app_private.branding_drafts d,jsonb_each(case when jsonb_typeof(d.fields)='object' then d.fields else '{}'::jsonb end) f
          where d.workspace_id=u.workspace_id and f.value->>'bucket'=u.validated_bucket
            and f.value->>'object'=u.validated_object)
        and not exists(select 1 from app_private.branding_published_assets a
          where a.workspace_id=u.workspace_id and a.bucket_id=u.validated_bucket
            and a.object_name=u.validated_object)
    ) x
    where not exists(select 1 from app_private.branding_gc_claims g
      where g.bucket_id=x.bucket_id and g.object_name=x.object_name
        and g.lease_until>statement_timestamp())
    order by x.candidate_at,x.workspace_id,x.bucket_id,x.object_name
    limit batch_size
  loop
    perform app_private.branding_gc_lock_object(candidate.bucket_id,candidate.object_name);
    if exists(select 1 from app_private.branding_gc_claims g where g.bucket_id=candidate.bucket_id
        and g.object_name=candidate.object_name and g.lease_until>statement_timestamp())
      or exists(select 1 from app_private.branding_current_publications c
        join app_private.branding_published_assets a on a.workspace_id=c.workspace_id and a.version_id=c.version_id
        where a.workspace_id=candidate.workspace_id and a.bucket_id=candidate.bucket_id
          and a.object_name=candidate.object_name)
      or exists(select 1 from app_private.branding_drafts d,jsonb_each(case when jsonb_typeof(d.fields)='object' then d.fields else '{}'::jsonb end) f
        where d.workspace_id=candidate.workspace_id and f.value->>'bucket'=candidate.bucket_id
          and f.value->>'object'=candidate.object_name)
      or exists(select 1 from app_private.branding_uploads u
        where u.workspace_id=candidate.workspace_id
          and u.status in ('staging','validating','validated','promoted','attaching','reconciliation_pending','interrupted')
          and u.updated_at>statement_timestamp()-interval '30 minutes'
          and ((u.staging_bucket=candidate.bucket_id and u.staging_object=candidate.object_name)
            or (u.validated_bucket=candidate.bucket_id and u.validated_object=candidate.object_name))) then
      continue;
    end if;
    insert into app_private.branding_gc_claims(workspace_id,bucket_id,object_name,lease_until)
      values(candidate.workspace_id,candidate.bucket_id,candidate.object_name,
        statement_timestamp()+interval '5 minutes')
      on conflict on constraint branding_gc_claims_bucket_id_object_name_key do update
        set workspace_id=excluded.workspace_id,lease_until=excluded.lease_until,created_at=statement_timestamp()
        where app_private.branding_gc_claims.lease_until<=statement_timestamp()
      returning * into claimed;
    if found then
      insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
        values(null,'branding.gc_claimed','branding_gc_claims',claimed.id,claimed.workspace_id,
          jsonb_build_object('lease_seconds',300));
      id:=claimed.id; workspace_id:=claimed.workspace_id; bucket_id:=claimed.bucket_id;
      object_name:=claimed.object_name; lease_until:=claimed.lease_until;
      return next;
    end if;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.branding_gc_finalize(claim_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g app_private.branding_gc_claims%rowtype;
begin
  if session_user<>'postgres' and current_setting('role',true) is distinct from 'service_role' then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select * into g from app_private.branding_gc_claims
    where id=branding_gc_finalize.claim_id for update;
  if not found or g.lease_until<=statement_timestamp() then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  if exists(select 1 from app_private.branding_current_publications c
      join app_private.branding_published_assets a on a.workspace_id=c.workspace_id and a.version_id=c.version_id
      where a.workspace_id=g.workspace_id and a.bucket_id=g.bucket_id and a.object_name=g.object_name)
    or exists(select 1 from app_private.branding_drafts d,jsonb_each(case when jsonb_typeof(d.fields)='object' then d.fields else '{}'::jsonb end) f
      where d.workspace_id=g.workspace_id and f.value->>'bucket'=g.bucket_id and f.value->>'object'=g.object_name)
    or exists(select 1 from app_private.branding_uploads u where u.workspace_id=g.workspace_id
      and u.status in ('staging','validating','validated','promoted','attaching','reconciliation_pending','interrupted')
      and u.updated_at>statement_timestamp()-interval '30 minutes'
      and ((u.staging_bucket=g.bucket_id and u.staging_object=g.object_name)
        or (u.validated_bucket=g.bucket_id and u.validated_object=g.object_name))) then
    raise exception using errcode='40001',message='branding_asset_referenced';
  end if;
  if exists(select 1 from storage.objects o where o.bucket_id=g.bucket_id and o.name=g.object_name) then
    raise exception using errcode='40001',message='branding_object_bytes_not_deleted';
  end if;
  delete from app_private.branding_published_assets a where a.workspace_id=g.workspace_id
    and a.bucket_id=g.bucket_id and a.object_name=g.object_name;
  delete from app_private.branding_published_versions v where v.workspace_id=g.workspace_id
    and not exists(select 1 from app_private.branding_current_publications c
      where c.workspace_id=v.workspace_id and c.version_id=v.id)
    and not exists(select 1 from app_private.branding_published_assets a
      where a.workspace_id=v.workspace_id and a.version_id=v.id);
  update app_private.branding_uploads u
    set status='cleaned',validated_bucket=null,validated_object=null,validated_sha256=null,
      validated_size=null,validator_credential_hash=null,updated_at=statement_timestamp()
    where u.workspace_id=g.workspace_id
      and u.status in ('staging','validating','validated','promoted','attaching',
        'attached','attachment_failed_stale','interrupted','failed')
      and u.updated_at<=statement_timestamp()-interval '30 minutes'
      and not exists(select 1 from storage.objects o where o.bucket_id=u.staging_bucket and o.name=u.staging_object)
      and (u.validated_bucket is null or u.validated_object is null or not exists(
        select 1 from storage.objects o where o.bucket_id=u.validated_bucket and o.name=u.validated_object))
      and not exists(select 1 from app_private.branding_drafts d,jsonb_each(case when jsonb_typeof(d.fields)='object' then d.fields else '{}'::jsonb end) f
        where d.workspace_id=u.workspace_id and f.value->>'bucket'=u.validated_bucket
          and f.value->>'object'=u.validated_object)
      and not exists(select 1 from app_private.branding_published_assets a
        where a.workspace_id=u.workspace_id and a.bucket_id=u.validated_bucket
          and a.object_name=u.validated_object);
  delete from app_private.branding_gc_claims where id=g.id;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(null,'branding.gc_finalized','branding_gc_claims',g.id,g.workspace_id,'{}'::jsonb);
  return true;
end;
$function$;

do $assert_branding_function_convergence$
declare
  claim_body text := lower(pg_get_functiondef('app_private.branding_gc_claim(integer)'::regprocedure));
  finalize_body text := lower(pg_get_functiondef('app_private.branding_gc_finalize(uuid)'::regprocedure));
  attach_body text := lower(pg_get_functiondef('app_private.branding_asset_attach(uuid,bigint)'::regprocedure));
begin
  if position('''attached''' in claim_body) = 0 then
    raise exception 'branding_gc_claim convergence marker missing: attached';
  end if;
  if position('''attached''' in finalize_body) = 0 or position('set status=''cleaned''' in finalize_body) = 0 then
    raise exception 'branding_gc_finalize convergence markers missing: attached cleanup';
  end if;
  if position('update app_private.branding_uploads set status=''attached''' in attach_body) = 0 then
    raise exception 'branding_asset_attach convergence marker missing: attached transition';
  end if;
  if position('set status=''attachment_failed_stale''' in attach_body) > 0 then
    raise exception 'branding_asset_attach contains the removed dead attachment-failure write';
  end if;
end;
$assert_branding_function_convergence$;
reset role;
revoke branding_definer from postgres granted by postgres;
revoke create on schema app_private from branding_definer granted by postgres;
