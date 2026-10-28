-- U3 option (i): local GoTrue v2.197.0 only; C4 blocks hosted rollout.
-- Cost captured in U1's manifest; a single private owner, never caller-selected.
create function app_private.signup_bcrypt_cost() returns integer
language sql immutable security definer set search_path='' as $$ select 10 $$;
alter function app_private.signup_bcrypt_cost() owner to postgres;
revoke all on function app_private.signup_bcrypt_cost() from public,anon,authenticated,service_role;

create or replace function app_private.guard_registration_link_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (to_jsonb(new)-'opened_at'-'consumed_at') is distinct from (to_jsonb(old)-'opened_at'-'consumed_at') then
    raise exception 'immutable' using errcode='23514';
  end if;
  if new.opened_at is not distinct from old.opened_at and new.consumed_at is not distinct from old.consumed_at then
    raise exception 'immutable' using errcode='23514';
  end if;
  if new.opened_at is distinct from old.opened_at then
    if old.opened_at is not null or new.opened_at is null or new.opened_at is distinct from now()
      or old.consumed_at is not null or now()>=old.expires_at or new.consumed_at is distinct from old.consumed_at then
      raise exception 'immutable' using errcode='23514';
    end if;
  end if;
  if new.consumed_at is distinct from old.consumed_at then
    if old.consumed_at is not null or new.consumed_at is null or (new.consumed_at is distinct from now() and (new.consumed_at < statement_timestamp() or new.consumed_at > clock_timestamp()))
      or clock_timestamp() >= old.expires_at then
      raise exception 'immutable' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

create or replace function app_private.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  event_action text;
  event_target uuid;
  event_workspace uuid;
  event_details jsonb := '{}'::jsonb;
  changed jsonb := '{}'::jsonb;
begin
  if tg_table_schema = 'public' and tg_table_name = 'workspaces' then
    event_target := new.id;
    event_workspace := new.id;
    if tg_op = 'INSERT' then
      event_action := 'workspace.created';
    elsif tg_op = 'UPDATE' then
      if new.name is distinct from old.name then
        changed := changed || jsonb_build_object('name', jsonb_build_object('from', old.name, 'to', new.name));
      end if;
      if new.slug is distinct from old.slug then
        changed := changed || jsonb_build_object('slug', jsonb_build_object('from', old.slug, 'to', new.slug));
      end if;
      if changed = '{}'::jsonb then return new; end if;
      event_action := 'workspace.updated';
      event_details := jsonb_build_object('changed', changed);
    end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'staff_profiles' then
    event_target := new.user_id;
    if tg_op = 'INSERT' then
      event_action := 'staff_role.assigned';
      event_details := jsonb_build_object('role', new.role);
    elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
      event_action := 'staff_role.changed';
      event_details := jsonb_build_object('from', old.role, 'to', new.role);
    else
      return new;
    end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'workspace_memberships' then
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('user_id', new.user_id);
    if tg_op = 'INSERT' then
      event_action := 'membership.granted';
    elsif tg_op = 'UPDATE' and old.revoked_at is null and new.revoked_at is not null then
      event_action := 'membership.revoked';
    else
      return new;
    end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'recovery_link_issuances' then
    if tg_op <> 'INSERT' then return new; end if;
    event_action := 'recovery_link.generated';
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('target_user_id', new.target_user_id);
  elsif tg_table_schema = 'public' and tg_table_name = 'packages' then
    event_action := 'package.created';
    event_target := new.id;
    event_details := jsonb_build_object('code', new.code);
  elsif tg_table_schema = 'public' and tg_table_name = 'package_versions' then
    event_action := 'package_version.published';
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('offer_id', new.offer_id,
      'package_id', (select o.package_id from public.package_offers o where o.workspace_id = new.workspace_id and o.id = new.offer_id),
      'version', new.version, 'price_minor', new.price_minor::text, 'currency', new.currency,
      'commission_rate_bp', new.commission_rate_bp, 'duration_days', new.duration_days);
  elsif tg_table_schema = 'public' and tg_table_name = 'package_offers' then
    if tg_op <> 'UPDATE' or new.available is not distinct from old.available then return new; end if;
    event_action := 'package_offer.availability_changed';
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('available', new.available);
  elsif tg_table_schema = 'public' and tg_table_name = 'registration_links' then
    event_target := new.id;
    event_workspace := new.workspace_id;
    if tg_op = 'INSERT' then
      event_action := 'registration_link.issued';
      event_details := jsonb_build_object('package_version_id',new.package_version_id,
        'offer_id',(select v.offer_id from public.package_versions v where v.workspace_id=new.workspace_id and v.id=new.package_version_id),
        'installment_count',(select count(*) from public.registration_link_installments i where i.workspace_id=new.workspace_id and i.link_id=new.id),
        'price_minor',new.price_minor::text,'currency',new.currency);
    elsif old.opened_at is null and new.opened_at is not null then
      event_action := 'registration_link.opened';
    -- U3 consumption addition begin
    elsif old.consumed_at is null and new.consumed_at is not null then
      event_action := 'registration_link.consumed';
      event_details := jsonb_build_object('outcome_class','consumption','timestamp',new.consumed_at,'link_id',new.id,'workspace_id',new.workspace_id);
    -- U3 consumption addition end
    else return new;
    end if;
  -- U3 client addition begin
  elsif tg_table_schema = 'public' and tg_table_name = 'clients' then
    if tg_op <> 'INSERT' then return new; end if;
    event_action := 'client.signup_succeeded';
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('outcome_class','success','timestamp',new.created_at,'link_id',new.registration_link_id,'workspace_id',new.workspace_id);
  -- U3 client addition end
  elsif tg_table_schema = 'public' and tg_table_name = 'jobs' then
    if tg_op = 'UPDATE' and new.status = 'dead' and old.status is distinct from new.status then
      event_action := 'job.dead_lettered';
      event_target := new.id;
      event_workspace := new.workspace_id;
      event_details := jsonb_build_object('kind', new.kind, 'error', new.last_error, 'attempts', new.attempts);
    else
      return new;
    end if;
  else
    raise exception 'No audit mapping for %.%', tg_table_schema, tg_table_name;
  end if;

  insert into public.audit_events (actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), event_action, tg_table_name, event_target, event_workspace, event_details);
  return new;
end;
$$;
alter function app_private.audit_row_change() owner to postgres;
revoke execute on function app_private.audit_row_change() from public, anon, authenticated, service_role;


create trigger audit_client_signup after insert on public.clients for each row execute function app_private.audit_row_change();

create function public.client_signup(token text, request_secret text, admission_ticket uuid, fields jsonb)
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
  if exists(select 1 from jsonb_object_keys(fields) k where not required_fields ? k)
    or exists(select 1 from jsonb_array_elements_text(required_fields) k where jsonb_typeof(fields->k) is distinct from 'string' or length(btrim(fields->>k))=0) then
    return '{"status":"invalid"}'::jsonb;
  end if;
  if length(fields->>'password')<(policy->>'minimum_code_points')::integer
    or octet_length(fields->>'password')>(policy->>'maximum_utf8_bytes')::integer
    or (fields->>'password') !~ '[[:digit:]]'
    or not exists(select 1 from regexp_split_to_table(fields->>'password','') c where c ~ '[[:print:]]' and c !~ '[[:alpha:][:digit:][:space:]]') then
    return '{"status":"invalid"}'::jsonb;
  end if;
  begin
    select * into canonical from app_private.signup_identity_normalization(fields->>'email',fields->>'phone');
  exception when check_violation then
    if sqlerrm='unresolved_identifier' then return '{"status":"invalid"}'::jsonb; end if;
    raise;
  end;
  if canonical.email_key is null or canonical.phone_key is null then return '{"status":"invalid"}'::jsonb; end if;
  cost:=app_private.signup_bcrypt_cost();
  if cost is distinct from 10 then return '{"status":"unavailable"}'::jsonb; end if;
  -- Deliberately before ANY link/identity-state branching (including replay).
  password_hash:=extensions.crypt(fields->>'password',extensions.gen_salt('bf',cost));
  v_token_hash:=encode(extensions.digest(token,'sha256'),'hex');
  select * into link from public.registration_links l where l.token_hash=v_token_hash for update;
  sampled_at:=clock_timestamp();
  -- Vault absence is infrastructure, never a link-state result.
  select s.decrypted_secret into rate_key from vault.decrypted_secrets s where s.name='SIGNUP_RATE_KEY';
  if rate_key is null or rate_key !~ '^[0-9a-f]{64}$' then raise exception 'signup_unavailable' using errcode='55000'; end if;
  binding:=extensions.hmac(convert_to('lifter.f11.link.v1','UTF8')||decode('00','hex')||int4send(octet_length(v_token_hash))||convert_to(v_token_hash,'UTF8'),decode(rate_key,'hex'),'sha256');
  if not app_private.redeem_signup_admission_ticket(admission_ticket,binding,extensions.digest(request_secret,'sha256'),link.workspace_id,link.id) then
    return '{"status":"invalid"}'::jsonb;
  end if;
  begin
    if token is null or token !~ '^[A-Za-z0-9_-]{43}$' or request_secret is null or request_secret !~ '^[A-Za-z0-9_-]{43,}$'
      or link.id is null or link.consumed_at is not null or sampled_at>=link.expires_at then
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
    insert into public.clients(workspace_id,auth_user_id,registration_link_id,package_version_id,email_normalized,phone_e164,name)
    values(link.workspace_id,new_user,link.id,link.package_version_id,canonical.email_key,canonical.phone_key,fields->>'name') returning id into new_client;
    sampled_at:=clock_timestamp();
    update public.registration_links l set consumed_at=sampled_at
      where l.id=link.id and l.workspace_id=link.workspace_id and l.consumed_at is null and sampled_at<l.expires_at returning l.id into consumed;
    if consumed is null then raise exception 'signup_invalid' using errcode='P1100'; end if;
    insert into app_private.client_signup_operations(workspace_id,client_id,auth_user_id,registration_link_id,request_secret_hash)
      values(link.workspace_id,new_client,new_user,link.id,extensions.digest(request_secret,'sha256'));
    set constraints all immediate;
    return '{"status":"complete"}'::jsonb;
  exception when others then
    get stacked diagnostics constraint_name=CONSTRAINT_NAME,error_message=MESSAGE_TEXT;
    -- Positively identified business failures only. No diagnostics are logged,
    -- persisted, raised to the caller, or included in public return values.
    if not (sqlstate='P1100'
      or (sqlstate='23505' and constraint_name in ('account_identifier_claims_email_key_key','account_identifier_claims_phone_key_key',
        'clients_email_normalized_key','clients_phone_e164_key','clients_registration_link_id_key'))
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
  return '{"status":"invalid"}'::jsonb;
exception when others then
  return '{"status":"unavailable"}'::jsonb;
end;
$signup$;
alter function public.client_signup(text,text,uuid,jsonb) owner to postgres;
revoke all on function public.client_signup(text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.client_signup(text,text,uuid,jsonb) to anon,authenticated;
