-- F23 (spec 023) US2: the measurement read surface returns the trainer-authored F15
-- question text. F15 definitions carry it as `title` (builder and starter content) or
-- `label`; the F15 client reader prefers `title`, so this reader does the same.
-- Check-in rows use the question from their own assignment snapshot (FR-014: the
-- original mapping is preserved). Manual rows have no snapshot, so they use the same
-- question in the workspace's current weekly check-in form, the source that
-- record_progress_measurement validated them against.
-- Same signature, walls, audit and row shape as 20261118200300; the spec 024 readers
-- are untouched.

create or replace function public.list_progress_measurements(p_workspace_id uuid, p_client_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_rows jsonb; v_current jsonb;
begin
  if auth.uid() is null or p_workspace_id is null or p_client_id is null then
    return '{"status":"not_found"}'::jsonb;
  end if;
  if not (app_private.has_workspace_access(p_workspace_id, 'coaching_work')
      and exists (select 1 from public.clients c where c.workspace_id = p_workspace_id and c.id = p_client_id))
    and not app_private.f23_client_progress_visible(p_workspace_id, p_client_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  select v.definition into v_current
  from app_private.form_assignment_policies p
  join public.form_versions v on v.workspace_id = p.workspace_id and v.form_id = p.form_id
    and v.version_number = p.version_number and v.status = 'published'
  where p.workspace_id = p_workspace_id and p.trigger_kind = 'weekly_checkin';
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'measurement_type', m.measurement_type, 'value', m.value,
      'unit_en', m.unit_en, 'unit_ar', m.unit_ar, 'recorded_on', m.recorded_on,
      'source_kind', m.source_kind, 'updated_at', m.updated_at,
      'label', (select case when jsonb_typeof(q->'title') = 'object' then q->'title' else q->'label' end
        from jsonb_array_elements(
          case when jsonb_typeof(d.definition->'questions') = 'array' then d.definition->'questions' else '[]'::jsonb end) q
        where q->>'id' = m.measurement_type limit 1))
      order by m.recorded_on desc, m.measurement_type, m.id), '[]'::jsonb)
    into v_rows
  from public.progress_measurements m
  left join public.form_assignments a on a.workspace_id = m.workspace_id and a.id = m.source_assignment_id
  cross join lateral (select case when m.source_assignment_id is null then v_current else a.version_snapshot end
    as definition) d
  where m.workspace_id = p_workspace_id and m.client_id = p_client_id;
  insert into public.audit_events(actor_user_id, action, target_table, target_id, workspace_id, details)
  values (auth.uid(), 'progress.measurements_read', 'clients', p_client_id, p_workspace_id, '{}'::jsonb);
  return jsonb_build_object('status', 'ok', 'measurements', v_rows);
end $$;

alter function public.list_progress_measurements(uuid, uuid) owner to postgres;
revoke all on function public.list_progress_measurements(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_progress_measurements(uuid, uuid) to authenticated;
