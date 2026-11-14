-- Keep the private Override Activate receipt table hardened even for its owner.
alter table app_private.f19_override_operations enable row level security;
alter table app_private.f19_override_operations force row level security;
revoke all on app_private.f19_override_operations from public, anon, authenticated, service_role;
