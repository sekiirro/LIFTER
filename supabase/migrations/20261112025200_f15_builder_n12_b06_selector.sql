-- S33 review: preserve the approved B06 selector identifier alongside the legacy sex identifier.
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
      or jsonb_typeof(question->'labels'->'middle') is distinct from 'string'
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
      question_id not in ('sex','B06') or answer_type<>'singleChoice' or (question->>'required')::boolean is not true
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
