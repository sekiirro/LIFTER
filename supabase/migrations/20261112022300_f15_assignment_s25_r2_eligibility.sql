-- S25-R2: onboarding membership is based on the authoritative F12 approval
-- fact, and future entitlements are allowed only for onboarding/joining or
-- explicit manual-client delivery. Recurrence/renewal are active-only.
create or replace function public.materialize_intake_assignment_occurrence(
  p_workspace_id uuid,p_form_id uuid,p_occurrence_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); role public.staff_role; policy app_private.form_assignment_policies%rowtype;
  snapshot_at timestamptz:=transaction_timestamp(); inserted integer; deadline_days integer; client_ids uuid[];
begin
  if actor is null or p_workspace_id is null or p_form_id is null or p_occurrence_key is null
    or char_length(p_occurrence_key) not between 1 and 160 then return '{"status":"not_found"}'::jsonb; end if;
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form')
    or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then return '{"status":"not_found"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text||':'||p_form_id::text,0));
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form')
    or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then
    raise exception 'assignment authorization changed while waiting'; end if;
  select * into policy from app_private.form_assignment_policies p
    where p.workspace_id=p_workspace_id and p.form_id=p_form_id for update;
  if not found or policy.trigger_kind not in ('manual','joining','onboarding')
    or not exists(select 1 from public.form_versions v where v.workspace_id=p_workspace_id and v.form_id=p_form_id
      and v.version_number=policy.version_number and v.status='published'
      and app_private.f15_current_terms_policy(v.terms_policy_version)) then return '{"status":"not_found"}'::jsonb; end if;
  if exists(select 1 from app_private.form_assignment_occurrences o where o.workspace_id=p_workspace_id
    and o.policy_id=policy.id and o.occurrence_key=p_occurrence_key) then
    return jsonb_build_object('status','already_materialized','count',0); end if;
  deadline_days:=coalesce((policy.timing->>'client_deadline_days')::integer,3);
  if deadline_days not between 1 and 14 then return '{"status":"not_found"}'::jsonb; end if;
  select coalesce(array_agg(c.id order by c.id),'{}'::uuid[]) into client_ids
  from public.clients c where c.workspace_id=p_workspace_id and c.approval_state='approved'
    and (policy.audience_kind='all_active_clients'
      or (policy.audience_kind='new_clients' and exists(select 1 from app_private.registration_approval_events a
        where a.workspace_id=c.workspace_id and a.client_id=c.id and a.approved_at>=policy.configured_at))
      or (policy.audience_kind='specific_clients' and c.id=any(policy.specific_client_ids)))
    and exists(select 1 from public.subscriptions s
      where s.workspace_id=c.workspace_id and s.client_id=c.id
        and (app_private.f13_project_entitlement(s.workspace_id,s.id,(snapshot_at at time zone 'Africa/Cairo')::date)->>'status'='active'
          or (policy.trigger_kind in ('joining','onboarding')
            and app_private.f13_project_entitlement(s.workspace_id,s.id,(snapshot_at at time zone 'Africa/Cairo')::date)->>'status'='future')
          or (policy.trigger_kind='manual' and policy.audience_kind='specific_clients'
            and app_private.f13_project_entitlement(s.workspace_id,s.id,(snapshot_at at time zone 'Africa/Cairo')::date)->>'status'='future')));
  insert into app_private.form_assignment_occurrences(workspace_id,policy_id,occurrence_key,snapshot_at,
    audience_client_ids,version_number,trigger_kind,created_by)
  values(p_workspace_id,policy.id,p_occurrence_key,snapshot_at,client_ids,policy.version_number,policy.trigger_kind,actor);
  insert into public.form_assignments(workspace_id,client_id,form_id,version_number,terms_policy_version,
    version_snapshot,occurrence_key,audience_snapshot_at,client_deadline_at,policy_id,configured_by)
  select p_workspace_id,c.id,p_form_id,v.version_number,v.terms_policy_version,v.definition,p_occurrence_key,snapshot_at,
    (((snapshot_at at time zone 'Africa/Cairo')::date+deadline_days+1)::timestamp at time zone 'Africa/Cairo')-interval '1 millisecond',
    policy.id,actor
  from unnest(client_ids) c(id) join public.form_versions v on v.workspace_id=p_workspace_id and v.form_id=p_form_id
    and v.version_number=policy.version_number and v.status='published'
  on conflict(workspace_id,client_id,form_id,occurrence_key) do nothing;
  get diagnostics inserted=row_count;
  if inserted>0 then insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(actor,'form.assignment_occurrence_materialized','form_assignments',null,p_workspace_id,
      jsonb_build_object('form_id',p_form_id,'occurrence_key',p_occurrence_key,'count',inserted)); end if;
  return jsonb_build_object('status','materialized','count',inserted,'snapshot_at',snapshot_at);
exception when others then return '{"status":"not_found"}'::jsonb;
end $$;
alter function public.materialize_intake_assignment_occurrence(uuid,uuid,text) owner to postgres;
revoke all on function public.materialize_intake_assignment_occurrence(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.materialize_intake_assignment_occurrence(uuid,uuid,text) to authenticated;
