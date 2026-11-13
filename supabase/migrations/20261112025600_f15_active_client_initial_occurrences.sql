-- S33 T072: respect active-client audience and isolate each client initial occurrence.
create or replace function app_private.materialize_intake_assignment_occurrence_core(p_workspace_id uuid,p_form_id uuid,p_occurrence_key text,p_evaluation_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); role public.staff_role; policy app_private.form_assignment_policies%rowtype; latest_form_status text;
  snapshot_at timestamptz:=transaction_timestamp(); today date:=p_evaluation_date; service_start date; inserted integer:=0; deadline_days integer;
  client_ids uuid[]; assigned record; expected_key text; sub_id uuid;
begin
  if actor is null or p_workspace_id is null or p_form_id is null or p_occurrence_key is null or char_length(p_occurrence_key) not between 1 and 160 or p_evaluation_date is null or not isfinite(p_evaluation_date) then return '{"status":"not_found"}'::jsonb; end if;
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form') or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then return '{"status":"not_found"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('f15-form:'||p_workspace_id::text||':'||p_form_id::text,0));
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form') or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then raise exception 'assignment authorization changed while waiting'; end if;
  select v.status into latest_form_status from public.form_versions v
    where v.workspace_id=p_workspace_id and v.form_id=p_form_id
    order by v.version_number desc limit 1;
  if latest_form_status='retired' then return '{"status":"not_found"}'::jsonb; end if;
  select * into policy from app_private.form_assignment_policies p where p.workspace_id=p_workspace_id and p.form_id=p_form_id for update;
  if not found or not exists(select 1 from public.form_versions v where v.workspace_id=p_workspace_id and v.form_id=p_form_id and v.version_number=policy.version_number and v.status='published' and app_private.f15_current_terms_policy(v.terms_policy_version)) then return '{"status":"not_found"}'::jsonb; end if;
  if policy.trigger_kind='recurring' then
    expected_key:='recurring:'||today::text;
    if coalesce(policy.timing->>'recurrence_interval_days','') !~ '^[0-9]+$'
      or coalesce((policy.timing->>'recurrence_interval_days')::integer,0) not between 1 and 365
      or p_occurrence_key<>expected_key or today<(policy.timing->>'recurrence_starts_on')::date
      or mod(today-(policy.timing->>'recurrence_starts_on')::date,(policy.timing->>'recurrence_interval_days')::integer)<>0 then return '{"status":"not_found"}'::jsonb; end if;
  elsif policy.trigger_kind='renewal' then
    if p_occurrence_key !~ '^renewal:[0-9a-fA-F-]{36}$' then return '{"status":"not_found"}'::jsonb; end if;
    sub_id:=substring(p_occurrence_key from 9)::uuid;
    select coalesce((select d.service_start_date from public.subscription_renewal_date_revisions d
      where d.workspace_id=r.workspace_id and d.subscription_id=r.subscription_id order by d.revision desc limit 1),r.service_start_date)
      into service_start from public.subscription_renewals r where r.workspace_id=p_workspace_id and r.subscription_id=sub_id;
    if service_start is null or today<service_start then return '{"status":"not_found"}'::jsonb; end if;
  elsif policy.trigger_kind not in ('manual','joining','onboarding') then return '{"status":"not_found"}'::jsonb; end if;
  if exists(select 1 from app_private.form_assignment_occurrences o where o.workspace_id=p_workspace_id and o.policy_id=policy.id and o.occurrence_key=p_occurrence_key) then return jsonb_build_object('status','already_materialized','count',0); end if;
  deadline_days:=coalesce((policy.timing->>'client_deadline_days')::integer,3);
  if deadline_days not between 1 and 14 then return '{"status":"not_found"}'::jsonb; end if;
  select coalesce(array_agg(c.id order by c.id),'{}'::uuid[]) into client_ids
  from public.clients c where c.workspace_id=p_workspace_id and c.approval_state='approved' and c.deactivated_at is null
    and (policy.audience_kind='all_active_clients' or (policy.audience_kind='new_clients' and exists(select 1 from app_private.registration_approval_events a where a.workspace_id=c.workspace_id and a.client_id=c.id and a.approved_at>=policy.configured_at))
      or (policy.audience_kind='specific_clients' and c.id=any(policy.specific_client_ids)))
    and (policy.trigger_kind<>'renewal' or exists(select 1 from public.subscription_renewals r where r.workspace_id=c.workspace_id and r.client_id=c.id and r.subscription_id=sub_id))
    and exists(select 1 from public.subscriptions s where s.workspace_id=c.workspace_id and s.client_id=c.id and
      ((policy.trigger_kind='renewal' and s.id=sub_id
        and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='active'
        )
       or (policy.trigger_kind='recurring' and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='active')
       or (policy.trigger_kind in ('manual','joining','onboarding') and (app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='active'
         or (policy.trigger_kind in ('joining','onboarding') and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='future')
         or (policy.trigger_kind='manual' and policy.audience_kind='specific_clients' and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='future')))));
  insert into app_private.form_assignment_occurrences(workspace_id,policy_id,occurrence_key,snapshot_at,audience_client_ids,version_number,trigger_kind,created_by)
    values(p_workspace_id,policy.id,p_occurrence_key,snapshot_at,client_ids,policy.version_number,policy.trigger_kind,actor);
  for assigned in
    insert into public.form_assignments(workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot,occurrence_key,audience_snapshot_at,client_deadline_at,policy_id,configured_by)
    select p_workspace_id,c.id,p_form_id,v.version_number,v.terms_policy_version,v.definition,p_occurrence_key,snapshot_at,
      (((today+deadline_days+1)::timestamp at time zone 'Africa/Cairo')-interval '1 millisecond'),policy.id,actor
    from unnest(client_ids) c(id) join public.form_versions v on v.workspace_id=p_workspace_id and v.form_id=p_form_id and v.version_number=policy.version_number and v.status='published'
    on conflict(workspace_id,client_id,form_id,occurrence_key) do nothing returning id,client_id
  loop
    inserted:=inserted+1;
    insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
      values(actor,'form.assignment_occurrence_materialized','form_assignments',assigned.id,p_workspace_id,jsonb_build_object('client_id',assigned.client_id,'form_id',p_form_id,'occurrence_key',p_occurrence_key,'version_number',policy.version_number));
  end loop;
  return jsonb_build_object('status','materialized','count',inserted,'snapshot_at',snapshot_at);
exception when others then return '{"status":"not_found"}'::jsonb;
end $$;
alter function app_private.materialize_intake_assignment_occurrence_core(uuid,uuid,text,date) owner to postgres;
revoke all on function app_private.materialize_intake_assignment_occurrence_core(uuid,uuid,text,date) from public,anon,authenticated,service_role;
create or replace function app_private.reconcile_f15_form_assignment(
  p_workspace_id uuid,p_client_id uuid
) returns text language plpgsql security definer set search_path='' as $$
declare selection app_private.form_assignment_selections%rowtype; approved_subscription uuid; assignment uuid; assignment_policy_id uuid; snapshot_at timestamptz:=transaction_timestamp();
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
      and v.terms_policy_version=selection.terms_policy_version) then return 'stale_selection'; end if;
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
