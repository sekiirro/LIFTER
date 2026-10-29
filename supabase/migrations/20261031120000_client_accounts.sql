-- U1 only: no public signup RPC, Auth DML, product model or policy defaults.
-- Captured GoTrue v2.197.0, latest migration 20260831180000, bcrypt cost 10.
-- Conservative manifest covers ALL 42 writable columns plus both generated columns.
create function app_private.signup_auth_schema_compatible()
returns boolean
language sql stable security definer
set search_path = ''
as $guard$
  select coalesce(
    (select pg_catalog.max(version) from auth.schema_migrations)
      = any (array['20260831180000']::text[])
    and exists (select 1 from pg_catalog.pg_extension e
      join pg_catalog.pg_namespace n on n.oid=e.extnamespace
      where e.extname='pgcrypto' and n.nspname='extensions')
    and not exists (
      select 1 from (values
      ('identities', 'provider_id', 'text', ''),
      ('identities', 'user_id', 'uuid', ''),
      ('identities', 'identity_data', 'jsonb', ''),
      ('identities', 'provider', 'text', ''),
      ('identities', 'last_sign_in_at', 'timestamp with time zone', ''),
      ('identities', 'created_at', 'timestamp with time zone', ''),
      ('identities', 'updated_at', 'timestamp with time zone', ''),
      ('identities', 'email', 'text', 's'),
      ('identities', 'id', 'uuid', ''),
      ('users', 'instance_id', 'uuid', ''),
      ('users', 'id', 'uuid', ''),
      ('users', 'aud', 'character varying(255)', ''),
      ('users', 'role', 'character varying(255)', ''),
      ('users', 'email', 'character varying(255)', ''),
      ('users', 'encrypted_password', 'character varying(255)', ''),
      ('users', 'email_confirmed_at', 'timestamp with time zone', ''),
      ('users', 'invited_at', 'timestamp with time zone', ''),
      ('users', 'confirmation_token', 'character varying(255)', ''),
      ('users', 'confirmation_sent_at', 'timestamp with time zone', ''),
      ('users', 'recovery_token', 'character varying(255)', ''),
      ('users', 'recovery_sent_at', 'timestamp with time zone', ''),
      ('users', 'email_change_token_new', 'character varying(255)', ''),
      ('users', 'email_change', 'character varying(255)', ''),
      ('users', 'email_change_sent_at', 'timestamp with time zone', ''),
      ('users', 'last_sign_in_at', 'timestamp with time zone', ''),
      ('users', 'raw_app_meta_data', 'jsonb', ''),
      ('users', 'raw_user_meta_data', 'jsonb', ''),
      ('users', 'is_super_admin', 'boolean', ''),
      ('users', 'created_at', 'timestamp with time zone', ''),
      ('users', 'updated_at', 'timestamp with time zone', ''),
      ('users', 'phone', 'text', ''),
      ('users', 'phone_confirmed_at', 'timestamp with time zone', ''),
      ('users', 'phone_change', 'text', ''),
      ('users', 'phone_change_token', 'character varying(255)', ''),
      ('users', 'phone_change_sent_at', 'timestamp with time zone', ''),
      ('users', 'confirmed_at', 'timestamp with time zone', 's'),
      ('users', 'email_change_token_current', 'character varying(255)', ''),
      ('users', 'email_change_confirm_status', 'smallint', ''),
      ('users', 'banned_until', 'timestamp with time zone', ''),
      ('users', 'reauthentication_token', 'character varying(255)', ''),
      ('users', 'reauthentication_sent_at', 'timestamp with time zone', ''),
      ('users', 'is_sso_user', 'boolean', ''),
      ('users', 'deleted_at', 'timestamp with time zone', ''),
      ('users', 'is_anonymous', 'boolean', '')
      ) as expected(table_name,column_name,type_name,generated)
      where not exists (
        select 1 from pg_catalog.pg_attribute a
        join pg_catalog.pg_class r on r.oid=a.attrelid
        join pg_catalog.pg_namespace n on n.oid=r.relnamespace
        where n.nspname='auth' and r.relname=expected.table_name
          and r.relkind='r' and a.attname=expected.column_name
          and a.attnum>0 and not a.attisdropped
          and pg_catalog.format_type(a.atttypid,a.atttypmod)=expected.type_name
          and a.attgenerated::text=expected.generated
      )
    ), false);
$guard$;
alter function app_private.signup_auth_schema_compatible() owner to postgres;
revoke all on function app_private.signup_auth_schema_compatible() from public, anon, authenticated, service_role;

-- Domain/length encoding is independent of attestation. Keys are 32 random bytes,
-- represented as lowercase hex in Vault and server-only .env.local.
-- Local provisioning is separate: extension ACLs belong to supabase_admin.
create function app_private.signup_link_key_matches(token_hash text, supplied_link_key bytea)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $verify$
declare
  rate_key text;
  expected bytea;
  difference integer := 0;
  i integer;
begin
  if token_hash is null or token_hash !~ '^[0-9a-f]{64}$'
    or supplied_link_key is null or pg_catalog.octet_length(supplied_link_key) <> 32 then
    return false;
  end if;
  select s.decrypted_secret into rate_key from vault.decrypted_secrets s
    where s.name='SIGNUP_RATE_KEY';
  if rate_key is null or rate_key !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  expected := extensions.hmac(
    pg_catalog.convert_to('lifter.f11.link.v1','UTF8') || pg_catalog.decode('00','hex')
      || pg_catalog.int4send(pg_catalog.octet_length(token_hash))
      || pg_catalog.convert_to(token_hash,'UTF8'),
    pg_catalog.decode(rate_key,'hex'),'sha256');
  -- Fixed 32-iteration comparison; no early exit on mismatching bytes.
  for i in 0..31 loop
    difference := difference | (pg_catalog.get_byte(expected,i) # pg_catalog.get_byte(supplied_link_key,i));
  end loop;
  return difference=0;
end;
$verify$;
alter function app_private.signup_link_key_matches(text,bytea) owner to postgres;
revoke all on function app_private.signup_link_key_matches(text,bytea) from public, anon, authenticated, service_role;
