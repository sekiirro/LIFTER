-- T014: append-only correction metadata and answer revisions. Staff capability
-- mappings are intentionally consumed by name and reconciled after F14/F13.
create table app_private.form_corrections (
  workspace_id uuid not null,
  assignment_id uuid not null,
  revision integer not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  correction_note text not null,
  created_at timestamptz not null default clock_timestamp(),
  check (revision > 1),
  primary key (workspace_id, assignment_id, revision),
  foreign key (workspace_id, assignment_id, revision)
    references public.form_answer_revisions(workspace_id, assignment_id, revision) on delete restrict
);

create table app_private.form_correction_intents (
  workspace_id uuid not null,
  assignment_id uuid not null,
  intent_key uuid not null,
  request_hash bytea not null check (octet_length(request_hash) = 32),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, assignment_id, intent_key),
  foreign key (workspace_id, assignment_id)
    references public.form_assignments(workspace_id, id) on delete restrict
);

alter table app_private.form_corrections enable row level security;
alter table app_private.form_corrections force row level security;
alter table app_private.form_correction_intents enable row level security;
alter table app_private.form_correction_intents force row level security;
revoke all on app_private.form_corrections, app_private.form_correction_intents
  from public, anon, authenticated, service_role;

create function app_private.guard_form_correction_immutable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'form corrections are immutable' using errcode = '23514';
end
$$;
alter function app_private.guard_form_correction_immutable() owner to postgres;
revoke all on function app_private.guard_form_correction_immutable()
  from public, anon, authenticated, service_role;
create trigger form_corrections_immutable
  before update or delete on app_private.form_corrections
  for each row execute function app_private.guard_form_correction_immutable();
create trigger form_correction_intents_immutable
  before update or delete on app_private.form_correction_intents
  for each row execute function app_private.guard_form_correction_immutable();

create function public.correct_form_answer(
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
revoke all on function public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text)
  from public, anon, service_role;
grant execute on function public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text)
  to authenticated;

-- Keep every history read on the same audited reader, adding note metadata only
-- to revisions that have a correction record.
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
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'revision', r.revision,
        'answers', r.answer_values,
        'correction_actor', c.actor_user_id,
        'corrected_at', c.created_at,
        'correction_note', c.correction_note
      )) order by r.revision), max(r.revision)
    into answer_result, viewed_revision
    from public.form_answer_revisions r
    left join app_private.form_corrections c
      on c.workspace_id = r.workspace_id and c.assignment_id = r.assignment_id
      and c.revision = r.revision
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
