-- Serialize object reference creation with GC claims. A live claim remains a
-- barrier until finalize removes it, even if its lease has expired.
grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
create function app_private.branding_gc_lock_object(bucket text, object_name text)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(bucket || ':' || object_name, 0)
  );
end;
$$;
revoke all on function app_private.branding_gc_lock_object(text,text)
  from public,anon,authenticated,service_role,branding_proxy,branding_validator;
grant execute on function app_private.branding_gc_lock_object(text,text)
  to branding_definer,branding_upload_check_definer;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;

grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
create or replace function app_private.branding_gc_claim(batch_size integer)
returns table(id uuid,workspace_id uuid,bucket_id text,object_name text,lease_until timestamptz)
language plpgsql security definer set search_path='' as $$
declare candidate record; claimed app_private.branding_gc_claims%rowtype;
begin
  if (session_user<>'postgres' and current_setting('role',true) is distinct from 'service_role')
    or batch_size is null or batch_size<1 or batch_size>50 then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  for candidate in
    select a.workspace_id,a.bucket_id,a.object_name
    from app_private.branding_published_assets a
    join app_private.branding_published_versions v on v.workspace_id=a.workspace_id and v.id=a.version_id
    left join app_private.branding_current_publications c on c.workspace_id=v.workspace_id and c.version_id=v.id
    left join app_private.branding_drafts d on d.workspace_id=a.workspace_id
    where c.version_id is null
      and not exists(select 1 from jsonb_each(coalesce(d.fields,'{}'::jsonb)) f where f.value->>'object'=a.object_name)
      and not exists(select 1 from app_private.branding_uploads u where u.workspace_id=a.workspace_id
        and u.validated_bucket=a.bucket_id and u.validated_object=a.object_name
        and u.status in ('validating','validated','promoted','attaching','reconciliation_pending','interrupted'))
      and not exists(select 1 from app_private.branding_gc_claims g where g.bucket_id=a.bucket_id
        and g.object_name=a.object_name and g.lease_until>statement_timestamp())
    group by a.workspace_id,a.bucket_id,a.object_name
    order by a.workspace_id,a.object_name
    limit batch_size
  loop
    perform app_private.branding_gc_lock_object(candidate.bucket_id,candidate.object_name);
    -- Recheck after acquiring the same transaction lock used by every writer.
    if exists(select 1 from app_private.branding_gc_claims g where g.bucket_id=candidate.bucket_id
        and g.object_name=candidate.object_name and g.lease_until>statement_timestamp())
      or exists(select 1 from app_private.branding_current_publications c
        join app_private.branding_published_assets a on a.workspace_id=c.workspace_id and a.version_id=c.version_id
        where a.workspace_id=candidate.workspace_id and a.bucket_id=candidate.bucket_id and a.object_name=candidate.object_name)
      or exists(select 1 from app_private.branding_drafts d,jsonb_each(d.fields) f
        where d.workspace_id=candidate.workspace_id and f.value->>'bucket'=candidate.bucket_id
          and f.value->>'object'=candidate.object_name)
      or exists(select 1 from app_private.branding_uploads u where u.workspace_id=candidate.workspace_id
        and u.validated_bucket=candidate.bucket_id and u.validated_object=candidate.object_name
        and u.status in ('validating','validated','promoted','attaching','reconciliation_pending','interrupted')) then
      continue;
    end if;
    insert into app_private.branding_gc_claims(workspace_id,bucket_id,object_name,lease_until)
      values(candidate.workspace_id,candidate.bucket_id,candidate.object_name,statement_timestamp()+interval '5 minutes')
      on conflict on constraint branding_gc_claims_bucket_id_object_name_key do update set workspace_id=excluded.workspace_id,
        lease_until=excluded.lease_until,created_at=statement_timestamp()
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
$$;
revoke all on function app_private.branding_gc_claim(integer)
  from public,anon,authenticated,service_role,branding_proxy,branding_validator;
grant execute on function app_private.branding_gc_claim(integer) to service_role;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;

grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
create or replace function app_private.branding_asset_attach(upload_id uuid,expected_revision bigint)
returns bigint language plpgsql security definer set search_path='' as $$
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
    update app_private.branding_uploads set status='attachment_failed_stale',updated_at=statement_timestamp() where id=u.id;
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
$$;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;

grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
create or replace function app_private.branding_publish(workspace_id uuid,expected_revision bigint)
returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare d app_private.branding_drafts%rowtype; current_row app_private.branding_current_publications%rowtype;
  version_id uuid; next_sequence bigint; changed text[]:=array[]::text[]; key text; actor uuid:=app_private.branding_actor_id();
begin
  if current_setting('role',true) is distinct from 'authenticated' or actor is null
    or not app_private.has_workspace_access(workspace_id,'manage_branding') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select * into d from app_private.branding_drafts where workspace_id=branding_publish.workspace_id for update;
  if not found or d.revision<>expected_revision then raise exception using errcode='40001',message='stale_branding_revision'; end if;
  for key in select unnest(array['logo','banner']) loop
    if jsonb_typeof(d.fields->key)='object' then
      perform app_private.branding_gc_lock_object(d.fields->key->>'bucket',d.fields->key->>'object');
      if exists(select 1 from app_private.branding_gc_claims g where g.bucket_id=d.fields->key->>'bucket'
          and g.object_name=d.fields->key->>'object') then
        raise exception using errcode='40001',message='branding_deletion_in_progress';
      end if;
    end if;
  end loop;
  if exists(select 1 from app_private.branding_gc_claims g where g.workspace_id=d.workspace_id) then
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
    values(d.workspace_id,version_id,next_sequence,d.fields,actor,statement_timestamp());
  for key in select jsonb_object_keys(d.fields) loop
    if d.fields->key is distinct from coalesce((select v.fields->key from app_private.branding_published_versions v
      where v.workspace_id=current_row.workspace_id and v.id=current_row.version_id),'null'::jsonb) then
      changed:=array_append(changed,key);
    end if;
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
    values(actor,'branding.published','branding_published_versions',version_id,d.workspace_id,
      jsonb_build_object('sequence',next_sequence,'changed_fields',to_jsonb(changed)));
  return version_id;
end;
$$;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;

grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
create or replace function app_private.branding_validation_complete(
  upload_id uuid,staging_object text,validated_bucket text,validated_object text,
  output_sha256 text,output_size bigint,content_type text
) returns uuid language plpgsql security definer set search_path='' as $$
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
    or (content_type='image/webp' and right(validated_object,5)<>'.webp') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  perform app_private.branding_gc_lock_object(validated_bucket,validated_object);
  if exists(select 1 from app_private.branding_gc_claims g where g.bucket_id=validated_bucket
      and g.object_name=validated_object) then
    raise exception using errcode='40001',message='branding_deletion_in_progress';
  end if;
  select r.id into receipt_id from app_private.branding_validation_receipts r where r.upload_id=u.id;
  if found then
    if exists(select 1 from app_private.branding_validation_receipts r where r.id=receipt_id
      and r.staging_object=branding_validation_complete.staging_object
      and r.validated_bucket=branding_validation_complete.validated_bucket
      and r.validated_object=branding_validation_complete.validated_object
      and r.output_sha256=branding_validation_complete.output_sha256 and r.output_size=branding_validation_complete.output_size
      and r.content_type=branding_validation_complete.content_type and r.credential_hash=h) then return receipt_id; end if;
    raise exception using errcode='23505',message='validation_receipt_conflict';
  end if;
  receipt_id:=extensions.gen_random_uuid();
  insert into app_private.branding_validation_receipts(id,workspace_id,upload_id,staging_bucket,staging_object,
    validated_bucket,validated_object,output_sha256,output_size,content_type,credential_hash)
    values(receipt_id,u.workspace_id,u.id,u.staging_bucket,u.staging_object,validated_bucket,validated_object,output_sha256,output_size,content_type,h);
  update app_private.branding_uploads set status='validated',validated_bucket=branding_validation_complete.validated_bucket,
    validated_object=branding_validation_complete.validated_object,validated_sha256=branding_validation_complete.output_sha256,
    validated_size=branding_validation_complete.output_size,updated_at=statement_timestamp() where id=u.id;
  return receipt_id;
end;
$$;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;

grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
create function app_private.branding_validator_upload_binding_matches_gc_serialized(object_name text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
#variable_conflict use_variable
declare claims jsonb; credential_hash text; ws_id uuid;
begin
  if not app_private.branding_credential_allowed('branding_validator') then return false; end if;
  claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
  credential_hash:=encode(extensions.digest(claims->>'credential_id','sha256'),'hex');
  begin ws_id:=split_part(branding_validator_upload_binding_matches_gc_serialized.object_name,'/',1)::uuid;
  exception when invalid_text_representation then return false;
  end;
  if split_part(branding_validator_upload_binding_matches_gc_serialized.object_name,'/',2)<>'validated'
    or split_part(branding_validator_upload_binding_matches_gc_serialized.object_name,'/',3) not in ('logo','banner') then return false; end if;
  perform app_private.branding_gc_lock_object('branding-validated',branding_validator_upload_binding_matches_gc_serialized.object_name);
  return exists(select 1 from app_private.branding_uploads u where u.workspace_id=ws_id
    and u.role=split_part(branding_validator_upload_binding_matches_gc_serialized.object_name,'/',3)
    and u.status='validating' and u.validator_credential_hash=credential_hash)
    and not exists(select 1 from app_private.branding_gc_claims g where g.workspace_id=ws_id
      and g.bucket_id='branding-validated' and g.object_name=branding_validator_upload_binding_matches_gc_serialized.object_name);
end;
$$;
revoke all on function app_private.branding_validator_upload_binding_matches_gc_serialized(text)
  from public,anon,authenticated,service_role,branding_proxy,branding_validator,branding_definer,branding_upload_check_definer;
grant execute on function app_private.branding_validator_upload_binding_matches_gc_serialized(text) to branding_validator;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;
drop policy branding_validator_insert_validated on storage.objects;
create policy branding_validator_insert_validated on storage.objects for insert to branding_validator
  with check(bucket_id='branding-validated' and name ~ '^[0-9a-f-]{36}/validated/(logo|banner)/[0-9a-f]{64}[.](png|webp)$'
    and app_private.branding_credential_allowed('branding_validator')
    and app_private.branding_validator_upload_binding_matches_gc_serialized(name));
