-- F17 stores workout documents in the F19-owned plan draft/revision content.
-- Keep the existing Plan Core lifecycle and composite workspace keys.
do $migration$
declare
  constraint_count integer;
  constrained_table_count integer;
begin
  select count(*), count(distinct c.conrelid)
  into constraint_count, constrained_table_count
  from pg_catalog.pg_constraint c
  where c.contype = 'f'
    and c.confrelid = 'public.plan_roots'::regclass
    and c.conrelid in ('public.plan_drafts'::regclass, 'public.plan_revisions'::regclass)
    and pg_catalog.cardinality(c.conkey) = 2
    and pg_catalog.cardinality(c.confkey) = 2;

  if constraint_count <> 2 or constrained_table_count <> 2 then
    raise exception 'f17_requires_f19_composite_plan_keys';
  end if;
end
$migration$;

create function app_private.f17_validate_workout_schema_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_plan_kind text;
begin
  if tg_table_name = 'plan_drafts' then
    select r.plan_kind into target_plan_kind
    from public.plan_roots r
    where r.workspace_id = new.workspace_id
      and r.id = new.plan_id;
  else
    target_plan_kind := new.plan_kind;
  end if;

  if target_plan_kind is distinct from 'workout' then
    return new;
  end if;

  -- This database registry currently contains the immutable schema-v1 parser.
  -- Add a forward migration before a future version is accepted.
  if pg_catalog.jsonb_typeof(new.content) is distinct from 'object'
    or pg_catalog.jsonb_typeof(new.content -> 'schema_version') is distinct from 'number'
    or new.content ->> 'schema_version' is distinct from '1'
    or pg_catalog.jsonb_typeof(new.content -> 'days') is distinct from 'array' then
    raise exception 'invalid_workout_document' using errcode = '23514';
  end if;

  return new;
end
$function$;

create function app_private.f17_validate_workout_document_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_plan_kind text;
begin
  if tg_table_name = 'plan_drafts' then
    select r.plan_kind into target_plan_kind
    from public.plan_roots r
    where r.workspace_id = new.workspace_id
      and r.id = new.plan_id;
  else
    target_plan_kind := new.plan_kind;
  end if;

  if target_plan_kind is distinct from 'workout' then
    return new;
  end if;

  -- T015 carries the historical 512 KiB value as a provisional guard only.
  -- It is not a benchmarked or final product limit (spec SC-014).
  if pg_catalog.octet_length(new.content::text) > 524288 then
    raise exception 'invalid_workout_document' using errcode = '23514';
  end if;

  return new;
end
$function$;

revoke all on function app_private.f17_validate_workout_schema_version()
  from public, anon, authenticated, service_role;
revoke all on function app_private.f17_validate_workout_document_size()
  from public, anon, authenticated, service_role;

create trigger f17_validate_workout_draft_schema_version
before insert or update of content on public.plan_drafts
for each row execute function app_private.f17_validate_workout_schema_version();

create trigger f17_validate_workout_revision_schema_version
before insert on public.plan_revisions
for each row execute function app_private.f17_validate_workout_schema_version();

create trigger f17_validate_workout_draft_document_size
before insert or update of content on public.plan_drafts
for each row execute function app_private.f17_validate_workout_document_size();

create trigger f17_validate_workout_revision_document_size
before insert on public.plan_revisions
for each row execute function app_private.f17_validate_workout_document_size();

comment on function app_private.f17_validate_workout_schema_version() is
  'Validates F17 schema-v1 workout content on F19 draft and revision rows.';
comment on function app_private.f17_validate_workout_document_size() is
  'Applies the provisional historical F17 512 KiB limit; not a final cap.';
