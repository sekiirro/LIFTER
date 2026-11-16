-- F19 / F18 T017: Contributor attribution per published revision.
-- Architect ruling S60-R43: One domain-neutral table public.plan_revision_contributors
-- with composite foreign key to plan_revisions(workspace_id, id), immutability triggers,
-- and RLS coaching_work read policy.

-- 1. Draft-side contributor tracking (app_private)
create table app_private.plan_draft_contributors (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  plan_id uuid not null,
  user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  first_contributed_at timestamptz not null default now() check (isfinite(first_contributed_at)),
  primary key (workspace_id, plan_id, user_id),
  foreign key (workspace_id, plan_id)
    references public.plan_roots(workspace_id, id) on delete cascade
);

revoke all on app_private.plan_draft_contributors from public, anon, authenticated, service_role;
comment on table app_private.plan_draft_contributors is 'F19 draft-side contributor tracking, cleared at revision publish.';

-- Seed existing open drafts so in-flight drafts retain their authors
insert into app_private.plan_draft_contributors (workspace_id, plan_id, user_id, first_contributed_at)
select d.workspace_id, d.plan_id, d.created_by, d.created_at
from public.plan_drafts d
on conflict do nothing;

insert into app_private.plan_draft_contributors (workspace_id, plan_id, user_id, first_contributed_at)
select d.workspace_id, d.plan_id, d.updated_by, d.updated_at
from public.plan_drafts d
on conflict do nothing;

-- 2. Domain-neutral published revision contributors
create table public.plan_revision_contributors (
  workspace_id uuid not null,
  plan_id uuid not null,
  revision_id uuid not null,
  user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  first_contributed_at timestamptz not null default now() check (isfinite(first_contributed_at)),
  primary key (revision_id, user_id),
  foreign key (workspace_id, revision_id)
    references public.plan_revisions(workspace_id, id) on delete restrict,
  foreign key (workspace_id, plan_id)
    references public.plan_roots(workspace_id, id) on delete restrict
);

create index plan_revision_contributors_workspace_plan_idx
  on public.plan_revision_contributors(workspace_id, plan_id);

comment on table public.plan_revision_contributors is 'F19 domain-neutral immutable workspace-scoped plan revision contributors.';

-- 3. Immutability trigger for plan_revision_contributors
create function app_private.f19_guard_plan_revision_contributors() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'plan_revision_contributors_immutable' using errcode = '23514';
end $$;

alter function app_private.f19_guard_plan_revision_contributors() owner to postgres;
revoke all on function app_private.f19_guard_plan_revision_contributors()
  from public, anon, authenticated, service_role;

create trigger plan_revision_contributors_immutable
  before update or delete on public.plan_revision_contributors
  for each row execute function app_private.f19_guard_plan_revision_contributors();

create trigger plan_revision_contributors_no_truncate
  before truncate on public.plan_revision_contributors
  for each statement execute function app_private.f19_guard_plan_revision_contributors();

-- 4. Permissions and RLS for plan_revision_contributors
alter table public.plan_revision_contributors enable row level security;
alter table public.plan_revision_contributors force row level security;

create policy plan_revision_contributors_staff_read on public.plan_revision_contributors
  for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));

revoke all on public.plan_revision_contributors from public, anon, authenticated, service_role;
grant select on public.plan_revision_contributors to authenticated;

-- 5. Trigger for tracking draft contributors on insert or update of public.plan_drafts
create function app_private.f19_track_plan_draft_contributor() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
begin
  if tg_op = 'INSERT' then
    v_user_id := coalesce(auth.uid(), new.created_by);
  else
    v_user_id := coalesce(auth.uid(), new.updated_by);
  end if;
  if v_user_id is not null then
    insert into app_private.plan_draft_contributors (
      workspace_id, plan_id, user_id, first_contributed_at
    ) values (
      new.workspace_id, new.plan_id, v_user_id, clock_timestamp()
    ) on conflict (workspace_id, plan_id, user_id) do nothing;
  end if;
  return new;
end $$;

alter function app_private.f19_track_plan_draft_contributor() owner to postgres;
revoke all on function app_private.f19_track_plan_draft_contributor()
  from public, anon, authenticated, service_role;

create trigger plan_drafts_track_contributors
  after insert or update on public.plan_drafts
  for each row execute function app_private.f19_track_plan_draft_contributor();

-- 6. Update public.save_plan_draft to explicitly record contributor
create or replace function public.save_plan_draft(
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
  if actor is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select * into root from public.plan_roots p where p.id = p_plan_id;
  if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_expected_draft_version is null or p_expected_draft_version < 1
    or p_content is null or p_operation_key is null
    or jsonb_typeof(p_content) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023';
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

  insert into app_private.plan_draft_contributors (
    workspace_id, plan_id, user_id, first_contributed_at
  ) values (
    root.workspace_id, root.id, actor, clock_timestamp()
  ) on conflict (workspace_id, plan_id, user_id) do nothing;

  update app_private.plan_operation_keys k set result_draft_version = draft.draft_version
    where k.workspace_id = root.workspace_id and k.actor_user_id = actor
      and k.operation_key = p_operation_key;
  return draft.draft_version;
end $$;

alter function public.save_plan_draft(uuid, bigint, jsonb, uuid) owner to postgres;
revoke all on function public.save_plan_draft(uuid, bigint, jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.save_plan_draft(uuid, bigint, jsonb, uuid) to authenticated;

-- 7. Update app_private.ready_and_publish_plan_impl to populate revision contributors
create or replace function app_private.ready_and_publish_plan_impl(
  p_plan_id uuid,
  p_expected_draft_version bigint,
  p_expected_published_version bigint,
  p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  root public.plan_roots%rowtype;
  draft public.plan_drafts%rowtype;
  client_row public.clients%rowtype;
  prior app_private.plan_delivery_operations%rowtype;
  target_id uuid;
  eligible_count integer;
  active_count integer;
  invalid_successor boolean;
  current_version bigint;
  new_revision uuid;
  new_delivery uuid;
  fingerprint bytea;
  v_receipt jsonb;
  entitlement jsonb;
  target_kind text;
  assigned_trainer uuid;
  new_activation uuid;
  workout_delivery uuid;
  nutrition_delivery uuid;
begin
  -- Resolve and authorize the resource before validating caller-controlled fields.
  if actor is null then return jsonb_build_object('status', 'not_permitted'); end if;
  select * into root from public.plan_roots p where p.id = p_plan_id;
  if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  if p_plan_id is null or p_operation_key is null or p_expected_draft_version is null or p_expected_draft_version < 1
    or p_expected_published_version is null or p_expected_published_version < 0 then
    return jsonb_build_object('status', 'invalid_input');
  end if;
  fingerprint := extensions.digest(convert_to(jsonb_build_object('plan_id', p_plan_id,
    'draft_version', p_expected_draft_version, 'published_version', p_expected_published_version)::text, 'UTF8'), 'sha256');
  select * into client_row from public.clients c where c.workspace_id = root.workspace_id and c.id = root.client_id for update;
  if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then
    return jsonb_build_object('status', 'not_permitted');
  end if;

  select * into prior from app_private.plan_delivery_operations o
    where o.workspace_id = root.workspace_id and o.actor_user_id = actor and o.operation_key = p_operation_key;
  if found then
    if prior.request_fingerprint <> fingerprint or prior.plan_id <> root.id then return jsonb_build_object('status', 'key_conflict'); end if;
    if prior.receipt is null then return jsonb_build_object('status', 'unavailable'); end if;
    perform 1 from public.subscriptions s where s.workspace_id = root.workspace_id
      and s.id = (prior.receipt->>'subscription_id')::uuid for update;
    select * into root from public.plan_roots p where p.workspace_id = root.workspace_id and p.id = p_plan_id for update;
    if not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then return jsonb_build_object('status', 'not_permitted'); end if;
    return prior.receipt;
  end if;

  select exists(select 1 from app_private.f19_reattachment_candidates() c
    join public.subscriptions s on s.workspace_id = c.workspace_id and s.id = c.successor_subscription_id
    where s.workspace_id = root.workspace_id and s.client_id = root.client_id
      and not exists(select 1 from app_private.subscription_reattachments a where a.successor_subscription_id = s.id))
    into invalid_successor;
  if invalid_successor then return jsonb_build_object('status', 'not_permitted'); end if;
  select count(distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id))::integer into active_count
    from public.subscriptions s cross join lateral app_private.f13_project_entitlement(s.workspace_id, s.id,
      (statement_timestamp() at time zone 'Africa/Cairo')::date) as e(value)
    where s.workspace_id = root.workspace_id and s.client_id = root.client_id and e.value->>'status' in ('active', 'frozen');
  if active_count > 1 then return jsonb_build_object('status', 'not_permitted'); end if;
  select count(distinct resolved_id)::integer, (array_agg(resolved_id order by resolved_id))[1]
    into eligible_count, target_id from (
    select distinct app_private.f19_resolve_subscription_id(s.workspace_id, s.id) as resolved_id
    from public.subscriptions s cross join lateral app_private.f13_project_entitlement(s.workspace_id, s.id,
      (statement_timestamp() at time zone 'Africa/Cairo')::date) as e(value)
    where s.workspace_id = root.workspace_id and s.client_id = root.client_id
      and e.value->>'status' in ('awaiting_activation', 'active', 'frozen')
  ) eligible;
  if eligible_count <> 1 or target_id is null then return jsonb_build_object('status', 'not_permitted'); end if;
  perform 1 from public.subscriptions s where s.workspace_id = root.workspace_id and s.id = target_id for update;
  if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then return jsonb_build_object('status', 'not_permitted'); end if;
  select * into root from public.plan_roots p where p.workspace_id = root.workspace_id and p.id = p_plan_id for update;
  select * into draft from public.plan_drafts d where d.workspace_id = root.workspace_id and d.plan_id = root.id for update;
  if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then return jsonb_build_object('status', 'not_permitted'); end if;
  select coalesce(max(r.revision_number), 0) into current_version from public.plan_revisions r
    where r.workspace_id = root.workspace_id and r.plan_id = root.id;
  if draft.draft_version <> p_expected_draft_version or current_version <> p_expected_published_version then
    return jsonb_build_object('status', 'stale_version');
  end if;
  entitlement := app_private.f13_project_entitlement(root.workspace_id, target_id, (statement_timestamp() at time zone 'Africa/Cairo')::date);
  if entitlement->>'status' not in ('awaiting_activation', 'active', 'frozen') then return jsonb_build_object('status', 'not_permitted'); end if;
  select s.kind into target_kind from public.subscriptions s where s.workspace_id = root.workspace_id and s.id = target_id;

  -- If this publication completes the first workout/nutrition pair, resolve
  -- assignment under the already-held client and subscription locks.
  if target_kind = 'initial' and not exists (
    select 1 from public.subscription_activations a
    where a.workspace_id = root.workspace_id and a.subscription_id = target_id
  ) and exists (
    select 1 from public.plan_deliveries d where d.workspace_id = root.workspace_id
      and d.client_id = root.client_id and d.subscription_id = target_id
      and d.plan_kind <> root.plan_kind
  ) then
    assigned_trainer := app_private.current_assigned_trainer(root.workspace_id, root.client_id);
    if assigned_trainer is null then
      if not exists (
        select 1 from public.staff_profiles sp join public.workspace_memberships wm
          on wm.user_id = sp.user_id and wm.workspace_id = root.workspace_id and wm.revoked_at is null
        where sp.user_id = actor and sp.role = 'trainer'::public.staff_role
      ) then return jsonb_build_object('status', 'not_permitted'); end if;
      assigned_trainer := actor;
    elsif not exists (
      select 1 from public.staff_profiles sp join public.workspace_memberships wm
        on wm.user_id = sp.user_id and wm.workspace_id = root.workspace_id and wm.revoked_at is null
      where sp.user_id = assigned_trainer and sp.role = 'trainer'::public.staff_role
    ) then
      return jsonb_build_object('status', 'not_permitted');
    end if;
  end if;

  insert into app_private.plan_delivery_operations(workspace_id, actor_user_id, operation_key, request_fingerprint, plan_id)
    values(root.workspace_id, actor, p_operation_key, fingerprint, root.id) on conflict do nothing;
  if not found then
    select * into prior from app_private.plan_delivery_operations o
      where o.workspace_id = root.workspace_id and o.actor_user_id = actor and o.operation_key = p_operation_key for update;
    if prior.request_fingerprint <> fingerprint or prior.plan_id <> root.id then return jsonb_build_object('status', 'key_conflict'); end if;
    if prior.receipt is null then return jsonb_build_object('status', 'unavailable'); end if;
    return prior.receipt;
  end if;
  new_revision := gen_random_uuid();
  insert into public.plan_revisions(id, workspace_id, plan_id, revision_number, source_draft_version, plan_kind, content, authored_by)
    values(new_revision, root.workspace_id, root.id, current_version + 1, draft.draft_version, root.plan_kind, draft.content, actor);

  -- Populate immutable revision contributors: every staff user who saved the draft
  -- since the previous revision plus the publisher.
  insert into public.plan_revision_contributors (
    workspace_id, plan_id, revision_id, user_id, first_contributed_at
  )
  select root.workspace_id, root.id, new_revision, c.user_id, min(c.first_contributed_at)
  from (
    select user_id, first_contributed_at
    from app_private.plan_draft_contributors
    where workspace_id = root.workspace_id and plan_id = root.id
    union all
    select actor as user_id, clock_timestamp() as first_contributed_at
  ) c
  group by c.user_id;

  -- Clear draft-side contributors consumed for this revision
  delete from app_private.plan_draft_contributors
  where workspace_id = root.workspace_id and plan_id = root.id;

  new_delivery := gen_random_uuid();
  insert into public.plan_deliveries(id, workspace_id, subscription_id, client_id, plan_id, plan_kind, revision_id, delivery_event_id, delivered_by)
    values(new_delivery, root.workspace_id, target_id, root.client_id, root.id, root.plan_kind, new_revision, p_operation_key, actor);

  if target_kind = 'initial' and not exists (
    select 1 from public.subscription_activations a
    where a.workspace_id = root.workspace_id and a.subscription_id = target_id
  ) then
    select w.id into workout_delivery from public.plan_deliveries w
      where w.workspace_id = root.workspace_id and w.subscription_id = target_id and w.plan_kind = 'workout'
      order by w.delivered_at, w.id limit 1;
    select n.id into nutrition_delivery from public.plan_deliveries n
      where n.workspace_id = root.workspace_id and n.subscription_id = target_id and n.plan_kind = 'nutrition'
      order by n.delivered_at, n.id limit 1;
    if workout_delivery is not null and nutrition_delivery is not null then
      insert into public.subscription_activations(workspace_id, subscription_id, activated_at, delivery_event_id,
        activation_source, workout_delivery_id, nutrition_delivery_id)
      values(root.workspace_id, target_id, clock_timestamp(), p_operation_key,
        'plan_deliveries', workout_delivery, nutrition_delivery)
      returning id into new_activation;
      insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
        values(actor, 'subscription.activation_committed', 'subscription_activations', new_activation,
          root.workspace_id, jsonb_build_object('activation_source', 'plan_deliveries',
            'client_id', root.client_id, 'subscription_id', target_id,
            'workout_delivery_id', workout_delivery, 'nutrition_delivery_id', nutrition_delivery));
      if assigned_trainer is not null and app_private.f19_client_unit_eligible(root.workspace_id, root.client_id, target_id) then
        insert into public.productivity_units(workspace_id, client_id, subscription_id, activation_id,
          recipient_trainer_user_id, unit_count)
        values(root.workspace_id, root.client_id, target_id, new_activation, assigned_trainer, 1);
      end if;
    end if;
  end if;

  v_receipt := jsonb_build_object('status', 'ok', 'plan_id', root.id, 'revision_id', new_revision,
    'revision_number', current_version + 1, 'delivery_id', new_delivery, 'subscription_id', target_id);
  update app_private.plan_delivery_operations o set receipt = v_receipt
    where o.workspace_id = root.workspace_id and o.actor_user_id = actor and o.operation_key = p_operation_key;
  return v_receipt;
end $$;

alter function app_private.ready_and_publish_plan_impl(uuid, bigint, bigint, uuid) owner to postgres;
revoke all on function app_private.ready_and_publish_plan_impl(uuid, bigint, bigint, uuid)
  from public, anon, authenticated, service_role;
