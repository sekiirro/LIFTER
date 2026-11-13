-- F19 T010: stable plan roots, private mutable drafts and immutable revisions.
create table public.plan_roots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  plan_kind text not null check (plan_kind in ('workout', 'nutrition')),
  created_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now() check (isfinite(created_at)),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id)
    references public.clients(workspace_id, id) on delete restrict
);

create table public.plan_drafts (
  workspace_id uuid not null,
  plan_id uuid not null,
  draft_version bigint not null default 1 check (draft_version > 0),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  created_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  updated_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now() check (isfinite(created_at)),
  updated_at timestamptz not null default now() check (isfinite(updated_at)),
  primary key (workspace_id, plan_id),
  foreign key (workspace_id, plan_id)
    references public.plan_roots(workspace_id, id) on delete restrict
);

create table public.plan_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  plan_id uuid not null,
  revision_number bigint not null check (revision_number > 0),
  source_draft_version bigint not null check (source_draft_version > 0),
  plan_kind text not null check (plan_kind in ('workout', 'nutrition')),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  authored_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  published_at timestamptz not null default now() check (isfinite(published_at)),
  unique (workspace_id, id),
  unique (workspace_id, plan_id, revision_number),
  unique (workspace_id, plan_id, id),
  foreign key (workspace_id, plan_id)
    references public.plan_roots(workspace_id, id) on delete restrict
);

create table public.plan_audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  plan_id uuid not null,
  actor_user_id uuid references public.staff_profiles(user_id) on delete restrict,
  action text not null check (action in (
    'plan.created', 'plan.draft_created', 'plan.draft_updated', 'plan.revision_published'
  )),
  draft_version bigint,
  revision_number bigint,
  recorded_at timestamptz not null default now() check (isfinite(recorded_at)),
  unique (workspace_id, id),
  foreign key (workspace_id, plan_id)
    references public.plan_roots(workspace_id, id) on delete restrict,
  check ((action = 'plan.created' and draft_version is null and revision_number is null)
    or (action = 'plan.draft_created' and draft_version = 1 and revision_number is null)
    or (action = 'plan.draft_updated' and draft_version > 1 and revision_number is null)
    or (action = 'plan.revision_published' and draft_version > 0 and revision_number > 0))
);

create table app_private.plan_operation_keys (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  operation_key uuid not null,
  operation_type text not null check (operation_type in ('create_plan', 'save_draft')),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  plan_id uuid,
  result_draft_version bigint,
  recorded_at timestamptz not null default now() check (isfinite(recorded_at)),
  primary key (workspace_id, actor_user_id, operation_key),
  foreign key (workspace_id, plan_id)
    references public.plan_roots(workspace_id, id) on delete restrict,
  check ((operation_type = 'create_plan' and plan_id is not null and result_draft_version is null)
    or (operation_type = 'save_draft' and plan_id is not null
      and (result_draft_version is null or result_draft_version > 0))
    or (plan_id is null and result_draft_version is null))
);

create function app_private.f19_guard_plan_root() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'plan_root_restricted' using errcode = '23503';
  end if;
  if (new.id, new.workspace_id, new.client_id, new.plan_kind, new.created_by, new.created_at)
    is distinct from
    (old.id, old.workspace_id, old.client_id, old.plan_kind, old.created_by, old.created_at) then
    raise exception 'plan_root_immutable' using errcode = '23514';
  end if;
  return new;
end $$;

create function app_private.f19_guard_plan_draft() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'plan_draft_restricted' using errcode = '23503';
  end if;
  if (new.workspace_id, new.plan_id, new.created_by, new.created_at)
    is distinct from (old.workspace_id, old.plan_id, old.created_by, old.created_at)
    or new.draft_version <> old.draft_version + 1
    or new.updated_at <= old.updated_at
    or new.updated_by is null then
    raise exception 'invalid_plan_draft_update' using errcode = '23514';
  end if;
  return new;
end $$;

create function app_private.f19_guard_plan_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'plan_revision_immutable' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.plan_roots p
    join public.plan_drafts d on d.workspace_id = p.workspace_id and d.plan_id = p.id
    where p.workspace_id = new.workspace_id and p.id = new.plan_id
      and p.plan_kind = new.plan_kind
      and d.draft_version = new.source_draft_version
      and d.content = new.content
  ) then
    raise exception 'plan_revision_snapshot_mismatch' using errcode = '23514';
  end if;
  return new;
end $$;

create function app_private.f19_audit_plan_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.plan_audit_events (
    workspace_id, plan_id, actor_user_id, action, draft_version, revision_number
  ) values (
    new.workspace_id, new.plan_id, coalesce(auth.uid(), new.authored_by),
    'plan.revision_published', new.source_draft_version, new.revision_number
  );
  return new;
end $$;

create function app_private.f19_audit_plan_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ws uuid;
  pid uuid;
  action_name text;
  version_no bigint;
begin
  if tg_table_name = 'plan_roots' then
    ws := new.workspace_id;
    pid := new.id;
    action_name := 'plan.created';
    version_no := null;
  elsif tg_op = 'INSERT' then
    ws := new.workspace_id;
    pid := new.plan_id;
    action_name := 'plan.draft_created';
    version_no := new.draft_version;
    insert into public.plan_audit_events(workspace_id, plan_id, actor_user_id, action, draft_version)
    values (ws, pid, coalesce(auth.uid(), new.created_by), action_name, version_no);
    return new;
  else
    ws := new.workspace_id;
    pid := new.plan_id;
    action_name := 'plan.draft_updated';
    version_no := new.draft_version;
    insert into public.plan_audit_events(workspace_id, plan_id, actor_user_id, action, draft_version)
    values (ws, pid, coalesce(auth.uid(), new.updated_by), action_name, version_no);
    return new;
  end if;
  insert into public.plan_audit_events(workspace_id, plan_id, actor_user_id, action, draft_version)
  values (ws, pid, coalesce(auth.uid(), new.created_by), action_name, version_no);
  return new;
end $$;

create function app_private.f19_immutable_plan_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'plan_audit_immutable' using errcode = '23514';
end $$;

create function public.create_plan_draft(
  p_workspace_id uuid,
  p_client_id uuid,
  p_plan_kind text,
  p_content jsonb,
  p_operation_key uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_plan_id uuid;
  actor uuid := auth.uid();
  fingerprint bytea;
  prior app_private.plan_operation_keys%rowtype;
begin
  if actor is null
    or p_workspace_id is null
    or p_client_id is null
    or p_operation_key is null
    or p_plan_kind is null
    or p_plan_kind not in ('workout', 'nutrition')
    or p_content is null
    or jsonb_typeof(p_content) <> 'object'
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  perform 1 from public.clients c
    where c.workspace_id = p_workspace_id and c.id = p_client_id
    for key share;
  if not found then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  fingerprint := extensions.digest(convert_to(jsonb_build_object(
    'operation', 'create_plan', 'workspace_id', p_workspace_id,
    'client_id', p_client_id, 'plan_kind', p_plan_kind, 'content', p_content
  )::text, 'UTF8'), 'sha256');
  insert into app_private.plan_operation_keys (
    workspace_id, actor_user_id, operation_key, operation_type, request_fingerprint
  ) values (p_workspace_id, actor, p_operation_key, 'create_plan', fingerprint)
  on conflict (workspace_id, actor_user_id, operation_key) do nothing;
  if not found then
    select * into prior from app_private.plan_operation_keys k
      where k.workspace_id = p_workspace_id and k.actor_user_id = actor
        and k.operation_key = p_operation_key
      for update;
    if prior.operation_type <> 'create_plan'
      or prior.request_fingerprint <> fingerprint then
      raise exception 'key_conflict' using errcode = '23505';
    end if;
    if prior.plan_id is null then
      raise exception 'unavailable' using errcode = '55000';
    end if;
    return prior.plan_id;
  end if;

  insert into public.plan_roots(workspace_id, client_id, plan_kind, created_by)
  values (p_workspace_id, p_client_id, p_plan_kind, actor)
  returning id into v_plan_id;
  insert into public.plan_drafts(workspace_id, plan_id, content, created_by, updated_by)
  values (p_workspace_id, v_plan_id, p_content, actor, actor);
  update app_private.plan_operation_keys k set plan_id = v_plan_id
    where k.workspace_id = p_workspace_id and k.actor_user_id = actor
      and k.operation_key = p_operation_key;
  return v_plan_id;
end $$;

create function public.save_plan_draft(
  p_plan_id uuid,
  p_expected_draft_version bigint,
  p_content jsonb,
  p_operation_key uuid
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  root public.plan_roots%rowtype;
  draft public.plan_drafts%rowtype;
  actor uuid := auth.uid();
  fingerprint bytea;
  prior app_private.plan_operation_keys%rowtype;
begin
  if actor is null or p_plan_id is null or p_expected_draft_version is null
    or p_expected_draft_version < 1 or p_content is null or p_operation_key is null
    or jsonb_typeof(p_content) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into root from public.plan_roots p where p.id = p_plan_id;
  if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  fingerprint := extensions.digest(convert_to(jsonb_build_object(
    'operation', 'save_draft', 'plan_id', p_plan_id,
    'expected_draft_version', p_expected_draft_version, 'content', p_content
  )::text, 'UTF8'), 'sha256');
  insert into app_private.plan_operation_keys (
    workspace_id, actor_user_id, operation_key, operation_type,
    request_fingerprint, plan_id
  ) values (root.workspace_id, actor, p_operation_key, 'save_draft', fingerprint, root.id)
  on conflict (workspace_id, actor_user_id, operation_key) do nothing;
  if not found then
    select * into prior from app_private.plan_operation_keys k
      where k.workspace_id = root.workspace_id and k.actor_user_id = actor
        and k.operation_key = p_operation_key
      for update;
    if prior.operation_type <> 'save_draft'
      or prior.request_fingerprint <> fingerprint then
      raise exception 'key_conflict' using errcode = '23505';
    end if;
    if prior.result_draft_version is null then
      raise exception 'unavailable' using errcode = '55000';
    end if;
    return prior.result_draft_version;
  end if;

  select * into draft from public.plan_drafts d
    where d.workspace_id = root.workspace_id and d.plan_id = root.id
    for update;
  if not found then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if draft.draft_version <> p_expected_draft_version then
    raise exception 'stale_version' using errcode = '40001';
  end if;
  update public.plan_drafts
    set draft_version = draft.draft_version + 1,
        content = p_content,
        updated_by = actor,
        updated_at = greatest(clock_timestamp(), draft.updated_at + interval '1 microsecond')
    where workspace_id = root.workspace_id and plan_id = root.id
    returning draft_version into draft.draft_version;
  update app_private.plan_operation_keys k set result_draft_version = draft.draft_version
    where k.workspace_id = root.workspace_id and k.actor_user_id = actor
      and k.operation_key = p_operation_key;
  return draft.draft_version;
end $$;

alter function app_private.f19_guard_plan_root() owner to postgres;
alter function app_private.f19_guard_plan_draft() owner to postgres;
alter function app_private.f19_guard_plan_revision() owner to postgres;
alter function app_private.f19_audit_plan_change() owner to postgres;
alter function app_private.f19_audit_plan_revision() owner to postgres;
alter function app_private.f19_immutable_plan_audit() owner to postgres;
alter function public.create_plan_draft(uuid, uuid, text, jsonb, uuid) owner to postgres;
alter function public.save_plan_draft(uuid, bigint, jsonb, uuid) owner to postgres;
revoke all on function app_private.f19_guard_plan_root() from public, anon, authenticated, service_role;
revoke all on function app_private.f19_guard_plan_draft() from public, anon, authenticated, service_role;
revoke all on function app_private.f19_guard_plan_revision() from public, anon, authenticated, service_role;
revoke all on function app_private.f19_audit_plan_change() from public, anon, authenticated, service_role;
revoke all on function app_private.f19_audit_plan_revision() from public, anon, authenticated, service_role;
revoke all on function app_private.f19_immutable_plan_audit() from public, anon, authenticated, service_role;
revoke all on function public.create_plan_draft(uuid, uuid, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.save_plan_draft(uuid, bigint, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on app_private.plan_operation_keys from public, anon, authenticated, service_role;
grant execute on function public.create_plan_draft(uuid, uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.save_plan_draft(uuid, bigint, jsonb, uuid) to authenticated;

create trigger plan_roots_guard before update or delete on public.plan_roots
  for each row execute function app_private.f19_guard_plan_root();
create trigger plan_drafts_guard before update or delete on public.plan_drafts
  for each row execute function app_private.f19_guard_plan_draft();
create trigger plan_revisions_immutable before update or delete on public.plan_revisions
  for each row execute function app_private.f19_guard_plan_revision();
create trigger plan_revisions_no_truncate before truncate on public.plan_revisions
  for each statement execute function app_private.f19_guard_plan_revision();
create trigger plan_roots_audit after insert on public.plan_roots
  for each row execute function app_private.f19_audit_plan_change();
create trigger plan_drafts_audit after insert or update on public.plan_drafts
  for each row execute function app_private.f19_audit_plan_change();
create trigger plan_revisions_audit after insert on public.plan_revisions
  for each row execute function app_private.f19_audit_plan_revision();
create trigger plan_audit_immutable before update or delete on public.plan_audit_events
  for each row execute function app_private.f19_immutable_plan_audit();
create trigger plan_audit_no_truncate before truncate on public.plan_audit_events
  for each statement execute function app_private.f19_immutable_plan_audit();

alter table public.plan_roots enable row level security;
alter table public.plan_roots force row level security;
alter table public.plan_drafts enable row level security;
alter table public.plan_drafts force row level security;
alter table public.plan_revisions enable row level security;
alter table public.plan_revisions force row level security;
alter table public.plan_audit_events enable row level security;
alter table public.plan_audit_events force row level security;

create policy plan_roots_staff_read on public.plan_roots for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
create policy plan_drafts_staff_read on public.plan_drafts for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
create policy plan_revisions_staff_read on public.plan_revisions for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
create policy plan_audit_staff_read on public.plan_audit_events for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));

revoke all on public.plan_roots, public.plan_drafts, public.plan_revisions, public.plan_audit_events
  from public, anon, authenticated, service_role;
grant select on public.plan_roots, public.plan_drafts, public.plan_revisions, public.plan_audit_events
  to authenticated;

comment on table public.plan_roots is 'F19 stable workspace/client plan identity; writes only through authorized RPCs.';
comment on table public.plan_drafts is 'F19 private mutable CAS draft; never exposed to client projections.';
comment on table public.plan_revisions is 'F19 append-only immutable published plan revisions.';
comment on table public.plan_audit_events is 'F19 content-free append-only plan and draft audit history.';
