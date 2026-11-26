-- T020: a PO-only, non-PII projection of authoritative F10 funnel milestones.
create function public.get_sales_funnel(workspace_id uuid, p_month date)
returns table (
  month date,
  sales_user_id uuid,
  link_count bigint,
  registration_count bigint,
  approval_count bigint
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
    sales AS (
      select link_counts.sales_user_id from link_counts
      union select registration_counts.sales_user_id from registration_counts
      union select approval_counts.sales_user_id from approval_counts
    )
    select m.month_start, s.sales_user_id,
      coalesce(l.link_count, 0)::bigint,
      coalesce(r.registration_count, 0)::bigint,
      coalesce(a.approval_count, 0)::bigint
    from sales s
    cross join requested_month m
    left join link_counts l on l.sales_user_id = s.sales_user_id
    left join registration_counts r on r.sales_user_id = s.sales_user_id
    left join approval_counts a on a.sales_user_id = s.sales_user_id
    order by s.sales_user_id;
end
$$;
alter function public.get_sales_funnel(uuid, date) owner to postgres;
revoke all on function public.get_sales_funnel(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_sales_funnel(uuid, date) to authenticated;

comment on function public.get_sales_funnel(uuid, date) is
  'Returns distinct, non-PII Sales funnel milestone counts by Cairo event month; platform-owner only.';
