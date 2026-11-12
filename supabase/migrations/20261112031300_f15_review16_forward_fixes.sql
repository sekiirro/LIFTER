-- F15 CodeRabbit round 16 forward corrections; preserve the pushed migration history.
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
  snapshot jsonb;
  question jsonb;
  entry record;
  answer_chars integer;
  max_chars integer;
  budget text;
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

  select a.version_snapshot into snapshot
  from public.form_assignments a where a.workspace_id=p_workspace_id and a.id=p_assignment_id;
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
revoke all on function public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text) from public,anon,service_role;
grant execute on function public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text) to authenticated;

create or replace function public.select_default_onboarding_form(
  p_workspace_id uuid,p_form_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.staff_role;
begin
  actor_role:=app_private.current_staff_role();
  if auth.uid() is null or p_workspace_id is null or p_form_id is null
    or actor_role is null
    or not app_private.role_has_capability(actor_role,'author_forms')
    or not app_private.has_workspace_access(p_workspace_id,'author_forms')
    or not exists(select 1 from public.workspaces w where w.id=p_workspace_id) then
    return null;
  end if;
  if actor_role not in ('platform_owner','workspace_owner') then
    return jsonb_build_object('status','forbidden');
  end if;
  perform app_private.ensure_default_onboarding_form(p_workspace_id,auth.uid());
  if not app_private.set_default_onboarding_form(p_workspace_id,p_form_id,auth.uid()) then
    return jsonb_build_object('status','missing');
  end if;
  return jsonb_build_object('status','ok');
exception when others then
  return jsonb_build_object('status','unavailable');
end
$$;
alter function public.select_default_onboarding_form(uuid,uuid) owner to postgres;
revoke all on function public.select_default_onboarding_form(uuid,uuid) from public,anon,service_role;
grant execute on function public.select_default_onboarding_form(uuid,uuid) to authenticated;

create or replace function public.configure_intake_assignment_policy(
  p_workspace_id uuid,p_form_id uuid,p_version_number integer,p_audience_kind text,
  p_specific_client_ids uuid[],p_trigger_kind text,p_timing jsonb,p_stop_conditions jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); role public.staff_role; result uuid; ids uuid[]:=coalesce(p_specific_client_ids,'{}');
begin
  if actor is null or p_workspace_id is null or p_form_id is null or p_version_number is null then return '{"status":"not_found"}'::jsonb; end if;
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form') or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then return '{"status":"not_found"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text||':'||p_form_id::text,0));
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form') or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then raise exception 'assignment policy authorization changed while waiting'; end if;
  if p_audience_kind not in ('all_active_clients','new_clients','specific_clients') or p_trigger_kind not in ('manual','joining','onboarding','renewal','recurring')
    or p_timing is null or jsonb_typeof(p_timing)<>'object' or coalesce(p_stop_conditions,'{}'::jsonb)<>'{"frozen":true,"inactive":true}'::jsonb
    or ((p_audience_kind='specific_clients')<>(cardinality(ids)>0))
    or (p_timing ? 'client_deadline_days' and (p_timing->>'client_deadline_days') !~ '^[0-9]+$')
    or coalesce((p_timing->>'client_deadline_days')::integer,3) not between 1 and 14
    or (p_trigger_kind='recurring' and (coalesce(p_timing->>'recurrence_interval_days','') !~ '^[0-9]+$'
       or coalesce((p_timing->>'recurrence_interval_days')::integer,0) not between 1 and 365 or (p_timing->>'recurrence_starts_on') is null
       or (p_timing->>'recurrence_starts_on')::date is null))
    or (p_trigger_kind<>'recurring' and p_timing ? 'recurrence_interval_days')
    or exists(select 1 from unnest(ids) x where not exists(select 1 from public.clients c where c.workspace_id=p_workspace_id and c.id=x and c.approval_state='approved'))
    or not exists(select 1 from public.form_versions v where v.workspace_id=p_workspace_id and v.form_id=p_form_id and v.version_number=p_version_number and v.status='published' and app_private.f15_current_terms_policy(v.terms_policy_version)) then
    return '{"status":"not_found"}'::jsonb;
  end if;
  insert into app_private.form_assignment_policies(workspace_id,form_id,version_number,audience_kind,specific_client_ids,trigger_kind,timing,stop_conditions,configured_by)
  values(p_workspace_id,p_form_id,p_version_number,p_audience_kind,ids,p_trigger_kind,p_timing,'{"frozen":true,"inactive":true}'::jsonb,actor)
  on conflict(workspace_id,form_id) do update set version_number=excluded.version_number,audience_kind=excluded.audience_kind,specific_client_ids=excluded.specific_client_ids,
    trigger_kind=excluded.trigger_kind,timing=excluded.timing,stop_conditions=excluded.stop_conditions,configured_by=excluded.configured_by,
    configured_at=case when app_private.form_assignment_policies.audience_kind is distinct from excluded.audience_kind
      then transaction_timestamp() else app_private.form_assignment_policies.configured_at end,
    updated_at=transaction_timestamp()
  returning id into result;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details) values(actor,'form.assignment_policy_configured','form_assignment_policies',result,p_workspace_id,
    jsonb_build_object('form_id',p_form_id,'version_number',p_version_number,'audience_kind',p_audience_kind,'trigger_kind',p_trigger_kind));
  return jsonb_build_object('status','configured');
exception when others then return '{"status":"not_found"}'::jsonb;
end $$;
grant execute on function public.configure_intake_assignment_policy(uuid,uuid,integer,text,uuid[],text,jsonb,jsonb) to authenticated;
