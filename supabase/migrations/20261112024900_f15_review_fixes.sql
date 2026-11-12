-- S31 review remediation: first-save materialization, validator parity, Cairo D+3 approval assignment facts, NULL-safe recurrence.
create or replace function app_private.f15_valid_builder_definition(
  p_definition jsonb,p_publishing boolean default false
) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  section jsonb;
  question jsonb;
  condition jsonb;
  band jsonb;
  previous_band jsonb;
  section_id text;
  question_id text;
  conditions_count integer := 0;
  band_min numeric;
  band_max numeric;
  band_step numeric;
  question_count integer;
  section_count integer;
  answer_type text;
  localized jsonb;
begin
  if jsonb_typeof(p_definition)<>'object'
    or octet_length(p_definition::text)>131072
    or jsonb_typeof(p_definition->'title') is distinct from 'object'
    or jsonb_typeof(p_definition->'sections') is distinct from 'array'
    or jsonb_typeof(p_definition->'questions') is distinct from 'array' then return false; end if;
  if jsonb_typeof(p_definition->'title'->'en') is distinct from 'string'
    or jsonb_typeof(p_definition->'title'->'ar') is distinct from 'string'
    or (select count(*) from jsonb_object_keys(p_definition->'title'))<>2
    or octet_length(p_definition->'title'->>'en')>4096
    or octet_length(p_definition->'title'->>'ar')>4096 then return false; end if;
  if exists(select 1 from jsonb_object_keys(p_definition) k
      where k not in ('title','sections','questions','deadlineDays','copyStatus')) then return false; end if;
  if p_definition ? 'copyStatus' and p_definition->>'copyStatus' is distinct from 'draft' then
    return false;
  end if;
  if p_definition ? 'deadlineDays' and (
    jsonb_typeof(p_definition->'deadlineDays') is distinct from 'number'
    or (p_definition->>'deadlineDays')::numeric not between 1 and 14
    or trunc((p_definition->>'deadlineDays')::numeric)<>(p_definition->>'deadlineDays')::numeric
  ) then return false; end if;
  section_count:=jsonb_array_length(p_definition->'sections');
  question_count:=jsonb_array_length(p_definition->'questions');
  if question_count>60
    or (p_publishing and (section_count=0 or question_count=0)) then return false; end if;
  if (select count(distinct s.value->>'id') from jsonb_array_elements(p_definition->'sections') s)
       <> section_count then return false; end if;
  if (select count(distinct q.value->>'id') from jsonb_array_elements(p_definition->'questions') q)
       <> question_count then return false; end if;
  for section in select value from jsonb_array_elements(p_definition->'sections') loop
    section_id:=section->>'id';
    if exists(select 1 from jsonb_object_keys(section) k where k not in ('id','title'))
      or section_id is null or section_id !~ '^[A-Za-z0-9_.-]{1,64}$'
      or jsonb_typeof(section->'title') is distinct from 'object'
      or jsonb_typeof(section->'title'->'en') is distinct from 'string'
      or jsonb_typeof(section->'title'->'ar') is distinct from 'string'
      or (select count(*) from jsonb_object_keys(section->'title'))<>2
      or octet_length(section->'title'->>'en')>4096
      or octet_length(section->'title'->>'ar')>4096
      or (p_publishing and (btrim(section->'title'->>'en')='' or btrim(section->'title'->>'ar')='')) then
      return false;
    end if;
    if (select count(*) from jsonb_array_elements(p_definition->'questions') q
        where q.value->>'sectionId'=section_id)>20 then return false; end if;
  end loop;
  for question in select value from jsonb_array_elements(p_definition->'questions') loop
    question_id:=question->>'id'; answer_type:=question->>'type'; localized:=question->'label';
    if exists(select 1 from jsonb_object_keys(question) k where k not in (
      'id','sectionId','type','required','charLimit','choices','validation','when','privacy',
      'purpose','unit','labels','feedbackBands','assetReferences','displayText','profileField',
      'dateOfBirthField','derivedOptions','label','optionLabels'))
      or question_id is null or question_id !~ '^[A-Za-z0-9_.-]{1,64}$'
      or not exists(select 1 from jsonb_array_elements(p_definition->'sections') s
          where s.value->>'id'=question->>'sectionId')
      or answer_type is null or answer_type not in ('shortText','longText','number','singleChoice','multiChoice','boolean',
        'date','slider','imageChoice','mealCount','derivedChoice','displayOnly','profileText','computedAge')
      or jsonb_typeof(question->'required') is distinct from 'boolean'
      or jsonb_typeof(localized) is distinct from 'object'
      or jsonb_typeof(localized->'en') is distinct from 'string'
      or jsonb_typeof(localized->'ar') is distinct from 'string'
      or (select count(*) from jsonb_object_keys(localized))<>2
      or octet_length(localized->>'en')>4096
      or octet_length(localized->>'ar')>4096
      or (p_publishing and (btrim(localized->>'en')='' or btrim(localized->>'ar')='')) then
      return false;
    end if;
    if question ? 'charLimit' then
      if jsonb_typeof(question->'charLimit') is distinct from 'number' then return false; end if;
      if answer_type='shortText' and ((question->>'charLimit')::numeric not between 1 and 150
        or trunc((question->>'charLimit')::numeric)<>(question->>'charLimit')::numeric) then return false; end if;
      if answer_type='longText' and ((question->>'charLimit')::numeric not between 1 and 1000
        or trunc((question->>'charLimit')::numeric)<>(question->>'charLimit')::numeric) then return false; end if;
      if answer_type not in ('shortText','longText') then return false; end if;
    end if;
    if question ? 'validation' and (
      jsonb_typeof(question->'validation') is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(question->'validation') k
        where k not in ('minLength','maxLength','min','max','step'))
      or exists(select 1 from jsonb_each(question->'validation') v
        where jsonb_typeof(v.value)<>'number')
      or (question->'validation' ? 'minLength' and (
        (question->'validation'->>'minLength')::numeric<0
        or trunc((question->'validation'->>'minLength')::numeric)<>(question->'validation'->>'minLength')::numeric))
      or (question->'validation' ? 'maxLength' and (
        (question->'validation'->>'maxLength')::numeric<0
        or trunc((question->'validation'->>'maxLength')::numeric)<>(question->'validation'->>'maxLength')::numeric))
      or (question->'validation' ? 'minLength' and question->'validation' ? 'maxLength'
        and (question->'validation'->>'minLength')::numeric>(question->'validation'->>'maxLength')::numeric)
      or (question->'validation' ? 'min' and question->'validation' ? 'max'
        and (question->'validation'->>'min')::numeric>(question->'validation'->>'max')::numeric)
      or (question->'validation' ? 'step' and (question->'validation'->>'step')::numeric<=0)
      or (answer_type not in ('shortText','longText') and (
        question->'validation' ? 'minLength' or question->'validation' ? 'maxLength'))
      or (answer_type not in ('number','slider') and (
        question->'validation' ? 'min' or question->'validation' ? 'max'))
    ) then return false; end if;
    if question ? 'privacy' and (question->>'privacy' is null
      or question->>'privacy' not in ('personal','health')) then return false; end if;
    if question ? 'purpose' and question->>'purpose' is distinct from 'n12-series' then return false; end if;
    if question ? 'choices' then
      if jsonb_typeof(question->'choices') is distinct from 'array'
        or jsonb_array_length(question->'choices')=0 or jsonb_array_length(question->'choices')>50 then return false; end if;
      if exists(select 1 from jsonb_array_elements(question->'choices') c
        where jsonb_typeof(c.value)<>'string' or c.value#>>'{}'=''
          or octet_length(c.value#>>'{}')>4096) then return false; end if;
      if (select count(distinct c.value#>>'{}') from jsonb_array_elements(question->'choices') c)
          <>jsonb_array_length(question->'choices') then return false; end if;
    end if;
    if answer_type in ('singleChoice','multiChoice','imageChoice','mealCount','derivedChoice')
      and not question ? 'choices' then return false; end if;
    if question ? 'choices' and answer_type not in ('singleChoice','multiChoice','imageChoice','mealCount','derivedChoice') then return false; end if;
    if question ? 'derivedOptions' and (
      jsonb_typeof(question->'derivedOptions') is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(question->'derivedOptions') k
        where k not in ('sourceQuestionId','fixedChoices'))
      or not exists(select 1 from jsonb_array_elements(p_definition->'questions') parent
        where parent.value->>'id'=question->'derivedOptions'->>'sourceQuestionId')
      or jsonb_typeof(question->'derivedOptions'->'fixedChoices') is distinct from 'array'
      or jsonb_array_length(question->'derivedOptions'->'fixedChoices')>50
      or exists(select 1 from jsonb_array_elements(question->'derivedOptions'->'fixedChoices') choice
        where jsonb_typeof(choice.value) is distinct from 'string' or choice.value#>>'{}'=''
          or octet_length(choice.value#>>'{}')>4096)
    ) then return false; end if;
    if question ? 'unit' and (
      jsonb_typeof(question->'unit') is distinct from 'object'
      or (select count(*) from jsonb_object_keys(question->'unit'))<>2
      or jsonb_typeof(question->'unit'->'en') is distinct from 'string'
      or jsonb_typeof(question->'unit'->'ar') is distinct from 'string'
      or octet_length(question->'unit'->>'en')>4096
      or octet_length(question->'unit'->>'ar')>4096) then return false; end if;
    if question ? 'displayText' and (
      jsonb_typeof(question->'displayText') is distinct from 'object'
      or (select count(*) from jsonb_object_keys(question->'displayText'))<>2
      or jsonb_typeof(question->'displayText'->'en') is distinct from 'string'
      or jsonb_typeof(question->'displayText'->'ar') is distinct from 'string'
      or octet_length(question->'displayText'->>'en')>4096
      or octet_length(question->'displayText'->>'ar')>4096) then return false; end if;
    if answer_type='displayOnly' and ((question->>'required')::boolean or not question ? 'displayText') then return false; end if;
    if answer_type='profileText' and ((question->>'required')::boolean
      or question->>'profileField' is distinct from 'fullName') then return false; end if;
    if answer_type='computedAge' and ((question->>'required')::boolean
      or question->>'dateOfBirthField' is distinct from 'dateOfBirth') then return false; end if;
    if question ? 'assetReferences' and (
      jsonb_typeof(question->'assetReferences') is distinct from 'array'
      or exists(select 1 from jsonb_array_elements(question->'assetReferences') a
        where jsonb_typeof(a.value) is distinct from 'string'
          or octet_length(a.value#>>'{}')>4096)) then return false; end if;
    if answer_type='imageChoice' and (
      not question ? 'assetReferences'
      or jsonb_array_length(question->'assetReferences')<>jsonb_array_length(question->'choices')
      or exists(select 1 from jsonb_array_elements(question->'assetReferences') a
        where a.value#>>'{}' not like '/images/body-fat/%'
          or position('..' in a.value#>>'{}')>0)) then return false; end if;
    if question ? 'labels' and (
      jsonb_typeof(question->'labels') is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(question->'labels') k
        where k not in ('minimum','middle','maximum'))
      or jsonb_typeof(question->'labels'->'minimum') is distinct from 'string'
      or (question->'labels' ? 'middle' and jsonb_typeof(question->'labels'->'middle') is distinct from 'string')
      or jsonb_typeof(question->'labels'->'maximum') is distinct from 'string'
      or octet_length(question->'labels'->>'minimum')>4096
      or octet_length(question->'labels'->>'middle')>4096
      or octet_length(question->'labels'->>'maximum')>4096) then return false; end if;
    if question ? 'feedbackBands' and (
      jsonb_typeof(question->'feedbackBands') is distinct from 'array'
      or jsonb_array_length(question->'feedbackBands')=0
      or exists(select 1 from jsonb_array_elements(question->'feedbackBands') b
        where jsonb_typeof(b.value) is distinct from 'object'
          or jsonb_typeof(b.value->'min') is distinct from 'number'
          or jsonb_typeof(b.value->'max') is distinct from 'number'
          or jsonb_typeof(b.value->'text') is distinct from 'string'
          or (b.value->>'min')::numeric>(b.value->>'max')::numeric
          or octet_length(b.value->>'text')=0 or octet_length(b.value->>'text')>4096)) then return false; end if;
    if answer_type='slider' then
      if not (question ? 'labels' and question ? 'feedbackBands'
          and question->'validation' ? 'min' and question->'validation' ? 'max' and question->'validation' ? 'step')
        or btrim(question->'labels'->>'minimum')=''
        or btrim(question->'labels'->>'middle')=''
        or btrim(question->'labels'->>'maximum')='' then return false; end if;
      band_min:=(question->'validation'->>'min')::numeric;
      band_max:=(question->'validation'->>'max')::numeric;
      band_step:=(question->'validation'->>'step')::numeric;
      if (question->'feedbackBands'->0->>'min')::numeric<>band_min
        or (question->'feedbackBands'->(jsonb_array_length(question->'feedbackBands')-1)->>'max')::numeric<>band_max then return false; end if;
      previous_band:=null;
      for band in select value from jsonb_array_elements(question->'feedbackBands') loop
        if (band->>'min')::numeric<band_min or (band->>'max')::numeric>band_max then return false; end if;
        if previous_band is not null and abs((band->>'min')::numeric-((previous_band->>'max')::numeric+band_step))>0.000000001 then return false; end if;
        previous_band:=band;
      end loop;
    end if;
    if question->>'purpose'='n12-series' and (
      question_id<>'sex' or answer_type<>'singleChoice' or (question->>'required')::boolean is not true
      or question->>'privacy'<>'personal' or question->'choices'<>'["male","female"]'::jsonb) then return false; end if;
    if answer_type='mealCount' and (
      question_id<>'N07.meal_count' or question->'choices'<>'["2","3","4","5"]'::jsonb) then return false; end if;
    if answer_type='derivedChoice' and (
      question_id<>'N07.training_timing'
      or question->'derivedOptions'->>'sourceQuestionId'<>'N07.meal_count'
      or jsonb_array_length(question->'derivedOptions'->'fixedChoices')<>2) then return false; end if;
    if question ? 'optionLabels' then
      if jsonb_typeof(question->'optionLabels') is distinct from 'array'
        or jsonb_array_length(question->'optionLabels')>50
        or (question ? 'choices' and jsonb_array_length(question->'optionLabels')<>jsonb_array_length(question->'choices')) then return false; end if;
      if exists(select 1 from jsonb_array_elements(question->'optionLabels') o
        where jsonb_typeof(o.value) is distinct from 'object'
          or (select count(*) from jsonb_object_keys(o.value))<>2
          or jsonb_typeof(o.value->'en') is distinct from 'string'
          or jsonb_typeof(o.value->'ar') is distinct from 'string'
          or octet_length(o.value->>'en')>4096 or octet_length(o.value->>'ar')>4096) then return false; end if;
    end if;
    if question ? 'when' then
      if jsonb_typeof(question->'when') is distinct from 'object'
        or question->'when'->>'mode' is null
        or question->'when'->>'mode' not in ('all','any')
        or exists(select 1 from jsonb_object_keys(question->'when') k where k not in ('mode','conditions'))
        or jsonb_typeof(question->'when'->'conditions') is distinct from 'array'
        or jsonb_array_length(question->'when'->'conditions')=0
        or jsonb_array_length(question->'when'->'conditions')>16 then return false; end if;
      conditions_count:=conditions_count+jsonb_array_length(question->'when'->'conditions');
      if exists(select 1 from jsonb_array_elements(question->'when'->'conditions') c
        cross join lateral jsonb_object_keys(c.value) k
        where k not in ('questionId','operator','value')) then return false; end if;
      if exists(select 1 from jsonb_array_elements(question->'when'->'conditions') c
        where c.value->>'operator' is null
          or c.value->>'operator' not in ('equals','notEquals','contains','isAnswered')
          or not exists(select 1 from jsonb_array_elements(p_definition->'questions') parent
            where parent.value->>'id'=c.value->>'questionId')) then return false; end if;
      if exists(select 1 from jsonb_array_elements(question->'when'->'conditions') c
        where (c.value->>'operator'='isAnswered' and c.value ? 'value')
          or (c.value->>'operator'<>'isAnswered' and not (c.value ? 'value'))
          or (c.value->>'operator'='contains' and jsonb_typeof(c.value->'value') is distinct from 'string')
          or (jsonb_typeof(c.value->'value')='string' and octet_length(c.value->>'value')>4096)) then return false; end if;
      if exists(select 1 from jsonb_array_elements(question->'when'->'conditions') c
        join jsonb_array_elements(p_definition->'questions') parent
          on parent.value->>'id'=c.value->>'questionId'
        where c.value->>'operator'='contains' and (parent.value->>'type'<>'multiChoice'
          or not (parent.value->'choices' @> jsonb_build_array(c.value->'value')))) then return false; end if;
      if exists(select 1 from jsonb_array_elements(question->'when'->'conditions') c
        join jsonb_array_elements(p_definition->'questions') parent
          on parent.value->>'id'=c.value->>'questionId'
        where c.value->>'operator'<>'isAnswered' and not (
          (parent.value->>'type' in ('shortText','longText','singleChoice','imageChoice','mealCount','derivedChoice','date')
            and jsonb_typeof(c.value->'value')='string')
          or (parent.value->>'type' in ('number','slider') and jsonb_typeof(c.value->'value')='number')
          or (parent.value->>'type'='boolean' and jsonb_typeof(c.value->'value')='boolean')
          or (c.value->>'operator'='contains' and parent.value->>'type'='multiChoice'
            and parent.value->'choices' @> jsonb_build_array(c.value->'value'))
        )) then return false; end if;
    end if;
  end loop;
  if conditions_count>400 or question_count+conditions_count>4000 then return false; end if;
  if exists(
    with recursive edges(child,parent) as (
      select q.value->>'id',c.value->>'questionId'
      from jsonb_array_elements(p_definition->'questions') q
      cross join lateral jsonb_array_elements(coalesce(q.value->'when'->'conditions','[]'::jsonb)) c
    ), walk(start_id,node_id,path,cycle) as (
      select e.child,e.parent,array[e.child,e.parent],e.child=e.parent from edges e
      union all
      select w.start_id,e.parent,w.path||e.parent,e.parent=any(w.path)
      from walk w join edges e on e.child=w.node_id where not w.cycle
    ) select 1 from walk where cycle
  ) then return false; end if;
  return true;
exception when others then return false;
end
$$;
create or replace function app_private.save_workspace_form_draft(
  p_workspace_id uuid,p_form_id uuid,p_expected_revision integer,
  p_definition jsonb,p_request_id uuid,p_actor_user_id uuid,p_name text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_version public.form_versions%rowtype;
  next_revision integer;
  hash text;
  cached jsonb;
  result jsonb;
  policy_version text;
  is_new boolean := false;
begin
  if p_workspace_id is null or p_form_id is null or p_request_id is null
    or p_actor_user_id is null or p_name is null or btrim(p_name)='' or char_length(p_name)>160
    or not app_private.f15_valid_builder_definition(p_definition,false) then
    return jsonb_build_object('status','invalid');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'f15-builder-request:'||p_workspace_id::text||':'||p_actor_user_id::text||':'||p_request_id::text,0));
  hash:=pg_catalog.md5(p_expected_revision::text||':'||p_name||':'||p_definition::text);
  cached:=app_private.f15_builder_cached_result(p_workspace_id,p_actor_user_id,p_request_id,'save',hash);
  if cached is not null then return cached; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'f15-form:'||p_workspace_id::text||':'||p_form_id::text,0));
  select v.* into current_version from public.form_versions v
    where v.workspace_id=p_workspace_id and v.form_id=p_form_id
    order by v.version_number desc limit 1 for update;
  if not found then
    if p_expected_revision<>0 then return jsonb_build_object('status','missing'); end if;
    select p.version into policy_version from app_private.terms_policy_versions p
      where p.policy_kind='terms' and p.status='published'
      order by p.created_at desc,p.version desc limit 1;
    if policy_version is null then return jsonb_build_object('status','policy_required'); end if;
    insert into public.forms(workspace_id,id,name) values(p_workspace_id,p_form_id,p_name);
    insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
      values(p_workspace_id,p_form_id,1,policy_version,p_definition,'draft');
    select v.* into current_version from public.form_versions v
      where v.workspace_id=p_workspace_id and v.form_id=p_form_id and v.version_number=1 for update;
    is_new:=true;
  end if;
  if not is_new and current_version.version_number<>p_expected_revision then return jsonb_build_object('status','conflict'); end if;
  if current_version.status='retired' then return jsonb_build_object('status','forbidden'); end if;
  if is_new then
    next_revision:=1;
  else
    next_revision:=current_version.version_number+1;
    if current_version.status='draft' then
      update public.form_versions set version_number=next_revision,definition=p_definition
        where workspace_id=p_workspace_id and form_id=p_form_id and version_number=current_version.version_number;
    else
      insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
        values(p_workspace_id,p_form_id,next_revision,current_version.terms_policy_version,p_definition,'draft');
    end if;
  end if;
  update public.forms set name=p_name where workspace_id=p_workspace_id and id=p_form_id;
  result:=jsonb_build_object('status','ok','formId',p_form_id,'revision',next_revision,
    'definition',p_definition,'name',p_name,'formStatus','draft');
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(p_actor_user_id,'form.draft_saved','forms',p_form_id,p_workspace_id,
      jsonb_build_object('form_id',p_form_id,'revision',next_revision));
  perform app_private.f15_builder_store_result(p_workspace_id,p_actor_user_id,p_request_id,'save',hash,result);
  return result;
end
$$;
grant execute on function public.save_workspace_form_draft(uuid,uuid,integer,jsonb,uuid,text) to authenticated;
create or replace function public.configure_intake_assignment_policy(
  p_workspace_id uuid,p_form_id uuid,p_version_number integer,p_audience_kind text,
  p_specific_client_ids uuid[],p_trigger_kind text,p_timing jsonb,p_stop_conditions jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); role public.staff_role; result uuid; ids uuid[]:=coalesce(p_specific_client_ids,'{}');
begin
  if actor is null or p_workspace_id is null or p_form_id is null or p_version_number is null then return '{"status":"not_found"}'::jsonb; end if;
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form') or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then return '{"status":"not_found"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text||':'||p_form_id::text,0));
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form') or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then raise exception 'assignment policy authorization changed while waiting'; end if;
  if p_audience_kind not in ('all_active_clients','new_clients','specific_clients') or p_trigger_kind not in ('manual','joining','onboarding','renewal','recurring')
    or p_timing is null or jsonb_typeof(p_timing)<>'object' or coalesce(p_stop_conditions,'{}'::jsonb)<>'{"frozen":true,"inactive":true}'::jsonb
    or ((p_audience_kind='specific_clients')<>(cardinality(ids)>0))
    or (p_timing ? 'client_deadline_days' and (p_timing->>'client_deadline_days') !~ '^[0-9]+$')
    or coalesce((p_timing->>'client_deadline_days')::integer,3) not between 1 and 14
    or (p_trigger_kind='recurring' and (coalesce(p_timing->>'recurrence_interval_days','') !~ '^[0-9]+$'
       or coalesce((p_timing->>'recurrence_interval_days')::integer,0) not between 1 and 365 or (p_timing->>'recurrence_starts_on') is null
       or (p_timing->>'recurrence_starts_on')::date is null))
    or (p_trigger_kind<>'recurring' and p_timing ? 'recurrence_interval_days')
    or exists(select 1 from unnest(ids) x where not exists(select 1 from public.clients c where c.workspace_id=p_workspace_id and c.id=x and c.approval_state='approved'))
    or not exists(select 1 from public.form_versions v where v.workspace_id=p_workspace_id and v.form_id=p_form_id and v.version_number=p_version_number and v.status='published' and app_private.f15_current_terms_policy(v.terms_policy_version)) then
    return '{"status":"not_found"}'::jsonb;
  end if;
  insert into app_private.form_assignment_policies(workspace_id,form_id,version_number,audience_kind,specific_client_ids,trigger_kind,timing,stop_conditions,configured_by)
  values(p_workspace_id,p_form_id,p_version_number,p_audience_kind,ids,p_trigger_kind,p_timing,'{"frozen":true,"inactive":true}'::jsonb,actor)
  on conflict(workspace_id,form_id) do update set version_number=excluded.version_number,audience_kind=excluded.audience_kind,specific_client_ids=excluded.specific_client_ids,
    trigger_kind=excluded.trigger_kind,timing=excluded.timing,stop_conditions=excluded.stop_conditions,configured_by=excluded.configured_by,updated_at=transaction_timestamp()
  returning id into result;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details) values(actor,'form.assignment_policy_configured','form_assignment_policies',result,p_workspace_id,
    jsonb_build_object('form_id',p_form_id,'version_number',p_version_number,'audience_kind',p_audience_kind,'trigger_kind',p_trigger_kind));
  return jsonb_build_object('status','configured');
exception when others then return '{"status":"not_found"}'::jsonb;
end $$;
grant execute on function public.configure_intake_assignment_policy(uuid,uuid,integer,text,uuid[],text,jsonb,jsonb) to authenticated;
create or replace function app_private.materialize_intake_assignment_occurrence_core(p_workspace_id uuid,p_form_id uuid,p_occurrence_key text,p_evaluation_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); role public.staff_role; policy app_private.form_assignment_policies%rowtype;
  snapshot_at timestamptz:=transaction_timestamp(); today date:=p_evaluation_date; service_start date; inserted integer:=0; deadline_days integer;
  client_ids uuid[]; assigned record; expected_key text; sub_id uuid;
begin
  if actor is null or p_workspace_id is null or p_form_id is null or p_occurrence_key is null or char_length(p_occurrence_key) not between 1 and 160 or p_evaluation_date is null or not isfinite(p_evaluation_date) then return '{"status":"not_found"}'::jsonb; end if;
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form') or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then return '{"status":"not_found"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text||':'||p_form_id::text,0));
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form') or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then raise exception 'assignment authorization changed while waiting'; end if;
  select * into policy from app_private.form_assignment_policies p where p.workspace_id=p_workspace_id and p.form_id=p_form_id for update;
  if not found or not exists(select 1 from public.form_versions v where v.workspace_id=p_workspace_id and v.form_id=p_form_id and v.version_number=policy.version_number and v.status='published' and app_private.f15_current_terms_policy(v.terms_policy_version)) then return '{"status":"not_found"}'::jsonb; end if;
  if policy.trigger_kind='recurring' then
    expected_key:='recurring:'||today::text;
    if coalesce(policy.timing->>'recurrence_interval_days','') !~ '^[0-9]+$'
      or coalesce((policy.timing->>'recurrence_interval_days')::integer,0) not between 1 and 365
      or p_occurrence_key<>expected_key or today<(policy.timing->>'recurrence_starts_on')::date
      or mod(today-(policy.timing->>'recurrence_starts_on')::date,(policy.timing->>'recurrence_interval_days')::integer)<>0 then return '{"status":"not_found"}'::jsonb; end if;
  elsif policy.trigger_kind='renewal' then
    if p_occurrence_key !~ '^renewal:[0-9a-fA-F-]{36}$' then return '{"status":"not_found"}'::jsonb; end if;
    sub_id:=substring(p_occurrence_key from 9)::uuid;
    select coalesce((select d.service_start_date from public.subscription_renewal_date_revisions d
      where d.workspace_id=r.workspace_id and d.subscription_id=r.subscription_id order by d.revision desc limit 1),r.service_start_date)
      into service_start from public.subscription_renewals r where r.workspace_id=p_workspace_id and r.subscription_id=sub_id;
    if service_start is null or today<service_start then return '{"status":"not_found"}'::jsonb; end if;
  elsif policy.trigger_kind not in ('manual','joining','onboarding') then return '{"status":"not_found"}'::jsonb; end if;
  if exists(select 1 from app_private.form_assignment_occurrences o where o.workspace_id=p_workspace_id and o.policy_id=policy.id and o.occurrence_key=p_occurrence_key) then return jsonb_build_object('status','already_materialized','count',0); end if;
  deadline_days:=coalesce((policy.timing->>'client_deadline_days')::integer,3);
  if deadline_days not between 1 and 14 then return '{"status":"not_found"}'::jsonb; end if;
  select coalesce(array_agg(c.id order by c.id),'{}'::uuid[]) into client_ids
  from public.clients c where c.workspace_id=p_workspace_id and c.approval_state='approved'
    and (policy.audience_kind='all_active_clients' or (policy.audience_kind='new_clients' and exists(select 1 from app_private.registration_approval_events a where a.workspace_id=c.workspace_id and a.client_id=c.id and a.approved_at>=policy.configured_at))
      or (policy.audience_kind='specific_clients' and c.id=any(policy.specific_client_ids)))
    and (policy.trigger_kind<>'renewal' or exists(select 1 from public.subscription_renewals r where r.workspace_id=c.workspace_id and r.client_id=c.id and r.subscription_id=sub_id))
    and exists(select 1 from public.subscriptions s where s.workspace_id=c.workspace_id and s.client_id=c.id and
      ((policy.trigger_kind='renewal' and s.id=sub_id
        and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='active'
        )
       or (policy.trigger_kind='recurring' and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='active')
       or (policy.trigger_kind in ('manual','joining','onboarding') and (app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='active'
         or (policy.trigger_kind in ('joining','onboarding') and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='future')
         or (policy.trigger_kind='manual' and policy.audience_kind='specific_clients' and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='future')))));
  insert into app_private.form_assignment_occurrences(workspace_id,policy_id,occurrence_key,snapshot_at,audience_client_ids,version_number,trigger_kind,created_by)
    values(p_workspace_id,policy.id,p_occurrence_key,snapshot_at,client_ids,policy.version_number,policy.trigger_kind,actor);
  for assigned in
    insert into public.form_assignments(workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot,occurrence_key,audience_snapshot_at,client_deadline_at,policy_id,configured_by)
    select p_workspace_id,c.id,p_form_id,v.version_number,v.terms_policy_version,v.definition,p_occurrence_key,snapshot_at,
      (((today+deadline_days+1)::timestamp at time zone 'Africa/Cairo')-interval '1 millisecond'),policy.id,actor
    from unnest(client_ids) c(id) join public.form_versions v on v.workspace_id=p_workspace_id and v.form_id=p_form_id and v.version_number=policy.version_number and v.status='published'
    on conflict(workspace_id,client_id,form_id,occurrence_key) do nothing returning id,client_id
  loop
    inserted:=inserted+1;
    insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
      values(actor,'form.assignment_occurrence_materialized','form_assignments',assigned.id,p_workspace_id,jsonb_build_object('client_id',assigned.client_id,'form_id',p_form_id,'occurrence_key',p_occurrence_key,'version_number',policy.version_number));
  end loop;
  return jsonb_build_object('status','materialized','count',inserted,'snapshot_at',snapshot_at);
exception when others then return '{"status":"not_found"}'::jsonb;
end $$;
create or replace function app_private.reconcile_f15_form_assignment(
  p_workspace_id uuid,p_client_id uuid
) returns text language plpgsql security definer set search_path='' as $$
declare selection app_private.form_assignment_selections%rowtype; approved_subscription uuid; assignment uuid; policy_id uuid; snapshot_at timestamptz:=transaction_timestamp();
begin
  if p_workspace_id is null or p_client_id is null then return 'invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text||':'||p_client_id::text,0));
  select s.* into selection from app_private.form_assignment_selections s
    where s.workspace_id=p_workspace_id and s.client_id=p_client_id;
  if not found then return 'waiting_for_selection'; end if;
  select a.subscription_id into approved_subscription from app_private.registration_approval_events a
    where a.workspace_id=p_workspace_id and a.client_id=p_client_id order by a.approved_at,a.id limit 1;
  if not found then return 'waiting_for_approval'; end if;
  if exists(select 1 from app_private.form_assignment_consumptions c
    where c.workspace_id=p_workspace_id and c.client_id=p_client_id and c.form_id=selection.form_id)
    then return 'already_assigned'; end if;
  if not app_private.f15_current_terms_policy(selection.terms_policy_version)
    or not exists(select 1 from public.form_versions v where v.workspace_id=p_workspace_id
      and v.form_id=selection.form_id and v.version_number=selection.version_number and v.status='published'
      and v.terms_policy_version=selection.terms_policy_version) then return 'stale_selection'; end if;
  insert into app_private.form_assignment_policies(workspace_id,form_id,version_number,audience_kind,specific_client_ids,trigger_kind,timing,stop_conditions,configured_by)
  values(p_workspace_id,selection.form_id,selection.version_number,'specific_clients',array[p_client_id],'onboarding','{"client_deadline_days":3}'::jsonb,'{"frozen":true,"inactive":true}'::jsonb,selection.selected_by)
  on conflict(workspace_id,form_id) do nothing;
  select p.id into policy_id from app_private.form_assignment_policies p
    where p.workspace_id=p_workspace_id and p.form_id=selection.form_id;
  if policy_id is null then return 'unavailable'; end if;
  insert into app_private.form_assignment_occurrences(workspace_id,policy_id,occurrence_key,snapshot_at,audience_client_ids,version_number,trigger_kind,created_by)
    values(p_workspace_id,policy_id,'initial',snapshot_at,array[p_client_id],selection.version_number,'onboarding',selection.selected_by)
    on conflict(workspace_id,policy_id,occurrence_key) do nothing;
  insert into public.form_assignments(workspace_id,client_id,form_id,version_number,terms_policy_version,policy_kind,version_snapshot,occurrence_key,audience_snapshot_at,client_deadline_at,policy_id,configured_by)
  select p_workspace_id,p_client_id,v.form_id,v.version_number,v.terms_policy_version,v.policy_kind,v.definition,'initial',snapshot_at,
    (((snapshot_at at time zone 'Africa/Cairo')::date+4)::timestamp at time zone 'Africa/Cairo')-interval '1 millisecond',policy_id,selection.selected_by
  from public.form_versions v where v.workspace_id=p_workspace_id and v.form_id=selection.form_id
    and v.version_number=selection.version_number and v.status='published'
  on conflict(workspace_id,client_id,form_id,occurrence_key) do nothing returning id into assignment;
  if assignment is null then select a.id into assignment from public.form_assignments a
    where a.workspace_id=p_workspace_id and a.client_id=p_client_id and a.form_id=selection.form_id
      and a.occurrence_key='initial'; end if;
  if assignment is null then return 'unavailable'; end if;
  insert into app_private.form_assignment_consumptions(workspace_id,client_id,form_id,subscription_id,assignment_id)
    values(p_workspace_id,p_client_id,selection.form_id,approved_subscription,assignment)
    on conflict(workspace_id,client_id,form_id) do nothing;
  if found then
    insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(selection.selected_by,'form.assignment_created','form_assignments',assignment,p_workspace_id,
      jsonb_build_object('client_id',p_client_id,'form_id',selection.form_id,
        'version_number',selection.version_number,'subscription_id',approved_subscription));
    return 'assigned';
  end if;
  return 'already_assigned';
end $$;
