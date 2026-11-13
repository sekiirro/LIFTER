-- F15 per-form policy and occurrence snapshots. Scheduler activation remains
-- a separate owner-only operational gate (T017).
create table app_private.form_assignment_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  form_id uuid not null,
  version_number integer not null,
  audience_kind text not null check (audience_kind in ('all_active_clients','new_clients','specific_clients')),
  specific_client_ids uuid[] not null default '{}',
  trigger_kind text not null check (trigger_kind in ('manual','joining','onboarding','renewal','recurring')),
  timing jsonb not null default '{}'::jsonb check (jsonb_typeof(timing)='object'),
  stop_conditions jsonb not null default '{"frozen":true,"inactive":true}'::jsonb
    check (jsonb_typeof(stop_conditions)='object' and stop_conditions->>'frozen'='true'
      and stop_conditions->>'inactive'='true'),
  configured_by uuid not null references auth.users(id) on delete restrict,
  configured_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  unique (workspace_id, form_id), unique (workspace_id, id),
  foreign key (workspace_id, form_id, version_number)
    references public.form_versions(workspace_id, form_id, version_number) on delete restrict,
  check ((audience_kind='specific_clients') = (cardinality(specific_client_ids)>0))
);
alter table app_private.form_assignment_policies enable row level security;
alter table app_private.form_assignment_policies force row level security;
revoke all on app_private.form_assignment_policies from public, anon, authenticated, service_role;

alter table public.form_assignments
  add column occurrence_key text not null default 'initial' check (char_length(occurrence_key) between 1 and 160),
  add column audience_snapshot_at timestamptz not null default transaction_timestamp(),
  add column client_deadline_at timestamptz,
  add column policy_id uuid,
  add column configured_by uuid references auth.users(id) on delete restrict;
alter table public.form_assignments drop constraint form_assignments_workspace_id_client_id_form_id_key;
alter table public.form_assignments add constraint form_assignments_occurrence_unique
  unique (workspace_id, client_id, form_id, occurrence_key);
alter table public.form_assignments add constraint form_assignments_policy_scope_fk
  foreign key (workspace_id, policy_id) references app_private.form_assignment_policies(workspace_id, id) on delete restrict;

create table app_private.form_assignment_occurrences (
  workspace_id uuid not null,
  policy_id uuid not null,
  occurrence_key text not null check (char_length(occurrence_key) between 1 and 160),
  snapshot_at timestamptz not null,
  audience_client_ids uuid[] not null,
  version_number integer not null,
  trigger_kind text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  primary key (workspace_id, policy_id, occurrence_key),
  foreign key (workspace_id, policy_id) references app_private.form_assignment_policies(workspace_id,id) on delete restrict
);
alter table app_private.form_assignment_occurrences enable row level security;
alter table app_private.form_assignment_occurrences force row level security;
revoke all on app_private.form_assignment_occurrences from public,anon,authenticated,service_role;
create trigger form_assignment_occurrences_immutable before update or delete
  on app_private.form_assignment_occurrences for each row execute function app_private.guard_f15_assignment_fact();

create function public.configure_intake_assignment_policy(
  p_workspace_id uuid,p_form_id uuid,p_version_number integer,p_audience_kind text,
  p_specific_client_ids uuid[],p_trigger_kind text,p_timing jsonb,p_stop_conditions jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); role public.staff_role; result uuid; ids uuid[]:=coalesce(p_specific_client_ids,'{}');
begin
  if actor is null or p_workspace_id is null or p_form_id is null or p_version_number is null then
    return '{"status":"not_found"}'::jsonb;
  end if;
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form')
    or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then
    return '{"status":"not_found"}'::jsonb;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text||':'||p_form_id::text,0));
  role:=app_private.current_staff_role();
  if role is null or not app_private.role_has_capability(role,'assign_intake_form')
    or not app_private.has_workspace_access(p_workspace_id,'assign_intake_form') then
    raise exception 'assignment policy authorization changed while waiting';
  end if;
  if p_audience_kind not in ('all_active_clients','new_clients','specific_clients')
    or p_trigger_kind not in ('manual','joining','onboarding','renewal','recurring')
    or p_timing is null or jsonb_typeof(p_timing)<>'object'
    or coalesce(p_stop_conditions,'{}'::jsonb)<>'{"frozen":true,"inactive":true}'::jsonb
    or ((p_audience_kind='specific_clients')<>(cardinality(ids)>0))
    or exists(select 1 from unnest(ids) x where not exists(select 1 from public.clients c
      where c.workspace_id=p_workspace_id and c.id=x and c.approval_state='approved'))
    or not exists(select 1 from public.form_versions v where v.workspace_id=p_workspace_id and v.form_id=p_form_id
      and v.version_number=p_version_number and v.status='published'
      and app_private.f15_current_terms_policy(v.terms_policy_version)) then
    return '{"status":"not_found"}'::jsonb;
  end if;
  insert into app_private.form_assignment_policies(workspace_id,form_id,version_number,audience_kind,
    specific_client_ids,trigger_kind,timing,stop_conditions,configured_by)
  values(p_workspace_id,p_form_id,p_version_number,p_audience_kind,ids,p_trigger_kind,p_timing,
    '{"frozen":true,"inactive":true}'::jsonb,actor)
  on conflict(workspace_id,form_id) do update set version_number=excluded.version_number,
    audience_kind=excluded.audience_kind,specific_client_ids=excluded.specific_client_ids,
    trigger_kind=excluded.trigger_kind,timing=excluded.timing,stop_conditions=excluded.stop_conditions,
    configured_by=excluded.configured_by,updated_at=transaction_timestamp()
  returning id into result;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
  values(actor,'form.assignment_policy_configured','form_assignment_policies',result,p_workspace_id,
    jsonb_build_object('form_id',p_form_id,'version_number',p_version_number,
      'audience_kind',p_audience_kind,'trigger_kind',p_trigger_kind));
  return jsonb_build_object('status','configured');
exception when others then return '{"status":"not_found"}'::jsonb;
end $$;
alter function public.configure_intake_assignment_policy(uuid,uuid,integer,text,uuid[],text,jsonb,jsonb) owner to postgres;
revoke all on function public.configure_intake_assignment_policy(uuid,uuid,integer,text,uuid[],text,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.configure_intake_assignment_policy(uuid,uuid,integer,text,uuid[],text,jsonb,jsonb) to authenticated;

create function public.materialize_intake_assignment_occurrence(p_workspace_id uuid,p_form_id uuid,p_occurrence_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
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
  -- Audience membership and active F13 entitlement are sampled at this single
  -- transaction timestamp; retries retain the same (form,client,occurrence) key.
  if exists(select 1 from app_private.form_assignment_occurrences o where o.workspace_id=p_workspace_id
    and o.policy_id=policy.id and o.occurrence_key=p_occurrence_key) then
    return jsonb_build_object('status','already_materialized','count',0); end if;
  deadline_days:=coalesce((policy.timing->>'client_deadline_days')::integer,3);
  if deadline_days not between 1 and 14 then return '{"status":"not_found"}'::jsonb; end if;
  select coalesce(array_agg(c.id order by c.id),'{}'::uuid[]) into client_ids
  from public.clients c where c.workspace_id=p_workspace_id and c.approval_state='approved'
    and (policy.audience_kind='all_active_clients'
      or (policy.audience_kind='new_clients' and c.created_at>=policy.configured_at)
      or (policy.audience_kind='specific_clients' and c.id=any(policy.specific_client_ids)))
    and exists(select 1 from public.subscriptions s where s.workspace_id=c.workspace_id and s.client_id=c.id
      and app_private.f13_project_entitlement(s.workspace_id,s.id,(snapshot_at at time zone 'Africa/Cairo')::date)->>'status'='active');
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
  where true
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
