-- F17 T022: expose only contributor identity, action codes, and first action time.
-- The existing F19 contributor rows remain workspace-scoped and immutable.

alter table public.plan_revision_contributors
  add column action_codes text[] not null default array['save']::text[],
  add constraint plan_revision_contributors_action_codes_check
    check (
      cardinality(action_codes) > 0
      and action_codes <@ array['publish', 'save']::text[]
    );

comment on column public.plan_revision_contributors.action_codes is
  'F17/F18 action codes recorded for this contributor in the immutable revision: save and/or publish.';

create function app_private.f19_set_plan_revision_contributor_actions()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_authored_by uuid;
  v_revision_number bigint;
  v_previous_published_at timestamptz;
  v_actions text[] := array[]::text[];
begin
  select r.authored_by, r.revision_number
    into v_authored_by, v_revision_number
    from public.plan_revisions r
    where r.workspace_id = new.workspace_id
      and r.id = new.revision_id;
  if not found then
    return new;
  end if;

  select max(r.published_at)
    into v_previous_published_at
    from public.plan_revisions r
    where r.workspace_id = new.workspace_id
      and r.plan_id = new.plan_id
      and r.revision_number < v_revision_number;

  if exists (
    select 1
    from app_private.plan_operation_keys k
    where k.workspace_id = new.workspace_id
      and k.plan_id = new.plan_id
      and k.actor_user_id = new.user_id
      and k.operation_type = 'save_draft'
      and k.recorded_at > coalesce(v_previous_published_at, '-infinity'::timestamptz)
  ) then
    v_actions := array_append(v_actions, 'save');
  end if;
  if v_authored_by = new.user_id then
    v_actions := array_append(v_actions, 'publish');
  end if;
  if cardinality(v_actions) = 0 then
    raise exception 'plan_revision_contributor_action_missing' using errcode = '23514';
  end if;

  new.action_codes := v_actions;
  return new;
end;
$$;

alter function app_private.f19_set_plan_revision_contributor_actions() owner to postgres;
revoke all on function app_private.f19_set_plan_revision_contributor_actions()
  from public, anon, authenticated, service_role;

create trigger plan_revision_contributors_set_actions
  before insert on public.plan_revision_contributors
  for each row execute function app_private.f19_set_plan_revision_contributor_actions();
