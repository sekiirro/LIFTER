alter table public.form_assignments
  add constraint form_assignment_occurrence_binding_fk
    foreign key (workspace_id, policy_id, occurrence_key)
    references app_private.form_assignment_occurrences(workspace_id, policy_id, occurrence_key)
    on delete restrict,
  add constraint form_assignment_policy_facts_complete
    check ((policy_id is null) = (client_deadline_at is null)
      and (policy_id is null) = (configured_by is null));
