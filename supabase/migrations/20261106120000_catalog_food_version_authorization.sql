-- App-wall preflight for food versioning. Returns no ownership metadata and
-- deliberately makes missing and foreign identities indistinguishable.
create function public.catalog_can_version_food(p_food_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_food_id is not null
    and auth.uid() is not null
    and (
      app_private.is_platform_owner()
      or (
        app_private.role_has_capability(app_private.current_staff_role(), 'coaching_work')
        and exists (
          select 1 from public.workspace_memberships m
          where m.user_id = auth.uid() and m.revoked_at is null
        )
        and exists (
          select 1 from public.foods f
          where f.id = p_food_id and f.created_by = auth.uid()
        )
      )
    );
$$;
alter function public.catalog_can_version_food(uuid) owner to postgres;
revoke all on function public.catalog_can_version_food(uuid) from public, anon, service_role;
grant execute on function public.catalog_can_version_food(uuid) to authenticated;
