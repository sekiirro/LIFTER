-- F16 T043: canonical exercise Video belongs to immutable version payloads.
-- Extend only the shared Global validator key set; all existing checks remain.
do $migration$
declare
  source text;
begin
  source := pg_catalog.pg_get_functiondef('app_private.validate_exercise_payload(jsonb)'::regprocedure);
  if position('catalog_video_url_allowed' in source) = 0 then
    source := replace(source,
      $find$'equipment_codes','instructions_ar','instructions_en','defaults'$find$,
      $replace$'equipment_codes','instructions_ar','instructions_en','defaults','video_url'$replace$);
    source := replace(source,
      $find$  return p_request;$find$,
      $replace$  if p_request ? 'video_url' and (
    jsonb_typeof(p_request -> 'video_url') is distinct from 'string'
    or not app_private.catalog_video_url_allowed(p_request ->> 'video_url')
  ) then raise exception 'catalog_exercise_invalid' using errcode = '22023'; end if;
  return p_request;$replace$);
    execute source;
  end if;
end;
$migration$;

-- Keep the established immutable-version operations and report Video in the
-- existing changed-field audit vocabulary.
do $migration$
declare
  source text;
begin
  source := pg_catalog.pg_get_functiondef('public.catalog_create_exercise(uuid,jsonb)'::regprocedure);
  source := replace(source,
    $find$jsonb_build_array('name_ar','name_en','muscle_group','secondary_muscles','equipment','defaults')$find$,
    $replace$jsonb_build_array('name_ar','name_en','muscle_group','secondary_muscles','equipment','defaults','video')$replace$);
  execute source;
  source := pg_catalog.pg_get_functiondef('public.catalog_version_exercise(uuid,integer,uuid,jsonb)'::regprocedure);
  source := replace(source,
    $find$jsonb_build_array('name_ar','name_en','muscle_group','secondary_muscles','equipment','defaults')$find$,
    $replace$jsonb_build_array('name_ar','name_en','muscle_group','secondary_muscles','equipment','defaults','video')$replace$);
  execute source;
end;
$migration$;
