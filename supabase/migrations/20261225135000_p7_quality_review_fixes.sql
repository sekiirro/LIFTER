-- S71-R13/R13a forward fix for PR #334 review findings.
-- The merged 20261225130000 migration remains immutable. Existing rows predate
-- canonical request hashes, so request_hash stays nullable for legacy replay safety;
-- every new RPC write persists a 32-byte SHA-256 hash and legacy-key reuse fails closed.

alter table public.p7_monthly_quality_revisions add column request_hash bytea;
alter table public.p7_monthly_quality_revisions add constraint p7_quality_request_hash_check
  check (request_hash is null or octet_length(request_hash) = 32);
alter table public.p7_monthly_quality_revisions add constraint p7_quality_pos_weight_finite
  check (positive_weight::text not in ('NaN', 'Infinity', '-Infinity'));
alter table public.p7_monthly_quality_revisions add constraint p7_quality_neg_weight_finite
  check (negative_weight::text not in ('NaN', 'Infinity', '-Infinity'));
alter table public.p7_monthly_quality_revisions add constraint p7_quality_net_points_finite
  check (net_points::text not in ('NaN', 'Infinity', '-Infinity'));
alter table public.p7_monthly_quality_revisions add constraint p7_quality_idempotency_key_check
  check (char_length(btrim(idempotency_key)) between 1 and 200);

alter table public.p7_trainer_quality_settings add column request_hash bytea;
alter table public.p7_trainer_quality_settings add constraint p7_settings_request_hash_check
  check (request_hash is null or octet_length(request_hash) = 32);
alter table public.p7_trainer_quality_settings add constraint p7_settings_pos_weight_finite
  check (positive_weight::text not in ('NaN', 'Infinity', '-Infinity'));
alter table public.p7_trainer_quality_settings add constraint p7_settings_neg_weight_finite
  check (negative_weight::text not in ('NaN', 'Infinity', '-Infinity'));
alter table public.p7_trainer_quality_settings add constraint p7_settings_idempotency_key_check
  check (char_length(btrim(idempotency_key)) between 1 and 200);

alter table app_private.staff_inbox_notices drop constraint staff_inbox_notices_kind_check;
alter table app_private.staff_inbox_notices add constraint staff_inbox_notices_kind_check
  check (notice_kind in ('food_replacement_open', 'monthly_quality_reminder'));

create function app_private.p7_require_quality_actor(
  p_workspace_id uuid,
  p_actor uuid,
  p_lock boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_actor is null or auth.uid() is distinct from p_actor then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_lock then
    perform 1 from public.staff_profiles p
      where p.user_id = p_actor and p.role = 'platform_owner'
      for share;
  else
    perform 1 from public.staff_profiles p
      where p.user_id = p_actor and p.role = 'platform_owner';
  end if;
  if not found
    or not exists (select 1 from public.workspaces w where w.id = p_workspace_id)
    or not app_private.has_workspace_access(p_workspace_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
end $$;

create function app_private.p7_require_quality_trainer(
  p_workspace_id uuid,
  p_trainer_id uuid,
  p_lock boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_lock then
    perform 1
      from public.staff_profiles sp
      join public.workspace_memberships wm
        on wm.workspace_id = p_workspace_id and wm.user_id = sp.user_id
      where sp.user_id = p_trainer_id and sp.role = 'trainer'
      for share of sp, wm;
  else
    perform 1
      from public.staff_profiles sp
      join public.workspace_memberships wm
        on wm.workspace_id = p_workspace_id and wm.user_id = sp.user_id
      where sp.user_id = p_trainer_id and sp.role = 'trainer';
  end if;
  if not found then
    raise exception 'trainer_not_found' using errcode = '22023';
  end if;
end $$;

create or replace function public.record_monthly_quality(
  p_workspace_id uuid,
  p_trainer_id uuid,
  p_month text,
  p_category text,
  p_positive_count integer,
  p_negative_count integer default 0,
  p_positive_weight numeric default null,
  p_negative_weight numeric default null,
  p_idempotency_key text default null,
  p_expected_revision integer default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v_pos_weight numeric(10,2);
  v_neg_weight numeric(10,2);
  v_net_points numeric(10,2);
  v_current_rev integer;
  v_next_rev integer;
  v_key text;
  v_request_hash bytea;
  v_month_date date;
  v_existing record;
  v_row record;
begin
  perform app_private.p7_require_quality_actor(p_workspace_id, actor, false);

  if p_idempotency_key is null or char_length(btrim(p_idempotency_key)) not between 1 and 200
    or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid_idempotency_or_revision' using errcode = '22023';
  end if;
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid_month_format' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('transformation', 'feedback') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if p_positive_count is null or p_positive_count < 0 then
    raise exception 'invalid_count' using errcode = '22023';
  end if;
  if p_negative_count is null or p_negative_count < 0 then
    raise exception 'invalid_count' using errcode = '22023';
  end if;
  if p_category = 'transformation' and p_negative_count <> 0 then
    raise exception 'transformation_negative_count_forbidden' using errcode = '22023';
  end if;

  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, false);

  if p_positive_weight is not null and (
    p_positive_weight::text in ('NaN', 'Infinity', '-Infinity')
    or p_positive_weight < -99999999.99 or p_positive_weight > 99999999.99
  ) then
    raise exception 'invalid_positive_weight' using errcode = '22023';
  end if;
  if p_positive_weight is not null and scale(p_positive_weight) > 2 then
    raise exception 'positive_weight_scale_exceeded' using errcode = '22023';
  end if;
  if p_negative_weight is not null and (
    p_negative_weight::text in ('NaN', 'Infinity', '-Infinity')
    or p_negative_weight < -99999999.99 or p_negative_weight > 99999999.99
  ) then
    raise exception 'invalid_negative_weight' using errcode = '22023';
  end if;
  if p_negative_weight is not null and scale(p_negative_weight) > 2 then
    raise exception 'negative_weight_scale_exceeded' using errcode = '22023';
  end if;

  v_key := p_idempotency_key;
  v_month_date := (p_month || '-01')::date;
  v_request_hash := extensions.digest(convert_to(jsonb_build_array(
    1, 'record_monthly_quality', p_workspace_id, p_trainer_id, p_month, p_category,
    p_positive_count, p_negative_count,
    case when p_positive_weight is null then null
      else to_char(round(p_positive_weight, 2), 'FM999999990.00') end,
    case when p_negative_weight is null then null
      else to_char(round(p_negative_weight, 2), 'FM999999990.00') end,
    p_expected_revision
  )::text, 'UTF8'), 'sha256');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'p7-quality-key:' || p_workspace_id::text || ':' || v_key, 0
  ));
  perform app_private.p7_require_quality_actor(p_workspace_id, actor, false);
  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, false);

  select * into v_existing
  from public.p7_monthly_quality_revisions
  where workspace_id = p_workspace_id and idempotency_key = v_key;

  if v_existing.id is not null then
    perform app_private.p7_require_quality_actor(p_workspace_id, actor, true);
    perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, true);
    if v_existing.request_hash is distinct from v_request_hash then
      raise exception 'idempotency_conflict: arguments diverged for key %', v_key using errcode = '23505';
    end if;
    return jsonb_build_object(
      'id', v_existing.id,
      'workspace_id', v_existing.workspace_id,
      'trainer_id', v_existing.trainer_id,
      'month', v_existing.month,
      'category', v_existing.category,
      'revision', v_existing.revision,
      'positive_count', v_existing.positive_count,
      'negative_count', v_existing.negative_count,
      'positive_weight', to_char(v_existing.positive_weight, 'FM999999990.00'),
      'negative_weight', to_char(v_existing.negative_weight, 'FM999999990.00'),
      'net_points', to_char(v_existing.net_points, 'FM999999990.00'),
      'idempotency_key', v_existing.idempotency_key,
      'created_at', v_existing.created_at,
      'created_by', v_existing.created_by
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    hashtext('p7_settings'),
    hashtext(format('%s:%s:%s', p_workspace_id, p_trainer_id, p_category))
  );
  perform app_private.p7_require_quality_actor(p_workspace_id, actor, false);
  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, false);

  if p_category = 'transformation' then
    if p_positive_weight is not null then
      v_pos_weight := round(p_positive_weight, 2);
    else
      select positive_weight into v_pos_weight
      from public.p7_trainer_quality_settings
      where workspace_id = p_workspace_id and trainer_id = p_trainer_id and category = 'transformation'
      order by revision desc
      limit 1;
      if v_pos_weight is null then v_pos_weight := 1.00; end if;
    end if;
    v_neg_weight := 0.00;
  else
    if p_positive_weight is not null then
      v_pos_weight := round(p_positive_weight, 2);
    else
      select positive_weight into v_pos_weight
      from public.p7_trainer_quality_settings
      where workspace_id = p_workspace_id and trainer_id = p_trainer_id and category = 'feedback'
      order by revision desc
      limit 1;
      if v_pos_weight is null then v_pos_weight := 1.00; end if;
    end if;
    if p_negative_weight is not null then
      v_neg_weight := round(p_negative_weight, 2);
    else
      select negative_weight into v_neg_weight
      from public.p7_trainer_quality_settings
      where workspace_id = p_workspace_id and trainer_id = p_trainer_id and category = 'feedback'
      order by revision desc
      limit 1;
      if v_neg_weight is null then v_neg_weight := -1.00; end if;
    end if;
  end if;

  v_net_points := round((p_positive_count * v_pos_weight) + (p_negative_count * v_neg_weight), 2);

  perform app_private.p7_lock_period(p_workspace_id, v_month_date);
  perform app_private.p7_require_quality_actor(p_workspace_id, actor, false);
  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, false);
  perform app_private.p7_require_quality_actor(p_workspace_id, actor, true);
  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, true);

  select coalesce(max(revision), 0) into v_current_rev
  from public.p7_monthly_quality_revisions
  where workspace_id = p_workspace_id
    and trainer_id = p_trainer_id
    and month = p_month
    and category = p_category;
  if v_current_rev <> p_expected_revision then
    raise exception 'stale_revision: expected % but current is %', p_expected_revision, v_current_rev using errcode = '40001';
  end if;
  v_next_rev := v_current_rev + 1;

  insert into public.p7_monthly_quality_revisions (
    workspace_id, trainer_id, month, category, revision,
    positive_count, negative_count, positive_weight, negative_weight, net_points,
    idempotency_key, request_hash, created_by
  ) values (
    p_workspace_id, p_trainer_id, p_month, p_category, v_next_rev,
    p_positive_count, p_negative_count, v_pos_weight, v_neg_weight, v_net_points,
    v_key, v_request_hash, actor
  ) returning * into v_row;

  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    actor, 'quality.revision_recorded', 'p7_monthly_quality_revisions',
    v_row.id, p_workspace_id,
    jsonb_build_object('revision_id', v_row.id, 'revision', v_next_rev,
      'month', p_month, 'category', p_category)
  );

  return jsonb_build_object(
    'id', v_row.id,
    'workspace_id', v_row.workspace_id,
    'trainer_id', v_row.trainer_id,
    'month', v_row.month,
    'category', v_row.category,
    'revision', v_row.revision,
    'positive_count', v_row.positive_count,
    'negative_count', v_row.negative_count,
    'positive_weight', to_char(v_row.positive_weight, 'FM999999990.00'),
    'negative_weight', to_char(v_row.negative_weight, 'FM999999990.00'),
    'net_points', to_char(v_row.net_points, 'FM999999990.00'),
    'idempotency_key', v_row.idempotency_key,
    'created_at', v_row.created_at,
    'created_by', v_row.created_by
  );
end $$;

drop function public.set_trainer_quality_settings(uuid, uuid, text, numeric, numeric, text);
create function public.set_trainer_quality_settings(
  p_workspace_id uuid,
  p_trainer_id uuid,
  p_category text,
  p_positive_weight numeric,
  p_negative_weight numeric,
  p_idempotency_key text default null,
  p_expected_revision integer default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v_pos_weight numeric(10,2);
  v_neg_weight numeric(10,2);
  v_key text;
  v_request_hash bytea;
  v_existing record;
  v_current_rev integer;
  v_next_rev integer;
  v_row record;
begin
  perform app_private.p7_require_quality_actor(p_workspace_id, actor, false);

  if p_idempotency_key is null or char_length(btrim(p_idempotency_key)) not between 1 and 200
    or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid_idempotency_or_revision' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('transformation', 'feedback') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if p_positive_weight is null or p_positive_weight::text in ('NaN', 'Infinity', '-Infinity')
    or p_positive_weight < -99999999.99 or p_positive_weight > 99999999.99 then
    raise exception 'invalid_positive_weight' using errcode = '22023';
  end if;
  if scale(p_positive_weight) > 2 then
    raise exception 'invalid_positive_weight' using errcode = '22023';
  end if;
  if p_negative_weight is null or p_negative_weight::text in ('NaN', 'Infinity', '-Infinity')
    or p_negative_weight < -99999999.99 or p_negative_weight > 99999999.99 then
    raise exception 'invalid_negative_weight' using errcode = '22023';
  end if;
  if scale(p_negative_weight) > 2 then
    raise exception 'invalid_negative_weight' using errcode = '22023';
  end if;

  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, false);
  v_pos_weight := round(p_positive_weight, 2);
  v_neg_weight := round(p_negative_weight, 2);
  v_key := p_idempotency_key;
  v_request_hash := extensions.digest(convert_to(jsonb_build_array(
    1, 'set_trainer_quality_settings', p_workspace_id, p_trainer_id, p_category,
    to_char(v_pos_weight, 'FM999999990.00'),
    to_char(v_neg_weight, 'FM999999990.00'),
    p_expected_revision
  )::text, 'UTF8'), 'sha256');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'p7-settings-key:' || p_workspace_id::text || ':' || v_key, 0
  ));
  perform app_private.p7_require_quality_actor(p_workspace_id, actor, false);
  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, false);

  select * into v_existing
  from public.p7_trainer_quality_settings
  where workspace_id = p_workspace_id and idempotency_key = v_key;
  if v_existing.id is not null then
    perform app_private.p7_require_quality_actor(p_workspace_id, actor, true);
    perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, true);
    if v_existing.request_hash is distinct from v_request_hash then
      raise exception 'idempotency_conflict: arguments diverged for key %', v_key using errcode = '23505';
    end if;
    return jsonb_build_object(
      'id', v_existing.id,
      'workspace_id', v_existing.workspace_id,
      'trainer_id', v_existing.trainer_id,
      'category', v_existing.category,
      'revision', v_existing.revision,
      'positive_weight', to_char(v_existing.positive_weight, 'FM999999990.00'),
      'negative_weight', to_char(v_existing.negative_weight, 'FM999999990.00'),
      'idempotency_key', v_existing.idempotency_key,
      'created_at', v_existing.created_at,
      'created_by', v_existing.created_by
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    hashtext('p7_settings'),
    hashtext(format('%s:%s:%s', p_workspace_id, p_trainer_id, p_category))
  );
  perform app_private.p7_require_quality_actor(p_workspace_id, actor, false);
  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, false);
  perform app_private.p7_require_quality_actor(p_workspace_id, actor, true);
  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, true);

  select coalesce(max(revision), 0) into v_current_rev
  from public.p7_trainer_quality_settings
  where workspace_id = p_workspace_id
    and trainer_id = p_trainer_id
    and category = p_category;
  if v_current_rev <> p_expected_revision then
    raise exception 'stale_revision: expected % but current is %', p_expected_revision, v_current_rev using errcode = '40001';
  end if;
  v_next_rev := v_current_rev + 1;

  insert into public.p7_trainer_quality_settings (
    workspace_id, trainer_id, category, revision,
    positive_weight, negative_weight, idempotency_key, request_hash, created_by
  ) values (
    p_workspace_id, p_trainer_id, p_category, v_next_rev,
    v_pos_weight, v_neg_weight, v_key, v_request_hash, actor
  ) returning * into v_row;

  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    actor, 'quality.settings_revision_recorded', 'p7_trainer_quality_settings',
    v_row.id, p_workspace_id,
    jsonb_build_object('settings_id', v_row.id, 'trainer_id', p_trainer_id,
      'category', p_category, 'revision', v_next_rev)
  );

  return jsonb_build_object(
    'id', v_row.id,
    'workspace_id', v_row.workspace_id,
    'trainer_id', v_row.trainer_id,
    'category', v_row.category,
    'revision', v_row.revision,
    'positive_weight', to_char(v_row.positive_weight, 'FM999999990.00'),
    'negative_weight', to_char(v_row.negative_weight, 'FM999999990.00'),
    'idempotency_key', v_row.idempotency_key,
    'created_at', v_row.created_at,
    'created_by', v_row.created_by
  );
end $$;

drop function public.get_monthly_quality_effective(uuid, text, uuid, text);
drop view public.p7_monthly_quality_effective;
create view public.p7_monthly_quality_effective with (security_invoker = true) as
select distinct on (workspace_id, trainer_id, month, category)
  id,
  workspace_id,
  trainer_id,
  month,
  category,
  revision,
  positive_count,
  negative_count,
  to_char(positive_weight, 'FM999999990.00') as positive_weight,
  to_char(negative_weight, 'FM999999990.00') as negative_weight,
  to_char(net_points, 'FM999999990.00') as net_points,
  idempotency_key,
  created_at,
  created_by
from public.p7_monthly_quality_revisions
order by workspace_id, trainer_id, month, category, revision desc;
alter view public.p7_monthly_quality_effective owner to postgres;
grant select on public.p7_monthly_quality_effective to authenticated;

create function public.get_monthly_quality_effective(
  p_workspace_id uuid,
  p_month text,
  p_trainer_id uuid default null,
  p_category text default null
) returns table (
  id uuid,
  workspace_id uuid,
  trainer_id uuid,
  month text,
  category text,
  revision integer,
  positive_count integer,
  negative_count integer,
  positive_weight text,
  negative_weight text,
  net_points text,
  idempotency_key text,
  created_at timestamptz,
  created_by uuid
) language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not app_private.is_platform_owner() or not app_private.has_workspace_access(p_workspace_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  return query
  select
    e.id,
    e.workspace_id,
    e.trainer_id,
    e.month,
    e.category,
    e.revision,
    e.positive_count,
    e.negative_count,
    e.positive_weight,
    e.negative_weight,
    e.net_points,
    e.idempotency_key,
    e.created_at,
    e.created_by
  from public.p7_monthly_quality_effective e
  where e.workspace_id = p_workspace_id
    and e.month = p_month
    and (p_trainer_id is null or e.trainer_id = p_trainer_id)
    and (p_category is null or e.category = p_category)
  order by e.trainer_id, e.category;
end $$;

create function public.handle_quality_monthly_reminder(
  p_job_id uuid,
  p_lease_token uuid
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs%rowtype;
  v_reminder public.p7_monthly_reminder_outbox%rowtype;
  v_recipient uuid;
  v_inserted integer := 0;
begin
  if p_job_id is null or p_lease_token is null then return false; end if;
  select * into v_job
  from public.jobs j
  where j.id = p_job_id and j.kind = 'quality.monthly_reminder'
    and j.status = 'running' and j.lease_token = p_lease_token
    and j.lease_expires_at > pg_catalog.statement_timestamp()
  for update;
  if not found then return false; end if;

  select * into v_reminder
  from public.p7_monthly_reminder_outbox r
  where r.job_id = p_job_id and r.workspace_id = v_job.workspace_id
  for update;
  if not found or v_reminder.notification_kind <> 'monthly_quality_reminder'
    or v_job.payload->>'workspace_id' is distinct from v_job.workspace_id::text
    or v_job.payload->>'month' is distinct from v_reminder.month
    or v_reminder.status = 'failed' then
    return false;
  end if;
  if v_reminder.status = 'sent' then return true; end if;

  if not exists (select 1 from public.staff_profiles p where p.role = 'platform_owner') then
    raise exception 'quality_reminder_recipient_unavailable' using errcode = '40001';
  end if;
  for v_recipient in
    select p.user_id from public.staff_profiles p
    where p.role = 'platform_owner' order by p.user_id
  loop
    insert into app_private.staff_inbox_notices (
      workspace_id, recipient_user_id, notice_kind, source_key
    ) values (
      v_reminder.workspace_id, v_recipient, 'monthly_quality_reminder', v_reminder.id
    )
    on conflict (workspace_id, recipient_user_id, notice_kind, source_key) do nothing;
    if found then v_inserted := v_inserted + 1; end if;
  end loop;

  update public.p7_monthly_reminder_outbox
  set status = 'sent'
  where id = v_reminder.id and status = 'enqueued';
  if not found then
    raise exception 'quality_reminder_state_invalid' using errcode = '40001';
  end if;

  insert into public.audit_events (
    actor_user_id, action, target_table, target_id, workspace_id, details
  ) values (
    auth.uid(), 'quality.reminder_delivered', 'p7_monthly_reminder_outbox',
    v_reminder.id, v_reminder.workspace_id, jsonb_build_object('reminder_id', v_reminder.id)
  );
  return true;
end $$;

alter function app_private.p7_require_quality_actor(uuid, uuid, boolean) owner to postgres;
alter function app_private.p7_require_quality_trainer(uuid, uuid, boolean) owner to postgres;
alter function public.record_monthly_quality(uuid, uuid, text, text, integer, integer, numeric, numeric, text, integer) owner to postgres;
alter function public.set_trainer_quality_settings(uuid, uuid, text, numeric, numeric, text, integer) owner to postgres;
alter function public.get_monthly_quality_effective(uuid, text, uuid, text) owner to postgres;
alter function public.handle_quality_monthly_reminder(uuid, uuid) owner to postgres;

revoke all on function app_private.p7_require_quality_actor(uuid, uuid, boolean), app_private.p7_require_quality_trainer(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.record_monthly_quality(uuid, uuid, text, text, integer, integer, numeric, numeric, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.set_trainer_quality_settings(uuid, uuid, text, numeric, numeric, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_monthly_quality_effective(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.handle_quality_monthly_reminder(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.record_monthly_quality(uuid, uuid, text, text, integer, integer, numeric, numeric, text, integer) to authenticated;
grant execute on function public.set_trainer_quality_settings(uuid, uuid, text, numeric, numeric, text, integer) to authenticated;
grant execute on function public.get_monthly_quality_effective(uuid, text, uuid, text) to authenticated;
grant execute on function public.handle_quality_monthly_reminder(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
