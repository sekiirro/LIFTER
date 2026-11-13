-- S34-PO-2: enforce the approved correction-note text bounds in the RPC.
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
