-- T022: expose a bounded post-approval destination only for an existing,
-- unsubmitted assignment belonging to the authenticated approved client.
create function public.read_client_intake_destination() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target_workspace_id uuid;
  target_client_id uuid;
  assignment_id uuid;
  assignment_count integer;
begin
  if auth.uid() is null then return null; end if;

  select c.workspace_id, c.id into target_workspace_id, target_client_id
  from public.clients c
  where c.auth_user_id=auth.uid() and c.approval_state='approved';
  if not found then return null; end if;

  select count(*)::integer, (array_agg(a.id order by a.id))[1]
    into assignment_count, assignment_id
  from public.form_assignments a
  where a.workspace_id=target_workspace_id and a.client_id=target_client_id
    and not exists (
      select 1 from app_private.form_submissions s
      where s.workspace_id=a.workspace_id and s.assignment_id=a.id
    );

  if assignment_count=1 then
    return jsonb_build_object('status','ok','assignment_id',assignment_id);
  end if;
  return jsonb_build_object('status','ok','assignment_id',null);
end
$$;
alter function public.read_client_intake_destination() owner to postgres;
revoke all on function public.read_client_intake_destination() from public,anon,service_role;
grant execute on function public.read_client_intake_destination() to authenticated;

-- Combine revision and values in one locked read. The value itself is returned
-- only by the audited reader; the lock keeps its revision paired with it.
create function public.read_client_form_draft(p_assignment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  context jsonb;
  target_workspace_id uuid;
  revision_number integer;
  answer_values jsonb;
begin
  if auth.uid() is null or p_assignment_id is null then
    return jsonb_build_object('status','not_found');
  end if;
  context := public.read_form_assignment_context(p_assignment_id);
  if context is null then return jsonb_build_object('status','not_found'); end if;
  target_workspace_id := (context->>'workspace_id')::uuid;

  select d.revision into revision_number
  from public.form_answer_drafts d
  where d.workspace_id=target_workspace_id and d.assignment_id=p_assignment_id
  for share;
  if not found then
    return jsonb_build_object('status','loaded','revision',0,'answers','{}'::jsonb);
  end if;

  answer_values := public.read_form_answer(target_workspace_id,p_assignment_id,'draft');
  if answer_values is null then return jsonb_build_object('status','not_found'); end if;
  return jsonb_build_object('status','loaded','revision',revision_number,'answers',answer_values);
end
$$;
alter function public.read_client_form_draft(uuid) owner to postgres;
revoke all on function public.read_client_form_draft(uuid) from public,anon,service_role;
grant execute on function public.read_client_form_draft(uuid) to authenticated;
