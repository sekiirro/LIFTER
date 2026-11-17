-- F17 T020: require a submitted F15 intake before workout delivery.
-- The Plan Core implementation remains the only revision/delivery writer.
create or replace function public.ready_and_publish_plan(
  p_plan_id uuid,
  p_expected_draft_version bigint,
  p_expected_published_version bigint,
  p_operation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  root public.plan_roots%rowtype;
begin
  if actor is null then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  select * into root from public.plan_roots p where p.id = p_plan_id;
  if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  if root.plan_kind <> 'workout' then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  perform 1 from public.clients c
    where c.workspace_id = root.workspace_id and c.id = root.client_id for update;
  if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  if not exists (
    select 1
    from public.form_assignments a
    join app_private.form_submissions s
      on s.workspace_id = a.workspace_id and s.assignment_id = a.id
    where a.workspace_id = root.workspace_id and a.client_id = root.client_id
  ) then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  return app_private.ready_and_publish_plan_impl(
    p_plan_id,
    p_expected_draft_version,
    p_expected_published_version,
    p_operation_key
  );
end $$;

alter function public.ready_and_publish_plan(uuid, bigint, bigint, uuid) owner to postgres;
revoke all on function public.ready_and_publish_plan(uuid, bigint, bigint, uuid)
  from public, anon, service_role;
grant execute on function public.ready_and_publish_plan(uuid, bigint, bigint, uuid)
  to authenticated;
