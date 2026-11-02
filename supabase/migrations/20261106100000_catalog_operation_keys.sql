-- F16 T011: generic actor-bound idempotency storage shared by future features.
create table app_private.operation_keys (
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  operation_key uuid not null check (
    substring(operation_key::text from 15 for 1) = '4'
    and substring(operation_key::text from 20 for 1) in ('8', '9', 'a', 'b')
  ),
  request_hash text not null check (request_hash ~ '^sha256:[0-9a-f]{64}$'),
  result jsonb,
  created_at timestamptz not null default statement_timestamp() check (isfinite(created_at)),
  primary key (actor_user_id, operation_key),
  check (result is null or jsonb_typeof(result) in ('object', 'array', 'string', 'number', 'boolean'))
);
alter table app_private.operation_keys owner to postgres;
alter table app_private.operation_keys enable row level security;
alter table app_private.operation_keys force row level security;
create policy operation_keys_postgres_internal on app_private.operation_keys
  to postgres using (true) with check (true);
revoke all on app_private.operation_keys from public, anon, authenticated, service_role;

create function app_private.operation_key_fields_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.actor_user_id is distinct from old.actor_user_id
    or new.action is distinct from old.action
    or new.operation_key is distinct from old.operation_key
    or new.request_hash is distinct from old.request_hash
    or new.created_at is distinct from old.created_at
    or old.result is not null
    or new.result is null then
    raise exception 'operation_key_fields_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
alter function app_private.operation_key_fields_immutable() owner to postgres;
revoke all on function app_private.operation_key_fields_immutable() from public, anon, authenticated, service_role;
create trigger operation_keys_result_once before update on app_private.operation_keys
  for each row execute function app_private.operation_key_fields_immutable();

create function app_private.operation_key_result(
  p_actor_user_id uuid,
  p_action text,
  p_operation_key uuid,
  p_request_hash text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare saved app_private.operation_keys%rowtype;
begin
  if p_actor_user_id is null or p_action is null or p_operation_key is null
    or substring(p_operation_key::text from 15 for 1) <> '4'
    or substring(p_operation_key::text from 20 for 1) not in ('8', '9', 'a', 'b')
    or p_action !~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'
    or p_request_hash is null or p_request_hash !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'operation_key_request_invalid' using errcode = '22023';
  end if;
  select * into saved from app_private.operation_keys
  where actor_user_id = p_actor_user_id and operation_key = p_operation_key
  for update;
  if not found then return null; end if;
  if saved.action is distinct from p_action or saved.request_hash is distinct from p_request_hash then
    raise exception 'operation_key_request_conflict' using errcode = '23505';
  end if;
  if saved.result is null then
    raise exception 'operation_key_in_progress' using errcode = '40001';
  end if;
  return saved.result;
end;
$$;
alter function app_private.operation_key_result(uuid, text, uuid, text) owner to postgres;
revoke all on function app_private.operation_key_result(uuid, text, uuid, text) from public, anon, authenticated, service_role;

create function app_private.operation_key_retention_days() returns integer
language sql immutable security definer set search_path = '' as $$
  select 30
$$;
alter function app_private.operation_key_retention_days() owner to postgres;
revoke all on function app_private.operation_key_retention_days() from public, anon, authenticated, service_role;

create function app_private.purge_operation_keys() returns bigint
language plpgsql security definer set search_path = '' as $$
declare removed bigint;
begin
  delete from app_private.operation_keys
  where created_at < statement_timestamp() - make_interval(days => app_private.operation_key_retention_days());
  get diagnostics removed = row_count;
  return removed;
end;
$$;
alter function app_private.purge_operation_keys() owner to postgres;
revoke all on function app_private.purge_operation_keys() from public, anon, authenticated, service_role;

-- F11's existing hourly job remains inactive until its approved pre-production activation.
create or replace function app_private.purge_schedule_activate() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'postgres' then
    raise exception 'purge_schedule_owner_required' using errcode = '42501';
  end if;
  perform app_private.purge_schedule_deactivate();
  perform cron.schedule(
    'lifter-f11-purge-signup',
    '0 * * * *',
    'select app_private.purge_f11_retained_data();'
  );
end $$;
alter function app_private.purge_schedule_activate() owner to postgres;
revoke all on function app_private.purge_schedule_activate() from public, anon, authenticated, service_role;

create function app_private.purge_f11_retained_data() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'postgres' then
    raise exception 'purge_schedule_owner_required' using errcode = '42501';
  end if;
  perform app_private.purge_client_signup_attempts();
  perform app_private.purge_operation_keys();
end $$;
alter function app_private.purge_f11_retained_data() owner to postgres;
revoke all on function app_private.purge_f11_retained_data() from public, anon, authenticated, service_role;

create function app_private.catalog_write_audit(
  p_actor_user_id uuid,
  p_action text,
  p_target_table text,
  p_target_id uuid,
  p_workspace_id uuid,
  p_details jsonb
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare event_id bigint;
begin
  if p_action not in (
    'catalog.exercise_created', 'catalog.exercise_versioned', 'catalog.exercise_removed', 'catalog.exercise_restored', 'catalog.exercise_merged',
    'catalog.workspace_exercise_created', 'catalog.workspace_exercise_versioned', 'catalog.workspace_exercise_removed', 'catalog.workspace_exercise_restored',
    'catalog.variation_created', 'catalog.variation_versioned', 'catalog.variation_removed', 'catalog.variation_restored',
    'catalog.food_created', 'catalog.food_versioned', 'catalog.food_removed', 'catalog.food_restored', 'catalog.food_merged',
    'catalog.taxonomy_versioned'
  ) or p_target_table not in (
    'exercises', 'workspace_exercises', 'exercise_variations', 'foods', 'taxonomy_terms'
  ) or (p_action like 'catalog.exercise_%' and p_target_table <> 'exercises')
    or (p_action like 'catalog.workspace_exercise_%' and p_target_table <> 'workspace_exercises')
    or (p_action like 'catalog.variation_%' and p_target_table <> 'exercise_variations')
    or (p_action like 'catalog.food_%' and p_target_table <> 'foods')
    or (p_action = 'catalog.taxonomy_versioned' and p_target_table <> 'taxonomy_terms')
    or p_actor_user_id is null or p_target_id is null or p_details is null or jsonb_typeof(p_details) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_details) as key(name)
      where key.name not in ('identity_id', 'version', 'related_id', 'changed_fields'))
    or (p_details ? 'identity_id' and (jsonb_typeof(p_details->'identity_id') <> 'string' or (p_details->>'identity_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
    or (p_details ? 'related_id' and (jsonb_typeof(p_details->'related_id') <> 'string' or (p_details->>'related_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
    or (p_details ? 'version' and (jsonb_typeof(p_details->'version') <> 'number' or (p_details->>'version') !~ '^[1-9][0-9]*$'))
    or (p_details ? 'changed_fields' and (
      jsonb_typeof(p_details->'changed_fields') <> 'array'
      or exists (select 1 from jsonb_array_elements(
        case when jsonb_typeof(p_details->'changed_fields') = 'array' then p_details->'changed_fields' else '[]'::jsonb end
      ) as field(value)
        where jsonb_typeof(field.value) <> 'string' or field.value #>> '{}' not in (
          'name_ar', 'name_en', 'muscle_group', 'secondary_muscles', 'equipment', 'instructions_ar', 'instructions_en',
          'defaults', 'video', 'note', 'basis', 'kcal', 'protein_g', 'carbohydrate_g', 'fat_g', 'fiber_g', 'servings', 'alternatives', 'lifecycle'
        ))
    )) then
    raise exception 'catalog_audit_contract_violation' using errcode = '23514';
  end if;
  if (p_target_table in ('workspace_exercises', 'exercise_variations')) is distinct from (p_workspace_id is not null) then
    raise exception 'catalog_audit_scope_violation' using errcode = '23514';
  end if;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (p_actor_user_id, p_action, p_target_table, p_target_id, p_workspace_id, p_details)
  returning id into event_id;
  return event_id;
end;
$$;
alter function app_private.catalog_write_audit(uuid, text, text, uuid, uuid, jsonb) owner to postgres;
revoke all on function app_private.catalog_write_audit(uuid, text, text, uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant insert on public.audit_events to postgres;
grant usage, select on sequence public.audit_events_id_seq to postgres;
