-- Spec 030 backend slice: reuse public.jobs, with no export metadata table.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('po-export-artifacts', 'po-export-artifacts', false, 157286400, array['text/csv']::text[])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy po_export_artifacts_no_authenticated_read on storage.objects
  as restrictive for select to authenticated using (bucket_id <> 'po-export-artifacts');
create policy po_export_artifacts_no_authenticated_write on storage.objects
  as restrictive for all to authenticated using (bucket_id <> 'po-export-artifacts')
  with check (bucket_id <> 'po-export-artifacts');

-- Export audit rows contain existence and count metadata that must stay PO-only.
create policy po_export_audit_po_only on public.audit_events
  as restrictive for select to authenticated
  using (
    app_private.is_platform_owner()
    or not (
      action like 'po_export.%'
      or (action = 'job.dead_lettered' and details->>'kind' = 'po.export')
    )
  );

create function app_private.po_export_audit(
  p_job_id uuid, p_action text, p_actor uuid, p_workspace uuid,
  p_outcome text, p_extra jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_action not in ('po_export.requested', 'po_export.generated', 'po_export.failed', 'po_export.retrieved')
    or p_outcome not in ('queued', 'ready', 'failed', 'downloaded')
    or p_extra ?| array['rows','csv','url','path','health_notes','fitness_goals','email','phone','name'] then
    raise exception 'invalid_export_audit' using errcode = '22023';
  end if;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (p_actor, p_action, 'jobs', p_job_id, p_workspace,
    jsonb_build_object('outcome', p_outcome, 'manifest_version', '030-v1') || p_extra);
end;
$$;
alter function app_private.po_export_audit(uuid,text,uuid,uuid,text,jsonb) owner to postgres;
revoke all on function app_private.po_export_audit(uuid,text,uuid,uuid,text,jsonb) from public, anon, authenticated, service_role;

create function public.request_po_client_export(p_workspace_id uuid, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); job_id uuid; safe_key text; existing_job public.jobs%rowtype;
begin
  if actor is null or not app_private.is_platform_owner() then
    raise exception 'not_found' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,96}$' then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if p_workspace_id is not null and not exists(select 1 from public.workspaces w where w.id=p_workspace_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  safe_key := 'po-export:' || actor::text || ':' || p_idempotency_key;
  job_id := app_private.enqueue_job('po.export', p_workspace_id,
    jsonb_build_object('actor_user_id', actor, 'scope_workspace_id', p_workspace_id,
      'manifest_version', '030-v1'), safe_key, now(), 5);
  select * into existing_job from public.jobs where id=job_id;
  if existing_job.kind <> 'po.export'
    or existing_job.workspace_id is distinct from p_workspace_id
    or existing_job.payload->>'actor_user_id' is distinct from actor::text
    or existing_job.payload->>'scope_workspace_id' is distinct from p_workspace_id::text
    or existing_job.payload->>'manifest_version' is distinct from '030-v1' then
    raise exception 'idempotency_scope_conflict' using errcode = '22023';
  end if;
  perform app_private.po_export_audit(job_id, 'po_export.requested', actor, p_workspace_id, 'queued',
    jsonb_build_object('scope', case when p_workspace_id is null then 'all' else 'workspace' end));
  return job_id;
end;
$$;
alter function public.request_po_client_export(uuid,text) owner to postgres;
revoke all on function public.request_po_client_export(uuid,text) from public, anon, service_role;
grant execute on function public.request_po_client_export(uuid,text) to authenticated;

create function public.read_po_client_export_status(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare job public.jobs%rowtype; actor uuid := auth.uid(); state text;
begin
  if actor is null or not app_private.is_platform_owner() then
    raise exception 'not_found' using errcode = '42501';
  end if;
  select * into job from public.jobs j where j.id=p_job_id and j.kind='po.export'
    and (j.payload->>'actor_user_id')::uuid=actor;
  if not found then raise exception 'not_found' using errcode = '42501'; end if;
  state := case
    when job.status='pending' then 'queued'
    when job.status='running' then 'running'
    when job.status='dead' then 'failed'
    when job.status='done' and coalesce((job.payload->>'expires_at')::timestamptz <= clock_timestamp(), true) then 'expired'
    when job.status='done' then 'ready'
    else 'failed'
  end;
  return jsonb_build_object('status', state);
end;
$$;
alter function public.read_po_client_export_status(uuid) owner to postgres;
revoke all on function public.read_po_client_export_status(uuid) from public, anon, service_role;
grant execute on function public.read_po_client_export_status(uuid) to authenticated;

-- The 10,000-row pilot cap keeps one snapshot bounded. The sentinel row detects
-- overflow; an oversized result returns no rows, so the worker cannot upload a prefix.
create function public.po_export_snapshot(p_job_id uuid, p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  job public.jobs%rowtype;
  actor uuid;
  ws uuid;
  row_count integer;
  rows_json jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not_found' using errcode = '42501';
  end if;
  select * into job from public.jobs j where j.id=p_job_id and j.kind='po.export'
    and j.status='running' and j.lease_token=p_lease_token;
  if not found then raise exception 'not_found' using errcode = '42501'; end if;
  actor := (job.payload->>'actor_user_id')::uuid;
  ws := nullif(job.payload->>'scope_workspace_id','')::uuid;
  if not exists(select 1 from public.staff_profiles p where p.user_id=actor and p.role='platform_owner') then
    raise exception 'not_found' using errcode = '42501';
  end if;

  -- This single SELECT captures every exported value under one MVCC snapshot.
  with source_rows as materialized (
    select c.workspace_id, c.id as client_id,
      jsonb_build_object(
        'clients.id', c.id::text,
        'clients.workspace_id', c.workspace_id::text,
        'clients.name', c.name,
        'clients.email_normalized', c.email_normalized,
        'clients.phone_e164', c.phone_e164,
        'clients.approval_state', c.approval_state,
        'clients.created_at', c.created_at,
        'subscriptions.package_name', pv.name_en,
        'subscriptions.status', ep.status,
        'subscriptions.start_at', sa.activated_at,
        'subscriptions.expires_at', ep.effective_end_exclusive,
        'client_trainer_assignments.trainer_name', sp.display_name,
        'client_trainer_assignments.assigned_at', ta.assigned_at,
        'forms.intake_submitted_at', fs.submitted_at,
        'forms.fitness_goals', fr.answer_values->>'fitness_goals'
      ) as row
    from public.clients c
    left join lateral (
      select s.* from public.subscriptions s where s.workspace_id=c.workspace_id and s.client_id=c.id
        and s.created_at <= job.created_at
      order by s.created_at desc, s.id desc limit 1
    ) s on true
    left join public.package_versions pv on pv.workspace_id=s.workspace_id and pv.id=s.package_version_id
    left join app_private.subscription_entitlement_projection ep on ep.workspace_id=s.workspace_id and ep.subscription_id=s.id
    left join public.subscription_activations sa on sa.workspace_id=s.workspace_id and sa.subscription_id=s.id
    left join lateral (
      select a.* from public.client_trainer_assignments a
      where a.workspace_id=c.workspace_id and a.client_id=c.id
        and a.assigned_at <= job.created_at
        and (a.ended_at is null or a.ended_at > job.created_at)
      order by a.assigned_at desc,a.id desc limit 1
    ) ta on true
    left join public.staff_profiles sp on sp.user_id=ta.trainer_user_id
    left join lateral (
      select sub.workspace_id, sub.assignment_id, sub.revision, sub.submitted_at from app_private.form_submissions sub
      join public.form_assignments fa on fa.workspace_id=sub.workspace_id and fa.id=sub.assignment_id
      where fa.workspace_id=c.workspace_id and fa.client_id=c.id and sub.submitted_at <= job.created_at
      order by sub.submitted_at desc,sub.assignment_id desc limit 1
    ) fs on true
    left join public.form_answer_revisions fr on fr.workspace_id=fs.workspace_id and fr.assignment_id=fs.assignment_id and fr.revision=fs.revision
    where c.created_at <= job.created_at and (ws is null or c.workspace_id=ws)
    order by c.workspace_id,c.id limit 10001
  )
  select count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'workspace_id',source_rows.workspace_id,'client_id',source_rows.client_id,'row',source_rows.row
    ) order by source_rows.workspace_id,source_rows.client_id),'[]'::jsonb)
    into row_count, rows_json from source_rows;

  return jsonb_build_object(
    'rows', case when row_count > 10000 then '[]'::jsonb else rows_json end,
    'row_count', row_count,
    'exceeded_limit', row_count > 10000
  );
end;
$$;
alter function public.po_export_snapshot(uuid,uuid) owner to postgres;
revoke all on function public.po_export_snapshot(uuid,uuid) from public, anon, authenticated;
grant execute on function public.po_export_snapshot(uuid,uuid) to service_role;

create function public.po_export_attempt(p_job_id uuid, p_lease_token uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare object_path text; attempt_id uuid := gen_random_uuid();
begin
  object_path := p_job_id::text || '/' || p_lease_token::text || '/' || attempt_id::text || '/archive.csv';
  update public.jobs j set payload=jsonb_set(
    j.payload,
    '{artifact_attempt_paths}',
    coalesce(j.payload->'artifact_attempt_paths','[]'::jsonb) ||
      jsonb_build_array(jsonb_build_object('path',object_path,'lease_token',p_lease_token,'created_at',clock_timestamp())),
    true
  )
  where j.id=p_job_id and j.kind='po.export' and j.status='running'
    and j.lease_token=p_lease_token;
  if not found then return null; end if;
  return object_path;
end;
$$;
alter function public.po_export_attempt(uuid,uuid) owner to postgres;
revoke all on function public.po_export_attempt(uuid,uuid) from public, anon, authenticated;
grant execute on function public.po_export_attempt(uuid,uuid) to service_role;

create function public.po_export_finalize(
  p_job_id uuid, p_lease_token uuid, p_object_path text, p_row_count bigint
) returns boolean language plpgsql security definer set search_path = '' as $$
declare job public.jobs%rowtype; actor uuid; ws uuid;
begin
  select * into job from public.jobs j where j.id=p_job_id and j.kind='po.export'
    and j.status='running' and j.lease_token=p_lease_token for update;
  if not found or p_row_count < 0 then
    return false;
  end if;
  if job.payload->>'artifact_path' = p_object_path
    and (job.payload->>'row_count')::bigint = p_row_count then
    return true;
  end if;
  if job.payload->>'artifact_path' is not null then
    return false;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(job.payload->'artifact_attempt_paths','[]'::jsonb)) attempt
    where attempt->>'path'=p_object_path and attempt->>'lease_token'=p_lease_token::text
  ) then
    return false;
  end if;
  actor := (job.payload->>'actor_user_id')::uuid;
  ws := nullif(job.payload->>'scope_workspace_id','')::uuid;
  if not exists(select 1 from public.staff_profiles p where p.user_id=actor and p.role='platform_owner') then
    perform app_private.po_export_audit(p_job_id,'po_export.failed',actor,ws,'failed');
    return false;
  end if;
  update public.jobs set payload=payload || jsonb_build_object(
    'artifact_path',p_object_path,'row_count',p_row_count,'generated_at',clock_timestamp(),
    'expires_at',clock_timestamp()+interval '15 minutes') || jsonb_build_object(
      'artifact_attempt_paths', coalesce((
        select jsonb_agg(attempt) from jsonb_array_elements(coalesce(payload->'artifact_attempt_paths','[]'::jsonb)) attempt
        where attempt->>'path' <> p_object_path
      ),'[]'::jsonb))
    where id=p_job_id and lease_token=p_lease_token and status='running';
  perform app_private.po_export_audit(p_job_id,'po_export.generated',actor,ws,'ready',
    jsonb_build_object('row_count',p_row_count));
  return true;
end;
$$;
alter function public.po_export_finalize(uuid,uuid,text,bigint) owner to postgres;
revoke all on function public.po_export_finalize(uuid,uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.po_export_finalize(uuid,uuid,text,bigint) to service_role;

create function public.po_export_failed(p_job_id uuid, p_lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job public.jobs%rowtype; actor uuid; ws uuid;
begin
  select * into job from public.jobs j where j.id=p_job_id and j.kind='po.export'
    and j.status='running' and j.lease_token=p_lease_token;
  if not found then return false; end if;
  actor := (job.payload->>'actor_user_id')::uuid;
  ws := nullif(job.payload->>'scope_workspace_id','')::uuid;
  perform app_private.po_export_audit(p_job_id,'po_export.failed',actor,ws,'failed');
  return true;
end;
$$;
alter function public.po_export_failed(uuid,uuid) owner to postgres;
revoke all on function public.po_export_failed(uuid,uuid) from public, anon, authenticated;
grant execute on function public.po_export_failed(uuid,uuid) to service_role;

create function public.po_export_expired_artifacts(p_limit integer default 100)
returns table(job_id uuid, object_path text) language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role'
    or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'not_found' using errcode = '42501';
  end if;
  return query
    select pending.job_id, pending.object_path
    from (
      select j.id as job_id, j.payload->>'artifact_path' as object_path,
        (j.payload->>'expires_at')::timestamptz as sort_at
      from public.jobs j
      where j.kind='po.export' and j.status in ('done','dead')
        and j.payload->>'artifact_path' is not null
        and (j.status='dead' or (j.payload->>'expires_at')::timestamptz <= clock_timestamp())
      union all
      select j.id, attempt->>'path', coalesce((attempt->>'created_at')::timestamptz, j.created_at)
      from public.jobs j
      cross join lateral jsonb_array_elements(coalesce(j.payload->'artifact_attempt_paths','[]'::jsonb)) attempt
      where j.kind='po.export'
        and (j.status <> 'running' or attempt->>'lease_token' is distinct from j.lease_token::text)
    ) pending
    order by pending.sort_at, pending.job_id
    limit p_limit;
end;
$$;
alter function public.po_export_expired_artifacts(integer) owner to postgres;
revoke all on function public.po_export_expired_artifacts(integer) from public, anon, authenticated;
grant execute on function public.po_export_expired_artifacts(integer) to service_role;

create function public.po_export_expired_mark(p_job_id uuid, p_object_path text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare changed boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not_found' using errcode = '42501';
  end if;
  update public.jobs j set payload=(j.payload-'artifact_path'-'expires_at'-'row_count'-'generated_at') || jsonb_build_object(
    'artifact_attempt_paths', coalesce((
      select jsonb_agg(attempt) from jsonb_array_elements(coalesce(j.payload->'artifact_attempt_paths','[]'::jsonb)) attempt
      where attempt->>'path' <> p_object_path
    ),'[]'::jsonb))
  where j.id=p_job_id and j.kind='po.export' and j.status in ('done','dead')
    and j.payload->>'artifact_path'=p_object_path
    and (j.status='dead' or (j.payload->>'expires_at')::timestamptz <= clock_timestamp());
  changed := found;
  update public.jobs j set payload=jsonb_set(j.payload,'{artifact_attempt_paths}',coalesce((
    select jsonb_agg(attempt) from jsonb_array_elements(coalesce(j.payload->'artifact_attempt_paths','[]'::jsonb)) attempt
    where attempt->>'path' <> p_object_path
  ),'[]'::jsonb),true)
  where j.id=p_job_id and j.kind='po.export'
    and exists(select 1 from jsonb_array_elements(coalesce(j.payload->'artifact_attempt_paths','[]'::jsonb)) attempt where attempt->>'path'=p_object_path);
  return changed or found;
end;
$$;
alter function public.po_export_expired_mark(uuid,text) owner to postgres;
revoke all on function public.po_export_expired_mark(uuid,text) from public, anon, authenticated;
grant execute on function public.po_export_expired_mark(uuid,text) to service_role;

create function public.record_po_export_retrieval(p_job_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare job public.jobs%rowtype; actor uuid := auth.uid(); ws uuid; object_path text;
begin
  if actor is null or not app_private.is_platform_owner() then
    raise exception 'not_found' using errcode = '42501';
  end if;
  select * into job from public.jobs j where j.id=p_job_id and j.kind='po.export'
    and j.status='done' and (j.payload->>'actor_user_id')::uuid=actor;
  if not found or (job.payload->>'expires_at')::timestamptz <= clock_timestamp() then
    raise exception 'not_found' using errcode = '42501';
  end if;
  ws := nullif(job.payload->>'scope_workspace_id','')::uuid;
  object_path := job.payload->>'artifact_path';
  if object_path is null then raise exception 'not_found' using errcode = '42501'; end if;
  perform app_private.po_export_audit(p_job_id,'po_export.retrieved',actor,ws,'downloaded');
  return object_path;
end;
$$;
alter function public.record_po_export_retrieval(uuid) owner to postgres;
revoke all on function public.record_po_export_retrieval(uuid) from public, anon, service_role;
grant execute on function public.record_po_export_retrieval(uuid) to authenticated;
