-- S47 Greptile #57 fixes; forward-only replacements preserve prior migrations.

create or replace function app_private.f15_answer_values_valid(
  p_snapshot jsonb,
  p_answers jsonb
) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  entry record;
  question jsonb;
  answer jsonb;
  validation jsonb;
  answer_type text;
  answer_text text;
  value_number numeric;
  minimum numeric;
  maximum numeric;
  step_value numeric;
  min_length integer;
  meal_count integer;
  source_id text;
  parsed_date date;
begin
  if jsonb_typeof(p_snapshot->'questions') is distinct from 'array'
    or jsonb_typeof(p_answers) is distinct from 'object' then return false; end if;

  for entry in select key,value from jsonb_each(p_answers) loop
    select q.value into question
    from jsonb_array_elements(p_snapshot->'questions') q(value)
    where q.value->>'id'=entry.key;
    if not found then return false; end if;

    answer:=entry.value;
    answer_type:=question->>'type';
    validation:=question->'validation';
    answer_text:=case when jsonb_typeof(answer)='string' then answer #>> '{}' else null end;

    if answer_type is null or answer_type not in (
      'shortText','longText','number','singleChoice','multiChoice','boolean','date',
      'slider','imageChoice','mealCount','derivedChoice','displayOnly','profileText','computedAge'
    ) or answer_type in ('displayOnly','profileText','computedAge') then return false; end if;
    if answer_type in ('shortText','longText','singleChoice','imageChoice','mealCount','derivedChoice','date')
      and jsonb_typeof(answer) is distinct from 'string' then return false; end if;

    if answer_type in ('singleChoice','imageChoice','mealCount') then
      if jsonb_typeof(question->'choices') is distinct from 'array'
        or not ((question->'choices') ? answer_text) then return false; end if;
    elsif answer_type='derivedChoice' then
      if jsonb_typeof(question->'choices') is distinct from 'array'
        or not ((question->'choices') ? answer_text) then return false; end if;
      source_id:=question->'derivedOptions'->>'sourceQuestionId';
      if source_id is null or jsonb_typeof(p_answers->source_id) is distinct from 'string' then return false; end if;
      if (p_answers->>source_id) !~ '^[0-9]+$' then return false; end if;
      meal_count:=(p_answers->>source_id)::integer;
      if meal_count<2 or meal_count>5 then return false; end if;
      if not exists(select 1 from generate_series(1,meal_count) n where answer_text='meal-'||n)
        and not (coalesce(question->'derivedOptions'->'fixedChoices','[]'::jsonb) ? answer_text) then return false; end if;
    elsif answer_type='multiChoice' then
      if jsonb_typeof(answer) is distinct from 'array'
        or jsonb_array_length(answer)>50
        or jsonb_typeof(question->'choices') is distinct from 'array' then return false; end if;
      if exists (
        select 1 from jsonb_array_elements(answer) x(value)
        where jsonb_typeof(x.value) is distinct from 'string'
          or not ((question->'choices') ? (x.value #>> '{}'))
      ) or (select count(*) from jsonb_array_elements(answer)) <>
           (select count(distinct x.value) from jsonb_array_elements(answer) x(value)) then return false; end if;
    elsif answer_type='shortText' or answer_type='longText' then
      if jsonb_typeof(validation)='object' and validation ? 'minLength' then
        min_length:=(validation->>'minLength')::integer;
        if char_length(answer_text)<min_length then return false; end if;
      end if;
    elsif answer_type in ('number','slider') then
      if jsonb_typeof(answer) is distinct from 'number' then return false; end if;
      value_number:=(answer #>> '{}')::numeric;
      if jsonb_typeof(validation)='object' then
        if validation ? 'min' then
          minimum:=(validation->>'min')::numeric;
          if value_number<minimum then return false; end if;
        else minimum:=null; end if;
        if validation ? 'max' then
          maximum:=(validation->>'max')::numeric;
          if value_number>maximum then return false; end if;
        else maximum:=null; end if;
        if answer_type='slider' then
          if minimum is null or maximum is null or not (validation ? 'step') then return false; end if;
          step_value:=(validation->>'step')::numeric;
          if step_value<=0 or abs((value_number-minimum)/step_value-round((value_number-minimum)/step_value))>0.000000001 then return false; end if;
        end if;
      elsif answer_type='slider' then return false;
      end if;
    elsif answer_type='boolean' then
      if jsonb_typeof(answer) is distinct from 'boolean' then return false; end if;
    elsif answer_type='date' then
      if btrim(answer_text)<>'' then
        if answer_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
        parsed_date:=answer_text::date;
        if parsed_date::text<>answer_text then return false; end if;
      end if;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end
$$;
alter function app_private.f15_answer_values_valid(jsonb,jsonb) owner to postgres;
revoke all on function app_private.f15_answer_values_valid(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.correct_form_answer(
  p_workspace_id uuid,
  p_assignment_id uuid,
  p_expected_revision integer,
  p_intent_key uuid,
  p_answer_values jsonb,
  p_correction_note text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  assigned_user uuid;
  role public.staff_role;
  current_revision integer;
  next_revision integer;
  request_hash bytea;
  prior app_private.form_correction_intents%rowtype;
  response jsonb;
  snapshot jsonb;
  question jsonb;
  entry record;
  answer_chars integer;
  max_chars integer;
  budget text;
begin
  if actor is null or p_workspace_id is null or p_assignment_id is null
    or p_expected_revision is null or p_expected_revision < 1 or p_intent_key is null
    or jsonb_typeof(p_answer_values) is distinct from 'object'
    or octet_length(p_answer_values::text) > 262144 or p_correction_note is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  if char_length(p_correction_note) > 1000
    or octet_length(p_correction_note) > 4096 then
    return jsonb_build_object('status', 'answer_too_long');
  end if;

  select c.auth_user_id into assigned_user
  from public.form_assignments a
  join public.clients c on c.workspace_id = a.workspace_id and c.id = a.client_id
  where a.workspace_id = p_workspace_id and a.id = p_assignment_id
    and c.approval_state = 'approved';
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  if assigned_user is distinct from actor then
    role := app_private.current_staff_role();
    if role is null
      or not app_private.role_has_capability(role, 'read_form_answers')
      or not app_private.has_workspace_access(p_workspace_id, 'read_form_answers') then
      return jsonb_build_object('status', 'not_permitted');
    end if;
  end if;

  -- Retention facts are the synthetic lifecycle seam until F13 supplies the
  -- authoritative deactivation projection and writer binding.
  if exists (
    select 1 from app_private.form_retention_windows w
    where w.workspace_id = p_workspace_id
      and w.client_id = (select a.client_id from public.form_assignments a
        where a.workspace_id = p_workspace_id and a.id = p_assignment_id)
  ) then
    return jsonb_build_object('status', 'relationship_ended');
  end if;

  perform 1 from public.form_assignments a
  where a.workspace_id = p_workspace_id and a.id = p_assignment_id for update;
  select r.revision into current_revision
  from public.form_answer_revisions r
  where r.workspace_id = p_workspace_id and r.assignment_id = p_assignment_id
  order by r.revision desc limit 1 for update;
  if not found or not exists (
    select 1 from app_private.form_submissions s
    where s.workspace_id = p_workspace_id and s.assignment_id = p_assignment_id
  ) then
    return jsonb_build_object('status', 'not_submitted');
  end if;
  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'expected_revision', p_expected_revision,
    'answers', p_answer_values,
    'note', p_correction_note
  )::text, 'UTF8'), 'sha256');
  select i.* into prior from app_private.form_correction_intents i
  where i.workspace_id = p_workspace_id and i.assignment_id = p_assignment_id
    and i.intent_key = p_intent_key;
  if found then
    if prior.request_hash = request_hash then return prior.result; end if;
    return jsonb_build_object('status', 'conflict', 'revision', current_revision);
  end if;
  if current_revision <> p_expected_revision then
    return jsonb_build_object('status', 'conflict', 'revision', current_revision);
  end if;

  select a.version_snapshot into snapshot
  from public.form_assignments a where a.workspace_id=p_workspace_id and a.id=p_assignment_id;
  if p_answer_values ? 'N08.foods' then
    budget := p_answer_values->>'N08';
    if budget is null or budget not in ('low','medium','high')
      or jsonb_typeof(p_answer_values->'N08.foods') is distinct from 'array' then
      return jsonb_build_object('status','invalid');
    end if;
    if not exists (
      select 1 from jsonb_array_elements(coalesce(snapshot->'questions','[]'::jsonb)) q(value)
      where q.value->>'id'='N08' and q.value->>'type'='singleChoice'
        and q.value->'choices' ? budget
    ) or exists (
      select 1 from jsonb_array_elements_text(p_answer_values->'N08.foods') food(value)
      where food.value not like budget || ':%'
        or not exists (
          select 1 from jsonb_array_elements(coalesce(snapshot->'questions','[]'::jsonb)) q(value)
          where q.value->>'id'='N08.foods' and q.value->>'type'='multiChoice'
            and q.value->'choices' ? food.value
        )
    ) then
      return jsonb_build_object('status','invalid');
    end if;
  end if;

  for entry in select key,value from jsonb_each(p_answer_values) loop
    select q.value into question from jsonb_array_elements(coalesce(snapshot->'questions','[]'::jsonb)) q(value) where q.value->>'id'=entry.key;
    if not found then return jsonb_build_object('status','invalid'); end if;
    if jsonb_typeof(entry.value)='string' then
      answer_chars := char_length(entry.value #>> '{}');
      max_chars := case question->>'type' when 'shortText' then least(150,coalesce((question->>'charLimit')::integer,150)) when 'longText' then least(1000,coalesce((question->>'charLimit')::integer,1000)) else null end;
      if (max_chars is not null and answer_chars > max_chars) or octet_length(entry.value #>> '{}') > 4096 then
        return jsonb_build_object('status','answer_too_long');
      end if;
    end if;
  end loop;
  if not app_private.f15_answer_values_valid(snapshot,p_answer_values) then
    return jsonb_build_object('status','invalid');
  end if;

  next_revision := current_revision + 1;
  insert into public.form_answer_revisions(workspace_id, assignment_id, revision, answer_values)
  values (p_workspace_id, p_assignment_id, next_revision, p_answer_values);
  insert into app_private.form_corrections(
    workspace_id, assignment_id, revision, actor_user_id, correction_note
  ) values (p_workspace_id, p_assignment_id, next_revision, actor, p_correction_note);
  response := jsonb_build_object(
    'status', 'corrected', 'revision', next_revision, 'intent_key', p_intent_key
  );
  insert into app_private.form_correction_intents(
    workspace_id, assignment_id, intent_key, request_hash, result
  ) values (p_workspace_id, p_assignment_id, p_intent_key, request_hash, response);
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (actor, 'form.answer_corrected', 'form_answer_revisions', p_assignment_id,
    p_workspace_id, jsonb_build_object('revision', next_revision));
  return response;
end
$$;
alter function public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text) owner to postgres;
revoke all on function public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text) from public,anon,service_role;
grant execute on function public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text) to authenticated;


create or replace function public.save_form_draft(
  p_workspace_id uuid,
  p_assignment_id uuid,
  p_expected_revision integer,
  p_intent_key uuid,
  p_answer_values jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_revision integer := 0;
  next_revision integer;
  request_hash bytea;
  prior app_private.form_draft_intents%rowtype;
  response jsonb;
  snapshot jsonb;
  question jsonb;
  entry record;
  answer_chars integer;
  max_chars integer;
  budget text;
begin
  if auth.uid() is null or p_workspace_id is null or p_assignment_id is null
    or p_expected_revision is null or p_expected_revision < 0 or p_intent_key is null
    or p_answer_values is null or jsonb_typeof(p_answer_values) <> 'object' then
    return jsonb_build_object('status','invalid');
  end if;
  if not app_private.f15_is_assigned_answer(p_workspace_id,p_assignment_id) then
    return jsonb_build_object('status','not_found');
  end if;

  perform 1 from public.form_assignments a
  where a.workspace_id=p_workspace_id and a.id=p_assignment_id
  for update;
  if not found then return jsonb_build_object('status','not_found'); end if;

  if exists (select 1 from app_private.form_submissions s
    where s.workspace_id=p_workspace_id and s.assignment_id=p_assignment_id) then
    return jsonb_build_object('status','already_submitted');
  end if;

  if octet_length(p_answer_values::text) > 262144 then
    return jsonb_build_object('status','payload_too_large');
  end if;
  select a.version_snapshot into snapshot
  from public.form_assignments a
  where a.workspace_id=p_workspace_id and a.id=p_assignment_id;
  if p_answer_values ? 'N08.foods' then
    budget := p_answer_values->>'N08';
    if budget is null or budget not in ('low','medium','high')
      or jsonb_typeof(p_answer_values->'N08.foods') is distinct from 'array' then
      return jsonb_build_object('status','invalid');
    end if;
    if not exists (
      select 1 from jsonb_array_elements(coalesce(snapshot->'questions','[]'::jsonb)) q(value)
      where q.value->>'id'='N08' and q.value->>'type'='singleChoice'
        and q.value->'choices' ? budget
    ) or exists (
      select 1 from jsonb_array_elements_text(p_answer_values->'N08.foods') food(value)
      where food.value not like budget || ':%'
        or not exists (
          select 1 from jsonb_array_elements(coalesce(snapshot->'questions','[]'::jsonb)) q(value)
          where q.value->>'id'='N08.foods' and q.value->>'type'='multiChoice'
            and q.value->'choices' ? food.value
        )
    ) then
      return jsonb_build_object('status','invalid');
    end if;
  end if;

  for entry in select key,value from jsonb_each(p_answer_values) loop
    select q.value into question
    from jsonb_array_elements(coalesce(snapshot->'questions','[]'::jsonb)) q(value)
    where q.value->>'id'=entry.key;
    if not found then return jsonb_build_object('status','invalid'); end if;
    if jsonb_typeof(entry.value)='string' then
      answer_chars := char_length(entry.value #>> '{}');
      max_chars := case question->>'type'
        when 'shortText' then least(150,coalesce((question->>'charLimit')::integer,150))
        when 'longText' then least(1000,coalesce((question->>'charLimit')::integer,1000))
        else null
      end;
      if max_chars is not null and answer_chars > max_chars then
        return jsonb_build_object('status','answer_too_long');
      end if;
    end if;
  end loop;
  if exists (
    select 1 from jsonb_each(p_answer_values) e
    where jsonb_typeof(e.value)='string'
      and octet_length(e.value #>> '{}') > 4096
  ) then
    return jsonb_build_object('status','answer_too_long');
  end if;
  if not app_private.f15_answer_values_valid(snapshot,p_answer_values) then
    return jsonb_build_object('status','invalid');
  end if;

  select coalesce(d.revision,0) into current_revision
  from public.form_answer_drafts d
  where d.workspace_id=p_workspace_id and d.assignment_id=p_assignment_id;
  if not found then current_revision := 0; end if;

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'expected_revision',p_expected_revision,
    'answer_values',p_answer_values
  )::text,'UTF8'),'sha256');
  select i.* into prior from app_private.form_draft_intents i
  where i.workspace_id=p_workspace_id and i.assignment_id=p_assignment_id
    and i.intent_key=p_intent_key;
  if found then
    if prior.request_hash=request_hash then return prior.result; end if;
    return jsonb_build_object('status','conflict','revision',current_revision);
  end if;

  if p_expected_revision <> current_revision then
    return jsonb_build_object('status','conflict','revision',current_revision);
  end if;
  next_revision := current_revision + 1;
  insert into public.form_answer_drafts(workspace_id,assignment_id,revision,answer_values)
  values(p_workspace_id,p_assignment_id,next_revision,p_answer_values)
  on conflict (workspace_id,assignment_id) do update
    set revision=excluded.revision, answer_values=excluded.answer_values, updated_at=clock_timestamp();
  response := jsonb_build_object('status','saved','revision',next_revision,'intent_key',p_intent_key);
  insert into app_private.form_draft_intents(workspace_id,assignment_id,intent_key,request_hash,result)
  values(p_workspace_id,p_assignment_id,p_intent_key,request_hash,response);
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
  values(auth.uid(),'form.draft_saved','form_answer_drafts',p_assignment_id,p_workspace_id,
    jsonb_build_object('revision',next_revision));
  return response;
end
$$;
alter function public.save_form_draft(uuid,uuid,integer,uuid,jsonb) owner to postgres;
revoke all on function public.save_form_draft(uuid,uuid,integer,uuid,jsonb) from public,anon,service_role;
grant execute on function public.save_form_draft(uuid,uuid,integer,uuid,jsonb) to authenticated;


create or replace function public.submit_form_assignment(
  p_workspace_id uuid,p_assignment_id uuid,p_expected_revision integer,p_intent_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  snapshot jsonb;
  draft public.form_answer_drafts%rowtype;
  prior app_private.form_submission_intents%rowtype;
  request_hash bytea;
  submission_time timestamptz;
  local_day date;
  local_time time;
  start_day date;
  day_five date;
  deadline timestamptz;
  working_days integer := 0;
  next_revision integer;
  response jsonb;
begin
  if actor is null or p_workspace_id is null or p_assignment_id is null
    or p_expected_revision is null or p_expected_revision < 1 or p_intent_key is null then
    return jsonb_build_object('status','invalid');
  end if;
  if not app_private.f15_is_assigned_answer(p_workspace_id,p_assignment_id) then
    return jsonb_build_object('status','not_found');
  end if;
  select a.version_snapshot into snapshot from public.form_assignments a
  where a.workspace_id=p_workspace_id and a.id=p_assignment_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select d.* into draft from public.form_answer_drafts d
  where d.workspace_id=p_workspace_id and d.assignment_id=p_assignment_id for update;
  if not found then return jsonb_build_object('status','incomplete'); end if;
  if draft.revision<>p_expected_revision then
    return jsonb_build_object('status','conflict','revision',draft.revision);
  end if;
  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'expected_revision',p_expected_revision,'answers',draft.answer_values
  )::text,'UTF8'),'sha256');
  select i.* into prior from app_private.form_submission_intents i
  where i.workspace_id=p_workspace_id and i.assignment_id=p_assignment_id and i.intent_key=p_intent_key;
  if found then
    if prior.request_hash=request_hash then return prior.result; end if;
    return jsonb_build_object('status','conflict','revision',draft.revision);
  end if;
  if exists (select 1 from app_private.form_submissions s
    where s.workspace_id=p_workspace_id and s.assignment_id=p_assignment_id) then
    return jsonb_build_object('status','already_submitted');
  end if;
  if not app_private.f15_answer_values_valid(snapshot,draft.answer_values) then
    return jsonb_build_object('status','invalid');
  end if;
  if not app_private.f15_submission_complete(snapshot,draft.answer_values) then
    return jsonb_build_object('status','incomplete');
  end if;

  submission_time := clock_timestamp();
  local_day := (submission_time at time zone 'Africa/Cairo')::date;
  local_time := (submission_time at time zone 'Africa/Cairo')::time;
  start_day := local_day;
  if extract(dow from start_day)=5 or local_time >= time '18:00' then
    start_day := start_day + 1;
    while extract(dow from start_day)=5 loop start_day := start_day+1; end loop;
  end if;
  day_five := start_day;
  while working_days < 5 loop
    if extract(dow from day_five)<>5 then working_days := working_days+1; end if;
    if working_days<5 then day_five := day_five+1; end if;
  end loop;
  deadline := (day_five+1)::timestamp at time zone 'Africa/Cairo';
  select coalesce(max(r.revision),0)+1 into next_revision
  from public.form_answer_revisions r
  where r.workspace_id=p_workspace_id and r.assignment_id=p_assignment_id;
  next_revision := greatest(next_revision,draft.revision+1);
  insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
  values(p_workspace_id,p_assignment_id,next_revision,draft.answer_values);
  insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
  values(p_workspace_id,p_assignment_id,next_revision,submission_time);
  insert into app_private.form_submission_slas(
    workspace_id,assignment_id,rule_id,start_date,day_five_date,deadline_at
  ) values(p_workspace_id,p_assignment_id,'cairo-d03-v1',start_day,day_five,deadline);
  response := jsonb_build_object('status','submitted','revision',next_revision,
    'submitted_at',submission_time,'start_date',start_day,'day_five_date',day_five,
    'deadline_at',deadline,'rule_id','cairo-d03-v1');
  insert into app_private.form_submission_intents(workspace_id,assignment_id,intent_key,request_hash,result)
  values(p_workspace_id,p_assignment_id,p_intent_key,request_hash,response);
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
  values(actor,'form.submitted','form_submissions',p_assignment_id,p_workspace_id,
    jsonb_build_object('revision',next_revision,'rule_id','cairo-d03-v1'));
  return response;
end
$$;
alter function public.submit_form_assignment(uuid,uuid,integer,uuid) owner to postgres;
revoke all on function public.submit_form_assignment(uuid,uuid,integer,uuid) from public,anon,service_role;
grant execute on function public.submit_form_assignment(uuid,uuid,integer,uuid) to authenticated;

create or replace function public.read_form_assignment_context(p_assignment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  context jsonb;
begin
  if auth.uid() is null or p_assignment_id is null then return null; end if;
  select jsonb_build_object(
    'workspace_id',a.workspace_id,
    'version_snapshot',a.version_snapshot,
    'signup_profile',jsonb_build_object(
      'full_name',c.name,
      'date_of_birth',c.date_of_birth
    ),
    'relationship_active',c.deactivated_at is null
  ) into context
  from public.form_assignments a
  join public.clients c on c.workspace_id=a.workspace_id and c.id=a.client_id
  where a.id=p_assignment_id and c.auth_user_id=auth.uid() and c.approval_state='approved';
  return context;
end
$$;
