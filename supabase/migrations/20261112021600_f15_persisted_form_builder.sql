-- F15 F2: persisted workspace authoring. The shared author_forms mapping is
-- intentionally left for final T049 reconciliation.
create table app_private.form_builder_requests (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  operation text not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id,actor_user_id,request_id)
);
alter table app_private.form_builder_requests enable row level security;
alter table app_private.form_builder_requests force row level security;
revoke all on app_private.form_builder_requests from public,anon,authenticated,service_role;

create function app_private.f15_builder_cached_result(
  p_workspace_id uuid,p_actor_user_id uuid,p_request_id uuid,
  p_operation text,p_payload_hash text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare prior app_private.form_builder_requests%rowtype;
begin
  select r.* into prior from app_private.form_builder_requests r
    where r.workspace_id=p_workspace_id and r.actor_user_id=p_actor_user_id
      and r.request_id=p_request_id;
  if not found then return null; end if;
  if prior.operation<>p_operation or prior.payload_hash<>p_payload_hash then
    return jsonb_build_object('status','idempotency_conflict');
  end if;
  return prior.result;
end
$$;
alter function app_private.f15_builder_cached_result(uuid,uuid,uuid,text,text) owner to postgres;
revoke all on function app_private.f15_builder_cached_result(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function app_private.f15_builder_store_result(
  p_workspace_id uuid,p_actor_user_id uuid,p_request_id uuid,
  p_operation text,p_payload_hash text,p_result jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into app_private.form_builder_requests(
    workspace_id,actor_user_id,request_id,operation,payload_hash,result
  ) values(p_workspace_id,p_actor_user_id,p_request_id,p_operation,p_payload_hash,p_result)
$$;
alter function app_private.f15_builder_store_result(uuid,uuid,uuid,text,text,jsonb) owner to postgres;
revoke all on function app_private.f15_builder_store_result(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;

create function app_private.f15_valid_builder_definition(
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
alter function app_private.f15_valid_builder_definition(jsonb,boolean) owner to postgres;
revoke all on function app_private.f15_valid_builder_definition(jsonb,boolean) from public,anon,authenticated,service_role;

create function app_private.save_workspace_form_draft(
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
  if not found then return jsonb_build_object('status','missing'); end if;
  if current_version.version_number<>p_expected_revision then return jsonb_build_object('status','conflict'); end if;
  if current_version.status='retired' then return jsonb_build_object('status','forbidden'); end if;
  next_revision:=current_version.version_number+1;
  if current_version.status='draft' then
    update public.form_versions set version_number=next_revision,definition=p_definition
      where workspace_id=p_workspace_id and form_id=p_form_id and version_number=current_version.version_number;
  else
    insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
      values(p_workspace_id,p_form_id,next_revision,current_version.terms_policy_version,p_definition,'draft');
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
alter function app_private.save_workspace_form_draft(uuid,uuid,integer,jsonb,uuid,uuid,text) owner to postgres;
revoke all on function app_private.save_workspace_form_draft(uuid,uuid,integer,jsonb,uuid,uuid,text) from public,anon,authenticated,service_role;

create function app_private.publish_workspace_form(
  p_workspace_id uuid,p_form_id uuid,p_request_id uuid,p_actor_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_version public.form_versions%rowtype;
  policy_version text;
  next_revision integer;
  hash text;
  cached jsonb;
  result jsonb;
begin
  if p_workspace_id is null or p_form_id is null or p_request_id is null or p_actor_user_id is null then
    return jsonb_build_object('status','invalid'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'f15-builder-request:'||p_workspace_id::text||':'||p_actor_user_id::text||':'||p_request_id::text,0));
  hash:=pg_catalog.md5(p_form_id::text);
  cached:=app_private.f15_builder_cached_result(p_workspace_id,p_actor_user_id,p_request_id,'publish',hash);
  if cached is not null then return cached; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'f15-form:'||p_workspace_id::text||':'||p_form_id::text,0));
  select v.* into current_version from public.form_versions v
    where v.workspace_id=p_workspace_id and v.form_id=p_form_id
    order by v.version_number desc limit 1 for update;
  if not found then return jsonb_build_object('status','missing'); end if;
  if current_version.status<>'draft' then return jsonb_build_object('status','invalid'); end if;
  if not app_private.f15_valid_builder_definition(current_version.definition,true) then
    return jsonb_build_object('status','invalid'); end if;
  select p.version into policy_version from app_private.terms_policy_versions p
    where p.policy_kind='terms' and p.status='published'
    order by p.created_at desc,p.version desc limit 1;
  if policy_version is null then return jsonb_build_object('status','policy_required'); end if;
  select coalesce(max(v.version_number),0)+1 into next_revision from public.form_versions v
    where v.workspace_id=p_workspace_id and v.form_id=p_form_id;
  insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status,published_at)
    values(p_workspace_id,p_form_id,next_revision,policy_version,current_version.definition,'published',clock_timestamp());
  result:=jsonb_build_object('status','ok','formId',p_form_id,'revision',next_revision,
    'definition',current_version.definition,'formStatus','published');
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(p_actor_user_id,'form.published','forms',p_form_id,p_workspace_id,
      jsonb_build_object('form_id',p_form_id,'version_number',next_revision));
  perform app_private.f15_builder_store_result(p_workspace_id,p_actor_user_id,p_request_id,'publish',hash,result);
  return result;
end
$$;
alter function app_private.publish_workspace_form(uuid,uuid,uuid,uuid) owner to postgres;
revoke all on function app_private.publish_workspace_form(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function app_private.copy_workspace_form(
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
begin
  if p_workspace_id is null or p_source_form_id is null or p_request_id is null or p_actor_user_id is null then
    return jsonb_build_object('status','invalid'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'f15-builder-request:'||p_workspace_id::text||':'||p_actor_user_id::text||':'||p_request_id::text,0));
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
  insert into public.forms(workspace_id,id,name) values(p_workspace_id,new_form,source_name);
  insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(p_workspace_id,new_form,1,source_version.terms_policy_version,source_version.definition,'draft');
  result:=jsonb_build_object('status','ok','formId',new_form,'revision',1,
    'definition',source_version.definition,'name',source_name,'formStatus','draft');
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(p_actor_user_id,'form.copied','forms',new_form,p_workspace_id,
      jsonb_build_object('form_id',new_form,'source_form_id',p_source_form_id));
  perform app_private.f15_builder_store_result(p_workspace_id,p_actor_user_id,p_request_id,'copy',hash,result);
  return result;
end
$$;
alter function app_private.copy_workspace_form(uuid,uuid,uuid,uuid) owner to postgres;
revoke all on function app_private.copy_workspace_form(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

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

drop function public.retire_workspace_form(uuid,uuid);
create function public.save_workspace_form_draft(
  p_workspace_id uuid,p_form_id uuid,p_expected_revision integer,
  p_definition jsonb,p_request_id uuid,p_name text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_role public.staff_role;
begin
  actor_role:=app_private.current_staff_role();
  if auth.uid() is null or p_workspace_id is null or actor_role is null
    or not app_private.role_has_capability(actor_role,'author_forms')
    or not app_private.has_workspace_access(p_workspace_id,'author_forms')
    or not exists(select 1 from public.workspaces w where w.id=p_workspace_id) then return null; end if;
  return app_private.save_workspace_form_draft(p_workspace_id,p_form_id,p_expected_revision,
    p_definition,p_request_id,auth.uid(),p_name);
exception when others then return jsonb_build_object('status','unavailable');
end
$$;
alter function public.save_workspace_form_draft(uuid,uuid,integer,jsonb,uuid,text) owner to postgres;
revoke all on function public.save_workspace_form_draft(uuid,uuid,integer,jsonb,uuid,text) from public,anon,service_role;
grant execute on function public.save_workspace_form_draft(uuid,uuid,integer,jsonb,uuid,text) to authenticated;

create function public.publish_workspace_form(p_workspace_id uuid,p_form_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_role public.staff_role;
begin
  actor_role:=app_private.current_staff_role();
  if auth.uid() is null or p_workspace_id is null or actor_role is null
    or not app_private.role_has_capability(actor_role,'author_forms')
    or not app_private.has_workspace_access(p_workspace_id,'author_forms')
    or not exists(select 1 from public.workspaces w where w.id=p_workspace_id) then return null; end if;
  return app_private.publish_workspace_form(p_workspace_id,p_form_id,p_request_id,auth.uid());
exception when others then return jsonb_build_object('status','unavailable');
end
$$;
alter function public.publish_workspace_form(uuid,uuid,uuid) owner to postgres;
revoke all on function public.publish_workspace_form(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.publish_workspace_form(uuid,uuid,uuid) to authenticated;

create function public.retire_workspace_form(p_workspace_id uuid,p_form_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_role public.staff_role;
begin
  actor_role:=app_private.current_staff_role();
  if auth.uid() is null or p_workspace_id is null or actor_role is null
    or not app_private.role_has_capability(actor_role,'author_forms')
    or not app_private.has_workspace_access(p_workspace_id,'author_forms')
    or not exists(select 1 from public.workspaces w where w.id=p_workspace_id) then return null; end if;
  return app_private.retire_workspace_form(p_workspace_id,p_form_id,p_request_id,auth.uid());
exception when others then return jsonb_build_object('status','unavailable');
end
$$;
alter function public.retire_workspace_form(uuid,uuid,uuid) owner to postgres;
revoke all on function public.retire_workspace_form(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.retire_workspace_form(uuid,uuid,uuid) to authenticated;

create function public.copy_workspace_form(p_workspace_id uuid,p_source_form_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_role public.staff_role;
begin
  actor_role:=app_private.current_staff_role();
  if auth.uid() is null or p_workspace_id is null or actor_role is null
    or not app_private.role_has_capability(actor_role,'author_forms')
    or not app_private.has_workspace_access(p_workspace_id,'author_forms')
    or not exists(select 1 from public.workspaces w where w.id=p_workspace_id) then return null; end if;
  return app_private.copy_workspace_form(p_workspace_id,p_source_form_id,p_request_id,auth.uid());
exception when others then return jsonb_build_object('status','unavailable');
end
$$;
alter function public.copy_workspace_form(uuid,uuid,uuid) owner to postgres;
revoke all on function public.copy_workspace_form(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.copy_workspace_form(uuid,uuid,uuid) to authenticated;
