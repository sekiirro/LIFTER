-- F14b: narrow, owner-scoped draft asset projection, detach and validator RPC surface.
-- All owner operations retain has_workspace_access('manage_branding'), actor binding,
-- revision CAS and the existing immutable validation receipt pipeline.

grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;

create or replace function app_private.branding_draft_asset_read_allowed(bucket text, object_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare ws_id uuid;
begin
  if current_setting('role',true) is distinct from 'authenticated' or bucket is distinct from 'branding-validated' then return false; end if;
  begin ws_id:=split_part(object_name,'/',1)::uuid; exception when others then return false; end;
  return app_private.has_workspace_access(ws_id,'manage_branding') and exists (
    select 1 from app_private.branding_drafts d cross join lateral jsonb_each(d.fields) f
    where d.workspace_id=ws_id and f.key in ('logo','banner')
      and f.value->>'bucket'=bucket and f.value->>'object'=object_name
  );
end;
$$;

create function app_private.branding_asset_detach(workspace_id uuid, asset_role text, expected_revision bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare d app_private.branding_drafts%rowtype; next_fields jsonb; actor_id uuid:=app_private.branding_actor_id();
begin
  if current_setting('role',true) is distinct from 'authenticated' or actor_id is null
    or asset_role is null or asset_role not in ('logo','banner')
    or expected_revision is null
    or not app_private.has_workspace_access(workspace_id,'manage_branding') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select * into d from app_private.branding_drafts as draft
    where draft.workspace_id=branding_asset_detach.workspace_id for update;
  if not found or expected_revision is null or d.revision<>expected_revision then
    raise exception using errcode='40001',message='stale_branding_revision';
  end if;
  if exists(select 1 from app_private.branding_gc_claims g where g.workspace_id=d.workspace_id and g.lease_until>statement_timestamp()) then
    raise exception using errcode='40001',message='branding_deletion_in_progress';
  end if;
  next_fields:=d.fields-asset_role;
  update app_private.branding_drafts as target
    set fields=next_fields,revision=revision+1,updated_by=actor_id,updated_at=statement_timestamp()
    where target.workspace_id=d.workspace_id;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(actor_id,'branding.asset_detached','branding_drafts',d.workspace_id,d.workspace_id,
      jsonb_build_object('asset_role',asset_role,'revision',d.revision+1));
  return d.revision+1;
end;
$$;

alter function app_private.branding_asset_detach(uuid,text,bigint) owner to branding_definer;
alter function app_private.branding_draft_asset_read_allowed(text,text) owner to branding_definer;
revoke all on function app_private.branding_asset_detach(uuid,text,bigint),
  app_private.branding_draft_asset_read_allowed(text,text)
  from public,anon,authenticated,service_role,branding_proxy,branding_validator;
grant execute on function app_private.branding_asset_detach(uuid,text,bigint),
  app_private.branding_draft_asset_read_allowed(text,text) to authenticated;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;

grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
create or replace function app_private.branding_draft_read(workspace_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare draft_row app_private.branding_drafts%rowtype; has_draft boolean; published jsonb;
begin
  if current_setting('role',true) is distinct from 'authenticated'
    or not app_private.has_workspace_access(branding_draft_read.workspace_id,'manage_branding') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select * into draft_row from app_private.branding_drafts d where d.workspace_id=branding_draft_read.workspace_id;
  has_draft:=found;
  select jsonb_build_object('sequence',v.sequence,'fields',jsonb_build_object(
    'name',v.fields->'name','bannerAlt',v.fields->'bannerAlt','color',v.fields->'color')) into published
  from app_private.branding_current_publications c join app_private.branding_published_versions v
    on v.workspace_id=c.workspace_id and v.id=c.version_id where c.workspace_id=branding_draft_read.workspace_id;
  return jsonb_build_object(
    'workspace_id',branding_draft_read.workspace_id,
    'revision',case when has_draft then draft_row.revision else 0 end,
    'fields',case when has_draft then jsonb_build_object(
      'name',draft_row.fields->'name','bannerAlt',draft_row.fields->'bannerAlt','color',draft_row.fields->'color',
      'logo',draft_row.fields->'logo','banner',draft_row.fields->'banner')
      else jsonb_build_object('name',null,'bannerAlt',null,'color',null,'logo',null,'banner',null) end,
    'current_publication',published);
end;
$$;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;

-- Validator credentials can invoke only the two existing receipt lifecycle functions.
create function public.branding_validation_prepare(upload_id uuid)
returns void language sql set search_path='' as $$ select app_private.branding_validation_prepare(upload_id) $$;
create function public.branding_validation_complete(upload_id uuid, staging_object text, validated_bucket text,
  validated_object text, output_sha256 text, output_size bigint, content_type text)
returns uuid language sql set search_path='' as $$
  select app_private.branding_validation_complete(upload_id,staging_object,validated_bucket,validated_object,output_sha256,output_size,content_type)
$$;
create function public.branding_asset_detach(workspace_id uuid, asset_role text, expected_revision bigint)
returns bigint language sql set search_path='' as $$ select app_private.branding_asset_detach(workspace_id,asset_role,expected_revision) $$;

revoke all on function public.branding_validation_prepare(uuid),
  public.branding_validation_complete(uuid,text,text,text,text,bigint,text),
  public.branding_asset_detach(uuid,text,bigint) from public,anon,authenticated,service_role,branding_proxy,branding_validator;
grant execute on function public.branding_validation_prepare(uuid),
  public.branding_validation_complete(uuid,text,text,text,text,bigint,text) to branding_validator;
grant execute on function public.branding_asset_detach(uuid,text,bigint) to authenticated;

drop policy if exists branding_owner_draft_asset_read on storage.objects;
create policy branding_owner_draft_asset_read on storage.objects for select to authenticated
  using (bucket_id='branding-validated' and app_private.branding_draft_asset_read_allowed(bucket_id,name));
