-- F24: client_goal_read must not touch F15 raw answer tables (F15 T048
-- privacy guard: no authenticated-callable public function other than F15's
-- own readers/writers may reference form_answer_revisions/form_answer_drafts).
-- "Submitted" is now taken from app_private.form_submissions, which holds
-- only submission metadata (assignment, revision, time). The answer itself
-- is still read only through F15's audited public.read_form_answer.
-- Same signature, owner and grants (create or replace keeps privileges).
create or replace function public.client_goal_read(p_workspace_id uuid, p_client_id uuid)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare goal text; reference uuid;
begin
  if auth.uid() is null or p_workspace_id is null
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    return '{"status":"not_permitted"}'::jsonb;
  end if;
  if p_client_id is null or not exists(select 1 from public.clients c
      where c.workspace_id=p_workspace_id and c.id=p_client_id) then
    return '{"status":"not_found"}'::jsonb;
  end if;
  select g.goal_type into goal from public.client_goal_types g
    where g.workspace_id=p_workspace_id and g.client_id=p_client_id;
  select a.id into reference from public.form_assignments a
    join app_private.form_submissions s on s.workspace_id=a.workspace_id and s.assignment_id=a.id
    where a.workspace_id=p_workspace_id and a.client_id=p_client_id
      and exists(select 1 from jsonb_array_elements(
          case when jsonb_typeof(a.version_snapshot->'questions')='array'
            then a.version_snapshot->'questions' else '[]'::jsonb end) q
        where q->>'id'='T01')
    order by s.submitted_at desc, a.id desc
    limit 1;
  return jsonb_build_object('status', 'ok', 'goal_type', goal, 'reference_assignment_id', reference);
end $$;
