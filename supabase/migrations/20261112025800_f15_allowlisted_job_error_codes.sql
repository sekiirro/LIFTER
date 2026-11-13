-- Keep raw handler/provider diagnostics out of persisted jobs and dead-letter audit.
create or replace function public.jobs_fail(
  id uuid,
  lease uuid,
  error_code text,
  permanent boolean default false
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  new_status text;
  safe_error_code text;
begin
  if error_code is null or error_code !~ '^[a-z0-9_.:-]{1,64}$' then
    raise exception 'Invalid job error code' using errcode = '23514';
  end if;

  safe_error_code := case
    when error_code = any(array[
      'authorization_changed',
      'delivery_claim_unavailable',
      'delivery_state_unavailable',
      'exhausted',
      'handler_error',
      'invalid_message',
      'invalid_payload',
      'stale',
      'telegram_transport',
      'temporary_error',
      'try_again',
      'unknown_kind'
    ]::text[]) then error_code
    else 'handler_error'
  end;

  update public.jobs j
  set status = case when permanent or j.attempts >= j.max_attempts then 'dead' else 'pending' end,
      finished_at = case when permanent or j.attempts >= j.max_attempts then now() else null end,
      run_at = case when permanent or j.attempts >= j.max_attempts then j.run_at
        else now() + least(power(2::numeric, least(j.attempts - 1, 6)), 60) * interval '1 minute' end,
      last_error = safe_error_code, lease_token = null, lease_expires_at = null
  where j.id = $1 and j.lease_token = $2 and j.status = 'running'
  returning j.status into new_status;
  return new_status;
end;
$$;

alter function public.jobs_fail(uuid, uuid, text, boolean) owner to postgres;
revoke execute on function public.jobs_fail(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.jobs_fail(uuid, uuid, text, boolean) to service_role;
