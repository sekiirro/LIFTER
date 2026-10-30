-- T012: expose only the assigned client's immutable validation snapshot and
-- repeat approved answer byte/code-point bounds inside the write boundary.
create function public.read_form_assignment_context(p_assignment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  context jsonb;
begin
  if auth.uid() is null or p_assignment_id is null then return null; end if;
  select jsonb_build_object(
    'workspace_id',a.workspace_id,
    'version_snapshot',a.version_snapshot
  ) into context
  from public.form_assignments a
  join public.clients c on c.workspace_id=a.workspace_id and c.id=a.client_id
  where a.id=p_assignment_id and c.auth_user_id=auth.uid() and c.approval_state='approved';
  return context;
end
$$;
alter function public.read_form_assignment_context(uuid) owner to postgres;
revoke all on function public.read_form_assignment_context(uuid) from public, anon, service_role;
grant execute on function public.read_form_assignment_context(uuid) to authenticated;

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
  answer_bytes integer;
  payload_bytes bigint := 0;
begin
  if auth.uid() is null or p_workspace_id is null or p_assignment_id is null
    or p_expected_revision is null or p_expected_revision < 0 or p_intent_key is null
    or p_answer_values is null or jsonb_typeof(p_answer_values) <> 'object' then
    return jsonb_build_object('status','invalid');
  end if;
  if not app_private.f15_is_assigned_answer(p_workspace_id,p_assignment_id) then
    return jsonb_build_object('status','not_found');
  end if;

  select a.version_snapshot into snapshot from public.form_assignments a
  where a.workspace_id=p_workspace_id and a.id=p_assignment_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;

  for entry in select key,value from jsonb_each(p_answer_values) loop
    payload_bytes := payload_bytes + octet_length(entry.value::text);
    select q.value into question
    from jsonb_array_elements(coalesce(snapshot->'questions','[]'::jsonb)) q(value)
    where q.value->>'id'=entry.key;
    if not found then return jsonb_build_object('status','invalid'); end if;
    if jsonb_typeof(entry.value)='string' then
      answer_chars := char_length(entry.value #>> '{}');
      answer_bytes := octet_length(entry.value #>> '{}');
      max_chars := case question->>'type'
        when 'shortText' then least(150,coalesce((question->>'charLimit')::integer,150))
        when 'longText' then least(1000,coalesce((question->>'charLimit')::integer,1000))
        else null
      end;
      if answer_bytes > 4096 or (max_chars is not null and answer_chars > max_chars) then
        return jsonb_build_object('status','answer_too_long');
      end if;
    end if;
  end loop;
  if payload_bytes > 262144 then return jsonb_build_object('status','payload_too_large'); end if;

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
