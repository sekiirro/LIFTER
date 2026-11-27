-- T033: immutable F15 D-03 breach facts, PO-only strike review and corrections.
-- S70-PO-20, S70-R109 and S70-R110; no point-ledger integration.

create table public.workforce_strike_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  trainer_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  source_key text not null,
  breach_at timestamptz not null check (pg_catalog.isfinite(breach_at)),
  recorded_at timestamptz not null default pg_catalog.clock_timestamp() check (pg_catalog.isfinite(recorded_at)),
  unique (workspace_id, id),
  unique (workspace_id, source_key)
);
alter table public.workforce_strike_events owner to postgres;
alter table public.workforce_strike_events enable row level security;
alter table public.workforce_strike_events force row level security;
revoke all on public.workforce_strike_events from public, anon, authenticated, service_role;

create table public.workforce_strike_corrections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  strike_id uuid not null,
  correction_no integer not null check (correction_no > 0),
  correction_kind text not null check (correction_kind in ('void', 'reinstate', 'reattribute')),
  target_trainer_user_id uuid references public.staff_profiles(user_id) on delete restrict,
  actor_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  reason text not null check (pg_catalog.btrim(reason) <> ''),
  idempotency_key uuid not null,
  request_hash bytea not null check (pg_catalog.octet_length(request_hash) = 32),
  audit_ref uuid not null default gen_random_uuid(),
  recorded_at timestamptz not null default pg_catalog.clock_timestamp() check (pg_catalog.isfinite(recorded_at)),
  unique (workspace_id, id),
  unique (workspace_id, strike_id, correction_no),
  unique (workspace_id, idempotency_key),
  unique (workspace_id, audit_ref),
  foreign key (workspace_id, strike_id)
    references public.workforce_strike_events(workspace_id, id) on delete restrict,
  check ((correction_kind = 'reattribute') = (target_trainer_user_id is not null))
);
alter table public.workforce_strike_corrections owner to postgres;
alter table public.workforce_strike_corrections enable row level security;
alter table public.workforce_strike_corrections force row level security;
revoke all on public.workforce_strike_corrections from public, anon, authenticated, service_role;

create index workforce_strike_events_window
  on public.workforce_strike_events(workspace_id, trainer_user_id, breach_at desc);
create index workforce_strike_corrections_latest
  on public.workforce_strike_corrections(workspace_id, strike_id, correction_no desc);

create function app_private.guard_workforce_strike_immutable() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op <> 'INSERT' or current_user <> 'postgres' then
    raise exception 'workforce_strike_immutable' using errcode = '23514';
  end if;
  return new;
end
$$;
alter function app_private.guard_workforce_strike_immutable() owner to postgres;
revoke all on function app_private.guard_workforce_strike_immutable() from public, anon, authenticated, service_role;

create function app_private.reject_workforce_strike_truncate() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'workforce_strike_immutable' using errcode = '23514';
end
$$;
alter function app_private.reject_workforce_strike_truncate() owner to postgres;
revoke all on function app_private.reject_workforce_strike_truncate() from public, anon, authenticated, service_role;

create trigger workforce_strike_events_immutable
  before update or delete on public.workforce_strike_events
  for each row execute function app_private.guard_workforce_strike_immutable();
create trigger workforce_strike_events_no_truncate
  before truncate on public.workforce_strike_events
  for each statement execute function app_private.reject_workforce_strike_truncate();
create trigger workforce_strike_corrections_immutable
  before update or delete on public.workforce_strike_corrections
  for each row execute function app_private.guard_workforce_strike_immutable();
create trigger workforce_strike_corrections_no_truncate
  before truncate on public.workforce_strike_corrections
  for each statement execute function app_private.reject_workforce_strike_truncate();

-- Called by the owner-only F15 scheduler and by the authorized PO projection.
-- A unique opaque source key makes concurrent sweeps idempotent.
create function app_private.record_due_workforce_strikes(p_evaluation_at timestamptz)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  source_row record;
  breach_trainer uuid;
  opaque_source text;
  inserted integer := 0;
  rows_inserted integer;
begin
  if current_user <> 'postgres' then
    raise exception 'workforce_strike_runner_owner_required' using errcode = '42501';
  end if;
  if p_evaluation_at is null or not pg_catalog.isfinite(p_evaluation_at) then
    raise exception 'invalid_evaluation_at' using errcode = '22023';
  end if;

  for source_row in
    select distinct on (s.workspace_id, s.id)
      s.workspace_id, s.id as subscription_id, s.client_id, sla.deadline_at as breach_at
    from public.subscriptions s
    join app_private.form_assignment_consumptions consumed
      on consumed.workspace_id = s.workspace_id
      and consumed.subscription_id = s.id
      and consumed.client_id = s.client_id
    join public.form_assignments fa
      on fa.workspace_id = consumed.workspace_id
      and fa.id = consumed.assignment_id
      and fa.client_id = consumed.client_id
      and fa.form_id = consumed.form_id
      and fa.occurrence_key = 'initial:' || s.client_id::text
    left join app_private.form_assignment_policies fp
      on fp.workspace_id = fa.workspace_id and fp.id = fa.policy_id
    join app_private.form_submissions fs
      on fs.workspace_id = fa.workspace_id and fs.assignment_id = fa.id
    join app_private.form_submission_slas sla
      on sla.workspace_id = fs.workspace_id and sla.assignment_id = fs.assignment_id
      and sla.rule_id = 'cairo-d03-v1'
    where s.kind = 'initial'
      and coalesce(fp.trigger_kind, 'onboarding') in ('joining', 'onboarding')
      and sla.deadline_at <= p_evaluation_at
    order by s.workspace_id, s.id, sla.deadline_at, fa.id
  loop
    -- Match F19's client -> subscription lock order, then re-read activations
    -- after any in-flight first-pair delivery commits.
    perform 1 from public.clients c
    where c.workspace_id = source_row.workspace_id and c.id = source_row.client_id
    for update;
    if not found then continue; end if;
    perform 1 from public.subscriptions s
    where s.workspace_id = source_row.workspace_id and s.id = source_row.subscription_id
    for update;
    if not found then continue; end if;
    if exists (
      select 1
      from public.subscription_activations a
      join public.plan_deliveries workout
        on workout.workspace_id = a.workspace_id
        and workout.id = a.workout_delivery_id
        and workout.subscription_id = a.subscription_id
        and workout.plan_kind = 'workout'
      join public.plan_deliveries nutrition
        on nutrition.workspace_id = a.workspace_id
        and nutrition.id = a.nutrition_delivery_id
        and nutrition.subscription_id = a.subscription_id
        and nutrition.plan_kind = 'nutrition'
      where a.workspace_id = source_row.workspace_id
        and a.subscription_id = source_row.subscription_id
        and a.activation_source = 'plan_deliveries'
        and a.activated_at <= source_row.breach_at
    ) then
      continue;
    end if;

    select a.trainer_user_id into breach_trainer
    from public.client_trainer_assignments a
    join public.workspace_memberships m
      on m.workspace_id = a.workspace_id and m.id = a.workspace_membership_id
      and m.user_id = a.trainer_user_id
    where a.workspace_id = source_row.workspace_id
      and a.client_id = source_row.client_id
      and a.assigned_at <= source_row.breach_at
      and (a.ended_at is null or a.ended_at > source_row.breach_at)
      and m.granted_at <= source_row.breach_at
      and (m.revoked_at is null or m.revoked_at > source_row.breach_at)
    order by a.assigned_at desc, a.id desc
    limit 1;

    if breach_trainer is null then
      continue;
    end if;

    opaque_source := pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          source_row.workspace_id::text || ':' || source_row.subscription_id::text || ':f15-d03-strike-v1',
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    insert into public.workforce_strike_events(
      workspace_id, trainer_user_id, source_key, breach_at
    ) values (
      source_row.workspace_id, breach_trainer, opaque_source, source_row.breach_at
    ) on conflict (workspace_id, source_key) do nothing;
    get diagnostics rows_inserted = row_count;
    inserted := inserted + rows_inserted;
  end loop;
  return inserted;
end
$$;
alter function app_private.record_due_workforce_strikes(timestamptz) owner to postgres;
revoke all on function app_private.record_due_workforce_strikes(timestamptz) from public, anon, authenticated, service_role;

create or replace function app_private.f15_alert_schedule_run() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare evaluation_at timestamptz := pg_catalog.clock_timestamp();
begin
  if current_user <> 'postgres' then
    raise exception 'f15_alert_owner_required' using errcode = '42501';
  end if;
  perform app_private.record_due_workforce_strikes(evaluation_at);
  return app_private.evaluate_forms_alerts_core(evaluation_at, null, 250);
end
$$;
alter function app_private.f15_alert_schedule_run() owner to postgres;
revoke all on function app_private.f15_alert_schedule_run() from public, anon, authenticated, service_role;

create function public.get_workforce_strikes(p_workspace_id uuid, p_trainer_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  active_count integer;
  threshold integer;
  history jsonb;
begin
  if auth.uid() is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_workspace_id is null
    or not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    return jsonb_build_object('status', 'not_permitted');
  end if;

  perform app_private.record_due_workforce_strikes(pg_catalog.clock_timestamp());
  if auth.uid() is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  with state_rows as (
    select e.id, e.breach_at, e.trainer_user_id,
      coalesce((
        select c.target_trainer_user_id from public.workforce_strike_corrections c
        where c.workspace_id = e.workspace_id and c.strike_id = e.id
          and c.correction_kind = 'reattribute'
        order by c.correction_no desc limit 1
      ), e.trainer_user_id) as effective_trainer_user_id,
      coalesce((
        select max(c.correction_no) from public.workforce_strike_corrections c
        where c.workspace_id = e.workspace_id and c.strike_id = e.id
          and c.correction_kind = 'void'
      ), 0) > coalesce((
        select max(c.correction_no) from public.workforce_strike_corrections c
        where c.workspace_id = e.workspace_id and c.strike_id = e.id
          and c.correction_kind = 'reinstate'
      ), 0) as is_void
    from public.workforce_strike_events e
    where e.workspace_id = p_workspace_id
      and e.breach_at > pg_catalog.now() - interval '90 days'
      and e.breach_at <= pg_catalog.now()
  )
  select count(*) filter (where not is_void)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'strike_id', id, 'breach_at', breach_at,
      'trainer_user_id', effective_trainer_user_id, 'voided', is_void
    ) order by breach_at desc, id), '[]'::jsonb)
    into active_count, history
  from state_rows
  where p_trainer_user_id is null or effective_trainer_user_id = p_trainer_user_id;
  threshold := case when active_count >= 9 then 9 when active_count >= 6 then 6
    when active_count >= 3 then 3 else 0 end;
  return jsonb_build_object(
    'status', 'ok', 'count', active_count, 'review_threshold', threshold, 'strikes', history
  );
end
$$;
alter function public.get_workforce_strikes(uuid, uuid) owner to postgres;
revoke all on function public.get_workforce_strikes(uuid, uuid) from public, anon, service_role;
grant execute on function public.get_workforce_strikes(uuid, uuid) to authenticated;

create function public.correct_workforce_strike(
  p_workspace_id uuid,
  p_strike_id uuid,
  p_operation text,
  p_target_trainer_user_id uuid,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  event_row public.workforce_strike_events%rowtype;
  prior public.workforce_strike_corrections%rowtype;
  request_hash bytea;
  next_no integer;
  latest_void integer;
  latest_reinstate integer;
  current_trainer uuid;
  audit_reference uuid;
  correction_id uuid;
begin
  if actor is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_strike_id is null or p_idempotency_key is null
    or p_operation not in ('void', 'reinstate', 'reattribute')
    or p_reason is null or pg_catalog.btrim(p_reason) = ''
    or ((p_operation = 'reattribute') <> (p_target_trainer_user_id is not null)) then
    return jsonb_build_object('status', 'invalid_input');
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'workspace_id', p_workspace_id, 'strike_id', p_strike_id,
      'operation', p_operation, 'target_trainer_user_id', p_target_trainer_user_id,
      'reason', p_reason, 'actor', actor
    )::text, 'UTF8'), 'sha256');

  select * into prior from public.workforce_strike_corrections c
  where c.workspace_id = p_workspace_id and c.idempotency_key = p_idempotency_key;
  if found then
    if prior.request_hash <> request_hash then
      return jsonb_build_object('status', 'idempotency_conflict');
    end if;
    return jsonb_build_object(
      'status', 'ok', 'correction_id', prior.id, 'audit_ref', prior.audit_ref, 'replayed', true
    );
  end if;

  select * into event_row from public.workforce_strike_events e
  where e.workspace_id = p_workspace_id and e.id = p_strike_id for update;
  if auth.uid() is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if not found then return jsonb_build_object('status', 'not_permitted'); end if;

  -- Recheck replay after acquiring the strike serialization row.
  select * into prior from public.workforce_strike_corrections c
  where c.workspace_id = p_workspace_id and c.idempotency_key = p_idempotency_key;
  if found then
    if prior.request_hash <> request_hash then
      return jsonb_build_object('status', 'idempotency_conflict');
    end if;
    return jsonb_build_object(
      'status', 'ok', 'correction_id', prior.id, 'audit_ref', prior.audit_ref, 'replayed', true
    );
  end if;

  select coalesce(max(c.correction_no) filter (where c.correction_kind = 'void'), 0),
    coalesce(max(c.correction_no) filter (where c.correction_kind = 'reinstate'), 0),
    coalesce((array_agg(c.target_trainer_user_id order by c.correction_no desc)
      filter (where c.correction_kind = 'reattribute'))[1], event_row.trainer_user_id)
    into latest_void, latest_reinstate, current_trainer
  from public.workforce_strike_corrections c
  where c.workspace_id = p_workspace_id and c.strike_id = p_strike_id;
  if p_operation = 'reinstate' and latest_void <= latest_reinstate then
    return jsonb_build_object('status', 'invalid_correction');
  end if;
  if p_operation = 'reattribute' then
    if p_target_trainer_user_id = current_trainer or not exists (
      select 1 from public.staff_profiles sp
      join public.workspace_memberships m on m.user_id = sp.user_id
      where sp.user_id = p_target_trainer_user_id
        and sp.role = 'trainer'::public.staff_role
        and m.workspace_id = p_workspace_id and m.user_id = p_target_trainer_user_id
        and m.granted_at <= event_row.breach_at
        and (m.revoked_at is null or m.revoked_at > event_row.breach_at)
    ) then
      return jsonb_build_object('status', 'invalid_target');
    end if;
  end if;
  select coalesce(max(c.correction_no), 0) + 1 into next_no
  from public.workforce_strike_corrections c
  where c.workspace_id = p_workspace_id and c.strike_id = p_strike_id;
  audit_reference := gen_random_uuid();
  insert into public.workforce_strike_corrections(
    workspace_id, strike_id, correction_no, correction_kind, target_trainer_user_id,
    actor_user_id, reason, idempotency_key, request_hash, audit_ref
  ) values (
    p_workspace_id, p_strike_id, next_no, p_operation, p_target_trainer_user_id,
    actor, p_reason, p_idempotency_key, request_hash, audit_reference
  ) returning id into correction_id;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (actor, 'workforce.strike_corrected', 'workforce_strike_corrections', correction_id,
    p_workspace_id, jsonb_build_object('reference', audit_reference));
  return jsonb_build_object(
    'status', 'ok', 'correction_id', correction_id, 'audit_ref', audit_reference, 'replayed', false
  );
end
$$;
alter function public.correct_workforce_strike(uuid, uuid, text, uuid, text, uuid) owner to postgres;
revoke all on function public.correct_workforce_strike(uuid, uuid, text, uuid, text, uuid) from public, anon, service_role;
grant execute on function public.correct_workforce_strike(uuid, uuid, text, uuid, text, uuid) to authenticated;
