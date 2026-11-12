-- F15 T148 / FR-013: explicit correction removals with S50-R12 validation.
-- Copied from 20261112031700_f15_direct_rpc_answer_validation.sql; forward-only replacement.

drop function public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text);

create function public.correct_form_answer(
  p_workspace_id uuid,
  p_assignment_id uuid,
  p_expected_revision integer,
  p_intent_key uuid,
  p_answer_values jsonb,
  p_correction_note text,
  p_remove jsonb default '[]'::jsonb
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
  current_answers jsonb;
  revised_answers jsonb;
  question jsonb;
  entry record;
  answer_chars integer;
  max_chars integer;
  budget text;
  removed_id text;
begin
  if actor is null or p_workspace_id is null or p_assignment_id is null
    or p_expected_revision is null or p_expected_revision < 1 or p_intent_key is null
    or jsonb_typeof(p_answer_values) is distinct from 'object'
    or jsonb_typeof(p_remove) is distinct from 'array' or p_correction_note is null then
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
  select r.revision,r.answer_values into current_revision,current_answers
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
    'remove', p_remove,
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
  if octet_length(jsonb_build_object('answer_values',p_answer_values,'remove',p_remove,'correction_note',p_correction_note)::text) > 262144 then
    return jsonb_build_object('status','payload_too_large');
  end if;
  if jsonb_array_length(p_remove) > jsonb_array_length(coalesce(snapshot->'questions','[]'::jsonb))
    or exists (select 1 from jsonb_array_elements(p_remove) x(value) where jsonb_typeof(x.value) is distinct from 'string')
    or (select count(*) from jsonb_array_elements(p_remove)) <> (select count(distinct x.value #>> '{}') from jsonb_array_elements(p_remove) x(value))
    or exists (
      select 1 from jsonb_array_elements(p_remove) x(value)
      where (x.value #>> '{}') !~ '^[A-Za-z0-9_.-]{1,64}$'
        or not exists (select 1 from jsonb_array_elements(coalesce(snapshot->'questions','[]'::jsonb)) q(value) where q.value->>'id'=x.value #>> '{}')
        or p_answer_values ? (x.value #>> '{}')
    ) then
    return jsonb_build_object('status','invalid');
  end if;
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

  revised_answers := coalesce(current_answers,'{}'::jsonb) || p_answer_values;
  for removed_id in select value #>> '{}' from jsonb_array_elements(p_remove) loop
    select q.value into question from jsonb_array_elements(coalesce(snapshot->'questions','[]'::jsonb)) q(value) where q.value->>'id'=removed_id;
    if question->>'required'='true'
      and app_private.f15_question_applies(snapshot->'questions',question,current_answers,0)
      and app_private.f15_answer_is_present(current_answers->removed_id) then
      return jsonb_build_object('status','invalid');
    end if;
    revised_answers := revised_answers - removed_id;
  end loop;
  for question in select value from jsonb_array_elements(coalesce(snapshot->'questions','[]'::jsonb)) loop
    if question->>'required'='true'
      and app_private.f15_question_applies(snapshot->'questions',question,revised_answers,0)
      and app_private.f15_answer_is_present(current_answers->(question->>'id'))
      and p_answer_values ? (question->>'id')
      and not app_private.f15_answer_is_present(p_answer_values->(question->>'id')) then
      return jsonb_build_object('status','invalid');
    end if;
  end loop;
  next_revision := current_revision + 1;
  insert into public.form_answer_revisions(workspace_id, assignment_id, revision, answer_values)
  values (p_workspace_id, p_assignment_id, next_revision, revised_answers);
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
alter function public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text,jsonb) owner to postgres;
revoke all on function public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text,jsonb) from public,anon,service_role;
grant execute on function public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text,jsonb) to authenticated;
