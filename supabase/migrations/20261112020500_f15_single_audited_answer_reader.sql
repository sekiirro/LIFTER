-- T004/T014: route current, draft, and history reads through one audited body.
create or replace function public.read_form_answer(
  p_workspace_id uuid,
  p_assignment_id uuid,
  p_view text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  client_user uuid;
  role public.staff_role;
  answer_result jsonb;
  viewed_revision integer;
begin
  if actor is null or p_view is null or p_view not in ('current', 'draft', 'history') then
    return null;
  end if;

  select c.auth_user_id into client_user
  from public.form_assignments a
  join public.clients c on c.workspace_id = a.workspace_id and c.id = a.client_id
  where a.workspace_id = p_workspace_id and a.id = p_assignment_id
    and c.approval_state = 'approved';
  if not found then return null; end if;

  if client_user is distinct from actor then
    role := app_private.current_staff_role();
    if role is null
      or not app_private.role_has_capability(role, 'read_form_answers')
      or not app_private.has_workspace_access(p_workspace_id, 'read_form_answers') then
      return null;
    end if;
  end if;

  if p_view = 'draft' then
    select d.answer_values, d.revision into answer_result, viewed_revision
    from public.form_answer_drafts d
    where d.workspace_id = p_workspace_id and d.assignment_id = p_assignment_id;
  elsif p_view = 'history' then
    select jsonb_agg(jsonb_build_object('revision', r.revision, 'answers', r.answer_values)
                     order by r.revision), max(r.revision)
      into answer_result, viewed_revision
    from public.form_answer_revisions r
    where r.workspace_id = p_workspace_id and r.assignment_id = p_assignment_id;
  else
    select r.answer_values, r.revision into answer_result, viewed_revision
    from public.form_answer_revisions r
    where r.workspace_id = p_workspace_id and r.assignment_id = p_assignment_id
    order by r.revision desc limit 1;
  end if;
  if answer_result is null then return null; end if;

  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (actor, 'form.answer_viewed', 'form_answer_' || p_view, p_assignment_id,
    p_workspace_id, jsonb_build_object('view', p_view, 'revision', viewed_revision));

  return answer_result;
end
$$;
alter function public.read_form_answer(uuid,uuid,text) owner to postgres;
revoke all on function public.read_form_answer(uuid,uuid,text) from public, anon, service_role;
grant execute on function public.read_form_answer(uuid,uuid,text) to authenticated;

-- Preserve the original current-answer RPC shape as a thin delegate. All data
-- reads and audit ordering remain in the mode-aware reader above.
create or replace function public.read_form_answer(p_workspace_id uuid, p_assignment_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select public.read_form_answer(p_workspace_id, p_assignment_id, 'current')
$$;
alter function public.read_form_answer(uuid,uuid) owner to postgres;
revoke all on function public.read_form_answer(uuid,uuid) from public, anon, service_role;
grant execute on function public.read_form_answer(uuid,uuid) to authenticated;
