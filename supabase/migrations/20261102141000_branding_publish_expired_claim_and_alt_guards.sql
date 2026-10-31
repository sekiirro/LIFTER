-- Expired leases must not permanently block publication. Published banners
-- require at least one usable alt locale, and the missing locale is normalized
-- into the immutable public snapshot according to the F14 fallback contract.
grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
create or replace function app_private.branding_publish(workspace_id uuid,expected_revision bigint)
returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare d app_private.branding_drafts%rowtype; current_row app_private.branding_current_publications%rowtype;
  version_id uuid; next_sequence bigint; key text; actor_id uuid:=app_private.branding_actor_id();
  banner_alt_ar text; banner_alt_en text;
begin
  if current_setting('role',true) is distinct from 'authenticated' or actor_id is null
    or not app_private.has_workspace_access(workspace_id,'manage_branding') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select * into d from app_private.branding_drafts where workspace_id=branding_publish.workspace_id for update;
  if not found or d.revision<>expected_revision then raise exception using errcode='40001',message='stale_branding_revision'; end if;
  for key in select unnest(array['logo','banner']) loop
    if jsonb_typeof(d.fields->key)='object' then
      perform app_private.branding_gc_lock_object(d.fields->key->>'bucket',d.fields->key->>'object');
      if exists(select 1 from app_private.branding_gc_claims g where g.bucket_id=d.fields->key->>'bucket'
          and g.object_name=d.fields->key->>'object' and g.lease_until>statement_timestamp()) then
        raise exception using errcode='40001',message='branding_deletion_in_progress';
      end if;
    end if;
  end loop;
  if exists(select 1 from app_private.branding_gc_claims g
      where g.workspace_id=d.workspace_id and g.lease_until>statement_timestamp()) then
    raise exception using errcode='40001',message='branding_deletion_in_progress';
  end if;
  if coalesce(d.fields#>>'{name,ar}','')='' and coalesce(d.fields#>>'{name,en}','')='' then
    raise exception using errcode='22023',message='branding_name_required';
  end if;
  if jsonb_typeof(d.fields->'banner')='object' then
    banner_alt_ar:=nullif(btrim(d.fields#>>'{bannerAlt,ar}'),'');
    banner_alt_en:=nullif(btrim(d.fields#>>'{bannerAlt,en}'),'');
    if banner_alt_ar is null and banner_alt_en is null then
      raise exception using errcode='22023',message='branding_banner_alt_required';
    end if;
    d.fields:=jsonb_set(d.fields,'{bannerAlt}',jsonb_build_object(
      'ar',coalesce(banner_alt_ar,banner_alt_en),
      'en',coalesce(banner_alt_en,banner_alt_ar)
    ),true);
  end if;
  select * into current_row from app_private.branding_current_publications c where c.workspace_id=d.workspace_id for update;
  if found and exists(select 1 from app_private.branding_published_versions v where v.workspace_id=current_row.workspace_id
    and v.id=current_row.version_id and v.fields=d.fields) then return current_row.version_id; end if;
  select coalesce(max(v.sequence),0)+1 into next_sequence from app_private.branding_published_versions v where v.workspace_id=d.workspace_id;
  version_id:=extensions.gen_random_uuid();
  insert into app_private.branding_published_versions(workspace_id,id,sequence,fields,published_by,published_at)
    values(d.workspace_id,version_id,next_sequence,d.fields,actor_id,statement_timestamp());
  for key in select unnest(array['logo','banner']) loop
    if jsonb_typeof(d.fields->key)='object' then
      insert into app_private.branding_published_assets(workspace_id,version_id,slot,bucket_id,object_name,content_type,byte_size)
        values(d.workspace_id,version_id,key,d.fields->key->>'bucket',d.fields->key->>'object',
          d.fields->key->>'content_type',(d.fields->key->>'byte_size')::bigint);
    end if;
  end loop;
  insert into app_private.branding_current_publications(workspace_id,version_id) values(d.workspace_id,version_id)
    on conflict(workspace_id) do update set version_id=excluded.version_id;
  return version_id;
end;
$$;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;
