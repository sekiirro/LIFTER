create or replace function public.workspace_payment_queue(workspace_id uuid,cursor_id uuid default null,page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; totals jsonb; next_id uuid; more boolean;
begin
  if not app_private.f12_u5_authorized(workspace_id,'record_payment') then return jsonb_build_object('status','not_permitted'); end if;
  if page_size is null or page_size<1 or page_size>100 then return jsonb_build_object('status','invalid_input'); end if;
  with unpaid_by_subscription_currency as (
    select i.workspace_id,i.subscription_id,i.currency,sum(i.amount_minor)::bigint as unpaid_minor
    from public.subscription_installments i
    left join lateral (select e.kind from public.payment_events e where e.workspace_id=i.workspace_id
      and e.obligation_id=i.id order by e.revision desc limit 1) tail on true
    where tail.kind is distinct from 'collection'
    group by i.workspace_id,i.subscription_id,i.currency
  ), all_candidates as (
    select c.id as client_id,s.id as subscription_id,c.name,c.approval_state,s.price_minor,s.currency,
      coalesce((select jsonb_agg(jsonb_build_object('currency',balances.currency,
        'unpaid_minor',balances.unpaid_minor::text) order by balances.currency)
        from unpaid_by_subscription_currency balances
        where balances.workspace_id=s.workspace_id and balances.subscription_id=s.id),'[]'::jsonb)
        as unpaid_by_currency
    from public.clients c join public.subscriptions s on s.workspace_id=c.workspace_id and s.client_id=c.id
    where c.workspace_id=workspace_payment_queue.workspace_id and c.approval_state='approved'
      and c.deactivated_at is null
  ), all_installments as (
    select i.currency, i.amount_minor,
      (tail.kind is distinct from 'collection') as unpaid
    from public.clients c join public.subscriptions s on s.workspace_id=c.workspace_id and s.client_id=c.id
    join public.subscription_installments i on i.workspace_id=s.workspace_id and i.subscription_id=s.id
    left join lateral (select e.kind from public.payment_events e where e.workspace_id=i.workspace_id
      and e.obligation_id=i.id order by e.revision desc limit 1) tail on true
    where c.workspace_id=workspace_payment_queue.workspace_id and c.approval_state='approved'
      and c.deactivated_at is null
  ), currency_totals as (
    select coalesce(jsonb_agg(jsonb_build_object('currency',t.currency,'unpaid_minor',t.unpaid_minor::text)
      order by t.currency),'[]'::jsonb) as value
    from (
      select i.currency,sum(i.amount_minor)::bigint as unpaid_minor
      from all_installments i
      where i.unpaid
      group by i.currency
    ) t
  ), candidates as (
    select q.* from all_candidates q
    where workspace_payment_queue.cursor_id is null or q.subscription_id>workspace_payment_queue.cursor_id
    order by q.subscription_id limit workspace_payment_queue.page_size+1
  ), numbered as (
    select row_number() over(order by q.subscription_id) as rn,q.* from candidates q
  )
  select coalesce(jsonb_agg(jsonb_build_object('client_id',q.client_id,'subscription_id',q.subscription_id,
      'name',q.name,'approval_state',q.approval_state,'price_minor',q.price_minor::text,
      'currency',q.currency,'unpaid_by_currency',q.unpaid_by_currency) order by q.rn)
      filter(where q.rn<=workspace_payment_queue.page_size),'[]'::jsonb),
    count(*)>workspace_payment_queue.page_size,
    (array_agg(q.subscription_id order by q.rn) filter(where q.rn<=workspace_payment_queue.page_size))[workspace_payment_queue.page_size],
    (select value from currency_totals)
    into result,more,next_id,totals from numbered q;
  return jsonb_build_object('status','ok','items',result,'totals',totals,
    'next_cursor',case when more then next_id else null end);
end $$;

alter function public.workspace_payment_queue(uuid,uuid,integer) owner to postgres;
revoke all on function public.workspace_payment_queue(uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.workspace_payment_queue(uuid,uuid,integer) to authenticated;
