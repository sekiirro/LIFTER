-- T039 extends the PO-only Sales funnel with authoritative payment and P7 facts.
-- The return shape changes, so replace the existing OUT-column definition atomically.
drop function public.get_sales_funnel(uuid, date);

create or replace function public.get_sales_funnel(workspace_id uuid, p_month date)
returns table (
  month date,
  sales_user_id uuid,
  link_count bigint,
  registration_count bigint,
  approval_count bigint,
  first_payment_count bigint,
  acquisition_point_count bigint,
  acquisition_points text,
  refund_reversal_count bigint,
  refund_reversal_points text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(app_private.is_platform_owner(), false) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  return query
    with requested_month as (
      select pg_catalog.date_trunc('month', $2::timestamp)::date as month_start
    ),
    link_counts as (
      select l.created_by as sales_user_id,
        pg_catalog.count(distinct l.id)::bigint as link_count
      from public.registration_links l
      cross join requested_month m
      where l.workspace_id = $1
        and l.created_by_role_snapshot = 'sales'::public.staff_role
        and pg_catalog.date_trunc(
          'month', pg_catalog.timezone('Africa/Cairo', l.created_at)
        )::date = m.month_start
      group by l.created_by
    ),
    registration_counts as (
      select l.created_by as sales_user_id,
        pg_catalog.count(distinct c.id)::bigint as registration_count
      from public.clients c
      join public.registration_links l
        on l.workspace_id = c.workspace_id and l.id = c.registration_link_id
      cross join requested_month m
      where c.workspace_id = $1
        and l.created_by_role_snapshot = 'sales'::public.staff_role
        and pg_catalog.date_trunc(
          'month', pg_catalog.timezone('Africa/Cairo', c.created_at)
        )::date = m.month_start
      group by l.created_by
    ),
    approval_counts as (
      select l.created_by as sales_user_id,
        pg_catalog.count(distinct a.client_id)::bigint as approval_count
      from app_private.registration_approval_events a
      join public.clients c
        on c.workspace_id = a.workspace_id and c.id = a.client_id
      join public.registration_links l
        on l.workspace_id = c.workspace_id and l.id = c.registration_link_id
      cross join requested_month m
      where a.workspace_id = $1
        and l.created_by_role_snapshot = 'sales'::public.staff_role
        and pg_catalog.date_trunc(
          'month', pg_catalog.timezone('Africa/Cairo', a.approved_at)
        )::date = m.month_start
      group by l.created_by
    ),
    first_payment_counts as (
      select l.created_by as sales_user_id,
        pg_catalog.count(distinct e.subscription_id)::bigint as first_payment_count
      from public.payment_events e
      join public.subscriptions s
        on s.workspace_id = e.workspace_id and s.id = e.subscription_id
      join public.registration_links l
        on l.workspace_id = s.workspace_id and l.id = s.registration_link_id
      cross join requested_month m
      where e.workspace_id = $1
        and e.kind = 'collection'
        and e.installment_seq = 1
        and l.created_by_role_snapshot = 'sales'::public.staff_role
        and pg_catalog.date_trunc(
          'month', pg_catalog.timezone('Africa/Cairo', e.recorded_at)
        )::date = m.month_start
        and not exists (
          select 1 from public.payment_events reversal
          where reversal.workspace_id = e.workspace_id
            and reversal.kind = 'correction_reversal'
            and reversal.reverses_event_id = e.id
        )
      group by l.created_by
    ),
    acquisition_points as (
      select e.staff_user_id as sales_user_id,
        pg_catalog.count(*)::bigint as acquisition_point_count,
        coalesce(pg_catalog.sum(e.points), 0)::numeric(12,2)::text as acquisition_points
      from public.p7_earned_points e
      cross join requested_month m
      where e.workspace_id = $1
        and e.rule_version = 'p7-sales-acquisition-v1'
        and pg_catalog.date_trunc(
          'month', pg_catalog.timezone('Africa/Cairo', e.trigger_at)
        )::date = m.month_start
      group by e.staff_user_id
    ),
    refund_reversals as (
      select a.staff_user_id as sales_user_id,
        pg_catalog.count(*)::bigint as refund_reversal_count,
        coalesce(pg_catalog.sum(a.points), 0)::numeric(12,2)::text as refund_reversal_points
      from public.p7_adjustment_entries a
      cross join requested_month m
      where a.workspace_id = $1
        and a.reason_code = 'sales_acquisition_refund'
        and pg_catalog.date_trunc(
          'month', pg_catalog.timezone('Africa/Cairo', a.recorded_at)
        )::date = m.month_start
      group by a.staff_user_id
    ),
    sales AS (
      select link_counts.sales_user_id from link_counts
      union select registration_counts.sales_user_id from registration_counts
      union select approval_counts.sales_user_id from approval_counts
      union select first_payment_counts.sales_user_id from first_payment_counts
      union select acquisition_points.sales_user_id from acquisition_points
      union select refund_reversals.sales_user_id from refund_reversals
    )
    select m.month_start, s.sales_user_id,
      coalesce(l.link_count, 0)::bigint,
      coalesce(r.registration_count, 0)::bigint,
      coalesce(a.approval_count, 0)::bigint,
      coalesce(fp.first_payment_count, 0)::bigint,
      coalesce(ap.acquisition_point_count, 0)::bigint,
      coalesce(ap.acquisition_points, '0.00')::text,
      coalesce(rr.refund_reversal_count, 0)::bigint,
      coalesce(rr.refund_reversal_points, '0.00')::text
    from sales s
    cross join requested_month m
    left join link_counts l on l.sales_user_id = s.sales_user_id
    left join registration_counts r on r.sales_user_id = s.sales_user_id
    left join approval_counts a on a.sales_user_id = s.sales_user_id
    left join first_payment_counts fp on fp.sales_user_id = s.sales_user_id
    left join acquisition_points ap on ap.sales_user_id = s.sales_user_id
    left join refund_reversals rr on rr.sales_user_id = s.sales_user_id
    order by s.sales_user_id;
end
$$;
alter function public.get_sales_funnel(uuid, date) owner to postgres;
revoke all on function public.get_sales_funnel(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_sales_funnel(uuid, date) to authenticated;

comment on function public.get_sales_funnel(uuid, date) is
  'Returns non-PII Sales funnel milestones and unambiguous P7 event facts by Cairo event month; platform-owner only.';
