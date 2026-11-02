-- F16 T013: standardize global and tenant-local read walls on all catalog tables.
alter table public.taxonomy_terms enable row level security;
alter table public.taxonomy_terms force row level security;
alter table public.taxonomy_term_versions enable row level security;
alter table public.taxonomy_term_versions force row level security;
alter table public.exercises enable row level security;
alter table public.exercises force row level security;
alter table public.exercise_versions enable row level security;
alter table public.exercise_versions force row level security;
alter table public.foods enable row level security;
alter table public.foods force row level security;
alter table public.food_versions enable row level security;
alter table public.food_versions force row level security;
alter table public.food_serving_units enable row level security;
alter table public.food_serving_units force row level security;
alter table public.food_alternatives enable row level security;
alter table public.food_alternatives force row level security;
alter table public.workspace_exercises enable row level security;
alter table public.workspace_exercises force row level security;
alter table public.workspace_exercise_versions enable row level security;
alter table public.workspace_exercise_versions force row level security;
alter table public.exercise_variations enable row level security;
alter table public.exercise_variations force row level security;
alter table public.exercise_variation_versions enable row level security;
alter table public.exercise_variation_versions force row level security;

drop policy if exists taxonomy_terms_global_read on public.taxonomy_terms;
create policy taxonomy_terms_global_read on public.taxonomy_terms
  for select to authenticated using ((select app_private.catalog_can_read_global()));
drop policy if exists taxonomy_term_versions_global_read on public.taxonomy_term_versions;
create policy taxonomy_term_versions_global_read on public.taxonomy_term_versions
  for select to authenticated using ((select app_private.catalog_can_read_global()));
drop policy if exists exercises_global_read on public.exercises;
create policy exercises_global_read on public.exercises
  for select to authenticated using ((select app_private.catalog_can_read_global()));
drop policy if exists exercise_versions_global_read on public.exercise_versions;
create policy exercise_versions_global_read on public.exercise_versions
  for select to authenticated using ((select app_private.catalog_can_read_global()));
drop policy if exists foods_global_read on public.foods;
create policy foods_global_read on public.foods
  for select to authenticated using ((select app_private.catalog_can_read_global()));
drop policy if exists food_versions_global_read on public.food_versions;
create policy food_versions_global_read on public.food_versions
  for select to authenticated using ((select app_private.catalog_can_read_global()));
drop policy if exists food_serving_units_global_read on public.food_serving_units;
create policy food_serving_units_global_read on public.food_serving_units
  for select to authenticated using ((select app_private.catalog_can_read_global()));
drop policy if exists food_alternatives_global_read on public.food_alternatives;
create policy food_alternatives_global_read on public.food_alternatives
  for select to authenticated using ((select app_private.catalog_can_read_global()));

drop policy if exists workspace_exercises_scope_read on public.workspace_exercises;
create policy workspace_exercises_scope_read on public.workspace_exercises
  for select to authenticated using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
drop policy if exists workspace_exercise_versions_scope_read on public.workspace_exercise_versions;
create policy workspace_exercise_versions_scope_read on public.workspace_exercise_versions
  for select to authenticated using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
drop policy if exists exercise_variations_scope_read on public.exercise_variations;
create policy exercise_variations_scope_read on public.exercise_variations
  for select to authenticated using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
drop policy if exists exercise_variation_versions_scope_read on public.exercise_variation_versions;
create policy exercise_variation_versions_scope_read on public.exercise_variation_versions
  for select to authenticated using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
