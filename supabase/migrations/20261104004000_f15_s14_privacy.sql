-- F15 S14 private answers, audited reads, legal holds, and relationship-end purge.
create table public.form_answer_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  assignment_id uuid not null,
  revision integer not null check (revision > 0),
  answer_values jsonb not null check (jsonb_typeof(answer_values) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, assignment_id, revision),
  foreign key (workspace_id, assignment_id)
    references public.form_assignments(workspace_id, id) on delete restrict
);

create table public.form_answer_drafts (
  workspace_id uuid not null,
  assignment_id uuid not null,
  revision integer not null check (revision > 0),
  answer_values jsonb not null check (jsonb_typeof(answer_values) = 'object'),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, assignment_id),
  foreign key (workspace_id, assignment_id)
    references public.form_assignments(workspace_id, id) on delete restrict
);

create index form_answer_revisions_assignment_idx
  on public.form_answer_revisions(workspace_id, assignment_id, revision desc);

create table app_private.form_retention_windows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  source_event_id uuid not null,
  source_kind text not null check (source_kind in ('closure', 'refund', 'deactivation')),
  ended_at timestamptz not null,
  purge_after timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, client_id, source_event_id),
  foreign key (workspace_id, client_id)
    references public.clients(workspace_id, id) on delete restrict
);

create table app_private.form_legal_holds (
  workspace_id uuid not null,
  client_id uuid not null,
  hold_reference uuid not null,
  opened_at timestamptz not null default clock_timestamp(),
  released_at timestamptz,
  primary key (workspace_id, client_id, hold_reference),
  foreign key (workspace_id, client_id)
    references public.clients(workspace_id, id) on delete restrict,
  check (released_at is null or released_at >= opened_at)
);
create unique index form_legal_holds_one_active
  on app_private.form_legal_holds(workspace_id, client_id) where released_at is null;

create table app_private.form_answer_erasure_controls (
  created_at timestamptz primary key default clock_timestamp(),
  outcome text not null check (outcome in ('deferred_legal_hold', 'purged')),
  answer_count integer not null check (answer_count >= 0),
  draft_count integer not null check (draft_count >= 0)
);

create function app_private.f15_is_assigned_answer(p_workspace_id uuid, p_assignment_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.form_assignments a
    join public.clients c on c.workspace_id = a.workspace_id and c.id = a.client_id
    where a.workspace_id = p_workspace_id and a.id = p_assignment_id
      and c.auth_user_id = auth.uid() and c.approval_state = 'approved'
  )
$$;
alter function app_private.f15_is_assigned_answer(uuid,uuid) owner to postgres;
revoke all on function app_private.f15_is_assigned_answer(uuid,uuid) from public, anon, service_role;
grant execute on function app_private.f15_is_assigned_answer(uuid,uuid) to authenticated;

revoke all on public.form_answer_revisions, public.form_answer_drafts from public, anon, authenticated, service_role;
alter table public.form_answer_revisions enable row level security;
alter table public.form_answer_revisions force row level security;
alter table public.form_answer_drafts enable row level security;
alter table public.form_answer_drafts force row level security;
create policy form_answer_revisions_staff_scope on public.form_answer_revisions for select to authenticated
  using (app_private.has_workspace_access(workspace_id, 'read_form_answers'));
create policy form_answer_revisions_client_scope on public.form_answer_revisions for select to authenticated
  using (app_private.f15_is_assigned_answer(workspace_id, assignment_id));
create policy form_answer_drafts_staff_scope on public.form_answer_drafts for select to authenticated
  using (app_private.has_workspace_access(workspace_id, 'read_form_answers'));
create policy form_answer_drafts_client_scope on public.form_answer_drafts for select to authenticated
  using (app_private.f15_is_assigned_answer(workspace_id, assignment_id));

alter table app_private.form_retention_windows enable row level security;
alter table app_private.form_retention_windows force row level security;
alter table app_private.form_legal_holds enable row level security;
alter table app_private.form_legal_holds force row level security;
alter table app_private.form_answer_erasure_controls enable row level security;
alter table app_private.form_answer_erasure_controls force row level security;
revoke all on app_private.form_retention_windows, app_private.form_legal_holds,
  app_private.form_answer_erasure_controls from public, anon, authenticated, service_role;

create function app_private.guard_form_retention_window() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'form retention facts are immutable' using errcode = '23514';
end
$$;
alter function app_private.guard_form_retention_window() owner to postgres;
revoke all on function app_private.guard_form_retention_window() from public, anon, authenticated, service_role;
create trigger form_retention_windows_immutable
  before update or delete on app_private.form_retention_windows
  for each row execute function app_private.guard_form_retention_window();

create function app_private.stamp_form_purge_deadline() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.purge_after := new.ended_at + interval '30 days';
  return new;
end
$$;
alter function app_private.stamp_form_purge_deadline() owner to postgres;
revoke all on function app_private.stamp_form_purge_deadline() from public, anon, authenticated, service_role;
create trigger form_retention_windows_deadline
  before insert on app_private.form_retention_windows
  for each row execute function app_private.stamp_form_purge_deadline();

create function app_private.guard_form_legal_hold() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE'
    or new.workspace_id is distinct from old.workspace_id
    or new.client_id is distinct from old.client_id
    or new.hold_reference is distinct from old.hold_reference
    or new.opened_at is distinct from old.opened_at
    or old.released_at is not null
    or new.released_at is null then
    raise exception 'legal holds may only be released once' using errcode = '23514';
  end if;
  return new;
end
$$;
alter function app_private.guard_form_legal_hold() owner to postgres;
revoke all on function app_private.guard_form_legal_hold() from public, anon, authenticated, service_role;
create trigger form_legal_holds_guard
  before update or delete on app_private.form_legal_holds
  for each row execute function app_private.guard_form_legal_hold();

create function app_private.guard_form_erasure_control() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'form erasure controls are append-only' using errcode = '23514';
end
$$;
alter function app_private.guard_form_erasure_control() owner to postgres;
revoke all on function app_private.guard_form_erasure_control() from public, anon, authenticated, service_role;
create trigger form_answer_erasure_controls_immutable
  before update or delete on app_private.form_answer_erasure_controls
  for each row execute function app_private.guard_form_erasure_control();

create function public.read_form_answer(p_workspace_id uuid, p_assignment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  client_user uuid;
  role public.staff_role;
  revision_row public.form_answer_revisions%rowtype;
begin
  if auth.uid() is null then return null; end if;
  select c.auth_user_id into client_user
  from public.form_assignments a join public.clients c
    on c.workspace_id = a.workspace_id and c.id = a.client_id
  where a.workspace_id = p_workspace_id and a.id = p_assignment_id
    and c.approval_state = 'approved';
  if not found then return null; end if;

  if client_user is distinct from auth.uid() then
    role := app_private.current_staff_role();
    if role is null
      or not app_private.role_has_capability(role, 'read_form_answers')
      or not app_private.has_workspace_access(p_workspace_id, 'read_form_answers') then
      return null;
    end if;
  end if;

  select r.* into revision_row from public.form_answer_revisions r
  where r.workspace_id = p_workspace_id and r.assignment_id = p_assignment_id
  order by r.revision desc limit 1;
  if not found then return null; end if;

  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), 'form.answer_viewed', 'form_answer_revisions', p_assignment_id,
    p_workspace_id, jsonb_build_object('revision', revision_row.revision));

  return revision_row.answer_values;
end
$$;
alter function public.read_form_answer(uuid,uuid) owner to postgres;
revoke all on function public.read_form_answer(uuid,uuid) from public, anon, service_role;
grant execute on function public.read_form_answer(uuid,uuid) to authenticated;

create function app_private.purge_ended_form_answers(p_workspace_id uuid, p_client_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  due_at timestamptz;
  deleted_answers integer := 0;
  deleted_drafts integer := 0;
begin
  if p_workspace_id is null or p_client_id is null then return '{"status":"invalid"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_client_id::text, 0)
  );
  select min(w.purge_after) into due_at from app_private.form_retention_windows w
  where w.workspace_id = p_workspace_id and w.client_id = p_client_id;
  if due_at is null or due_at > clock_timestamp() then return '{"status":"not_due"}'::jsonb; end if;

  if exists (
    select 1 from app_private.form_legal_holds h
    where h.workspace_id = p_workspace_id and h.client_id = p_client_id and h.released_at is null
  ) then
    insert into app_private.form_answer_erasure_controls(outcome, answer_count, draft_count)
    values ('deferred_legal_hold', 0, 0);
    return '{"status":"deferred_legal_hold"}'::jsonb;
  end if;

  delete from public.form_answer_drafts d
  where d.workspace_id = p_workspace_id and d.assignment_id in (
    select a.id from public.form_assignments a
    where a.workspace_id = p_workspace_id and a.client_id = p_client_id
  );
  get diagnostics deleted_drafts = row_count;
  delete from public.form_answer_revisions r
  where r.workspace_id = p_workspace_id and r.assignment_id in (
    select a.id from public.form_assignments a
    where a.workspace_id = p_workspace_id and a.client_id = p_client_id
  );
  get diagnostics deleted_answers = row_count;
  insert into app_private.form_answer_erasure_controls(outcome, answer_count, draft_count)
  values ('purged', deleted_answers, deleted_drafts);
  return jsonb_build_object('status', 'purged', 'revisions', deleted_answers, 'drafts', deleted_drafts);
end
$$;
alter function app_private.purge_ended_form_answers(uuid,uuid) owner to postgres;
revoke all on function app_private.purge_ended_form_answers(uuid,uuid) from public, anon, authenticated, service_role;
