-- F15 S14 persistence: tenant-owned editable forms and immutable snapshots.
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, id)
);

create table public.form_versions (
  workspace_id uuid not null,
  form_id uuid not null,
  version_number integer not null check (version_number > 0),
  terms_policy_version text not null,
  policy_kind text not null default 'terms' check (policy_kind = 'terms'),
  definition jsonb not null check (
    jsonb_typeof(definition) = 'object'
    and octet_length(definition::text) <= 131072
  ),
  status text not null check (status in ('draft', 'published', 'retired')),
  created_at timestamptz not null default clock_timestamp(),
  published_at timestamptz,
  primary key (workspace_id, form_id, version_number),
  foreign key (workspace_id, form_id)
    references public.forms(workspace_id, id) on delete restrict,
  foreign key (terms_policy_version, policy_kind)
    references app_private.terms_policy_versions(version, policy_kind) on delete restrict,
  check ((status = 'published') = (published_at is not null))
);

create table public.form_assignments (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  form_id uuid not null,
  version_number integer not null,
  terms_policy_version text not null,
  policy_kind text not null default 'terms' check (policy_kind = 'terms'),
  version_snapshot jsonb not null check (
    jsonb_typeof(version_snapshot) = 'object'
    and octet_length(version_snapshot::text) <= 131072
  ),
  created_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, client_id, form_id),
  foreign key (workspace_id, client_id)
    references public.clients(workspace_id, id) on delete restrict,
  foreign key (workspace_id, form_id, version_number)
    references public.form_versions(workspace_id, form_id, version_number) on delete restrict,
  foreign key (terms_policy_version, policy_kind)
    references app_private.terms_policy_versions(version, policy_kind) on delete restrict
);

create index form_assignments_client_idx
  on public.form_assignments(workspace_id, client_id, created_at desc);

create function app_private.f15_is_assigned_client(p_workspace_id uuid, p_client_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.clients c
    where c.workspace_id = p_workspace_id and c.id = p_client_id
      and c.auth_user_id = auth.uid() and c.approval_state = 'approved'
  )
$$;
alter function app_private.f15_is_assigned_client(uuid,uuid) owner to postgres;
revoke all on function app_private.f15_is_assigned_client(uuid,uuid) from public, anon, service_role;
grant execute on function app_private.f15_is_assigned_client(uuid,uuid) to authenticated;

create function app_private.f15_current_terms_policy(p_version text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app_private.terms_policy_versions current_policy
    where current_policy.version = p_version
      and current_policy.policy_kind = 'terms'
      and current_policy.status = 'published'
      and not exists (
        select 1 from app_private.terms_policy_versions newer
        where newer.policy_kind = 'terms'
          and newer.status = 'published'
          and (newer.created_at, newer.version) > (current_policy.created_at, current_policy.version)
      )
  )
$$;
alter function app_private.f15_current_terms_policy(text) owner to postgres;
revoke all on function app_private.f15_current_terms_policy(text) from public, anon, authenticated, service_role;

create function app_private.guard_f15_form_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'published form versions are immutable' using errcode = '23514';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    raise exception 'published form versions are immutable' using errcode = '23514';
  end if;
  if new.status = 'published' then
    if new.published_at is null then
      new.published_at := clock_timestamp();
    end if;
    if not app_private.f15_current_terms_policy(new.terms_policy_version) then
      raise exception 'current published terms policy required' using errcode = '23514';
    end if;
  elsif new.published_at is not null then
    raise exception 'unpublished form version cannot have a publication instant' using errcode = '23514';
  end if;
  return new;
end
$$;
alter function app_private.guard_f15_form_version() owner to postgres;
revoke all on function app_private.guard_f15_form_version() from public, anon, authenticated, service_role;
create trigger form_versions_guard
  before insert or update or delete on public.form_versions
  for each row execute function app_private.guard_f15_form_version();

create function app_private.guard_f15_form_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  source_version public.form_versions%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'form assignment snapshots are immutable' using errcode = '23514';
  end if;
  select v.* into source_version from public.form_versions v
  where v.workspace_id = new.workspace_id
    and v.form_id = new.form_id
    and v.version_number = new.version_number
    and v.status = 'published';
  if not found
    or source_version.definition is distinct from new.version_snapshot
    or source_version.terms_policy_version is distinct from new.terms_policy_version
    or not app_private.f15_current_terms_policy(new.terms_policy_version) then
    raise exception 'published current form snapshot required' using errcode = '23514';
  end if;
  return new;
end
$$;
alter function app_private.guard_f15_form_assignment() owner to postgres;
revoke all on function app_private.guard_f15_form_assignment() from public, anon, authenticated, service_role;
create trigger form_assignments_guard
  before insert or update or delete on public.form_assignments
  for each row execute function app_private.guard_f15_form_assignment();

alter table public.forms enable row level security;
alter table public.forms force row level security;
alter table public.form_versions enable row level security;
alter table public.form_versions force row level security;
alter table public.form_assignments enable row level security;
alter table public.form_assignments force row level security;
revoke all on public.forms, public.form_versions, public.form_assignments from public, anon, authenticated, service_role;

create policy forms_workspace_scope on public.forms for select to authenticated
  using (app_private.has_workspace_access(workspace_id, 'author_forms'));
create policy form_versions_workspace_scope on public.form_versions for select to authenticated
  using (app_private.has_workspace_access(workspace_id, 'author_forms'));
create policy form_assignments_staff_scope on public.form_assignments for select to authenticated
  using (app_private.has_workspace_access(workspace_id, 'assign_intake_form'));
create policy form_assignments_client_scope on public.form_assignments for select to authenticated
  using (app_private.f15_is_assigned_client(workspace_id, client_id));
