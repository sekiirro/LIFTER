-- F16 T006: versioned catalog taxonomy only. Catalog identities are added by
-- later migrations; no exercise or food content is imported here.
create table public.taxonomy_terms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('muscle_group', 'equipment')),
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  created_at timestamptz not null default now(),
  constraint taxonomy_terms_kind_code_key unique (kind, code)
);

create table public.taxonomy_term_versions (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.taxonomy_terms(id) on delete restrict,
  version integer not null check (version > 0),
  label_ar text not null check (btrim(label_ar) <> ''),
  label_en text not null check (btrim(label_en) <> ''),
  lifecycle text not null default 'active' check (lifecycle in ('active', 'removed')),
  created_at timestamptz not null default now(),
  constraint taxonomy_term_versions_term_version_key unique (term_id, version),
  constraint taxonomy_term_versions_term_id_id_key unique (term_id, id)
);

with seed(kind, code, label_en, label_ar) as (
  values
    ('muscle_group', 'chest', 'Chest', 'الصدر'),
    ('muscle_group', 'lats', 'Lats', 'العضلات الظهرية العريضة'),
    ('muscle_group', 'upper_back', 'Upper Back', 'أعلى الظهر'),
    ('muscle_group', 'traps', 'Traps', 'العضلات شبه المنحرفة'),
    ('muscle_group', 'front_delts', 'Front Delts', 'الكتف الأمامي'),
    ('muscle_group', 'side_delts', 'Side Delts', 'الكتف الجانبي'),
    ('muscle_group', 'rear_delts', 'Rear Delts', 'الكتف الخلفي'),
    ('muscle_group', 'biceps', 'Biceps', 'العضلة ذات الرأسين'),
    ('muscle_group', 'triceps', 'Triceps', 'العضلة ثلاثية الرؤوس'),
    ('muscle_group', 'forearms', 'Forearms', 'الساعدان'),
    ('muscle_group', 'abs', 'Abs', 'عضلات البطن'),
    ('muscle_group', 'spinal_erectors', 'Spinal Erectors', 'ناصبات العمود الفقري'),
    ('muscle_group', 'quads', 'Quads', 'العضلات رباعية الرؤوس'),
    ('muscle_group', 'hamstrings', 'Hamstrings', 'أوتار المأبض'),
    ('muscle_group', 'glutes', 'Glutes', 'الأرداف'),
    ('muscle_group', 'adductors', 'Adductors', 'العضلات المقربة'),
    ('muscle_group', 'abductors', 'Abductors', 'العضلات المبعدة'),
    ('muscle_group', 'calves', 'Calves', 'عضلات الساق'),
    ('equipment', 'barbell', 'Barbell', 'باربل'),
    ('equipment', 'dumbbell', 'Dumbbell', 'دمبل'),
    ('equipment', 'cable', 'Cable', 'كابل'),
    ('equipment', 'machine', 'Machine', 'آلة رياضية'),
    ('equipment', 'smith_machine', 'Smith Machine', 'جهاز سميث'),
    ('equipment', 'bodyweight', 'Bodyweight', 'وزن الجسم'),
    ('equipment', 'kettlebell', 'Kettlebell', 'كرة حديدية'),
    ('equipment', 'resistance_band', 'Resistance Band', 'شريط مقاومة'),
    ('equipment', 'suspension_trainer', 'Suspension Trainer', 'جهاز تدريب معلق'),
    ('equipment', 'other', 'Other', 'أخرى')
), inserted_terms as (
  insert into public.taxonomy_terms (kind, code)
  select kind, code from seed
  returning id, kind, code
)
insert into public.taxonomy_term_versions (term_id, version, label_en, label_ar)
select t.id, 1, s.label_en, s.label_ar
from inserted_terms t
join seed s using (kind, code);

alter table public.taxonomy_terms enable row level security;
alter table public.taxonomy_terms force row level security;
alter table public.taxonomy_term_versions enable row level security;
alter table public.taxonomy_term_versions force row level security;

revoke all on public.taxonomy_terms, public.taxonomy_term_versions from public, anon, authenticated;
grant select on public.taxonomy_terms, public.taxonomy_term_versions to authenticated;

create policy taxonomy_terms_global_read on public.taxonomy_terms
  for select to authenticated
  using (
    (select app_private.is_platform_owner())
    or (
      (select app_private.role_has_capability(app_private.current_staff_role(), 'coaching_work'))
      and exists (
        select 1 from public.workspace_memberships m
        where m.user_id = (select auth.uid()) and m.revoked_at is null
      )
    )
  );

create policy taxonomy_term_versions_global_read on public.taxonomy_term_versions
  for select to authenticated
  using (
    (select app_private.is_platform_owner())
    or (
      (select app_private.role_has_capability(app_private.current_staff_role(), 'coaching_work'))
      and exists (
        select 1 from public.workspace_memberships m
        where m.user_id = (select auth.uid()) and m.revoked_at is null
      )
    )
  );
