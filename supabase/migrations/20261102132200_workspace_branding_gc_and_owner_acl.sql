-- T049/T050: restricted definer access to verified actor identity and unambiguous claim upsert.
grant usage on schema auth to branding_definer;
grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
create or replace function app_private.branding_gc_claim(batch_size integer)
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
      and not exists(select 1 from jsonb_each(coalesce(d.fields,'{}'::jsonb)) f where f.value->>'object'=a.object_name)
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
    on conflict on constraint branding_gc_claims_bucket_id_object_name_key do update set
      workspace_id=excluded.workspace_id,lease_until=excluded.lease_until,created_at=statement_timestamp()
      where app_private.branding_gc_claims.lease_until<=statement_timestamp()
    returning branding_gc_claims.id,branding_gc_claims.workspace_id,branding_gc_claims.bucket_id,
      branding_gc_claims.object_name,branding_gc_claims.lease_until
  ), audited as (
    insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    select null,'branding.gc_claimed','branding_gc_claims',c.id,c.workspace_id,jsonb_build_object('lease_seconds',300)
    from claimed c
  ) select * from claimed;
end;
$$;
revoke all on function app_private.branding_gc_claim(integer) from public,anon,authenticated,service_role,branding_proxy,branding_validator;
grant execute on function app_private.branding_gc_claim(integer) to service_role;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;
