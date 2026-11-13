create function public.claim_f15_form_alert_jobs(p_batch integer default 25,p_lease_seconds integer default 300)
returns setof public.jobs language plpgsql security definer set search_path='' as $$
begin
  if p_batch is null or p_batch<1 or p_lease_seconds is null or p_lease_seconds<1 then
    raise exception 'Invalid claim parameters' using errcode='22023';
  end if;
  with exhausted as (
    select j.id from public.jobs j where j.kind='forms.alert' and j.status='running'
      and j.lease_expires_at<now() and j.attempts>=j.max_attempts for update skip locked
  )
  update public.jobs j set status='dead',last_error='lease_expired',finished_at=now(),
    lease_token=null,lease_expires_at=null from exhausted where j.id=exhausted.id;
  return query with picked as (
    select j.id from public.jobs j where j.kind='forms.alert' and
      ((j.status='pending' and j.run_at<=now()) or (j.status='running' and j.lease_expires_at<now()))
    order by j.run_at limit least(p_batch,100) for update skip locked
  ) update public.jobs j set status='running',attempts=j.attempts+1,
      lease_token=gen_random_uuid(),lease_expires_at=now()+p_lease_seconds*interval '1 second'
    from picked where j.id=picked.id returning j.*;
end $$;
alter function public.claim_f15_form_alert_jobs(integer,integer) owner to postgres;
revoke all on function public.claim_f15_form_alert_jobs(integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.claim_f15_form_alert_jobs(integer,integer) to service_role;
