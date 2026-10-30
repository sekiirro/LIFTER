create or replace function public.subscription_payment_status(
  workspace_id uuid,
  client_id uuid,
  subscription_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not app_private.f12_u5_authorized(workspace_id, 'record_payment') then
    return jsonb_build_object('status', 'not_permitted');
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'obligation_id', i.id,
      'seq', i.seq,
      'amount_minor', i.amount_minor::text,
      'currency', i.currency,
      'revision', coalesce(t.revision, 0),
      'tail_event_id', t.id,
      'kind', t.kind,
      'paid', coalesce(t.kind = 'collection', false),
      'due_on', case
        when i.seq = 1 or a.activated_at is null then null
        else (a.activated_at at time zone 'Africa/Cairo')::date + i.issued_day_offset
      end,
      'collected_on', t.collected_on,
      'effective_on', t.effective_on,
      'recorded_by', t.recorded_by
    )
    order by i.seq
  )
  into result
  from public.clients c
  join public.subscriptions s
    on s.workspace_id = c.workspace_id and s.client_id = c.id
  join public.subscription_installments i
    on i.workspace_id = s.workspace_id and i.subscription_id = s.id
  left join public.subscription_activations a
    on a.workspace_id = s.workspace_id and a.subscription_id = s.id
  left join lateral (
    select e.*
    from public.payment_events e
    where e.workspace_id = i.workspace_id and e.obligation_id = i.id
    order by e.revision desc
    limit 1
  ) t on true
  where c.workspace_id = subscription_payment_status.workspace_id
    and c.id = subscription_payment_status.client_id
    and s.id = subscription_payment_status.subscription_id;

  if result is null then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  return jsonb_build_object('status', 'ok', 'obligations', result);
end;
$$;

alter function public.subscription_payment_status(uuid, uuid, uuid)
  owner to postgres;
