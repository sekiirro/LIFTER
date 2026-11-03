-- F16 T012: keep catalog writes behind approved RPCs; reads remain RLS protected.
revoke all on public.taxonomy_terms, public.taxonomy_term_versions,
  public.exercises, public.exercise_versions, public.foods, public.food_versions,
  public.food_serving_units, public.food_alternatives,
  public.workspace_exercises, public.workspace_exercise_versions,
  public.exercise_variations, public.exercise_variation_versions
  from public, anon, authenticated, service_role;
revoke all on app_private.operation_keys from public, anon, authenticated, service_role;

grant select on public.taxonomy_terms, public.taxonomy_term_versions to authenticated;
grant select (id, created_at, lifecycle_state, superseded_by, current_version)
  on public.exercises to authenticated;
grant select (exercise_id, version, payload, created_at)
  on public.exercise_versions to authenticated;
grant select (id, created_at, lifecycle_state, superseded_by, current_version)
  on public.foods to authenticated;
grant select (food_id, version, payload, created_at)
  on public.food_versions to authenticated;
grant select on public.food_serving_units, public.food_alternatives to authenticated;
grant select on public.workspace_exercises, public.workspace_exercise_versions,
  public.exercise_variations, public.exercise_variation_versions to authenticated;

revoke all on public.catalog_foods_safe, public.catalog_food_versions_safe,
  public.catalog_food_serving_units_safe from public, anon, service_role;
grant select on public.catalog_foods_safe, public.catalog_food_versions_safe,
  public.catalog_food_serving_units_safe to authenticated;

-- Read RPC only: the invoker must satisfy the same RLS as direct reads.
alter function public.catalog_search(text, text, jsonb, text, uuid) owner to postgres;
revoke all on function public.catalog_search(text, text, jsonb, text, uuid)
  from public, anon, service_role, authenticated;
grant execute on function public.catalog_search(text, text, jsonb, text, uuid) to authenticated;

-- SECURITY DEFINER helpers are postgres-owned, empty-path, and private to RPC owners.
alter function app_private.catalog_write_audit(uuid, text, text, uuid, uuid, jsonb) owner to postgres;
revoke all on function app_private.catalog_write_audit(uuid, text, text, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
alter function app_private.operation_key_result(uuid, text, uuid, text) owner to postgres;
revoke all on function app_private.operation_key_result(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
alter function app_private.operation_key_retention_days() owner to postgres;
revoke all on function app_private.operation_key_retention_days()
  from public, anon, authenticated, service_role;
alter function app_private.purge_operation_keys() owner to postgres;
revoke all on function app_private.purge_operation_keys()
  from public, anon, authenticated, service_role;
