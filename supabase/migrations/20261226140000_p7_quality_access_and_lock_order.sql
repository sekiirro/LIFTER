-- S72-R10 S4 forward fix: quality reads use the PO-only string projection,
-- and quality writes take F11 staff locks before the shared P7 period fence.

revoke all on public.p7_monthly_quality_revisions,
  public.p7_trainer_quality_settings
  from public, anon, authenticated, service_role;

alter view public.p7_monthly_quality_effective set (security_invoker = false);
create or replace view public.p7_monthly_quality_effective as
select distinct on (r.workspace_id, r.trainer_id, r.month, r.category)
  r.id,
  r.workspace_id,
  r.trainer_id,
  r.month,
  r.category,
  r.revision,
  r.positive_count,
  r.negative_count,
  to_char(r.positive_weight, 'FM999999990.00') as positive_weight,
  to_char(r.negative_weight, 'FM999999990.00') as negative_weight,
  to_char(r.net_points, 'FM999999990.00') as net_points,
  r.idempotency_key,
  r.created_at,
  r.created_by
from public.p7_monthly_quality_revisions r
where app_private.is_platform_owner()
  and app_private.has_workspace_access(r.workspace_id)
order by r.workspace_id, r.trainer_id, r.month, r.category, r.revision desc;
alter view public.p7_monthly_quality_effective owner to postgres;
grant select on public.p7_monthly_quality_effective to authenticated;

-- Preserve the reviewed function body while moving only the lock sequence.
-- Fail closed if the installed definition differs from the reviewed baseline.
do $migration$
declare
  v_definition text;
  v_before constant text := E'  perform app_private.p7_lock_period(p_workspace_id, v_month_date);\n  perform app_private.p7_require_quality_actor(p_workspace_id, actor, false);\n  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, false);\n  perform app_private.p7_require_quality_actor(p_workspace_id, actor, true);\n  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, true);';
  v_after constant text := E'  perform app_private.p7_require_quality_actor(p_workspace_id, actor, true);\n  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, true);\n  perform app_private.p7_lock_period(p_workspace_id, v_month_date);\n  perform app_private.p7_require_quality_actor(p_workspace_id, actor, false);\n  perform app_private.p7_require_quality_trainer(p_workspace_id, p_trainer_id, false);';
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_monthly_quality(uuid,uuid,text,text,integer,integer,numeric,numeric,text,integer)'::regprocedure
  ) into v_definition;
  if pg_catalog.strpos(v_definition, v_before) = 0 then
    raise exception 'S4 expected quality lock sequence not found';
  end if;
  v_definition := pg_catalog.replace(v_definition, v_before, v_after);
  execute v_definition;
end;
$migration$;

notify pgrst, 'reload schema';
