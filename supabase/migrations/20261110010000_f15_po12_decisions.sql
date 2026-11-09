-- S41-PO-12: preserve stale F15 selections, bound client-late catch-up, reject empty compact usernames.

create table app_private.form_assignment_selection_history (
  history_id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null, client_id uuid not null, form_id uuid not null,
  version_number integer not null, terms_policy_version text not null,
  policy_kind text not null default 'terms' check(policy_kind='terms'),
  selected_by uuid not null, selected_at timestamptz not null,
  archived_at timestamptz not null default clock_timestamp(),
  archive_reason text not null check(archive_reason='stale_terms_replacement'),
  foreign key(workspace_id,client_id) references public.clients(workspace_id,id) on delete restrict,
  foreign key(workspace_id,form_id,version_number) references public.form_versions(workspace_id,form_id,version_number) on delete restrict,
  foreign key(terms_policy_version,policy_kind) references app_private.terms_policy_versions(version,policy_kind) on delete restrict
);
alter table app_private.form_assignment_selection_history enable row level security;
alter table app_private.form_assignment_selection_history force row level security;
revoke all on app_private.form_assignment_selection_history from public,anon,authenticated,service_role;

create function app_private.archive_f15_selection_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if current_user <> 'postgres' or new.workspace_id<>old.workspace_id or new.client_id<>old.client_id
    or new.form_id<>old.form_id or new.selected_by<>old.selected_by
    or not app_private.f15_current_terms_policy(new.terms_policy_version) then
    raise exception 'immutable_form_assignment_selection' using errcode='23514';
  end if;
  insert into app_private.form_assignment_selection_history(
    workspace_id,client_id,form_id,version_number,terms_policy_version,policy_kind,selected_by,selected_at,archive_reason
  ) values(old.workspace_id,old.client_id,old.form_id,old.version_number,old.terms_policy_version,old.policy_kind,old.selected_by,old.selected_at,'stale_terms_replacement');
  return new;
end
$$;
alter function app_private.archive_f15_selection_update() owner to postgres;
revoke all on function app_private.archive_f15_selection_update() from public,anon,authenticated,service_role;
drop trigger if exists form_assignment_selections_immutable on app_private.form_assignment_selections;
create trigger form_assignment_selections_no_delete before delete on app_private.form_assignment_selections
  for each row execute function app_private.guard_f15_assignment_fact();
create trigger form_assignment_selections_archive_update before update on app_private.form_assignment_selections
  for each row execute function app_private.archive_f15_selection_update();
create trigger form_assignment_selection_history_immutable before update or delete on app_private.form_assignment_selection_history
  for each row execute function app_private.guard_f15_assignment_fact();

create or replace function app_private.reconcile_f15_form_assignment(
  p_workspace_id uuid,p_client_id uuid
) returns text language plpgsql security definer set search_path='' as $$
declare selection app_private.form_assignment_selections%rowtype; approved_subscription uuid; assignment uuid; assignment_policy_id uuid; current_version integer; current_terms text; snapshot_at timestamptz:=transaction_timestamp();
begin
  if p_workspace_id is null or p_client_id is null then return 'invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text||':'||p_client_id::text,0));
  select s.* into selection from app_private.form_assignment_selections s
    where s.workspace_id=p_workspace_id and s.client_id=p_client_id;
  if not found then return 'waiting_for_selection'; end if;
  select a.subscription_id into approved_subscription from app_private.registration_approval_events a
    where a.workspace_id=p_workspace_id and a.client_id=p_client_id order by a.approved_at,a.id limit 1;
  if not found then return 'waiting_for_approval'; end if;
  if exists(select 1 from app_private.form_assignment_consumptions c
    where c.workspace_id=p_workspace_id and c.client_id=p_client_id and c.form_id=selection.form_id)
    then return 'already_assigned'; end if;
  if not app_private.f15_current_terms_policy(selection.terms_policy_version)
    or not exists(select 1 from public.form_versions v where v.workspace_id=p_workspace_id
      and v.form_id=selection.form_id and v.version_number=selection.version_number and v.status='published'
      and v.terms_policy_version=selection.terms_policy_version) then
    select v.version_number,v.terms_policy_version into current_version,current_terms
    from public.form_versions v
    join app_private.terms_policy_versions tp on tp.version=v.terms_policy_version and tp.policy_kind='terms'
    where v.workspace_id=p_workspace_id and v.form_id=selection.form_id and v.status='published'
      and app_private.f15_current_terms_policy(v.terms_policy_version)
    order by tp.created_at desc,tp.version desc,v.version_number desc limit 1;
    if not found then return 'stale_selection'; end if;
    update app_private.form_assignment_selections
      set version_number=current_version,terms_policy_version=current_terms,selected_at=clock_timestamp()
      where workspace_id=p_workspace_id and client_id=p_client_id;
    select s.* into selection from app_private.form_assignment_selections s
      where s.workspace_id=p_workspace_id and s.client_id=p_client_id;
  end if;
  insert into app_private.form_assignment_policies(workspace_id,form_id,version_number,audience_kind,specific_client_ids,trigger_kind,timing,stop_conditions,configured_by)
  values(p_workspace_id,selection.form_id,selection.version_number,'specific_clients',array[p_client_id],'onboarding','{"client_deadline_days":3}'::jsonb,'{"frozen":true,"inactive":true}'::jsonb,selection.selected_by)
  on conflict(workspace_id,form_id) do nothing;
  select p.id into assignment_policy_id from app_private.form_assignment_policies p
    where p.workspace_id=p_workspace_id and p.form_id=selection.form_id;
  if assignment_policy_id is null then return 'unavailable'; end if;
  insert into app_private.form_assignment_occurrences(workspace_id,policy_id,occurrence_key,snapshot_at,audience_client_ids,version_number,trigger_kind,created_by)
    values(p_workspace_id,assignment_policy_id,'initial:'||p_client_id::text,snapshot_at,array[p_client_id],selection.version_number,'onboarding',selection.selected_by)
    on conflict(workspace_id,policy_id,occurrence_key) do nothing;
  insert into public.form_assignments(workspace_id,client_id,form_id,version_number,terms_policy_version,policy_kind,version_snapshot,occurrence_key,audience_snapshot_at,client_deadline_at,policy_id,configured_by)
  select p_workspace_id,p_client_id,v.form_id,v.version_number,v.terms_policy_version,v.policy_kind,v.definition,'initial:'||p_client_id::text,snapshot_at,
    (((snapshot_at at time zone 'Africa/Cairo')::date+4)::timestamp at time zone 'Africa/Cairo')-interval '1 millisecond',assignment_policy_id,selection.selected_by
  from public.form_versions v where v.workspace_id=p_workspace_id and v.form_id=selection.form_id
    and v.version_number=selection.version_number and v.status='published'
  on conflict(workspace_id,client_id,form_id,occurrence_key) do nothing returning id into assignment;
  if assignment is null then select a.id into assignment from public.form_assignments a
    where a.workspace_id=p_workspace_id and a.client_id=p_client_id and a.form_id=selection.form_id
      and a.occurrence_key='initial:'||p_client_id::text; end if;
  if assignment is null then return 'unavailable'; end if;
  insert into app_private.form_assignment_consumptions(workspace_id,client_id,form_id,subscription_id,assignment_id)
    values(p_workspace_id,p_client_id,selection.form_id,approved_subscription,assignment)
    on conflict(workspace_id,client_id,form_id) do nothing;
  if found then
    insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(selection.selected_by,'form.assignment_created','form_assignments',assignment,p_workspace_id,
      jsonb_build_object('client_id',p_client_id,'form_id',selection.form_id,
        'version_number',selection.version_number,'subscription_id',approved_subscription));
    return 'assigned';
  end if;
  return 'already_assigned';
end $$;
alter function app_private.reconcile_f15_form_assignment(uuid,uuid) owner to postgres;
revoke all on function app_private.reconcile_f15_form_assignment(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function app_private.evaluate_forms_alerts_core(
  p_evaluation_at timestamptz,p_workspace_id uuid,p_batch integer default 250
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  schedule_row record;
  stage_row record;
  recipient_row record;
  occurrence_id uuid;
  enqueued integer := 0;
  catch_up_until timestamptz;
begin
  if p_evaluation_at is null or p_batch is null or p_batch < 1 or p_batch > 1000 then
    return jsonb_build_object('status','invalid_input');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(11011,318);

  for schedule_row in
    select s.* from app_private.form_alert_schedules s
    where (p_workspace_id is null or s.workspace_id=p_workspace_id)
      and s.deadline_at <= p_evaluation_at
      and (s.alert_kind <> 'client_late' or s.deadline_at + interval '7 days' >= p_evaluation_at)
      and (s.alert_kind <> 'client_late' or not exists (
        select 1 from app_private.form_alert_occurrences legacy
        where legacy.workspace_id=s.workspace_id and legacy.schedule_id=s.id
          and legacy.stage in ('client_owners_24h','client_owners_48h')
      ))
      and (s.alert_kind <> 'client_late' or app_private.f15_client_alert_lifecycle_active(s.workspace_id,s.source_assignment_id))
      and (
        (s.alert_kind='client_late'
          and not exists (
            select 1 from app_private.form_submissions fs
            where fs.workspace_id=s.workspace_id and fs.assignment_id=s.source_assignment_id
          )
        )
        and not (
          s.alert_kind='client_late'
          and not exists (
            select 1 from public.staff_profiles sp
            where (
              (sp.role='platform_owner'::public.staff_role and exists (select 1 from public.workspaces w where w.id=s.workspace_id and w.created_by=sp.user_id))
              or (sp.role='workspace_owner'::public.staff_role and exists (select 1 from public.workspace_memberships wm where wm.workspace_id=s.workspace_id and wm.user_id=sp.user_id and wm.revoked_at is null))
            )
            and not exists (
              select 1 from app_private.form_alert_occurrences o
              where o.workspace_id=s.workspace_id and o.schedule_id=s.id and o.stage='client_owners_immediate' and o.recipient_user_id=sp.user_id
            )
          )
        )
        or (s.alert_kind='trainer_late'
          and (s.delivered_at is null or s.delivered_at > p_evaluation_at)
          and s.deadline_at + interval '7 days' >= p_evaluation_at)
      )
    and (
      s.alert_kind <> 'trainer_late'
      or (
        s.deadline_at <= p_evaluation_at
        and s.trainer_user_id is not null
        and exists (
          select 1 from public.staff_profiles trainer
          join public.workspace_memberships membership
            on membership.workspace_id=s.workspace_id
            and membership.user_id=trainer.user_id and membership.revoked_at is null
          where trainer.user_id=s.trainer_user_id and trainer.role='trainer'::public.staff_role
        )
        and not exists (
          select 1 from app_private.form_alert_occurrences occurrence
          where occurrence.workspace_id=s.workspace_id and occurrence.schedule_id=s.id
            and occurrence.stage='trainer_initial'
            and occurrence.recipient_user_id=s.trainer_user_id
        )
      )
      or (
        s.deadline_at + interval '24 hours' <= p_evaluation_at
        and exists (
          select 1 from public.staff_profiles owner_profile
          where (
            (owner_profile.role='platform_owner'::public.staff_role and exists (
              select 1 from public.workspaces owner_workspace
              where owner_workspace.id=s.workspace_id and owner_workspace.created_by=owner_profile.user_id
            ))
            or (owner_profile.role='workspace_owner'::public.staff_role and exists (
              select 1 from public.workspace_memberships owner_membership
              where owner_membership.workspace_id=s.workspace_id
                and owner_membership.user_id=owner_profile.user_id and owner_membership.revoked_at is null
            ))
          )
          and not exists (
            select 1 from app_private.form_alert_occurrences occurrence
            where occurrence.workspace_id=s.workspace_id and occurrence.schedule_id=s.id
              and occurrence.stage='trainer_owners_24h'
              and occurrence.recipient_user_id=owner_profile.user_id
          )
        )
      )
    )
    order by s.deadline_at,s.id
    limit p_batch
    for update of s skip locked
  loop
    catch_up_until := schedule_row.deadline_at + interval '7 days';
    if schedule_row.alert_kind='client_late' then
      perform 1 from public.workspace_memberships wm
      join public.staff_profiles sp on sp.user_id=wm.user_id
      where wm.workspace_id=schedule_row.workspace_id and wm.revoked_at is null
        and sp.role='workspace_owner'::public.staff_role
      order by wm.user_id
      for update of wm;
    end if;
    for stage_row in
      select stage,stage_at from (
        select 'client_owners_immediate'::text as stage,
          schedule_row.deadline_at as stage_at
        where schedule_row.alert_kind='client_late'
        union all
        select 'trainer_initial',schedule_row.deadline_at
        where schedule_row.alert_kind='trainer_late'
          and schedule_row.trainer_user_id is not null
          and p_evaluation_at <= catch_up_until
        union all
        select 'trainer_owners_24h',schedule_row.deadline_at + interval '24 hours'
        where schedule_row.alert_kind='trainer_late'
          and p_evaluation_at <= catch_up_until
      ) stages
      where stage_at <= p_evaluation_at
      order by stage_at,stage
    loop
      for recipient_row in
        select sp.user_id
        from public.staff_profiles sp
        where (
          stage_row.stage='trainer_initial'
          and sp.user_id=schedule_row.trainer_user_id
          and sp.role='trainer'::public.staff_role
          and exists (
            select 1 from public.workspace_memberships wm
            where wm.workspace_id=schedule_row.workspace_id
              and wm.user_id=sp.user_id and wm.revoked_at is null
          )
        ) or (
          stage_row.stage in ('client_owners_immediate','trainer_owners_24h')
          and (
            (sp.role='platform_owner'::public.staff_role and exists (
              select 1 from public.workspaces w
              where w.id=schedule_row.workspace_id and w.created_by=sp.user_id
            ))
            or (sp.role='workspace_owner'::public.staff_role and exists (
              select 1 from public.workspace_memberships wm
              where wm.workspace_id=schedule_row.workspace_id
                and wm.user_id=sp.user_id and wm.revoked_at is null
            ))
          )
        )
        order by sp.user_id
      loop
        if schedule_row.alert_kind='client_late' and (
          not app_private.f15_client_alert_lifecycle_active(schedule_row.workspace_id,schedule_row.source_assignment_id)
          or exists (
          select 1 from app_private.form_submissions fs
          where fs.workspace_id=schedule_row.workspace_id
            and fs.assignment_id=schedule_row.source_assignment_id
          )
        ) then
          continue;
        end if;
        if schedule_row.alert_kind='trainer_late'
          and schedule_row.delivered_at is not null
          and schedule_row.delivered_at <= p_evaluation_at then
          continue;
        end if;
        insert into app_private.form_alert_occurrences(
          workspace_id,schedule_id,stage,recipient_user_id,job_id,enqueued_at
        ) values (
          schedule_row.workspace_id,schedule_row.id,stage_row.stage,
          recipient_row.user_id,null,p_evaluation_at
        ) on conflict (workspace_id,schedule_id,stage,recipient_user_id) do nothing
        returning id into occurrence_id;
        if occurrence_id is null then continue; end if;
        update app_private.form_alert_occurrences o
        set job_id=app_private.enqueue_job(
          'forms.alert',schedule_row.workspace_id,
          jsonb_build_object(
            'alert_id',o.id,'recipient_id',recipient_row.user_id,'stage',stage_row.stage
          ),
          format('f15-alert:%s:%s:%s',schedule_row.id,stage_row.stage,recipient_row.user_id),
          p_evaluation_at,5
        )
        where o.id=occurrence_id;
        insert into public.audit_events(
          actor_user_id,action,target_table,target_id,workspace_id,details
        ) values (
          null,'form.alert_enqueued','form_alert_occurrences',occurrence_id,
          schedule_row.workspace_id,
          jsonb_build_object('schedule_id',schedule_row.id,'stage',stage_row.stage,
            'recipient_id',recipient_row.user_id)
        );
        enqueued := enqueued + 1;
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('status','ok','enqueued',enqueued);
exception when others then
  raise exception 'f15_alert_evaluation_failed' using errcode='P0001';
end
$$;
alter function app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer) owner to postgres;
revoke all on function app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer) from public,anon,authenticated,service_role;
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
  if normalized_username !~ '^[a-z0-9_.]{3,30}$' then return '{"status":"invalid"}'::jsonb; end if;
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
