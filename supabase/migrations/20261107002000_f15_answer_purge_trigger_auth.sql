-- T018: caller identity must be evaluated as the purge owner or actual caller.
create or replace function app_private.guard_form_answer_revision_immutable()
returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  client_id uuid;
  purge_scope text := current_setting('app_private.f15_retention_purge', true);
begin
  if tg_op = 'DELETE' and current_user = 'postgres' then
    select a.client_id into client_id from public.form_assignments a
    where a.workspace_id = old.workspace_id and a.id = old.assignment_id;
    if purge_scope = old.workspace_id::text || ':' || client_id::text then
      return old;
    end if;
  end if;
  raise exception 'form answer revisions are immutable' using errcode = '23514';
end
$$;
alter function app_private.guard_form_answer_revision_immutable() owner to postgres;
revoke all on function app_private.guard_form_answer_revision_immutable()
  from public,anon,authenticated,service_role;

create or replace function app_private.guard_form_correction_immutable()
returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  scoped_client uuid;
  purge_scope text := current_setting('app_private.f15_retention_purge', true);
begin
  if tg_op = 'DELETE' and current_user = 'postgres' then
    select a.client_id into scoped_client from public.form_assignments a
    where a.workspace_id = old.workspace_id and a.id = old.assignment_id;
    if purge_scope = old.workspace_id::text || ':' || scoped_client::text then
      return old;
    end if;
  end if;
  raise exception 'form answer revisions are immutable' using errcode = '23514';
end
$$;
alter function app_private.guard_form_correction_immutable() owner to postgres;
revoke all on function app_private.guard_form_correction_immutable()
  from public,anon,authenticated,service_role;
