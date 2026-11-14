create table app_private.f19_override_operations (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  operation_key uuid not null,
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  subscription_id uuid not null,
  receipt jsonb,
  recorded_at timestamptz not null default clock_timestamp() check (isfinite(recorded_at)),
  primary key (workspace_id, actor_user_id, operation_key),
  foreign key (workspace_id, subscription_id) references public.subscriptions(workspace_id, id) on delete restrict,
  check (receipt is null or jsonb_typeof(receipt) = 'object')
);
alter table app_private.f19_override_operations owner to postgres;
revoke all on app_private.f19_override_operations from public, anon, authenticated, service_role;

create function app_private.f19_guard_override_operation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.receipt is not null or
    (new.workspace_id, new.actor_user_id, new.operation_key, new.request_fingerprint,
      new.subscription_id, new.recorded_at)
      is distinct from (old.workspace_id, old.actor_user_id, old.operation_key, old.request_fingerprint,
        old.subscription_id, old.recorded_at) then
    raise exception 'f19_override_operation_immutable' using errcode = '23514';
  end if;
  return new;
end $$;
alter function app_private.f19_guard_override_operation() owner to postgres;
revoke all on function app_private.f19_guard_override_operation() from public, anon, authenticated, service_role;
create trigger f19_override_operations_immutable before update or delete on app_private.f19_override_operations
  for each row execute function app_private.f19_guard_override_operation();

create function public.override_activate_subscription(
  p_workspace_id uuid,
  p_subscription_id uuid,
  p_recipient_trainer_user_id uuid,
  p_operation_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  prior app_private.f19_override_operations%rowtype;
  root_id uuid;
  requested_target_id uuid;
  lock_target_id uuid;
  prior_subscription_id uuid;
  target_id uuid;
  client_id uuid;
  client_row public.clients%rowtype;
  target public.subscriptions%rowtype;
  assigned_trainer uuid;
  fingerprint bytea;
  v_receipt jsonb;
  activation_id uuid;
  entitlement jsonb;
begin
  -- Authenticate the privileged actor before inspecting any caller parameter.
  if actor is null or not app_private.is_platform_owner() then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  if p_workspace_id is null or p_subscription_id is null or p_recipient_trainer_user_id is null
    or p_operation_key is null then
    return jsonb_build_object('status', 'invalid_input');
  end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    return jsonb_build_object('status', 'not_permitted');
  end if;

  -- Resolve both first requests and replay probes through the immutable F13 ledger.
  requested_target_id := app_private.f19_resolve_subscription_id(p_workspace_id, p_subscription_id);
  if requested_target_id is null then return jsonb_build_object('status', 'not_permitted'); end if;
  select o.subscription_id into prior_subscription_id
    from app_private.f19_override_operations o
    where o.workspace_id = p_workspace_id and o.actor_user_id = actor and o.operation_key = p_operation_key;
  lock_target_id := coalesce(
    app_private.f19_resolve_subscription_id(p_workspace_id, prior_subscription_id),
    requested_target_id);

  select s.client_id into client_id from public.subscriptions s
    where s.workspace_id = p_workspace_id and s.id = lock_target_id;
  if client_id is null then return jsonb_build_object('status', 'not_permitted'); end if;
  select * into client_row from public.clients c
    where c.workspace_id = p_workspace_id and c.id = client_id for update;
  if not found or not app_private.is_platform_owner() then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  select * into target from public.subscriptions s
    where s.workspace_id = p_workspace_id and s.id = lock_target_id for update;
  if not found or not app_private.is_platform_owner() then
    return jsonb_build_object('status', 'not_permitted');
  end if;

  -- A committed exact retry is returned before active-state or Q9 refusal checks.
  select * into prior from app_private.f19_override_operations o
    where o.workspace_id = p_workspace_id and o.actor_user_id = actor and o.operation_key = p_operation_key;
  fingerprint := extensions.digest(convert_to(jsonb_build_object(
    'workspace_id', p_workspace_id,
    'subscription_id', requested_target_id,
    'recipient_trainer_user_id', p_recipient_trainer_user_id
  )::text, 'UTF8'), 'sha256');
  if found then
    if prior.request_fingerprint <> fingerprint or prior.subscription_id <> requested_target_id then
      return jsonb_build_object('status', 'key_conflict');
    end if;
    if prior.receipt is null then return jsonb_build_object('status', 'unavailable'); end if;
    return prior.receipt;
  end if;

  -- From here onward this is a new request; only its resolved input target is used.
  root_id := requested_target_id;

  if target.kind <> 'initial' or client_row.deactivated_at is not null
    or exists (select 1 from public.subscription_activations a
      where a.workspace_id = p_workspace_id and a.subscription_id = root_id) then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  entitlement := app_private.f13_project_entitlement(
    p_workspace_id, root_id, (statement_timestamp() at time zone 'Africa/Cairo')::date);
  if entitlement->>'status' = 'refunded' then
    return jsonb_build_object('status', 'not_permitted');
  end if;

  assigned_trainer := app_private.current_assigned_trainer(p_workspace_id, client_id);
  if assigned_trainer is null then
    assigned_trainer := p_recipient_trainer_user_id;
  end if;
  if not exists (
    select 1 from public.staff_profiles sp
      join public.workspace_memberships wm on wm.user_id = sp.user_id
        and wm.workspace_id = p_workspace_id and wm.revoked_at is null
    where sp.user_id = assigned_trainer and sp.role = 'trainer'::public.staff_role
  ) then return jsonb_build_object('status', 'not_permitted'); end if;

  if not app_private.f19_client_unit_eligible(p_workspace_id, client_id, root_id) then
    assigned_trainer := null;
  end if;

  insert into app_private.f19_override_operations(
    workspace_id, actor_user_id, operation_key, request_fingerprint, subscription_id)
  values (p_workspace_id, actor, p_operation_key, fingerprint, root_id)
  on conflict do nothing;
  if not found then
    select * into prior from app_private.f19_override_operations o
      where o.workspace_id = p_workspace_id and o.actor_user_id = actor and o.operation_key = p_operation_key;
    if prior.request_fingerprint <> fingerprint or prior.subscription_id <> root_id then
      return jsonb_build_object('status', 'key_conflict');
    end if;
    if prior.receipt is null then return jsonb_build_object('status', 'unavailable'); end if;
    return prior.receipt;
  end if;

  insert into public.subscription_activations(
    workspace_id, subscription_id, activated_at, delivery_event_id, activation_source,
    workout_delivery_id, nutrition_delivery_id)
  values (p_workspace_id, root_id, clock_timestamp(), p_operation_key, 'po_override', null, null)
  returning id into activation_id;
  if assigned_trainer is not null then
    insert into public.productivity_units(
      workspace_id, client_id, subscription_id, activation_id, recipient_trainer_user_id, unit_count)
    values (p_workspace_id, client_id, root_id, activation_id, assigned_trainer, 1);
  end if;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
    values (actor, 'subscription.activation_committed', 'subscription_activations', activation_id,
      p_workspace_id, jsonb_build_object('activation_source', 'po_override', 'client_id', client_id,
        'subscription_id', root_id, 'recipient_trainer_user_id', assigned_trainer,
        'operation_key', p_operation_key));
  v_receipt := jsonb_build_object('status', 'ok', 'subscription_id', root_id,
    'activation_id', activation_id, 'activation_source', 'po_override');
  update app_private.f19_override_operations o set receipt = v_receipt
    where o.workspace_id = p_workspace_id and o.actor_user_id = actor and o.operation_key = p_operation_key;
  return v_receipt;
end $$;

alter function public.override_activate_subscription(uuid,uuid,uuid,uuid) owner to postgres;
revoke all on function public.override_activate_subscription(uuid,uuid,uuid,uuid) from public, anon, service_role;
grant execute on function public.override_activate_subscription(uuid,uuid,uuid,uuid) to authenticated;
comment on function public.override_activate_subscription(uuid,uuid,uuid,uuid)
  is 'Platform Owner only initial subscription activation; operation receipt, activation and eligible unit commit atomically.';
