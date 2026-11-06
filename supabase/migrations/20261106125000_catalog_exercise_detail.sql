-- S27-R2a: privacy-safe current exercise projection with lifecycle resolution.
create view public.catalog_exercises_safe with (security_barrier = true) as
  select e.id, e.current_version, e.lifecycle_state, e.created_at,
    case when (select app_private.is_platform_owner()) then e.created_by else null::uuid end as created_by,
    null::uuid as origin_workspace_id
  from public.exercises e
  where (select app_private.catalog_can_read_global());

create view public.catalog_exercise_versions_safe with (security_barrier = true) as
  select v.exercise_id, v.version, v.payload, v.created_at,
    case when (select app_private.is_platform_owner()) then v.created_by else null::uuid end as created_by,
    null::uuid as origin_workspace_id,
    v.payload ->> 'name_ar' as name_ar,
    v.payload ->> 'name_en' as name_en,
    v.payload ->> 'primary_muscle_code' as primary_muscle_code,
    v.payload -> 'secondary_muscle_codes' as secondary_muscle_codes,
    v.payload -> 'equipment_codes' as equipment_codes,
    v.payload -> 'defaults' as defaults
  from public.exercise_versions v
  join public.exercises e on e.id = v.exercise_id
  where (select app_private.catalog_can_read_global());

alter view public.catalog_exercises_safe owner to postgres;
alter view public.catalog_exercise_versions_safe owner to postgres;
revoke all on public.catalog_exercises_safe, public.catalog_exercise_versions_safe from public, anon, service_role;
grant select on public.catalog_exercises_safe, public.catalog_exercise_versions_safe to authenticated;

-- Keep the existing exercise write RPCs bounded at their shared validation wall.
create or replace function app_private.validate_exercise_payload(p_request jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare bad boolean;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_request) as keys(key)
      where key not in ('name_ar','name_en','primary_muscle_code','secondary_muscle_codes','equipment_codes','instructions_ar','instructions_en','defaults'))
    or jsonb_typeof(p_request -> 'name_ar') is distinct from 'string'
    or jsonb_typeof(p_request -> 'name_en') is distinct from 'string'
    or nullif(btrim(p_request ->> 'name_ar'), '') is null
    or nullif(btrim(p_request ->> 'name_en'), '') is null
    or char_length(p_request ->> 'name_ar') > 120
    or char_length(p_request ->> 'name_en') > 120
    or (p_request ? 'instructions_ar' and (jsonb_typeof(p_request -> 'instructions_ar') is distinct from 'string'
      or char_length(p_request ->> 'instructions_ar') > 2000))
    or (p_request ? 'instructions_en' and (jsonb_typeof(p_request -> 'instructions_en') is distinct from 'string'
      or char_length(p_request ->> 'instructions_en') > 2000))
    or coalesce(jsonb_typeof(p_request -> 'equipment_codes') <> 'array', true)
    or jsonb_array_length(p_request -> 'equipment_codes') = 0
    or (p_request ? 'secondary_muscle_codes' and jsonb_typeof(p_request -> 'secondary_muscle_codes') <> 'array') then
    raise exception 'catalog_exercise_invalid' using errcode = '22023';
  end if;
  select not exists (
    select 1 from public.taxonomy_terms t
    join public.taxonomy_term_versions v on v.term_id = t.id
      and v.version = (select max(v2.version) from public.taxonomy_term_versions v2 where v2.term_id = t.id)
    where t.kind = 'muscle_group' and t.code = p_request ->> 'primary_muscle_code' and v.lifecycle = 'active'
  ) into bad;
  if bad then raise exception 'catalog_exercise_taxonomy_invalid' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_request -> 'equipment_codes') c(code)
    where not exists (
      select 1 from public.taxonomy_terms t
      join public.taxonomy_term_versions v on v.term_id = t.id
        and v.version = (select max(v2.version) from public.taxonomy_term_versions v2 where v2.term_id = t.id)
      where t.kind = 'equipment' and t.code = c.code and v.lifecycle = 'active'
    )
  ) or exists (
    select 1 from jsonb_array_elements_text(coalesce(p_request -> 'secondary_muscle_codes', '[]'::jsonb)) c(code)
    where not exists (
      select 1 from public.taxonomy_terms t
      join public.taxonomy_term_versions v on v.term_id = t.id
        and v.version = (select max(v2.version) from public.taxonomy_term_versions v2 where v2.term_id = t.id)
      where t.kind = 'muscle_group' and t.code = c.code and v.lifecycle = 'active'
    )
  ) then raise exception 'catalog_exercise_taxonomy_invalid' using errcode = '22023'; end if;
  return p_request;
end;
$$;
alter function app_private.validate_exercise_payload(jsonb) owner to postgres;
revoke all on function app_private.validate_exercise_payload(jsonb) from public, anon, authenticated, service_role;

create function public.catalog_exercise_detail(p_exercise_id uuid, p_workspace_id uuid default null)
returns table (
  exercise_id uuid,
  version integer,
  payload jsonb,
  created_at timestamptz,
  created_by uuid,
  origin_workspace_id uuid,
  name_ar text,
  name_en text,
  requested_id uuid,
  survivor_id uuid,
  lifecycle_state text,
  variation jsonb
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  requested public.catalog_exercises_safe%rowtype;
  survivor_id_value uuid;
  survivor public.catalog_exercises_safe%rowtype;
  variation_value jsonb;
  variation_row record;
begin
  if p_exercise_id is null or not app_private.catalog_can_read_global() then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  select e.* into requested
    from public.catalog_exercises_safe e
    where e.id = p_exercise_id;
  if not found then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  survivor_id_value := public.catalog_resolve_exercise_selection(p_exercise_id);
  if survivor_id_value is null and requested.lifecycle_state = 'removed' then
    survivor_id_value := requested.id;
  end if;
  if survivor_id_value is null then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  select e.* into survivor
    from public.catalog_exercises_safe e
    where e.id = survivor_id_value;
  if not found then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  if p_workspace_id is not null then
    begin
      select jsonb_build_object(
        'workspace_id', v.workspace_id,
        'video_url', v.video_url
      ) into variation_value
      from public.catalog_resolve_exercise_video(survivor_id_value, p_workspace_id) v
      where v.exercise_id = survivor_id_value and v.workspace_id = p_workspace_id;
    exception when sqlstate '42501' then
      variation_value := null;
    end;
  end if;

  return query
    select v.exercise_id, v.version, v.payload, v.created_at, v.created_by,
      v.origin_workspace_id, v.name_ar, v.name_en,
      p_exercise_id, survivor_id_value, survivor.lifecycle_state, variation_value
    from public.catalog_exercise_versions_safe v
    where v.exercise_id = survivor_id_value
      and v.version = survivor.current_version;
end;
$$;

alter function public.catalog_exercise_detail(uuid, uuid) owner to postgres;
revoke all on function public.catalog_exercise_detail(uuid, uuid) from public, anon, service_role;
grant execute on function public.catalog_exercise_detail(uuid, uuid) to authenticated;
