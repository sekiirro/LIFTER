-- T009: record the plan-delay point from the shared F15 D-03 breach evaluation.
create table public.workforce_plan_delay_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  trainer_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  confirmer_user_id uuid references public.staff_profiles(user_id) on delete restrict,
  breach_at timestamptz not null check (isfinite(breach_at)),
  source_key uuid not null,
  recorded_at timestamptz not null default clock_timestamp() check (isfinite(recorded_at)),
  unique (workspace_id, id),
  unique (workspace_id, source_key),
  foreign key (workspace_id, source_key)
    references public.p7_adjustment_entries(workspace_id, source_key) on delete restrict
);
alter table public.workforce_plan_delay_events owner to postgres;
alter table public.workforce_plan_delay_events enable row level security;
alter table public.workforce_plan_delay_events force row level security;
revoke all on public.workforce_plan_delay_events from public, anon, authenticated, service_role;
create index workforce_plan_delay_events_trainer_period_idx
  on public.workforce_plan_delay_events(workspace_id, trainer_user_id, breach_at desc);

create function app_private.guard_workforce_plan_delay_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'workforce_plan_delay_immutable' using errcode = '23514';
end
$$;
alter function app_private.guard_workforce_plan_delay_immutable() owner to postgres;
revoke all on function app_private.guard_workforce_plan_delay_immutable() from public, anon, authenticated, service_role;
create trigger workforce_plan_delay_events_immutable
  before update or delete on public.workforce_plan_delay_events
  for each row execute function app_private.guard_workforce_plan_delay_immutable();
create trigger workforce_plan_delay_events_no_truncate
  before truncate on public.workforce_plan_delay_events
  for each statement execute function app_private.guard_workforce_plan_delay_immutable();
create or replace function app_private.record_due_workforce_strikes(p_evaluation_at timestamptz)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  source_row record;
  breach_trainer uuid;
  confirmer uuid;
  first_pair_at timestamptz;
  opaque_hex text;
  opaque_source uuid;
  strike_source text;
  source_hash text;
  event_id uuid;
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
    join public.form_assignments fa
      on fa.workspace_id = s.workspace_id and fa.client_id = s.client_id
      and fa.occurrence_key = 'initial'
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
    -- Preserve F19 source-lock order before the shared P7 period fence.
    perform 1 from public.clients c
    where c.workspace_id = source_row.workspace_id and c.id = source_row.client_id
    for update;
    if not found then continue; end if;
    perform 1 from public.subscriptions s
    where s.workspace_id = source_row.workspace_id and s.id = source_row.subscription_id
    for update;
    if not found then continue; end if;
    if exists (
      select 1 from public.subscription_activations a
      where a.workspace_id = source_row.workspace_id
        and a.subscription_id = source_row.subscription_id
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
    if breach_trainer is null then continue; end if;

    opaque_hex := pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(source_row.workspace_id::text || ':' || source_row.client_id::text || ':f15-d03-plan-delay-v1','UTF8'),
      'sha256'), 'hex');
    opaque_source := (pg_catalog.substr(opaque_hex,1,8)||'-'||pg_catalog.substr(opaque_hex,9,4)||'-'||
      pg_catalog.substr(opaque_hex,13,4)||'-'||pg_catalog.substr(opaque_hex,17,4)||'-'||
      pg_catalog.substr(opaque_hex,21,12))::uuid;
    source_hash := opaque_hex;
    strike_source := pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(source_row.workspace_id::text || ':' || source_row.subscription_id::text || ':f15-d03-strike-v1','UTF8'),
      'sha256'), 'hex');

    insert into public.workforce_strike_events(workspace_id, trainer_user_id, source_key, breach_at)
    values (source_row.workspace_id, breach_trainer, strike_source, source_row.breach_at)
    on conflict (workspace_id, source_key) do nothing;
    get diagnostics rows_inserted = row_count;
    inserted := inserted + rows_inserted;

    -- The first successful pair is the activation's persisted delivery event.
    -- Its delivery actor is the confirmer; it never changes breach attribution.
    select a.activated_at, d.delivered_by into first_pair_at, confirmer
    from public.subscription_activations a
    left join public.plan_deliveries d
      on d.workspace_id = a.workspace_id and d.subscription_id = a.subscription_id
      and d.delivery_event_id = a.delivery_event_id
    where a.workspace_id = source_row.workspace_id
      and a.subscription_id = source_row.subscription_id
      and a.activation_source = 'plan_deliveries'
      and a.activated_at > source_row.breach_at
    order by a.activated_at, a.id
    limit 1;
    if first_pair_at is null then continue; end if;

    insert into public.p7_adjustment_entries(
      workspace_id, staff_user_id, points, effective_month, original_month,
      source_key, source_hash, reason_code
    ) values (
      source_row.workspace_id, breach_trainer, -1.00,
      app_private.p7_month_for_trigger(source_row.breach_at),
      app_private.p7_month_for_trigger(source_row.breach_at),
      opaque_source, source_hash, 'workforce.plan_delay'
    ) on conflict (workspace_id, source_key) do nothing;
    get diagnostics rows_inserted = row_count;
    if rows_inserted = 0 then continue; end if;

    insert into public.workforce_plan_delay_events(
      workspace_id, trainer_user_id, confirmer_user_id, breach_at, source_key
    ) values (
      source_row.workspace_id, breach_trainer, confirmer, source_row.breach_at, opaque_source
    ) returning id into event_id;
    insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
    values (null, 'workforce.plan_delay_recorded', 'workforce_plan_delay_events', event_id,
      source_row.workspace_id, pg_catalog.jsonb_build_object('reference', opaque_source));
  end loop;
  return inserted;
end
$$;
alter function app_private.record_due_workforce_strikes(timestamptz) owner to postgres;
revoke all on function app_private.record_due_workforce_strikes(timestamptz) from public, anon, authenticated, service_role;

comment on table public.workforce_plan_delay_events is
  'Immutable non-PII plan-delay event evidence. Source keys are opaque; original assignment and F15 delivery actor are separate.';