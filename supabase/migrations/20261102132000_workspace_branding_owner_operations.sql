-- F14 T049/T050: user-JWT owner workflow and lease-based asset collection.
create table app_private.branding_drafts (
  workspace_id uuid primary key references public.workspaces(id) on delete restrict,
  revision bigint not null default 0 check (revision >= 0),
  fields jsonb not null default '{"name":{"ar":"","en":""},"color":"#123456","logo":null,"banner":null,"bannerAlt":{"ar":"","en":""}}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default statement_timestamp()
);

alter table app_private.branding_uploads add column started_by uuid;

alter table app_private.branding_published_versions
  add column sequence bigint,
  add column fields jsonb,
  add column published_by uuid,
  add column published_at timestamptz;
create unique index branding_published_versions_sequence
  on app_private.branding_published_versions(workspace_id,sequence)
  where sequence is not null;

create table app_private.branding_gc_claims (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  bucket_id text not null check (bucket_id='branding-validated'),
  object_name text not null,
  lease_until timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  unique(bucket_id,object_name)
);

alter table app_private.branding_drafts enable row level security;
alter table app_private.branding_drafts force row level security;
alter table app_private.branding_gc_claims enable row level security;
alter table app_private.branding_gc_claims force row level security;
create policy branding_definer_internal on app_private.branding_drafts
  to branding_definer using (true) with check (true);
create policy branding_definer_internal on app_private.branding_gc_claims
  to branding_definer using (true) with check (true);
create policy branding_operator_internal on app_private.branding_drafts
  to postgres using (true) with check (true);
create policy branding_operator_internal on app_private.branding_gc_claims
  to postgres using (true) with check (true);

grant select,insert,update,delete on app_private.branding_drafts,
  app_private.branding_uploads,app_private.branding_validation_receipts,
  app_private.branding_published_versions,app_private.branding_current_publications,
  app_private.branding_published_assets,app_private.branding_gc_claims to branding_definer;
grant insert on public.audit_events to branding_definer;
create policy branding_definer_insert on public.audit_events
  for insert to branding_definer with check (true);
grant usage,select on sequence public.audit_events_id_seq to branding_definer;
grant select on public.workspaces to branding_definer;
grant execute on function app_private.has_workspace_access(uuid,text) to branding_definer;

create function app_private.branding_gc_claim(batch_size integer)
returns table(id uuid,workspace_id uuid,bucket_id text,object_name text,lease_until timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if session_user<>'postgres' and current_setting('role',true) is distinct from 'service_role'
    or batch_size is null or batch_size<1 or batch_size>50 then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  return query
  with candidates as (
    select a.workspace_id,a.bucket_id,a.object_name
    from app_private.branding_published_assets a
    join app_private.branding_published_versions v on v.workspace_id=a.workspace_id and v.id=a.version_id
    left join app_private.branding_current_publications c on c.workspace_id=v.workspace_id and c.version_id=v.id
    left join app_private.branding_drafts d on d.workspace_id=a.workspace_id
    where c.version_id is null
      and not exists(select 1 from jsonb_each(d.fields) f where f.value->>'object'=a.object_name)
      and not exists(select 1 from app_private.branding_uploads u where u.workspace_id=a.workspace_id
        and u.validated_bucket=a.bucket_id and u.validated_object=a.object_name
        and u.status in ('validating','validated','promoted','attaching','reconciliation_pending','interrupted'))
      and not exists(select 1 from app_private.branding_gc_claims g where g.bucket_id=a.bucket_id and g.object_name=a.object_name
        and g.lease_until>statement_timestamp())
    group by a.workspace_id,a.bucket_id,a.object_name
    order by a.workspace_id,a.object_name
    limit batch_size
  ), claimed as (
    insert into app_private.branding_gc_claims(workspace_id,bucket_id,object_name,lease_until)
    select x.workspace_id,x.bucket_id,x.object_name,statement_timestamp()+interval '5 minutes' from candidates x
    on conflict(bucket_id,object_name) do update set workspace_id=excluded.workspace_id,
      lease_until=excluded.lease_until,created_at=statement_timestamp()
      where app_private.branding_gc_claims.lease_until<=statement_timestamp()
    returning branding_gc_claims.id,branding_gc_claims.workspace_id,branding_gc_claims.bucket_id,
      branding_gc_claims.object_name,branding_gc_claims.lease_until
  ), audited as (
    insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    select null,'branding.gc_claimed','branding_gc_claims',c.id,c.workspace_id,jsonb_build_object('lease_seconds',300)
    from claimed c returning target_id
  ) select c.* from claimed c join audited a on a.target_id=c.id;
end;
$$;

create function app_private.branding_gc_finalize(claim_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare g app_private.branding_gc_claims%rowtype;
begin
  if session_user<>'postgres' and current_setting('role',true) is distinct from 'service_role' then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select * into g from app_private.branding_gc_claims where id=branding_gc_finalize.claim_id for update;
  if not found or g.lease_until<=statement_timestamp() then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  if exists(select 1 from app_private.branding_current_publications c
      join app_private.branding_published_assets a on a.workspace_id=c.workspace_id and a.version_id=c.version_id
      where a.workspace_id=g.workspace_id and a.bucket_id=g.bucket_id and a.object_name=g.object_name)
    or exists(select 1 from app_private.branding_drafts d,jsonb_each(d.fields) f
      where d.workspace_id=g.workspace_id and f.value->>'object'=g.object_name)
    or exists(select 1 from app_private.branding_uploads u where u.workspace_id=g.workspace_id
      and u.validated_bucket=g.bucket_id and u.validated_object=g.object_name
      and u.status in ('validating','validated','promoted','attaching','reconciliation_pending','interrupted')) then
    raise exception using errcode='40001',message='branding_asset_referenced';
  end if;
  if exists(select 1 from storage.objects o where o.bucket_id=g.bucket_id and o.name=g.object_name) then
    raise exception using errcode='40001',message='branding_object_bytes_not_deleted';
  end if;
  delete from app_private.branding_published_assets a where a.workspace_id=g.workspace_id
    and a.bucket_id=g.bucket_id and a.object_name=g.object_name;
  delete from app_private.branding_published_versions v where v.workspace_id=g.workspace_id
    and not exists(select 1 from app_private.branding_current_publications c where c.workspace_id=v.workspace_id and c.version_id=v.id)
    and not exists(select 1 from app_private.branding_published_assets a where a.workspace_id=v.workspace_id and a.version_id=v.id);
  delete from app_private.branding_gc_claims where id=g.id;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(null,'branding.gc_finalized','branding_gc_claims',g.id,g.workspace_id,'{}'::jsonb);
  return true;
end;
$$;

create function app_private.branding_upload_begin(workspace_id uuid,role text,expected_revision bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare d app_private.branding_drafts%rowtype; upload_id uuid:=extensions.gen_random_uuid(); object_path text;
begin
  if current_setting('role',true) is distinct from 'authenticated'
    or auth.uid() is null or role not in ('logo','banner')
    or not app_private.has_workspace_access(workspace_id,'manage_branding') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  insert into app_private.branding_drafts(workspace_id) values(branding_upload_begin.workspace_id) on conflict do nothing;
  select * into d from app_private.branding_drafts where workspace_id=branding_upload_begin.workspace_id for update;
  if d.revision<>expected_revision then raise exception using errcode='40001',message='stale_branding_revision'; end if;
  if exists(select 1 from app_private.branding_gc_claims g where g.workspace_id=d.workspace_id and g.lease_until>statement_timestamp()) then
    raise exception using errcode='40001',message='branding_deletion_in_progress';
  end if;
  object_path:=d.workspace_id::text||'/staging/'||upload_id::text;
  insert into app_private.branding_uploads(id,workspace_id,role,draft_revision,staging_bucket,staging_object,status,started_by)
    values(upload_id,d.workspace_id,branding_upload_begin.role,d.revision,'branding-staging',object_path,'staging',auth.uid());
  return upload_id;
end;
$$;

create function app_private.branding_staging_upload_allowed(bucket text,object_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select current_setting('role',true)='authenticated' and bucket='branding-staging'
    and exists(select 1 from app_private.branding_uploads u where u.staging_bucket=bucket
      and u.staging_object=object_name and u.status in ('staging','interrupted')
      and u.started_by=auth.uid() and app_private.has_workspace_access(u.workspace_id,'manage_branding'))
$$;

create function app_private.branding_draft_save(workspace_id uuid,expected_revision bigint,fields jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare d app_private.branding_drafts%rowtype; next_fields jsonb;
begin
  if current_setting('role',true) is distinct from 'authenticated' or auth.uid() is null
    or not app_private.has_workspace_access(workspace_id,'manage_branding') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  insert into app_private.branding_drafts(workspace_id) values(branding_draft_save.workspace_id) on conflict do nothing;
  select * into d from app_private.branding_drafts where workspace_id=branding_draft_save.workspace_id for update;
  if d.revision<>expected_revision then raise exception using errcode='40001',message='stale_branding_revision'; end if;
  if exists(select 1 from app_private.branding_gc_claims g where g.workspace_id=d.workspace_id and g.lease_until>statement_timestamp()) then
    raise exception using errcode='40001',message='branding_deletion_in_progress';
  end if;
  if jsonb_typeof(fields)<>'object' or fields - array['name','color','bannerAlt']<>'{}'::jsonb
    or jsonb_typeof(fields->'name')<>'object' or jsonb_typeof(fields->'bannerAlt')<>'object'
    or coalesce(fields->>'color','') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception using errcode='22023',message='invalid_branding_fields';
  end if;
  next_fields:=d.fields||fields;
  update app_private.branding_drafts set fields=next_fields,revision=revision+1,updated_by=auth.uid(),updated_at=statement_timestamp()
    where workspace_id=d.workspace_id;
  return d.revision+1;
end;
$$;

create function app_private.branding_asset_attach(upload_id uuid,expected_revision bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare u app_private.branding_uploads%rowtype; d app_private.branding_drafts%rowtype; receipt app_private.branding_validation_receipts%rowtype;
  slot_key text; new_fields jsonb;
begin
  if current_setting('role',true) is distinct from 'authenticated' or auth.uid() is null then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select * into u from app_private.branding_uploads where id=branding_asset_attach.upload_id for update;
  if not found or u.started_by is distinct from auth.uid()
    or not app_private.has_workspace_access(u.workspace_id,'manage_branding') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select * into d from app_private.branding_drafts where workspace_id=u.workspace_id for update;
  if not found or d.revision<>expected_revision or u.draft_revision<>expected_revision or u.status<>'validated' then
    update app_private.branding_uploads set status='attachment_failed_stale',updated_at=statement_timestamp() where id=u.id;
    raise exception using errcode='40001',message='stale_branding_upload';
  end if;
  select * into receipt from app_private.branding_validation_receipts where upload_id=u.id;
  if not found or receipt.workspace_id<>u.workspace_id or receipt.staging_object<>u.staging_object
    or receipt.validated_bucket<>u.validated_bucket or receipt.validated_object<>u.validated_object
    or receipt.output_sha256<>u.validated_sha256 or receipt.output_size<>u.validated_size then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  if exists(select 1 from app_private.branding_gc_claims g where g.bucket_id=u.validated_bucket
    and g.object_name=u.validated_object and g.lease_until>statement_timestamp()) then
    raise exception using errcode='40001',message='branding_deletion_in_progress';
  end if;
  slot_key:=u.role;
  new_fields:=jsonb_set(d.fields,array[slot_key],jsonb_build_object('bucket',u.validated_bucket,'object',u.validated_object,
    'sha256',u.validated_sha256,'byte_size',u.validated_size,'content_type',receipt.content_type),true);
  update app_private.branding_drafts set fields=new_fields,revision=revision+1,updated_by=auth.uid(),updated_at=statement_timestamp()
    where workspace_id=d.workspace_id;
  update app_private.branding_uploads set status='attached',updated_at=statement_timestamp() where id=u.id;
  return d.revision+1;
end;
$$;

create function app_private.branding_publish(workspace_id uuid,expected_revision bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare d app_private.branding_drafts%rowtype; current_row app_private.branding_current_publications%rowtype;
  version_id uuid; next_sequence bigint; changed text[]:=array[]::text[]; key text;
begin
  if current_setting('role',true) is distinct from 'authenticated' or auth.uid() is null
    or not app_private.has_workspace_access(workspace_id,'manage_branding') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select * into d from app_private.branding_drafts where workspace_id=branding_publish.workspace_id for update;
  if not found or d.revision<>expected_revision then raise exception using errcode='40001',message='stale_branding_revision'; end if;
  if exists(select 1 from app_private.branding_gc_claims g where g.workspace_id=d.workspace_id and g.lease_until>statement_timestamp())
    or exists(select 1 from jsonb_each(d.fields) f join app_private.branding_gc_claims g
      on g.bucket_id=f.value->>'bucket' and g.object_name=f.value->>'object' where g.lease_until>statement_timestamp()) then
    raise exception using errcode='40001',message='branding_deletion_in_progress';
  end if;
  if coalesce(d.fields#>>'{name,ar}','')='' and coalesce(d.fields#>>'{name,en}','')='' then
    raise exception using errcode='22023',message='branding_name_required';
  end if;
  select * into current_row from app_private.branding_current_publications c where c.workspace_id=d.workspace_id for update;
  if found and exists(select 1 from app_private.branding_published_versions v where v.workspace_id=current_row.workspace_id
    and v.id=current_row.version_id and v.fields=d.fields) then return current_row.version_id; end if;
  select coalesce(max(v.sequence),0)+1 into next_sequence from app_private.branding_published_versions v where v.workspace_id=d.workspace_id;
  version_id:=extensions.gen_random_uuid();
  insert into app_private.branding_published_versions(workspace_id,id,sequence,fields,published_by,published_at)
    values(d.workspace_id,version_id,next_sequence,d.fields,auth.uid(),statement_timestamp());
  for key in select jsonb_object_keys(d.fields) loop
    if d.fields->key is distinct from coalesce((select v.fields->key from app_private.branding_published_versions v
      where v.workspace_id=current_row.workspace_id and v.id=current_row.version_id),'null'::jsonb) then changed:=array_append(changed,key); end if;
  end loop;
  insert into app_private.branding_current_publications(workspace_id,version_id) values(d.workspace_id,version_id)
    on conflict(workspace_id) do update set version_id=excluded.version_id;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(auth.uid(),'branding.published','branding_published_versions',version_id,d.workspace_id,
      jsonb_build_object('sequence',next_sequence,'changed_fields',to_jsonb(changed)));
  return version_id;
end;
$$;

create function public.branding_upload_begin(workspace_id uuid,role text,expected_revision bigint)
returns uuid language sql set search_path='' as $$
  select app_private.branding_upload_begin(workspace_id,role,expected_revision)
$$;
create function public.branding_draft_save(workspace_id uuid,expected_revision bigint,fields jsonb)
returns bigint language sql set search_path='' as $$
  select app_private.branding_draft_save(workspace_id,expected_revision,fields)
$$;
create function public.branding_asset_attach(upload_id uuid,expected_revision bigint)
returns bigint language sql set search_path='' as $$
  select app_private.branding_asset_attach(upload_id,expected_revision)
$$;
create function public.branding_publish(workspace_id uuid,expected_revision bigint)
returns uuid language sql set search_path='' as $$
  select app_private.branding_publish(workspace_id,expected_revision)
$$;

-- Staging is private and only the originating, currently authorized owner may upload.
insert into storage.buckets(id,name,public) values('branding-staging','branding-staging',false) on conflict(id) do nothing;
do $$ begin
  if exists(select 1 from storage.buckets b where b.id='branding-staging' and b.public) then
    raise exception 'Branding staging bucket must be private';
  end if;
end $$;
grant usage on schema storage to authenticated;
create policy branding_owner_staging_insert on storage.objects for insert to authenticated
  with check(bucket_id='branding-staging' and app_private.branding_staging_upload_allowed(bucket_id,name));

grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
alter function app_private.branding_gc_claim(integer) owner to branding_definer;
alter function app_private.branding_gc_finalize(uuid) owner to branding_definer;
alter function app_private.branding_upload_begin(uuid,text,bigint) owner to branding_definer;
alter function app_private.branding_staging_upload_allowed(text,text) owner to branding_definer;
alter function app_private.branding_draft_save(uuid,bigint,jsonb) owner to branding_definer;
alter function app_private.branding_asset_attach(uuid,bigint) owner to branding_definer;
alter function app_private.branding_publish(uuid,bigint) owner to branding_definer;
set role branding_definer;
revoke all on function app_private.branding_gc_claim(integer),app_private.branding_gc_finalize(uuid) from public,anon,authenticated,service_role,branding_proxy,branding_validator;
revoke all on function app_private.branding_upload_begin(uuid,text,bigint),app_private.branding_staging_upload_allowed(text,text),
  app_private.branding_draft_save(uuid,bigint,jsonb),app_private.branding_asset_attach(uuid,bigint),app_private.branding_publish(uuid,bigint)
  from public,anon,service_role,branding_proxy,branding_validator;
grant execute on function app_private.branding_gc_claim(integer),app_private.branding_gc_finalize(uuid) to service_role;
grant execute on function app_private.branding_upload_begin(uuid,text,bigint),app_private.branding_draft_save(uuid,bigint,jsonb),
  app_private.branding_asset_attach(uuid,bigint),app_private.branding_publish(uuid,bigint) to authenticated;
grant execute on function app_private.branding_staging_upload_allowed(text,text) to authenticated;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;
revoke all on app_private.branding_drafts,app_private.branding_gc_claims from public,anon,authenticated,service_role,branding_proxy,branding_validator;
revoke all on function public.branding_upload_begin(uuid,text,bigint),public.branding_draft_save(uuid,bigint,jsonb),
  public.branding_asset_attach(uuid,bigint),public.branding_publish(uuid,bigint) from public,anon,service_role;
grant execute on function public.branding_upload_begin(uuid,text,bigint),public.branding_draft_save(uuid,bigint,jsonb),
  public.branding_asset_attach(uuid,bigint),public.branding_publish(uuid,bigint) to authenticated;

-- Keep validated-object receipt creation from racing a claimed deletion.
grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
create or replace function app_private.branding_validation_complete(upload_id uuid,staging_object text,validated_bucket text,validated_object text,output_sha256 text,output_size bigint,content_type text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u app_private.branding_uploads%rowtype; c jsonb; h text; receipt_id uuid;
begin
  if not app_private.branding_credential_allowed('branding_validator') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  c:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
  h:=encode(extensions.digest(c->>'credential_id','sha256'),'hex');
  if output_sha256 is null or output_sha256 !~ '^[0-9a-f]{64}$' or output_size is null or output_size<=0
    or content_type is null or content_type not in ('image/png','image/webp') or validated_bucket is distinct from 'branding-validated' then
    raise exception using errcode='22023',message='invalid_validation_receipt';
  end if;
  select * into u from app_private.branding_uploads where id=branding_validation_complete.upload_id for update;
  if not found or staging_object is distinct from u.staging_object or u.staging_object<>u.workspace_id::text||'/staging/'||u.id::text
    or u.status not in ('validating','validated') or u.validator_credential_hash is distinct from h
    or validated_object !~ ('^'||u.workspace_id::text||'/validated/'||u.role||'/'||output_sha256||'[.](png|webp)$')
    or (content_type='image/png' and right(validated_object,4)<>'.png')
    or (content_type='image/webp' and right(validated_object,5)<>'.webp')
    or exists(select 1 from app_private.branding_gc_claims g where g.bucket_id=validated_bucket and g.object_name=validated_object and g.lease_until>statement_timestamp()) then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select r.id into receipt_id from app_private.branding_validation_receipts r where r.upload_id=u.id;
  if found then
    if exists(select 1 from app_private.branding_validation_receipts r where r.id=receipt_id and r.staging_object=branding_validation_complete.staging_object
      and r.validated_bucket=branding_validation_complete.validated_bucket and r.validated_object=branding_validation_complete.validated_object
      and r.output_sha256=branding_validation_complete.output_sha256 and r.output_size=branding_validation_complete.output_size
      and r.content_type=branding_validation_complete.content_type and r.credential_hash=h) then return receipt_id; end if;
    raise exception using errcode='23505',message='validation_receipt_conflict';
  end if;
  receipt_id:=extensions.gen_random_uuid();
  insert into app_private.branding_validation_receipts(id,workspace_id,upload_id,staging_bucket,staging_object,validated_bucket,validated_object,output_sha256,output_size,content_type,credential_hash)
    values(receipt_id,u.workspace_id,u.id,u.staging_bucket,u.staging_object,validated_bucket,validated_object,output_sha256,output_size,content_type,h);
  update app_private.branding_uploads set status='validated',validated_bucket=branding_validation_complete.validated_bucket,
    validated_object=branding_validation_complete.validated_object,validated_sha256=branding_validation_complete.output_sha256,
    validated_size=branding_validation_complete.output_size,updated_at=statement_timestamp() where id=u.id;
  return receipt_id;
end;
$$;
revoke all on function app_private.branding_validation_complete(uuid,text,text,text,text,bigint,text) from public,anon,authenticated,service_role,branding_proxy,branding_validator;
grant execute on function app_private.branding_validation_complete(uuid,text,text,text,text,bigint,text) to branding_validator;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;
