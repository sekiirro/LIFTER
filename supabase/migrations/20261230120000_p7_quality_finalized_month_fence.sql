-- CUMREV-027-03: record_monthly_quality refuses writes for a month already finalized in p7_month_snapshots.
-- Copies reviewed function body exactly, preserving 20261226140000 lock order, adding the finalized month fence check after the period lock.

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

  perform app_private.p7_require_quality_actor(p_workspace_id, actor, true);
  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, true);
  perform app_private.p7_lock_period(p_workspace_id, v_month_date);
  perform app_private.p7_require_quality_actor(p_workspace_id, actor, false);
  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, false);

  if exists (
    select 1 from public.p7_month_snapshots s
    where s.workspace_id = p_workspace_id
      and s.effective_month = v_month_date
  ) then
    raise exception 'p7_ledger_immutable' using errcode = '23514';
  end if;

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
end;
$$;

alter function public.record_monthly_quality(uuid,uuid,text,text,integer,integer,numeric,numeric,text,integer) owner to postgres;
revoke all on function public.record_monthly_quality(uuid,uuid,text,text,integer,integer,numeric,numeric,text,integer) from public, anon, service_role;
grant execute on function public.record_monthly_quality(uuid,uuid,text,text,integer,integer,numeric,numeric,text,integer) to authenticated;

notify pgrst, 'reload schema';
