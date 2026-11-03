-- FR-006/FR-008: completion follows applicable required questions only.
create or replace function app_private.f15_submission_complete(
  p_snapshot jsonb,
  p_answers jsonb
) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  question jsonb;
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
  return true;
end
$$;
alter function app_private.f15_submission_complete(jsonb,jsonb) owner to postgres;
revoke all on function app_private.f15_submission_complete(jsonb,jsonb)
  from public,anon,authenticated,service_role;
