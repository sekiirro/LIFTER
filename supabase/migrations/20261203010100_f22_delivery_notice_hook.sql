-- F22 T022 (FR-009, S57-PO-10): the F19 delivery/activation hook. The single F19
-- delivery writer `app_private.ready_and_publish_plan_impl` (called by both
-- public.ready_and_publish_plan for workout plans and public.publish_nutrition_revision
-- for nutrition plans) now calls the F22 client notice seam
-- app_private.f22_enqueue_client_notice for each first-plan delivery, in the same
-- transaction. source_key = the new delivery id; kind = <plan_kind>_delivered, or
-- <plan_kind>_delivered_activated when that delivery created the subscription activation.
-- Delivery, activation, productivity-unit and idempotency semantics are unchanged: the
-- body below is the previous definition (20261120180000) plus the marked lines.

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
  first_of_kind boolean;
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

  -- F22 T022 (S57-PO-10): a first-plan delivery is the first delivery of this plan kind
  -- under the initial subscription. Later revisions, other plans of the same kind and
  -- renewals are not first-plan deliveries and emit no client notice.
  first_of_kind := target_kind = 'initial' and not exists (
    select 1 from public.plan_deliveries d
    where d.workspace_id = root.workspace_id and d.subscription_id = target_id
      and d.plan_kind = root.plan_kind);
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

  -- F22 client notice, in this delivery transaction, keyed by the delivery id: exactly one
  -- per first-plan delivery (the notice seam is idempotent per workspace, client, kind and
  -- source key and the operation-key replay path above returns before this point). The
  -- delivery that created the activation row states activation too (the pair completes it).
  -- The seam is a no-op for a client that is not approved and active; any other failure
  -- aborts the delivery so a committed delivery never lacks its notice (FR-009).
  if first_of_kind then
    perform app_private.f22_enqueue_client_notice(root.workspace_id, root.client_id,
      root.plan_kind || case when new_activation is not null
        then '_delivered_activated' else '_delivered' end,
      new_delivery);
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
