-- F14 R11: extend the final F11/F12 mapping with the immutable publication event.
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
  -- F12 extension begin
  elsif tg_table_schema = 'public' and tg_table_name = 'clients' and tg_op = 'UPDATE' then
    event_target := new.id;
    event_workspace := new.workspace_id;
    select case d.kind when 'approve' then 'client.approved' when 'reject' then 'client.rejected' when 'reconsider' then 'client.reconsidered' end,
      jsonb_strip_nulls(jsonb_build_object('decision_id',d.id,'client_id',new.id,'from_state',old.approval_state,'to_state',new.approval_state,'reason_code',d.rejection_reason_code))
      into event_action,event_details
      from app_private.registration_decisions d where d.workspace_id=new.workspace_id and d.client_id=new.id
        and d.transaction_id=pg_current_xact_id() and d.actor_user_id=auth.uid() and d.from_state=old.approval_state and d.to_state=new.approval_state;
    if not found then raise exception 'invalid_client_transition' using errcode='23514'; end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'payment_events' then
    if tg_op <> 'INSERT' then return new; end if;
    event_action := case new.kind when 'collection' then 'payment.collected' when 'correction_reversal' then 'payment.collection_corrected' end;
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('client_id',(select s.client_id from public.subscriptions s where s.workspace_id=new.workspace_id and s.id=new.subscription_id),
      'subscription_id',new.subscription_id,'obligation_id',new.obligation_id,'event_id',new.id,
      'installment_seq',new.installment_seq,'revision',new.revision,'amount_minor',new.amount_minor::text,
      'currency',new.currency,'collected_on',new.collected_on,'effective_on',new.effective_on,'recorded_at',new.recorded_at);
  -- F14 publication event extension begin
  elsif tg_table_schema = 'app_private' and tg_table_name = 'branding_published_versions' then
    if tg_op <> 'INSERT' then return new; end if;
    event_action := 'branding.published';
    event_target := new.id;
    event_workspace := new.workspace_id;
    event_details := jsonb_build_object('sequence', new.sequence);
  -- F14 publication event extension end
  -- F12 extension end
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

create trigger audit_branding_publication after insert on app_private.branding_published_versions
  for each row execute function app_private.audit_row_change();

-- Keep the existing workspace draft lock and CAS; the version trigger owns audit insertion.
grant create on schema app_private to branding_definer;
grant branding_definer to postgres;
set role branding_definer;
create or replace function app_private.branding_publish(workspace_id uuid,expected_revision bigint)
returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare d app_private.branding_drafts%rowtype; current_row app_private.branding_current_publications%rowtype;
  version_id uuid; next_sequence bigint; key text; actor_id uuid:=app_private.branding_actor_id();
begin
  if current_setting('role',true) is distinct from 'authenticated' or actor_id is null
    or not app_private.has_workspace_access(workspace_id,'manage_branding') then
    raise exception using errcode='42501',message='not_permitted';
  end if;
  select * into d from app_private.branding_drafts where workspace_id=branding_publish.workspace_id for update;
  if not found or d.revision<>expected_revision then raise exception using errcode='40001',message='stale_branding_revision'; end if;
  for key in select unnest(array['logo','banner']) loop
    if jsonb_typeof(d.fields->key)='object' then
      perform app_private.branding_gc_lock_object(d.fields->key->>'bucket',d.fields->key->>'object');
      if exists(select 1 from app_private.branding_gc_claims g where g.bucket_id=d.fields->key->>'bucket'
          and g.object_name=d.fields->key->>'object') then
        raise exception using errcode='40001',message='branding_deletion_in_progress';
      end if;
    end if;
  end loop;
  if exists(select 1 from app_private.branding_gc_claims g where g.workspace_id=d.workspace_id) then
    raise exception using errcode='40001',message='branding_deletion_in_progress';
  end if;
  if coalesce(d.fields#>>'{name,ar}','')='' and coalesce(d.fields#>>'{name,en}','')='' then
    raise exception using errcode='22023',message='branding_name_required';
  end if;
  select * into current_row from app_private.branding_current_publications c where c.workspace_id=d.workspace_id for update;
  if found and exists(select 1 from app_private.branding_published_versions v where v.workspace_id=current_row.workspace_id
    and v.id=current_row.version_id and v.fields=d.fields) then return current_row.version_id; end if;
  select coalesce(max(v.sequence),0)+1 into next_sequence from app_private.branding_published_versions v where v.workspace_id=d.workspace_id;
  version_id:=extensions.gen_random_uuid();
  insert into app_private.branding_published_versions(workspace_id,id,sequence,fields,published_by,published_at)
    values(d.workspace_id,version_id,next_sequence,d.fields,actor_id,statement_timestamp());
  for key in select unnest(array['logo','banner']) loop
    if jsonb_typeof(d.fields->key)='object' then
      insert into app_private.branding_published_assets(workspace_id,version_id,slot,bucket_id,object_name,content_type,byte_size)
        values(d.workspace_id,version_id,key,d.fields->key->>'bucket',d.fields->key->>'object',
          d.fields->key->>'content_type',(d.fields->key->>'byte_size')::bigint);
    end if;
  end loop;
  insert into app_private.branding_current_publications(workspace_id,version_id) values(d.workspace_id,version_id)
    on conflict(workspace_id) do update set version_id=excluded.version_id;
  return version_id;
end;
$$;
reset role;
revoke branding_definer from postgres;
revoke create on schema app_private from branding_definer;
