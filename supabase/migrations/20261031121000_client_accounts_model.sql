-- F11 U2: model/integrity only. No issuer, public RPC, approval or audit changes.
-- ND-F11-2a remains OPEN: phone primitives accept stored E.164 only.
create function app_private.signup_identity_normalization(email text, phone text, auth_storage boolean default false)
returns table(email_key text,phone_key text)
language plpgsql immutable security definer set search_path='' as $$
begin
  -- GoTrue's persisted phone identifier omits the leading '+'. This flag is
  -- only for Auth rows, never for submitted/client phone input. No parsing,
  -- whitespace removal, country default or input acceptance rule is defined.
  if auth_storage and phone ~ '^[1-9][0-9]{1,14}$' then phone:='+'||phone; end if;
  -- GoTrue v2.197.0 internal/api/mail.go validateEmail uses strings.ToLower,
  -- without trim. Format acceptance belongs to GoTrue/the later form boundary.
  -- Empty Auth identifiers represent absent identifiers, not client input.
  if email is not null and email<>'' and (email ~ '[[:space:]]' or octet_length(email)>255 or position('@' in email)=0) then
    raise exception 'unresolved_identifier' using errcode='23514';
  end if;
  if phone is not null and phone<>'' and phone !~ '^\+[1-9][0-9]{1,14}$' then
    raise exception 'unresolved_identifier' using errcode='23514';
  end if;
  return query select nullif(lower(email),''),nullif(phone,'');
end $$;
revoke all on function app_private.signup_identity_normalization(text,text,boolean) from public,anon,authenticated,service_role;

create function app_private.signup_password_policy() returns jsonb language sql immutable security definer set search_path='' as $$
  select '{"minimum_code_points":8,"maximum_utf8_bytes":72,"digit_required":true,"symbol":"printable non-letter/non-digit/non-whitespace","normalization":false,"nul_allowed":false}'::jsonb
$$;
revoke all on function app_private.signup_password_policy() from public,anon,authenticated,service_role;
create function app_private.signup_field_contract() returns jsonb language sql immutable security definer set search_path='' as $$
  select '{"required":["name","email","phone","password"],"telegram":false,"phone_input_format":null}'::jsonb
$$;
revoke all on function app_private.signup_field_contract() from public,anon,authenticated,service_role;
create function app_private.signup_consumption_policy() returns jsonb language sql immutable security definer set search_path='' as $$
  select '{"strict":true,"grace":false,"f10_open_unchanged":true}'::jsonb
$$;
revoke all on function app_private.signup_consumption_policy() from public,anon,authenticated,service_role;
create function app_private.client_signup_limits() returns jsonb language sql immutable security definer set search_path='' as $$
  select '{"link_limit":5,"link_window_seconds":900,"ip_limit":30,"ip_window_seconds":3600,"fixed_windows":true,"every_admission_counts":true}'::jsonb
$$;
revoke all on function app_private.client_signup_limits() from public,anon,authenticated,service_role;
create function app_private.signup_completion_policy() returns jsonb language sql immutable security definer set search_path='' as $$
  select '{"state":"pending-approval","client_access":false,"session":false,"approval_feature":"F12","completion":"generic"}'::jsonb
$$;
revoke all on function app_private.signup_completion_policy() from public,anon,authenticated,service_role;
create function app_private.signup_retention_policy() returns jsonb language sql immutable security definer set search_path='' as $$
  select '{"attempt_days":30,"counter_retention":"window_end","audit_retention":null}'::jsonb
$$;
revoke all on function app_private.signup_retention_policy() from public,anon,authenticated,service_role;
create function app_private.signup_authenticated_visitor_policy() returns jsonb language sql immutable security definer set search_path='' as $$
  select '{"manual_sign_out":true,"auto_sign_out":false,"link":false,"merge":false,"token_redirect":false}'::jsonb
$$;
revoke all on function app_private.signup_authenticated_visitor_policy() from public,anon,authenticated,service_role;
create function app_private.signup_identifier_scope_policy() returns jsonb language sql immutable security definer set search_path='' as $$
  select '{"global_unique":true,"states":["active","pending-approval"],"archived_state":null,"archived_review":null,"duplicate_response":"D-08","release":null}'::jsonb
$$;
revoke all on function app_private.signup_identifier_scope_policy() from public,anon,authenticated,service_role;
create function app_private.client_signup_audit_contract() returns jsonb language sql immutable security definer set search_path='' as $$
  select '{"events":["attempt","failure","success","consumption","cleanup"],"allowed_details":["outcome_class","timestamp","link_id","workspace_id"],"cleanup_details":["count"],"public_actor":null}'::jsonb
$$;
revoke all on function app_private.client_signup_audit_contract() from public,anon,authenticated,service_role;

alter table public.registration_links add constraint registration_links_issued_version_unique unique(workspace_id,id,package_version_id);
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  registration_link_id uuid not null unique,
  package_version_id uuid not null,
  email_normalized text not null unique check(email_normalized<>''),
  phone_e164 text not null unique check(phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  name text not null check(length(btrim(name))>0),
  approval_state text not null default 'pending-approval' check(approval_state='pending-approval'),
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,id,auth_user_id,registration_link_id),
  foreign key(workspace_id,registration_link_id) references public.registration_links(workspace_id,id) on delete restrict,
  foreign key(workspace_id,package_version_id) references public.package_versions(workspace_id,id) on delete restrict,
  foreign key(workspace_id,registration_link_id,package_version_id) references public.registration_links(workspace_id,id,package_version_id) on delete restrict
);
revoke all on public.clients from public,anon,authenticated,service_role;
alter table public.clients enable row level security;
alter table public.clients force row level security;

create table app_private.account_identifier_claims (
  auth_user_id uuid primary key references auth.users(id) on delete restrict deferrable initially deferred,
  email_key text unique check(email_key is null or email_key<>''),
  phone_key text unique check(phone_key is null or phone_key ~ '^\+[1-9][0-9]{1,14}$'),
  created_at timestamptz not null default now()
);
revoke all on app_private.account_identifier_claims from public,anon,authenticated,service_role;
alter table app_private.account_identifier_claims enable row level security;
alter table app_private.account_identifier_claims force row level security;

create table app_private.client_signup_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  client_id uuid not null,
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  registration_link_id uuid not null unique,
  request_secret_hash bytea not null check(octet_length(request_secret_hash)=32),
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  foreign key(workspace_id,registration_link_id) references public.registration_links(workspace_id,id) on delete restrict,
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(workspace_id,client_id,auth_user_id,registration_link_id) references public.clients(workspace_id,id,auth_user_id,registration_link_id) on delete restrict
);
revoke all on app_private.client_signup_operations from public,anon,authenticated,service_role;
alter table app_private.client_signup_operations enable row level security;
alter table app_private.client_signup_operations force row level security;

create table app_private.client_signup_attempts (
  id uuid primary key default gen_random_uuid(),
  outcome_class text not null check(outcome_class in ('attempt','invalid','duplicate','success','failure')),
  created_at timestamptz not null default now(),
  workspace_id uuid,
  link_id uuid,
  check((workspace_id is null)=(link_id is null)),
  foreign key(workspace_id,link_id) references public.registration_links(workspace_id,id) on delete restrict
);
revoke all on app_private.client_signup_attempts from public,anon,authenticated,service_role;
alter table app_private.client_signup_attempts enable row level security;
alter table app_private.client_signup_attempts force row level security;

create table app_private.signup_admission_tickets (
  id uuid primary key default gen_random_uuid(),
  request_secret_hash bytea not null check(octet_length(request_secret_hash)=32),
  link_key bytea not null check(octet_length(link_key)=32),
  workspace_id uuid,
  link_id uuid,
  admitted_at timestamptz not null default now(),
  redeemed_at timestamptz,
  check((workspace_id is null)=(link_id is null)),
  check(redeemed_at is null or redeemed_at>=admitted_at),
  foreign key(workspace_id,link_id) references public.registration_links(workspace_id,id) on delete restrict
);
revoke all on app_private.signup_admission_tickets from public,anon,authenticated,service_role;
alter table app_private.signup_admission_tickets enable row level security;
alter table app_private.signup_admission_tickets force row level security;

-- Lock every canonical key in one order, including old keys before replacement.
create function app_private.signup_lock_identity_keys(identity_id uuid,keys text[]) returns void
language plpgsql security definer set search_path='' as $$
declare k text;
begin
  perform pg_advisory_xact_lock(hashtextextended('f11.identity:'||identity_id::text,0));
  for k in select distinct value collate "C" from unnest(keys) value where value is not null order by value collate "C" loop
    perform pg_advisory_xact_lock(hashtextextended('f11.key:'||k,0));
  end loop;
end $$;
revoke all on function app_private.signup_lock_identity_keys(uuid,text[]) from public,anon,authenticated,service_role;

create function app_private.signup_guard_claim_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if pg_trigger_depth()<2 or (tg_op='UPDATE' and (new.auth_user_id<>old.auth_user_id or new.created_at<>old.created_at)) then
    raise exception 'immutable' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function app_private.signup_guard_claim_write() from public,anon,authenticated,service_role;

create function app_private.sync_account_identifier_claims() returns trigger
language plpgsql security definer set search_path='' as $$
declare n record; c public.clients%rowtype; previous app_private.account_identifier_claims%rowtype;
begin
  select * into n from app_private.signup_identity_normalization(new.email,new.phone,true);
  select * into c from public.clients where auth_user_id=new.id;
  select * into previous from app_private.account_identifier_claims where auth_user_id=new.id;
  if c.id is not null then
    if n.email_key is distinct from c.email_normalized or (n.phone_key is not null and n.phone_key is distinct from c.phone_e164) then
      raise exception 'identifier_disagreement' using errcode='23514';
    end if;
    n.phone_key:=c.phone_e164;
  end if;
  if previous.email_key is not null and n.email_key is null or previous.phone_key is not null and n.phone_key is null then
    raise exception 'identifier_release_unresolved' using errcode='23514';
  end if;
  perform app_private.signup_lock_identity_keys(new.id,array['email:'||n.email_key,'phone:'||n.phone_key,'email:'||previous.email_key,'phone:'||previous.phone_key]);
  insert into app_private.account_identifier_claims(auth_user_id,email_key,phone_key) values(new.id,n.email_key,n.phone_key)
  on conflict(auth_user_id) do update set email_key=excluded.email_key,phone_key=excluded.phone_key;
  return new;
end $$;
revoke all on function app_private.sync_account_identifier_claims() from public,anon,authenticated,service_role;
create trigger signup_auth_claim_sync before insert or update of email,phone on auth.users for each row execute function app_private.sync_account_identifier_claims();
-- CREATE TRIGGER holds SHARE ROW EXCLUSIVE on Auth through migration commit.
-- Install it before the backfill so concurrent Auth writes cannot fall into a
-- read/install gap. The direct-write guard is installed after this sole backfill.
-- Unresolved canonical data/collisions abort the whole migration; no merge.
insert into app_private.account_identifier_claims(auth_user_id,email_key,phone_key)
select u.id,n.email_key,n.phone_key from auth.users u
cross join lateral app_private.signup_identity_normalization(u.email,u.phone,true) n;
create trigger signup_claim_write_guard before insert or update on app_private.account_identifier_claims for each row execute function app_private.signup_guard_claim_write();

create function app_private.guard_account_identity_kind() returns trigger
language plpgsql security definer set search_path='' as $$
declare n record; u auth.users%rowtype;
begin
  -- Auth row lock serializes both classification directions and Auth mutations.
  select * into u from auth.users where id=new.user_id for update;
  select * into n from app_private.signup_identity_normalization(u.email,u.phone,true);
  perform app_private.signup_lock_identity_keys(new.user_id,array['email:'||n.email_key,'phone:'||n.phone_key]);
  if exists(select 1 from public.clients where auth_user_id=new.user_id) then
    raise exception 'identity_kind_conflict' using errcode='23514';
  end if;
  if tg_op='UPDATE' and new.user_id<>old.user_id then raise exception 'immutable' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function app_private.guard_account_identity_kind() from public,anon,authenticated,service_role;
create trigger signup_staff_kind_guard before insert or update on public.staff_profiles for each row execute function app_private.guard_account_identity_kind();

create function app_private.guard_client_signup_insert() returns trigger
language plpgsql security definer set search_path='' as $$
declare l public.registration_links%rowtype; u auth.users%rowtype; n record; previous app_private.account_identifier_claims%rowtype;
begin
  select * into l from public.registration_links where id=new.registration_link_id for update;
  if not found or l.workspace_id<>new.workspace_id or l.package_version_id<>new.package_version_id
    or l.consumed_at is not null or clock_timestamp()>=l.expires_at then
    raise exception 'invalid_client_binding' using errcode='23514';
  end if;
  select * into u from auth.users where id=new.auth_user_id for update;
  if not found then raise exception 'invalid_client_binding' using errcode='23514'; end if;
  select * into n from app_private.signup_identity_normalization(u.email,new.phone_e164);
  select * into previous from app_private.account_identifier_claims where auth_user_id=new.auth_user_id;
  perform app_private.signup_lock_identity_keys(new.auth_user_id,array['email:'||n.email_key,'phone:'||n.phone_key,'email:'||previous.email_key,'phone:'||previous.phone_key]);
  if exists(select 1 from public.staff_profiles where user_id=new.auth_user_id)
    or n.email_key is null or n.phone_key is null or new.name is null or length(btrim(new.name))=0
    or new.created_at is distinct from now() or new.approval_state is distinct from 'pending-approval'
    or (nullif(u.phone,'') is not null and not exists(select 1 from app_private.signup_identity_normalization(u.email,u.phone,true) auth_keys where auth_keys.phone_key=n.phone_key))
    or (previous.phone_key is not null and previous.phone_key is distinct from n.phone_key) then
    raise exception 'invalid_client_binding' using errcode='23514';
  end if;
  new.email_normalized:=n.email_key;
  new.phone_e164:=n.phone_key;
  insert into app_private.account_identifier_claims(auth_user_id,email_key,phone_key) values(new.auth_user_id,n.email_key,n.phone_key)
    on conflict(auth_user_id) do update set email_key=excluded.email_key,phone_key=excluded.phone_key;
  return new;
end $$;
revoke all on function app_private.guard_client_signup_insert() from public,anon,authenticated,service_role;
create trigger signup_client_insert_guard before insert on public.clients for each row execute function app_private.guard_client_signup_insert();

create function app_private.check_client_signup_integrity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.clients c join public.registration_links l on l.workspace_id=c.workspace_id and l.id=c.registration_link_id and l.package_version_id=c.package_version_id
    join auth.users u on u.id=c.auth_user_id join app_private.account_identifier_claims claims on claims.auth_user_id=c.auth_user_id
    where c.id=new.id and l.consumed_at is not null and claims.email_key=c.email_normalized and claims.phone_key=c.phone_e164
    and not exists(select 1 from public.staff_profiles s where s.user_id=c.auth_user_id)) then
    raise exception 'invalid_client_correspondence' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function app_private.check_client_signup_integrity() from public,anon,authenticated,service_role;
create constraint trigger signup_client_integrity after insert on public.clients deferrable initially deferred for each row execute function app_private.check_client_signup_integrity();

create function app_private.guard_client_signup_operation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.created_at is distinct from now() or not exists(select 1 from public.clients c join public.registration_links l on l.workspace_id=c.workspace_id and l.id=c.registration_link_id
    where c.workspace_id=new.workspace_id and c.id=new.client_id and c.auth_user_id=new.auth_user_id and c.registration_link_id=new.registration_link_id and l.consumed_at is not null) then
    raise exception 'invalid_receipt_binding' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function app_private.guard_client_signup_operation() from public,anon,authenticated,service_role;
create trigger signup_operation_insert_guard before insert on app_private.client_signup_operations for each row execute function app_private.guard_client_signup_operation();

-- The transition capability is scoped to this transaction and ticket. A caller-
-- writable boolean GUC alone must never authorize redemption. U1 owns this key.
create function app_private.signup_ticket_redemption_proof(ticket uuid) returns text
language sql volatile security definer set search_path='' as $$
  select encode(extensions.hmac(convert_to('f11.redeem:'||pg_current_xact_id()::text||':'||ticket::text,'UTF8'),decode(s.decrypted_secret,'hex'),'sha256'),'hex')
  from vault.decrypted_secrets s where s.name='SIGNUP_ATTEST_KEY'
$$;
revoke all on function app_private.signup_ticket_redemption_proof(uuid) from public,anon,authenticated,service_role;
create function app_private.signup_guard_ticket_update() returns trigger
language plpgsql security definer set search_path='' as $$
declare proof text;
begin
  proof:=app_private.signup_ticket_redemption_proof(old.id);
  if proof is null or current_setting('app_private.signup_redemption_proof',true) is distinct from proof
    or (to_jsonb(new)-'redeemed_at') is distinct from (to_jsonb(old)-'redeemed_at')
    or old.redeemed_at is not null or new.redeemed_at is distinct from now() then
    raise exception 'immutable' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function app_private.signup_guard_ticket_update() from public,anon,authenticated,service_role;
create trigger signup_ticket_update_guard before update on app_private.signup_admission_tickets for each row execute function app_private.signup_guard_ticket_update();

create function app_private.redeem_signup_admission_ticket(ticket uuid,binding bytea,request_hash bytea,resolved_workspace uuid default null,resolved_link uuid default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare redeemed uuid; proof text;
begin
  if not app_private.signup_auth_schema_compatible() then raise exception 'auth_compat_guard_failed' using errcode='55000'; end if;
  if ticket is null or binding is null or request_hash is null or octet_length(binding)<>32 or octet_length(request_hash)<>32 then return false; end if;
  proof:=app_private.signup_ticket_redemption_proof(ticket);
  if proof is null then raise exception 'redemption_unavailable' using errcode='55000'; end if;
  perform set_config('app_private.signup_redemption_proof',proof,true);
  update app_private.signup_admission_tickets t set redeemed_at=now()
    where t.id=ticket and t.link_key=binding and t.request_secret_hash=request_hash and t.redeemed_at is null
      and t.workspace_id is not distinct from resolved_workspace and t.link_id is not distinct from resolved_link
    returning t.id into redeemed;
  perform set_config('app_private.signup_redemption_proof','',true);
  return redeemed is not null;
end $$;
revoke all on function app_private.redeem_signup_admission_ticket(uuid,bytea,bytea,uuid,uuid) from public,anon,authenticated,service_role;

-- No attempt-purge authority exists yet. U5 must supply age checks + atomic
-- cleanup audit before replacing this default-deny deletion seam.
create function app_private.signup_guard_attempt_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  raise exception 'immutable' using errcode='23514';
end $$;
revoke all on function app_private.signup_guard_attempt_delete() from public,anon,authenticated,service_role;
create trigger signup_attempt_no_delete before delete on app_private.client_signup_attempts for each row execute function app_private.signup_guard_attempt_delete();

do $$
declare target text;
begin
  foreach target in array array['public.clients','app_private.account_identifier_claims','app_private.client_signup_operations','app_private.client_signup_attempts','app_private.signup_admission_tickets'] loop
    execute format('create trigger signup_no_truncate before truncate on %s for each statement execute function app_private.forbid_delete()',target);
    if target<>'app_private.client_signup_attempts' then
      execute format('create trigger signup_no_delete before delete on %s for each row execute function app_private.forbid_delete()',target);
    end if;
    if target in ('public.clients','app_private.client_signup_operations','app_private.client_signup_attempts') then
      execute format('create trigger signup_no_update before update on %s for each row execute function app_private.audit_events_immutable()',target);
    end if;
  end loop;
end $$;
