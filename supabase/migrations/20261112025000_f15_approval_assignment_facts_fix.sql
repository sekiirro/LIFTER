-- S31-R1: disambiguate the policy variable while recording approval-consumer facts.
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
    values(p_workspace_id,assignment_policy_id,'initial',snapshot_at,array[p_client_id],selection.version_number,'onboarding',selection.selected_by)
    on conflict(workspace_id,policy_id,occurrence_key) do nothing;
  insert into public.form_assignments(workspace_id,client_id,form_id,version_number,terms_policy_version,policy_kind,version_snapshot,occurrence_key,audience_snapshot_at,client_deadline_at,policy_id,configured_by)
  select p_workspace_id,p_client_id,v.form_id,v.version_number,v.terms_policy_version,v.policy_kind,v.definition,'initial',snapshot_at,
    (((snapshot_at at time zone 'Africa/Cairo')::date+4)::timestamp at time zone 'Africa/Cairo')-interval '1 millisecond',assignment_policy_id,selection.selected_by
  from public.form_versions v where v.workspace_id=p_workspace_id and v.form_id=selection.form_id
    and v.version_number=selection.version_number and v.status='published'
  on conflict(workspace_id,client_id,form_id,occurrence_key) do nothing returning id into assignment;
  if assignment is null then select a.id into assignment from public.form_assignments a
    where a.workspace_id=p_workspace_id and a.client_id=p_client_id and a.form_id=selection.form_id
      and a.occurrence_key='initial'; end if;
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
