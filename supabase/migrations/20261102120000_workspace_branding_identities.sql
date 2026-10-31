-- T047. Operator-managed, externally issued identities. No bearer JWT is stored.
-- Roles are cluster-global and may survive a local database reset.
do $$ begin
  if not exists(select 1 from pg_catalog.pg_roles where rolname='branding_proxy') then
    create role branding_proxy nologin nosuperuser nobypassrls noinherit nocreatedb nocreaterole;
  end if;
  if not exists(select 1 from pg_catalog.pg_roles where rolname='branding_validator') then
    create role branding_validator nologin nosuperuser nobypassrls noinherit nocreatedb nocreaterole;
  end if;
  if exists(select 1 from pg_catalog.pg_roles r where r.rolname in ('branding_proxy','branding_validator')
    and (r.rolcanlogin or r.rolsuper or r.rolbypassrls or r.rolinherit or r.rolcreatedb or r.rolcreaterole))
    or exists(select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid=m.member
      where r.rolname in ('branding_proxy','branding_validator')) then
    raise exception 'Branding identity role privilege drift';
  end if;
end $$;
grant branding_proxy, branding_validator to authenticator;
grant usage on schema public, app_private to branding_proxy, branding_validator;

create table app_private.branding_credentials (
  credential_hash text primary key check(credential_hash ~ '^[0-9a-f]{64}$'),
  identity_role text not null check(identity_role in ('branding_proxy','branding_validator')),
  enabled boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  disabled_at timestamptz
);
create table app_private.branding_credential_events (
  id bigint generated always as identity primary key,
  credential_hash text not null check(credential_hash ~ '^[0-9a-f]{64}$'),
  identity_role text not null check(identity_role in ('branding_proxy','branding_validator')),
  action text not null check(action in ('registered','enabled','disabled','emergency_disabled')),
  occurred_at timestamptz not null default statement_timestamp(),
  operator_role text not null default session_user
);
alter table app_private.branding_credentials enable row level security;
alter table app_private.branding_credentials force row level security;
alter table app_private.branding_credential_events enable row level security;
alter table app_private.branding_credential_events force row level security;
revoke all on app_private.branding_credentials,app_private.branding_credential_events from public,anon,authenticated,service_role,branding_proxy,branding_validator;
revoke all on sequence app_private.branding_credential_events_id_seq from public,anon,authenticated,service_role,branding_proxy,branding_validator;

create function app_private.branding_credential_event_immutable() returns trigger
language plpgsql security definer set search_path='' as $$
begin raise exception using errcode='42501',message='Branding credential events are append only'; end $$;
alter function app_private.branding_credential_event_immutable() owner to postgres;
revoke all on function app_private.branding_credential_event_immutable() from public,anon,authenticated,service_role,branding_proxy,branding_validator;
create trigger branding_credential_events_immutable before update or delete or truncate on app_private.branding_credential_events for each statement execute function app_private.branding_credential_event_immutable();

create function app_private.branding_credential_register(credential_id text,identity_role text,expires_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare h text;
begin
  if credential_id is null or credential_id !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'
    or identity_role is null or identity_role not in ('branding_proxy','branding_validator')
    or expires_at is null or expires_at<=statement_timestamp() or not isfinite(expires_at)
    then raise exception using errcode='22023',message='Invalid branding credential'; end if;
  h:=encode(extensions.digest(credential_id,'sha256'),'hex');
  insert into app_private.branding_credentials(credential_hash,identity_role,expires_at) values(h,identity_role,expires_at);
  insert into app_private.branding_credential_events(credential_hash,identity_role,action) values(h,identity_role,'registered');
end $$;
alter function app_private.branding_credential_register(text,text,timestamptz) owner to postgres;
revoke all on function app_private.branding_credential_register(text,text,timestamptz) from public,anon,authenticated,service_role,branding_proxy,branding_validator;

create function app_private.branding_credential_set_enabled(credential_id text,enabled boolean,emergency boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare r app_private.branding_credentials%rowtype; h text;
begin
  if credential_id is null or credential_id !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' or enabled is null or emergency is null or (emergency and enabled)
    then raise exception using errcode='22023',message='Invalid branding credential'; end if;
  h:=encode(extensions.digest(credential_id,'sha256'),'hex');
  select * into r from app_private.branding_credentials c where c.credential_hash=h for update;
  if not found then raise exception using errcode='22023',message='Invalid branding credential'; end if;
  if enabled and r.expires_at<=statement_timestamp() then raise exception using errcode='22023',message='Invalid branding credential'; end if;
  update app_private.branding_credentials c set enabled=branding_credential_set_enabled.enabled,
    disabled_at=case when branding_credential_set_enabled.enabled then null else statement_timestamp() end where c.credential_hash=h;
  insert into app_private.branding_credential_events(credential_hash,identity_role,action)
    values(h,r.identity_role,case when emergency then 'emergency_disabled' when enabled then 'enabled' else 'disabled' end);
end $$;
alter function app_private.branding_credential_set_enabled(text,boolean,boolean) owner to postgres;
revoke all on function app_private.branding_credential_set_enabled(text,boolean,boolean) from public,anon,authenticated,service_role,branding_proxy,branding_validator;

create function app_private.branding_credential_allowed(expected_role text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare c jsonb; id text; e numeric;
begin
  if expected_role is null or expected_role not in ('branding_proxy','branding_validator')
    or current_setting('role',true) is distinct from expected_role then return false; end if;
  c:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
  id:=c->>'credential_id';
  if c->>'role' is distinct from expected_role or id is null or id !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'
    or c->>'exp' is null or (c->>'exp') !~ '^[0-9]{1,12}$' then return false; end if;
  e:=(c->>'exp')::numeric;
  if e<=extract(epoch from statement_timestamp()) then return false; end if;
  return exists(select 1 from app_private.branding_credentials r
    where r.credential_hash=encode(extensions.digest(id,'sha256'),'hex') and r.identity_role=expected_role
      and r.enabled and r.expires_at>statement_timestamp() and e<=extract(epoch from r.expires_at));
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;
alter function app_private.branding_credential_allowed(text) owner to postgres;
revoke all on function app_private.branding_credential_allowed(text) from public,anon,authenticated,service_role,branding_proxy,branding_validator;
grant execute on function app_private.branding_credential_allowed(text) to branding_proxy,branding_validator;
