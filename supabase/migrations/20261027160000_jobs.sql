-- SQL-only enqueue; API workers mutate jobs exclusively through leased RPCs.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind ~ '^[a-z_]+\.[a-z_]+$'),
  workspace_id uuid references public.workspaces(id),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 4096),
  idempotency_key text not null unique check (char_length(idempotency_key) between 1 and 200),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'dead')),
  run_at timestamptz not null default now(),
  attempts int not null default 0 check (attempts >= 0),
  max_attempts int not null default 5 check (max_attempts between 1 and 20),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text check (last_error ~ '^[a-z0-9_.:-]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.jobs owner to postgres;
create index jobs_pending_run_at_idx on public.jobs (status, run_at) where status = 'pending';
create index jobs_running_lease_idx on public.jobs (lease_expires_at) where status = 'running';
alter table public.jobs enable row level security;
alter table public.jobs force row level security;
revoke all on public.jobs from public, anon, authenticated, service_role;
grant select on public.jobs to service_role;

create function app_private.jobs_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
alter function app_private.jobs_updated_at() owner to postgres;
revoke execute on function app_private.jobs_updated_at() from public, anon, authenticated, service_role;
create trigger jobs_updated_at before update on public.jobs
  for each row execute function app_private.jobs_updated_at();

create function app_private.enqueue_job(
  kind text, workspace_id uuid, payload jsonb, idempotency_key text,
  run_at timestamptz default now(), max_attempts int default 5
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  job_id uuid;
begin
  insert into public.jobs (kind, workspace_id, payload, idempotency_key, run_at, max_attempts)
  values ($1, $2, $3, $4, $5, $6)
  on conflict on constraint jobs_idempotency_key_key do nothing returning id into job_id;
  if job_id is null then
    -- Separate statement gets a fresh READ COMMITTED snapshot after a concurrent insert.
    select j.id into job_id from public.jobs j where j.idempotency_key = $4;
  end if;
  return job_id;
end;
$$;
alter function app_private.enqueue_job(text, uuid, jsonb, text, timestamptz, int) owner to postgres;
revoke execute on function app_private.enqueue_job(text, uuid, jsonb, text, timestamptz, int)
  from public, anon, authenticated, service_role;

create function public.jobs_claim(batch int default 25, lease_seconds int default 300)
returns setof public.jobs
language plpgsql security definer set search_path = '' as $$
begin
  if batch is null or batch < 1 or lease_seconds is null or lease_seconds < 1 then
    raise exception 'Invalid claim parameters' using errcode = '22023';
  end if;
  -- Crashes consume attempts too. Retire exhausted leases before claiming work;
  -- the ordinary UPDATE audit trigger emits the dead-letter event atomically.
  with exhausted as (
    select j.id from public.jobs j
    where j.status = 'running' and j.lease_expires_at < now()
      and j.attempts >= j.max_attempts
    for update skip locked
  )
  update public.jobs j
  set status = 'dead', last_error = 'lease_expired', finished_at = now(),
      lease_token = null, lease_expires_at = null
  from exhausted where j.id = exhausted.id;

  return query
  with picked as (
    select j.id from public.jobs j
    where (j.status = 'pending' and j.run_at <= now())
       or (j.status = 'running' and j.lease_expires_at < now())
    order by j.run_at
    limit least(batch, 100)
    for update skip locked
  )
  update public.jobs j
  set status = 'running', attempts = j.attempts + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + lease_seconds * interval '1 second'
  from picked where j.id = picked.id
  returning j.*;
end;
$$;

create function public.jobs_complete(id uuid, lease uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs j set status = 'done', finished_at = now(),
    lease_token = null, lease_expires_at = null
  where j.id = $1 and j.lease_token = $2 and j.status = 'running';
  return found;
end;
$$;

create function public.jobs_fail(id uuid, lease uuid, error_code text, permanent boolean default false)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  new_status text;
begin
  if error_code is null or error_code !~ '^[a-z0-9_.:-]{1,64}$' then
    raise exception 'Invalid job error code' using errcode = '23514';
  end if;
  update public.jobs j
  set status = case when permanent or j.attempts >= j.max_attempts then 'dead' else 'pending' end,
      finished_at = case when permanent or j.attempts >= j.max_attempts then now() else null end,
      run_at = case when permanent or j.attempts >= j.max_attempts then j.run_at
        else now() + least(power(2::numeric, least(j.attempts - 1, 6)), 60) * interval '1 minute' end,
      last_error = error_code, lease_token = null, lease_expires_at = null
  where j.id = $1 and j.lease_token = $2 and j.status = 'running'
  returning j.status into new_status;
  return new_status;
end;
$$;

alter function public.jobs_claim(int, int) owner to postgres;
alter function public.jobs_complete(uuid, uuid) owner to postgres;
alter function public.jobs_fail(uuid, uuid, text, boolean) owner to postgres;
revoke execute on function public.jobs_claim(int, int) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_complete(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.jobs_fail(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.jobs_claim(int, int) to service_role;
grant execute on function public.jobs_complete(uuid, uuid) to service_role;
grant execute on function public.jobs_fail(uuid, uuid, text, boolean) to service_role;
