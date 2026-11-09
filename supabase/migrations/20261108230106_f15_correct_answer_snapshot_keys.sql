-- S35 T103: correction revisions may contain only keys in their immutable snapshot.
create or replace function app_private.enforce_form_revision_snapshot_keys()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  snapshot jsonb;
  entry record;
begin
  select a.version_snapshot into snapshot
  from public.form_assignments a
  where a.workspace_id = new.workspace_id and a.id = new.assignment_id;
  if not found then
    raise exception 'invalid_form_answer_snapshot' using errcode = '23514';
  end if;

  for entry in select key from jsonb_each(new.answer_values) loop
    if not exists (
      select 1 from jsonb_array_elements(coalesce(snapshot->'questions', '[]'::jsonb)) q(value)
      where q.value->>'id' = entry.key
    ) then
      raise exception 'invalid_form_answer_snapshot' using errcode = '23514';
    end if;
  end loop;
  return new;
end
$$;
alter function app_private.enforce_form_revision_snapshot_keys() owner to postgres;
revoke all on function app_private.enforce_form_revision_snapshot_keys() from public, anon, authenticated, service_role;

create trigger form_answer_revisions_snapshot_keys
before insert or update of answer_values on public.form_answer_revisions
for each row execute function app_private.enforce_form_revision_snapshot_keys();
