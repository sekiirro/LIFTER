-- S72-R10 B7/B9: keep approved compensation bound to the reviewed salary
-- currency, and expose one narrow PO-only payroll-month projection for UI
-- hydration without granting API roles direct access to payroll tables.

create or replace function public.p7_get_own_compensation(
  p_employee_id uuid,
  p_effective_month date
)
returns table (
  basic_salary_amount_minor text,
  basic_salary_amount text,
  currency text,
  approved boolean,
  approved_snapshot_total_minor text,
  approved_snapshot_total text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  caller_is_po boolean;
begin
  if caller_id is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  caller_is_po := coalesce(app_private.is_platform_owner(), false);
  if not caller_is_po then
    select p.role into caller_role
    from public.staff_profiles p
    where p.user_id = caller_id;

    if caller_role is null
      or caller_role not in ('trainer', 'sales')
      or p_employee_id is distinct from auth.uid() then
      raise exception 'not_permitted' using errcode = '42501';
    end if;
  end if;

  return query
  select
    coalesce(approved_salary.amount_minor, s.amount_minor)::text,
    (coalesce(approved_salary.amount_minor, s.amount_minor)::numeric / 100)::numeric(21, 2)::text,
    coalesce(approved_salary.currency, s.currency),
    a.id is not null,
    a.amount_minor::text,
    (a.amount_minor::numeric / 100)::numeric(21, 2)::text
  from (values (1)) as anchor(n)
  left join lateral (
    select r.amount_minor, r.currency
    from public.p7_salary_revisions r
    where r.employee_id = p_employee_id
      and r.effective_month = p_effective_month
    order by r.revision desc
    limit 1
  ) s on true
  left join public.p7_payroll_approvals a
    on a.employee_id = p_employee_id
    and a.effective_month = p_effective_month
  left join public.p7_payroll_snapshots approved_snapshot
    on approved_snapshot.id = a.snapshot_id
    and approved_snapshot.employee_id = p_employee_id
    and approved_snapshot.effective_month = p_effective_month
  left join public.p7_salary_revisions approved_salary
    on approved_salary.id = approved_snapshot.salary_revision_id;
end;
$$;
alter function public.p7_get_own_compensation(uuid, date) owner to postgres;
revoke all on function public.p7_get_own_compensation(uuid, date)
  from public, anon, service_role;
grant execute on function public.p7_get_own_compensation(uuid, date)
  to authenticated, anon;

create function public.p7_get_payroll_month(
  p_employee_id uuid,
  p_effective_month date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  salary_row public.p7_salary_revisions%rowtype;
  snapshot_row public.p7_payroll_snapshots%rowtype;
  approval_row public.p7_payroll_approvals%rowtype;
begin
  perform app_private.p7_require_platform_owner();
  if p_employee_id is null or p_effective_month is null
    or extract(day from p_effective_month) <> 1 then
    raise exception 'invalid_payroll_month' using errcode = '22023';
  end if;
  perform app_private.p7_require_payroll_employee(p_employee_id);
  perform app_private.p7_payroll_lock(p_employee_id, p_effective_month);

  select * into salary_row
  from public.p7_salary_revisions
  where employee_id = p_employee_id
    and effective_month = p_effective_month
  order by revision desc
  limit 1;

  select * into snapshot_row
  from public.p7_payroll_snapshots
  where employee_id = p_employee_id
    and effective_month = p_effective_month
  order by version desc
  limit 1;

  select * into approval_row
  from public.p7_payroll_approvals
  where employee_id = p_employee_id
    and effective_month = p_effective_month;

  return jsonb_build_object(
    'salary', case when salary_row.id is null then null else jsonb_build_object(
      'id', salary_row.id,
      'revision', salary_row.revision,
      'amount_minor', salary_row.amount_minor::text,
      'currency', salary_row.currency,
      'market', salary_row.market
    ) end,
    'inputs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'category', i.category,
        'amount_minor', i.amount_minor::text,
        'currency', i.currency
      ) order by i.created_at, i.id)
      from public.p7_monetary_payroll_inputs i
      where i.employee_id = p_employee_id
        and i.effective_month = p_effective_month
    ), '[]'::jsonb),
    'snapshot', case when snapshot_row.id is null then null else jsonb_build_object(
      'id', snapshot_row.id,
      'version', snapshot_row.version,
      'amount_minor', snapshot_row.amount_minor::text,
      'currency', snapshot_row.currency
    ) end,
    'approval', case when approval_row.id is null then null else jsonb_build_object(
      'id', approval_row.id,
      'snapshot_id', approval_row.snapshot_id,
      'snapshot_version', approval_row.snapshot_version,
      'amount_minor', approval_row.amount_minor::text,
      'currency', approval_row.currency
    ) end
  );
end;
$$;
alter function public.p7_get_payroll_month(uuid, date) owner to postgres;
revoke all on function public.p7_get_payroll_month(uuid, date)
  from public, anon, service_role;
grant execute on function public.p7_get_payroll_month(uuid, date)
  to authenticated;
