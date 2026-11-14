-- F24 (spec 024) client leaderboard foundations.
-- S55-PO-9 Q14 username rule at the F11 signup boundary and the later client
-- edit; S55-PO-6 Q13 direct opt-out; S55-PO-3/S55-PO-6 Q12 PO-only monthly
-- publication with the approved-list swap only inside the approval
-- transaction. Every relation is workspace-bound with composite keys, RLS is
-- enabled, forced and has no policies (deny by default); all access is through
-- SECURITY DEFINER RPCs that re-check identity and workspace. Health values,
-- check-in answers and scores are never stored here (FR-023, FR-024).

-- ---------------------------------------------------------------------------
-- 1. Username rule (S55-PO-9 Q14): 3-20 of [a-z0-9_.] after the existing
--    NFKC+lowercase normalization; reserved names extended case-insensitively.
-- ---------------------------------------------------------------------------
create or replace function app_private.signup_reserved_usernames() returns jsonb
language sql immutable security definer set search_path='' as $$
  select '["platform","system","platformowner","workspaceowner","trainer","sales","client","admin","support","lifter","owner"]'::jsonb
$$;
alter function app_private.signup_reserved_usernames() owner to postgres;
revoke all on function app_private.signup_reserved_usernames() from public,anon,authenticated,service_role;

-- Classifies a raw username for the later client edit. NULL means acceptable.
create function app_private.f24_username_issue(p_raw text, p_workspace_id uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare normalized text; compact text;
begin
  if p_raw is null then return 'invalid_chars'; end if;
  normalized := lower(normalize(p_raw, NFKC));
  if char_length(normalized) < 3 then return 'too_short'; end if;
  if char_length(normalized) > 20 then return 'too_long'; end if;
  if normalized !~ '^[a-z0-9_.]{3,20}$' then return 'invalid_chars'; end if;
  compact := regexp_replace(normalized, '[\s_.-]+', '', 'g');
  if compact = '' then return 'reserved'; end if;
  if exists(select 1 from jsonb_array_elements_text(app_private.signup_reserved_usernames()) r(value)
      where regexp_replace(lower(normalize(r.value, NFKC)), '[\s_.-]+', '', 'g') = compact) then
    return 'reserved';
  end if;
  if exists(select 1 from public.workspaces w where w.id = p_workspace_id and (
      normalized = lower(normalize(w.slug, NFKC)) or normalized = lower(normalize(w.name, NFKC))
      or compact = regexp_replace(lower(normalize(w.slug, NFKC)), '[\s_.-]+', '', 'g')
      or compact = regexp_replace(lower(normalize(w.name, NFKC)), '[\s_.-]+', '', 'g'))) then
    return 'reserved';
  end if;
  return null;
end $$;
alter function app_private.f24_username_issue(text, uuid) owner to postgres;
revoke all on function app_private.f24_username_issue(text, uuid) from public, anon, authenticated, service_role;

-- F11 client_signup: unchanged except the S55-PO-9 Q14 length bound (30 -> 20).
create or replace function public.client_signup(token text, request_secret text, admission_ticket uuid, fields jsonb)
returns jsonb language plpgsql security definer set search_path='' as $signup$
declare
  link public.registration_links%rowtype;
  policy jsonb;
  required_fields jsonb;
  canonical record;
  password_hash text;
  v_token_hash text;
  binding bytea;
  rate_key text;
  sampled_at timestamptz;
  consumed uuid;
  new_user uuid;
  new_client uuid;
  failure_id uuid;
  cost integer;
  constraint_name text;
  error_message text;
  error_schema text;
  error_table text;
  identity_column text;
  duplicate_identity boolean := false;
  duplicate_username boolean := false;
  normalized_username text;
  username_compact text;
  birth_date date;
begin
  -- This outer exception block is the transaction rollback boundary, including
  -- redemption and failure audit. Unknown errors never become business invalid.
  if not app_private.signup_auth_schema_compatible() then return '{"status":"unavailable"}'::jsonb; end if;
  if auth.uid() is not null then return '{"status":"invalid"}'::jsonb; end if;
  policy:=app_private.signup_password_policy();
  required_fields:=app_private.signup_field_contract()->'required';
  if policy is null or required_fields is null or app_private.signup_consumption_policy()->>'strict' is distinct from 'true'
    or app_private.signup_completion_policy()->>'state' is distinct from 'pending-approval' then
    return '{"status":"unavailable"}'::jsonb;
  end if;
  if fields is null or jsonb_typeof(fields)<>'object' then return '{"status":"invalid"}'::jsonb; end if;
  if exists(select 1 from jsonb_object_keys(fields) k where not required_fields ? k and k<>'telegram_username')
    or exists(select 1 from jsonb_array_elements_text(required_fields) k where jsonb_typeof(fields->k) is distinct from 'string' or length(btrim(fields->>k))=0) then
    return '{"status":"invalid"}'::jsonb;
  end if;
  if not app_private.signup_password_acceptable(fields->>'password') then
    return '{"status":"invalid"}'::jsonb;
  end if;
  begin
    select * into canonical from app_private.signup_identity_normalization(fields->>'email',fields->>'phone');
  exception when check_violation then
    if sqlerrm='unresolved_identifier' then return '{"status":"invalid"}'::jsonb; end if;
    raise;
  end;
  if canonical.email_key is null or canonical.phone_key is null then return '{"status":"invalid"}'::jsonb; end if;
  if cardinality(array_remove(regexp_split_to_array(fields->>'name','\s+'),''))<3
    or fields->>'date_of_birth' !~ '^\d{4}-\d{2}-\d{2}$'
    or length(btrim(fields->>'username'))=0
    or (fields ? 'telegram_username' and jsonb_typeof(fields->'telegram_username') is distinct from 'string')
    or (fields ? 'telegram_username' and fields->>'telegram_username'<>''
      and fields->>'telegram_username' !~ '^@?[A-Za-z][A-Za-z0-9_]{4,31}$') then
    return '{"status":"invalid"}'::jsonb;
  end if;
  begin
    birth_date:=(fields->>'date_of_birth')::date;
  exception when others then
    return '{"status":"invalid"}'::jsonb;
  end;
  if birth_date >= (clock_timestamp() at time zone 'Africa/Cairo')::date then
    return '{"status":"invalid"}'::jsonb;
  end if;
  normalized_username:=lower(normalize(fields->>'username',NFKC));
  if normalized_username !~ '^[a-z0-9_.]{3,20}$' then return '{"status":"invalid"}'::jsonb; end if;
  username_compact:=regexp_replace(normalized_username,'[\s_.-]+','','g');
  if username_compact='' then return '{"status":"username_unavailable"}'::jsonb; end if;
  if normalized_username='' then return '{"status":"invalid"}'::jsonb; end if;
  if exists(select 1 from jsonb_array_elements_text(app_private.signup_reserved_usernames()) r(value)
      where regexp_replace(lower(normalize(r.value,NFKC)),'[\s_.-]+','','g')=username_compact) then
    return '{"status":"username_unavailable"}'::jsonb;
  end if;
  -- Reject malformed values before link work or ticket redemption.
  if token is null or token !~ '^[A-Za-z0-9_-]{43}$'
    or request_secret is null or request_secret !~ '^[A-Za-z0-9_-]{43}$' then
    return '{"status":"invalid"}'::jsonb;
  end if;
  v_token_hash:=encode(extensions.digest(token,'sha256'),'hex');
  select * into link from public.registration_links l where l.token_hash=v_token_hash for update;
  if link.id is not null and exists(
    select 1 from public.workspaces w where w.id=link.workspace_id and (
      normalized_username=lower(normalize(w.slug,NFKC)) or normalized_username=lower(normalize(w.name,NFKC))
      or username_compact=regexp_replace(lower(normalize(w.slug,NFKC)),'[\s_.-]+','','g')
      or username_compact=regexp_replace(lower(normalize(w.name,NFKC)),'[\s_.-]+','','g'))) then
    return '{"status":"username_unavailable"}'::jsonb;
  end if;
  sampled_at:=clock_timestamp();
  -- Vault absence is infrastructure, never a link-state result.
  select s.decrypted_secret into rate_key from vault.decrypted_secrets s where s.name='SIGNUP_RATE_KEY';
  if rate_key is null or rate_key !~ '^[0-9a-f]{64}$' then raise exception 'signup_unavailable' using errcode='55000'; end if;
  binding:=extensions.hmac(convert_to('lifter.f11.link.v1','UTF8')||decode('00','hex')||int4send(octet_length(v_token_hash))||convert_to(v_token_hash,'UTF8'),decode(rate_key,'hex'),'sha256');
  if not app_private.redeem_signup_admission_ticket(admission_ticket,binding,extensions.digest(request_secret,'sha256'),link.workspace_id,link.id) then
    return '{"status":"invalid"}'::jsonb;
  end if;
  cost:=app_private.signup_bcrypt_cost();
  if cost is distinct from 10 then return '{"status":"unavailable"}'::jsonb; end if;
  -- Deliberately after one-use admission redemption, preventing replayed or
  -- forged tickets from buying bcrypt work. Hash before any link-state or
  -- identity/collision branch so admitted D-08 outcomes retain uniform timing.
  password_hash:=extensions.crypt(fields->>'password',extensions.gen_salt('bf',cost));
  begin
    if link.id is null or link.consumed_at is not null or sampled_at>=link.expires_at then
      raise exception 'signup_invalid' using errcode='P1100';
    end if;
    new_user:=gen_random_uuid();
    perform app_private.signup_lock_identity_keys(new_user,array['email:'||canonical.email_key,'phone:'||canonical.phone_key]);
    -- Email/password account, confirmed by this bounded flow, no phone login
    -- identifier or session. U2 client trigger adds the canonical phone claim.
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,invited_at,
      confirmation_token,confirmation_sent_at,recovery_token,recovery_sent_at,email_change_token_new,email_change,email_change_sent_at,
      last_sign_in_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,phone,phone_confirmed_at,phone_change,phone_change_token,
      phone_change_sent_at,email_change_token_current,email_change_confirm_status,banned_until,reauthentication_token,
      reauthentication_sent_at,is_sso_user,deleted_at,is_anonymous)
    values('00000000-0000-0000-0000-000000000000',new_user,'authenticated','authenticated',canonical.email_key,password_hash,sampled_at,null,
      '',null,'',null,'','',null,null,'{"provider":"email","providers":["email"]}'::jsonb,'{"email_verified":true}'::jsonb,
      sampled_at,sampled_at,null,null,'','',null,'',0,null,'',null,false,null,false);
    insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values(gen_random_uuid(),new_user::text,new_user,jsonb_build_object('sub',new_user::text,'email',canonical.email_key,'email_verified',false,'phone_verified',false),
      'email',sampled_at,sampled_at,sampled_at);
    insert into public.clients(workspace_id,auth_user_id,registration_link_id,package_version_id,email_normalized,phone_e164,name,date_of_birth,username_normalized,telegram_username)
    values(link.workspace_id,new_user,link.id,link.package_version_id,canonical.email_key,canonical.phone_key,fields->>'name',birth_date,normalized_username,nullif(fields->>'telegram_username','')) returning id into new_client;
    sampled_at:=clock_timestamp();
    update public.registration_links l set consumed_at=sampled_at
      where l.id=link.id and l.workspace_id=link.workspace_id and l.consumed_at is null and sampled_at<l.expires_at returning l.id into consumed;
    if consumed is null then raise exception 'signup_invalid' using errcode='P1100'; end if;
    insert into app_private.client_signup_operations(workspace_id,client_id,auth_user_id,registration_link_id,request_secret_hash)
      values(link.workspace_id,new_client,new_user,link.id,extensions.digest(request_secret,'sha256'));
    set constraints all immediate;
    return '{"status":"complete"}'::jsonb;
  exception when others then
    get stacked diagnostics constraint_name=CONSTRAINT_NAME,error_message=MESSAGE_TEXT,error_schema=SCHEMA_NAME,error_table=TABLE_NAME;
    identity_column := case when sqlstate='23505' then app_private.signup_auth_identity_column(error_schema,error_table,constraint_name) end;
    duplicate_username := sqlstate='23505' and constraint_name='clients_workspace_id_username_normalized_key';
    duplicate_identity := sqlstate='23505' and (identity_column is not null or constraint_name in (
      'account_identifier_claims_email_key_key','account_identifier_claims_phone_key_key',
      'clients_email_normalized_key','clients_phone_e164_key'));
    -- Positively identified business failures only. No diagnostics are logged,
    -- persisted, raised to the caller, or included in public return values.
    if not (sqlstate='P1100'
      or (sqlstate='23505' and (identity_column is not null or constraint_name in ('account_identifier_claims_email_key_key','account_identifier_claims_phone_key_key',
        'clients_email_normalized_key','clients_phone_e164_key','clients_registration_link_id_key','clients_workspace_id_username_normalized_key')))
      or (sqlstate='23514' and error_message in ('unresolved_identifier','invalid_client_binding','identifier_disagreement',
        'identity_kind_conflict','invalid_client_correspondence','invalid_receipt_binding'))) then
      raise exception 'signup_unavailable' using errcode='55000';
    end if;
  end;
  -- Business subtransaction was rolled back; redemption survives. Failure
  -- evidence has its own UUID and never uses a ticket/credential as audit target.
  insert into app_private.client_signup_attempts(outcome_class,workspace_id,link_id)
    values('failure',link.workspace_id,link.id) returning id into failure_id;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(null,'client.signup_failed','client_signup_attempts',failure_id,link.workspace_id,
      jsonb_strip_nulls(jsonb_build_object('outcome_class','failure','timestamp',clock_timestamp(),'link_id',link.id,'workspace_id',link.workspace_id)));
  if duplicate_username then return '{"status":"username_unavailable"}'::jsonb; end if;
  if duplicate_identity then return '{"status":"duplicate"}'::jsonb; end if;
  return '{"status":"invalid"}'::jsonb;
exception when others then
  return '{"status":"unavailable"}'::jsonb;
end;
$signup$;
alter function public.client_signup(text,text,uuid,jsonb) owner to postgres;
revoke all on function public.client_signup(text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.client_signup(text,text,uuid,jsonb) to anon,authenticated;

-- ---------------------------------------------------------------------------
-- 2. Later client username edit (S55-PO-6 Q11). The canonical identity stays
--    public.clients.username_normalized (F11/F15); the existing
--    clients_workspace_id_username_normalized_key unique index is the
--    concurrency-safe case-insensitive workspace uniqueness boundary.
-- ---------------------------------------------------------------------------
create table app_private.client_username_changes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  actor_user_id uuid not null,
  transaction_id xid8 not null default pg_current_xact_id(),
  changed_at timestamptz not null default clock_timestamp() check (isfinite(changed_at)),
  unique (workspace_id, client_id, transaction_id),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete restrict
);
alter table app_private.client_username_changes owner to postgres;
alter table app_private.client_username_changes enable row level security;
alter table app_private.client_username_changes force row level security;
revoke all on app_private.client_username_changes from public, anon, authenticated, service_role;
create trigger client_username_changes_immutable before update or delete on app_private.client_username_changes
  for each row execute function app_private.audit_events_immutable();

-- Existing F12/F13/F15 guard, plus one narrow branch: a username-only change
-- by the client themself, recorded in this transaction, in the Q14 format.
create or replace function app_private.f12_guard_client_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare refund_match boolean; closure_match boolean;
begin
  if old.deactivated_at is null and new.deactivated_at is null
    and new.username_normalized is distinct from old.username_normalized
    and (to_jsonb(new)-'username_normalized') = (to_jsonb(old)-'username_normalized') then
    if new.username_normalized is null
      or new.username_normalized !~ '^[a-z0-9_.]{3,20}$'
      or old.auth_user_id is distinct from auth.uid()
      or not exists(select 1 from app_private.client_username_changes u
        where u.workspace_id=old.workspace_id and u.client_id=old.id
          and u.actor_user_id=auth.uid() and u.transaction_id=pg_current_xact_id()) then
      raise exception 'invalid_client_transition' using errcode='23514';
    end if;
    return new;
  end if;

  if old.deactivated_at is not null then
    if new.deactivated_at is distinct from old.deactivated_at
      or new.deactivation_reason is distinct from old.deactivation_reason then
      raise exception 'client_deactivation_is_immutable' using errcode='23514';
    end if;
  elsif new.deactivated_at is not null then
    select exists(select 1 from public.refund_operations r
      where r.workspace_id=new.workspace_id and r.client_id=new.id and r.actor_user_id=auth.uid()
        and r.recorded_at=new.deactivated_at),
      exists(select 1 from app_private.client_closure_operations o
      where o.workspace_id=new.workspace_id and o.client_id=new.id and o.actor_user_id=auth.uid()
        and o.recorded_at=new.deactivated_at)
      into refund_match,closure_match;
    if (to_jsonb(new)-'deactivated_at'-'deactivation_reason')
          is distinct from (to_jsonb(old)-'deactivated_at'-'deactivation_reason')
      or refund_match = closure_match then
      raise exception 'invalid_client_deactivation' using errcode='23514';
    end if;
    new.deactivation_reason := case when refund_match then 'refund' else 'closure' end;
    if not exists(select 1 from app_private.client_deactivation_state d
      where d.client_id=new.id and d.auth_user_id=new.auth_user_id and d.deactivated_at=new.deactivated_at) then
      raise exception 'client_deactivation_lockout_missing' using errcode='23514';
    end if;
    return new;
  elsif new.deactivation_reason is not null then
    raise exception 'invalid_client_deactivation_reason' using errcode='23514';
  end if;

  if (to_jsonb(new)-'approval_state') is distinct from (to_jsonb(old)-'approval_state')
    or old.approval_state=new.approval_state
    or not exists(select 1 from app_private.registration_decisions d where d.workspace_id=old.workspace_id and d.client_id=old.id
      and d.transaction_id=pg_current_xact_id() and d.actor_user_id=auth.uid()
      and d.from_state=old.approval_state and d.to_state=new.approval_state
      and app_private.f12_actor_allowed(d.workspace_id,'approve_registration',d.kind='reconsider')) then
    raise exception 'invalid_client_transition' using errcode='23514';
  end if;
  return new;
end $$;
alter function app_private.f12_guard_client_transition() owner to postgres;
revoke all on function app_private.f12_guard_client_transition() from public,anon,authenticated,service_role;

create function public.client_update_username(p_username text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid := auth.uid(); c public.clients%rowtype; issue text; normalized text; violated text;
begin
  if actor is null then return '{"status":"not_permitted"}'::jsonb; end if;
  select * into c from public.clients x
    where x.auth_user_id=actor and x.approval_state='approved' and x.deactivated_at is null
    for update;
  if not found then return '{"status":"not_permitted"}'::jsonb; end if;
  issue := app_private.f24_username_issue(p_username, c.workspace_id);
  if issue is not null then return jsonb_build_object('status', issue); end if;
  normalized := lower(normalize(p_username, NFKC));
  if c.username_normalized is not distinct from normalized then
    return '{"status":"unchanged"}'::jsonb;
  end if;
  begin
    insert into app_private.client_username_changes(workspace_id, client_id, actor_user_id)
      values (c.workspace_id, c.id, actor);
    update public.clients x set username_normalized=normalized
      where x.workspace_id=c.workspace_id and x.id=c.id;
  exception when unique_violation then
    get stacked diagnostics violated = CONSTRAINT_NAME;
    if violated = 'clients_workspace_id_username_normalized_key' then
      return '{"status":"taken"}'::jsonb;
    end if;
    raise;
  end;
  -- No username values in audit details (contract audit boundary).
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
    values (actor, 'client.username_changed', 'clients', c.id, c.workspace_id, '{}'::jsonb);
  return '{"status":"updated"}'::jsonb;
end $$;
alter function public.client_update_username(text) owner to postgres;
revoke all on function public.client_update_username(text) from public, anon, authenticated, service_role;
grant execute on function public.client_update_username(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Direct opt-out (S55-PO-6 Q13; FR-007-FR-009, FR-025). One immutable row
--    per client; reads filter it immediately. No re-join path is specified.
-- ---------------------------------------------------------------------------
create table public.client_leaderboard_opt_outs (
  workspace_id uuid not null,
  client_id uuid not null,
  actor_user_id uuid not null,
  opted_out_at timestamptz not null default clock_timestamp() check (isfinite(opted_out_at)),
  -- spec 005 audit_events.id; no FK so the audit table's own guards stay authoritative.
  audit_event_id bigint not null,
  primary key (workspace_id, client_id),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete restrict
);
alter table public.client_leaderboard_opt_outs owner to postgres;
alter table public.client_leaderboard_opt_outs enable row level security;
alter table public.client_leaderboard_opt_outs force row level security;
revoke all on public.client_leaderboard_opt_outs from public, anon, authenticated, service_role;
create trigger client_leaderboard_opt_outs_immutable before update or delete on public.client_leaderboard_opt_outs
  for each row execute function app_private.audit_events_immutable();
create trigger client_leaderboard_opt_outs_no_truncate before truncate on public.client_leaderboard_opt_outs
  for each statement execute function app_private.audit_events_immutable();

create function public.client_leaderboard_opt_out() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid := auth.uid(); c public.clients%rowtype; event_id bigint;
begin
  if actor is null then return '{"status":"not_permitted"}'::jsonb; end if;
  select * into c from public.clients x
    where x.auth_user_id=actor and x.approval_state='approved' and x.deactivated_at is null
    for update;
  if not found then return '{"status":"not_permitted"}'::jsonb; end if;
  if exists(select 1 from public.client_leaderboard_opt_outs o
      where o.workspace_id=c.workspace_id and o.client_id=c.id) then
    return '{"status":"already_opted_out"}'::jsonb;
  end if;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
    values (actor, 'leaderboard.client_opted_out', 'clients', c.id, c.workspace_id, '{}'::jsonb)
    returning id into event_id;
  insert into public.client_leaderboard_opt_outs(workspace_id, client_id, actor_user_id, audit_event_id)
    values (c.workspace_id, c.id, actor, event_id);
  return '{"status":"opted_out"}'::jsonb;
end $$;
alter function public.client_leaderboard_opt_out() owner to postgres;
revoke all on function public.client_leaderboard_opt_out() from public, anon, authenticated, service_role;
grant execute on function public.client_leaderboard_opt_out() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Eligibility over F13 facts (FR-010-FR-014, FR-032). The F13 projection
--    is the only lifecycle authority: a day accrues when the projection for
--    that Cairo day is `active` (frozen days do not accrue).
-- ---------------------------------------------------------------------------
create function app_private.f24_cairo_today() returns date
language sql stable security definer set search_path='' as $$
  select (statement_timestamp() at time zone 'Africa/Cairo')::date
$$;

create function app_private.f24_initial_subscription(ws uuid, cid uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select s.id from public.subscriptions s
  where s.workspace_id=ws and s.client_id=cid and s.kind='initial'
  limit 1
$$;

create function app_private.f24_active_days(ws uuid, sid uuid, as_of date, needed integer) returns integer
language plpgsql stable security definer set search_path='' as $$
declare lower_bound date; d date; counted integer := 0;
begin
  if ws is null or sid is null or as_of is null or needed is null or needed < 1 then return 0; end if;
  select least(
    (select min((a.activated_at at time zone 'Africa/Cairo')::date) from public.subscription_activations a
      where a.workspace_id=ws and app_private.f19_resolve_subscription_id(a.workspace_id, a.subscription_id)=sid),
    (select min(m.new_service_start_date) from public.subscription_manual_date_adjustments m
      where m.workspace_id=ws and app_private.f19_resolve_subscription_id(m.workspace_id, m.subscription_id)=sid),
    (select min(u.service_start_date) from public.subscription_upgrades u
      where u.workspace_id=ws and app_private.f19_resolve_subscription_id(u.workspace_id, u.subscription_id)=sid)
  ) into lower_bound;
  if lower_bound is null or lower_bound > as_of then return 0; end if;
  d := as_of;
  while d >= lower_bound and counted < needed loop
    if app_private.f13_project_entitlement(ws, sid, d)->>'status' = 'active' then
      counted := counted + 1;
    end if;
    d := d - 1;
  end loop;
  return counted;
end $$;

-- Facts only; the 14-day threshold is applied by f24_client_eligible and by
-- lib/leaderboard/eligibility.ts (both walls).
create function app_private.f24_eligibility_facts(ws uuid, cid uuid, as_of date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.clients%rowtype; sid uuid; projected text; days integer := 0;
begin
  select * into c from public.clients x where x.workspace_id=ws and x.id=cid;
  if not found then return null; end if;
  sid := app_private.f24_initial_subscription(ws, cid);
  if sid is not null then
    projected := app_private.f13_project_entitlement(ws, sid, as_of)->>'status';
    if projected = 'active' then days := app_private.f24_active_days(ws, sid, as_of, 14); end if;
  end if;
  return jsonb_build_object(
    'client_id', c.id,
    'entitlement_status', projected,
    'active_days', days,
    'opted_out', exists(select 1 from public.client_leaderboard_opt_outs o
      where o.workspace_id=ws and o.client_id=cid),
    'has_username', coalesce(c.username_normalized ~ '^[a-z0-9_.]{3,20}$', false));
end $$;

create function app_private.f24_client_eligible(ws uuid, cid uuid, as_of date) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((
    select c.approval_state='approved' and c.deactivated_at is null
      and (f.facts->>'opted_out')::boolean = false
      and f.facts->>'entitlement_status' = 'active'
      and (f.facts->>'active_days')::integer >= 14
      and (f.facts->>'has_username')::boolean
    from public.clients c
    cross join lateral (select app_private.f24_eligibility_facts(ws, cid, as_of) as facts) f
    where c.workspace_id=ws and c.id=cid), false)
$$;

-- ---------------------------------------------------------------------------
-- 5. Monthly publications (FR-003, FR-019, FR-020, FR-026, FR-028-FR-030).
-- ---------------------------------------------------------------------------
create table public.leaderboard_publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  period_month date not null check (isfinite(period_month) and extract(day from period_month) = 1),
  state text not null default 'pending' check (state in ('pending', 'approved', 'rejected')),
  operation_key uuid not null,
  created_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  created_at timestamptz not null default clock_timestamp() check (isfinite(created_at)),
  decided_by uuid references public.staff_profiles(user_id) on delete restrict,
  decided_at timestamptz check (decided_at is null or isfinite(decided_at)),
  -- spec 005 audit_events.id (no FK; see client_leaderboard_opt_outs.audit_event_id).
  decision_audit_event_id bigint,
  unique (workspace_id, id),
  unique (workspace_id, operation_key),
  check ((state = 'pending' and decided_by is null and decided_at is null and decision_audit_event_id is null)
    or (state <> 'pending' and decided_by is not null and decided_at is not null and decision_audit_event_id is not null))
);
create unique index leaderboard_publications_one_pending
  on public.leaderboard_publications(workspace_id) where state = 'pending';

create table public.leaderboard_entries (
  workspace_id uuid not null,
  publication_id uuid not null,
  client_id uuid not null,
  rank smallint not null check (rank between 1 and 5),
  primary key (workspace_id, publication_id, rank),
  unique (workspace_id, publication_id, client_id),
  foreign key (workspace_id, publication_id) references public.leaderboard_publications(workspace_id, id) on delete restrict,
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete restrict
);

-- The approved list every viewer sees; replaced only by the approval RPC.
create table public.leaderboard_current_publications (
  workspace_id uuid primary key references public.workspaces(id) on delete restrict,
  publication_id uuid not null,
  replaced_at timestamptz not null default clock_timestamp() check (isfinite(replaced_at)),
  foreign key (workspace_id, publication_id) references public.leaderboard_publications(workspace_id, id) on delete restrict
);

alter table public.leaderboard_publications owner to postgres;
alter table public.leaderboard_entries owner to postgres;
alter table public.leaderboard_current_publications owner to postgres;
alter table public.leaderboard_publications enable row level security;
alter table public.leaderboard_publications force row level security;
alter table public.leaderboard_entries enable row level security;
alter table public.leaderboard_entries force row level security;
alter table public.leaderboard_current_publications enable row level security;
alter table public.leaderboard_current_publications force row level security;
revoke all on public.leaderboard_publications, public.leaderboard_entries, public.leaderboard_current_publications
  from public, anon, authenticated, service_role;

create function app_private.f24_guard_publication() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'leaderboard_publication_immutable' using errcode='23514';
  end if;
  if old.state <> 'pending' or new.state not in ('approved', 'rejected')
    or (to_jsonb(new)-'state'-'decided_by'-'decided_at'-'decision_audit_event_id')
       is distinct from (to_jsonb(old)-'state'-'decided_by'-'decided_at'-'decision_audit_event_id') then
    raise exception 'leaderboard_publication_immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger leaderboard_publications_guard before update or delete on public.leaderboard_publications
  for each row execute function app_private.f24_guard_publication();
create trigger leaderboard_publications_no_truncate before truncate on public.leaderboard_publications
  for each statement execute function app_private.audit_events_immutable();

create function app_private.f24_guard_entry() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op <> 'INSERT' or not exists(select 1 from public.leaderboard_publications p
      where p.workspace_id=new.workspace_id and p.id=new.publication_id and p.state='pending') then
    raise exception 'leaderboard_entry_immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger leaderboard_entries_guard before insert or update or delete on public.leaderboard_entries
  for each row execute function app_private.f24_guard_entry();
create trigger leaderboard_entries_no_truncate before truncate on public.leaderboard_entries
  for each statement execute function app_private.audit_events_immutable();

create function app_private.f24_guard_current() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.workspace_id <> old.workspace_id)
    or not exists(select 1 from public.leaderboard_publications p
      where p.workspace_id=new.workspace_id and p.id=new.publication_id and p.state='approved') then
    raise exception 'leaderboard_current_requires_approval' using errcode='23514';
  end if;
  return new;
end $$;
create trigger leaderboard_current_guard before insert or update or delete on public.leaderboard_current_publications
  for each row execute function app_private.f24_guard_current();
create trigger leaderboard_current_no_truncate before truncate on public.leaderboard_current_publications
  for each statement execute function app_private.audit_events_immutable();

-- Visible username for an entry: filtered live, so an opt-out, deactivation
-- or loss of approval hides the row immediately (FR-008). No snapshot copy.
create function app_private.f24_visible_username(ws uuid, cid uuid) returns text
language sql stable security definer set search_path='' as $$
  select c.username_normalized from public.clients c
  where c.workspace_id=ws and c.id=cid
    and c.approval_state='approved' and c.deactivated_at is null
    and c.username_normalized ~ '^[a-z0-9_.]{3,20}$'
    and not exists(select 1 from public.client_leaderboard_opt_outs o
      where o.workspace_id=ws and o.client_id=cid)
$$;

-- Display allow-list: rank and username only (FR-022-FR-024).
create function app_private.f24_publication_entries(ws uuid, pid uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('rank', v.rank, 'username', v.username) order by v.rank), '[]'::jsonb)
  from (
    select e.rank, app_private.f24_visible_username(e.workspace_id, e.client_id) as username
    from public.leaderboard_entries e
    where e.workspace_id=ws and e.publication_id=pid
  ) v
  where v.username is not null
$$;

create function app_private.f24_current_view(ws uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pub public.leaderboard_publications%rowtype; entries jsonb;
begin
  select p.* into pub from public.leaderboard_current_publications cur
    join public.leaderboard_publications p on p.workspace_id=cur.workspace_id and p.id=cur.publication_id
    where cur.workspace_id=ws and p.state='approved';
  if not found then return '{"status":"empty"}'::jsonb; end if;
  entries := app_private.f24_publication_entries(ws, pub.id);
  if jsonb_array_length(entries) = 0 then return '{"status":"empty"}'::jsonb; end if;
  return jsonb_build_object('status', 'available',
    'period_month', to_char(pub.period_month, 'YYYY-MM-DD'), 'entries', entries);
end $$;

-- Client viewer (FR-027): an approved, active client reads their own workspace.
create function public.client_leaderboard_read() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ws uuid;
begin
  if auth.uid() is null then return '{"status":"not_permitted"}'::jsonb; end if;
  select c.workspace_id into ws from public.clients c
    where c.auth_user_id=auth.uid() and c.approval_state='approved' and c.deactivated_at is null;
  if ws is null then return '{"status":"not_permitted"}'::jsonb; end if;
  return app_private.f24_current_view(ws);
end $$;

-- Staff viewer (FR-027): PO or any staff role with an active membership.
create function public.workspace_leaderboard_read(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_workspace_id is null or not app_private.has_workspace_access(p_workspace_id, null) then
    return '{"status":"not_permitted"}'::jsonb;
  end if;
  return app_private.f24_current_view(p_workspace_id);
end $$;

-- Client self state for account settings; the username is the caller's own.
create function public.client_leaderboard_self() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.clients%rowtype;
begin
  if auth.uid() is null then return '{"status":"not_permitted"}'::jsonb; end if;
  select * into c from public.clients x
    where x.auth_user_id=auth.uid() and x.approval_state='approved' and x.deactivated_at is null;
  if not found then return '{"status":"not_permitted"}'::jsonb; end if;
  return jsonb_build_object('status', 'ok',
    'username', c.username_normalized,
    'opted_out', exists(select 1 from public.client_leaderboard_opt_outs o
      where o.workspace_id=c.workspace_id and o.client_id=c.id),
    'eligible', app_private.f24_client_eligible(c.workspace_id, c.id, app_private.f24_cairo_today()));
end $$;

-- PO-only candidate inputs: F13 eligibility facts and the current incumbents.
-- Client ids stay on the server; no health value or score is included.
create function public.leaderboard_candidate_pool(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare today date := app_private.f24_cairo_today(); pool jsonb; incumbents jsonb;
begin
  if auth.uid() is null or not app_private.is_platform_owner() or p_workspace_id is null
    or not exists(select 1 from public.workspaces w where w.id=p_workspace_id) then
    return '{"status":"not_permitted"}'::jsonb;
  end if;
  select coalesce(jsonb_agg(app_private.f24_eligibility_facts(c.workspace_id, c.id, today) order by c.id), '[]'::jsonb)
    into pool
    from public.clients c
    where c.workspace_id=p_workspace_id and c.approval_state='approved' and c.deactivated_at is null;
  select coalesce(jsonb_agg(e.client_id order by e.rank), '[]'::jsonb) into incumbents
    from public.leaderboard_current_publications cur
    join public.leaderboard_entries e on e.workspace_id=cur.workspace_id and e.publication_id=cur.publication_id
    where cur.workspace_id=p_workspace_id;
  return jsonb_build_object('status', 'ok',
    'period_month', to_char(date_trunc('month', today)::date, 'YYYY-MM-DD'),
    'pool', pool, 'incumbent_client_ids', incumbents);
end $$;

-- PO-only: store a ranked candidate for the current Cairo month. Ordering is
-- computed server-side by lib/leaderboard/ranking.ts; this wall re-checks
-- size, uniqueness, workspace membership and eligibility of every client.
create function public.create_leaderboard_candidate(
  p_workspace_id uuid, p_client_ids uuid[], p_operation_key uuid
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid := auth.uid(); today date := app_private.f24_cairo_today();
  existing public.leaderboard_publications%rowtype; pid uuid; n integer; i integer;
begin
  if actor is null or not app_private.is_platform_owner() then
    return '{"status":"not_permitted"}'::jsonb;
  end if;
  if p_workspace_id is null or p_operation_key is null or p_client_ids is null
    or not exists(select 1 from public.workspaces w where w.id=p_workspace_id) then
    return '{"status":"invalid_input"}'::jsonb;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('f24-leaderboard:'||p_workspace_id::text, 0));
  select * into existing from public.leaderboard_publications p
    where p.workspace_id=p_workspace_id and p.operation_key=p_operation_key;
  if found then
    return jsonb_build_object('status', 'replayed', 'publication_id', existing.id);
  end if;
  n := coalesce(cardinality(p_client_ids), 0);
  if n < 1 or n > 5 or exists(select 1 from unnest(p_client_ids) x where x is null)
    or (select count(distinct x) from unnest(p_client_ids) x) <> n then
    return '{"status":"invalid_input"}'::jsonb;
  end if;
  if exists(select 1 from public.leaderboard_publications p
      where p.workspace_id=p_workspace_id and p.state='pending') then
    return '{"status":"pending_exists"}'::jsonb;
  end if;
  for i in 1..n loop
    if not app_private.f24_client_eligible(p_workspace_id, p_client_ids[i], today) then
      return '{"status":"ineligible_client"}'::jsonb;
    end if;
  end loop;
  insert into public.leaderboard_publications(workspace_id, period_month, operation_key, created_by)
    values (p_workspace_id, date_trunc('month', today)::date, p_operation_key, actor)
    returning id into pid;
  for i in 1..n loop
    insert into public.leaderboard_entries(workspace_id, publication_id, client_id, rank)
      values (p_workspace_id, pid, p_client_ids[i], i);
  end loop;
  return jsonb_build_object('status', 'created', 'publication_id', pid);
end $$;

-- PO-only review of the pending candidate: rank and username only.
create function public.leaderboard_pending_read(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pub public.leaderboard_publications%rowtype;
begin
  if auth.uid() is null or not app_private.is_platform_owner() or p_workspace_id is null then
    return '{"status":"not_permitted"}'::jsonb;
  end if;
  select * into pub from public.leaderboard_publications p
    where p.workspace_id=p_workspace_id and p.state='pending';
  if not found then return '{"status":"none"}'::jsonb; end if;
  return jsonb_build_object('status', 'pending', 'publication_id', pub.id,
    'period_month', to_char(pub.period_month, 'YYYY-MM-DD'),
    'entries', app_private.f24_publication_entries(p_workspace_id, pub.id));
end $$;

-- PO-only decision after off-app WhatsApp verification. Approval swaps the
-- current list in this same transaction; rejection leaves it untouched.
create function public.decide_leaderboard_candidate(p_publication_id uuid, p_decision text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid := auth.uid(); ws uuid; pub public.leaderboard_publications%rowtype;
  event_id bigint; entry_count integer; next_state text;
begin
  if actor is null or not app_private.is_platform_owner() then
    return '{"status":"not_permitted"}'::jsonb;
  end if;
  if p_publication_id is null or p_decision is null or p_decision not in ('approve', 'reject') then
    return '{"status":"invalid_input"}'::jsonb;
  end if;
  select p.workspace_id into ws from public.leaderboard_publications p where p.id=p_publication_id;
  if ws is null then return '{"status":"not_found"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('f24-leaderboard:'||ws::text, 0));
  select * into pub from public.leaderboard_publications p
    where p.workspace_id=ws and p.id=p_publication_id for update;
  next_state := case p_decision when 'approve' then 'approved' else 'rejected' end;
  if pub.state <> 'pending' then
    if pub.state = next_state then
      return jsonb_build_object('status', 'already_decided', 'state', pub.state);
    end if;
    return '{"status":"conflict"}'::jsonb;
  end if;
  select count(*)::integer into entry_count from public.leaderboard_entries e
    where e.workspace_id=ws and e.publication_id=pub.id;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
    values (actor,
      case next_state when 'approved' then 'leaderboard.publication_approved' else 'leaderboard.publication_rejected' end,
      'leaderboard_publications', pub.id, ws,
      jsonb_build_object('period_month', to_char(pub.period_month, 'YYYY-MM-DD'), 'entry_count', entry_count))
    returning id into event_id;
  update public.leaderboard_publications p
    set state=next_state, decided_by=actor, decided_at=clock_timestamp(), decision_audit_event_id=event_id
    where p.workspace_id=ws and p.id=pub.id;
  if next_state = 'approved' then
    insert into public.leaderboard_current_publications(workspace_id, publication_id)
      values (ws, pub.id)
      on conflict (workspace_id) do update
        set publication_id=excluded.publication_id, replaced_at=clock_timestamp();
  end if;
  return jsonb_build_object('status', next_state);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Ownership and grants. Internal helpers are not callable by any API role.
-- ---------------------------------------------------------------------------
alter function app_private.f24_cairo_today() owner to postgres;
alter function app_private.f24_initial_subscription(uuid, uuid) owner to postgres;
alter function app_private.f24_active_days(uuid, uuid, date, integer) owner to postgres;
alter function app_private.f24_eligibility_facts(uuid, uuid, date) owner to postgres;
alter function app_private.f24_client_eligible(uuid, uuid, date) owner to postgres;
alter function app_private.f24_guard_publication() owner to postgres;
alter function app_private.f24_guard_entry() owner to postgres;
alter function app_private.f24_guard_current() owner to postgres;
alter function app_private.f24_visible_username(uuid, uuid) owner to postgres;
alter function app_private.f24_publication_entries(uuid, uuid) owner to postgres;
alter function app_private.f24_current_view(uuid) owner to postgres;
alter function public.client_leaderboard_read() owner to postgres;
alter function public.workspace_leaderboard_read(uuid) owner to postgres;
alter function public.client_leaderboard_self() owner to postgres;
alter function public.leaderboard_candidate_pool(uuid) owner to postgres;
alter function public.create_leaderboard_candidate(uuid, uuid[], uuid) owner to postgres;
alter function public.leaderboard_pending_read(uuid) owner to postgres;
alter function public.decide_leaderboard_candidate(uuid, text) owner to postgres;

revoke all on function
  app_private.f24_cairo_today(),
  app_private.f24_initial_subscription(uuid, uuid),
  app_private.f24_active_days(uuid, uuid, date, integer),
  app_private.f24_eligibility_facts(uuid, uuid, date),
  app_private.f24_client_eligible(uuid, uuid, date),
  app_private.f24_guard_publication(),
  app_private.f24_guard_entry(),
  app_private.f24_guard_current(),
  app_private.f24_visible_username(uuid, uuid),
  app_private.f24_publication_entries(uuid, uuid),
  app_private.f24_current_view(uuid)
  from public, anon, authenticated, service_role;

revoke all on function
  public.client_leaderboard_read(),
  public.workspace_leaderboard_read(uuid),
  public.client_leaderboard_self(),
  public.leaderboard_candidate_pool(uuid),
  public.create_leaderboard_candidate(uuid, uuid[], uuid),
  public.leaderboard_pending_read(uuid),
  public.decide_leaderboard_candidate(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.client_leaderboard_read(),
  public.workspace_leaderboard_read(uuid),
  public.client_leaderboard_self(),
  public.leaderboard_candidate_pool(uuid),
  public.create_leaderboard_candidate(uuid, uuid[], uuid),
  public.leaderboard_pending_read(uuid),
  public.decide_leaderboard_candidate(uuid, text)
  to authenticated;

comment on column public.client_leaderboard_opt_outs.audit_event_id is
  'public.audit_events.id of the opt-out event. Intentionally no FK: audit_events keeps its own immutability/TRUNCATE guards authoritative.';
comment on column public.leaderboard_publications.decision_audit_event_id is
  'public.audit_events.id of the PO decision event. Intentionally no FK: audit_events keeps its own immutability/TRUNCATE guards authoritative.';
