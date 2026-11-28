-- #348: keep JSON aggregate order aligned with the source CTE ordering.
create or replace function public.p7_workforce_report(p_workspace_id uuid, p_month date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_actor uuid := auth.uid();
  snapshot_row record;
  is_closed boolean := false;
  month_status text := 'current';
  result_totals jsonb;
  result_trainers jsonb;
  result_sales jsonb;
  result_ledger jsonb;
begin
  -- Platform PO only, authorized workspace only.
  -- Deny without workspace existence disclosure.
  if current_actor is null
    or not coalesce(app_private.is_platform_owner(), false)
    or not coalesce(app_private.has_workspace_access(p_workspace_id, null), false)
    or not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;

  select s.id, s.snapshot_version, s.formula_version, s.source_watermark, s.totals, s.finalized_by, s.finalized_at
  into snapshot_row
  from public.p7_month_snapshots s
  where s.workspace_id = p_workspace_id and s.effective_month = p_month;

  if snapshot_row.id is not null then
    is_closed := true;
    month_status := 'closed';
  else
    is_closed := false;
    month_status := 'current';
  end if;

  with relevant_staff as (
    -- Active staff with trainer or sales role in workspace
    select m.user_id as staff_user_id, sp.role, sp.display_name
    from public.workspace_memberships m
    join public.staff_profiles sp on sp.user_id = m.user_id
    where m.workspace_id = p_workspace_id and m.revoked_at is null
      and sp.role in ('trainer', 'sales')
    union
    -- Staff with earned points in this workspace and month
    select e.staff_user_id, sp.role, sp.display_name
    from public.p7_earned_points e
    join public.staff_profiles sp on sp.user_id = e.staff_user_id
    where e.workspace_id = p_workspace_id and e.effective_month = p_month
    union
    -- Staff with adjustment entries in this workspace and month
    select a.staff_user_id, sp.role, sp.display_name
    from public.p7_adjustment_entries a
    join public.staff_profiles sp on sp.user_id = a.staff_user_id
    where a.workspace_id = p_workspace_id and a.effective_month = p_month
    union
    -- Trainers with effective monthly quality revisions in this workspace and month
    select q.trainer_id, sp.role, sp.display_name
    from public.p7_monthly_quality_effective q
    join public.staff_profiles sp on sp.user_id = q.trainer_id
    where q.workspace_id = p_workspace_id and q.month = to_char(p_month, 'YYYY-MM')
    union
    -- Staff present in snapshot totals if month is closed
    select t.key::uuid as staff_user_id, sp.role, sp.display_name
    from pg_catalog.jsonb_each_text(coalesce(snapshot_row.totals, '{}'::jsonb)) as t(key, value)
    join public.staff_profiles sp on sp.user_id = t.key::uuid
  ),
  entries as (
    select e.staff_user_id, e.points
    from public.p7_earned_points e
    where e.workspace_id = p_workspace_id and e.effective_month = p_month
    union all
    select a.staff_user_id, a.points
    from public.p7_adjustment_entries a
    where a.workspace_id = p_workspace_id and a.effective_month = p_month
    union all
    select q.trainer_id as staff_user_id, q.net_points::numeric(10,2) as points
    from public.p7_monthly_quality_effective q
    where q.workspace_id = p_workspace_id and q.month = to_char(p_month, 'YYYY-MM')
  ),
  computed_totals as (
    select staff_user_id, coalesce(sum(points), 0)::numeric(10,2) as net_points
    from entries
    group by staff_user_id
  ),
  staff_summary as (
    select
      s.staff_user_id,
      s.role::text as role,
      s.display_name,
      case
        when is_closed and snapshot_row.totals ? s.staff_user_id::text
        then (snapshot_row.totals->>s.staff_user_id::text)::numeric(10,2)
        else coalesce(c.net_points, 0.00)::numeric(10,2)
      end as points
    from relevant_staff s
    left join computed_totals c on c.staff_user_id = s.staff_user_id
    order by s.role, s.display_name nulls last, s.staff_user_id
  ),
  ledger_items as (
    select
      e.id,
      e.staff_user_id,
      sp.role::text as staff_role,
      sp.display_name as staff_name,
      'earned'::text as category,
      e.points::numeric(10,2)::text as points,
      e.effective_month::text as effective_month,
      e.original_month::text as original_month,
      null::text as actor,
      to_char(e.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as recorded_at,
      e.rule_version as reason_code,
      null::text as reason,
      null::uuid as actor_user_id,
      null::text as operation,
      null::uuid as original_entry_id,
      null::text as original_entry_kind
    from public.p7_earned_points e
    left join public.staff_profiles sp on sp.user_id = e.staff_user_id
    where e.workspace_id = p_workspace_id and e.effective_month = p_month

    union all

    select
      a.id,
      a.staff_user_id,
      sp.role::text as staff_role,
      sp.display_name as staff_name,
      case
        when a.reason_code = 'refund_reversal' then 'refundReversal'
        when a.reason_code = 'sales_acquisition_refund' then 'refundReversal'
        when a.reason_code = 'plan_delay' then 'planDelay'
        when a.reason_code = 'checkin_delay' then 'checkinDelay'
        else 'poAdjustment'
      end as category,
      a.points::numeric(10,2)::text as points,
      a.effective_month::text as effective_month,
      a.original_month::text as original_month,
      actor_sp.display_name as actor,
      to_char(a.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as recorded_at,
      a.reason_code as reason_code,
      a.reason as reason,
      a.actor_user_id,
      a.operation,
      a.original_entry_id,
      a.original_entry_kind
    from public.p7_adjustment_entries a
    left join public.staff_profiles sp on sp.user_id = a.staff_user_id
    left join public.staff_profiles actor_sp on actor_sp.user_id = a.actor_user_id
    where a.workspace_id = p_workspace_id and a.effective_month = p_month

    union all

    select
      q.id,
      q.trainer_id as staff_user_id,
      sp.role::text as staff_role,
      sp.display_name as staff_name,
      'transformationFeedback'::text as category,
      q.net_points::numeric(10,2)::text as points,
      (q.month || '-01')::date::text as effective_month,
      null::text as original_month,
      actor_sp.display_name as actor,
      to_char(q.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as recorded_at,
      q.category::text as reason_code,
      null::text as reason,
      q.created_by as actor_user_id,
      null::text as operation,
      null::uuid as original_entry_id,
      null::text as original_entry_kind
    from public.p7_monthly_quality_effective q
    left join public.staff_profiles sp on sp.user_id = q.trainer_id
    left join public.staff_profiles actor_sp on actor_sp.user_id = q.created_by
    where q.workspace_id = p_workspace_id and q.month = to_char(p_month, 'YYYY-MM')

    order by recorded_at desc, id desc
  ),
  aggregated_totals as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'staff_user_id', ss.staff_user_id,
            'role', ss.role,
            'display_name', ss.display_name,
            'points', ss.points::numeric(10,2)::text,
            'is_negative', ss.points < 0
          )
          order by ss.role, ss.display_name nulls last, ss.staff_user_id
        ), '[]'::jsonb
      ) as all_totals,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'staff_user_id', ss.staff_user_id,
            'role', ss.role,
            'display_name', ss.display_name,
            'points', ss.points::numeric(10,2)::text,
            'is_negative', ss.points < 0
          )
          order by ss.role, ss.display_name nulls last, ss.staff_user_id
        ) filter (where ss.role = 'trainer'), '[]'::jsonb
      ) as trainer_totals,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'staff_user_id', ss.staff_user_id,
            'role', ss.role,
            'display_name', ss.display_name,
            'points', ss.points::numeric(10,2)::text,
            'is_negative', ss.points < 0
          )
          order by ss.role, ss.display_name nulls last, ss.staff_user_id
        ) filter (where ss.role = 'sales'), '[]'::jsonb
      ) as sales_totals
    from staff_summary ss
  ),
  aggregated_ledger as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', li.id,
            'staff_user_id', li.staff_user_id,
            'staff_role', li.staff_role,
            'staff_name', li.staff_name,
            'category', li.category,
            'points', li.points,
            'effective_month', li.effective_month,
            'original_month', li.original_month,
            'actor', li.actor,
            'recorded_at', li.recorded_at,
            'reason_code', li.reason_code,
            'reason', li.reason,
            'actor_user_id', li.actor_user_id,
            'operation', li.operation,
            'original_entry_id', li.original_entry_id,
            'original_entry_kind', li.original_entry_kind
          )
          order by li.recorded_at desc, li.id desc
        ), '[]'::jsonb
      ) as ledger
    from ledger_items li
  )
  select
    a.all_totals,
    a.trainer_totals,
    a.sales_totals,
    l.ledger
  into
    result_totals,
    result_trainers,
    result_sales,
    result_ledger
  from aggregated_totals a
  cross join aggregated_ledger l;

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'month', p_month::text,
    'status', month_status,
    'is_closed', is_closed,
    'snapshot', case when is_closed then jsonb_build_object(
      'id', snapshot_row.id,
      'snapshot_version', snapshot_row.snapshot_version,
      'formula_version', snapshot_row.formula_version,
      'source_watermark', snapshot_row.source_watermark,
      'totals', snapshot_row.totals,
      'finalized_by', snapshot_row.finalized_by,
      'finalized_at', snapshot_row.finalized_at
    ) else null end,
    'totals', result_totals,
    'trainers', result_trainers,
    'sales', result_sales,
    'ledger', result_ledger
  );
end;
$$;

alter function public.p7_workforce_report(uuid,date) owner to postgres;
revoke all on function public.p7_workforce_report(uuid,date) from public, anon, service_role;
grant execute on function public.p7_workforce_report(uuid,date) to authenticated;
