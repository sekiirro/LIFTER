-- F15 T003: workspace ownership is part of the Forms identity key.
-- Replace the globally unique form UUID with a tenant-composite key while
-- preserving the existing version-to-form same-workspace foreign key.
alter table public.form_versions
  drop constraint form_versions_workspace_id_form_id_fkey;

alter table public.forms
  drop constraint forms_workspace_id_id_key,
  drop constraint forms_pkey;

alter table public.forms
  add constraint forms_pkey primary key (workspace_id, id);

alter table public.form_versions
  add constraint form_versions_workspace_id_form_id_fkey
  foreign key (workspace_id, form_id)
  references public.forms(workspace_id, id) on delete restrict;
