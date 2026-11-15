-- F18 T007: 1:1 immutable nutrition revision content table linked to F19 plan_revisions.

create table public.nutrition_plan_version_contents (
  workspace_id uuid not null,
  plan_id uuid not null,
  revision_id uuid not null,
  schema_version integer not null check (schema_version > 0),
  algorithm_version integer not null check (algorithm_version > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  snapshot_map jsonb not null check (jsonb_typeof(snapshot_map) = 'object'),
  computed_values jsonb not null check (jsonb_typeof(computed_values) = 'object'),
  created_at timestamptz not null default now() check (isfinite(created_at)),
  created_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  primary key (workspace_id, revision_id),
  foreign key (workspace_id, plan_id, revision_id)
    references public.plan_revisions(workspace_id, plan_id, id) on delete restrict
);

create function app_private.f18_guard_plan_version_content() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'nutrition_plan_version_contents_immutable' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.plan_revisions r
    where r.workspace_id = new.workspace_id
      and r.plan_id = new.plan_id
      and r.id = new.revision_id
      and r.plan_kind = 'nutrition'
  ) then
    raise exception 'nutrition_revision_kind_mismatch' using errcode = '23514';
  end if;
  return new;
end $$;

alter function app_private.f18_guard_plan_version_content() owner to postgres;
revoke all on function app_private.f18_guard_plan_version_content()
  from public, anon, authenticated, service_role;

create trigger nutrition_plan_version_contents_guard_insert
  before insert on public.nutrition_plan_version_contents
  for each row execute function app_private.f18_guard_plan_version_content();

create trigger nutrition_plan_version_contents_immutable
  before update or delete on public.nutrition_plan_version_contents
  for each row execute function app_private.f18_guard_plan_version_content();

create trigger nutrition_plan_version_contents_no_truncate
  before truncate on public.nutrition_plan_version_contents
  for each statement execute function app_private.f18_guard_plan_version_content();

alter table public.nutrition_plan_version_contents enable row level security;
alter table public.nutrition_plan_version_contents force row level security;

create policy nutrition_plan_version_contents_staff_read
  on public.nutrition_plan_version_contents
  for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));

revoke all on public.nutrition_plan_version_contents
  from public, anon, authenticated, service_role;
grant select on public.nutrition_plan_version_contents to authenticated;

comment on table public.nutrition_plan_version_contents is
  'F18 1:1 immutable nutrition document, snapshot map, and exact computed values per F19 nutrition revision.';
