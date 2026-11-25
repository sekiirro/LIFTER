-- P7 T007/T008: retain F19 activation points independently from client rows.

create table public.p7_earned_points (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  staff_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  points numeric(10,2) not null check (points = 1.00),
  effective_month date not null check (extract(day from effective_month) = 1),
  trigger_at timestamptz not null check (isfinite(trigger_at)),
  recorded_at timestamptz not null default clock_timestamp() check (isfinite(recorded_at)),
  rule_version text not null check (rule_version ~ '^p7-[a-z0-9-]{1,72}$'),
  source_key uuid not null,
  source_hash text not null,
  unique (workspace_id, source_key)
);
alter table public.p7_earned_points owner to postgres;
alter table public.p7_earned_points enable row level security;
alter table public.p7_earned_points force row level security;
revoke all on public.p7_earned_points from public, anon, authenticated, service_role;
create index p7_earned_points_period_staff_idx
  on public.p7_earned_points(workspace_id, effective_month, staff_user_id);

create function app_private.p7_month_for_trigger(p_trigger_at timestamptz)
returns date language sql stable set search_path = '' as $$
  select pg_catalog.date_trunc('month', p_trigger_at at time zone 'Africa/Cairo')::date
$$;

-- Fixed order: F19 holds its client and subscription source locks before its
-- productivity-unit trigger takes this fence.
create function app_private.p7_lock_period(p_workspace_id uuid, p_month date)
returns void language plpgsql volatile set search_path = '' as $$
begin
  if p_workspace_id is null or p_month is null or extract(day from p_month) <> 1 then
    raise exception 'invalid_p7_period' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_month::text, 0)
  );
end
$$;

create function app_private.p7_reject_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'p7_ledger_immutable' using errcode = '23514';
end
$$;

create function app_private.p7_earn_f19_activation()
returns trigger language plpgsql set search_path = '' as $$
declare activation record; trigger_month date; fact_id uuid;
begin
  select a.activated_at, a.activation_source, s.kind into activation
  from public.subscription_activations a
  join public.subscriptions s on s.workspace_id = a.workspace_id and s.id = a.subscription_id
  where a.workspace_id = new.workspace_id and a.id = new.activation_id
    and a.subscription_id = new.subscription_id;
  if not found or activation.activation_source not in ('plan_deliveries', 'po_override')
    or activation.kind <> 'initial' then
    return new;
  end if;

  trigger_month := app_private.p7_month_for_trigger(activation.activated_at);
  perform app_private.p7_lock_period(new.workspace_id, trigger_month);
  insert into public.p7_earned_points(workspace_id, staff_user_id, points,
    effective_month, trigger_at, rule_version, source_key, source_hash)
  values (new.workspace_id, new.recipient_trainer_user_id, 1.00,
    trigger_month, activation.activated_at, 'p7-activation-v1', new.id,
    pg_catalog.md5(new.workspace_id::text || '|' || new.recipient_trainer_user_id::text ||
      '|1.00|' || activation.activated_at::text || '|p7-activation-v1'))
  on conflict (workspace_id, source_key) do nothing
  returning id into fact_id;
  if fact_id is not null then
    insert into public.audit_events(actor_user_id, action, target_table, target_id,
      workspace_id, details)
    values (auth.uid(), 'workforce.earned_fact_recorded', 'p7_earned_points', fact_id,
      new.workspace_id, jsonb_build_object('reference', new.id::text));
  end if;
  return new;
end
$$;

create trigger p7_earned_points_immutable
  before update or delete on public.p7_earned_points
  for each row execute function app_private.p7_reject_mutation();
create trigger p7_earned_points_no_truncate
  before truncate on public.p7_earned_points
  for each statement execute function app_private.p7_reject_mutation();

-- Backfill historical non-PII facts before installing the live producer trigger.
insert into public.p7_earned_points(workspace_id, staff_user_id, points,
  effective_month, trigger_at, rule_version, source_key, source_hash)
select u.workspace_id, u.recipient_trainer_user_id, 1.00,
  app_private.p7_month_for_trigger(a.activated_at), a.activated_at,
  'p7-activation-v1', u.id,
  pg_catalog.md5(u.workspace_id::text || '|' || u.recipient_trainer_user_id::text ||
    '|1.00|' || a.activated_at::text || '|p7-activation-v1')
from public.productivity_units u
join public.subscription_activations a
  on a.workspace_id = u.workspace_id and a.id = u.activation_id
  and a.subscription_id = u.subscription_id
join public.subscriptions s
  on s.workspace_id = a.workspace_id and s.id = a.subscription_id
where a.activation_source in ('plan_deliveries', 'po_override') and s.kind = 'initial'
on conflict (workspace_id, source_key) do nothing;

create trigger p7_earn_f19_activation_after_insert
  after insert on public.productivity_units
  for each row execute function app_private.p7_earn_f19_activation();

alter function app_private.p7_month_for_trigger(timestamptz) owner to postgres;
alter function app_private.p7_lock_period(uuid,date) owner to postgres;
alter function app_private.p7_reject_mutation() owner to postgres;
alter function app_private.p7_earn_f19_activation() owner to postgres;
revoke all on function app_private.p7_month_for_trigger(timestamptz),
  app_private.p7_lock_period(uuid,date), app_private.p7_reject_mutation(),
  app_private.p7_earn_f19_activation()
  from public, anon, authenticated, service_role;

comment on table public.p7_earned_points is
  'Durable non-PII P7 facts; source_key is an opaque F19 productivity-unit UUID with no client foreign key.';
