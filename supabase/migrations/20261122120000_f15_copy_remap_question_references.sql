-- S15-2 T094: copied definitions receive new identities and keep references local.
create or replace function app_private.copy_workspace_form(
  p_workspace_id uuid,p_source_form_id uuid,p_request_id uuid,p_actor_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  source_version public.form_versions%rowtype;
  source_name text;
  new_form uuid:=pg_catalog.gen_random_uuid();
  hash text;
  cached jsonb;
  result jsonb;
  section_map jsonb:='{}'::jsonb;
  question_map jsonb:='{}'::jsonb;
  new_sections jsonb:='[]'::jsonb;
  new_questions jsonb:='[]'::jsonb;
  new_conditions jsonb;
  new_question jsonb;
  new_derived_options jsonb;
  new_definition jsonb;
  section_item jsonb;
  question_item jsonb;
  condition_item jsonb;
  old_id text;
begin
  if p_workspace_id is null or p_source_form_id is null or p_request_id is null or p_actor_user_id is null then
    return jsonb_build_object('status','invalid'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'f15-builder-request:'||p_workspace_id::text||':'||p_actor_user_id::text||':'||p_request_id::text,0));
  if auth.uid() is not null and (
    app_private.current_staff_role() is null
    or not app_private.role_has_capability(app_private.current_staff_role(),'author_forms')
    or not app_private.has_workspace_access(p_workspace_id,'author_forms')
  ) then return null; end if;
  hash:=pg_catalog.md5(p_source_form_id::text);
  cached:=app_private.f15_builder_cached_result(p_workspace_id,p_actor_user_id,p_request_id,'copy',hash);
  if cached is not null then return cached; end if;
  select f.name into source_name from public.forms f
    where f.workspace_id=p_workspace_id and f.id=p_source_form_id;
  select v.* into source_version from public.form_versions v
    where v.workspace_id=p_workspace_id and v.form_id=p_source_form_id
    order by v.version_number desc limit 1;
  if source_name is null or not found then return jsonb_build_object('status','missing'); end if;
  if source_version.status='retired' then return jsonb_build_object('status','invalid'); end if;

  for section_item in
    select value from jsonb_array_elements(coalesce(source_version.definition->'sections','[]'::jsonb))
  loop
    old_id:=section_item->>'id';
    if old_id is not null then
      section_map:=section_map||jsonb_build_object(old_id,pg_catalog.gen_random_uuid()::text);
    end if;
  end loop;
  for question_item in
    select value from jsonb_array_elements(coalesce(source_version.definition->'questions','[]'::jsonb))
  loop
    old_id:=question_item->>'id';
    if old_id is not null then
      question_map:=question_map||jsonb_build_object(old_id,pg_catalog.gen_random_uuid()::text);
    end if;
  end loop;

  for section_item in
    select value from jsonb_array_elements(coalesce(source_version.definition->'sections','[]'::jsonb))
  loop
    old_id:=section_item->>'id';
    if section_map ? old_id then
      section_item:=jsonb_set(section_item,'{id}',to_jsonb(section_map->>old_id),true);
    end if;
    new_sections:=new_sections||jsonb_build_array(section_item);
  end loop;

  for question_item in
    select value from jsonb_array_elements(coalesce(source_version.definition->'questions','[]'::jsonb))
  loop
    old_id:=question_item->>'id';
    new_question:=question_item;
    if question_map ? old_id then
      new_question:=jsonb_set(new_question,'{id}',to_jsonb(question_map->>old_id),true);
    end if;
    old_id:=question_item->>'sectionId';
    if section_map ? old_id then
      new_question:=jsonb_set(new_question,'{sectionId}',to_jsonb(section_map->>old_id),true);
    end if;
    if jsonb_typeof(question_item->'when'->'conditions')='array' then
      new_conditions:='[]'::jsonb;
      for condition_item in
        select value from jsonb_array_elements(question_item->'when'->'conditions')
      loop
        old_id:=condition_item->>'questionId';
        if question_map ? old_id then
          condition_item:=jsonb_set(condition_item,'{questionId}',to_jsonb(question_map->>old_id),true);
        end if;
        new_conditions:=new_conditions||jsonb_build_array(condition_item);
      end loop;
      new_question:=jsonb_set(new_question,'{when,conditions}',new_conditions,true);
    end if;
    if jsonb_typeof(question_item->'derivedOptions')='object' then
      new_derived_options:=question_item->'derivedOptions';
      old_id:=new_derived_options->>'sourceQuestionId';
      if question_map ? old_id then
        new_derived_options:=jsonb_set(new_derived_options,'{sourceQuestionId}',to_jsonb(question_map->>old_id),true);
      end if;
      new_question:=jsonb_set(new_question,'{derivedOptions}',new_derived_options,true);
    end if;
    new_questions:=new_questions||jsonb_build_array(new_question);
  end loop;

  new_definition:=jsonb_set(
    jsonb_set(source_version.definition,'{sections}',new_sections,true),
    '{questions}',new_questions,true
  );
  insert into public.forms(workspace_id,id,name) values(p_workspace_id,new_form,source_name);
  insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(p_workspace_id,new_form,1,source_version.terms_policy_version,new_definition,'draft');
  result:=jsonb_build_object('status','ok','formId',new_form,'revision',1,
    'definition',new_definition,'name',source_name,'formStatus','draft');
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(p_actor_user_id,'form.copied','forms',new_form,p_workspace_id,
      jsonb_build_object('form_id',new_form,'source_form_id',p_source_form_id));
  perform app_private.f15_builder_store_result(p_workspace_id,p_actor_user_id,p_request_id,'copy',hash,result);
  return result;
end
$$;
alter function app_private.copy_workspace_form(uuid,uuid,uuid,uuid) owner to postgres;
revoke all on function app_private.copy_workspace_form(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

