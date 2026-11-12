-- S33 T073: serialize retirement with workspace default selection.
create or replace function app_private.retire_workspace_form(
  p_workspace_id uuid,p_form_id uuid,p_request_id uuid,p_actor_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_version public.form_versions%rowtype;
  next_version integer;
  hash text;
  cached jsonb;
  result jsonb;
begin
  if p_workspace_id is null or p_form_id is null or p_request_id is null or p_actor_user_id is null then
    return jsonb_build_object('status','invalid'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'f15-builder-request:'||p_workspace_id::text||':'||p_actor_user_id::text||':'||p_request_id::text,0));
  hash:=pg_catalog.md5(p_form_id::text);
  cached:=app_private.f15_builder_cached_result(p_workspace_id,p_actor_user_id,p_request_id,'retire',hash);
  if cached is not null then return cached; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'f15-default-onboarding:'||p_workspace_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'f15-form:'||p_workspace_id::text||':'||p_form_id::text,0));
  if exists(select 1 from public.workspace_default_onboarding_forms d
    where d.workspace_id=p_workspace_id and d.form_id=p_form_id) then
    return jsonb_build_object('status','default_selected'); end if;
  select v.* into current_version from public.form_versions v
    where v.workspace_id=p_workspace_id and v.form_id=p_form_id
    order by v.version_number desc limit 1 for update;
  if not found then return jsonb_build_object('status','missing'); end if;
  if current_version.status='retired' then
    result:=jsonb_build_object('status','ok','formId',p_form_id,'revision',current_version.version_number,'formStatus','retired');
    perform app_private.f15_builder_store_result(p_workspace_id,p_actor_user_id,p_request_id,'retire',hash,result);
    return result;
  end if;
  select coalesce(max(v.version_number),0)+1 into next_version from public.form_versions v
    where v.workspace_id=p_workspace_id and v.form_id=p_form_id;
  insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(p_workspace_id,p_form_id,next_version,current_version.terms_policy_version,current_version.definition,'retired');
  result:=jsonb_build_object('status','ok','formId',p_form_id,'revision',next_version,'formStatus','retired');
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(p_actor_user_id,'form.retired','forms',p_form_id,p_workspace_id,
      jsonb_build_object('form_id',p_form_id,'version_number',next_version));
  perform app_private.f15_builder_store_result(p_workspace_id,p_actor_user_id,p_request_id,'retire',hash,result);
  return result;
end
$$;
alter function app_private.retire_workspace_form(uuid,uuid,uuid,uuid) owner to postgres;
revoke all on function app_private.retire_workspace_form(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
