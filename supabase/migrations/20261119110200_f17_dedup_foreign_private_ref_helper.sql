-- F17 T031: Deduplicate app_private.f17_workout_has_foreign_private_reference by delegating
-- f17_guard_workout_references() to #139's (jsonb, uuid) helper and dropping the (uuid, jsonb) overload.

create or replace function app_private.f17_guard_workout_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_plan_kind text;
begin
  if tg_table_name = 'plan_drafts' then
    select r.plan_kind into target_plan_kind
    from public.plan_roots r
    where r.workspace_id = new.workspace_id
      and r.id = new.plan_id;
  else
    target_plan_kind := new.plan_kind;
  end if;

  if target_plan_kind is distinct from 'workout' then
    return new;
  end if;

  if app_private.f17_workout_has_foreign_private_reference(new.content, new.workspace_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  return new;
end
$function$;

alter function app_private.f17_guard_workout_references() owner to postgres;
revoke all on function app_private.f17_guard_workout_references()
  from public, anon, authenticated, service_role;

drop function app_private.f17_workout_has_foreign_private_reference(uuid, jsonb);
