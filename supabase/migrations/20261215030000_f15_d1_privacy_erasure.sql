-- T029 (D-29 / FR-005/007/008/013/024): narrowly scoped D1 privacy erasure
-- for currently inapplicable form answers and their matching answer-change and
-- access-view audit rows, with counts-only control records and legal-hold defer/alert.

create table app_private.f15_d1_erasure_context (
  tx_id text not null,
  token uuid not null,
  workspace_id uuid not null,
  assignment_id uuid not null,
  inapplicable_question_ids text[] not null,
  allowed_revision_ids uuid[] not null,
  allowed_audit_ids bigint[] not null,
  primary key (tx_id, token)
);
alter table app_private.f15_d1_erasure_context enable row level security;
alter table app_private.f15_d1_erasure_context force row level security;
revoke all on app_private.f15_d1_erasure_context
  from public, anon, authenticated, service_role;

create table app_private.form_d1_erasure_controls (
  created_at timestamptz not null default clock_timestamp(),
  outcome text not null check (outcome in ('deferred_legal_hold', 'erased')),
  answer_value_count integer not null check (answer_value_count >= 0),
  answer_version_count integer not null check (answer_version_count >= 0),
  draft_value_count integer not null check (draft_value_count >= 0),
  answer_change_audit_count integer not null check (answer_change_audit_count >= 0),
  access_view_audit_count integer not null check (access_view_audit_count >= 0)
);
alter table app_private.form_d1_erasure_controls enable row level security;
alter table app_private.form_d1_erasure_controls force row level security;
revoke all on app_private.form_d1_erasure_controls
  from public, anon, authenticated, service_role;

create function app_private.guard_form_d1_erasure_control() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'form d1 erasure controls are append-only' using errcode = '23514';
end
$$;
alter function app_private.guard_form_d1_erasure_control() owner to postgres;
revoke all on function app_private.guard_form_d1_erasure_control()
  from public, anon, authenticated, service_role;
create trigger form_d1_erasure_controls_immutable
  before update or delete on app_private.form_d1_erasure_controls
  for each row execute function app_private.guard_form_d1_erasure_control();
create trigger form_d1_erasure_controls_no_truncate
  before truncate on app_private.form_d1_erasure_controls
  for each statement execute function app_private.guard_form_d1_erasure_control();

create table app_private.form_d1_erasure_hold_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  assignment_id uuid not null,
  hold_reference uuid not null,
  recipient_user_ids uuid[] not null,
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  foreign key (workspace_id, assignment_id)
    references public.form_assignments(workspace_id, id) on delete restrict,
  foreign key (workspace_id, client_id, hold_reference)
    references app_private.form_legal_holds(workspace_id, client_id, hold_reference) on delete restrict
);
create unique index form_d1_erasure_hold_alerts_open_idx
  on app_private.form_d1_erasure_hold_alerts(workspace_id, assignment_id, hold_reference)
  where resolved_at is null;
alter table app_private.form_d1_erasure_hold_alerts enable row level security;
alter table app_private.form_d1_erasure_hold_alerts force row level security;
revoke all on app_private.form_d1_erasure_hold_alerts
  from public, anon, authenticated, service_role;

create or replace function app_private.audit_events_immutable() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  token_text text;
begin
  if tg_op <> 'DELETE' or tg_table_schema <> 'public' or tg_table_name <> 'audit_events' then
    raise exception 'Audit events are immutable' using errcode = '23514';
  end if;
  if current_user = 'postgres' then
    token_text := current_setting('app_private.f15_d1_erasure_token', true);
    if token_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and old.action in ('form.answer_viewed', 'form.answer_corrected', 'form.draft_saved')
      and old.target_table in (
        'form_answer_current',
        'form_answer_draft',
        'form_answer_history',
        'form_answer_revisions',
        'form_answer_drafts'
      )
      and exists (
        select 1 from app_private.f15_d1_erasure_context ctx
        where ctx.tx_id = pg_catalog.pg_current_xact_id()::text
          and ctx.token = token_text::uuid
          and ctx.workspace_id = old.workspace_id
          and ctx.assignment_id = old.target_id
          and old.id = any(ctx.allowed_audit_ids)
      ) then
      return old;
    end if;
  end if;
  raise exception 'Audit events are immutable' using errcode = '23514';
end;
$$;
alter function app_private.audit_events_immutable() owner to postgres;
revoke all on function app_private.audit_events_immutable()
  from public, anon, authenticated, service_role;

create or replace function app_private.guard_form_answer_revision_immutable()
returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  client_id uuid;
  purge_scope text := current_setting('app_private.f15_retention_purge', true);
  token_text text;
begin
  if tg_op = 'DELETE' and current_user = 'postgres' then
    select a.client_id into client_id from public.form_assignments a
    where a.workspace_id = old.workspace_id and a.id = old.assignment_id;
    if purge_scope = old.workspace_id::text || ':' || client_id::text then
      return old;
    end if;
  elsif tg_op = 'UPDATE' and current_user = 'postgres' then
    token_text := current_setting('app_private.f15_d1_erasure_token', true);
    if token_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and new.id = old.id
      and new.workspace_id = old.workspace_id
      and new.assignment_id = old.assignment_id
      and new.revision = old.revision
      and new.created_at = old.created_at
      and exists (
        select 1 from app_private.f15_d1_erasure_context ctx
        where ctx.tx_id = pg_catalog.pg_current_xact_id()::text
          and ctx.token = token_text::uuid
          and ctx.workspace_id = old.workspace_id
          and ctx.assignment_id = old.assignment_id
          and old.id = any(ctx.allowed_revision_ids)
          and new.answer_values = (old.answer_values - ctx.inapplicable_question_ids)
      ) then
      return new;
    end if;
  end if;
  raise exception 'form answer revisions are immutable' using errcode = '23514';
end
$$;
alter function app_private.guard_form_answer_revision_immutable() owner to postgres;
revoke all on function app_private.guard_form_answer_revision_immutable()
  from public, anon, authenticated, service_role;

create or replace function app_private.guard_form_draft_after_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  token_text text;
begin
  if exists (select 1 from app_private.form_submissions s
    where s.workspace_id = new.workspace_id and s.assignment_id = new.assignment_id) then
    if tg_op = 'UPDATE' and current_user = 'postgres' then
      token_text := current_setting('app_private.f15_d1_erasure_token', true);
      if token_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and new.workspace_id = old.workspace_id
        and new.assignment_id = old.assignment_id
        and new.revision = old.revision
        and new.updated_at = old.updated_at
        and exists (
          select 1 from app_private.f15_d1_erasure_context ctx
          where ctx.tx_id = pg_catalog.pg_current_xact_id()::text
            and ctx.token = token_text::uuid
            and ctx.workspace_id = old.workspace_id
            and ctx.assignment_id = old.assignment_id
            and new.answer_values = (old.answer_values - ctx.inapplicable_question_ids)
        ) then
        return new;
      end if;
    end if;
    raise exception 'form submission is immutable' using errcode = '23514';
  end if;
  return new;
end
$$;
alter function app_private.guard_form_draft_after_submission() owner to postgres;
revoke all on function app_private.guard_form_draft_after_submission()
  from public, anon, authenticated, service_role;

create function app_private.d1_erase_inapplicable_answers(
  p_workspace_id uuid,
  p_assignment_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_assignment public.form_assignments%rowtype;
  v_hold_ref uuid;
  v_recipients uuid[];
  v_alert_id uuid;
  v_current_answers jsonb;
  v_inapplicable_ids text[] := '{}'::text[];
  v_question jsonb;
  v_question_id text;
  v_rev_row record;
  v_target_revision_ids uuid[] := '{}'::uuid[];
  v_target_revisions integer[] := '{}'::integer[];
  v_revision_value_count integer := 0;
  v_draft_row public.form_answer_drafts%rowtype;
  v_has_target_draft boolean := false;
  v_draft_value_count integer := 0;
  v_audit_row record;
  v_target_audit_ids bigint[] := '{}'::bigint[];
  v_answer_change_audit_count integer := 0;
  v_access_view_audit_count integer := 0;
  v_token uuid;
  v_tx_id text;
begin
  if p_workspace_id is null or p_assignment_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('f15-d1:' || p_workspace_id::text || ':' || p_assignment_id::text, 0)
  );

  select a.* into v_assignment
  from public.form_assignments a
  where a.workspace_id = p_workspace_id and a.id = p_assignment_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if jsonb_typeof(v_assignment.version_snapshot) is distinct from 'object'
    or jsonb_typeof(v_assignment.version_snapshot->'questions') is distinct from 'array' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select h.hold_reference into v_hold_ref
  from app_private.form_legal_holds h
  where h.workspace_id = p_workspace_id
    and h.client_id = v_assignment.client_id
    and h.released_at is null
  limit 1;
  if found then
    select coalesce(array_agg(distinct candidates.user_id), '{}'::uuid[])
    into v_recipients
    from (
      select p.user_id from public.staff_profiles p
      where p.role = 'platform_owner'::public.staff_role
      union
      select m.user_id from public.workspace_memberships m
      join public.staff_profiles p on p.user_id = m.user_id
      where m.workspace_id = p_workspace_id and m.revoked_at is null
        and p.role = 'workspace_owner'::public.staff_role
    ) candidates;

    insert into app_private.form_d1_erasure_hold_alerts(
      workspace_id, client_id, assignment_id, hold_reference, recipient_user_ids
    ) values (
      p_workspace_id, v_assignment.client_id, p_assignment_id, v_hold_ref, v_recipients
    ) on conflict (workspace_id, assignment_id, hold_reference) where resolved_at is null
      do nothing returning id into v_alert_id;

    if v_alert_id is not null then
      insert into public.audit_events(
        actor_user_id, action, target_table, target_id, workspace_id, details
      ) values (
        null, 'form.erasure_deferred', 'form_d1_erasure_hold_alerts', v_alert_id,
        p_workspace_id, jsonb_build_object('reason', 'legal_hold')
      );
    end if;

    insert into app_private.form_d1_erasure_controls(
      outcome, answer_value_count, answer_version_count, draft_value_count,
      answer_change_audit_count, access_view_audit_count
    ) values ('deferred_legal_hold', 0, 0, 0, 0, 0);

    return jsonb_build_object('status', 'deferred_legal_hold', 'defer', true, 'alert', true);
  end if;

  select r.answer_values into v_current_answers
  from public.form_answer_revisions r
  where r.workspace_id = p_workspace_id and r.assignment_id = p_assignment_id
  order by r.revision desc
  limit 1
  for update;

  if not found then
    select d.answer_values into v_current_answers
    from public.form_answer_drafts d
    where d.workspace_id = p_workspace_id and d.assignment_id = p_assignment_id
    for update;
  end if;

  if v_current_answers is null or jsonb_typeof(v_current_answers) is distinct from 'object' then
    return jsonb_build_object(
      'status', 'no_targets',
      'answer_values', 0,
      'revisions', 0,
      'draft_values', 0,
      'answer_change_audits', 0,
      'access_view_audits', 0
    );
  end if;

  for v_question in
    select value from jsonb_array_elements(v_assignment.version_snapshot->'questions')
  loop
    v_question_id := v_question->>'id';
    if v_question_id is not null
      and not app_private.f15_question_applies(
        v_assignment.version_snapshot->'questions', v_question, v_current_answers, 0
      ) then
      v_inapplicable_ids := array_append(v_inapplicable_ids, v_question_id);
    end if;
  end loop;

  if cardinality(v_inapplicable_ids) = 0 then
    return jsonb_build_object(
      'status', 'no_targets',
      'answer_values', 0,
      'revisions', 0,
      'draft_values', 0,
      'answer_change_audits', 0,
      'access_view_audits', 0
    );
  end if;

  for v_rev_row in
    select r.id, r.revision, r.answer_values
    from public.form_answer_revisions r
    where r.workspace_id = p_workspace_id
      and r.assignment_id = p_assignment_id
      and r.answer_values ?| v_inapplicable_ids
    order by r.revision
    for update
  loop
    v_target_revision_ids := array_append(v_target_revision_ids, v_rev_row.id);
    v_target_revisions := array_append(v_target_revisions, v_rev_row.revision);
    v_revision_value_count := v_revision_value_count + (
      select count(*)::integer
      from jsonb_object_keys(v_rev_row.answer_values) k(key)
      where k.key = any(v_inapplicable_ids)
    );
  end loop;

  select d.* into v_draft_row
  from public.form_answer_drafts d
  where d.workspace_id = p_workspace_id
    and d.assignment_id = p_assignment_id
    and d.answer_values ?| v_inapplicable_ids
  for update;
  if found then
    v_has_target_draft := true;
    v_draft_value_count := (
      select count(*)::integer
      from jsonb_object_keys(v_draft_row.answer_values) k(key)
      where k.key = any(v_inapplicable_ids)
    );
  end if;

  if v_revision_value_count = 0 and v_draft_value_count = 0 then
    return jsonb_build_object(
      'status', 'no_targets',
      'answer_values', 0,
      'revisions', 0,
      'draft_values', 0,
      'answer_change_audits', 0,
      'access_view_audits', 0
    );
  end if;

  for v_audit_row in
    select e.id, e.action, e.target_table, e.details
    from public.audit_events e
    where e.workspace_id = p_workspace_id
      and e.target_id = p_assignment_id
      and (
        (
          e.action = 'form.answer_corrected'
          and e.target_table = 'form_answer_revisions'
          and (e.details->>'revision') ~ '^[0-9]+$'
          and (e.details->>'revision')::integer = any(v_target_revisions)
        )
        or (
          e.action = 'form.draft_saved'
          and e.target_table = 'form_answer_drafts'
          and v_has_target_draft
          and (e.details->>'revision') ~ '^[0-9]+$'
          and (e.details->>'revision')::integer <= v_draft_row.revision
        )
        or (
          e.action = 'form.answer_viewed'
          and e.target_table in (
            'form_answer_current',
            'form_answer_draft',
            'form_answer_history',
            'form_answer_revisions'
          )
          and (e.details->>'revision') ~ '^[0-9]+$'
          and (
            (
              coalesce(e.details->>'view', 'current') = 'current'
              and (e.details->>'revision')::integer = any(v_target_revisions)
            )
            or (
              e.details->>'view' = 'draft'
              and v_has_target_draft
              and (e.details->>'revision')::integer <= v_draft_row.revision
            )
            or (
              e.details->>'view' = 'history'
              and exists (
                select 1 from unnest(v_target_revisions) tr
                where tr <= (e.details->>'revision')::integer
              )
            )
          )
        )
      )
    order by e.id
    for update
  loop
    v_target_audit_ids := array_append(v_target_audit_ids, v_audit_row.id);
    if v_audit_row.action = 'form.answer_viewed' then
      v_access_view_audit_count := v_access_view_audit_count + 1;
    else
      v_answer_change_audit_count := v_answer_change_audit_count + 1;
    end if;
  end loop;

  v_token := gen_random_uuid();
  v_tx_id := pg_catalog.pg_current_xact_id()::text;
  perform pg_catalog.set_config('app_private.f15_d1_erasure_token', v_token::text, true);

  insert into app_private.f15_d1_erasure_context(
    tx_id, token, workspace_id, assignment_id,
    inapplicable_question_ids, allowed_revision_ids, allowed_audit_ids
  ) values (
    v_tx_id, v_token, p_workspace_id, p_assignment_id,
    v_inapplicable_ids, v_target_revision_ids, v_target_audit_ids
  );

  if cardinality(v_target_revision_ids) > 0 then
    update public.form_answer_revisions r
    set answer_values = r.answer_values - v_inapplicable_ids
    where r.workspace_id = p_workspace_id
      and r.assignment_id = p_assignment_id
      and r.id = any(v_target_revision_ids);
  end if;

  if v_has_target_draft then
    update public.form_answer_drafts d
    set answer_values = d.answer_values - v_inapplicable_ids
    where d.workspace_id = p_workspace_id
      and d.assignment_id = p_assignment_id;
  end if;

  if cardinality(v_target_audit_ids) > 0 then
    delete from public.audit_events e
    where e.workspace_id = p_workspace_id
      and e.target_id = p_assignment_id
      and e.id = any(v_target_audit_ids);
  end if;

  delete from app_private.f15_d1_erasure_context
  where tx_id = v_tx_id and token = v_token;
  perform pg_catalog.set_config('app_private.f15_d1_erasure_token', '', true);

  update app_private.form_d1_erasure_hold_alerts
  set resolved_at = clock_timestamp()
  where workspace_id = p_workspace_id
    and assignment_id = p_assignment_id
    and resolved_at is null;

  insert into app_private.form_d1_erasure_controls(
    outcome, answer_value_count, answer_version_count, draft_value_count,
    answer_change_audit_count, access_view_audit_count
  ) values (
    'erased',
    v_revision_value_count,
    cardinality(v_target_revision_ids),
    v_draft_value_count,
    v_answer_change_audit_count,
    v_access_view_audit_count
  );

  return jsonb_build_object(
    'status', 'erased',
    'answer_values', v_revision_value_count,
    'revisions', cardinality(v_target_revision_ids),
    'draft_values', v_draft_value_count,
    'answer_change_audits', v_answer_change_audit_count,
    'access_view_audits', v_access_view_audit_count
  );
end
$$;
alter function app_private.d1_erase_inapplicable_answers(uuid,uuid) owner to postgres;
revoke all on function app_private.d1_erase_inapplicable_answers(uuid,uuid)
  from public, anon, authenticated, service_role;

create function app_private.f15_d1_erasure_run_batch(p_batch_size integer)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  item record;
  result jsonb;
  erased integer := 0;
begin
  if current_user <> 'postgres' then
    raise exception 'f15_d1_erasure_owner_required' using errcode = '42501';
  end if;
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 250 then
    raise exception 'f15_d1_erasure_batch_invalid' using errcode = '22023';
  end if;
  for item in
    select a.workspace_id, a.id
    from public.form_assignments a
    where exists (
      select 1
      from jsonb_array_elements(coalesce(a.version_snapshot->'questions', '[]'::jsonb)) q(value)
      where q.value->>'id' is not null
        and not app_private.f15_question_applies(
          a.version_snapshot->'questions',
          q.value,
          coalesce(
            (select r.answer_values from public.form_answer_revisions r
             where r.workspace_id = a.workspace_id and r.assignment_id = a.id
             order by r.revision desc limit 1),
            (select d.answer_values from public.form_answer_drafts d
             where d.workspace_id = a.workspace_id and d.assignment_id = a.id)
          ),
          0
        )
        and (
          exists (
            select 1 from public.form_answer_revisions r2
            where r2.workspace_id = a.workspace_id and r2.assignment_id = a.id
              and r2.answer_values ? (q.value->>'id')
          ) or exists (
            select 1 from public.form_answer_drafts d2
            where d2.workspace_id = a.workspace_id and d2.assignment_id = a.id
              and d2.answer_values ? (q.value->>'id')
          )
        )
    )
      and not exists (
        select 1 from app_private.form_d1_erasure_hold_alerts ha
        join app_private.form_legal_holds lh
          on lh.workspace_id = ha.workspace_id
         and lh.client_id = ha.client_id
         and lh.hold_reference = ha.hold_reference
        where ha.workspace_id = a.workspace_id
          and ha.assignment_id = a.id
          and ha.resolved_at is null
          and lh.released_at is null
      )
    order by a.created_at, a.workspace_id, a.id
    limit p_batch_size
  loop
    result := app_private.d1_erase_inapplicable_answers(item.workspace_id, item.id);
    if result->>'status' = 'erased' then
      erased := erased + 1;
    end if;
  end loop;
  return erased;
end
$$;
alter function app_private.f15_d1_erasure_run_batch(integer) owner to postgres;
revoke all on function app_private.f15_d1_erasure_run_batch(integer)
  from public, anon, authenticated, service_role;

create function app_private.f15_d1_erasure_run() returns integer
language sql security invoker set search_path = '' as $$
  select app_private.f15_d1_erasure_run_batch(250)
$$;
alter function app_private.f15_d1_erasure_run() owner to postgres;
revoke all on function app_private.f15_d1_erasure_run()
  from public, anon, authenticated, service_role;

create function app_private.f15_d1_erasure_schedule_deactivate() returns void
language plpgsql security invoker set search_path = '' as $$
declare
  existing_job bigint;
begin
  if current_user <> 'postgres' then
    raise exception 'f15_d1_erasure_owner_required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(11011, 319);
  for existing_job in
    select jobid from cron.job
    where jobname = 'lifter-f15-d1-erasure' and username = current_user
  loop
    perform cron.unschedule(existing_job);
  end loop;
end
$$;
alter function app_private.f15_d1_erasure_schedule_deactivate() owner to postgres;
revoke all on function app_private.f15_d1_erasure_schedule_deactivate()
  from public, anon, authenticated, service_role;

create function app_private.f15_d1_erasure_schedule_activate() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'postgres' then
    raise exception 'f15_d1_erasure_owner_required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(11011, 319);
  perform app_private.f15_d1_erasure_schedule_deactivate();
  perform cron.schedule(
    'lifter-f15-d1-erasure',
    '15 * * * *',
    'select app_private.f15_d1_erasure_run();'
  );
end
$$;
alter function app_private.f15_d1_erasure_schedule_activate() owner to postgres;
revoke all on function app_private.f15_d1_erasure_schedule_activate()
  from public, anon, authenticated, service_role;
-- Activation is intentionally never called by a migration or by tests.
