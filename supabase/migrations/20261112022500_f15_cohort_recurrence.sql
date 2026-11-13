-- B2: bounded Cairo-date recurrence and F13 service-start delivery.
-- The caller is an authorized staff operator; activating a scheduled worker
-- remains the separate owner-only T017 gate.
create or replace function public.configure_intake_assignment_policy(
  p_workspace_id uuid,p_form_id uuid,p_version_number integer,p_audience_kind text,
  p_specific_client_ids uuid[],p_trigger_kind text,p_timing jsonb,p_stop_conditions jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); role public.staff_role; result uuid; ids uuid[]:=coalesce(p_specific_client_ids,'{}');
begin
  if actor is null or p_workspace_id is null or p_form_id is null or p_version_number is null then return '{"status":"not_found"}'::jsonb; end if;
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form') or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then return '{"status":"not_found"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text||':'||p_form_id::text,0));
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form') or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then raise exception 'assignment policy authorization changed while waiting'; end if;
  if p_audience_kind not in ('all_active_clients','new_clients','specific_clients') or p_trigger_kind not in ('manual','joining','onboarding','renewal','recurring')
    or p_timing is null or jsonb_typeof(p_timing)<>'object' or coalesce(p_stop_conditions,'{}'::jsonb)<>'{"frozen":true,"inactive":true}'::jsonb
    or ((p_audience_kind='specific_clients')<>(cardinality(ids)>0))
    or (p_timing ? 'client_deadline_days' and (p_timing->>'client_deadline_days') !~ '^[0-9]+$')
    or coalesce((p_timing->>'client_deadline_days')::integer,3) not between 1 and 14
    or (p_trigger_kind='recurring' and ((p_timing->>'recurrence_interval_days') !~ '^[0-9]+$'
       or (p_timing->>'recurrence_interval_days')::integer not between 1 and 365 or (p_timing->>'recurrence_starts_on') is null
       or (p_timing->>'recurrence_starts_on')::date is null))
    or (p_trigger_kind<>'recurring' and p_timing ? 'recurrence_interval_days')
    or exists(select 1 from unnest(ids) x where not exists(select 1 from public.clients c where c.workspace_id=p_workspace_id and c.id=x and c.approval_state='approved'))
    or not exists(select 1 from public.form_versions v where v.workspace_id=p_workspace_id and v.form_id=p_form_id and v.version_number=p_version_number and v.status='published' and app_private.f15_current_terms_policy(v.terms_policy_version)) then
    return '{"status":"not_found"}'::jsonb;
  end if;
  insert into app_private.form_assignment_policies(workspace_id,form_id,version_number,audience_kind,specific_client_ids,trigger_kind,timing,stop_conditions,configured_by)
  values(p_workspace_id,p_form_id,p_version_number,p_audience_kind,ids,p_trigger_kind,p_timing,'{"frozen":true,"inactive":true}'::jsonb,actor)
  on conflict(workspace_id,form_id) do update set version_number=excluded.version_number,audience_kind=excluded.audience_kind,specific_client_ids=excluded.specific_client_ids,
    trigger_kind=excluded.trigger_kind,timing=excluded.timing,stop_conditions=excluded.stop_conditions,configured_by=excluded.configured_by,updated_at=transaction_timestamp()
  returning id into result;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details) values(actor,'form.assignment_policy_configured','form_assignment_policies',result,p_workspace_id,
    jsonb_build_object('form_id',p_form_id,'version_number',p_version_number,'audience_kind',p_audience_kind,'trigger_kind',p_trigger_kind));
  return jsonb_build_object('status','configured');
exception when others then return '{"status":"not_found"}'::jsonb;
end $$;
alter function public.configure_intake_assignment_policy(uuid,uuid,integer,text,uuid[],text,jsonb,jsonb) owner to postgres;
revoke all on function public.configure_intake_assignment_policy(uuid,uuid,integer,text,uuid[],text,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.configure_intake_assignment_policy(uuid,uuid,integer,text,uuid[],text,jsonb,jsonb) to authenticated;

create or replace function public.materialize_intake_assignment_occurrence(p_workspace_id uuid,p_form_id uuid,p_occurrence_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); role public.staff_role; policy app_private.form_assignment_policies%rowtype;
  snapshot_at timestamptz:=transaction_timestamp(); today date; yesterday date; inserted integer:=0; deadline_days integer;
  client_ids uuid[]; assigned record; expected_key text; sub_id uuid;
begin
  if actor is null or p_workspace_id is null or p_form_id is null or p_occurrence_key is null or char_length(p_occurrence_key) not between 1 and 160 then return '{"status":"not_found"}'::jsonb; end if;
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form') or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then return '{"status":"not_found"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text||':'||p_form_id::text,0));
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form') or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then raise exception 'assignment authorization changed while waiting'; end if;
  select * into policy from app_private.form_assignment_policies p where p.workspace_id=p_workspace_id and p.form_id=p_form_id for update;
  if not found or not exists(select 1 from public.form_versions v where v.workspace_id=p_workspace_id and v.form_id=p_form_id and v.version_number=policy.version_number and v.status='published' and app_private.f15_current_terms_policy(v.terms_policy_version)) then return '{"status":"not_found"}'::jsonb; end if;
  today:=(snapshot_at at time zone 'Africa/Cairo')::date; yesterday:=today-1;
  if policy.trigger_kind='recurring' then
    expected_key:='recurring:'||today::text;
    if p_occurrence_key<>expected_key or today<(policy.timing->>'recurrence_starts_on')::date
      or mod(today-(policy.timing->>'recurrence_starts_on')::date,(policy.timing->>'recurrence_interval_days')::integer)<>0 then return '{"status":"not_found"}'::jsonb; end if;
  elsif policy.trigger_kind='renewal' then
    if p_occurrence_key !~ '^renewal:[0-9a-fA-F-]{36}$' then return '{"status":"not_found"}'::jsonb; end if;
    sub_id:=substring(p_occurrence_key from 9)::uuid;
  elsif policy.trigger_kind not in ('manual','joining','onboarding') then return '{"status":"not_found"}'::jsonb; end if;
  if exists(select 1 from app_private.form_assignment_occurrences o where o.workspace_id=p_workspace_id and o.policy_id=policy.id and o.occurrence_key=p_occurrence_key) then return jsonb_build_object('status','already_materialized','count',0); end if;
  deadline_days:=coalesce((policy.timing->>'client_deadline_days')::integer,3);
  if deadline_days not between 1 and 14 then return '{"status":"not_found"}'::jsonb; end if;
  select coalesce(array_agg(c.id order by c.id),'{}'::uuid[]) into client_ids
  from public.clients c where c.workspace_id=p_workspace_id and c.approval_state='approved'
    and (policy.audience_kind='all_active_clients' or (policy.audience_kind='new_clients' and exists(select 1 from app_private.registration_approval_events a where a.workspace_id=c.workspace_id and a.client_id=c.id and a.approved_at>=policy.configured_at))
      or (policy.audience_kind='specific_clients' and c.id=any(policy.specific_client_ids)))
    and (policy.trigger_kind<>'renewal' or exists(select 1 from public.subscription_renewals r where r.workspace_id=c.workspace_id and r.client_id=c.id and r.subscription_id=sub_id))
    and exists(select 1 from public.subscriptions s where s.workspace_id=c.workspace_id and s.client_id=c.id and
      ((policy.trigger_kind='renewal' and s.id=sub_id
        and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='active'
        and app_private.f13_project_entitlement(s.workspace_id,s.id,yesterday)->>'status'='future')
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
alter function public.materialize_intake_assignment_occurrence(uuid,uuid,text) owner to postgres;
revoke all on function public.materialize_intake_assignment_occurrence(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.materialize_intake_assignment_occurrence(uuid,uuid,text) to authenticated;
