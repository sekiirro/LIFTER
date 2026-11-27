-- S72 P7 S1: route through every closed period and make generic job claims scoped.

-- Replace the all-kind claim RPC so cron can lease only jobs with a registered
-- generic handler. Dedicated claimants retain ownership of their own kinds.
drop function public.jobs_claim(integer, integer);

create function public.jobs_claim(
  batch integer default 25,
  lease_seconds integer default 300,
  allowed_kinds text[] default '{}'::text[]
) returns setof public.jobs
language plpgsql security definer set search_path = '' as $$
begin
  if batch is null or batch < 1 or lease_seconds is null or lease_seconds < 1
    or allowed_kinds is null then
    raise exception 'Invalid claim parameters' using errcode = '22023';
  end if;

  -- Retire only exhausted leases owned by this claimant. In particular, a
  -- generic worker must not dead-letter a dedicated claimant's job kind.
  with exhausted as (
    select j.id from public.jobs j
    where j.kind = any(allowed_kinds)
      and j.status = 'running' and j.lease_expires_at < now()
      and j.attempts >= j.max_attempts
    for update skip locked
  )
  update public.jobs j
  set status = 'dead', last_error = 'lease_expired', finished_at = now(),
      lease_token = null, lease_expires_at = null
  from exhausted where j.id = exhausted.id;

  return query
  with picked as (
    select j.id from public.jobs j
    where j.kind = any(allowed_kinds)
      and ((j.status = 'pending' and j.run_at <= now())
        or (j.status = 'running' and j.lease_expires_at < now()))
    order by j.run_at
    limit least(batch, 100)
    for update skip locked
  )
  update public.jobs j
  set status = 'running', attempts = j.attempts + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + lease_seconds * interval '1 second'
  from picked where j.id = picked.id
  returning j.*;
end;
$$;

alter function public.jobs_claim(integer, integer, text[]) owner to postgres;
revoke execute on function public.jobs_claim(integer, integer, text[])
  from public, anon, authenticated, service_role;
grant execute on function public.jobs_claim(integer, integer, text[]) to service_role;

-- Keep retry routing serialized across the complete set of candidate periods.
-- A later month can close while this transaction waits for its fence too.
create or replace function app_private.p7_route_closed_period()
returns trigger language plpgsql set search_path = '' as $$
declare
  candidate_month date;
  original_month date;
  actor uuid := auth.uid();
  source_kind text;
begin
  original_month := coalesce(new.original_month, new.effective_month);
  candidate_month := new.effective_month;

  if tg_table_name = 'p7_earned_points' then
    if new.rule_version = 'p7-activation-v1' then
      select a.activation_source into source_kind
      from public.productivity_units u
      join public.subscription_activations a
        on a.workspace_id = u.workspace_id and a.id = u.activation_id
        and a.subscription_id = u.subscription_id
      where u.workspace_id = new.workspace_id and u.id = new.source_key;
    end if;
  end if;

  for attempt in 1..120 loop
    perform app_private.p7_lock_period(new.workspace_id, candidate_month);

    -- The source producer and this route trigger both recheck after each fence
    -- wait. The latter also covers the fence for a rerouted effective month.
    if source_kind is not null then
      perform app_private.p7_recheck_f19_earned_actor(
        new.workspace_id, actor, source_kind
      );
    end if;

    if not exists (
      select 1 from public.p7_month_snapshots s
      where s.workspace_id = new.workspace_id
        and s.effective_month = candidate_month
    ) then
      new.effective_month := candidate_month;
      new.original_month := original_month;
      return new;
    end if;

    candidate_month := greatest(
      app_private.p7_month_for_trigger(clock_timestamp()),
      (candidate_month + interval '1 month')::date
    );
  end loop;

  raise exception 'p7_period_route_retry' using errcode = '40001';
end
$$;

create function app_private.p7_recheck_f19_earned_actor(
  p_workspace_id uuid,
  p_actor uuid,
  p_activation_source text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Only explicitly trusted database/service callers may use the null-actor
  -- path. Authenticated producers must retain their original capability.
  if p_actor is null then
    if current_setting('request.jwt.claim.role', true) = 'service_role'
      or session_user in ('postgres', 'supabase_admin') then
      return;
    end if;
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if auth.uid() is distinct from p_actor then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if p_activation_source = 'po_override' then
    if not exists (
      select 1 from public.staff_profiles p
      where p.user_id = p_actor and p.role = 'platform_owner'
    ) then
      raise exception 'not_permitted' using errcode = '42501';
    end if;
  elsif p_activation_source = 'plan_deliveries' then
    if not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
      raise exception 'not_permitted' using errcode = '42501';
    end if;
  else
    raise exception 'not_permitted' using errcode = '42501';
  end if;
end
$$;

create or replace function app_private.p7_earn_f19_activation()
returns trigger language plpgsql set search_path = '' as $$
declare
  activation record;
  trigger_month date;
  fact_id uuid;
  actor uuid := auth.uid();
begin
  select a.activated_at, a.activation_source, s.kind into activation
  from public.subscription_activations a
  join public.subscriptions s
    on s.workspace_id = a.workspace_id and s.id = a.subscription_id
  where a.workspace_id = new.workspace_id and a.id = new.activation_id
    and a.subscription_id = new.subscription_id;
  if not found or activation.activation_source not in ('plan_deliveries', 'po_override')
    or activation.kind <> 'initial' then
    return new;
  end if;

  trigger_month := app_private.p7_month_for_trigger(activation.activated_at);
  perform app_private.p7_lock_period(new.workspace_id, trigger_month);
  perform app_private.p7_recheck_f19_earned_actor(
    new.workspace_id, actor, activation.activation_source
  );

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
    values (actor, 'workforce.earned_fact_recorded', 'p7_earned_points', fact_id,
      new.workspace_id, jsonb_build_object('reference', new.id::text));
  end if;
  return new;
end
$$;

alter function app_private.p7_route_closed_period() owner to postgres;
alter function app_private.p7_recheck_f19_earned_actor(uuid, uuid, text) owner to postgres;
alter function app_private.p7_earn_f19_activation() owner to postgres;
revoke all on function app_private.p7_route_closed_period(),
  app_private.p7_recheck_f19_earned_actor(uuid, uuid, text),
  app_private.p7_earn_f19_activation()
  from public, anon, authenticated, service_role;
