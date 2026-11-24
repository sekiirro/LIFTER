-- S70-R47: a pending auth lockout holds closure data; success restarts its clock.
create or replace function app_private.purge_retention_candidates(p_sampled_at timestamptz)
returns table(data_class text, workspace_id uuid, record_id text, client_id uuid)
language sql stable security invoker set search_path = '' as $$
  with eligible_clients as (
    select c.workspace_id,c.id
    from public.clients c
    left join app_private.refund_auth_lockouts l on l.client_id=c.id
    where c.deactivated_at is not null
      and (l.id is null or l.status = 'succeeded')
      and coalesce(l.completed_at,c.deactivated_at) <= p_sampled_at - interval '30 days'
  )
  select 'client'::text,c.workspace_id,c.id::text,c.id
  from eligible_clients c
  union all
  select 'payment_event'::text,p.workspace_id,p.id::text,s.client_id
  from public.payment_events p
  join public.subscriptions s on s.workspace_id=p.workspace_id and s.id=p.subscription_id
  join eligible_clients c on c.workspace_id=s.workspace_id and c.id=s.client_id
  union all
  select 'refund_operation'::text,r.workspace_id,r.id::text,r.client_id
  from public.refund_operations r
  join eligible_clients c on c.workspace_id=r.workspace_id and c.id=r.client_id
  union all
  select 'refund_allocation_event'::text,a.workspace_id,a.id::text,r.client_id
  from public.refund_allocation_events a
  join public.refund_operations r
    on r.workspace_id=a.workspace_id and r.subscription_id=a.subscription_id
      and r.id=a.refund_operation_id
  join eligible_clients c on c.workspace_id=r.workspace_id and c.id=r.client_id
  union all
  select 'subscription_obligation_cancellation'::text,x.workspace_id,x.id::text,r.client_id
  from public.subscription_obligation_cancellations x
  join public.refund_operations r
    on r.workspace_id=x.workspace_id and r.subscription_id=x.subscription_id
      and r.id=x.refund_operation_id
  join eligible_clients c on c.workspace_id=r.workspace_id and c.id=r.client_id
  union all
  select 'audit_event'::text,a.workspace_id,a.id::text,null::uuid
  from public.audit_events a
  where a.occurred_at <= p_sampled_at - interval '30 days'
$$;
alter function app_private.purge_retention_candidates(timestamptz) owner to postgres;
revoke all on function app_private.purge_retention_candidates(timestamptz)
  from public,anon,authenticated,service_role;
