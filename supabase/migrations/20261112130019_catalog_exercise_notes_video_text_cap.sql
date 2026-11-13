-- S49 F16: enforce the same Unicode code-point cap at the storage boundary.
-- Audit first and abort atomically; stored values are never rewritten or truncated.
create or replace function app_private.catalog_assert_exercise_text_limits()
returns void
language plpgsql set search_path = '' as $$
declare over_limit_values bigint;
begin
  select count(*) into over_limit_values from (
    select 1 from public.exercise_versions
      where char_length(coalesce(notes, '')) > 2000
        or char_length(coalesce(payload->>'notes', '')) > 2000
        or char_length(coalesce(payload->>'video_url', '')) > 2000
    union all
    select 1 from public.workspace_exercise_versions
      where char_length(coalesce(notes, '')) > 2000
        or char_length(coalesce(payload->>'notes', '')) > 2000
        or char_length(coalesce(payload->>'video_url', '')) > 2000
    union all
    select 1 from public.exercise_override_versions
      where char_length(coalesce(payload->>'notes', '')) > 2000
        or char_length(coalesce(payload->>'video_url', '')) > 2000
    union all
    select 1 from public.exercise_variation_versions
      where char_length(coalesce(payload->>'notes', '')) > 2000
        or char_length(coalesce(payload->>'video_url', '')) > 2000
  ) violations;
  if over_limit_values > 0 then
    raise exception 'catalog_exercise_text_limit_existing_data:%', over_limit_values
      using errcode = '23514';
  end if;
end;
$$;
alter function app_private.catalog_assert_exercise_text_limits() owner to postgres;
revoke all on function app_private.catalog_assert_exercise_text_limits()
  from public, anon, authenticated, service_role;

-- Fail closed before adding any persistent constraints.
select app_private.catalog_assert_exercise_text_limits();

alter table public.exercise_versions
  add constraint exercise_versions_notes_video_text_limit check (
    char_length(coalesce(notes, '')) <= 2000
    and char_length(coalesce(payload->>'notes', '')) <= 2000
    and char_length(coalesce(payload->>'video_url', '')) <= 2000
  );
alter table public.workspace_exercise_versions
  add constraint workspace_exercise_versions_notes_video_text_limit check (
    char_length(coalesce(notes, '')) <= 2000
    and char_length(coalesce(payload->>'notes', '')) <= 2000
    and char_length(coalesce(payload->>'video_url', '')) <= 2000
  );
alter table public.exercise_override_versions
  add constraint exercise_override_versions_notes_video_text_limit check (
    char_length(coalesce(payload->>'notes', '')) <= 2000
    and char_length(coalesce(payload->>'video_url', '')) <= 2000
  );
alter table public.exercise_variation_versions
  add constraint exercise_variation_versions_notes_video_text_limit check (
    char_length(coalesce(payload->>'notes', '')) <= 2000
    and char_length(coalesce(payload->>'video_url', '')) <= 2000
  );
