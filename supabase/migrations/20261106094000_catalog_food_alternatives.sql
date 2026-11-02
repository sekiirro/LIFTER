-- F16 T010: immutable per-version food alternatives and positive, basis-bound
-- portions. Plan-specific overrides are stored by the planner, never here.
create table public.food_alternatives (
  food_id uuid not null,
  food_version integer not null,
  position smallint not null check (position between 1 and 3),
  source_basis text not null check (source_basis in ('g', 'ml')),
  source_portion numeric(12,3) not null check (source_portion > 0),
  alternative_food_id uuid not null,
  alternative_version integer not null,
  alternative_basis text not null check (alternative_basis in ('g', 'ml')),
  alternative_portion numeric(12,3) not null check (alternative_portion > 0),
  created_at timestamptz not null default now(),
  primary key (food_id, food_version, position),
  unique (food_id, food_version, alternative_food_id, alternative_version),
  foreign key (food_id, food_version, source_basis)
    references public.food_versions(food_id, version, basis) on delete restrict,
  foreign key (alternative_food_id, alternative_version, alternative_basis)
    references public.food_versions(food_id, version, basis) on delete restrict,
  check ((food_id, food_version) <> (alternative_food_id, alternative_version))
);

create index food_alternatives_target_idx on public.food_alternatives(alternative_food_id, alternative_version);

alter table public.food_alternatives enable row level security;
alter table public.food_alternatives force row level security;
create policy food_alternatives_global_read on public.food_alternatives
  for select to authenticated using ((select app_private.catalog_can_read_global()));

revoke all on public.food_alternatives from public, anon, authenticated, service_role;
grant select on public.food_alternatives to authenticated;
