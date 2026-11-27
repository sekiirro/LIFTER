-- P7 T025: Sales monthly projection security definer RPC
-- Returning ONLY the calling Sales employee's own finalized monthly total from public.p7_month_snapshots.
-- Pre-finalization / open month returns status 'not_available' with no value or hint of activity.
-- Another staff id, WO, Trainer, anon get not_permitted (42501) with no existence disclosure.

create function public.p7_get_sales_monthly_total(
  p_workspace_id uuid,
  p_month date,
  p_staff_user_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  role public.staff_role;
  v_month date;
  v_cairo_current_month date;
  snapshot_totals jsonb;
  v_total text;
begin
  -- 1. Authentication and role check
  role := app_private.current_staff_role();
  if actor is null or role is null or role is distinct from 'sales'::public.staff_role
    or not app_private.has_workspace_access(p_workspace_id, null) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  -- 2. Own-id guard: calling Sales employee may only request their own total
  if p_staff_user_id is not null and p_staff_user_id is distinct from actor then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if p_workspace_id is null or p_month is null then
    return pg_catalog.jsonb_build_object('status', 'not_available');
  end if;

  v_month := pg_catalog.date_trunc('month', p_month)::date;

  -- 3. Cairo month-end guard: only after Cairo month-end
  v_cairo_current_month := app_private.p7_month_for_trigger(clock_timestamp());
  if v_month >= v_cairo_current_month then
    return pg_catalog.jsonb_build_object('status', 'not_available');
  end if;

  -- 4. PO finalization guard: snapshot must exist
  select totals into snapshot_totals
  from public.p7_month_snapshots
  where workspace_id = p_workspace_id and effective_month = v_month;

  if not found or snapshot_totals is null then
    return pg_catalog.jsonb_build_object('status', 'not_available');
  end if;

  -- 5. Extract own total from totals jsonb (keyed by staff user id)
  v_total := snapshot_totals->>actor::text;

  if v_total is null then
    return pg_catalog.jsonb_build_object(
      'status', 'empty',
      'month', pg_catalog.to_char(v_month, 'YYYY-MM-DD'),
      'total', null
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'finalized',
    'month', pg_catalog.to_char(v_month, 'YYYY-MM-DD'),
    'total', v_total
  );
end
$$;

create function public.get_sales_monthly_total(
  p_workspace_id uuid,
  p_month date,
  p_staff_user_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.p7_get_sales_monthly_total(p_workspace_id, p_month, p_staff_user_id);
end
$$;

alter function public.p7_get_sales_monthly_total(uuid, date, uuid) owner to postgres;
alter function public.get_sales_monthly_total(uuid, date, uuid) owner to postgres;

revoke all on function public.p7_get_sales_monthly_total(uuid, date, uuid) from public, anon, service_role;
revoke all on function public.get_sales_monthly_total(uuid, date, uuid) from public, anon, service_role;

grant execute on function public.p7_get_sales_monthly_total(uuid, date, uuid) to authenticated;
grant execute on function public.get_sales_monthly_total(uuid, date, uuid) to authenticated;

comment on function public.p7_get_sales_monthly_total(uuid, date, uuid) is
  'Returns only the calling Sales employee own finalized monthly total after month-end and finalization.';
