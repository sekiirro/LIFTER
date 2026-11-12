-- F16 T040 item 7 (S48-PO-7, architect review S48-R16): one workspace exercise
-- library read. Global exercises resolved with the current workspace overrides
-- are UNIONed with the workspace's private exercises, ordered A-Z by the
-- effective English name (case-insensitive) with the identity id as the
-- deterministic tiebreak, and keyset-paginated by one opaque (name,id) cursor.
-- The projection matches catalog_search: no created_by/origin leakage.
drop function if exists public.catalog_workspace_library(uuid,text,jsonb,text,integer);
create function public.catalog_workspace_library(
  p_workspace_id uuid,
  p_query text default null,
  p_filters jsonb default '{}'::jsonb,
  p_cursor text default null,
  p_page_size integer default 20
) returns table (
  result_id uuid,
  result_workspace_id uuid,
  result_version integer,
  result_payload jsonb,
  result_created_by uuid,
  result_origin_workspace_id uuid,
  result_kind text,
  result_cursor text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  page_limit integer := 20;
  normalized_query text;
  muscle_filter text;
  equipment_filter jsonb;
  cursor_name text;
  cursor_id uuid;
  decoded text;
  separator integer;
begin
  -- Authorization first, with one generic denial for foreign or absent scope.
  if auth.uid() is null or p_workspace_id is null
    or not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  if p_filters is null or jsonb_typeof(p_filters) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_filters';
  end if;
  if p_page_size is not null then
    if p_page_size < 1 then
      raise exception using errcode = '22023', message = 'invalid_page_size';
    end if;
    page_limit := least(p_page_size, 50);
  end if;

  if p_cursor is not null then
    if p_cursor !~ '^[0-9a-f]+$' then
      raise exception using errcode = '22023', message = 'invalid_cursor';
    end if;
    begin
      decoded := convert_from(decode(p_cursor, 'hex'), 'UTF8');
    exception when others then
      raise exception using errcode = '22023', message = 'invalid_cursor';
    end;
    separator := position(chr(31) in decoded);
    if separator < 2 then
      raise exception using errcode = '22023', message = 'invalid_cursor';
    end if;
    cursor_name := substr(decoded, 1, separator - 1);
    if substr(decoded, separator + 1)
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'invalid_cursor';
    end if;
    cursor_id := substr(decoded, separator + 1)::uuid;
  end if;

  normalized_query := nullif(app_private.normalize_ar_en_v1(coalesce(p_query, '')), '');
  muscle_filter := p_filters->>'primary_muscle_code';
  equipment_filter := p_filters->'equipment_codes';
  if equipment_filter is not null and jsonb_typeof(equipment_filter) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_equipment_codes';
  end if;

  return query
  with library as (
    select
      'global'::text as kind,
      e.id as result_id,
      null::uuid as result_workspace_id,
      v.version as result_version,
      v.payload || jsonb_build_object('effective_fields', eff.fields)
        as result_payload,
      null::uuid as result_created_by,
      null::uuid as result_origin_workspace_id,
      pg_catalog.lower(coalesce(
        eff.fields -> 'name' -> 'value' ->> 'name_en',
        v.payload ->> 'name_en',
        ''
      )) as sort_name
    from public.exercises e
    join public.exercise_versions v
      on v.exercise_id = e.id and v.version = e.current_version
    cross join lateral (
      select app_private.catalog_effective_exercise_fields(p_workspace_id, e.id)
        as fields
    ) eff
    where e.lifecycle_state = 'active'
      and (normalized_query is null
        or v.name_norm_ar_v1 like '%' || normalized_query || '%'
        or v.name_norm_en_v1 like '%' || normalized_query || '%'
        or (v.name_norm_ar_v1 = '' and v.name_norm_en_v1 = ''
          and v.payload::text ilike '%' || p_query || '%'))
      and (muscle_filter is null
        or v.payload->>'primary_muscle_code' = muscle_filter)
      and (equipment_filter is null
        or coalesce(v.payload->'equipment_codes'
          ?| array(select jsonb_array_elements_text(equipment_filter)), false))

    union all

    select
      'private'::text as kind,
      w.id as result_id,
      p_workspace_id as result_workspace_id,
      wv.version as result_version,
      wv.payload || jsonb_build_object('effective_fields', eff.fields)
        as result_payload,
      null::uuid as result_created_by,
      null::uuid as result_origin_workspace_id,
      pg_catalog.lower(coalesce(
        eff.fields -> 'name' -> 'value' ->> 'name_en',
        wv.payload ->> 'name_en',
        ''
      )) as sort_name
    from public.workspace_exercises w
    join public.workspace_exercise_versions wv
      on wv.workspace_id = w.workspace_id
      and wv.workspace_exercise_id = w.id
      and wv.version = w.current_version
    cross join lateral (
      select app_private.catalog_effective_workspace_exercise_fields(
        p_workspace_id, w.id
      ) as fields
    ) eff
    where w.workspace_id = p_workspace_id
      and w.lifecycle_state = 'active'
      and (normalized_query is null
        or wv.name_norm_ar_v1 like '%' || normalized_query || '%'
        or wv.name_norm_en_v1 like '%' || normalized_query || '%'
        or (wv.name_norm_ar_v1 = '' and wv.name_norm_en_v1 = ''
          and wv.payload::text ilike '%' || p_query || '%'))
      and (muscle_filter is null
        or wv.payload->>'primary_muscle_code' = muscle_filter)
      and (equipment_filter is null
        or coalesce(wv.payload->'equipment_codes'
          ?| array(select jsonb_array_elements_text(equipment_filter)), false))
  )
  select l.result_id, l.result_workspace_id, l.result_version, l.result_payload,
    l.result_created_by, l.result_origin_workspace_id, l.kind,
    pg_catalog.encode(pg_catalog.convert_to(
      l.sort_name || chr(31) || l.result_id::text, 'UTF8'
    ), 'hex') as result_cursor
  from library l
  where p_cursor is null
    or (l.sort_name, l.result_id) > (cursor_name, cursor_id)
  order by l.sort_name asc, l.result_id asc
  limit page_limit;
end;
$$;
alter function public.catalog_workspace_library(uuid,text,jsonb,text,integer) owner to postgres;
revoke all on function public.catalog_workspace_library(uuid,text,jsonb,text,integer)
  from public, anon, service_role;
grant execute on function public.catalog_workspace_library(uuid,text,jsonb,text,integer)
  to authenticated;
