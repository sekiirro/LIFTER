-- S73-R58: expose the approved correction-history projection to Platform
-- Owners while keeping direct access to the retained strike tables revoked.
create function public.get_workforce_strike_correction_history(
  p_workspace_id uuid,
  p_strike_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  history jsonb;
begin
  -- Check the caller before looking up either supplied identifier.
  if auth.uid() is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_strike_id is null then
    return jsonb_build_object('status', 'not_permitted');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'strike_id', c.strike_id,
        'action', c.correction_kind,
        'reason_code', c.reason_code,
        'actor_display_name', actor.display_name,
        'created_at', c.recorded_at
      ) order by c.correction_no
    ),
    '[]'::jsonb
  )
  into history
  from public.workforce_strike_corrections c
  left join public.staff_profiles actor on actor.user_id = c.actor_user_id
  where c.workspace_id = p_workspace_id
    and c.strike_id = p_strike_id;

  -- Recheck the live role after reading the projection.
  if auth.uid() is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  return jsonb_build_object('status', 'ok', 'corrections', history);
end
$$;
alter function public.get_workforce_strike_correction_history(uuid, uuid)
  owner to postgres;
revoke all on function public.get_workforce_strike_correction_history(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_workforce_strike_correction_history(uuid, uuid)
  to authenticated;
