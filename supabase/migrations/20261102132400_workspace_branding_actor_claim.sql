-- Avoid widening auth-schema access: the verified JWT subject is already set by PostgREST.
grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
create or replace function app_private.branding_actor_id() returns uuid
language sql stable set search_path='' as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant execute on function app_private.branding_actor_id() to authenticated;

create or replace function app_private.branding_upload_begin(workspace_id uuid,role text,expected_revision bigint)
returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare d app_private.branding_drafts%rowtype; upload_id uuid:=extensions.gen_random_uuid(); object_path text; actor uuid:=app_private.branding_actor_id();
begin
  if current_setting('role',true) is distinct from 'authenticated' or actor is null or role not in ('logo','banner')
    or not app_private.has_workspace_access(workspace_id,'manage_branding') then raise exception using errcode='42501',message='not_permitted'; end if;
  insert into app_private.branding_drafts(workspace_id) values(branding_upload_begin.workspace_id) on conflict do nothing;
  select * into d from app_private.branding_drafts where workspace_id=branding_upload_begin.workspace_id for update;
  if d.revision<>expected_revision then raise exception using errcode='40001',message='stale_branding_revision'; end if;
  if exists(select 1 from app_private.branding_gc_claims g where g.workspace_id=d.workspace_id and g.lease_until>statement_timestamp()) then
    raise exception using errcode='40001',message='branding_deletion_in_progress'; end if;
  object_path:=d.workspace_id::text||'/staging/'||upload_id::text;
  insert into app_private.branding_uploads(id,workspace_id,role,draft_revision,staging_bucket,staging_object,status,started_by)
    values(upload_id,d.workspace_id,branding_upload_begin.role,d.revision,'branding-staging',object_path,'staging',actor);
  return upload_id;
end;
$$;
create or replace function app_private.branding_staging_upload_allowed(bucket text,object_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select current_setting('role',true)='authenticated' and bucket='branding-staging'
    and exists(select 1 from app_private.branding_uploads u where u.staging_bucket=bucket and u.staging_object=object_name
      and u.status in ('staging','interrupted') and u.started_by=app_private.branding_actor_id()
      and app_private.has_workspace_access(u.workspace_id,'manage_branding'))
$$;
create or replace function app_private.branding_draft_save(workspace_id uuid,expected_revision bigint,fields jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare d app_private.branding_drafts%rowtype; next_fields jsonb; actor uuid:=app_private.branding_actor_id();
begin
  if current_setting('role',true) is distinct from 'authenticated' or actor is null
    or not app_private.has_workspace_access(workspace_id,'manage_branding') then raise exception using errcode='42501',message='not_permitted'; end if;
  insert into app_private.branding_drafts(workspace_id) values(branding_draft_save.workspace_id) on conflict do nothing;
  select * into d from app_private.branding_drafts where workspace_id=branding_draft_save.workspace_id for update;
  if d.revision<>expected_revision then raise exception using errcode='40001',message='stale_branding_revision'; end if;
  if exists(select 1 from app_private.branding_gc_claims g where g.workspace_id=d.workspace_id and g.lease_until>statement_timestamp()) then
    raise exception using errcode='40001',message='branding_deletion_in_progress'; end if;
  if jsonb_typeof(fields)<>'object' or fields-array['name','color','bannerAlt','logo','banner']<>'{}'::jsonb
    or jsonb_typeof(fields->'name')<>'object' or jsonb_typeof(fields->'bannerAlt')<>'object'
    or (fields ? 'logo' and fields->'logo'<>'null'::jsonb)
    or (fields ? 'banner' and fields->'banner'<>'null'::jsonb)
    or coalesce(fields->>'color','') !~ '^#[0-9A-Fa-f]{6}$' then raise exception using errcode='22023',message='invalid_branding_fields'; end if;
  next_fields:=d.fields||fields;
  update app_private.branding_drafts set fields=next_fields,revision=revision+1,updated_by=actor,updated_at=statement_timestamp()
    where workspace_id=d.workspace_id;
  return d.revision+1;
end;
$$;
create or replace function app_private.branding_asset_attach(upload_id uuid,expected_revision bigint)
returns bigint language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare u app_private.branding_uploads%rowtype; d app_private.branding_drafts%rowtype; receipt app_private.branding_validation_receipts%rowtype;
  next_fields jsonb; actor uuid:=app_private.branding_actor_id();
begin
  if current_setting('role',true) is distinct from 'authenticated' or actor is null then raise exception using errcode='42501',message='not_permitted'; end if;
  select * into u from app_private.branding_uploads where id=branding_asset_attach.upload_id for update;
  if not found or u.started_by is distinct from actor or not app_private.has_workspace_access(u.workspace_id,'manage_branding') then
    raise exception using errcode='42501',message='not_permitted'; end if;
  select * into d from app_private.branding_drafts where workspace_id=u.workspace_id for update;
  if not found or d.revision<>expected_revision or u.draft_revision<>expected_revision or u.status<>'validated' then
    update app_private.branding_uploads set status='attachment_failed_stale',updated_at=statement_timestamp() where id=u.id;
    raise exception using errcode='40001',message='stale_branding_upload'; end if;
  select * into receipt from app_private.branding_validation_receipts where upload_id=u.id;
  if not found or receipt.workspace_id<>u.workspace_id or receipt.staging_object<>u.staging_object
    or receipt.validated_bucket<>u.validated_bucket or receipt.validated_object<>u.validated_object
    or receipt.output_sha256<>u.validated_sha256 or receipt.output_size<>u.validated_size then raise exception using errcode='42501',message='not_permitted'; end if;
  if exists(select 1 from app_private.branding_gc_claims g where g.bucket_id=u.validated_bucket and g.object_name=u.validated_object and g.lease_until>statement_timestamp()) then
    raise exception using errcode='40001',message='branding_deletion_in_progress'; end if;
  next_fields:=jsonb_set(d.fields,array[u.role],jsonb_build_object('bucket',u.validated_bucket,'object',u.validated_object,
    'sha256',u.validated_sha256,'byte_size',u.validated_size,'content_type',receipt.content_type),true);
  update app_private.branding_drafts set fields=next_fields,revision=revision+1,updated_by=actor,updated_at=statement_timestamp()
    where workspace_id=d.workspace_id;
  update app_private.branding_uploads set status='attached',updated_at=statement_timestamp() where id=u.id;
  return d.revision+1;
end;
$$;
create or replace function app_private.branding_publish(workspace_id uuid,expected_revision bigint)
returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare d app_private.branding_drafts%rowtype; current_row app_private.branding_current_publications%rowtype;
  version_id uuid; next_sequence bigint; changed text[]:=array[]::text[]; key text; actor uuid:=app_private.branding_actor_id();
begin
  if current_setting('role',true) is distinct from 'authenticated' or actor is null
    or not app_private.has_workspace_access(workspace_id,'manage_branding') then raise exception using errcode='42501',message='not_permitted'; end if;
  select * into d from app_private.branding_drafts where workspace_id=branding_publish.workspace_id for update;
  if not found or d.revision<>expected_revision then raise exception using errcode='40001',message='stale_branding_revision'; end if;
  if exists(select 1 from app_private.branding_gc_claims g where g.workspace_id=d.workspace_id and g.lease_until>statement_timestamp())
    or exists(select 1 from jsonb_each(d.fields) f join app_private.branding_gc_claims g on g.bucket_id=f.value->>'bucket'
      and g.object_name=f.value->>'object' where g.lease_until>statement_timestamp()) then raise exception using errcode='40001',message='branding_deletion_in_progress'; end if;
  if coalesce(d.fields#>>'{name,ar}','')='' and coalesce(d.fields#>>'{name,en}','')='' then raise exception using errcode='22023',message='branding_name_required'; end if;
  select * into current_row from app_private.branding_current_publications c where c.workspace_id=d.workspace_id for update;
  if found and exists(select 1 from app_private.branding_published_versions v where v.workspace_id=current_row.workspace_id and v.id=current_row.version_id and v.fields=d.fields) then return current_row.version_id; end if;
  select coalesce(max(v.sequence),0)+1 into next_sequence from app_private.branding_published_versions v where v.workspace_id=d.workspace_id;
  version_id:=extensions.gen_random_uuid();
  insert into app_private.branding_published_versions(workspace_id,id,sequence,fields,published_by,published_at)
    values(d.workspace_id,version_id,next_sequence,d.fields,actor,statement_timestamp());
  for key in select jsonb_object_keys(d.fields) loop
    if d.fields->key is distinct from coalesce((select v.fields->key from app_private.branding_published_versions v
      where v.workspace_id=current_row.workspace_id and v.id=current_row.version_id),'null'::jsonb) then changed:=array_append(changed,key); end if;
  end loop;
  for key in select unnest(array['logo','banner']) loop
    if jsonb_typeof(d.fields->key)='object' then
      insert into app_private.branding_published_assets(workspace_id,version_id,slot,bucket_id,object_name,content_type,byte_size)
        values(d.workspace_id,version_id,key,d.fields->key->>'bucket',d.fields->key->>'object',
          d.fields->key->>'content_type',(d.fields->key->>'byte_size')::bigint);
    end if;
  end loop;
  insert into app_private.branding_current_publications(workspace_id,version_id) values(d.workspace_id,version_id)
    on conflict(workspace_id) do update set version_id=excluded.version_id;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(actor,'branding.published','branding_published_versions',version_id,d.workspace_id,jsonb_build_object('sequence',next_sequence,'changed_fields',to_jsonb(changed)));
  return version_id;
end;
$$;
revoke all on function app_private.branding_actor_id() from public,anon,authenticated,service_role,branding_proxy,branding_validator;
revoke all on function app_private.branding_upload_begin(uuid,text,bigint),app_private.branding_staging_upload_allowed(text,text),
  app_private.branding_draft_save(uuid,bigint,jsonb),app_private.branding_asset_attach(uuid,bigint),app_private.branding_publish(uuid,bigint)
  from public,anon,service_role,branding_proxy,branding_validator;
grant execute on function app_private.branding_actor_id() to branding_definer;
grant execute on function app_private.branding_upload_begin(uuid,text,bigint),app_private.branding_draft_save(uuid,bigint,jsonb),
  app_private.branding_asset_attach(uuid,bigint),app_private.branding_publish(uuid,bigint) to authenticated;
grant execute on function app_private.branding_staging_upload_allowed(text,text) to authenticated;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;
