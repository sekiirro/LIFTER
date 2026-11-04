-- F15 T087: return a bounded business status for autosave after submission.

create function public.save_form_draft(
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
  if exists (
    select 1 from jsonb_each(p_answer_values) e
    where jsonb_typeof(e.value)='string'
      and octet_length(e.value #>> '{}') > 4096
  ) then
    return jsonb_build_object('status','answer_too_long');
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
revoke all on function public.save_form_draft(uuid,uuid,integer,uuid,jsonb) from public, anon, service_role;
grant execute on function public.save_form_draft(uuid,uuid,integer,uuid,jsonb) to authenticated;

