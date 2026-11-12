-- S35 T105: count only nonempty whitespace-separated signup name components.
-- F15 T080: enforce the approved NFKC/lowercase username character set at the RPC boundary.

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
  if normalized_username !~ '^[a-z0-9_.]{3,30}$' then return '{"status":"invalid"}'::jsonb; end if;
  username_compact:=regexp_replace(normalized_username,'[\s_.-]+','','g');
  if normalized_username='' or exists(select 1 from jsonb_array_elements_text(app_private.signup_reserved_usernames()) r(value)
      where regexp_replace(lower(normalize(r.value,NFKC)),'[\s_.-]+','','g')=username_compact) then
    return '{"status":"invalid"}'::jsonb;
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
    return '{"status":"invalid"}'::jsonb;
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
    duplicate_identity := sqlstate='23505' and (identity_column is not null or constraint_name in (
      'account_identifier_claims_email_key_key','account_identifier_claims_phone_key_key',
      'clients_email_normalized_key','clients_phone_e164_key','clients_workspace_id_username_normalized_key'));
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
  if duplicate_identity then return '{"status":"duplicate"}'::jsonb; end if;
  return '{"status":"invalid"}'::jsonb;
exception when others then
  return '{"status":"unavailable"}'::jsonb;
end;
$signup$;
alter function public.client_signup(text,text,uuid,jsonb) owner to postgres;
revoke all on function public.client_signup(text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.client_signup(text,text,uuid,jsonb) to anon,authenticated;
