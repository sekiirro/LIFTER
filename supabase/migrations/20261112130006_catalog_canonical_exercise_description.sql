-- F16 T044: persist one optional Description value in immutable canonical versions.
-- Copied as a complete definition from the current T043 validator; only the
-- approved canonical Description key and its scalar shape are added here.
create or replace function app_private.validate_exercise_payload(p_request jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare bad boolean;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_request) as keys(key)
      where key not in ('name_ar','name_en','primary_muscle_code','secondary_muscle_codes','equipment_codes','instructions_ar','instructions_en','defaults','video_url','description'))
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
    or (p_request ? 'description' and jsonb_typeof(p_request -> 'description') is distinct from 'string')
    or coalesce(jsonb_typeof(p_request -> 'equipment_codes') <> 'array', true)
    or jsonb_array_length(p_request -> 'equipment_codes') = 0
    or (p_request ? 'secondary_muscle_codes' and jsonb_typeof(p_request -> 'secondary_muscle_codes') <> 'array') then
    raise exception 'catalog_exercise_invalid' using errcode = '22023';
  end if;
  if p_request ? 'video_url' and (
    jsonb_typeof(p_request -> 'video_url') is distinct from 'string'
    or not app_private.catalog_video_url_allowed(p_request ->> 'video_url')
  ) then raise exception 'catalog_exercise_invalid' using errcode = '22023'; end if;
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
