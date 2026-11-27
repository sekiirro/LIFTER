-- P7 T019 backend projection: the target is caller-owned for staff and
-- platform-PO selectable. No KPI or penalty records are exposed here.
create function public.p7_get_own_compensation(
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
    s.amount_minor::text,
    (s.amount_minor::numeric / 100)::numeric(21, 2)::text,
    s.currency,
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
    and a.effective_month = p_effective_month;
end;
$$;
alter function public.p7_get_own_compensation(uuid, date) owner to postgres;
revoke all on function public.p7_get_own_compensation(uuid, date)
  from public, anon, service_role;
grant execute on function public.p7_get_own_compensation(uuid, date)
  to authenticated, anon;
