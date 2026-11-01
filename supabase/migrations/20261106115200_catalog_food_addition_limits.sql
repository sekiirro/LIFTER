-- F16 T028: serialize Add quota checks with the same transactional locks used by writers.
create index foods_creator_rolling_limit_idx on public.foods(created_by, created_at desc);
create index foods_active_limit_idx on public.foods(id) where lifecycle_state = 'active';

create table public.catalog_addition_limits (
  food_id uuid primary key references public.foods(id) on delete restrict,
  creator_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null,
  active boolean not null
);
create index catalog_addition_limits_creator_window_idx
  on public.catalog_addition_limits(creator_user_id, created_at desc);
create index catalog_addition_limits_active_idx on public.catalog_addition_limits(food_id) where active;
alter table public.catalog_addition_limits enable row level security;
alter table public.catalog_addition_limits force row level security;
revoke all on public.catalog_addition_limits from public, anon, authenticated, service_role;
insert into public.catalog_addition_limits(food_id, creator_user_id, created_at, active)
  select id, created_by, created_at, lifecycle_state = 'active' from public.foods;

create function app_private.sync_catalog_addition_limits()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.catalog_addition_limits(food_id, creator_user_id, created_at, active)
      values (new.id, new.created_by, new.created_at, new.lifecycle_state = 'active');
    return new;
  end if;
  if new.lifecycle_state is distinct from old.lifecycle_state then
    update public.catalog_addition_limits set active = new.lifecycle_state = 'active' where food_id = new.id;
  end if;
  return new;
end;
$$;
alter function app_private.sync_catalog_addition_limits() owner to postgres;
revoke all on function app_private.sync_catalog_addition_limits() from public, anon, authenticated, service_role;
create trigger catalog_addition_limits_sync
  after insert or update of lifecycle_state on public.foods
  for each row execute function app_private.sync_catalog_addition_limits();

-- Preserve the already-reviewed create path and splice the quota predicates around its
-- replay check. The migration fails closed if the expected source contract has drifted.
do $$
declare
  definition text := pg_catalog.pg_get_functiondef('public.catalog_create_food(uuid,uuid,jsonb)'::regprocedure);
  locked_definition text;
  replay_definition text;
begin
  locked_definition := pg_catalog.replace(
    definition,
    '  perform app_private.lock_catalog_food_request(actor, p_operation_key, p_request);',
    '  perform app_private.lock_catalog_food_request(actor, p_operation_key, p_request);' || E'\n' ||
    '  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''catalog.food.addition_limits.global'', 0));'
  );
  if locked_definition = definition then raise exception 'catalog_food_create_lock_contract_missing'; end if;
  replay_definition := pg_catalog.replace(
    locked_definition,
    '  if replay is not null then return replay; end if;',
    '  if replay is not null then return replay; end if;' || E'\n' ||
    '  if (select count(*) from public.catalog_addition_limits l where l.creator_user_id = actor and l.created_at >= statement_timestamp() - interval ''24 hours'') >= 10 then' || E'\n' ||
    '    raise exception ''catalog_food_creator_limit'' using errcode = ''23514'';' || E'\n' ||
    '  end if;' || E'\n' ||
    '  if (select count(*) from public.catalog_addition_limits l where l.created_at >= statement_timestamp() - interval ''24 hours'') >= 100 then' || E'\n' ||
    '    raise exception ''catalog_food_platform_limit'' using errcode = ''23514'';' || E'\n' ||
    '  end if;' || E'\n' ||
    '  if (select count(*) from public.catalog_addition_limits l where l.active) >= 10000 then' || E'\n' ||
    '    raise exception ''catalog_food_active_limit'' using errcode = ''23514'';' || E'\n' ||
    '  end if;'
  );
  if replay_definition = locked_definition then raise exception 'catalog_food_create_replay_contract_missing'; end if;
  execute replay_definition;
end;
$$;

-- Restore participates in the same active-food ceiling lock and checks after replay.
do $$
declare
  definition text := pg_catalog.pg_get_functiondef('public.catalog_transition_food(uuid,integer,text,uuid)'::regprocedure);
  locked_definition text;
  replay_definition text;
begin
  locked_definition := pg_catalog.replace(
    definition,
    '  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''catalog.food.lifecycle:'' || p_food_id::text, 0));',
    '  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''catalog.food.lifecycle:'' || p_food_id::text, 0));' || E'\n' ||
    '  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''catalog.food.addition_limits.global'', 0));'
  );
  if locked_definition = definition then raise exception 'catalog_food_lifecycle_lock_contract_missing'; end if;
  replay_definition := pg_catalog.replace(
    locked_definition,
    '  if replay is not null then return replay; end if;',
    '  if replay is not null then return replay; end if;' || E'\n' ||
    '  if p_transition = ''restore'' and (select count(*) from public.catalog_addition_limits l where l.active) >= 10000 then' || E'\n' ||
    '    raise exception ''catalog_food_active_limit'' using errcode = ''23514'';' || E'\n' ||
    '  end if;'
  );
  if replay_definition = locked_definition then raise exception 'catalog_food_lifecycle_replay_contract_missing'; end if;
  execute replay_definition;
end;
$$;
