-- S35 T102: N08 food chips must belong to the submitted budget in the assignment snapshot.
create or replace function app_private.enforce_n08_budget_answer_consistency()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  snapshot jsonb;
  budget text;
begin
  if not (new.answer_values ? 'N08.foods') then return new; end if;
  budget := new.answer_values->>'N08';
  if budget is null or budget not in ('low', 'medium', 'high')
    or jsonb_typeof(new.answer_values->'N08.foods') is distinct from 'array'
    or exists (
      select 1 from jsonb_array_elements_text(new.answer_values->'N08.foods') food(value)
      where food.value not like budget || ':%'
    ) then
    raise exception 'invalid_form_answer_snapshot' using errcode = '23514';
  end if;

  select a.version_snapshot into snapshot
  from public.form_assignments a
  where a.workspace_id = new.workspace_id and a.id = new.assignment_id;
  if not found or not exists (
    select 1 from jsonb_array_elements(coalesce(snapshot->'questions', '[]'::jsonb)) q(value)
    where q.value->>'id' = 'N08'
      and q.value->>'type' = 'singleChoice'
      and q.value->'choices' ? budget
  ) or exists (
    select 1 from jsonb_array_elements_text(new.answer_values->'N08.foods') food(value)
    where not exists (
      select 1 from jsonb_array_elements(coalesce(snapshot->'questions', '[]'::jsonb)) q(value)
      where q.value->>'id' = 'N08.foods'
        and q.value->>'type' = 'multiChoice'
        and q.value->'choices' ? food.value
    )
  ) then
    raise exception 'invalid_form_answer_snapshot' using errcode = '23514';
  end if;
  return new;
end
$$;
alter function app_private.enforce_n08_budget_answer_consistency() owner to postgres;
revoke all on function app_private.enforce_n08_budget_answer_consistency() from public, anon, authenticated, service_role;

create trigger form_answer_drafts_n08_budget_consistency
before insert or update of answer_values on public.form_answer_drafts
for each row execute function app_private.enforce_n08_budget_answer_consistency();

create trigger form_answer_revisions_n08_budget_consistency
before insert or update of answer_values on public.form_answer_revisions
for each row execute function app_private.enforce_n08_budget_answer_consistency();
