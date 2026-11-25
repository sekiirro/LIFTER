-- P7 T017, T026, T027: person-level salary, manual payroll inputs,
-- immutable reviewed snapshots, and one external-paid approval per month.

create table public.p7_salary_revisions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  effective_month date not null check (extract(day from effective_month) = 1),
  revision integer not null check (revision > 0),
  amount_minor bigint not null check (amount_minor > 0),
  market text not null check (market in ('Egypt', 'International')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  actor_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  idempotency_key uuid not null unique,
  request_hash bytea not null,
  created_at timestamptz not null default now(),
  unique (employee_id, effective_month, revision),
  check ((market = 'Egypt' and currency = 'EGP')
    or (market = 'International' and currency in ('EGP', 'USD', 'SAR')))
);

create table public.p7_monetary_payroll_inputs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  effective_month date not null check (extract(day from effective_month) = 1),
  category text not null check (category in ('incentive', 'deduction', 'correction')),
  amount_minor bigint not null check (
    amount_minor <> 0 and (category = 'correction' or amount_minor > 0)
  ),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reason_ref uuid not null,
  supersedes_input_id uuid references public.p7_monetary_payroll_inputs(id) on delete restrict,
  actor_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  idempotency_key uuid not null unique,
  request_hash bytea not null,
  created_at timestamptz not null default now(),
  check ((category = 'correction' and supersedes_input_id is not null)
    or (category <> 'correction' and supersedes_input_id is null))
);

create table public.p7_payroll_snapshots (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  effective_month date not null check (extract(day from effective_month) = 1),
  version integer not null check (version > 0),
  salary_revision_id uuid not null references public.p7_salary_revisions(id) on delete restrict,
  amount_minor bigint not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  inputs_watermark bytea not null,
  lineage jsonb not null,
  actor_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  idempotency_key uuid not null unique,
  request_hash bytea not null,
  created_at timestamptz not null default now(),
  unique (employee_id, effective_month, version)
);

create table public.p7_payroll_approvals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  effective_month date not null check (extract(day from effective_month) = 1),
  snapshot_id uuid not null references public.p7_payroll_snapshots(id) on delete restrict,
  snapshot_version integer not null check (snapshot_version > 0),
  amount_minor bigint not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  actor_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  idempotency_key uuid not null unique,
  request_hash bytea not null,
  approved_at timestamptz not null default now(),
  unique (employee_id, effective_month)
);

alter table public.p7_salary_revisions enable row level security;
alter table public.p7_salary_revisions force row level security;
alter table public.p7_monetary_payroll_inputs enable row level security;
alter table public.p7_monetary_payroll_inputs force row level security;
alter table public.p7_payroll_snapshots enable row level security;
alter table public.p7_payroll_snapshots force row level security;
alter table public.p7_payroll_approvals enable row level security;
alter table public.p7_payroll_approvals force row level security;

revoke all on public.p7_salary_revisions, public.p7_monetary_payroll_inputs,
  public.p7_payroll_snapshots, public.p7_payroll_approvals
  from public, anon, authenticated, service_role;

create function app_private.p7_reject_immutable_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'immutable_p7_record' using errcode = '23514';
end;
$$;
revoke all on function app_private.p7_reject_immutable_write() from public, anon, authenticated, service_role;

create trigger p7_salary_revisions_immutable
  before update or delete on public.p7_salary_revisions
  for each row execute function app_private.p7_reject_immutable_write();
create trigger p7_salary_revisions_no_truncate
  before truncate on public.p7_salary_revisions
  for each statement execute function app_private.p7_reject_immutable_write();
create trigger p7_monetary_payroll_inputs_immutable
  before update or delete on public.p7_monetary_payroll_inputs
  for each row execute function app_private.p7_reject_immutable_write();
create trigger p7_monetary_payroll_inputs_no_truncate
  before truncate on public.p7_monetary_payroll_inputs
  for each statement execute function app_private.p7_reject_immutable_write();
create trigger p7_payroll_snapshots_immutable
  before update or delete on public.p7_payroll_snapshots
  for each row execute function app_private.p7_reject_immutable_write();
create trigger p7_payroll_snapshots_no_truncate
  before truncate on public.p7_payroll_snapshots
  for each statement execute function app_private.p7_reject_immutable_write();
create trigger p7_payroll_approvals_immutable
  before update or delete on public.p7_payroll_approvals
  for each row execute function app_private.p7_reject_immutable_write();
create trigger p7_payroll_approvals_no_truncate
  before truncate on public.p7_payroll_approvals
  for each statement execute function app_private.p7_reject_immutable_write();

create function app_private.p7_require_platform_owner() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(app_private.is_platform_owner(), false) then
    raise exception 'p7_platform_owner_required' using errcode = '42501';
  end if;
end;
$$;
alter function app_private.p7_require_platform_owner() owner to postgres;
revoke all on function app_private.p7_require_platform_owner() from public, anon, authenticated, service_role;

create function app_private.p7_payroll_lock(p_employee_id uuid, p_month date) returns void
language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('p7-payroll:' || p_employee_id::text || ':' || p_month::text, 0)
  );
end;
$$;
revoke all on function app_private.p7_payroll_lock(uuid, date) from public, anon, authenticated, service_role;

create function app_private.p7_require_payroll_employee(p_employee_id uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.staff_profiles p
    where p.user_id = p_employee_id and p.role in ('trainer', 'sales')) then
    raise exception 'payroll_employee_not_eligible' using errcode = '23514';
  end if;
end;
$$;
revoke all on function app_private.p7_require_payroll_employee(uuid) from public, anon, authenticated, service_role;

create function app_private.p7_payroll_lineage(p_employee_id uuid, p_month date)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'salary_revision_id', s.id,
    'salary_revision', s.revision,
    'salary_amount_minor', s.amount_minor::text,
    'salary_currency', s.currency,
    'inputs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'category', i.category, 'amount_minor', i.amount_minor::text,
        'currency', i.currency, 'reason_ref', i.reason_ref,
        'supersedes_input_id', i.supersedes_input_id
      ) order by i.id)
      from public.p7_monetary_payroll_inputs i
      where i.employee_id = p_employee_id and i.effective_month = p_month
    ), '[]'::jsonb)
  )
  from public.p7_salary_revisions s
  where s.employee_id = p_employee_id and s.effective_month = p_month
  order by s.revision desc limit 1;
$$;
revoke all on function app_private.p7_payroll_lineage(uuid, date) from public, anon, authenticated, service_role;

create function public.p7_set_basic_salary(
  p_employee_id uuid,
  p_effective_month date,
  p_market text,
  p_amount_minor bigint,
  p_currency text,
  p_expected_revision integer,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  payload jsonb;
  request_hash bytea;
  prior public.p7_salary_revisions%rowtype;
  next_revision integer;
  new_id uuid;
begin
  perform app_private.p7_require_platform_owner();
  if p_employee_id is null or p_effective_month is null or extract(day from p_effective_month) <> 1
    or p_amount_minor is null or p_amount_minor <= 0 or p_expected_revision is null
    or p_expected_revision < 0 or p_idempotency_key is null
    or p_market is null or p_market not in ('Egypt', 'International')
    or p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_salary_input' using errcode = '22023';
  end if;
  if not ((p_market = 'Egypt' and p_currency = 'EGP')
    or (p_market = 'International' and p_currency in ('EGP', 'USD', 'SAR'))) then
    raise exception 'invalid_market_currency' using errcode = '23514';
  end if;
  if not exists (select 1 from public.staff_profiles p
    where p.user_id = p_employee_id and p.role in ('trainer', 'sales')) then
    raise exception 'payroll_employee_not_eligible' using errcode = '23514';
  end if;
  payload := jsonb_build_array(1, p_employee_id, p_effective_month, p_market,
    p_amount_minor::text, p_currency, p_expected_revision);
  request_hash := extensions.digest(convert_to(payload::text, 'UTF8'), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('p7-payroll-key:' || p_idempotency_key::text, 0));
  perform app_private.p7_require_platform_owner();
  select * into prior from public.p7_salary_revisions where idempotency_key = p_idempotency_key;
  if found then
    if prior.request_hash is distinct from request_hash then
      raise exception 'idempotency_key_reused' using errcode = '23514';
    end if;
    return jsonb_build_object('id', prior.id, 'revision', prior.revision,
      'amount_minor', prior.amount_minor::text, 'currency', prior.currency);
  end if;
  perform app_private.p7_payroll_lock(p_employee_id, p_effective_month);
  perform app_private.p7_require_platform_owner();
  perform app_private.p7_require_payroll_employee(p_employee_id);
  select coalesce(max(revision), 0) + 1 into next_revision from public.p7_salary_revisions
    where employee_id = p_employee_id and effective_month = p_effective_month;
  if p_expected_revision <> next_revision - 1 then
    raise exception 'stale_salary_revision' using errcode = '40001';
  end if;
  insert into public.p7_salary_revisions(employee_id, effective_month, revision, amount_minor,
    market, currency, actor_id, idempotency_key, request_hash)
  values (p_employee_id, p_effective_month, next_revision, p_amount_minor,
    p_market, p_currency, actor, p_idempotency_key, request_hash)
  returning id into new_id;
  return jsonb_build_object('id', new_id, 'revision', next_revision,
    'amount_minor', p_amount_minor::text, 'currency', p_currency);
end;
$$;
alter function public.p7_set_basic_salary(uuid, date, text, bigint, text, integer, uuid) owner to postgres;
revoke all on function public.p7_set_basic_salary(uuid, date, text, bigint, text, integer, uuid) from public, anon, service_role;
grant execute on function public.p7_set_basic_salary(uuid, date, text, bigint, text, integer, uuid) to authenticated;

create function public.p7_post_monetary_payroll_input(
  p_employee_id uuid,
  p_effective_month date,
  p_category text,
  p_amount_minor bigint,
  p_currency text,
  p_reason_ref uuid,
  p_supersedes_input_id uuid,
  p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  payload jsonb;
  request_hash bytea;
  prior public.p7_monetary_payroll_inputs%rowtype;
  salary public.p7_salary_revisions%rowtype;
  original public.p7_monetary_payroll_inputs%rowtype;
  new_id uuid;
begin
  perform app_private.p7_require_platform_owner();
  if p_employee_id is null or p_effective_month is null or extract(day from p_effective_month) <> 1
    or p_category is null or p_category not in ('incentive', 'deduction', 'correction')
    or p_amount_minor is null or p_amount_minor = 0
    or (p_category in ('incentive', 'deduction') and p_amount_minor < 0)
    or p_currency is null or p_currency !~ '^[A-Z]{3}$' or p_reason_ref is null
    or p_idempotency_key is null
    or (p_category = 'correction' and p_supersedes_input_id is null)
    or (p_category <> 'correction' and p_supersedes_input_id is not null) then
    raise exception 'invalid_payroll_input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.staff_profiles p
    where p.user_id = p_employee_id and p.role in ('trainer', 'sales')) then
    raise exception 'payroll_employee_not_eligible' using errcode = '23514';
  end if;
  payload := jsonb_build_array(1, p_employee_id, p_effective_month, p_category,
    p_amount_minor::text, p_currency, p_reason_ref, p_supersedes_input_id);
  request_hash := extensions.digest(convert_to(payload::text, 'UTF8'), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('p7-payroll-key:' || p_idempotency_key::text, 0));
  perform app_private.p7_require_platform_owner();
  select * into prior from public.p7_monetary_payroll_inputs where idempotency_key = p_idempotency_key;
  if found then
    if prior.request_hash is distinct from request_hash then
      raise exception 'idempotency_key_reused' using errcode = '23514';
    end if;
    return prior.id;
  end if;
  perform app_private.p7_payroll_lock(p_employee_id, p_effective_month);
  perform app_private.p7_require_platform_owner();
  perform app_private.p7_require_payroll_employee(p_employee_id);
  select * into salary from public.p7_salary_revisions
    where employee_id = p_employee_id and effective_month = p_effective_month
    order by revision desc limit 1 for share;
  if not found then raise exception 'salary_required' using errcode = '23514'; end if;
  if p_currency <> salary.currency then
    raise exception 'salary_currency_mismatch' using errcode = '23514';
  end if;
  if p_category = 'correction' then
    select * into original from public.p7_monetary_payroll_inputs where id = p_supersedes_input_id;
    if not found or original.employee_id <> p_employee_id or original.effective_month <> p_effective_month
      or original.currency <> p_currency then
      raise exception 'invalid_payroll_input_lineage' using errcode = '23514';
    end if;
  end if;
  insert into public.p7_monetary_payroll_inputs(employee_id, effective_month, category,
    amount_minor, currency, reason_ref, supersedes_input_id, actor_id, idempotency_key, request_hash)
  values (p_employee_id, p_effective_month, p_category, p_amount_minor, p_currency,
    p_reason_ref, p_supersedes_input_id, actor, p_idempotency_key, request_hash)
  returning id into new_id;
  return new_id;
end;
$$;
alter function public.p7_post_monetary_payroll_input(uuid, date, text, bigint, text, uuid, uuid, uuid) owner to postgres;
revoke all on function public.p7_post_monetary_payroll_input(uuid, date, text, bigint, text, uuid, uuid, uuid) from public, anon, service_role;
grant execute on function public.p7_post_monetary_payroll_input(uuid, date, text, bigint, text, uuid, uuid, uuid) to authenticated;

create function public.p7_create_payroll_snapshot(
  p_employee_id uuid,
  p_effective_month date,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  payload jsonb;
  request_hash bytea;
  prior public.p7_payroll_snapshots%rowtype;
  salary public.p7_salary_revisions%rowtype;
  lineage_row jsonb;
  watermark bytea;
  new_version integer;
  total_minor numeric;
  new_id uuid;
begin
  perform app_private.p7_require_platform_owner();
  if p_employee_id is null or p_effective_month is null or extract(day from p_effective_month) <> 1
    or p_idempotency_key is null then
    raise exception 'invalid_payroll_snapshot' using errcode = '22023';
  end if;
  if not exists (select 1 from public.staff_profiles p
    where p.user_id = p_employee_id and p.role in ('trainer', 'sales')) then
    raise exception 'payroll_employee_not_eligible' using errcode = '23514';
  end if;
  payload := jsonb_build_array(1, p_employee_id, p_effective_month);
  request_hash := extensions.digest(convert_to(payload::text, 'UTF8'), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('p7-payroll-key:' || p_idempotency_key::text, 0));
  perform app_private.p7_require_platform_owner();
  select * into prior from public.p7_payroll_snapshots where idempotency_key = p_idempotency_key;
  if found then
    if prior.request_hash is distinct from request_hash then
      raise exception 'idempotency_key_reused' using errcode = '23514';
    end if;
    return jsonb_build_object('id', prior.id, 'version', prior.version,
      'amount_minor', prior.amount_minor::text, 'currency', prior.currency);
  end if;
  perform app_private.p7_payroll_lock(p_employee_id, p_effective_month);
  perform app_private.p7_require_platform_owner();
  perform app_private.p7_require_payroll_employee(p_employee_id);
  select * into salary from public.p7_salary_revisions
    where employee_id = p_employee_id and effective_month = p_effective_month
    order by revision desc limit 1 for share;
  if not found then raise exception 'salary_required' using errcode = '23514'; end if;
  if exists (select 1 from public.p7_monetary_payroll_inputs i
    where i.employee_id = p_employee_id and i.effective_month = p_effective_month
      and i.currency <> salary.currency) then
    raise exception 'payroll_currency_mismatch' using errcode = '23514';
  end if;
  lineage_row := app_private.p7_payroll_lineage(p_employee_id, p_effective_month);
  watermark := extensions.digest(convert_to(lineage_row::text, 'UTF8'), 'sha256');
  select (salary.amount_minor::numeric + coalesce(sum(case i.category
    when 'incentive' then i.amount_minor::numeric
    when 'deduction' then -i.amount_minor::numeric
    else i.amount_minor::numeric end), 0))
  into total_minor from public.p7_monetary_payroll_inputs i
  where i.employee_id = p_employee_id and i.effective_month = p_effective_month;
  if total_minor < -9223372036854775808::numeric or total_minor > 9223372036854775807::numeric then
    raise exception 'payroll_amount_out_of_range' using errcode = '22003';
  end if;
  select coalesce(max(version), 0) + 1 into new_version from public.p7_payroll_snapshots
    where employee_id = p_employee_id and effective_month = p_effective_month;
  insert into public.p7_payroll_snapshots(employee_id, effective_month, version, salary_revision_id,
    amount_minor, currency, inputs_watermark, lineage, actor_id, idempotency_key, request_hash)
  values (p_employee_id, p_effective_month, new_version, salary.id, total_minor::bigint,
    salary.currency, watermark, lineage_row, actor, p_idempotency_key, request_hash)
  returning id into new_id;
  return jsonb_build_object('id', new_id, 'version', new_version,
    'amount_minor', total_minor::bigint::text, 'currency', salary.currency);
end;
$$;
alter function public.p7_create_payroll_snapshot(uuid, date, uuid) owner to postgres;
revoke all on function public.p7_create_payroll_snapshot(uuid, date, uuid) from public, anon, service_role;
grant execute on function public.p7_create_payroll_snapshot(uuid, date, uuid) to authenticated;

create function public.p7_approve_external_payroll(
  p_employee_id uuid,
  p_effective_month date,
  p_snapshot_id uuid,
  p_snapshot_version integer,
  p_amount_minor bigint,
  p_currency text,
  p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  payload jsonb;
  request_hash bytea;
  prior public.p7_payroll_approvals%rowtype;
  reviewed public.p7_payroll_snapshots%rowtype;
  salary public.p7_salary_revisions%rowtype;
  current_lineage jsonb;
  current_watermark bytea;
  latest_version integer;
  existing_id uuid;
  new_id uuid;
begin
  perform app_private.p7_require_platform_owner();
  if p_employee_id is null or p_effective_month is null or extract(day from p_effective_month) <> 1
    or p_snapshot_id is null or p_snapshot_version is null or p_snapshot_version < 1
    or p_amount_minor is null or p_currency is null or p_currency !~ '^[A-Z]{3}$'
    or p_idempotency_key is null then
    raise exception 'invalid_payroll_approval' using errcode = '22023';
  end if;
  if not exists (select 1 from public.staff_profiles p
    where p.user_id = p_employee_id and p.role in ('trainer', 'sales')) then
    raise exception 'payroll_employee_not_eligible' using errcode = '23514';
  end if;
  payload := jsonb_build_array(1, p_employee_id, p_effective_month, p_snapshot_id,
    p_snapshot_version, p_amount_minor::text, p_currency);
  request_hash := extensions.digest(convert_to(payload::text, 'UTF8'), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('p7-payroll-key:' || p_idempotency_key::text, 0));
  perform app_private.p7_require_platform_owner();
  select * into prior from public.p7_payroll_approvals where idempotency_key = p_idempotency_key;
  if found then
    if prior.request_hash is distinct from request_hash then
      raise exception 'idempotency_key_reused' using errcode = '23514';
    end if;
    return prior.id;
  end if;
  perform app_private.p7_payroll_lock(p_employee_id, p_effective_month);
  perform app_private.p7_require_platform_owner();
  perform app_private.p7_require_payroll_employee(p_employee_id);
  select * into reviewed from public.p7_payroll_snapshots
    where id = p_snapshot_id and employee_id = p_employee_id and effective_month = p_effective_month;
  if not found or reviewed.version <> p_snapshot_version
    or reviewed.amount_minor <> p_amount_minor or reviewed.currency <> p_currency then
    raise exception 'snapshot_binding_mismatch' using errcode = '23514';
  end if;
  select coalesce(max(version), 0) into latest_version from public.p7_payroll_snapshots
    where employee_id = p_employee_id and effective_month = p_effective_month;
  if latest_version <> p_snapshot_version then
    raise exception 'stale_payroll_snapshot' using errcode = '40001';
  end if;
  select * into salary from public.p7_salary_revisions
    where employee_id = p_employee_id and effective_month = p_effective_month
    order by revision desc limit 1 for share;
  if not found then raise exception 'salary_required' using errcode = '23514'; end if;
  if exists (select 1 from public.p7_monetary_payroll_inputs i
    where i.employee_id = p_employee_id and i.effective_month = p_effective_month
      and i.currency <> salary.currency) then
    raise exception 'payroll_currency_mismatch' using errcode = '23514';
  end if;
  current_lineage := app_private.p7_payroll_lineage(p_employee_id, p_effective_month);
  current_watermark := extensions.digest(convert_to(current_lineage::text, 'UTF8'), 'sha256');
  if current_watermark is distinct from reviewed.inputs_watermark then
    raise exception 'stale_payroll_snapshot' using errcode = '40001';
  end if;
  select id into existing_id from public.p7_payroll_approvals
    where employee_id = p_employee_id and effective_month = p_effective_month;
  if found then raise exception 'payroll_already_approved' using errcode = '23505'; end if;
  insert into public.p7_payroll_approvals(employee_id, effective_month, snapshot_id,
    snapshot_version, amount_minor, currency, actor_id, idempotency_key, request_hash)
  values (p_employee_id, p_effective_month, reviewed.id, reviewed.version,
    reviewed.amount_minor, reviewed.currency, actor, p_idempotency_key, request_hash)
  returning id into new_id;
  return new_id;
end;
$$;
alter function public.p7_approve_external_payroll(uuid, date, uuid, integer, bigint, text, uuid) owner to postgres;
revoke all on function public.p7_approve_external_payroll(uuid, date, uuid, integer, bigint, text, uuid) from public, anon, service_role;
grant execute on function public.p7_approve_external_payroll(uuid, date, uuid, integer, bigint, text, uuid) to authenticated;
