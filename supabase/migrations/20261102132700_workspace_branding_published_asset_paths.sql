-- T049: published asset rows bind the validator's immutable workspace-prefixed object path.
alter table app_private.branding_published_assets
  drop constraint branding_published_assets_check;
alter table app_private.branding_published_assets
  add constraint branding_published_assets_object_path check (
    object_name ~ ('^'||workspace_id::text||'/[0-9a-f]{64}[.](png|webp)$')
    or object_name ~ ('^'||workspace_id::text||'/validated/'||slot||'/[0-9a-f]{64}[.](png|webp)$')
  );
