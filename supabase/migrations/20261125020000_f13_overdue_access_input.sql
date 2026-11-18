-- F13 FR-028 independent overdue input (S66). Adds no table, status or lifecycle rule.
-- Derives overdue from existing immutable facts only: the due date already exposed by
-- public.subscription_payment_status (renewal rows: stored due_on; initial rows 2+: Cairo
-- activation date + issued_day_offset; initial seq 1 has no due date because its first
-- collection is required at approval), the payment_events tail (paid = tail kind collection) and
-- subscription_obligation_cancellations. An installment is payable through Cairo day-end, so it is
-- overdue only when as_of is strictly after its due date. Overdue is independent of entitlement,
-- freeze, expiry and refund state (FR-010, FR-028); clearing it never changes those.

-- One subscription. Same shape and tenant check as f13_project_entitlement.
create function app_private.f13_project_overdue(ws uuid, sid uuid, as_of date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  overdue_count integer;
  first_due date;
  first_seq integer;
begin
  if as_of is null or not isfinite(as_of) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.subscriptions s where s.workspace_id = ws and s.id = sid) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  with due as (
    select i.seq,
      case
        when i.renewal_id is not null or s.kind = 'renewal' then i.due_on
        when i.seq = 1 or a.activated_at is null then null
        else (a.activated_at at time zone 'Africa/Cairo')::date + i.issued_day_offset
      end as due_on,
      coalesce(t.kind = 'collection', false) as paid
    from public.subscriptions s
    join public.subscription_installments i
      on i.workspace_id = s.workspace_id and i.subscription_id = s.id
    left join public.subscription_activations a
      on a.workspace_id = s.workspace_id and a.subscription_id = s.id
    left join lateral (
      select e.kind from public.payment_events e
      where e.workspace_id = i.workspace_id and e.obligation_id = i.id
      order by e.revision desc limit 1
    ) t on true
    where s.workspace_id = ws and s.id = sid
      and not exists (
        select 1 from public.subscription_obligation_cancellations c
        where c.workspace_id = i.workspace_id and c.obligation_id = i.id)
  )
  select count(*)::integer, min(d.due_on), (array_agg(d.seq order by d.due_on, d.seq))[1]
    into overdue_count, first_due, first_seq
  from due d
  where not d.paid and d.due_on is not null and d.due_on < as_of;
  return jsonb_build_object(
    'overdue', overdue_count > 0,
    'overdue_since', first_due,
    'first_overdue_seq', first_seq,
    'overdue_installment_count', overdue_count,
    'reason', case when overdue_count > 0 then 'installment_past_due' else null end);
end $$;

-- One client (all of its subscriptions, so a continuous renewal chain is covered). Tenant-scoped:
-- a client id from another workspace resolves to nothing and fails closed.
create function app_private.f13_client_overdue_state(ws uuid, cid uuid, as_of date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  total integer := 0;
  since date;
  seq integer;
  r jsonb;
  s record;
begin
  if as_of is null or not isfinite(as_of) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients c where c.workspace_id = ws and c.id = cid) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  for s in select x.id from public.subscriptions x
    where x.workspace_id = ws and x.client_id = cid order by x.created_at, x.id loop
    r := app_private.f13_project_overdue(ws, s.id, as_of);
    if (r->>'overdue')::boolean then
      total := total + (r->>'overdue_installment_count')::integer;
      if since is null or (r->>'overdue_since')::date < since then
        since := (r->>'overdue_since')::date;
        seq := (r->>'first_overdue_seq')::integer;
      end if;
    end if;
  end loop;
  return jsonb_build_object(
    'overdue', total > 0,
    'overdue_since', since,
    'first_overdue_seq', seq,
    'overdue_installment_count', total,
    'reason', case when total > 0 then 'installment_past_due' else null end);
end $$;

-- Client wall: the caller's own account only. No client or workspace argument, so no foreign
-- target can be named. Returns no amounts, ids or payment details, only the restriction facts.
create function public.client_overdue_status()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  client_row record;
  match_count integer;
  state jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'invalid'); end if;
  select count(*)::integer into match_count
    from public.clients c where c.auth_user_id = auth.uid() and c.approval_state = 'approved'
      and c.deactivated_at is null;
  if match_count <> 1 then return jsonb_build_object('status', 'invalid'); end if;
  select c.workspace_id, c.id into client_row
    from public.clients c where c.auth_user_id = auth.uid() and c.approval_state = 'approved'
      and c.deactivated_at is null;
  state := app_private.f13_client_overdue_state(client_row.workspace_id, client_row.id,
    (statement_timestamp() at time zone 'Africa/Cairo')::date);
  return jsonb_build_object('status', 'ok') || state;
end $$;

alter function app_private.f13_project_overdue(uuid, uuid, date) owner to postgres;
alter function app_private.f13_client_overdue_state(uuid, uuid, date) owner to postgres;
alter function public.client_overdue_status() owner to postgres;
revoke all on function app_private.f13_project_overdue(uuid, uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function app_private.f13_client_overdue_state(uuid, uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function public.client_overdue_status() from public, anon, authenticated, service_role;
grant execute on function app_private.f13_project_overdue(uuid, uuid, date) to service_role;
grant execute on function app_private.f13_client_overdue_state(uuid, uuid, date) to service_role;
grant execute on function public.client_overdue_status() to authenticated;
