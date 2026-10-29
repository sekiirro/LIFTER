-- U5-R2, PO decision 2026-10-28. Latest complete admission body: 20261031123600.
-- One private owner for both timing constants. No caller-controlled clock.
create function app_private.signup_attestation_timing()
returns table(max_age interval,future_skew interval)
language sql immutable security definer set search_path='' as $$
  select interval '60 seconds',interval '5 seconds'
$$;
alter function app_private.signup_attestation_timing() owner to postgres;
revoke all on function app_private.signup_attestation_timing() from public,anon,authenticated,service_role;

-- IPv6 grouping is server-side before HMAC: zero the host 64 bits, serialize
-- as ASCII RFC 5952 network address text without /64. IPv4 (including mapped)
-- stays dotted-quad per full address. DB receives only derived, attested bytes.
-- issued_at + max_age covers the entire acceptance window: up to 65 seconds
-- from first acceptance of a future-issued proof. Strict nonce cleanup (<)
-- preserves replay rejection at the inclusive final instant.
create or replace function public.client_signup_admit(token text,request_secret text,ip_key bytea,link_key bytea,issued_at timestamptz,nonce uuid,attestation bytea)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  rate_secret text; attest_secret text; sampled_at timestamptz;
  token_digest text; derived_link bytea; nonce_inserted uuid;
  limits jsonb; link_window interval; ip_window interval; timing record;
  link_start timestamptz; ip_start timestamptz; link_count bigint; ip_count bigint;
  resolved public.registration_links%rowtype;
  ticket uuid; attempt_id uuid; accepted boolean; details jsonb;
begin
  -- No write, including attempt/audit/nonces, is allowed before C1.
  if not app_private.signup_auth_schema_compatible() then
    raise log '%',jsonb_build_object('code','AUTH_COMPAT_GUARD_FAILED','timestamp',clock_timestamp());
    return '{"status":"unavailable"}'::jsonb;
  end if;
  select decrypted_secret into rate_secret from vault.decrypted_secrets where name='SIGNUP_RATE_KEY';
  select decrypted_secret into attest_secret from vault.decrypted_secrets where name='SIGNUP_ATTEST_KEY';
  if rate_secret is null or attest_secret is null or rate_secret !~ '^[0-9a-f]{64}$' or attest_secret !~ '^[0-9a-f]{64}$' then
    return '{"status":"unavailable"}'::jsonb;
  end if;
  sampled_at:=clock_timestamp();
  select * into strict timing from app_private.signup_attestation_timing();
  if auth.uid() is not null or not app_private.signup_attestation_matches(ip_key,link_key,issued_at,nonce,attestation,decode(attest_secret,'hex'))
    or issued_at>sampled_at+timing.future_skew or sampled_at-issued_at>timing.max_age then return '{"status":"invalid"}'::jsonb; end if;
  insert into app_private.signup_admission_nonces(nonce,expires_at) values(nonce,issued_at+timing.max_age)
    on conflict do nothing returning signup_admission_nonces.nonce into nonce_inserted;
  if nonce_inserted is null then return '{"status":"invalid"}'::jsonb; end if;
  token_digest:=encode(extensions.digest(coalesce(token,''),'sha256'),'hex');
  derived_link:=extensions.hmac(convert_to('lifter.f11.link.v1','UTF8')||decode('00','hex')
    ||int4send(octet_length(token_digest))||convert_to(token_digest,'UTF8'),decode(rate_secret,'hex'),'sha256');
  if not app_private.signup_constant_time_equal(derived_link,link_key) then return '{"status":"invalid"}'::jsonb; end if;

  -- Expired security state never participates in a fresh window. Nonce expiry
  -- is strict (<), so a proof exactly 60 seconds old cannot be replayed.
  delete from app_private.signup_rate_counters where expires_at<=sampled_at;
  delete from app_private.signup_admission_nonces where expires_at<sampled_at;
  perform pg_advisory_xact_lock(hashtextextended('f11.admit.link:'||encode(derived_link,'hex'),0));
  perform pg_advisory_xact_lock(hashtextextended('f11.admit.ip:'||encode(ip_key,'hex'),0));
  sampled_at:=clock_timestamp();
  limits:=app_private.client_signup_limits();
  if limits is null or (limits->>'link_limit')::int<=0 or (limits->>'ip_limit')::int<=0
    or (limits->>'link_window_seconds')::int<=0 or (limits->>'ip_window_seconds')::int<=0
    or limits->>'fixed_windows' is distinct from 'true' or limits->>'every_admission_counts' is distinct from 'true' then
    raise exception 'signup_unavailable' using errcode='55000';
  end if;
  link_window:=make_interval(secs=>(limits->>'link_window_seconds')::int);
  ip_window:=make_interval(secs=>(limits->>'ip_window_seconds')::int);
  link_start:=date_bin(link_window,sampled_at,'1970-01-01 00:00:00+00'::timestamptz);
  ip_start:=date_bin(ip_window,sampled_at,'1970-01-01 00:00:00+00'::timestamptz);
  -- Both counters increment before either limit is checked, including denials.
  insert into app_private.signup_rate_counters as c(scope,key,window_start,count,expires_at)
    values('link',derived_link,link_start,1,link_start+link_window)
    on conflict(scope,key,window_start) do update set count=c.count+1 returning count into link_count;
  insert into app_private.signup_rate_counters as c(scope,key,window_start,count,expires_at)
    values('ip',ip_key,ip_start,1,ip_start+ip_window)
    on conflict(scope,key,window_start) do update set count=c.count+1 returning count into ip_count;
  select * into resolved from public.registration_links where token_hash=token_digest;
  accepted:=token is not null and token ~ '^[A-Za-z0-9_-]{43}$' and request_secret is not null and request_secret ~ '^[A-Za-z0-9_-]{43,}$'
    and resolved.id is not null and resolved.consumed_at is null and sampled_at<resolved.expires_at
    and link_count<=(limits->>'link_limit')::int and ip_count<=(limits->>'ip_limit')::int;
  if accepted then
    insert into app_private.signup_admission_tickets(request_secret_hash,link_key,workspace_id,link_id)
      values(extensions.digest(request_secret,'sha256'),derived_link,resolved.workspace_id,resolved.id) returning id into ticket;
  end if;
  insert into app_private.client_signup_attempts(outcome_class,workspace_id,link_id)
    values('attempt',resolved.workspace_id,resolved.id) returning id into attempt_id;
  details:=jsonb_strip_nulls(jsonb_build_object('outcome_class','attempt','timestamp',sampled_at,'workspace_id',resolved.workspace_id,'link_id',resolved.id));
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(null,'client.signup_attempted','client_signup_attempts',attempt_id,resolved.workspace_id,details);
  if not coalesce(accepted,false) then
    insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
      values(null,'client.signup_failed','client_signup_attempts',attempt_id,resolved.workspace_id,details||'{"outcome_class":"failure"}'::jsonb);
    return '{"status":"invalid"}'::jsonb;
  end if;
  return jsonb_build_object('status','admitted','admission_ticket',ticket);
exception when others then
  -- This boundary rolls ALL admission writes back on infrastructure failure.
  return '{"status":"unavailable"}'::jsonb;
end $$;
alter function public.client_signup_admit(text,text,bytea,bytea,timestamptz,uuid,bytea) owner to postgres;
revoke all on function public.client_signup_admit(text,text,bytea,bytea,timestamptz,uuid,bytea) from public,anon,authenticated,service_role;
grant execute on function public.client_signup_admit(text,text,bytea,bytea,timestamptz,uuid,bytea) to anon,authenticated;

