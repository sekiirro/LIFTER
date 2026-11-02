-- T008: reconcile committed F12 approval facts and F15 form selections in
-- either arrival order, with one assignment per client/form/subscription.
create table app_private.form_assignment_selections (
  workspace_id uuid not null,
  client_id uuid not null,
  form_id uuid not null,
  version_number integer not null,
  terms_policy_version text not null,
  policy_kind text not null default 'terms' check (policy_kind = 'terms'),
  selected_by uuid not null,
  selected_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, client_id),
  foreign key (workspace_id, client_id)
    references public.clients(workspace_id, id) on delete restrict,
  foreign key (workspace_id, form_id, version_number)
    references public.form_versions(workspace_id, form_id, version_number) on delete restrict,
  foreign key (terms_policy_version, policy_kind)
    references app_private.terms_policy_versions(version, policy_kind) on delete restrict
);
alter table app_private.form_assignment_selections enable row level security;
alter table app_private.form_assignment_selections force row level security;
revoke all on app_private.form_assignment_selections from public, anon, authenticated, service_role;

create table app_private.form_assignment_consumptions (
  workspace_id uuid not null,
  client_id uuid not null,
  form_id uuid not null,
  subscription_id uuid not null,
  assignment_id uuid not null,
  consumed_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, client_id, form_id),
  unique (workspace_id, subscription_id),
  foreign key (workspace_id, client_id)
    references public.clients(workspace_id, id) on delete restrict,
  foreign key (workspace_id, subscription_id, client_id)
    references public.subscriptions(workspace_id, id, client_id) on delete restrict,
  foreign key (workspace_id, assignment_id)
    references public.form_assignments(workspace_id, id) on delete restrict
);
alter table app_private.form_assignment_consumptions enable row level security;
alter table app_private.form_assignment_consumptions force row level security;
revoke all on app_private.form_assignment_consumptions from public, anon, authenticated, service_role;

create function app_private.guard_f15_assignment_fact() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'form assignment facts are immutable' using errcode = '23514';
end
$$;
alter function app_private.guard_f15_assignment_fact() owner to postgres;
revoke all on function app_private.guard_f15_assignment_fact() from public, anon, authenticated, service_role;
create trigger form_assignment_selections_immutable
  before update or delete on app_private.form_assignment_selections
  for each row execute function app_private.guard_f15_assignment_fact();
create trigger form_assignment_consumptions_immutable
  before update or delete on app_private.form_assignment_consumptions
  for each row execute function app_private.guard_f15_assignment_fact();

create function app_private.reconcile_f15_form_assignment(
  p_workspace_id uuid,
  p_client_id uuid
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  selection app_private.form_assignment_selections%rowtype;
  approved_subscription uuid;
  assignment uuid;
begin
  if p_workspace_id is null or p_client_id is null then return 'invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_client_id::text, 0)
  );

  select s.* into selection from app_private.form_assignment_selections s
  where s.workspace_id = p_workspace_id and s.client_id = p_client_id;
  if not found then return 'waiting_for_selection'; end if;

  select a.subscription_id into approved_subscription
  from app_private.registration_approval_events a
  where a.workspace_id = p_workspace_id and a.client_id = p_client_id
  order by a.approved_at, a.id limit 1;
  if not found then return 'waiting_for_approval'; end if;

  if exists (
    select 1 from app_private.form_assignment_consumptions c
    where c.workspace_id = p_workspace_id and c.client_id = p_client_id
      and c.form_id = selection.form_id
  ) then return 'already_assigned'; end if;

  if not app_private.f15_current_terms_policy(selection.terms_policy_version)
    or not exists (
      select 1 from public.form_versions v
      where v.workspace_id = p_workspace_id and v.form_id = selection.form_id
        and v.version_number = selection.version_number and v.status = 'published'
        and v.terms_policy_version = selection.terms_policy_version
    ) then return 'stale_selection'; end if;

  insert into public.form_assignments(
    workspace_id, client_id, form_id, version_number,
    terms_policy_version, policy_kind, version_snapshot
  )
  select p_workspace_id, p_client_id, v.form_id, v.version_number,
    v.terms_policy_version, v.policy_kind, v.definition
  from public.form_versions v
  where v.workspace_id = p_workspace_id and v.form_id = selection.form_id
    and v.version_number = selection.version_number and v.status = 'published'
  on conflict (workspace_id, client_id, form_id) do nothing
  returning id into assignment;

  if assignment is null then
    select a.id into assignment from public.form_assignments a
    where a.workspace_id = p_workspace_id and a.client_id = p_client_id
      and a.form_id = selection.form_id;
  end if;
  if assignment is null then return 'unavailable'; end if;

  insert into app_private.form_assignment_consumptions(
    workspace_id, client_id, form_id, subscription_id, assignment_id
  ) values (
    p_workspace_id, p_client_id, selection.form_id, approved_subscription, assignment
  ) on conflict (workspace_id, client_id, form_id) do nothing;

  if found then
    insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
    values (selection.selected_by, 'form.assignment_created', 'form_assignments', assignment,
      p_workspace_id, jsonb_build_object(
        'client_id', p_client_id,
        'form_id', selection.form_id,
        'version_number', selection.version_number,
        'subscription_id', approved_subscription
      ));
    return 'assigned';
  end if;
  return 'already_assigned';
end
$$;
alter function app_private.reconcile_f15_form_assignment(uuid,uuid) owner to postgres;
revoke all on function app_private.reconcile_f15_form_assignment(uuid,uuid) from public, anon, authenticated, service_role;

create function app_private.f15_selection_reconcile_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.reconcile_f15_form_assignment(new.workspace_id, new.client_id);
  return new;
end
$$;
alter function app_private.f15_selection_reconcile_trigger() owner to postgres;
revoke all on function app_private.f15_selection_reconcile_trigger() from public, anon, authenticated, service_role;
create trigger f15_selection_reconcile
  after insert on app_private.form_assignment_selections
  for each row execute function app_private.f15_selection_reconcile_trigger();

create function app_private.f15_approval_reconcile_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.reconcile_f15_form_assignment(new.workspace_id, new.client_id);
  return new;
end
$$;
alter function app_private.f15_approval_reconcile_trigger() owner to postgres;
revoke all on function app_private.f15_approval_reconcile_trigger() from public, anon, authenticated, service_role;
create trigger f15_approval_reconcile
  after insert on app_private.registration_approval_events
  for each row execute function app_private.f15_approval_reconcile_trigger();

create function public.select_intake_form(
  p_workspace_id uuid,
  p_client_id uuid,
  p_form_id uuid,
  p_version_number integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  role public.staff_role;
  existing app_private.form_assignment_selections%rowtype;
  outcome text;
begin
  if auth.uid() is null or p_workspace_id is null or p_client_id is null
    or p_form_id is null or p_version_number is null then
    return '{"status":"not_found"}'::jsonb;
  end if;
  role := app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role, 'assign_intake_form')
    or not app_private.has_workspace_access(p_workspace_id, 'assign_intake_form') then
    return '{"status":"not_found"}'::jsonb;
  end if;
  if not exists (
    select 1 from public.clients c where c.workspace_id=p_workspace_id and c.id=p_client_id
  ) or not exists (
    select 1 from public.form_versions v
    where v.workspace_id=p_workspace_id and v.form_id=p_form_id
      and v.version_number=p_version_number and v.status='published'
      and app_private.f15_current_terms_policy(v.terms_policy_version)
  ) then return '{"status":"not_found"}'::jsonb; end if;

  insert into app_private.form_assignment_selections(
    workspace_id, client_id, form_id, version_number, terms_policy_version, selected_by
  ) select p_workspace_id, p_client_id, v.form_id, v.version_number, v.terms_policy_version, auth.uid()
    from public.form_versions v
    where v.workspace_id=p_workspace_id and v.form_id=p_form_id
      and v.version_number=p_version_number and v.status='published'
    on conflict (workspace_id, client_id) do nothing;

  if not found then
    select s.* into existing from app_private.form_assignment_selections s
    where s.workspace_id=p_workspace_id and s.client_id=p_client_id;
    if existing.form_id is distinct from p_form_id
      or existing.version_number is distinct from p_version_number then
      return '{"status":"conflict"}'::jsonb;
    end if;
  end if;
  outcome := app_private.reconcile_f15_form_assignment(p_workspace_id, p_client_id);
  if outcome = 'already_assigned' then outcome := 'assigned'; end if;
  return jsonb_build_object('status', outcome);
exception when others then
  return '{"status":"unavailable"}'::jsonb;
end
$$;
alter function public.select_intake_form(uuid,uuid,uuid,integer) owner to postgres;
revoke all on function public.select_intake_form(uuid,uuid,uuid,integer) from public, anon, service_role;
grant execute on function public.select_intake_form(uuid,uuid,uuid,integer) to authenticated;
