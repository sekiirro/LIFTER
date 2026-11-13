-- T013: atomically freeze the first complete submission and its D-03 facts.
create table app_private.form_submissions (
  workspace_id uuid not null,
  assignment_id uuid not null,
  revision integer not null check (revision > 0),
  submitted_at timestamptz not null,
  primary key (workspace_id,assignment_id),
  foreign key (workspace_id,assignment_id)
    references public.form_assignments(workspace_id,id) on delete restrict,
  foreign key (workspace_id,assignment_id,revision)
    references public.form_answer_revisions(workspace_id,assignment_id,revision) on delete restrict
);

create table app_private.form_submission_slas (
  workspace_id uuid not null,
  assignment_id uuid not null,
  rule_id text not null check (rule_id='cairo-d03-v1'),
  start_date date not null,
  day_five_date date not null,
  deadline_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id,assignment_id),
  foreign key (workspace_id,assignment_id)
    references app_private.form_submissions(workspace_id,assignment_id) on delete restrict
);

create table app_private.form_submission_intents (
  workspace_id uuid not null,
  assignment_id uuid not null,
  intent_key uuid not null,
  request_hash bytea not null check (octet_length(request_hash)=32),
  result jsonb not null check (jsonb_typeof(result)='object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id,assignment_id,intent_key),
  foreign key (workspace_id,assignment_id)
    references public.form_assignments(workspace_id,id) on delete restrict
);

alter table app_private.form_submissions enable row level security;
alter table app_private.form_submissions force row level security;
alter table app_private.form_submission_slas enable row level security;
alter table app_private.form_submission_slas force row level security;
alter table app_private.form_submission_intents enable row level security;
alter table app_private.form_submission_intents force row level security;
revoke all on app_private.form_submissions,app_private.form_submission_slas,
  app_private.form_submission_intents from public,anon,authenticated,service_role;

create function app_private.f15_answer_is_present(p_answer jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case jsonb_typeof(p_answer)
    when 'null' then false
    when 'string' then btrim(p_answer #>> '{}') <> ''
    when 'array' then jsonb_array_length(p_answer) > 0
    else p_answer is not null
  end
$$;
alter function app_private.f15_answer_is_present(jsonb) owner to postgres;
revoke all on function app_private.f15_answer_is_present(jsonb) from public,anon,authenticated,service_role;

create function app_private.f15_question_applies(
  p_questions jsonb,p_question jsonb,p_answers jsonb,p_depth integer default 0
) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  rule jsonb := p_question->'when';
  condition jsonb;
  dependency jsonb;
  answer jsonb;
  matches boolean;
  any_match boolean := false;
  all_match boolean := true;
  mode_name text;
begin
  if p_depth > 64 then return false; end if;
  if rule is null or rule='null'::jsonb then return true; end if;
  mode_name := rule->>'mode';
  for condition in select value from jsonb_array_elements(coalesce(rule->'conditions','[]'::jsonb)) loop
    select q.value into dependency from jsonb_array_elements(p_questions) q(value)
    where q.value->>'id'=condition->>'questionId';
    if not found or not app_private.f15_question_applies(p_questions,dependency,p_answers,p_depth+1) then
      matches := false;
    else
      answer := p_answers->(condition->>'questionId');
      if condition->>'operator'='isAnswered' then
        matches := app_private.f15_answer_is_present(answer);
      elsif not app_private.f15_answer_is_present(answer) then
        matches := false;
      elsif condition->>'operator'='equals' then
        matches := answer=condition->'value';
      elsif condition->>'operator'='notEquals' then
        matches := answer is distinct from condition->'value';
      elsif condition->>'operator'='contains' then
        matches := jsonb_typeof(answer)='array' and answer @> jsonb_build_array(condition->'value');
      else
        matches := false;
      end if;
    end if;
    any_match := any_match or matches;
    all_match := all_match and matches;
  end loop;
  if mode_name='all' then return all_match; end if;
  if mode_name='any' then return any_match; end if;
  return false;
end
$$;
alter function app_private.f15_question_applies(jsonb,jsonb,jsonb,integer) owner to postgres;
revoke all on function app_private.f15_question_applies(jsonb,jsonb,jsonb,integer) from public,anon,authenticated,service_role;

create function app_private.f15_submission_complete(p_snapshot jsonb,p_answers jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  question jsonb;
  section_name text;
  has_substantive boolean;
begin
  if jsonb_typeof(p_snapshot->'questions') <> 'array'
    or jsonb_typeof(p_answers) <> 'object' then return false; end if;
  for question in select value from jsonb_array_elements(p_snapshot->'questions') loop
    if app_private.f15_question_applies(p_snapshot->'questions',question,p_answers,0)
      and question->>'required'='true'
      and not app_private.f15_answer_is_present(p_answers->(question->>'id')) then
      return false;
    end if;
  end loop;
  foreach section_name in array array['basic','training','nutrition'] loop
    select exists (
      select 1 from jsonb_array_elements(p_snapshot->'questions') q(value)
      where q.value->>'sectionId'=section_name
        and app_private.f15_question_applies(p_snapshot->'questions',q.value,p_answers,0)
        and app_private.f15_answer_is_present(p_answers->(q.value->>'id'))
    ) into has_substantive;
    if not has_substantive then return false; end if;
  end loop;
  return true;
end
$$;
alter function app_private.f15_submission_complete(jsonb,jsonb) owner to postgres;
revoke all on function app_private.f15_submission_complete(jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.submit_form_assignment(
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

create function app_private.guard_form_draft_after_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from app_private.form_submissions s
    where s.workspace_id=new.workspace_id and s.assignment_id=new.assignment_id) then
    raise exception 'form submission is immutable' using errcode='23514';
  end if;
  return new;
end
$$;
alter function app_private.guard_form_draft_after_submission() owner to postgres;
revoke all on function app_private.guard_form_draft_after_submission() from public,anon,authenticated,service_role;
create trigger form_drafts_after_submission_guard
  before insert or update on public.form_answer_drafts
  for each row execute function app_private.guard_form_draft_after_submission();
